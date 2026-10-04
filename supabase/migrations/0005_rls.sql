-- 0005_rls.sql
-- Deny-by-default privileges plus row-level policies for the public client.
-- The anon key is public knowledge; anon receives no public-schema access.

-- ─── Remove Supabase/Postgres default exposure ──────────────────────────────
revoke all on schema public from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;

revoke all on all tables    in schema public from public, anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from public, anon, authenticated, service_role;

-- ─── RLS on every application table ────────────────────────────────────────
alter table public.user_profiles     enable row level security;
alter table public.user_stats        enable row level security;
alter table public.score_events      enable row level security;
alter table public.user_badges       enable row level security;
alter table public.category_scores   enable row level security;
alter table public.question_sessions enable row level security;
alter table public.ai_request_events enable row level security;

alter table public.user_profiles     force row level security;
alter table public.user_stats        force row level security;
alter table public.score_events      force row level security;
alter table public.user_badges       force row level security;
alter table public.category_scores   force row level security;
alter table public.question_sessions force row level security;
alter table public.ai_request_events force row level security;

-- FORCE RLS applies to ordinary table owners. Superusers and roles with
-- BYPASSRLS (including Supabase's service role) still bypass it by design;
-- privileged access is kept behind the audited functions below.

-- ─── user_profiles ─────────────────────────────────────────────────────────
create policy user_profiles_select_own on public.user_profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy user_profiles_update_own on public.user_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select (id, username, country, timezone, created_at, updated_at)
  on public.user_profiles to authenticated;
-- Username and timezone are deliberately excluded: their RPCs validate and
-- synchronize values without requiring direct column grants.
grant update (country) on public.user_profiles to authenticated;

-- ─── User-owned read models ─────────────────────────────────────────────────
create policy user_stats_select_own on public.user_stats
  for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.user_stats to authenticated;

create policy score_events_select_own on public.score_events
  for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.score_events to authenticated;

create policy user_badges_select_own on public.user_badges
  for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.user_badges to authenticated;

create policy category_scores_select_own on public.category_scores
  for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.category_scores to authenticated;

-- No INSERT/UPDATE/DELETE policies or grants exist for score_events,
-- user_badges, question_sessions or ai_request_events. The public client
-- cannot forge a score, badge, question answer, or rate-limit record.

-- Edge Functions authenticate the caller, then use only the SECURITY DEFINER
-- RPC allowlist below. Even service_role receives no direct table grant.

-- ─── Explicit function allowlist ───────────────────────────────────────────
grant execute on function public.get_leaderboard(text, text, integer, integer)
  to authenticated;
grant execute on function public.get_user_rank(uuid, text, text)
  to authenticated;
grant execute on function public.get_my_daily_usage()
  to authenticated;
grant execute on function public.update_my_username(text)
  to authenticated;
grant execute on function public.set_my_timezone(text)
  to authenticated;
grant execute on function public.my_local_date()
  to authenticated;

grant execute on function public.reserve_ai_request(uuid, text)
  to service_role;
grant execute on function public.create_question_session(uuid, text, text, text, text, text[], timestamptz)
  to service_role;
grant execute on function public.claim_question_session(uuid, uuid, text)
  to service_role;
grant execute on function public.release_question_session_claim(uuid, uuid, uuid)
  to service_role;
grant execute on function public.account_data_exists(uuid)
  to service_role;
grant execute on function public.finalize_question_session(uuid, uuid, uuid, integer, numeric)
  to service_role;

-- `anon` has no schema usage, table privileges, sequence privileges or RPCs.
-- Signup/login are handled by Auth, not the public Data API.
