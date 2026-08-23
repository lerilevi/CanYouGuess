# OnSpace → self-owned Supabase: migration runbook

**Status: prepared, not deployed.** Nothing in this branch changes what the
shipped app talks to. `.env` still points at the OnSpace backend and
`PRIVACY_POLICY_URL` / `TERMS_URL` still point at `*.onspace.build`.

Target project ref: `kkwhbtgewxvsvmuozxok`

---

## What's in this branch

| Path | What it is |
|---|---|
| `supabase/migrations/0001_core_schema.sql` | Tables, indexes, constraints |
| `supabase/migrations/0002_scoring.sql` | `submit_score()`, aggregate trigger, daily usage |
| `supabase/migrations/0003_leaderboard.sql` | `get_leaderboard()`, `get_user_rank()` |
| `supabase/migrations/0004_auth_triggers.sql` | Profile provisioning, username sync |
| `supabase/migrations/0005_rls.sql` | RLS policies and grants |
| `supabase/functions/delete-account/index.ts` | Rewritten for real admin access |
| `supabase/functions/generate-question/index.ts` | Rewritten to call Google Gemini directly |
| `services/leaderboardService.v2.ts` | Client, not wired in |
| `services/localTime.v2.ts` | Client, not wired in |
| `services/profileService.v2.ts` | Client, not wired in |
| `docs/` | GitHub Pages legal site |

---

## The three bugs, and how the schema fixes them

### `weekly_score` was a copy of `total_score`

The old `leaderboard_scores` table held `total_score`, `daily_score` and
`weekly_score` as three mutable columns updated by the client on every answer.
A single mutable row cannot express a time window — there is nowhere to record
*when* each point was scored — so `weekly_score: newTotal` was the only thing
the client could write.

Fixed by making `score_events` an append-only ledger. `weekly` is now the sum
over the last seven of the user's own local days, recomputed per query.

### `daily_score` broke after the second answer of the day

The old formula was:

```ts
daily_score: newToday === 1 ? scoreGained : Math.min(newToday * scoreGained, newTotal)
```

From the second answer onward this multiplies today's answer count by the
*most recent* score, which is not a sum of anything. A user who scored 90 then
10 got `min(2 × 10, 100)` = 20 instead of 100.

Fixed the same way: `daily` is `sum(score)` over the user's own local day
(see the section below).

### `getUserRank` downloaded the whole table

It selected every row, ordered them, and ran `findIndex()` in JS. Fixed by
`get_user_rank()`, which uses `rank() over (order by score desc)` in Postgres
and returns one row.

---

## Day boundaries: each user's own local midnight

Daily and weekly windows reset at **the player's local midnight**, not at a
fixed server timezone. There is no hardcoded `UTC` or `Asia/Jerusalem` anywhere
in the scoring path.

How it works:

- `user_profiles.timezone` holds the device's IANA zone (`Asia/Jerusalem`),
  reported at launch via `set_my_timezone()` and validated against
  `pg_timezone_names`. `UTC` is the fallback for a device that can't report one.
- Every row in `score_events` stores `local_date` — the user's own calendar
  date at submission, supplied by the client. It is stored per event rather
  than derived at query time so history is immutable: changing timezone or
  travelling must not silently rewrite which day past answers counted toward.
- `daily` = `local_date = user_local_date(p.timezone)`.
  `weekly` = the last 7 local days inclusive.
  Both are evaluated **per row against that row's own user**, so a Tel Aviv
  player and a New York player are each measured against their own midnight.
- Streaks compare `local_date` too, so a streak breaks at the player's own
  midnight rather than mid-evening.

### The client is trusted, but bounded

`local_date` comes from the device, and a device clock can be changed. No real
UTC offset (−12:00 … +14:00) puts a device's date more than one day either side
of the server's, so both `submit_score()` and the RLS insert policy reject
anything outside `current_date ± 1`. That stops backdating onto a finished
daily board while still honouring genuine timezones. It does not stop a user
shifting their clock by a few hours to catch a fresh day early — closing that
completely would mean ignoring the device, which is the opposite of what was
asked. The 200-events-per-24h cap in the RLS policy limits what that could
ever be worth.

### One consequence worth knowing

Because each player's day starts at their own midnight, the daily leaderboard
is not a single synchronised window — it compares each player's own-day total.
That is the intended reading of "resets at their local midnight", but it does
mean two players' "today" columns cover different absolute hours.

---

## Applying the migrations

You do **not** need to give anyone the service role key for this. Apply the
SQL yourself, either way below.

**Option A — Supabase SQL editor (no tooling).** Open the project → SQL Editor,
paste each file in numeric order, run. Order matters: 0005 revokes and re-grants
against objects created in 0001–0004.

**Option B — Supabase CLI.**

```bash
supabase link --project-ref kkwhbtgewxvsvmuozxok
supabase db push
```

### Then verify RLS actually holds

This is the check that was impossible on OnSpace. With the **anon** key only:

```bash
curl -s "https://kkwhbtgewxvsvmuozxok.supabase.co/rest/v1/user_profiles?select=*" \
  -H "apikey: <ANON_KEY>"
```

Expected: an empty array or a permission error — **never** a list of users. Repeat
for `user_stats`, `score_events`, `user_badges`, `category_scores`. If any of them
returns rows to an unauthenticated caller, stop and fix before cutover.

Then sign in as a test user and confirm that user sees only their own rows, and
that `get_leaderboard` returns other players' usernames and scores (that one is
supposed to cross users — it is the single audited exception).

---

## Edge function deployment

```bash
supabase secrets set GEMINI_API_KEY=... --project-ref kkwhbtgewxvsvmuozxok
supabase functions deploy delete-account    --project-ref kkwhbtgewxvsvmuozxok
supabase functions deploy generate-question --project-ref kkwhbtgewxvsvmuozxok
```

`ONSPACE_AI_API_KEY` and `ONSPACE_AI_BASE_URL` are no longer read by anything
and can be dropped once the new function is verified.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform — do not add them to `.env` or commit them anywhere.

Verify with a throwaway account: delete it from Profile settings, then confirm
in Authentication → Users that the row is gone (not just the profile data). That
is the part OnSpace could never do.

---

## GitHub Pages

Repo → Settings → Pages → Source: `main`, folder `/docs`.

Resulting URLs:

- `https://lerilevi.github.io/CanYouGuess/privacy/`
- `https://lerilevi.github.io/CanYouGuess/terms/`

Both pages carry the content currently live on `*.onspace.build`, with one
addition: **ipapi.co is now named** in the third-party services table, which
closes audit finding 4.3.

⚠️ The `Last updated` date is set to **August 22, 2026**. Change it to the real
publish date before going live.

⚠️ **Check the AI provider line before publishing.** The policy names *Google
Gemini* for question generation, but `supabase/functions/generate-question`
calls an OpenAI-compatible endpoint via `ONSPACE_AI_BASE_URL` /
`ONSPACE_AI_API_KEY`. Whatever model that gateway actually proxies to needs to
be what the policy says. See the open question below.

---

## Cutover checklist

Do **none** of this until the Part 1 TestFlight result is confirmed.

1. Apply migrations 0001–0005; run the RLS verification above.
2. Set `GEMINI_API_KEY`; deploy `generate-question` and `delete-account`.
   Verify both against the new project (curl above; throwaway account) — this
   is safe while the app still points at OnSpace.
3. Enable GitHub Pages; confirm both URLs load.
4. Fold `*.v2.ts` into the real service files; delete the `.v2` copies.
   - `leaderboardService.ts` → replace wholesale
   - `profileService.ts` → replace `updateUserStats`/`updateCategoryScore` call
     sites in `GameContext.submitAnswer` with a single `submitScore()`
   - `GameContext.loadUserData` → `getDailyUsage()` instead of
     `stats.questions_today`
   - `app/_layout.tsx` or `loadUserData` → call `reportTimezone()` once per
     launch, next to the existing country detection. **Without this every user
     stays on the `UTC` default and the whole per-user-midnight design is
     inert.**
5. Point `.env` at the new project (URL + anon key).
6. Update `PRIVACY_POLICY_URL` / `TERMS_URL` to the Pages URLs.
7. Update the Privacy Policy URL in **AdMob** (both GDPR and US States consent
   messages) and in **App Store Connect**.
8. Build, test signup → play → leaderboard → purchase → delete account.
9. Timezone smoke test: change the device timezone, confirm the daily counter
   and daily leaderboard follow the device rather than the server.

Steps 5 and 6 are the actual point of no return. Everything before them is
additive and reversible.

---

## AI provider: Google Gemini, called directly

`generate-question` no longer touches OnSpace. It calls
`generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
with a Google AI Studio key in the `x-goog-api-key` header.

**Same model, confirmed.** The old gateway request named
`google/gemini-3-flash-preview`. The `google/` prefix is a gateway routing
convention, not part of the Gemini model id, so the direct call uses
`gemini-3-flash-preview` — the identical model. No speed or behaviour
regression is expected, and the Privacy Policy's existing "Google Gemini"
wording stays accurate with no copy change.

Three things worth knowing:

- **`gemini-3-flash-preview` is a preview id.** Preview models get retired.
  `GEMINI_MODEL` overrides it without a code change, so if it disappears, point
  it at a GA Flash model and redeploy. Google now lists `gemini-3.7-flash`,
  `gemini-3.6-flash` and `gemini-3.5-flash` as stable.
- **`responseMimeType: "application/json"` is now set.** Every prompt already
  demanded JSON-only output; this makes Gemini enforce it, which removes the
  markdown-fence failure mode `parseJSON` was defending against. The defensive
  strip is still there. This is the one deliberate behaviour change.
- **There is now a 20s timeout** (`GEMINI_TIMEOUT_MS`). The old code had none,
  so a hung upstream call would hang the round indefinitely.

If question latency turns out worse than the gateway, the first lever is
`GEMINI_THINKING_LEVEL=low` — Gemini 3 models reason before answering, and that
setting trades a little quality for speed. It is deliberately left unset so the
default matches the previous behaviour; change it only if you measure a problem.

### Verifying before cutover

The function can be tested against the new project while the app still points
at OnSpace — invoking it directly doesn't affect the live app:

```bash
curl -s -X POST \
  "https://kkwhbtgewxvsvmuozxok.supabase.co/functions/v1/generate-question" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"action":"generate","category":"world","country":"Israel","questionTypePreference":"mix"}'
```

Expect a JSON object with `type`, `question`, `hint`, `correctAnswer`. Time it:
if it is materially slower than the current in-app experience, that is the
signal to try `GEMINI_THINKING_LEVEL`.
