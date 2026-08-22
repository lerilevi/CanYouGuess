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
| `services/leaderboardService.v2.ts` | Client, not wired in |
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

Fixed by making `score_events` an append-only ledger. `weekly` is now
`sum(score) where created_at >= now() - interval '7 days'`: a true rolling
seven-day window, recomputed per query.

### `daily_score` broke after the second answer of the day

The old formula was:

```ts
daily_score: newToday === 1 ? scoreGained : Math.min(newToday * scoreGained, newTotal)
```

From the second answer onward this multiplies today's answer count by the
*most recent* score, which is not a sum of anything. A user who scored 90 then
10 got `min(2 × 10, 100)` = 20 instead of 100.

Fixed the same way: `daily` is `sum(score)` since 00:00 UTC.

### `getUserRank` downloaded the whole table

It selected every row, ordered them, and ran `findIndex()` in JS. Fixed by
`get_user_rank()`, which uses `rank() over (order by score desc)` in Postgres
and returns one row.

---

## Timezone decision

Daily windows use **UTC**, not Israel time. This is worth a conscious choice
before cutover: with UTC, the daily leaderboard and the free-question
allowance reset at 03:00 IDT rather than local midnight.

To switch to a fixed local day, change `at time zone 'UTC'` to
`at time zone 'Asia/Jerusalem'` in `0002_scoring.sql` and `0003_leaderboard.sql`.
To make it per-user, store an IANA timezone on `user_profiles` and pass it in.
UTC is the simplest correct default and matches how the leaderboard is scored
globally; picking it deliberately beats inheriting it.

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
supabase functions deploy delete-account --project-ref kkwhbtgewxvsvmuozxok
```

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
2. Deploy the `delete-account` function; verify with a throwaway account.
3. Enable GitHub Pages; confirm both URLs load.
4. Fold `*.v2.ts` into the real service files; delete the `.v2` copies.
   - `leaderboardService.ts` → replace wholesale
   - `profileService.ts` → replace `updateUserStats`/`updateCategoryScore` call
     sites in `GameContext.submitAnswer` with a single `submitScore()`
   - `GameContext.loadUserData` → `getDailyUsage()` instead of
     `stats.questions_today`
5. Point `.env` at the new project (URL + anon key).
6. Update `PRIVACY_POLICY_URL` / `TERMS_URL` to the Pages URLs.
7. Update the Privacy Policy URL in **AdMob** (both GDPR and US States consent
   messages) and in **App Store Connect**.
8. Build, test signup → play → leaderboard → purchase → delete account.

Steps 5 and 6 are the actual point of no return. Everything before them is
additive and reversible.

---

## Open question: the AI gateway is still OnSpace

`supabase/functions/generate-question/index.ts` reads `ONSPACE_AI_API_KEY` and
`ONSPACE_AI_BASE_URL`. Question generation and answer evaluation — the core game
loop — still run through OnSpace's AI gateway on an OnSpace-issued key.

This was not in the migration brief, but the exit is not complete while it is
true: if that key is revoked when the account closes, the game stops working
even though the database is fully migrated.

Deciding this needs your input, so nothing has been changed. The work is small
once the provider is chosen — the function already speaks the OpenAI
`/chat/completions` shape, so pointing it at Anthropic, OpenAI or Google Gemini
directly is a base-URL, key and response-parsing change, plus making the
Privacy Policy name the real provider.
