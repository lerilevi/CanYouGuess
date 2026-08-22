-- 0002_scoring.sql
-- Atomic score submission + derived aggregates.
--
-- Replaces the client-side sequence in profileService.updateUserStats(), which
-- did: read stats → compute → update stats → upsert leaderboard → update
-- category_scores. Five round-trips, no transaction, and a lost-update race if
-- two answers land close together. This is one call, one transaction.

-- ─── Keep user_stats and category_scores in step with score_events ───────────
create or replace function public.apply_score_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last_day date;
  v_today    date := (new.created_at at time zone 'UTC')::date;
  v_streak   integer;
begin
  select (last_played_at at time zone 'UTC')::date, current_streak
    into v_last_day, v_streak
    from public.user_stats
   where user_id = new.user_id
     for update;

  if not found then
    insert into public.user_stats (user_id) values (new.user_id);
    v_last_day := null;
    v_streak   := 0;
  end if;

  -- Streak: same day keeps it, consecutive day increments, any gap resets to 1.
  if v_last_day is null then
    v_streak := 1;
  elsif v_last_day = v_today then
    v_streak := greatest(v_streak, 1);
  elsif v_last_day = v_today - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  update public.user_stats
     set total_score     = total_score + new.score,
         total_questions = total_questions + 1,
         current_streak  = v_streak,
         longest_streak  = greatest(longest_streak, v_streak),
         last_played_at  = new.created_at
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
-- Derived, so there is no reset bookkeeping to get wrong and no way for the
-- counter to drift from reality.
create or replace function public.get_my_daily_usage()
returns table (questions_today integer, day_start timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*)::integer,
    date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  from public.score_events
  where user_id = auth.uid()
    and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
$$;

-- ─── Atomic answer submission ────────────────────────────────────────────────
-- Returns the caller's refreshed stats so the client needs no follow-up read.
create or replace function public.submit_score(
  p_category      text,
  p_score         integer,
  p_question_type text default 'trivia'
)
returns table (
  total_score     integer,
  total_questions integer,
  current_streak  integer,
  longest_streak  integer,
  questions_today integer
)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'submit_score requires an authenticated user'
      using errcode = '42501';
  end if;

  insert into public.score_events (user_id, category, question_type, score)
  values (v_uid, p_category, p_question_type, p_score);

  return query
    select s.total_score,
           s.total_questions,
           s.current_streak,
           s.longest_streak,
           (select count(*)::integer
              from public.score_events e
             where e.user_id = v_uid
               and e.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
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
  v_uid uuid := auth.uid();
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
