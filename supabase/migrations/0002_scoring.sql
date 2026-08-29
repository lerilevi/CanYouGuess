-- 0002_scoring.sql
-- Atomic score submission + derived aggregates, on per-user local days.
--
-- Replaces the client-side sequence in profileService.updateUserStats(), which
-- did: read stats → compute → update stats → upsert leaderboard → update
-- category_scores. Five round-trips, no transaction, and a lost-update race if
-- two answers landed close together. This is one call, one transaction.
--
-- Day boundaries are each user's own local midnight, not a server constant.
-- Finalization derives the local date from the server-validated profile
-- timezone; score_events stores it and every window keys off that value.

-- ─── Timezone reporting ──────────────────────────────────────────────────────
-- Called at launch alongside country detection. Validated against the server's
-- own zone table so a malformed value can never break the leaderboard queries
-- that evaluate `now() at time zone p.timezone`.
create or replace function public.set_my_timezone(p_timezone text)
returns void
language plpgsql
volatile
security definer
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

-- ─── Gemini request reservations (service-role only; grants in 0005) ─────────
-- The Edge Function calls this BEFORE each paid upstream request. Locking the
-- profile row serializes concurrent requests for one user, so two calls cannot
-- both observe the same remaining allowance and race through it.
create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_action  text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_minute_limit integer;
  v_day_limit    integer;
begin
  if p_user_id is null or p_action not in ('generate', 'evaluate') then
    raise exception 'Invalid AI request reservation' using errcode = '22023';
  end if;

  perform 1
    from public.user_profiles
   where id = p_user_id
     for update;
  if not found then
    raise exception 'Unknown user' using errcode = '23503';
  end if;

  -- Opportunistic bounded retention keeps abandoned sessions and request
  -- ledgers from growing forever without making a cron extension mandatory.
  delete from public.ai_request_events
   where id in (
     select id from public.ai_request_events
      where created_at < now() - interval '25 hours'
      order by created_at
      limit 500
   );
  delete from public.question_sessions
   where id in (
     select id from public.question_sessions
      where answered_at is null
        and expires_at < now() - interval '1 day'
      order by expires_at
      limit 100
   );
  delete from public.question_sessions
   where id in (
     select id from public.question_sessions
      where answered_at < now() - interval '7 days'
      order by answered_at
      limit 100
   );

  -- Abuse ceilings, not gameplay entitlements. They are intentionally high
  -- enough for a legitimate paid player while still bounding a stolen token.
  if p_action = 'generate' then
    v_minute_limit := 12;
    v_day_limit    := 300;
  else
    v_minute_limit := 24;
    v_day_limit    := 600;
  end if;

  if (select count(*) from public.ai_request_events
       where user_id = p_user_id
         and action = p_action
         and created_at >= now() - interval '1 minute') >= v_minute_limit then
    raise exception 'AI rate limit exceeded; retry shortly' using errcode = 'P0001';
  end if;

  if (select count(*) from public.ai_request_events
       where user_id = p_user_id
         and action = p_action
         and created_at >= now() - interval '24 hours') >= v_day_limit then
    raise exception 'Daily AI safety limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.ai_request_events (user_id, action)
  values (p_user_id, p_action);
end;
$$;

-- Stores the answer server-side after Gemini generates a question. The client
-- receives only this id plus the public question fields.
create or replace function public.create_question_session(
  p_user_id        uuid,
  p_category       text,
  p_question_type  text,
  p_question       text,
  p_correct_answer text,
  p_acceptable_answers text[],
  p_expires_at     timestamptz default (now() + interval '15 minutes')
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22023';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 minutes' then
    raise exception 'Question expiry is outside the allowed window' using errcode = '22023';
  end if;

  if p_question_type = 'trivia' and (
    p_acceptable_answers is null
    or cardinality(p_acceptable_answers) not between 1 and 6
    or not (trim(coalesce(p_correct_answer, '')) = any(p_acceptable_answers))
    or exists (
      select 1
      from unnest(p_acceptable_answers) as answers(answer)
       where answer is null or char_length(trim(answer)) not between 1 and 200
    )
  ) then
    raise exception 'Trivia answers are missing or invalid' using errcode = '22023';
  end if;

  delete from public.question_sessions
   where user_id = p_user_id
     and answered_at is null
     and expires_at < now() - interval '1 day';

  insert into public.question_sessions (
    user_id, category, question_type, question, correct_answer,
    acceptable_answers, expires_at
  ) values (
    p_user_id,
    p_category,
    p_question_type,
    trim(p_question),
    trim(coalesce(p_correct_answer, '')),
    coalesce(p_acceptable_answers, array[]::text[]),
    p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Atomically claims an unanswered session before any paid evaluation call.
-- A short lease prevents concurrent retries from spending twice; a crashed
-- Edge invocation becomes retryable after two minutes (comfortably beyond the
-- maximum configured Gemini timeout).
create or replace function public.claim_question_session(
  p_user_id       uuid,
  p_session_id    uuid,
  p_question_type text
)
returns table (
  id                 uuid,
  category           text,
  question_type      text,
  question           text,
  correct_answer     text,
  acceptable_answers text[],
  expires_at         timestamptz,
  evaluation_token   uuid
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.question_sessions%rowtype;
  v_token   uuid := gen_random_uuid();
begin
  if p_user_id is null or p_session_id is null
     or p_question_type not in ('trivia', 'estimation') then
    raise exception 'Invalid question claim' using errcode = '22023';
  end if;

  select *
    into v_session
    from public.question_sessions qs
   where qs.id = p_session_id
     and qs.user_id = p_user_id
   for update;

  if not found then
    raise exception 'Question session not found' using errcode = 'P0002';
  end if;
  if v_session.answered_at is not null then
    raise exception 'Question session was already finalized' using errcode = '23505';
  end if;
  if v_session.expires_at < now() then
    raise exception 'Question session expired' using errcode = '22023';
  end if;
  if v_session.question_type <> p_question_type then
    raise exception 'Evaluation type does not match the question' using errcode = '22023';
  end if;
  if v_session.evaluation_started_at is not null
     and v_session.evaluation_started_at >= now() - interval '2 minutes' then
    raise exception 'Question evaluation is already in progress' using errcode = '55P03';
  end if;

  update public.question_sessions qs
     set evaluation_token = v_token,
         evaluation_started_at = now()
   where qs.id = p_session_id;

  return query
    select v_session.id,
           v_session.category,
           v_session.question_type,
           v_session.question,
           v_session.correct_answer,
           v_session.acceptable_answers,
           v_session.expires_at,
           v_token;
end;
$$;

-- Releases a still-current lease after validation or provider failure. A stale
-- invocation cannot release a newer claimant's token.
create or replace function public.release_question_session_claim(
  p_user_id          uuid,
  p_session_id       uuid,
  p_evaluation_token uuid
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.question_sessions
     set evaluation_token = null,
         evaluation_started_at = null
   where id = p_session_id
     and user_id = p_user_id
     and answered_at is null
     and evaluation_token = p_evaluation_token;
$$;

-- Used only by delete-account after Auth removes the user. It verifies every
-- application cascade without granting the service role direct table access.
create or replace function public.account_data_exists(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (select 1 from public.user_profiles where id = p_user_id)
    or exists (select 1 from public.user_stats where user_id = p_user_id)
    or exists (select 1 from public.score_events where user_id = p_user_id)
    or exists (select 1 from public.user_badges where user_id = p_user_id)
    or exists (select 1 from public.category_scores where user_id = p_user_id)
    or exists (select 1 from public.question_sessions where user_id = p_user_id)
    or exists (select 1 from public.ai_request_events where user_id = p_user_id);
$$;

-- Finalizes one server-held question exactly once. Score, category, question
-- type and local day no longer come from the public client. The score event,
-- aggregates, session state and verifiable badges commit atomically.
create or replace function public.finalize_question_session(
  p_user_id           uuid,
  p_session_id        uuid,
  p_evaluation_token  uuid,
  p_score             integer,
  p_deviation_percent numeric default null
)
returns table (
  total_score     integer,
  total_questions integer,
  current_streak  integer,
  longest_streak  integer,
  questions_today integer,
  local_date      date,
  new_badges      text[]
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_session       public.question_sessions%rowtype;
  v_local_date    date;
  v_new_badges    text[] := array[]::text[];
  v_questions     integer;
  v_streak        integer;
  v_category_uses integer;
begin
  if p_user_id is null or p_session_id is null or p_evaluation_token is null
     or p_score is null or p_score not between 0 and 100 then
    raise exception 'Invalid score finalization request' using errcode = '22023';
  end if;

  select *
    into v_session
    from public.question_sessions
   where id = p_session_id
     and user_id = p_user_id
     for update;

  if not found then
    raise exception 'Question session not found' using errcode = 'P0002';
  end if;
  if v_session.answered_at is not null then
    raise exception 'Question session was already finalized' using errcode = '23505';
  end if;
  if v_session.expires_at < now() then
    raise exception 'Question session expired' using errcode = '22023';
  end if;
  if v_session.evaluation_token is distinct from p_evaluation_token then
    raise exception 'Question evaluation lease is invalid' using errcode = '42501';
  end if;
  if v_session.question_type = 'estimation'
     and (p_deviation_percent is null or p_deviation_percent < 0) then
    raise exception 'A valid deviation is required for estimation scoring' using errcode = '22023';
  end if;

  select (now() at time zone p.timezone)::date
    into v_local_date
    from public.user_profiles p
   where p.id = p_user_id;
  if v_local_date is null then
    raise exception 'User profile is missing' using errcode = '23503';
  end if;

  update public.question_sessions
     set answered_at       = now(),
         score             = p_score,
         deviation_percent = case
           when v_session.question_type = 'estimation' then p_deviation_percent
           else null
         end,
         correct_answer     = '',
         acceptable_answers = array[]::text[],
         evaluation_token   = null,
         evaluation_started_at = null
   where id = p_session_id;

  insert into public.score_events (user_id, category, question_type, score, local_date)
  values (p_user_id, v_session.category, v_session.question_type, p_score, v_local_date);

  select s.total_questions, s.current_streak
    into v_questions, v_streak
    from public.user_stats s
   where s.user_id = p_user_id;

  if v_questions = 1 then
    insert into public.user_badges (user_id, badge_id)
    values (p_user_id, 'first_guess')
    on conflict do nothing;
    if found then v_new_badges := array_append(v_new_badges, 'first_guess'); end if;
  end if;

  if v_session.question_type = 'estimation' and p_deviation_percent < 5 then
    insert into public.user_badges (user_id, badge_id)
    values (p_user_id, 'sniper')
    on conflict do nothing;
    if found then v_new_badges := array_append(v_new_badges, 'sniper'); end if;
  end if;

  if v_streak >= 7 then
    insert into public.user_badges (user_id, badge_id)
    values (p_user_id, 'marathoner')
    on conflict do nothing;
    if found then v_new_badges := array_append(v_new_badges, 'marathoner'); end if;
  end if;

  select c.questions_answered
    into v_category_uses
    from public.category_scores c
   where c.user_id = p_user_id
     and c.category = v_session.category;
  if v_category_uses >= 50 then
    insert into public.user_badges (user_id, badge_id)
    values (p_user_id, 'category_master')
    on conflict do nothing;
    if found then v_new_badges := array_append(v_new_badges, 'category_master'); end if;
  end if;

  return query
    select s.total_score,
           s.total_questions,
           s.current_streak,
           s.longest_streak,
           (select count(*)::integer
              from public.score_events e
             where e.user_id = p_user_id
               and e.local_date = v_local_date),
           v_local_date,
           v_new_badges
      from public.user_stats s
     where s.user_id = p_user_id;
end;
$$;
