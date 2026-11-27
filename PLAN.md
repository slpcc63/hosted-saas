# PLAN.md — ordered, one PR per checkbox

Review level: **M** = mechanical (CI green + report is enough), **D** = design (second-AI review
required), **H** = high risk (paid human reviewer required; see docs/OWNER_GUIDE.md).
Each item lists its **proof** — commands whose output must be pasted in the report.

Rule: the `skipped … does not exist yet` lines from `check-boundaries.mjs` must shrink as phases
land. Final state: zero skipped, zero ALLOWED.

## Phase 0 — Owner setup (owner does these; no code)
- [x] 0.1 (M) Import the bundle and push `integration/v1` (see OWNER_GUIDE §1). _Done 2026-11-16 (PR #2)._
- [x] 0.2 (M) Deploy QA from `integration/v1`; click through signup → subscribe → dashboard → each extension page. Write down anything broken *before* refactoring so it is not blamed on the refactor. _Done 2026-11-16: QA = `qa.tcm.slpcc63.com` on `integration/v1` @ `16eaa04`; notes in PROGRESS.md._
- [ ] 0.3 (M) Turn on branch protection for `integration/v1` (OWNER_GUIDE §2) and tag old branches. _Partly done 2026-11-16: ruleset on `integration/v1` (PR required, 0 approvals, `guardrails` required, no force-push/delete; Code Owners review off until agents use a separate GitHub account). Old branches not yet tagged._

## Phase 1 — Guardrails and skeleton (no product code changes)
- [x] 1.1 (M) Add the handoff files to the repo root, `npm i -D typescript@^5 dependency-cruiser`. Add `tsconfig.tsbuildinfo` to `.gitignore` and untrack it. _Done 2026-11-16 (PR #2)._
  Proof: all §6 commands run; boundary check passes (most rules "skipped" is expected).
- [ ] 1.2 (M) Convert to npm workspaces and move the existing Next app to `apps/web` with `git mv` (history kept). No code edits except paths/config. _Owner decision 2026-11-22: deferred. The Vercel Root Directory is project-wide and the same project serves slpcc63.com and app.slpcc63.com, so the move waits until deploys are split. Packages are extracted with the app still at the repo root._
  Proof: `npm test` count equals the baseline in PROGRESS.md (99 tests across the 9 scripts); app boots locally.
- [x] 1.3 (D) Make the homepage not write to the database at render time (read-only catalog, or request-time render). Behavior-preserving.
  Proof: `next build` succeeds with **no** database configured. _Done 2026-11-22 (branch `step/1.3-static-homepage-catalog`); owner chose a code-defined catalog._

## Phase 2 — Shared packages (each one: copy-free move, then delete duplicates)
- [x] 2.1 (M) `packages/identity`: auth, customers, customer-profile, shared-identity. Update imports in `apps/web`. _Done 2026-11-26 (branch `step/2.1-packages-identity`). App is still at the repo root (1.2 deferred), so imports are `@/packages/identity/...`. `packages/shared-identity` left in place (own test); `lib/admin.ts` stays with the hub. The package still imports `@/lib/db`, `@/lib/email` and `@/lib/deployment` from the app; those move in later steps (deployment.ts in 2.7)._
- [ ] 2.2 (H) Auth-related: because 2.1 contains auth/session code, a paid reviewer looks at the diff once.
- [x] 2.3 (M) `packages/billing`: subscriptions, products, entitlements, Stripe wrapper. Entitlement check becomes one function: `hasAccess(account, extensionId)`.
  _2026-11-26 (later): part 2 needs no code: one access function already exists (`getActiveSubscriptionForProduct`). Calendar Sync's missing subscription gate and the past_due policy move to Stage 3 (owner OK)._
  _2026-11-26: split in two (AGENTS.md: move OR change). Move done on branch `step/2.3-packages-billing` (subscriptions, products, stripe → `packages/billing`). Still open: the single `hasAccess(account, extensionId)` function, as its own PR, because it changes code paths._
- [ ] 2.4 (H) Billing diff reviewed by a human (touches Stripe).
- [ ] 2.5 (D) `packages/connector-kit`: connection store, OAuth plumbing, token crypto, and the `TimeSource` / `ScheduleSource` interfaces (docs/ARCHITECTURE.md §4). Interfaces are *designed from what Sentinel and Cadence actually call*, not invented.
- [ ] 2.6 (H) Token crypto/OAuth part of 2.5 reviewed by a human.
- [x] 2.7 (D) `packages/runtime-kit` + extension **registry**: replace the hardcoded product-id/env-prefix ternary in `product-runtime`; move `TCM_QA_APP_ORIGIN` out of shared `deployment.ts`; delete its allow-list entry.
  _2026-11-26: owner approved doing 2.7 before 2.5 (Square connection code had product names hardcoded). Part 1 on branch `step/2.7-extension-registry`: `packages/runtime-kit/registry.ts` (provider-neutral) + `lib/extension-registry.ts` (both entries); product-runtime prefix, Square plugin id/prefix/legacy settings, default scopes and product home paths now read the registry. Part 2 done 2026-11-26 (branch `step/2.7b-qa-settings-registry`; owner chose keeping the setting names): `TCM_QA_HOST`, `TCM_QA_APP_ORIGIN` and `TCM_QA_DATABASE_URL` are declared in Sentinel's registry entry; shared code reads them through the registry. No Vercel change. Allow-list was already empty._
  Proof: `guardrails.config.json` `allow` is empty; boundary check passes with no ALLOWED lines.
- [x] 2.8 (M) Dashboard reads extensions from the registry instead of importing Sentinel's `getTimeCardManagerOverview`; `seed.ts` stops hardcoding product slugs.
  _Done 2026-11-26 (branch `step/2.8-dashboard-registry`; owner chose behavior-preserving). Extensions give the dashboard a plain-data card (`packages/runtime-kit/dashboard.ts`); `app/app/dashboard/providers.ts` is the only link. `seed.ts` already had no slugs after 1.3 (they are catalog data in `lib/catalog-data.ts`). The `apps/` deletion proof waits for apps to exist. Dashboard copy/redesign incl. Cadence card → Stage 3._
  Proof: `apps/web` builds with `apps/sentinel` and `apps/cadence` temporarily deleted (`rm -rf` in a scratch clone, paste output).

## Phase 3 — Sentinel
- [ ] 3.1 (D) Characterization tests for `time-card-email-workflow` with email/SMS/Square all stubbed: record current outputs for the main flows (open punch alert, missing punch, response parse, audit log). **No refactoring in this PR.**
- [ ] 3.2 (M) Create `apps/sentinel` + `packages/sentinel-core`; move product files (paths only).
- [ ] 3.3 (D) Introduce `TimeSource`; the workflow functions take it as an argument. Core imports no Square.
- [ ] 3.4 (D) `packages/connector-square`: implement `TimeSource`, mapping Square types to generic `TimeEntry`, `Worker`, `Shift`, `Job`.
  Proof: 3.1's tests unchanged and green; `check-boundaries` rule `cores-know-no-vendors` active and passing.
- [ ] 3.5 (H) Human review of 3.3 + 3.4 (the abstraction decides whether a second connector fits).
- [ ] 3.6 (M) Split `square-time-card-manager.ts`: settings/entitlements → core; actual Square calls → connector.
- [ ] 3.7 (M) Move Sentinel DDL from runtime `ensure…Table` into per-extension migrations.
- [ ] 3.8 (M) `bash scripts/check-isolation.sh sentinel` passes. Sentinel works with the hub, Cadence and Closeout deleted.

## Phase 4 — Cadence (same shape as Phase 3)
- [ ] 4.1 (D) Characterization tests for the calendar sink and iCal feed.
- [ ] 4.2 (M) `apps/cadence` + `packages/cadence-core`.
- [ ] 4.3 (D) `ScheduleSource` + Square implementation in `connector-square`.
- [ ] 4.4 (M) Migrations; `check-isolation.sh cadence` passes.
- [ ] 4.5 (M) Delete the now-unused copies; run a repo-wide search proving each moved file exists exactly once.

## Phase 5 — Outline only (do not start without owner sign-off)
Closing checklist: import with `git subtree add`, move to shared packages, decide customer↔organization ownership, one Next version, one migration tool, rebuild its run workflow on the new structure.

## Done means
`check-boundaries` (no ALLOWED, no skipped), `depcruise`, `check-isolation` for each existing extension, `typecheck`, `npm test` all pass in CI on a clean clone, and a fresh QA click-through matches the Phase 0.2 notes.
