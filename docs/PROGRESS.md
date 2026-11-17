# PROGRESS.md — append-only log. Newest entry at the bottom. Agents append; nobody edits history.

## Baseline (written by Claude, 2026-11-14)
- Branch: `integration/v1` = QA (`6f037cb`) fast-forwarded to split-runtime (`b7a3dee`),
  + auth preview-origin (`928d226`, `697d25a`), + three recovered feature branches
  (billing, marketing-demo, calendar-seed), + untracked `data/auth.db`, + 3 small test/script fixes.
- Verified in sandbox: `npm run typecheck` clean; `npm test` 99/99 passing across 9 scripts;
  `tests/assisted-demo-readiness.test.mts` 4/4 (not in the `npm test` chain).
- NOT verified: full `next build` (needs a database), product builds in `products/`,
  anything needing live Square/Stripe/Twilio credentials, deployed QA behavior.
- Known gaps: `TCM_QA_APP_ORIGIN` allow-listed in shared deployment code; `tsconfig.tsbuildinfo`
  tracked in git; homepage writes to the database at render time.
- Not included on purpose: `release/main-site-oct25` (controlled demo candidate).
- Owner baseline click-through (PLAN 0.2): _pending — owner fills in_

