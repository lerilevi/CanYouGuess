# Can You Guess? — Supabase migration and verification runbook

Nothing in this directory has been applied to production yet. Keep the app on
the OnSpace backend until every local and linked-project check below passes.

## Security model

- The public anon/publishable key is treated as public knowledge.
- `anon` has no `public` schema, table, sequence, or RPC privileges.
- Authenticated users may read their own profile, stats, score events, badges,
  and category aggregates. They may update country directly; username and
  timezone changes use validated RPCs.
- Timezone changes go through `set_my_timezone()`, which validates the IANA
  name before its narrowly scoped security-definer update.
- Question answers, AI request events, score insertion, and badge insertion are
  server-only.
- `generate-question` requires a real user JWT in addition to platform
  `verify_jwt`, rate-limits before Gemini is called, and never returns the
  stored trivia answer during generation.
- Evaluation atomically leases and finalizes a question session once. Trivia
  uses server-held accepted answers and deterministic matching, so untrusted
  answer text never enters a grading prompt. Estimation uses Gemini only after
  the lease and request reservation succeed.
- The client cannot provide the category, question type, correct answer, local
  date, or score. Stored trivia answers are erased after finalization.

The AI rolling limits are abuse ceilings (12 generation calls/minute and 300
per 24 hours; 24 Gemini estimation evaluations/minute and 600 per 24 hours).
Deterministic trivia evaluation does not spend Gemini quota. These limits are
not the product's free/paid entitlement gate. RevenueCat webhook synchronization
and AdMob server-side verification are separate integration work and must be
completed before the client-side 15+3 limit can be considered authoritative.
Expired unanswered sessions, old answered sessions, and rate-limit events are
pruned in bounded batches during later AI reservations.

## Migration inventory

Apply in numeric order:

1. `0001_core_schema.sql` — profiles, authoritative question sessions, score
   ledger, aggregates, badges, and AI rate-limit events.
2. `0002_scoring.sql` — timezone reporting, aggregate trigger, request
   reservation, session creation, and transactional finalization.
3. `0003_leaderboard.sql` — daily/weekly/all-time RPCs and correct score ties.
4. `0004_auth_triggers.sql` — profile provisioning and collision-safe usernames.
5. `0005_rls.sql` — deny-by-default privileges, RLS, and explicit RPC allowlist.

## Local verification first

Requirements: Supabase CLI plus a running Docker-compatible container engine.

```bash
supabase start
supabase db reset
supabase db lint --level error
supabase test db
```

`supabase test db` runs
`tests/database/security_and_scoring_test.sql` in a rolled-back transaction. It
covers:

- RLS enabled and forced on every application table.
- No anon schema/table/RPC access, including inherited `PUBLIC` execution.
- User A cannot read or update User B.
- Timezone validation works without a direct timezone column grant.
- Clients cannot insert scores/badges or read server-held answers.
- Only `service_role` can call the private lifecycle RPCs, and it has no direct
  table grant for question state.
- One question produces one score event; concurrent evaluation and replay are
  rejected, and stored answers are cleared after finalization.
- Aggregate totals, first-guess badge, equal-score rank ties, category checks,
  rolling rate limits, username/Auth metadata synchronization, and auth-user
  cascades.

Do not proceed if reset, lint, or any pgTAP assertion fails.

## Apply to the empty linked project

The new project ref is `kkwhbtgewxvsvmuozxok`.

```bash
supabase link --project-ref kkwhbtgewxvsvmuozxok
supabase db push --dry-run
supabase db push
supabase test db --linked
```

Prefer `db push` over pasting files into the Dashboard so migration history is
recorded. The linked pgTAP suite rolls its fixture data back.

## Manual privilege smoke tests

With only the anon/publishable key, every table and RPC request below must be
denied. An empty array is not sufficient evidence if the role lacked rows;
check the HTTP status and response body.

```bash
curl -i "https://kkwhbtgewxvsvmuozxok.supabase.co/rest/v1/user_profiles?select=*" \
  -H "apikey: <ANON_KEY>"

curl -i -X POST \
  "https://kkwhbtgewxvsvmuozxok.supabase.co/rest/v1/rpc/get_leaderboard" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_window":"all_time","p_country":null,"p_limit":10,"p_offset":0}'
```

Expected: permission/authorization failure, never profile or leaderboard data.

Then use two throwaway authenticated accounts and confirm:

- Each sees only its own rows.
- Neither can insert into `score_events` or `user_badges`.
- Neither can read `question_sessions` or call any service-only lifecycle or
  account-verification RPC.
- `get_leaderboard` intentionally returns public username/country/score rows.
- `get_user_rank` refuses a different user's id.

## Edge Function deployment

```bash
supabase secrets set GEMINI_API_KEY=... --project-ref kkwhbtgewxvsvmuozxok
supabase functions deploy generate-question --project-ref kkwhbtgewxvsvmuozxok
supabase functions deploy delete-account --project-ref kkwhbtgewxvsvmuozxok
```

Optional overrides:

- `GEMINI_MODEL` (default stable `gemini-3.7-flash`)
- `GEMINI_TIMEOUT_MS` (default `20000`)
- `GEMINI_THINKING_LEVEL` (`LOW`, `MEDIUM`, or `HIGH`; default `LOW`)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
platform-provided. Never put the service-role key in `.env`, the mobile app,
test output, or version control.

Both functions keep platform `verify_jwt = true` in `config.toml`. A project
API key is not a user bearer token. Test `generate-question` with a throwaway
user access token:

```bash
SUPABASE_URL=https://kkwhbtgewxvsvmuozxok.supabase.co \
SUPABASE_ANON_KEY=<ANON_KEY> \
TEST_USER_ACCESS_TOKEN=<THROWAWAY_USER_JWT> \
node supabase/tests/edge-functions.mjs
```

That performs auth/method/input checks without spending Gemini quota. To run
one paid generation plus deterministic trivia evaluation/concurrency/replay
flow, add `RUN_AI_INTEGRATION=1`.

The successful generation response must contain `questionId`, `type`,
`question`, `hint`, and `expiresAt`, and must not contain `correctAnswer`.
Evaluation must return authoritative `score` plus refreshed `stats`; of two
concurrent evaluations exactly one must succeed, and later replay must return
HTTP 409.

For account deletion, use a separate throwaway account and send
`{"confirm":"DELETE"}`. The function verifies all application cascades through
a service-only RPC without receiving direct table privileges; also confirm the
Auth user is gone in the dashboard.

## Client integration requirements

The current `.v2.ts` service drafts predate authoritative question sessions
and are not ready to wire in unchanged. The integration branch must:

1. Store `questionId` from generation.
2. Evaluate with `questionId` plus `userAnswer` only.
3. Stop calling `submit_score` and `award_badge`; evaluation already persists
   score and verified badges transactionally.
4. Refresh UI state from the returned `stats`/`new_badges`.
5. Call `reportTimezone()` once per authenticated launch.
6. Use a real user session JWT for every Edge Function call.
7. Implement RevenueCat webhook entitlement state and AdMob SSV before claiming
   the 15-free-plus-3-rewarded allowance is enforced server-side.

## Cutover sequence

1. Pass local reset/lint/pgTAP.
2. Dry-run and push to the empty linked project; pass linked pgTAP.
3. Deploy and test both Edge Functions with throwaway users.
4. Integrate the client on a separate branch and run fresh signup, play,
   leaderboard, purchase/restore, timezone, and deletion tests.
5. Publish legal pages from a dedicated Pages branch or Actions workflow—not
   `main`, which is still tied to OnSpace.
6. Change the app's Supabase environment and legal URLs together only after all
   preceding checks pass.
