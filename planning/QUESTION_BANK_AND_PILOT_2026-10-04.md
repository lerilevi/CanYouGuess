# Question-bank capacity and independent audit pilot

No generation beyond the approved pilot is authorized. No other reviewer's notes will be read before independent findings from real code and real output are written.

## Recommendation

Use an offline editorial pipeline: draft → structural/unit/rubric checks → reference/source verification → human approval → versioned published bank. Serve stable question IDs from the bank; keep accepted answers/references/rubrics private until evaluation. Record source URLs/as-of date, reviewer/status, category, country/geography, difficulty, locale, reference range/uncertainty and revision. Reject ambiguous, disputed, stale or guess-anchored items. “Model generated valid JSON” is not fact validation. Retire/quarantine bad items and provide a clear correction policy. Keep per-UID exposure history so selection can prefer unseen items without leaking answers. No automatic fallback to live Gemini when a bucket runs dry; use approved replays or an honest unavailable state.

Estimation fixes implemented in the integration contract BEFORE play: a positive finite reference, explicit plain unit, supporting steps and `relative-v1` are frozen at creation. Submitted numeric guesses never change the reference. Relative error divides by the actual reference (not `max(reference,1)`, which distorts sub-unit answers). Tests cover rubric boundaries/monotonicity. UI displays units. Zero/negative-reference questions are excluded initially; uncertainty ranges and logarithmic scoring are proposals for independent comparison, not silently introduced. Semantic verification still requires human/source review.

Trivia evaluation also needs quality scrutiny: aliases and fuzzy tolerance can accept a wrong proper noun. The pilot should dump exact answer variants and scores; structural acceptance is not editorial approval. Pilot observations can change the contract before banking hundreds of items.

## Realistic one-person review capacity

Plan on **20–30 approved questions/week**, not hundreds/week. Budget roughly **3–5 hours/week**: 4–8 minutes of source/ambiguity/unit/answer checking per candidate, plus rejection/rewrite and weekly regression sampling. Estimation/historical/country-specific questions often take longer. A pilot will measure actual review time and acceptance rate; these are planning assumptions, not measured throughput.

Start a closed beta with 80–120 reviewed items concentrated in World and a small My Country whitelist, plus transparent World fallback for unreviewed countries if approved. Grow toward **300–360 approved items in 10–18 weeks** at that cadence. All English-speaking adults may participate; country-specific content needs reviewed coverage rather than unchecked generation for every country. If all seven categories are essential on day one, allow the additional editorial time or reduce depth honestly.

| Inventory example | Coverage | Fast-player no-repeat horizon (15 delivered questions/day) |
|---|---|---|
| 120 total | Focused two-category beta; roughly 30/type/category if evenly split | 8 days mixed; a 60-item category lasts 4 days; a 30-item type/category lasts 2 days |
| 300 total | 240 global items = six global categories × two types × 20; 60 My Country = two types × 30 for ONE reviewed country | 20 days mixed only if that player can access every bucket; each global category 40 items ≈ 2.7 days; its selected type 20 ≈ 1.3 days |
| 360 total | 300 global = six categories × two types × 25; 60 country-specific items | 24 days mixed across all buckets; one global type/category 25 ≈ 1.7 days |

The 60 country items cannot cover all countries; each added country needs its own allocation. Free users accessing only World + their reviewed country have 100–110 items in the examples, not the whole 300–360 bank: roughly **6.7–7.3 days** at 15/day. At 30/day with rewarded ads, those horizons halve. An ad-heavy or category/type-focused player depletes a bucket faster. Deliberate learning/replays can be acceptable, but do not sell permanent freshness.

Publishing 25 approved questions/week supplies only 1.7 days of novelty per week for one 15/day player. Content is reusable between different players, so 1,000 users do not consume 1,000 copies of the bank; they do increase exposure/repeat expectations, delivery traffic and abuse pressure. A few-hundred-item bank is a practical CLOSED-BETA seed, not an unlimited-content launch plan. Economics should distinguish bank production/review cost from cheap serving, and estimate expected lifetime use before store copy promises “unlimited.”

Weekly review workflow: two 90-minute source-review sessions; one 60-minute ambiguity/scoring/alias check; 30-minute retirement/repeat-coverage review; leave 30–60 minutes for rewrites. Track approval rate, median review minutes, category/type/country deficits, served errors/reports and repeat rate. A small rotating pool with periodic approved replays is more feasible than pretending one reviewer can supply endless fresh content.

## Approved 28-question pilot and hard budget

Seven categories × two types × two samples = 28 structurally accepted questions, with one explicit country in the country bucket. Dump every candidate (including rejections), prompts, model/config versions, frozen reference/aliases, units, test guesses, deterministic scores, explanations, latency, token usage and calculated charge. These are real model candidates, NOT automatically published questions. The independent findings file must precede reading comparison notes.

`scripts/diagnostics/ai-pilot.ts` defaults to no-network/no-spend mode. Paid mode requires a locally stored, freshly verified hosted-config record and `GEMINI_API_KEY` via a secure process environment. Every provider attempt, including retries, must reserve worst-case cost before dispatch and append a durable ledger record. It stops at **$2 conservative liability or 80 attempts**, whichever comes first, even if fewer than 28 items are obtained. Timeouts/unmetered failures retain full worst-case liability; no “failed calls are free” assumption. A permanent exclusive run marker prevents a restarted process from resetting the $2 budget. Do not delete that marker to retry without accounting/approval.

The conservative attempt bound uses the actual model's input context limit and twice its full output limit, rather than assuming LOW thinking is a numeric cap. The runner requests 4096 output tokens, excludes thoughts from the parsed answer, and includes thinking in billable output accounting. No grounding/search/tool/cached-context surcharge is enabled. The preflight must verify model metadata/rates and model capability before execution. If this conservative bound cannot fit inside $2, stop and revisit the safe bound; do not relax the ceiling.

Current official standard pricing for `gemini-3.7-flash` is $0.75/M input and $3.75/M output including thinking through December 31, 2026; scheduled rates double January 1. This is ONLY a candidate estimate until the actual hosted override is verified. A 28-item run at roughly 1,000 input + 2,000 billable output tokens/item would calculate **$0.231**; 80 such attempts calculate $0.66. Real counts, failed-call liability and the actual model can change this. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [thinking/token limits](https://ai.google.dev/gemini-api/docs/thinking)

Status on October 4: budget/rubric tests pass; default runner makes no paid requests. **Actual model not yet verified; hosted access blocked. Actual pilot generation attempts: 0; measured pilot tokens: 0; pilot spend: $0; corpus: not produced.** Existing CLI login cannot access target project `kkwhbtgewxvsvmuozxok`. Need the owner to authenticate locally to that project; no keys should be pasted into chat. No $2 approval is exceeded or silently spent elsewhere.
