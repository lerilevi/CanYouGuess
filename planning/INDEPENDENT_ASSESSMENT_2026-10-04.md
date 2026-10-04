# Independent assessment — identity isolation, accounts, days and question supply

October 4, 2026. Based on the actual client/provider/service and target SQL/function source, an offline reproduction using that source, the user's physical-iPhone results, and the linked primary documentation. This is not a completed question-quality audit: no actual AI sample corpus has been generated yet, and no external reviewer's game/question/scoring notes were consulted.

No production fix, backend deployment, auth/provider configuration change, native dependency change, EAS build, purchase or paid AI request was performed in this investigation. Build 19 is untouched. Diagnostic fixtures are explicitly synthetic, not evidence of question quality. Changes in this working tree are documentation and an offline diagnostic only.

## Decisions and evidence status

- Adults-only (18+) first beta is approved. Add an age declaration and appropriate onboarding/privacy treatment before external beta; a declaration is not verified age or a substitute for privacy/consent safeguards. Broad English-speaking country eligibility still requires store/provider availability review.
- Ranked mode is postponed until after the independent idea comparison. All challenge/ranking designs below are comparisons, not implementation scope.
- Native batch is not approved. No development or TestFlight build is authorized here.
- Domain purchase and email-signup choice are on hold until the identity decision.
- User-tested physical iPhone, TestFlight build 19, old backend: direct boot, five force-quit launches, generation and non-premium paywall passed. This supports the calendar-removal startup fix; it does not clear identity isolation, monetization or the new backend.
- October usage last authenticated on October 4: 1/15 iOS, 0/15 Android. This investigation used zero builds and zero AI dollars.

## 1. Account-switch defect — reproduced; block external beta

### Cause

`app/_layout.tsx` mounts one GameProvider for the lifetime of the application, outside the individual logged-in screens. Changing AuthProvider's user does not remount or reset it. `contexts/GameContext.tsx` retains `phase`, `currentQuestion` and `currentResult`; `loadUserData()` refreshes some stats but never clears those three values. Profile logout signs out of RevenueCat and Supabase without resetting game state. ResultCard renders the retained `currentResult.userAnswer`.

This is principally shared in-memory game state, not a persisted-answer key or proof of a purchase transfer. The offline reproduction needs no purchased account at all. It executes the real GameContext with React 19 and the installed reconciler, mocking only storage/native/network boundaries. No simulator or second physical-device session was claimed.

Run: `node scripts/diagnostics/account-switch-repro.cjs`. Captured output: [offline evidence](evidence/account-switch-repro-2026-10-04.json).

| Controlled source-level test | Observed result |
| --- | --- |
| A answers, logout, B login, B data reload | B stats loaded but phase remains result and visible answer is A's |
| A earns a mocked reward and accepts AI-game notice, then B loads | B inherits bonus=1 and notice=true from global storage |
| B's stats request returns no data | A's stats and usage count remain visible |
| A's stats request resolves after B's reload | A overwrites B's stats and usage count |
| A's generation resolves after switching to B | A's question enters B's UI |
| A's entitlement refresh resolves after B's | B becomes paid in the controlled JS race; this is not a live RevenueCat transfer test |
| Auth-to-RevenueCat sync occurs before SDK initialization finishes | logIn is skipped, with no queued retry |

### Proposed repair — not applied

1. Establish one auth identity transition mechanism. Hide/clear the departing user's UI immediately, before asynchronous logout can fail or finish. Reset/remount all user-owned providers and route-local drafts/modals using the stable Supabase UID plus an auth generation; clear them on logout, deletion and backend-project cutover, not only on a successful login.
2. Bind every request to its originating UID/auth generation. Cancel where supported; otherwise discard obsolete results. Guard UI, persistent writes, rewards and follow-on requests. A keyed provider alone is insufficient: an old async closure can still write shared storage or initiate a server mutation after unmount.
3. Store user cache entries under project + UID + schema version. Reject a cached payload with the wrong owner. Never load A's defaults when B's fetch fails: use B-specific loading/error state. Migrate/delete known old global app-cache keys deliberately, not all AsyncStorage.
4. Make the server own usage, reward credits and question sessions. Bind each session to its UID, question/rubric version and idempotency key. Reject another UID's answer/replayed finalize. Reconcile pending A operations without displaying or granting them to B.
5. Serialize RevenueCat configuration, identity sync and customer-info refresh. Purchase state is unknown during the transition; don't expose A's paid state to B or treat a temporary failure as proof that a paying user is free. Ignore stale customer-info responses. Do not run independent root/profile logOut calls concurrently.

Regression gate: A result -> logout -> B; A in-flight generation/evaluation/profile/ad/purchase -> B; failed/slow auth; A -> B -> A; restart; missing B stats; anonymous -> linked same UID; deletion; backend cutover. Assert no A answer, badges, counts or entitlement appear in B, and no stale operation mutates B. Physical restore/transfer must be tested separately with the selected RevenueCat policy.

### Storage and state ownership inventory

| Data today | Correct ownership / treatment |
| --- | --- |
| Game phase, current question/result, answer drafts, stats, badges, new-badge modal, category preference, cached user rank | UID-scoped state; clear on identity transition; guard asynchronous completions. Profile/category/leaderboard screens also contain unguarded async setters |
| `@canyouguess_guest` | Legacy local guest stats/usage. Replace with a real anonymous UID and server records; never promote arbitrary local counters into authoritative allowances |
| `@canyouguess_bonus` | Global local-date/count; reproduced crossover. Replace with server verified reward/consumption ledger, cached only per UID |
| `questionsToday`, user_stats and streak | DB rows are already keyed by UID, but retained UI and late responses leak. Product allowance/reservation must be atomic/server-owned, not trusted client increments |
| `@canyouguess_consent` | AI-game notice, NOT UMP. Per-UID and notice version if it records that player's acknowledgment; an age/policy acknowledgment also needs deliberate ownership/versioning. Categories currently sets this true implicitly |
| ATT / AdMob UMP | OS/provider privacy state belongs to the device/SDK context, not a copied player bonus/AI-notice boolean. Reevaluate through the provider when required; don't blindly erase or re-prompt on every logout. UMP's initial consent flow is still absent |
| `@canyouguess_question_history_v1` | Shared recent-question history; no UID/country namespace. Seen-item history should be per UID and question/version; shared immutable content cache is fine if it contains no private attempts/answers |
| `@canyouguess_country` | IP/location cache can be device-scoped with freshness metadata. Explicit profile country/timezone is UID-owned. A device's old cached location is not reliable authority for B's identity or competition country |
| `@canyouguess_onboarding_v1` | Device UX/tutorial completion may remain shared. It must not stand in for a different user's age or policy acknowledgment |
| `@canyouguess_last_fatal_error` | Device diagnostic record may remain shared, with PII redaction/retention controls and correct attribution; do not label A's report as B's private history |
| Supabase auth session | Project-scoped credential; persistent native storage currently uses AsyncStorage. Review a secure-storage adapter without resetting identities accidentally. Never delete the anonymous session merely to clear game caches |
| RevenueCat SDK identity/customer info | Stable Supabase UID, including anonymous users; ordered initialization/sync/refresh. Receipt/restore identity is separate from Supabase game history |

Further access-control finding: the home flow checks the 15-question gate, but the Categories path starts a question without that same gate. That is another reason a UI-only allowance is not protection against AI spending; the server must enforce the reservation in every path. No live bypass request was made.

## 2. Accounts — recommend guest-first, recoverable identity

### Recommendation

Remove mandatory email registration from first play, not identity itself. Create an anonymous Supabase auth user behind a signup CAPTCHA, give it a persistent UID, and make nickname an editable display field. Offer account linking/recovery later. Explain the limits of an unlinked guest clearly; recommend linking before purchase and before expecting cross-device history. For a long-term paid launch, either require a recoverable identity before purchase or explicitly accept entitlement-only restoration and lost guest history. That product decision must not be hidden in Restore Purchases copy.

An anonymous auth user is not the anonymous API key: it has a real auth UID and authenticated-role access. RLS must use that UID. Deleting the local session, reinstalling, logging out of an unlinked guest or using another device can lose access unless it was linked. Supabase recommends CAPTCHA/Turnstile protection and documents no automatic anonymous-user cleanup. [Anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous)

### Contracts and risks

- **Allowances/rewards:** key balances, reservations, finalized sessions and verified reward intents to UID, never nickname, device alone or a client-supplied user ID. A same-UID upgrade keeps its ledger. Linking to an already-existing account needs proof of control of both identities plus an explicit atomic merge policy: do not blindly sum free allowances, scores and bonuses to farm value. A merge cannot mint a second reward from the same provider transaction.
- **CAPTCHA:** fetch a Turnstile token from a controlled HTTPS page/browser/WebView and pass it as `captchaToken` to signInAnonymously. Configure the secret in Supabase Auth, where it is verified; do not consume the single-use token with a separate verifier and then submit it to Supabase. Existing react-native-webview is installed, but the native UX/error path still needs testing. Hosted CAPTCHA origins do not necessarily require buying an email domain. [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [mobile Turnstile](https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/), [server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- **Recovery/linking:** preserve the same UID on a supported upgrade to email or OAuth. Do not silently replace it with a fresh user. Anonymous-to-existing-account collision handling is extra work. Prefer a provider-neutral identity model; Apple login may suit current iOS recovery, but backend data cannot assume everyone has an Apple ID. If email linking remains available later, SMTP/domain work still exists then. [Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- **Abuse:** one UID is not one human. A person can mint guests, clear storage, use VPNs or buy CAPTCHA solves; email accounts also do not prove uniqueness. Server request/concurrency limits, signup/IP risk controls, atomic reservations, spend kill switches and observability remain necessary. IP-only limits punish shared Wi-Fi; invasive fingerprinting introduces privacy/false-positive costs. Anonymous signup can grow the auth DB indefinitely. Cleanup must preserve active identities, payers, unspent credits and any required transaction/audit records, not delete by age alone.
- **Nickname/leaderboard:** use opaque IDs underneath, normalize/case-fold visible names, cap length, handle confusable/invisible Unicode, reject impersonation/profanity/PII, rate-limit changes and retain moderation history. Prefer a non-unique display nickname with a safe discriminator over pretending a globally unique nickname proves ownership. Add report/mute/hide and moderator removal/support paths before public boards. Treat public nicknames as user content; 18+ does not remove moderation needs. Ranked mode remains postponed and anonymous multi-account farming will still matter when revisited. [App Review guidelines](https://developer.apple.com/app-store/review/guidelines/)
- **RevenueCat identity:** configure/logIn with the canonical Supabase UID even when that UID is anonymous. RevenueCat's generated anonymous ID is a different identity; don't confuse it with Supabase's. Never use nickname/email as the purchase ID. Link in place where possible. [Identifying customers](https://www.revenuecat.com/docs/customers/identifying-customers)
- **Restore Purchases:** it can recover entitlement, not necessarily the original Supabase scores, streak, credits or history. RevenueCat's documented default transfers a receipt to the new App User ID; that can move access from A to B. “Transfer if no active subscriptions” does not protect a lifetime non-consumable. Keeping purchases with the original UID can strand an unlinked guest after reinstall. Choose/test the policy explicitly and reconcile store environment/transaction ownership through server events. Do not expose the prior owner's private history just because the same Apple receipt appears. The current dashboard policy was not inspected; the offline paid-state race does not prove a live transfer. [Restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
- **Deletion:** automatically created guest accounts still need in-app account deletion. Delete/anonymize user data according to the agreed retention policy, explain retained financial/fraud records where necessary, revoke linked-provider credentials as required, and do not imply deletion refunds a purchase. Losing a token is not deletion. [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- **Privacy and beta reach:** no email does not mean no personal data. Auth IDs, IPs, purchases, nickname, gameplay and provider consent still need disclosures, access controls and deletion. Avoid full birth-date collection if an age declaration is sufficient for the chosen beta policy. Check territorial/provider support before “all countries” distribution. Keep Gmail as support while the domain decision is paused.

### Relative effort (engineering estimates, not new approvals)

| Option | Benefit | Main liability | Incremental effort after common server contract work |
| --- | --- | --- | --- |
| Mandatory email/OTP | Familiar recovery/cross-device history | SMTP, OTP/deep-link/recovery/change-email UX; signup friction | About 3–5 engineering days plus deliverability/device QA |
| Anonymous + nickname only | Fastest first-play UX; no auth email | Lost history/identity and ambiguous paid recovery; easier repeated free budgets | About 3–5 days for a safe beta path, including CAPTCHA, deletion and isolation; not just one Auth call |
| Anonymous + later linking/recovery | Guest-first onboarding without permanent disposable identities | All guest protections plus collisions, restore ownership and recovery UX | About 6–10 days total; more QA than email-only, not a shortcut |

Allowances, SSV reward ledger, purchase webhooks, age/privacy treatment, moderation and the isolation repair are common prerequisites and are not included in those estimates. Native changes may be needed for a chosen recovery provider; include them only in a separately approved batch. No build is needed merely to decide this model or implement server contracts.

## 3. Daily reset and future competition

### Important correction to today's behavior

Build 19 still imports the old `services/profileService.ts`. Both logged-in usage reset and streak comparisons use `toISOString().split('T')[0]`, hence UTC, with a client-driven DB reset. Only the legacy local guest/bonus storage uses the device's local date. The target `0002_scoring.sql` does implement server-side IANA timezone/local dates, but the client is not cut over and its timezone setter only validates the zone: it has no cooldown/grant anti-hopping policy. Current target daily usage counts finalized scores, not atomic admission reservations. “Local midnight already works everywhere” is therefore not supported by this source.

### Recommended free allowance/streak contract

Use server time plus an account's validated IANA timezone, never a client-supplied date or fixed UTC offset. DST can make a local day 23 or 25 hours. Snapshot the timezone/day when issuing an allowance or session; maintain an idempotent, monotonic grant ledger so revisiting a prior date or changing zone cannot mint fresh budgets immediately. Zone changes affect a future reset boundary under a server-configurable travel/cooldown policy; don't instantly recalculate all allowance history in the new zone. Test travel, DST, offset extremes, backward/forward device-clock changes and an app left open across midnight. Country is not a timezone.

Streaks should count accepted play days under that policy, not duplicate grants or incomplete fetches. Preserve earned ad credits in their own ledger; their expiry is a separate, explicit product decision, not an accidental midnight deletion from an old local bonus cache. This policy also needs anonymous-recreation abuse limits; a timezone cooldown alone cannot prove one human.

### Future ranked comparison — not approved or implemented

| Dimension | Shared UTC day | Date-keyed challenge with each user's local day |
| --- | --- | --- |
| Entry window | Same 24 hours, UTC 00:00–00:00 | Each player gets 24 local hours; the same date spans about 50 hours worldwide |
| Calendar UX | Simple shared countdown; reset can be awkward locally | Natural local-midnight ritual; public close/finalization is later than many users expect |
| Fairness | Same release/close for everybody; local sleep schedules still differ | Equal duration but unequal advance information; late zones can see early-zone answers before their own start |
| Spoilers | Possible during the shared 24 hours | Stronger exposure: spoilers can circulate for roughly a day before late-zone opening; private packs reduce this but need difficulty calibration |
| Timezone hopping | No additional ranked opportunity from zone edits | Freeze eligibility timezone/window and enforce one attempt per challenge ID/UID; edits must not unlock extra date IDs early |
| State/results | One active period plus bounded completion grace | Overlapping date challenges, per-user eligibility, provisional results, late global finalization and more complex weekly close |
| Effort | Lower; about 2–4 days for period/eligibility/finalization plumbing + tests | About 5–8 days for that plumbing + tests; not the whole ranked-mode implementation |

Offset arithmetic: for date D, UTC+14 starts at D−1 10:00 UTC; UTC−12 ends at D+1 12:00 UTC: a 50-hour envelope. Consecutive date envelopes overlap 26 hours. This does NOT mean every player receives 50 hours. Restricting supported inhabited timezones or adding completion grace changes the actual bound; calculate from the supported zone set. Standings for D cannot be final merely because the first country's midnight has passed.

My preference for meaningful shared competition is a UTC period, independent of local free allowances/streaks. For a casual daily puzzle where local ritual and sharing matter more than strict competitive integrity, the date-keyed design is defensible. Neither defeats bots, alt accounts or off-app answer sharing. Decide the game idea first, then ranking/windows; do not implement a daily mode merely because a reset policy was selected.

## 4. Question architecture — validated bank first

### Independent code finding

The target generate-question function has seven categories and two types, not a three-difficulty contract. Trivia sessions store private accepted answers and are graded deterministically. Estimation sessions do not freeze a numeric reference at generation: evaluation calls Gemini with the question AND the player's guess, then scores against the returned estimate. That permits a shifting/guess-conditioned baseline; the lack of a fixed reference is an architectural finding, not proof that any particular generated answer was wrong. The existing client is still on the old backend contract.

### Recommended pipeline and serving model

1. Generate candidates off the gameplay path. Store question text, hint, category/type, English locale/country scope, prompt/model/version and provenance. Distinguish factual estimation with a sourced/as-of numeric reference from Fermi estimation with explicitly approximate assumptions/rubric.
2. Validate schema, units, finite numeric values, answer aliases, contradictions, exact/semantic duplicates, ambiguity, freshness and factual sources. A second model agreeing is not validation. For the initial beta, human-review published content; use pilot results to decide what can later be automated.
3. Publish an immutable approved question version with the reference/rubric and scoring version fixed BEFORE a player's answer. Keep answer keys private server-side; do not ship the bank's answer payload to the app. Store structured explanations so standard scoring needs no runtime LLM.
4. The server atomically reserves a free/paid/reward opportunity and assigns an approved item into an owner-bound session. Repeated requests return the same reservation/session; failed supply does not consume a question. Per-user seen IDs/versions guide reuse; genuinely equivalent variants count as repeats. Finalization consumes once and returns authoritative stats.
5. Serve by catalog query/cache, prefetch only safe public payloads, and track inventory by category/type/country. Replenish before exhaustion; retire stale questions with versioning. If fresh stock is empty, offer an explicitly labeled repeat/practice choice or another available category; don't silently generate an unvalidated live replacement.
6. Keep practice serving and a possible future ranked pack assignment separate. No ranked design is being implemented now. Record coverage/failure/latency and per-approved-item cost, including rejected candidates and review effort.

This shifts AI/provider limits and most generation failures away from the user, lowers repeat-use costs and stabilizes scoring. It does not remove DB/serving cost, reward abuse, scraping or content-quality responsibility. Bank reuse also makes answer sharing easier. Offline generation can later use Gemini Batch, currently priced below synchronous calls, but its target turnaround is not a guaranteed delivery time; do not depend on just-in-time replenishment. [Batch API](https://ai.google.dev/gemini-api/docs/batch-api)

### Pool size — a coverage estimate, not an approved generation order

Measure a no-repeat horizon by content bucket: `approved stock >= daily draws in that bucket × horizon × reserve factor`. Player count affects serving load and aggregate exposure, but does not multiply the needed content stock when players reuse approved items. Category preference and country coverage matter more than headline DAU.

Initial small-beta inventory proposal: **3,000 approved global questions**, split across six global categories × two types × 250; **300 additional approved questions per supported My Country pool**, split 150 per type. Aim for a 25% stock/replenishment reserve (3,750 global, 375/country) once consumption is measured. Four supported country pools would put the initial, pre-reserve inventory at 4,200. Allowing English speakers globally does not require pretending every country has a validated local pack; offer country-neutral content where local stock is unavailable.

Limits of that proposal:

- 3,000 global questions is 200 days at 15/day if play is distributed across all global buckets, but just 30 days at 100/day before reserve.
- One 500-question category lasts roughly 33 days at 15/day; one 250-question category/type bucket lasts only about 17. A 300-question country pool lasts 20 days at 15/day if used exclusively.
- For a 30-day no-repeat guarantee at 15 questions/day entirely in ONE bucket, stock needs about 563 per bucket with 25% reserve. At 100/day, it needs 3,750 per bucket. No finite small bank guarantees no repeats for unlimited ad-funded play forever.
- Targeting roughly 200 separate country pools would need about 60,000 country questions even at the modest 300-per-country level. Start with explicit coverage, not “global” marketing that implies this inventory exists.
- These are APPROVED items. Rejected/duplicate candidates inflate generation needs; measure the pass rate first. Human verification is likely the bottleneck: 3,000 items at an illustrative 2–5 minutes/item is 100–250 review hours, before country coverage. Do not promise a huge validated bank based on cheap token pricing alone.

### Proposed independent pilot — awaiting spending approval

Start with **28 real questions: seven categories × two types × two examples**, plus one recorded answer/score/explanation for each and deterministic edge tests where possible. Rotate My Country contexts within the available cells; this is a balanced diagnostic sample, not statistical proof of global coverage or quality. Freeze which deployed/source backend and model is being measured; keep old-backend samples distinct from target-contract samples. Preserve the original raw output, rejected/errors included, before filtering or rewriting it.

At the inspected target default `gemini-3.7-flash`, standard published rates on October 4 are $0.75/M input and $3.75/M output INCLUDING thinking. The actual hosted model override has not been checked; no model upgrade is proposed. Google lists higher rates from January 2027, so lifetime economics must not assume the current promotion lasts indefinitely. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

Planning assumptions: generation 1,000 input + 2,000 billable output/thinking tokens; evaluation 500 input + 2,000 output/thinking. Target trivia grading is deterministic: 28 generation + 14 estimation calls = 42 provider calls, roughly 35k input / 84k output and **$0.34**. If the measured old-backend path requires all 28 AI evaluations, the same estimate is 42k input / 112k output, **$0.45**. Neither is a measured bill. Retries, long reasoning and malformed answers add cost.

Propose a **$2 Gemini ceiling**, maximum **80 upstream attempts including retries**, no automatic top-up, no grounding/tool charges and no mass generation. Before running, implement a dedicated bounded audit runner: verify the actual model/rate, limit input, enforce a compatible output-plus-thinking ceiling, meter every attempt, reserve worst-case next-call cost and stop before the ceiling. The current function has retries but no explicit output-token cap or usage logging, so it cannot itself promise that budget. If a safe combined token bound cannot be verified for the existing endpoint/model, reduce the attempt count or stop for approval; a billing alert is not a hard limit. [Token counting](https://ai.google.dev/gemini-api/docs/tokens), [thinking/token limits](https://ai.google.dev/gemini-api/docs/thinking), [generateContent parameters](https://ai.google.dev/api/generate-content)

Export actual questions, reference/accepted answers, player guesses, scores, explanations, model/function/rubric versions, token counts including thinking, latency and failures as text/JSONL. Write independent findings FIRST; only then ask for another reviewer's notes. The synthetic account-switch fixtures do not satisfy this corpus requirement. Approval for this pilot is not approval to generate the production pool, change the live scoring system or build ranked mode.

## Next gates

1. Approve an identity-isolation implementation separately from this diagnosis, then run the offline regression and a real-device A/B test through the approved development-client plan. Do not spend a release build just for a speculative resetGame() patch.
2. Decide guest-first/recovery/purchase policy; email/domain remains on hold. Keep native batch unapproved until auth recovery, UMP, reporting, development client and updates requirements are enumerated.
3. Approve or change the $2/28-question pilot scope. Confirm the test backend/model/account securely; do not paste administrative keys into chat. Generate no paid samples until approved.
4. Compare game ideas independently before revisiting ranked mode. Keep free allowance/streak local-midnight work separate from shared competition design.

Recorded artifacts are local and uncommitted at the end of this investigation; no new GitHub push was performed.
