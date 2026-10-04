# Can You Guess? — decisions and proposed product contracts

Recorded October 4, 2026. This is a design document, not deployed behavior. The reward and competition proposals below need implementation, tests and any outstanding product approvals. No native batch or new build is authorized by this document.

## Approved decisions and current state

- Empty beta reset: no migration of real users, scores or purchases is required. Do not interpret this as permission to delete the old project or arbitrary test accounts now. At cutover, isolate/reset old-project session storage and test caches; require fresh signup; use disposable sandbox identities and keep real/sandbox entitlement handling separate.
- iOS delivery only for now; spend no Android builds. User IDs, reward ledgers, competition rules and API contracts remain platform-neutral. Platform/ad-unit/product mappings are configuration, not iOS constants in business rules.
- Keep the existing 15-free-question daily allowance as the baseline pending the contract review. One verified rewarded ad grants one bonus question. Remove the former three-bonus product cap from the target design. There is no player-visible daily rewarded quota.
- Reward value, technical abuse limits and ad cooldown are server-side configuration. Current product reward value is one; a later value change must also update the offer the player sees.
- Do not publish an unlimited lifetime-play promise until economics findings are written and the product promise is approved. Existing draft Terms still contain such wording and are not publication-ready.
- Target English-reading/writing players across countries. Age remains a separate decision; adults-only first beta is the recommendation, not an approved policy yet. Store/provider country availability and consent requirements still need verification before broad distribution.
- Build 19 remains untouched. On October 4, read-only checks confirmed its EAS submission finished, App Store processing is VALID and internal TestFlight state is IN_BETA_TESTING. Device direct-boot tests remain outstanding. October usage: 1/15 iOS builds, 0/15 Android builds.
- Backend commits ddfb7a0, 4c124c8 and dbdb6a2 have been pushed to onspace-exit-prep. integration/onspace-exit was created from bc0471c and merged with dbdb6a2 in cf64b0d. main remains 3472d82. Source merge is not backend deployment or client cutover; the .v2 services remain unwired.

## Reward contract

### Ownership and configuration

Keep all grants and consumption on the server. A client SDK callback, a local boolean, a device clock or a submitted reward amount is never authority to increase balance. The current adService.ts boolean/simulated development reward must not reach the production credit ledger.

| Server-controlled field | Target rule |
| --- | --- |
| free_questions_per_local_day | 15, using server time and the agreed timezone-change policy |
| reward_questions_per_verified_ad | 1; snapshotted when the offer/intent is issued |
| product_daily_reward_cap | null: no three-bonus or other daily product cap |
| ad_cooldown_seconds | Configurable; initial value decided with economics/UX review |
| technical limits | Intent/reward/request rate windows, concurrency, risk controls and spend ceilings; separate from product entitlement |
| rewarded_ads_enabled | Operational switch checked before issuing new offers |
| platform/ad-unit allowlist | Distinguish application, environment and provider; include Android mappings later without changing ledger semantics |

Version configuration and validate bounds. Only privileged server/admin paths may change it. Return the reward amount and cooldown deadline needed for truthful UI, not privileged credentials or internal anti-abuse thresholds. Never silently present an abuse/spend limit as AdMob no-fill. Check capacity before offering an ad; honor already-earned, valid rewards even if configuration or operational eligibility changes afterward.

### Proposed API and state transitions

Names are illustrative, not existing deployed endpoints.

1. An authenticated client requests a reward intent, with an idempotency key. The server checks current account state, consent-related eligibility, enabled units, cooldown, concurrent intents and technical capacity. It creates an opaque, high-entropy intent tied to that authenticated user, environment and allowed ad unit. Snapshot the reward/config version. Return intent ID, displayed reward, eligibility deadline and cooldown information. Do not embed an email, JWT or service secret in the ad metadata.
2. The client loads the allowed unit and sets the opaque intent in AdMob SSV custom_data. It shows the ad only after availability/consent checks. Enforce one active show flow. A repeated button tap must not create another credit opportunity or a second concurrent ad.
3. SDK reward completion changes local UI to verification-pending; it does not spend or grant a server credit. If SSV arrives first, the server balance is already authoritative and the UI may show verified immediately.
4. AdMob calls a dedicated callback endpoint. This one provider endpoint cannot require a player's bearer JWT; all client-intent/status endpoints still require real user authentication. Verify Google's signature against the exact original signed query bytes and trusted rotating keys before accepting fields. Check environment/ad-unit allowlist, provider reward settings, intent ownership and provider event time. Do not let unsigned client data select a recipient or amount.
5. In one database transaction, deduplicate by provider/environment/transaction ID, enforce one grant per intent, append the grant and mark the intent verified. Concurrent retries must yield exactly one grant. Valid duplicate callbacks acknowledge success without granting again; transient database failures remain retryable. A client cancellation or timeout alone must not invalidate a genuine earned reward. Assess timeliness using the provider event time and intent eligibility, with an explicit late-delivery/reconciliation policy—not a short UI polling timeout.
6. The authenticated client polls/subscribes to its own intent/balance with bounded backoff. A slow callback shows a persistent pending state with a safe way to return/recheck. Refresh after relaunch/login. Reward the original account if the device switches accounts; never credit whoever happens to be logged in when the callback arrives.
7. Question generation atomically reserves one allowance or earned credit along with an idempotent question request. Recommended charge unit: one generated question/session, not each guess. If no usable session is produced, release/refund exactly once. If the response was lost after successful generation, retry returns the existing session without charging again. Evaluation remains once-per-session and does not consume another bonus.

Proposed credit retention: verified unused bonuses survive relaunch and local midnight; no undisclosed daily expiry. Account deletion voids the deleted identity's pending state without recreating that account from a late callback. Final retention/expiry rules must be explicit before implementation.

Google documents signed reward callbacks and custom data; waiting for SSV is an intentional choice here because credits authorize paid AI work. [AdMob SSV](https://developers.google.com/admob/ios/ssv)

### Failure behavior and acceptance tests

- No-fill/loading failure: zero reward and zero allowance charge; show "No ad available right now", preserve question/game state, offer a user-triggered retry or another available route. Do not loop automatic ad requests.
- Early close: no grant unless the provider confirms reward eligibility. Completion plus delayed SSV: pending, not a fabricated success or permanent failure.
- A technical cooldown has a server deadline; show an accurate retry time. A genuine safety pause has its own temporary-unavailable state, not a made-up daily cap.
- Lost connection, killed app, webhook-first delivery, delayed retries, account switch, concurrent callbacks, reused transaction/intent, wrong unit/environment, tampered signature and key rotation all need tests.
- Sandbox/test grants are isolated from production. Development mocks cannot mint production credits; use provider verification tools and a private test ledger, then confirm the physical-device path.
- Entitlement lookup failures are "unknown/retry", not proof that a paid user is free. Purchase/restore/refund reconciliation remains separate RevenueCat work.

### Economics gate

No daily product cap is a product decision, not a guarantee of limitless AdMob availability or affordable generation. Measure generation AND evaluation costs, retry/failure cost, net rewarded-ad revenue and fill by country, unused-credit liabilities, provider ceilings and worst-case bursts. Model both ad-funded use and long-lived paid users. Capacity/credit commitments need a kill-switch/reconciliation plan. Consider validated shared question packs/cache reuse before promising individually generated unlimited play. No pricing/copy changes or AI spending were executed in this planning pass.

## Leaderboard contract review — recommendation, not implemented

### Independent code finding

The current 0003_leaderboard.sql sums points for daily/weekly windows, uses user_stats.total_score for all-time, compares each user's own local day, and implements weekly as a rolling seven-local-day window. Those are not a common competition period. With extra ad-funded or paid questions, raw totals reward opportunity volume. This finding comes from the real SQL; it is not a completed question-quality audit or a claim based on generated samples.

Do not substitute "best N" scores from unrestricted play: extra attempts still buy more chances to select high scores. An unrestricted average also needs minimum participation and protections against cherry-picking, abandonment and easier question selection.

### Separate practice from competition

Recommend one fixed daily ranked challenge per account, equal opportunity for free, ad-funded and paid players. Prototype K=10 questions with a fixed difficulty/category blueprint; K is a proposal, not approved product scope. Extra practice is playable through the reward/paid routes but cannot increase ranked attempts or replace low results. Starting a ranked run commits the opportunities; skipped/abandoned ranked items count as zero. No rerolls or "best run" selection.

This is a new product mode and needs approval. Decide whether ranked questions reserve part of the existing 15 free allowance, or receive a separate free budget. A separate allowance raises AI cost; consuming all free practice first must not force someone to buy/watch ads to compete. Do not silently implement either option.

Ranked packs should be pre-validated and equivalently difficult. A global pack uses shared country-neutral content; country-specific packs belong on separate comparable country boards, not an uncalibrated global comparison. Audit answer sharing, difficulty/type scoring differences and pack drift. Server-issued challenge/session IDs bind the frozen rules; the client cannot select ranked difficulty, period or reference answer.

### Shared periods and ranking

| Board | Proposed ranking and period |
| --- | --- |
| Daily | Fixed challenge score, normalized to 0–100 over K committed opportunities; one run per UTC date, 00:00–00:00 |
| Weekly | Equal-weight mean of the seven daily challenge scores in Monday 00:00 UTC–next Monday; a missed day is zero; no extra-question points |
| All-time | Lifetime average of daily ranked challenge scores in one comparable rules version, with a proposed 20-day qualification threshold; below it, provisional/unranked. Include every committed day, not only best results; show sample size and audit uncertainty before choosing the final formula |

All-time measures long-run performance, not summed practice points; it is NOT a rolling window mislabeled all-time. Minimum-day threshold and uncertainty handling need simulation with real score distributions. Weekly consistency is deliberately rewarded; spending or extra ads are not. Equal scores share rank. Do not break ties using number of ads, paid status or fastest network/device response.

Use server UTC timestamps and immutable period IDs. An explicit bounded completion grace permits a run started before close to finish in its original period; freeze final standings only after that grace. Do not assign an old run to the new day because its answer arrived after midnight. Localize the displayed reset/countdown for each player, but do not change the ranked window with timezone/country edits. Personal streaks and the free allowance can still use a validated local-day policy independently.

Version ranked rules/packs/scoring. Do not compare different scoring regimes as one lifetime table without calibration. Country boards filter the same competition cohort; define country-change eligibility to prevent hopping between weak boards. Do not use IP geolocation as infallible identity or force it on every launch.

This global UTC proposal gives everyone the same 24-hour entry period, not an identical local sleep schedule. Beta must check whether that is understandable and accessible across timezones. Tests: DST/travel, late completion, Sunday/Monday boundaries, identical rank ties, incomplete days, replay/concurrency, first-day qualification and zero-score inclusion. A committed zero result must count toward participation/denominators rather than disappear because current SQL filters score > 0.

## Empty beta cutover and implementation gates

- Preserve the old backend as rollback evidence; no destructive cleanup is approved now.
- Select a clean beta/test identity namespace; invalidate old-project client sessions and per-device usage/consent/entitlement caches deliberately. Reset decisions do not justify trusting sandbox purchases in production.
- Add future contract changes in new migrations/function versions. Do not rewrite already-applied 0001–0005 and assume the hosted database changed.
- Rerun local/hosted access-control checks, concurrency/idempotency tests and device identity tests after implementation. Today's merge validation is diff/syntax inspection, not a new hosted database verification.
- Obtain approval for the native batch list before any development/TestFlight build. Candidate items remain expo-dev-client, compatible Sentry, expo-updates and necessary ad configuration—not a broad pruning/SDK upgrade.
- Preserve independent-first audit: freeze code/backend/model, generate actual text evidence under an approved spend cap and write findings before external reviewer notes. No generated sample corpus was produced today.

## Remaining decisions

Age policy; ranked-mode/allowance approval; initial cooldown/technical ceilings; model/audit spend cap; lifetime product economics; domain purchase/provider/data-region setup; native batch approval. Domain and iPhone instructions are in EMAIL_AND_IPHONE_SETUP.md. Build 19 device results are the immediate next gate.
