-- Integration-only. Not applied to the old OnSpace backend.
-- All sources reserve before provider dispatch, not after a player answers.
create table public.play_config (
  singleton boolean primary key default true check (singleton),
  free_limit integer not null default 15 check (free_limit between 0 and 100),
  timezone_cooldown interval not null default interval '7 days',
  reward_value integer not null default 1 check (reward_value between 1 and 10),
  reward_cooldown interval not null default interval '30 seconds',
  reward_safety_ceiling integer not null default 1000 check (reward_safety_ceiling > 0)
);
insert into public.play_config(singleton) values(true);
create table public.play_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reset_at timestamptz not null,
  window_date date not null,
  timezone_changed_at timestamptz,
  pending_timezone text,
  pending_at timestamptz,
  paid_until timestamptz
);
create table public.reward_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  transaction_id text not null,
  credits integer not null check (credits > 0),
  consumed integer not null default 0 check (consumed >= 0 and consumed <= credits),
  verified_at timestamptz not null default now(),
  unique(provider,transaction_id)
);
create table public.play_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  category text not null,
  local_date date not null,
  source text not null check(source in ('free','bonus','paid')),
  reward_id uuid references public.reward_credits(id) on delete cascade,
  status text not null default 'reserved' check(status in ('reserved','ready','released')),
  lease_until timestamptz not null default now()+interval '2 minutes',
  question_id uuid,
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index play_reservations_usage on public.play_reservations(user_id,local_date,status);
alter table public.question_sessions
  add column reservation_id uuid unique references public.play_reservations(id) on delete cascade,
  add column hint text not null default '',
  add column reference_answer numeric,
  add column answer_unit text not null default '',
  add column reference_steps text[] not null default '{}',
  add column rubric_version text;

-- Private lock/rollover helper. The same active timezone drives allowance and streaks.
create function public.refresh_play_account(p_uid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_zone text; v_account public.play_accounts%rowtype;
begin
  select timezone into strict v_zone from public.user_profiles where id=p_uid for update;
  insert into public.play_accounts(user_id,reset_at,window_date)
    values(p_uid, (((now() at time zone v_zone)::date+1)::timestamp at time zone v_zone),(now() at time zone v_zone)::date)
    on conflict do nothing;
  select * into v_account from public.play_accounts where user_id=p_uid;
  if v_account.pending_at <= now() then
    v_zone:=v_account.pending_timezone;
    update public.user_profiles set timezone=v_zone where id=p_uid;
    update public.play_accounts set pending_timezone=null,pending_at=null where user_id=p_uid;
  end if;
  if v_account.reset_at <= now() then
    update public.play_accounts set reset_at=(((now() at time zone v_zone)::date+1)::timestamp at time zone v_zone),
      window_date=(now() at time zone v_zone)::date
      where user_id=p_uid;
  end if;
  -- A failed/crashed generation gives its reservation back, without granting a second delivered question.
  update public.reward_credits r set consumed=r.consumed-x.n
    from (select reward_id,count(*)::integer n from public.play_reservations
      where user_id=p_uid and status='reserved' and lease_until<now() and reward_id is not null
      group by reward_id) x where r.id=x.reward_id;
  update public.play_reservations set status='released'
    where user_id=p_uid and status='reserved' and lease_until<now();
end $$;

create or replace function public.set_my_timezone(p_timezone text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_zone text; v_next timestamptz; v_a public.play_accounts%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone)
    then raise exception 'Unknown IANA timezone' using errcode='22023'; end if;
  perform public.refresh_play_account(v_uid);
  select timezone into v_zone from public.user_profiles where id=v_uid;
  if v_zone=p_timezone then return; end if;
  select * into v_a from public.play_accounts where user_id=v_uid;
  if not exists(select 1 from public.play_reservations where user_id=v_uid)
     and not exists(select 1 from public.score_events where user_id=v_uid) then
    update public.user_profiles set timezone=p_timezone where id=v_uid;
    update public.play_accounts set reset_at=(((now() at time zone p_timezone)::date+1)::timestamp at time zone p_timezone),
      window_date=(now() at time zone p_timezone)::date
      where user_id=v_uid;
    return;
  end if;
  if v_a.timezone_changed_at > now()-(select timezone_cooldown from public.play_config)
    then raise exception 'Timezone change cooldown' using errcode='22023'; end if;
  v_next:=(((now() at time zone p_timezone)::date+1)::timestamp at time zone p_timezone);
  -- Extend, never shorten, the existing allowance window on travel. Revisited dates keep their usage.
  while v_next<v_a.reset_at or v_next<now()+interval '20 hours' loop
    v_next:=(((v_next at time zone p_timezone)::date+1)::timestamp at time zone p_timezone);
  end loop;
  update public.play_accounts set pending_timezone=p_timezone,pending_at=v_next,
    reset_at=v_next,timezone_changed_at=now() where user_id=v_uid;
end $$;

create function public.get_my_play_state() returns table(
  questions_today integer,free_limit integer,bonus_remaining integer,paid boolean,can_play boolean,
  reset_at timestamptz,server_now timestamptz,local_date date,timezone text,rewards_available boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_zone text; v_date date; v_used integer; v_total integer;
  v_bonus integer; v_limit integer; v_paid boolean; v_reset timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.refresh_play_account(v_uid);
  select p.timezone into v_zone from public.user_profiles p where p.id=v_uid;
  -- During a queued timezone change, keep the same logical day until the protected reset.
  select a.window_date into v_date from public.play_accounts a where a.user_id=v_uid;
  select count(*) filter(where r.source='free')::integer,count(*)::integer into v_used,v_total
    from public.play_reservations r where r.user_id=v_uid and r.local_date=v_date and r.status<>'released';
  select coalesce(sum(r.credits-r.consumed),0)::integer into v_bonus from public.reward_credits r where r.user_id=v_uid;
  select c.free_limit into v_limit from public.play_config c;
  select coalesce(a.paid_until>now(),false),a.reset_at into v_paid,v_reset from public.play_accounts a where a.user_id=v_uid;
  return query select v_total,v_limit,v_bonus,v_paid,(v_paid or v_used<v_limit or v_bonus>0),
    v_reset,now(),v_date,v_zone,false; -- No offer until signed SSV adapter is enabled.
end $$;

-- Only the authenticated Edge gateway may supply a trusted entitlement result.
create function public.set_verified_purchase(p_uid uuid,p_active boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.refresh_play_account(p_uid);
  update public.play_accounts set paid_until=case when p_active then now()+interval '5 minutes' else null end where user_id=p_uid;
end $$;

create function public.reserve_play(p_uid uuid,p_request uuid,p_category text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state record; v_old public.play_reservations%rowtype; v_source text; v_reward uuid; v_id uuid;
begin
  if p_request is null or p_category not in ('my_country','world','science','history','food_drink','sports','art')
    then raise exception 'Invalid reservation' using errcode='22023'; end if;
  perform public.refresh_play_account(p_uid);
  select * into v_old from public.play_reservations where user_id=p_uid and request_id=p_request;
  if found then
    if v_old.status='ready' then
      return (select jsonb_build_object('replay',true,'questionId',q.id,'type',q.question_type,
        'question',q.question,'hint',q.hint,'unit',q.answer_unit,'expiresAt',q.expires_at)
        from public.question_sessions q where q.id=v_old.question_id);
    end if;
    raise exception 'Reservation already used or in progress' using errcode='55P03';
  end if;
  -- service_role has no user JWT; bind the private read to the already validated UID.
  perform set_config('request.jwt.claim.sub',p_uid::text,true);
  select * into v_state from public.get_my_play_state();
  if not v_state.paid and p_category not in ('my_country','world')
    then raise exception 'Premium category locked' using errcode='42501'; end if;
  if not v_state.can_play then raise exception 'Daily allowance exhausted' using errcode='P0001'; end if;
  if v_state.paid then v_source:='paid';
  elsif (select count(*) from public.play_reservations where user_id=p_uid and local_date=v_state.local_date
      and source='free' and status<>'released')<v_state.free_limit then v_source:='free';
  else
    v_source:='bonus';
    select id into strict v_reward from public.reward_credits where user_id=p_uid and consumed<credits
      order by verified_at,id limit 1 for update;
    update public.reward_credits set consumed=consumed+1 where id=v_reward;
  end if;
  insert into public.play_reservations(user_id,request_id,category,local_date,source,reward_id)
    values(p_uid,p_request,p_category,v_state.local_date,v_source,v_reward) returning id into v_id;
  return jsonb_build_object('reservationId',v_id,'replay',false);
end $$;

create function public.release_play(p_uid uuid,p_reservation uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_reward uuid;
begin
  perform 1 from public.user_profiles where id=p_uid for update;
  update public.play_reservations set status='released'
    where id=p_reservation and user_id=p_uid and status='reserved' returning reward_id into v_reward;
  if v_reward is not null then update public.reward_credits set consumed=consumed-1 where id=v_reward; end if;
end $$;

create function public.create_reserved_question(p_uid uuid,p_reservation uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_r public.play_reservations%rowtype; v_id uuid;
begin
  perform 1 from public.user_profiles where id=p_uid for update;
  select * into v_r from public.play_reservations where id=p_reservation and user_id=p_uid for update;
  if not found or v_r.status<>'reserved' or v_r.lease_until<now()
    then raise exception 'Invalid/expired reservation' using errcode='42501'; end if;
  if p_payload->>'type'='estimation' and ((p_payload->>'referenceAnswer') is null or (p_payload->>'referenceAnswer')::numeric<=0
      or trim(coalesce(p_payload->>'unit',''))='' or coalesce(p_payload->>'rubricVersion','')<>'relative-v1'
      or coalesce(jsonb_array_length(p_payload->'steps'),0)<2)
    then raise exception 'Missing frozen estimation reference' using errcode='22023'; end if;
  v_id:=public.create_question_session(p_uid,v_r.category,p_payload->>'type',p_payload->>'question',
    coalesce(p_payload->>'correctAnswer',''),array(select jsonb_array_elements_text(p_payload->'acceptableAnswers')),
    now()+interval '15 minutes');
  update public.question_sessions set reservation_id=p_reservation,hint=coalesce(p_payload->>'hint',''),
    reference_answer=(p_payload->>'referenceAnswer')::numeric,answer_unit=coalesce(p_payload->>'unit',''),
    reference_steps=array(select jsonb_array_elements_text(p_payload->'steps')),rubric_version='relative-v1' where id=v_id;
  update public.play_reservations set status='ready',question_id=v_id where id=p_reservation;
  return v_id;
end $$;

create function public.get_frozen_reference(p_uid uuid,p_session uuid,p_token uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('referenceAnswer',reference_answer,'unit',answer_unit,'steps',reference_steps,'rubricVersion',rubric_version)
    from public.question_sessions where id=p_session and user_id=p_uid and evaluation_token=p_token
      and reservation_id is not null and answered_at is null;
$$;

alter table public.play_config enable row level security;
alter table public.play_config force row level security;
alter table public.play_accounts enable row level security;
alter table public.play_accounts force row level security;
alter table public.reward_credits enable row level security;
alter table public.reward_credits force row level security;
alter table public.play_reservations enable row level security;
alter table public.play_reservations force row level security;
revoke all on public.play_config,public.play_accounts,public.reward_credits,public.play_reservations from public,anon,authenticated,service_role;
revoke all on function public.refresh_play_account(uuid),public.get_my_play_state(),public.reserve_play(uuid,uuid,text),
  public.release_play(uuid,uuid),public.create_reserved_question(uuid,uuid,jsonb),public.get_frozen_reference(uuid,uuid,uuid),
  public.set_verified_purchase(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_my_play_state() to authenticated;
grant execute on function public.reserve_play(uuid,uuid,text),public.release_play(uuid,uuid),
  public.create_reserved_question(uuid,uuid,jsonb),public.get_frozen_reference(uuid,uuid,uuid),public.set_verified_purchase(uuid,boolean) to service_role;
-- Close the older, unreserved creation route. The definer above still calls it internally.
revoke execute on function public.create_question_session(uuid,text,text,text,text,text[],timestamptz) from service_role;

create or replace function public.account_data_exists(p_user_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.user_profiles where id=p_user_id)
    or exists(select 1 from public.user_stats where user_id=p_user_id)
    or exists(select 1 from public.score_events where user_id=p_user_id)
    or exists(select 1 from public.user_badges where user_id=p_user_id)
    or exists(select 1 from public.category_scores where user_id=p_user_id)
    or exists(select 1 from public.question_sessions where user_id=p_user_id)
    or exists(select 1 from public.ai_request_events where user_id=p_user_id)
    or exists(select 1 from public.play_accounts where user_id=p_user_id)
    or exists(select 1 from public.play_reservations where user_id=p_user_id)
    or exists(select 1 from public.reward_credits where user_id=p_user_id);
$$;

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

  perform public.refresh_play_account(p_user_id);
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

  select window_date into v_local_date from public.play_accounts where user_id=p_user_id;
  if v_session.reservation_id is null then raise exception 'Unreserved question' using errcode='42501'; end if;
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
