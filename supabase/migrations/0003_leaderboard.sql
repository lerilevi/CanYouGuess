-- 0003_leaderboard.sql
-- Server-side leaderboard + ranking, on per-user local days.
--
-- Replaces leaderboardService.getUserRank(), which fetched every row in
-- leaderboard_scores and did findIndex() in JS. Ranking now happens in
-- Postgres and the client receives one row.
--
-- These are SECURITY DEFINER on purpose: the leaderboard is the only place
-- one user's username/country/score is visible to another. RLS keeps the
-- underlying tables private; this function is the single, audited hole.
-- It exposes exactly username, country and a score — never email, and never
-- another player's raw event history.
--
-- Window semantics — each row is scored against ITS OWN user's local calendar,
-- so "today" means each player's today:
--   'daily'    → score_events where local_date = that user's current local date
--   'weekly'   → the last 7 local days inclusive (local_date >= local today - 6)
--   'all_time' → user_stats.total_score
--
-- This means the daily board compares every player's own-day total. Two players
-- in different timezones are each measured against their own midnight, which is
-- the intent: nobody gets a short first day because a server constant says so.

-- Per-user local "today", evaluated from the profile's stored IANA timezone.
create or replace function public.user_local_date(p_timezone text)
returns date
language sql
stable
as $$
  select (now() at time zone coalesce(p_timezone, 'UTC'))::date;
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
  with scored as (
    select
      p.id                as uid,
      p.username::text    as uname,
      p.country           as ctry,
      case
        when p_window = 'all_time' then coalesce(s.total_score, 0)
        else coalesce((
          select sum(e.score)::integer
            from public.score_events e
           where e.user_id = p.id
             and e.local_date >= case p_window
                   when 'daily'  then public.user_local_date(p.timezone)
                   when 'weekly' then public.user_local_date(p.timezone) - 6
                 end
             and e.local_date <= public.user_local_date(p.timezone)
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
-- no score in the window (the client must render "unranked", never rank 0).
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
  scored as (
    select
      p.id             as uid,
      p.username::text as uname,
      case
        when p_window = 'all_time' then coalesce(s.total_score, 0)
        else coalesce((
          select sum(e.score)::integer
            from public.score_events e
           where e.user_id = p.id
             and e.local_date >= case p_window
                   when 'daily'  then public.user_local_date(p.timezone)
                   when 'weekly' then public.user_local_date(p.timezone) - 6
                 end
             and e.local_date <= public.user_local_date(p.timezone)
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
  'SECURITY DEFINER: the only path by which one user sees another''s username/country/score. Windows are evaluated per-user in that user''s own timezone.';
