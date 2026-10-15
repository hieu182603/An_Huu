# Allocation risk P2 — 16/10/2026

Implementation: `src/modules/allocation-risk/`. This is a separate read-only analysis surface. It never changes the retirement preview DTO, stored snapshot, inputHash, current plan, actual ledger or replay implementation. ADMIN publication creates a selectable market version only. No production market dataset is shipped.

## Data and approval

`modelCode = monthly-total-return-data-v1` in the existing `assumption_set_versions` table. No migration. Global version numbering remains shared with assumptions and portfolio policies. Workflow follows the portfolio document workflow: DRAFT → APPROVED → PUBLISHED, expectedRevision CAS, audit, immutable approved/published data, canonical approval hash verified on reads. Create a new draft to change approved data. Source license evidence is an ADMIN attestation, not automatic verification of a vendor contract.

The document declares nominal VND monthly **total** returns (including distributions), CPI month-on-month changes, decimal fractions (`0.01` = 1%), currency, source URL/retrieval date/license/usage rights, per-column source, total-return evidence, fees and tax treatment, exact period and quality review. `NET` returns are used as supplied; `GROSS` requires an explicit approved `monthlyDrag` deducted in decimal points, once. No arbitrary automatic annual fee assumption. Advisory fees remain a separate personal service. Data in foreign currency must be converted by ADMIN before publication, with methodology evidence; the pure FX helper uses VND per foreign unit.

Quality gates reject duplicate/discontinuous/out-of-order months, missing/extra columns, missing license, unknown source IDs, nonfinite values and monthly factors ≤ 0. No imputation, no zero replacement. Records contain 12–2400 complete months and 1–20 asset classes. Approval rejects current/future unclosed historical months and future retrieval dates. Selecting a missing, draft, approved-only or future-effective version returns DATA_REQUIRED. Omitted marketVersionId selects latest published/effective version; responses expose the actual ID/hash, and repeat requests should explicitly pin that ID.

ADMIN routes under `/api/v1/admin/market-data`: GET/POST collection, GET/PATCH `/:id`, POST `/:id/validate`, `/:id/approve`, `/:id/publish`. Approval body: `{expectedRevision, confirm:true, reviewNote}`; publication: `{expectedRevision, confirm:true}`. This deliberately mirrors portfolio approval, without an assumptions-style impact token: no existing plans reference this new model and publication does not reapply plans. Reads and listing never resolve another modelCode as market data.

## Simulation and selection

USER POST `/api/v1/me/retirement/risk/simulation`, `/scenarios`, `/selection` receive `{plan, marketVersionId?, paths?}`. `plan` is either `{kind:'PREVIEW', preview:<existing retirement request>}` or `{kind:'SAVED_VERSION', planId, versionId}`. Saved version ownership and snapshot integrity are checked by the existing PlansService. No request can supply return arrays, CPI, seed, alpha, threshold, block length, target weights or policy overrides. The POST is read-only. The published dataset gate applies to scenarios as well.

Simulation uses non-circular moving blocks: a uniformly selected start followed by 12–36 consecutive observations; one index selects the entire asset/CPI vector. Seed 20261016 belongs to versioned algorithm `allocation-risk-v1`. No recentering, fitted synthetic history, interpolation or backfilled zeros. The policy selects the block length. Holdings drift between the existing scheduled rebalances/glide transitions; turnover follows the existing half-L1 convention and approved cost. Initial purchase costs remain excluded, as disclosed by the existing engine.

Pinned declared income, pensions, debts, explicit contribution schedules and capital injections are preserved. Only retirement living expense is CPI-indexed, consistent with the existing monthly preparation. Household contribution capacity and fees are recomputed on each path. The path calls the existing v3 monthly kernel and reads **fundedClosingBalance/unfundedWithdrawal**, never the signed hypothetical gap trajectory. Earlier unmet withdrawals are accumulated permanently; later capital cannot erase them. V2/v3/v4 replay files are untouched.

For each month, essential spending receives priority exactly as in P1-7. The loss is the sum of unmet essential withdrawals divided by that month's opening CPI index. The first full month uses index 1, matching current living-expense timing. `pEssential` counts paths with zero essential loss in **every** month; it is not a terminal-target or all-spending success rate. CVaR uses the empirical expected-shortfall expression `min_eta eta + sum(max(L-eta,0))/((1-alpha)*N)`, including fractional probability mass at the quantile. Zero losses stay in the distribution. Wilson intervals use 95% confidence and describe simulation sampling uncertainty, not market/model uncertainty.

Monthly p10/p50/p90 are quantiles of funded balances in today's VND. Display money is rounded to VND 1 million and probability to whole percentage points. Selection uses unrounded results. Disclosures include sources/licenses/period/history length/path count/seed/block/model/dataset and policy hashes. These are historical resampling estimates, not forecasts or guarantees.

Candidate generation uses BASE and ± approved equity step, transferring the opposite weight to the deposit asset named by lossStress at every glide position. Reject negative/non-100% weights and any monthly target violating the P1-6 loss constraint. Missing tolerance/capital/shock coverage yields REVIEW_REQUIRED, not a feasible candidate. Keep candidates with raw pEssential ≥ approved threshold; choose minimum CVaR, then smallest absolute equity shift from the base path (half-L1 per month). Same seed/indices across candidates. No Sharpe optimization. None pass → INSUFFICIENT plus P1-8 contribution/retirement/spending adjustments. These adjustments are deterministic P1-8 suggestions; rerun stochastic evaluation after choosing one.

Bounds: 500 paths/request, 200000 candidate-path-months total, 10 seconds for numerical simulation, six risk requests/minute/IP, one active run/user and two/process. Paths yield between iterations. Exceeding a bound returns LIMIT_EXCEEDED, with no partial probability/CVaR. DB reads are outside the numerical deadline. A single synchronous monthly path is checked at path boundaries; this is a cooperative deadline, not worker-process hard preemption. All samples must complete before any statistic is returned.

## Eight deterministic stresses

All numerical parameters are optional fields of the approved schema-v2 `allocationRisk.stresses`; missing configuration returns REVIEW_REQUIRED per scenario. The scenarios use pinned deterministic annual assumptions, not fabricated market observations. Offsets are relative to the retirement month. Windows must fit the plan.

| Kind | Approved parameters and operation |
|---|---|
| HIGH_INFLATION | offset, duration, annual CPI delta points; convert adjusted annual CPI back to monthly factor |
| EQUITY_CRASH | offset, asset class, one-time percentage shock, multiplicative with monthly return |
| RATE_RISE | offset, asset class, modified duration in years, yield-rise points; first-order price loss `-D × Δy` |
| CREDIT | offset, asset class, default fraction and recovery fraction; loss `PD × (1-recovery)` |
| GOLD | offset, asset class, price shock and extra spread; stressed liquidation mark at that month, no annual repeating spread |
| PROPERTY_ILLIQUIDITY | window, delay months, haircut; delay only identified property-sale injections, never unrelated capital; proceeds beyond end are unavailable |
| INCOME_LOSS | window, lost percentage of all non-pension income; recompute contribution capacity and deficit |
| LONGEVITY | extraYears 5 and/or 10; rebuild the entire extended dated plan through existing preparation and validate policy/assumption coverage |

The response has seven entries in `scenarios` and the eighth in `longevity.results` (one result for each approved extraYears). Every item has its own status. A READY envelope does not mean all scenarios ran. The sequence golden helper uses beginning-of-year withdrawals, distinct from engine month-end timing: 1bn − 100m → −20%; −100m → +25% = 775m; reversed = 820m.

Source/reforecast limits are explicit: v4 retains income/pension/debt/capital schedules, and essential classifications are reconstructed from pinned profile expense IDs. New/legacy aggregate expenses or rewritten retirement-living sources with no trustworthy classification/indexation return REVIEW_REQUIRED. Property attribution and extending reforecast schedules require review; no arbitrary extrapolation of source end dates. For reforecast INSUFFICIENT, three adjustment directions remain available but numeric P1-8 adjustments require a source rebuild. Replaying these saved versions remains fully supported by the original API.

## Rebalance and estimation

USER POST `/api/v1/me/retirement/risk/rebalance`: `{policyVersionId, templateId, month, retirementMonth, holdings:[{assetClass,value,maturedAmount}],newContribution}`. Target weights come from the published glide policy. Current holdings are user-declared actual amounts, not benchmark overrides. `maturedAmount` is part of holding value, never extra wealth. Drift strictly > approved band triggers a proposal. Allocate contributions+maturities to deficits first, then compute remaining buys/sells; deduct half-L1 turnover costs and solve post-cost target values. WITHIN_BAND does not auto-invest the new contribution. Response contains old/target/new weights, reason, cash allocations, buys/sells, cost and assumptions. No DB write, ActualMonth mutation or trade execution. Persisting decisions with ActualMonth later would require a separately reviewed table design; no migration is included.

Pure estimators use the existing 48-digit Decimal convention: total return `(P_t + D_t)/P_(t-1)-1`; monthly CAGR `product(1+R)^(12/n)-1`; mean shrinkage; exact real `(1+nominal)/(1+CPI)-1`; FX `(1+foreign)*(1+FX)-1`. Ledoit–Wolf centers observations, uses ML covariance (divisor n) and target `trace(S)/p × I`, with analytically estimated shrinkage clipped to [0,1]. Reference: [scikit-learn Ledoit–Wolf](https://scikit-learn.org/stable/modules/generated/sklearn.covariance.ledoit_wolf.html). Numeric tests were independently generated using installed scikit-learn 1.8.0, not by this implementation. Estimators are pure library functions; they do not replace the published annual assumptions or accept public benchmark input.

## Draft and verification boundary

Draft policy v4 adds blockMonths 12 (within documented 12–36), alpha .95, essential threshold .90 (choice marked CHỜ DUYỆT), band 5 points, longevity [5,10]. Equity step and the other stress parameters are omitted pending explicit approval. The report mentions ±10 points as an implementation idea, but this batch does not treat it as a confirmed client number. The builder still writes only local draft files; draft-assumptions-v3 bytes and published-policy-v2 bytes remain identical. Published parsed policy hash is `f0ba2b90cf2ef46c7b32d20cf2588452502c073001a5bbc3697ac28eb7be52b4`, equal to the HEAD parser result.

All market observations in new tests are labeled synthetic **test fixtures** and live exclusively under `src/tests/`. Unit/memory DB and OpenAPI checks are not PostgreSQL concurrency or production acceptance. No `.env`, production DB, migrations, seed, frontend, commit, push or deploy actions are part of this batch. Final executed command results are in PROGRESS.md.
