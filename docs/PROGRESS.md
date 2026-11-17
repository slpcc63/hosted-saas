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


## Report for PLAN item 1.1 — Add handoff files, install dependency-cruiser, untrack tsbuildinfo (Claude, 2026-11-16)

### 1. What changed, in everyday words
Added the rulebook, plan, guardrail checks and owner docs to the repo. Installed
dependency-cruiser, the tool that checks which code may use which. Stopped tracking an
automatic TypeScript build file. Adjusted the CI import check so it only looks in folders
that exist (`apps/` is created in step 1.2).

### 2. Could a customer notice anything?
No. No application code, emails, texts, billing or deploy settings changed.

### 3. Files
- Moved: `docs/architecture.md` → `docs/architecture-notes.md` (content unchanged; frees the name `docs/ARCHITECTURE.md`)
- Edited: `package.json`, `package-lock.json` (dependency-cruiser); `.gitignore` (`*.tsbuildinfo`);
  `.github/workflows/guardrails.yml`, `AGENTS.md`, `docs/REPORT_TEMPLATE.md` (import check skips missing folders)
- Created: AGENTS.md, PLAN.md, extensions.json, guardrails.config.json, .dependency-cruiser.cjs,
  scripts/check-*.{mjs,sh}, .github/workflows/guardrails.yml, .github/CODEOWNERS,
  docs/{ARCHITECTURE,HANDOFF,OWNER_GUIDE,PROGRESS,REPORT_TEMPLATE,REVIEW_CHECKLIST}.md
- Deleted from git (file kept locally): `tsconfig.tsbuildinfo`

### 4. Protected files or tests touched?
Yes. `.github/workflows/guardrails.yml`, `AGENTS.md`, `docs/REPORT_TEMPLATE.md`: the import
check now runs only on whichever of `apps`/`packages` exist, and prints SKIPPED if neither does.
OWNER APPROVAL: given in chat 2026-11-16. No tests touched.

### 5. Command output
```
$ node scripts/check-boundaries.mjs
Boundary check: 0 files scanned, 7 rules.   (17 "skipped … does not exist yet" lines)
PASS
$ npx depcruise --config .dependency-cruiser.cjs packages   (apps/ does not exist yet: SKIPPED)
✔ no dependency violations found (6 modules, 4 dependencies cruised)
$ bash scripts/check-test-weakening.sh origin/integration/v1
FAIL: this change adds patterns that make checks easier to pass:
   +5. Is the test count equal to or greater than before? Any removed tests/assertions? Any new `.skip`, `@ts-ignore`, `eslint-disable`, `|| true`?
$ npm run typecheck
✓ Route types generated successfully   [exit 0]
$ npm test
tests 99 / pass 99 / fail 0   (11 test runs)
$ bash scripts/check-isolation.sh sentinel
SKIPPED: apps/sentinel does not exist yet.
```
Test count before → after: 99 → 99.

### 6. NOT VERIFIED
- check-test-weakening FAIL is a false positive: the flagged line is the text of
  `docs/REVIEW_CHECKLIST.md` describing those patterns. Owner approved as a one-time exception
  for this PR (2026-11-16). Later PRs diff against a base that already contains the file.
- Isolation checks: no extension apps exist yet.
- CI run on GitHub: not yet observed at time of writing.
- `next build` (needs a database, PLAN 1.3).

### 7. Risks and surprises
- `npm i` also raised two shared helper packages by minor versions (acorn 8.16→8.19, semver 7.7→7.8).
- `npm audit --omit=dev`: 8 vulnerabilities (6 high, 2 critical), identical count before and after this change; pre-existing.
- The handoff README and ARCHITECTURE.md had overwritten the project README and docs/architecture.md
  (macOS ignores filename case). Restored; package README kept as docs/HANDOFF.md.
- `AGENTS.md` was hidden by a local `.git/info/exclude` entry; removed so it is committed.
- CI "Import rules" step pipes depcruise into `tee` without `pipefail`, so a real import-rule
  violation would not fail CI (only the missing-transpiler grep does). Raised to owner; not changed.

### 8. Stop-and-ask items raised
- depcruise on missing `apps/` → owner approved skipping missing folders.
- check-test-weakening false positive → owner approved one-time exception.
- pipefail gap in CI import step → pending owner decision.

### 9. Next PLAN item
1.2 — npm workspaces + move the app to `apps/web` (after Phase 0 owner items).
