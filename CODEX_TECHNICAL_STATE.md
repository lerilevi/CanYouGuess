# Codex Technical State — ground truth

Companion to `CANYOUGUESS_CODEX_HANDOFF.md`. That document carries the
narrative: history, decisions and rationale. **This one carries only facts
verified directly against the repository**, so where the two disagree, this
one is the one that was checked.

Verified: 2026-08-28, against `github.com/lerilevi/CanYouGuess`.

---

## 1. Corrections to the narrative handoff

Two things in `CANYOUGUESS_CODEX_HANDOFF.md` are now out of date:

- **§4.4 "Neither branch has been pushed to GitHub" is resolved.** Both
  branches were pushed on 2026-08-28. Nothing is stranded locally. See §2.
- **§4.2's open question about the RevenueCat key is answered: it was never
  provided.** `EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY` exists in `.env` on
  `part1-build-fixes` with a zero-length value. See §5.

Everything else in that document matched what is in the repo.

---

## 2. Exact branch and commit state

```
refs/heads/main               3472d82c8804cee204d4d5106499d8669f3d0357
refs/heads/part1-build-fixes  8f49a84e41ef490c3e8b4aa750ea46c44e0adb75
refs/heads/onspace-exit-prep  31f3a7a1d3e84daecc5fa1e14a17df3f69d67cd2
```

All three exist on `origin` and match local. Neither feature branch has been
merged; neither has a PR opened.

| Branch | Commits ahead of main | Contents |
|---|---|---|
| `part1-build-fixes` | 1 (`8f49a84`) | Next TestFlight build |
| `onspace-exit-prep` | 2 (`8a766cc`, `31f3a7a`) | Migration prep, nothing deployed |

**`main` is untouched** and still points at `3472d82` "Code edited in OnSpace
Code Editor" — the commit that produced TestFlight build 1.0.6. Nothing was
pushed to `main`, deliberately: `main` is what OnSpace syncs from, and a push
there could consume a scarce build credit.

The two branches are independent of each other, both branched from `3472d82`.
They do not conflict — their changed-file sets are disjoint except that neither
touches the other's files.

### Build → commit mapping

Useful when reading old `.ips` files; the app-binary offsets are only
meaningful per build.

| Build | Commit | Note |
|---|---|---|
| 1.0.4 | `a8f447a` | AdMob config plugin commented out |
| 1.0.5 | `550be17` | Same, plus RevenueCat JS calls disabled |
| 1.0.6 | `3472d82` | Plugin restored; currently live on TestFlight |

---

## 3. Changed files per branch

`git diff --name-status main <branch>`, verbatim.

### `part1-build-fixes` (7 paths)

```
M  .env
D  app.json
M  app/_layout.tsx
A  components/feature/PreviousCrashNotice.tsx
M  components/index.ts
M  package.json
A  services/errorReporter.ts
```

- `app/_layout.tsx` — adds two imports and one JSX line. `installErrorReporter()`
  is called at **module scope, before the `react` import**, so it is installed
  before anything else in the app tree can throw. Preserve that ordering.
- `package.json` — one added line: `"expo-tracking-transparency": "~5.2.4"`.
- `components/index.ts` — one added export line.

### `onspace-exit-prep` (15 paths)

```
A  docs/index.html
A  docs/privacy/index.html
A  docs/style.css
A  docs/terms/index.html
A  services/leaderboardService.v2.ts
A  services/localTime.v2.ts
A  services/profileService.v2.ts
A  supabase/MIGRATION.md
M  supabase/functions/delete-account/index.ts
M  supabase/functions/generate-question/index.ts
A  supabase/migrations/0001_core_schema.sql
A  supabase/migrations/0002_scoring.sql
A  supabase/migrations/0003_leaderboard.sql
A  supabase/migrations/0004_auth_triggers.sql
A  supabase/migrations/0005_rls.sql
```

**Verified: the three `*.v2.ts` files are imported by nothing.** A repo-wide
grep across `app/`, `components/`, `contexts/`, `hooks/`, `constants/` and
`template/` returns zero references. They are inert until wired at cutover.

**Verified: this branch changes no live config.** `git diff main` restricted to
`.env`, `app/`, `contexts/`, `constants/` and `components/` is empty.

---

## 4. `app.config.js` — exact current contents

Identical on all three branches (`8f49a84` did not touch it; `2702993` on
`main` was the last change). Since `app.json` is deleted on
`part1-build-fixes`, this is the **only** Expo config there.

```javascript
/**
 * app.config.js
 *
 * Dynamic Expo config. All plugins are declared here (not in app.json) to
 * avoid duplication. app.json is kept minimal (identity fields only).
 *
 * IMPORTANT — AdMob App ID:
 * The GADApplicationIdentifier must be embedded in the native Info.plist at
 * build time by the react-native-google-mobile-ads config plugin. It cannot
 * be read from a runtime environment variable during native builds.
 * The App ID is NOT a secret (it ships in every binary's Info.plist).
 * Replace the value below with your real AdMob App ID before building.
 */

// AdMob App ID — hard-coded (not a secret; ships in every binary's Info.plist).
// Commented out for isolation test build (Option A).
 const admobAppId = 'ca-app-pub-1234939432505573~9931354547';

module.exports = {
  expo: {
    name: 'onspace-app',
    slug: 'onspace-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/logo.png',
    scheme: 'onspaceapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'app.onspace.canyouguess',
    },
    android: {
      package: 'app.onspace.canyouguess',
      adaptiveIcon: {
        foregroundImage: './assets/images/logo.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/logo.png',
    },
    plugins: [
      'expo-router',
       [
         'react-native-google-mobile-ads',
         {
           androidAppId: admobAppId,
           iosAppId: admobAppId,
           userTrackingUsageDescription:
             'This identifier will be used to deliver personalized ads to you.',
           skAdNetworkItems: [],
         },
       ],
       'expo-tracking-transparency',
      [
        'expo-splash-screen',
        {
          image: './assets/images/logo.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
```

Notes on the above, verified by evaluating the file with node:

- Resolves standalone with `app.json` absent. Plugin order as loaded:
  `expo-router`, `react-native-google-mobile-ads`, `expo-tracking-transparency`,
  `expo-splash-screen`, `expo-web-browser`.
- `iosAppId` / `androidAppId` both resolve to
  `ca-app-pub-1234939432505573~9931354547`. **This value being present is what
  writes `GADApplicationIdentifier` into `Info.plist`, and its absence is what
  caused the 1.0.4/1.0.5 launch crash.** Do not comment this block out to
  "isolate" AdMob — removing the plugin while `react-native-google-mobile-ads`
  stays in `package.json` leaves the SDK linked with no app id, which is the
  crash, not a test of it.
- `newArchEnabled: false` — old architecture. Consistent with the
  `NSInvocation`/bridge frames in the 1.0.6 crash log.
- `version: '1.0.0'` here is **not** the shipped version; OnSpace overrides it
  (TestFlight shows 1.0.6).
- `name` / `slug` are still `onspace-app`.

---

## 5. `.env` — variable names and value state

**Names and value shape only. No values are reproduced here.**

`.env` is committed and tracked in git (`.gitignore` only excludes `.env*.local`),
and the repo is public.

### On `main` (what build 1.0.6 shipped with) — 2 variables

| Variable | State |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | set — OnSpace-hosted Supabase host |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | set — JWT, `role: "anon"`, `iss: "onspace"`, exp 2036 |

### On `part1-build-fixes` — 4 variables

| Variable | State |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | set (unchanged) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | set (unchanged) |
| `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID` | set — 38 chars, `ca-app-pub-…` form |
| `EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY` | **present but zero-length** |

### Both of these are read but not declared

Referenced in code, absent from `.env` on `main`, which is why they silently
degraded in the live build:

| Variable | Read at | Effect when empty |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY` | `constants/config.ts:13` | `initializePurchases()` warns and returns; IAP dead |
| `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID` | `services/adService.ts` | falls back to Google's **test** rewarded unit in production |

`EXPO_PUBLIC_*` values are inlined into the JS bundle at build time, so all of
these ship inside the `.ipa` regardless of whether the file is committed. The
anon key and the AdMob ids are public by design. **A secret must never go in
this file** — the backend keys (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`)
are read by edge functions from the platform environment, never by the client.

### Secret scan result

All 24 commits of history were scanned for `service_role`, `sk_live`/`sk_test`,
`-----BEGIN`, `appl_…`, `AIza…` and committed key files (`.p8`, `.p12`, `.pem`,
`.jks`, `.mobileprovision`). **No hardcoded secret has ever been committed.**
The only `SERVICE_ROLE` match is `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` in
the delete-account function, which is correct.

---

## 6. Migrations — file list and object inventory

On `onspace-exit-prep` only. Target project ref `kkwhbtgewxvsvmuozxok`.
**None have been applied to any database.** Apply in numeric order — `0005`
revokes and re-grants against objects created in `0001`–`0004`.

### `0001_core_schema.sql` — tables, indexes, constraints

```
EXTENSION citext
TABLE     public.user_profiles        (id, username, country, timezone, created_at, updated_at)
TABLE     public.score_events         (id, user_id, category, question_type, score,
                                       local_date, tz_offset_minutes, created_at)
TABLE     public.user_stats           (user_id, total_score, total_questions, current_streak,
                                       longest_streak, last_played_at, last_played_local_date, …)
TABLE     public.user_badges          (user_id, badge_id, earned_at)  PK(user_id, badge_id)
TABLE     public.category_scores      (user_id, category, highest_score, questions_answered, …)
UIDX      user_profiles_username_key
INDEX     user_profiles_country_idx, user_stats_total_score_idx,
          score_events_user_created_idx, score_events_created_idx,
          score_events_user_local_date_idx
FUNCTION  public.touch_updated_at()
TRIGGER   user_profiles_touch, user_stats_touch, category_scores_touch
```

Every table's `user_id`/`id` references `auth.users(id) ON DELETE CASCADE` —
that is what makes the rewritten delete-account a single delete.

### `0002_scoring.sql` — submission, aggregates, local-day logic

```
FUNCTION  public.set_my_timezone(p_timezone text) → void
FUNCTION  public.my_local_date() → date
FUNCTION  public.apply_score_event()            [trigger fn, SECURITY DEFINER]
TRIGGER   score_events_apply  AFTER INSERT ON score_events
FUNCTION  public.get_my_daily_usage() → table(questions_today int, local_date date, timezone text)
FUNCTION  public.submit_score(...) → table(...)
FUNCTION  public.award_badge(p_badge_id text) → boolean
```

`apply_score_event` is the only writer of `user_stats` and `category_scores`;
clients have no write grant on either, so scores cannot be self-inflated.

### `0003_leaderboard.sql` — server-side ranking

```
FUNCTION  public.user_local_date(p_timezone text) → date
FUNCTION  public.get_leaderboard(...)  [SECURITY DEFINER]
FUNCTION  public.get_user_rank(...)    [SECURITY DEFINER]
```

These two are the **only** cross-user read path in the whole schema. They
expose `username`, `country`, `score` and nothing else.

### `0004_auth_triggers.sql` — provisioning

```
FUNCTION  public.generate_unique_username(p_seed text) → citext
FUNCTION  public.handle_new_user()               [SECURITY DEFINER]
TRIGGER   on_auth_user_created           AFTER INSERT ON auth.users
FUNCTION  public.sync_username_from_auth()       [SECURITY DEFINER]
TRIGGER   on_auth_user_metadata_updated  AFTER UPDATE OF raw_user_meta_data ON auth.users
FUNCTION  public.update_my_username(p_username text) → void
```

`on_auth_user_created` is the trigger whose absence on the OnSpace backend
produces the `"Database trigger missing … user profile creation failed"`
warning in `template/auth/supabase/service.ts`.

### `0005_rls.sql` — policies and grants

```
POLICY  user_profiles_select_own, user_profiles_update_own
POLICY  user_stats_select_own
POLICY  score_events_select_own, score_events_insert_own
POLICY  user_badges_select_own, user_badges_insert_own
POLICY  category_scores_select_own
```

Also: `REVOKE ALL` from `anon` and `authenticated` up front, `ENABLE` **and**
`FORCE ROW LEVEL SECURITY` on all five tables, column-level grants, and
`GRANT EXECUTE` on nine functions. `anon` ends with no table or function
access at all. There is deliberately **no UPDATE or DELETE policy on
`score_events`** — the ledger is append-only, so past scores cannot be rewritten.

### RPC signatures — match these exactly at client call sites

PostgREST resolves overloads by argument name, so a typo yields a confusing
"function not found" rather than a type error.

```sql
set_my_timezone(p_timezone text) → void
my_local_date() → date
get_my_daily_usage() → table(questions_today integer, local_date date, timezone text)
award_badge(p_badge_id text) → boolean
update_my_username(p_username text) → void

submit_score(
  p_category          text,
  p_score             integer,
  p_question_type     text    default 'trivia',
  p_local_date        date    default null,
  p_tz_offset_minutes integer default null
) → table(total_score, total_questions, current_streak,
          longest_streak, questions_today, local_date)

get_leaderboard(
  p_window  text    default 'all_time',   -- 'daily' | 'weekly' | 'all_time'
  p_country text    default null,         -- null = global
  p_limit   integer default 10,           -- clamped to 1..100
  p_offset  integer default 0
) → table(rank bigint, user_id uuid, username text, country text, score integer)

get_user_rank(
  p_user_id uuid default null,            -- null = caller
  p_window  text default 'all_time',
  p_country text default null
) → table(rank bigint, score integer, total_ranked bigint)
```

`get_user_rank` returns **zero rows** when the user has no score in the window.
That is "unranked", and the client must not render it as rank 0.

An unrecognised `p_window` produces an empty leaderboard rather than an error,
because the window `CASE` falls through to `null`. Only the three literals above
are valid.

---

## 7. Repo facts worth knowing before editing

- **Line endings are CRLF** on the tracked TypeScript/JSON files (`app/_layout.tsx`
  and friends). String-replacement edits anchored on `\n` will silently fail to
  match. Migration `.sql` and the new `docs/` files are LF. Git reports
  "LF will be replaced by CRLF" warnings on commit; this is expected.
- **No `ios/` or `android/` directory.** Expo managed workflow; native projects
  are generated at build time. `expo prebuild` is required before any local
  Xcode work.
- **No `node_modules`, and `pnpm-lock.yaml` is the lockfile** — but the manually
  pinned packages were added by hand-editing `package.json`, so the lockfile may
  not reflect them. Install with pnpm, and expect to have to regenerate the lock.
- **133 runtime dependencies**, the large majority unused OnSpace template
  boilerplate (`react-native-webrtc`, `@stripe/stripe-react-native`, Apollo,
  Redux, maps, calendar, contacts, `libsignal-protocol-typescript`, …). Every
  one of these is linked into the binary. Pruning is a real opportunity for both
  binary size and launch-time risk, but each removal is a native-link change and
  needs its own build to verify — do not batch it with a crash-fix build.
- **`react-native-google-mobile-ads@14.7.2` and `react-native-purchases@8.9.2`**
  are pinned at the top of `dependencies`, out of alphabetical order, because
  they were added manually via GitHub when OnSpace's editor had `package.json`
  locked.
- **String literals that look like typos but are correct:**
  - RevenueCat entitlement id is `canyouguess? Unlimited` — with a space and a
    question mark. `constants/config.ts:14`. Used verbatim; do not "clean" it.
  - AdMob test fallback unit `ca-app-pub-3940256099942544/5224354917` in
    `services/adService.ts` is Google's official test id, not a stray value.
- **Live legal URLs are hardcoded in a screen, not in config:**
  `app/(tabs)/profile.tsx:35-36`. That is the only place to change at cutover.
- **`supabase/functions/generate-question/index.ts` on `main` still reads**
  `ONSPACE_AI_API_KEY` / `ONSPACE_AI_BASE_URL`. Only the `onspace-exit-prep`
  version calls Gemini directly. The live app is still on the OnSpace gateway.

---

## 8. What has and has not been verified

| Artefact | Verified how | Not verified |
|---|---|---|
| 5 migrations, 76 statements | Parsed against real Postgres grammar (`pg-query-emscripten`), including `language sql` bodies | **Never executed.** No Postgres in the authoring environment. plpgsql bodies are only checked at `CREATE FUNCTION` time |
| `errorReporter.ts`, `PreviousCrashNotice.tsx`, `_layout.tsx`, both edge functions, all `*.v2.ts` | Parse-clean via esbuild | Not type-checked — no `node_modules` |
| `app.config.js` | Evaluated with node; plugin list and AdMob id confirmed | Not run through `expo prebuild` |
| Legal page content | Compared against the live `*.onspace.build` pages rendered in a browser | Styling not visually confirmed after inlining |
| Gemini model identity | Confirmed the old gateway named `google/gemini-3-flash-preview`, and `gemini-3-flash-preview` is a valid direct-API id | No live API call made — no key available |
| RLS behaviour | Policy logic reviewed | **Not proven against a running database.** The `curl` check in `supabase/MIGRATION.md` is the first real test |

The single highest-value first action for a fresh agent is applying
`0001`–`0005` to `kkwhbtgewxvsvmuozxok` and running that RLS check. It converts
the largest block of unproven work into verified work, and it is reversible —
the project is empty.

---

## 9. Is `part1-build-fixes` ready to build?

**No — one blocker, and it is a one-line fix.**

`EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY` on that branch is present but empty
(zero-length value). The key was never supplied. Building as-is produces a
TestFlight build where:

- the crash handler works and will capture the JS error (the main point of the
  build) ✅
- real rewarded ads serve ✅
- **IAP is still completely dead** ❌ — `initializePurchases()` warns and
  returns early, so the $4.99 unlock cannot be purchased or tested

That is a legitimate build if the goal is purely to capture the 1.0.6 JS error,
and given how scarce OnSpace build credits are, it may still be the right call.
But it cannot validate IAP, and the App Store product still has to submit with
a build, so it will need a further one.

**To unblock:** put the RevenueCat *public* app key (`appl_…`, from Project
settings → API keys → the App Store app's public key — **not** the secret key)
into `EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY` in `.env` on that branch. It is
public by design and safe in the committed file, same category as the anon key.

Nothing else on the branch is blocked.
