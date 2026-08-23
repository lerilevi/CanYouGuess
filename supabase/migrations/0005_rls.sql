-- 0005_rls.sql
-- Row Level Security. Every table is deny-by-default; access is granted
-- narrowly and explicitly.
--
-- Threat model: EXPO_PUBLIC_SUPABASE_ANON_KEY ships inside the .ipa and is
-- extractable from any installed copy of the app. Treat the anon key as
-- public knowledge. Everything below assumes an attacker holds it.
--
-- Consequence: `anon` gets NOTHING except the ability to sign up / log in.
-- All data access requires a valid user JWT, and is scoped to that user.
-- Cross-user visibility exists only through the SECURITY DEFINER leaderboard
-- functions in 0003, which expose username + country + score and nothing else.

-- ─── Lock the schema down before opening anything ────────────────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

alter table public.user_profiles   enable row level security;
alter table public.user_stats      enable row level security;
alter table public.score_events    enable row level security;
alter table public.user_badges     enable row level security;
alter table public.category_scores enable row level security;

-- Force RLS for table owners too, so a future SECURITY DEFINER function
-- written without care cannot quietly bypass these policies.
alter table public.user_profiles   force row level security;
alter table public.user_stats      force row level security;
alter table public.score_events    force row level security;
alter table public.user_badges     force row level security;
alter table public.category_scores force row level security;

-- ─── user_profiles ───────────────────────────────────────────────────────────
-- Own row only. Other players' names reach the client via get_leaderboard().
create policy user_profiles_select_own on public.user_profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Username goes through update_my_username() for a proper conflict error, but
-- country is written directly on each launch after IP detection.
create policy user_profiles_update_own on public.user_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT policy: rows are created solely by the handle_new_user() trigger.
-- No DELETE policy: removal happens via auth user cascade (see delete-account).

grant select (id, username, country, timezone, created_at, updated_at) on public.user_profiles to authenticated;
-- timezone is written via set_my_timezone(), which validates against
-- pg_timezone_names; no direct update grant on it.
grant update (username, country) on public.user_profiles to authenticated;

-- ─── user_stats ──────────────────────────────────────────────────────────────
-- Read-only to the client. Writes happen only in the apply_score_event()
-- trigger, so a user cannot inflate their own total_score.
create policy user_stats_select_own on public.user_stats
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.user_stats to authenticated;

-- ─── score_events ────────────────────────────────────────────────────────────
-- Insert own rows only, and only through submit_score() in practice.
-- No UPDATE or DELETE policy at all: the ledger is append-only, so a user
-- cannot retroactively rewrite yesterday's scores to win the weekly board.
create policy score_events_select_own on public.score_events
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy score_events_insert_own on public.score_events
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and score between 0 and 100
    -- No real UTC offset moves a device's date more than a day either side of
    -- the server's, so this bounds a spoofed local_date even if a client calls
    -- the table directly instead of going through submit_score().
    and local_date between (current_date - 1) and (current_date + 1)
    -- Rate limit: caps a scripted client at 200 events/day, comfortably above
    -- the 18/day the game allows but low enough to stop leaderboard stuffing.
    and (
      select count(*) from public.score_events e
       where e.user_id = (select auth.uid())
         and e.created_at >= now() - interval '24 hours'
    ) < 200
  );

grant select, insert on public.score_events to authenticated;

-- ─── user_badges ─────────────────────────────────────────────────────────────
create policy user_badges_select_own on public.user_badges
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_badges_insert_own on public.user_badges
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.user_badges to authenticated;

-- ─── category_scores ─────────────────────────────────────────────────────────
-- Read-only; maintained by the apply_score_event() trigger.
create policy category_scores_select_own on public.category_scores
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.category_scores to authenticated;

-- ─── Function execution ──────────────────────────────────────────────────────
grant execute on function public.get_leaderboard(text, text, integer, integer)       to authenticated;
grant execute on function public.get_user_rank(uuid, text, text)                     to authenticated;
grant execute on function public.get_my_daily_usage()                                to authenticated;
grant execute on function public.submit_score(text, integer, text, date, integer)    to authenticated;
grant execute on function public.award_badge(text)                                   to authenticated;
grant execute on function public.update_my_username(text)                            to authenticated;
grant execute on function public.set_my_timezone(text)                               to authenticated;
grant execute on function public.my_local_date()                                     to authenticated;
grant execute on function public.user_local_date(text)                               to authenticated;

-- `anon` is granted nothing. Signup/login go through GoTrue, not PostgREST.
