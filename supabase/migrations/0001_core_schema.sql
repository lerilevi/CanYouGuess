-- 0001_core_schema.sql
-- Can You Guess? — core schema for the self-owned Supabase project.
--
-- Design note vs. the OnSpace schema this replaces:
-- the old `leaderboard_scores` table stored total/daily/weekly as three
-- mutable columns maintained by client-side read-modify-write. A single
-- mutable row cannot express a time window, which is exactly why
-- `weekly_score` ended up as a copy of `total_score` and why `daily_score`
-- broke after the second answer of the day. Here, `score_events` is the
-- append-only source of truth and every window is derived from it.

create extension if not exists citext;

-- ─── Profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. Created automatically by the trigger in 0004.
create table public.user_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    citext not null,
  -- ISO 3166-1 alpha-2, refreshed from IP on each launch. Nullable: detection
  -- can fail offline and the app must still work.
  country     text,
  -- IANA timezone reported by the device (Intl.DateTimeFormat().resolvedOptions().timeZone).
  -- Drives each user's own daily/weekly reset at their local midnight. Validated
  -- against pg_timezone_names by set_my_timezone(); 'UTC' is the safe fallback
  -- for a device that cannot report one.
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_profiles_username_length check (char_length(username::text) between 2 and 24),
  constraint user_profiles_country_format  check (country is null or country ~ '^[A-Z]{2}$')
);

create unique index user_profiles_username_key on public.user_profiles (username);
create index user_profiles_country_idx on public.user_profiles (country) where country is not null;

comment on table public.user_profiles is
  'Public-facing profile. Username is unique case-insensitively (citext).';

-- ─── Score events (append-only source of truth) ──────────────────────────────
create table public.score_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  category      text not null,
  question_type text not null default 'trivia',
  score         integer not null,
  -- The user's own calendar date at the moment of submission, supplied by the
  -- client. Stored per-event rather than derived at query time so that history
  -- is immutable: changing timezone (or travelling) must not silently rewrite
  -- which day past answers counted toward.
  local_date    date not null,
  -- Kept for auditing/debugging only; local_date is the field windows key off.
  tz_offset_minutes integer,
  created_at    timestamptz not null default now(),
  constraint score_events_score_range check (score between 0 and 100),
  constraint score_events_question_type check (question_type in ('trivia', 'estimation')),
  -- Real UTC offsets span -12:00..+14:00.
  constraint score_events_tz_offset_range check (
    tz_offset_minutes is null or tz_offset_minutes between -720 and 840
  )
);

-- Covers "my events in a window" (daily gate, personal history).
create index score_events_user_created_idx on public.score_events (user_id, created_at desc);
-- Covers the global daily/weekly leaderboard aggregations.
create index score_events_created_idx on public.score_events (created_at desc);
-- Serves the per-user local-day and rolling-local-week aggregations.
create index score_events_user_local_date_idx on public.score_events (user_id, local_date desc);

comment on table public.score_events is
  'Append-only. Never updated or deleted except by user cascade. All leaderboard windows derive from this.';

-- ─── Aggregated per-user stats ───────────────────────────────────────────────
-- Denormalised for cheap all-time leaderboard reads and streak tracking.
-- Maintained exclusively by the trigger in 0002 — never written by clients.
create table public.user_stats (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  total_score     integer not null default 0,
  total_questions integer not null default 0,
  current_streak  integer not null default 0,
  longest_streak  integer not null default 0,
  last_played_at  timestamptz,
  -- The user's local date of their last answer. Streak comparisons use this,
  -- so a streak breaks at the player's own midnight rather than a server one.
  last_played_local_date date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index user_stats_total_score_idx on public.user_stats (total_score desc);

-- ─── Badges ──────────────────────────────────────────────────────────────────
create table public.user_badges (
  user_id   uuid not null references auth.users (id) on delete cascade,
  badge_id  text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

comment on table public.user_badges is
  'Composite PK makes awarding idempotent — re-awarding is a no-op via ON CONFLICT DO NOTHING.';

-- ─── Per-category aggregates ─────────────────────────────────────────────────
create table public.category_scores (
  user_id            uuid not null references auth.users (id) on delete cascade,
  category           text not null,
  highest_score      integer not null default 0,
  questions_answered integer not null default 0,
  updated_at         timestamptz not null default now(),
  primary key (user_id, category)
);

-- ─── updated_at maintenance ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_profiles_touch before update on public.user_profiles
  for each row execute function public.touch_updated_at();
create trigger user_stats_touch before update on public.user_stats
  for each row execute function public.touch_updated_at();
create trigger category_scores_touch before update on public.category_scores
  for each row execute function public.touch_updated_at();
