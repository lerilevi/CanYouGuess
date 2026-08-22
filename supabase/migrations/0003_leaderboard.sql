-- 0003_leaderboard.sql
-- Server-side leaderboard + ranking.
--
-- Replaces leaderboardService.getUserRank(), which fetched every row in
-- leaderboard_scores and did findIndex() in JS. Ranking now happens in
-- Postgres and the client receives one row.
--
-- These are SECURITY DEFINER on purpose: the leaderboard is the only place
-- one user's username/country/score is visible to another. RLS keeps the
-- underlying tables private; this function is the single, audited hole.
-- It exposes exactly username, country and a score — never email or user_id
-- of other players.

-- Window semantics:
--   'daily'    → events since 00:00 UTC today (calendar day)
--   'weekly'   → rolling last 7 days, i.e. now() - interval '7 days'
--                (NOT a copy of all-time, which was the old bug)
--   'all_time' → user_stats.total_score
create or replace function public.leaderboard_window_start(p_window text)
returns timestamptz
language sql
immutable
as $$
  select case p_window
    when 'daily'  then date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    when 'weekly' then now() - interval '7 days'
    else null  -- all_time
  end;
$$;

create or replace function public.get_leaderboard(
  p_window  text default 'all_time',
  p_country text default null,   -- null = global, 'IL' = local scope
  p_limit   integer default 10,
  p_offset  integer default 0
)
returns table (
  rank     bigint,
  user_id  uuid,
  username text,
  country  text,
  score    integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with window_start as (
    select public.leaderboard_window_start(p_window) as ts
  ),
  scored as (
    -- All-time reads the denormalised total; windowed variants aggregate events.
    select p.id as uid, p.username::text as uname, p.country as ctry,
           case
             when (select ts from window_start) is null
               then coalesce(s.total_score, 0)
             else coalesce((
               select sum(e.score)::integer
                 from public.score_events e
                where e.user_id = p.id
                  and e.created_at >= (select ts from window_start)
             ), 0)
           end as sc
      from public.user_profiles p
      left join public.user_stats s on s.user_id = p.id
     where p_country is null or p.country = p_country
  )
  select rank() over (order by sc desc, uname asc) as rank,
         uid, uname, ctry, sc
    from scored
   where sc > 0
   order by sc desc, uname asc
   limit greatest(least(coalesce(p_limit, 10), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Rank of one user within the same ordering. Returns no row when the user has
-- no score in the window (client should render "unranked", not rank 0).
create or replace function public.get_user_rank(
  p_user_id uuid default null,   -- defaults to the caller
  p_window  text default 'all_time',
  p_country text default null
)
returns table (rank bigint, score integer, total_ranked bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select coalesce(p_user_id, auth.uid()) as uid
  ),
  window_start as (
    select public.leaderboard_window_start(p_window) as ts
  ),
  scored as (
    select p.id as uid, p.username::text as uname,
           case
             when (select ts from window_start) is null
               then coalesce(s.total_score, 0)
             else coalesce((
               select sum(e.score)::integer
                 from public.score_events e
                where e.user_id = p.id
                  and e.created_at >= (select ts from window_start)
             ), 0)
           end as sc
      from public.user_profiles p
      left join public.user_stats s on s.user_id = p.id
     where p_country is null or p.country = p_country
  ),
  ranked as (
    select uid, sc, rank() over (order by sc desc, uname asc) as rnk
      from scored
     where sc > 0
  )
  select r.rnk, r.sc, (select count(*) from ranked)
    from ranked r
   where r.uid = (select uid from target);
$$;

comment on function public.get_leaderboard is
  'SECURITY DEFINER: the only path by which one user sees another''s username/country/score.';
