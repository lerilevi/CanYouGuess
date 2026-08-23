-- 0002_scoring.sql
-- Atomic score submission + derived aggregates, on per-user local days.
--
-- Replaces the client-side sequence in profileService.updateUserStats(), which
-- did: read stats → compute → update stats → upsert leaderboard → update
-- category_scores. Five round-trips, no transaction, and a lost-update race if
-- two answers landed close together. This is one call, one transaction.
--
-- Day boundaries are each user's own local midnight, not a server constant.
-- The client supplies its local date with every submission; score_events
-- stores it, and every window keys off that stored value.

-- ─── Timezone reporting ──────────────────────────────────────────────────────
-- Called at launch alongside country detection. Validated against the server's
-- own zone table so a malformed value can never break the leaderboard queries
-- that evaluate `now() at time zone p.timezone`.
create or replace function public.set_my_timezone(p_timezone text)
returns void
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'set_my_timezone requires an authenticated user' using errcode = '42501';
  end if;

  if p_timezone is null
     or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown IANA timezone: %', coalesce(p_timezone, '(null)')
      using errcode = '22023';
  end if;

  update public.user_profiles
     set timezone = p_timezone
   where id = v_uid
     and timezone is distinct from p_timezone;
end;
$$;

-- The caller's current local date, per their stored timezone.
create or replace function public.my_local_date()
returns date
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select (now() at time zone coalesce(
           (select p.timezone from public.user_profiles p where p.id = auth.uid()),
           'UTC'))::date;
$$;

-- ─── Keep user_stats and category_scores in step with score_events ───────────
create or replace function public.apply_score_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last_day date;
  v_streak   integer;
begin
  -- Streaks compare local days, so a streak breaks at the player's own
  -- midnight rather than at a server boundary in the middle of their evening.
  select last_played_local_date, current_streak
    into v_last_day, v_streak
    from public.user_stats
   where user_id = new.user_id
     for update;

  if not found then
    insert into public.user_stats (user_id) values (new.user_id);
    v_last_day := null;
    v_streak   := 0;
  end if;

  if v_last_day is null then
    v_streak := 1;
  elsif v_last_day = new.local_date then
    v_streak := greatest(v_streak, 1);
  elsif v_last_day = new.local_date - 1 then
    v_streak := v_streak + 1;
  else
    -- Any gap resets. Also covers a backwards jump (travelling west across the
    -- date line), which must not be credited as a continued streak.
    v_streak := 1;
  end if;

  update public.user_stats
     set total_score            = total_score + new.score,
         total_questions        = total_questions + 1,
         current_streak         = v_streak,
         longest_streak         = greatest(longest_streak, v_streak),
         last_played_at         = new.created_at,
         last_played_local_date = greatest(coalesce(v_last_day, new.local_date), new.local_date)
   where user_id = new.user_id;

  insert into public.category_scores (user_id, category, highest_score, questions_answered)
  values (new.user_id, new.category, new.score, 1)
  on conflict (user_id, category) do update
     set highest_score      = greatest(public.category_scores.highest_score, excluded.highest_score),
         questions_answered = public.category_scores.questions_answered + 1;

  return new;
end;
$$;

create trigger score_events_apply
  after insert on public.score_events
  for each row execute function public.apply_score_event();

-- ─── Daily usage (replaces user_stats.questions_today / last_daily_reset) ────
-- Derived from the user's own local day, so there is no reset bookkeeping to
-- get wrong and the free-question allowance rolls over at their midnight.
create or replace function public.get_my_daily_usage()
returns table (questions_today integer, local_date date, timezone text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    (select count(*)::integer
       from public.score_events e
      where e.user_id = auth.uid()
        and e.local_date = public.my_local_date()),
    public.my_local_date(),
    coalesce((select p.timezone from public.user_profiles p where p.id = auth.uid()), 'UTC');
$$;

-- ─── Atomic answer submission ────────────────────────────────────────────────
-- p_local_date is the client's own calendar date. It is validated, not trusted:
-- no real UTC offset puts a device's date more than one day either side of the
-- server's, so anything outside that is a broken clock or an attempt to
-- backdate onto a past daily leaderboard.
create or replace function public.submit_score(
  p_category          text,
  p_score             integer,
  p_question_type     text default 'trivia',
  p_local_date        date default null,
  p_tz_offset_minutes integer default null
)
returns table (
  total_score     integer,
  total_questions integer,
  current_streak  integer,
  longest_streak  integer,
  questions_today integer,
  local_date      date
)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_local_date date;
begin
  if v_uid is null then
    raise exception 'submit_score requires an authenticated user'
      using errcode = '42501';
  end if;

  -- Fall back to the stored timezone when the client sends nothing, so an
  -- older build still records a sane day.
  v_local_date := coalesce(p_local_date, public.my_local_date());

  if v_local_date not between (current_date - 1) and (current_date + 1) then
    raise exception 'Reported local date % is not plausible against server date %',
      v_local_date, current_date
      using errcode = '22007';
  end if;

  insert into public.score_events (user_id, category, question_type, score, local_date, tz_offset_minutes)
  values (v_uid, p_category, p_question_type, p_score, v_local_date, p_tz_offset_minutes);

  return query
    select s.total_score,
           s.total_questions,
           s.current_streak,
           s.longest_streak,
           (select count(*)::integer
              from public.score_events e
             where e.user_id = v_uid
               and e.local_date = v_local_date),
           v_local_date
      from public.user_stats s
     where s.user_id = v_uid;
end;
$$;

-- ─── Idempotent badge award ──────────────────────────────────────────────────
create or replace function public.award_badge(p_badge_id text)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'award_badge requires an authenticated user' using errcode = '42501';
  end if;

  insert into public.user_badges (user_id, badge_id)
  values (v_uid, p_badge_id)
  on conflict (user_id, badge_id) do nothing;

  get diagnostics v_rows = row_count;
  -- true when this call is what actually awarded the badge
  return v_rows > 0;
end;
$$;
