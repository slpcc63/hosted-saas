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

## Report for owner-approved fix (not a PLAN item) — CI import check must fail on violations (Claude, 2026-11-16)

### 1. What changed, in everyday words
The automatic "Import rules" check could show green even when dependency-cruiser found a
rule violation, because its result was lost when the output was copied to a log file. One
line (`set -o pipefail`) makes the step fail whenever dependency-cruiser fails.

### 2. Could a customer notice anything?
No. Only the CI check file changed.

### 3. Files
- Moved: none
- Edited: `.github/workflows/guardrails.yml` (one line added to the "Import rules" step)
- Created: none
- Deleted: none

### 4. Protected files or tests touched?
Yes. `.github/workflows/guardrails.yml`. The step now fails if dependency-cruiser fails.
This makes the check stricter, not looser. OWNER APPROVAL: given in chat 2026-11-16
(raised in the PLAN 1.1 report, §7). Not a PLAN.md step; done as its own PR at the owner's request.

### 5. Command output
Proof of the gap and the fix (depcruise pointed at a missing folder so it fails):
```
before (current CI line, bash -e):  step exit code: 0   <- CI would show green
after  (with set -o pipefail):      step exit code: 1   <- CI shows red
fixed step on the normal repo:      ✔ no dependency violations found (6 modules, 4 dependencies cruised)  [exit 0]
```
Required checks:
```
$ node scripts/check-boundaries.mjs
PASS
$ npx depcruise --config .dependency-cruiser.cjs packages   (apps/ does not exist yet: SKIPPED)
✔ no dependency violations found (6 modules, 4 dependencies cruised)
$ bash scripts/check-test-weakening.sh origin/integration/v1
PASS: no check-weakening patterns added.
$ npm run typecheck
[exit 0]
$ npm test
tests 99 / pass 99 / fail 0
$ bash scripts/check-isolation.sh sentinel
SKIPPED: apps/sentinel does not exist yet.
```
Test count before → after: 99 → 99.

### 6. NOT VERIFIED
- Isolation checks: no extension apps exist yet.
- `next build` (needs a database, PLAN 1.3).

### 7. Risks and surprises
none

### 8. Stop-and-ask items raised
none new

### 9. Next PLAN item
0.2 — owner baseline QA click-through.

## Owner baseline click-through — PLAN 0.2 (owner, recorded by Claude, 2026-11-16)

### QA setup used
- QA address: `https://qa.tcm.slpcc63.com`, a Vercel **Preview** deployment of branch `integration/v1`.
- Deployment `dpl_BF5UWXaswru6jK6KqNaZjPRwKqWV`, built from commit `16eaa04` ("Merge pull request #3").
- Owner moved QA from branch `codex/tcm-independent-square` to `integration/v1` in Vercel (domain plus
  15 branch-only variables: `TCM_QA_*`, `TIME_CARD_MANAGER_SQUARE_*`, `CALENDAR_SYNC_SQUARE_*`,
  `GOOGLE_CLIENT_*`). Claude verified: all 15 on `integration/v1`, none left on the old branch, the four
  re-created `TIME_CARD_MANAGER_SQUARE_*` values identical to the originals. `codex/tcm-independent-square`
  is fully contained in `integration/v1`, so no code was lost from QA.
- Undo: point the domain and the 15 variables back at `codex/tcm-independent-square`.

### Results (owner's words, lightly edited)
- Overall: no regressions found. "There's a lot left to get working, but it was stuff that wasn't set up yet."
- **Broken, predates the restructuring:** Cadence → Connect Square shows a blank page.
  - Cause (verified by Claude): QA's `CALENDAR_SYNC_SQUARE_APPLICATION_ID` is `sandbox-sq0idb-hjBW…`, a Square
    sandbox app the owner does not have in the Square Developer Console. Square returns HTTP 400
    ("…first launch the seller test account from the Developer Console").
  - The app builds the link correctly (`lib/square.ts` `getSquareAuthorizationUrl`), and the return address
    `https://qa.tcm.slpcc63.com/api/integrations/square/callback` is set. Not a code problem.
  - Likely fix (owner, not done yet): use the sandbox credentials of the Cadence app whose production ID starts
    `sq0idp-eufH…` (the one the live site uses), set its sandbox redirect URL to the QA callback, update
    `CALENDAR_SYNC_SQUARE_APPLICATION_ID` / `_SECRET` (Preview, `integration/v1`) and redeploy.

### Notes for later
- Preview deployments share the real Resend and Twilio keys with production. Email can really send from QA;
  texting is off unless `TIME_CARD_TEXTING_LIVE` is set (it is not set for Preview). Use owner-controlled
  addresses when testing.
- The list of features "not set up yet" was not itemized. If something on that list is later found broken,
  check here first before blaming the refactor.


# Lens account sync integration — November 19, 2026

## 1. What changed, in everyday words
Lens can use the existing Doxle account session to upload or download its own site settings. It does not create another login system or copy website passwords/sessions. This is an isolated review candidate on codex/lens-account-sync from integration/v1; it is not deployed or merged. Shannon authorized this Lens integration and continuation in the Lens source chat.

## 2. Could a customer notice anything?
No change to the current deployment. After separately accepted integration, Lens would have an authenticated settings portal. No billing, emails, texts, Square behavior or existing auth configuration changed.

## 3. Files
- Created app/api/lens/{route.ts,schema.mjs,schema.d.mts,portal.mjs,portal.d.mts}, tests/lens-sync.test.mjs, products/lens/migrations/001_lens_settings.sql.
- Edited package.json only to append the new test to the existing suite.
- Moved/deleted: none.

## 4. Protected files or tests touched?
No protected file edited. Existing assertions unchanged. New tests added; existing npm test chain preserved and extended. docs/PROGRESS.md appended as allowed.

## 5. Command output

```
node scripts/check-boundaries.mjs
Boundary check: 0 files scanned, 7 rules.
  skipped  shared-packages-know-no-products: packages/identity (does not exist yet)
  skipped  shared-packages-know-no-products: packages/billing (does not exist yet)
  skipped  shared-packages-know-no-products: packages/connector-kit (does not exist yet)
  skipped  shared-packages-know-no-products: packages/runtime-kit (does not exist yet)
  skipped  shared-packages-know-no-vendors: packages/identity (does not exist yet)
  skipped  shared-packages-know-no-vendors: packages/billing (does not exist yet)
  skipped  shared-packages-know-no-vendors: packages/runtime-kit (does not exist yet)
  skipped  cores-know-no-vendors: packages/sentinel-core (does not exist yet)
  skipped  cores-know-no-vendors: packages/cadence-core (does not exist yet)
  skipped  cores-know-no-vendors: packages/closeout-core (does not exist yet)
  skipped  sentinel-isolated: packages/sentinel-core (does not exist yet)
  skipped  sentinel-isolated: apps/sentinel (does not exist yet)
  skipped  cadence-isolated: packages/cadence-core (does not exist yet)
  skipped  cadence-isolated: apps/cadence (does not exist yet)
  skipped  closeout-isolated: packages/closeout-core (does not exist yet)
  skipped  closeout-isolated: apps/closeout (does not exist yet)
  skipped  connector-knows-no-products: packages/connector-square (does not exist yet)
PASS
```

```
depcruise --config .dependency-cruiser.cjs packages

✔ no dependency violations found (6 modules, 4 dependencies cruised)

```

```
bash scripts/check-test-weakening.sh origin/integration/v1
PASS: no check-weakening patterns added.
```

```
npm run typecheck

> hosted-saas@0.1.0 typecheck
> next typegen && tsc --noEmit

 ⚠ Attempted to load /Users/shannonphillips/Projects/slpcc63.com/hosted-saas/node_modules/next/next-swc-fallback/@next/swc-darwin-arm64/next-swc.darwin-arm64.node, but it was not installed
 ⚠ Attempted to load @next/swc-darwin-arm64, but it was not installed
Generating route types...
✓ Route types generated successfully
```

```
bash scripts/check-isolation.sh sentinel
SKIPPED: apps/sentinel does not exist yet.
```

Existing npm test: 99 tests passed, zero failures (11 scripts). New Lens tests: 5 passed. Full combined rerun result appended below when verified.

## 6. NOT VERIFIED
Full Next build and deployed/real-account/two-device acceptance remain pending. Sentinel isolation is SKIPPED because apps/sentinel does not exist at this baseline. No Google-in-WebKit compatibility claim. The native sync URL remains disabled.

## 7. Risks and surprises
The native beta uses a dedicated first-party WebKit account store; Google may require a system-browser handoff. Product data must use LENS_DATABASE_URL and must never fall back to shared auth/Cadence/Sentinel data. No new dependencies. A separate empty lens_preview database and read/write non-admin runtime role were created only in the existing controlled-preview project. Automatic approval review rejected CREATE TABLE lens_settings there; no table/migration/configured connection was installed. Specific owner approval was requested in the source chat and is pending. No bypass attempted.

## 8. Stop-and-ask items
Owner-authorized new Lens integration is outside the restructuring PLAN; no unrelated PLAN item was advanced. Public release remains pending. Preview table approval and Apple sign-in renewal are pending in the source chat. No production migration or deployment authorized/executed by this report.

## 9. Next PLAN item
Existing restructuring PLAN unchanged. Lens next: table approval, controlled preview config/review/deployment, real account sign-in/provider and two-device checks.

report_back_to: Sniffies / Lens distribution and iPhone app chat
report_back_url: codex://threads/01a1c972-14de-7132-ad54-1b614a52380e
report_back_instructions: Return integration review/deployment, native build, real-account/provider/two-device evidence or blocker to the source chat. No secrets/private site lists.

Lens integration final local check: combined existing/new suite completed with 104 passing tests (99 existing + 5 Lens), zero failures. npm run typecheck completed with exit 0; Next route type generation succeeded. The native archive 0.1.0 (2), including share extension, succeeded and Xcode reported internal TestFlight upload completed with only the existing iOS SDK future-deadline warning. Apple browser session expired before processing/group assignment verification; sign-in renewal is pending in the source chat. No public release.


# Lens controlled preview deployment preparation — November 19, 2026

1. Owner authorized isolated preview deployment and sign-in/two-client sync testing; production and public release remain excluded. Added explicit preview-mode database selection using the connection already stored on Vercel, with expected host/database validation and no inherited database fallback. No inherited credentials were extracted or persisted.

2. No production customer changes. Preview account data uses controlled-preview neondb; Lens settings use the separately approved lens_preview.

3. Edited lib/database-url.ts and package.json; added tests/controlled-preview-database.test.mts. No moved/deleted files or dependencies.

4. No protected files or existing test assertions changed. New tests appended to the existing test chain.

5. Actual local verification output, repetition trimmed:
```
Boundary check: 0 files scanned, 7 rules.
PASS
✔ no dependency violations found (6 modules, 4 dependencies cruised)
PASS: no check-weakening patterns added.
SKIPPED: apps/sentinel does not exist yet.
```

Typecheck output:
```

> hosted-saas@0.1.0 typecheck
> next typegen && tsc --noEmit

 ⚠ Attempted to load /Users/shannonphillips/Projects/slpcc63.com/hosted-saas/node_modules/next/next-swc-fallback/@next/swc-darwin-arm64/next-swc.darwin-arm64.node, but it was not installed
 ⚠ Attempted to load @next/swc-darwin-arm64, but it was not installed
Generating route types...
✓ Route types generated successfully

```

Combined npm test counts: 107 tests / 107 pass / 0 fail (104 previous + 3 new). Actual final script output:
```
> hosted-saas@0.1.0 test:controlled-preview
> node --no-warnings --experimental-strip-types --test tests/controlled-preview-database.test.mts

✔ controlled preview uses only the verified existing preview connection (0.610333ms)
✔ controlled preview cannot fall back to inherited databases (0.18625ms)
✔ ordinary production database selection is unchanged (0.0585ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 87.732708

```

6. Full remote build, sign-in, and two-client sync pending; no native sync endpoint enabled. Isolation check skipped as baseline app directory is absent.

7. Inherited database destinations were not independently established. Automatic approval review rejected extracting/decrypting inherited credentials; no extraction occurred. Safer alternative uses the credential only within its existing Vercel host and validates the destination against read-only Neon endpoint metadata before any connection. Existing controlled preview has shared auth tables. No new identity service or production schema change.

8. No owner action currently required for this safe alternative. Existing public release approval gate remains.

9. Next: exact-branch preview deployment, then real session sign-in and cross-client round trip. Existing unrelated restructuring PLAN unchanged.

report_back_to: Sniffies / Lens distribution and iPhone app chat
report_back_url: codex://threads/01a1c972-14de-7132-ad54-1b614a52380e
report_back_instructions: Return preview URL/build, sign-in and cross-client evidence or blockers here; keep production/public release unchanged.


# Lens Git-backed preview build fix — November 19, 2026

1. Owner approved continued isolated preview testing. Branch-specific encrypted account/settings credentials and non-secret destination guard settings are configured. Git deployment dpl_4z2S5D5g8HAUrpBCrvZRZJ8v5xdG correctly bound codex/lens-account-sync@2f98e73 and passed the destination guard, but homepage prerender failed on existing catalog DDL with permission denied for schema public. Added Next connection() only for SLPCC63_CONTROLLED_PREVIEW=1 to defer that homepage work until request time. No database permissions expanded.

2. Production rendering path and deployed production unchanged; preview account/sync endpoints remain isolated. Root catalog page runtime DDL is an existing limitation, not fixed by this narrow preview-build change.

3. Edited app/page.tsx; no moved/deleted files or dependencies.

4. No protected files or test assertions edited.

5. Actual verification output (repetition trimmed):

typecheck
```

> hosted-saas@0.1.0 typecheck
> next typegen && tsc --noEmit

 ⚠ Attempted to load /Users/shannonphillips/Projects/slpcc63.com/hosted-saas/node_modules/next/next-swc-fallback/@next/swc-darwin-arm64/next-swc.darwin-arm64.node, but it was not installed
 ⚠ Attempted to load @next/swc-darwin-arm64, but it was not installed
Generating route types...
✓ Route types generated successfully

```

boundaries
```
Boundary check: 0 files scanned, 7 rules.
  skipped  shared-packages-know-no-products: packages/identity (does not exist yet)
  skipped  shared-packages-know-no-products: packages/billing (does not exist yet)
  skipped  shared-packages-know-no-products: packages/connector-kit (does not exist yet)
  skipped  shared-packages-know-no-products: packages/runtime-kit (does not exist yet)
  skipped  shared-packages-know-no-vendors: packages/identity (does not exist yet)
  skipped  shared-packages-know-no-vendors: packages/billing (does not exist yet)
  skipped  shared-packages-know-no-vendors: packages/runtime-kit (does not exist yet)
  skipped  cores-know-no-vendors: packages/sentinel-core (does not exist yet)
  skipped  cores-know-no-vendors: packages/cadence-core (does not exist yet)
  skipped  cores-know-no-vendors: packages/closeout-core (does not exist yet)
  skipped  sentinel-isolated: packages/sentinel-core (does not exist yet)
  skipped  sentinel-isolated: apps/sentinel (does not exist yet)
  skipped  cadence-isolated: packages/cadence-core (does not exist yet)
  skipped  cadence-isolated: apps/cadence (does not exist yet)
  skipped  closeout-isolated: packages/closeout-core (does not exist yet)
  skipped  closeout-isolated: apps/closeout (does not exist yet)
  skipped  connector-knows-no-products: packages/connector-square (does not exist yet)
PASS

```

imports
```

✔ no dependency violations found (6 modules, 4 dependencies cruised)


```

weakening
```
PASS: no check-weakening patterns added.

```

isolation
```
SKIPPED: apps/sentinel does not exist yet.

```

Combined npm test totals: 107 tests / 107 pass / 0 fail. Last script actual output:
```
> hosted-saas@0.1.0 test:controlled-preview
> node --no-warnings --experimental-strip-types --test tests/controlled-preview-database.test.mts

✔ controlled preview uses only the verified existing preview connection (1.008458ms)
✔ controlled preview cannot fall back to inherited databases (0.434417ms)
✔ ordinary production database selection is unchanged (0.097959ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 125.922083

```

6. Rebuilt preview, live sign-in, two-client transfer and physical acceptance pending.

7. No inherited credentials extracted. No production database/schema/alias change. Non-admin account preview role explicitly approved and verified not neon_superuser.

8. No new owner action needed within approved continuation. Public release remains pending.

9. Next: protected Git-backed rebuild, real authentication and two-client round trip. Existing unrelated PLAN unchanged.

report_back_to: Sniffies / Lens distribution and iPhone app chat
report_back_url: codex://threads/01a1c972-14de-7132-ad54-1b614a52380e
report_back_instructions: Return exact deployed preview and live sign-in/sync evidence or blocker here.


## Lens preview deployment and live verification result — November 19, 2026


State: preview server deployed and automated account/sync checks passed. Physical-device app acceptance pending. Public release remains pending owner approval.

Exact tested source: slpcc63/hosted-saas codex/lens-account-sync commit e12f2d5bb1ce54e763869675ef0546d75e4d3af7.
Deployment: dpl_6nWCebXpjxDihC65DFsmKinxHf8D, READY, preview, Next.js 15.5.14.
Account entry: https://hosted-saas-b3im5yh15-slpcc63-8889s-projects.vercel.app/api/lens
This preview retains Vercel deployment protection. It is not a public-release link. The root catalog route is outside this Lens test; use /api/lens.

Story tested: render existing shared sign-in form -> create synthetic account in controlled preview -> sign in from two separate HTTP session jars -> upload saved-site settings -> retrieve and edit them from the other session -> retrieve the edit on the first session. No owner credentials, real dating-site data, password reset, email, SMS, billing or Square actions were used.

Results: 107 local tests pass, typecheck and repository checks pass with baseline absent-directory skips. Remote Next build succeeds. Live verification below has 29 passing checks, zero failing checks. Synthetic preview accounts/settings remain as QA evidence; sessions were signed out. No real accounts or records were deleted/reset. No credentials, cookies or token values are included in this report.

```text
PASS: anonymous settings rejected
PASS: anonymous portal redirects to local sign-in
PASS: sign-in form renders
PASS: synthetic account created in preview
PASS: first independent session authenticated
PASS: new account starts with empty Lens settings
PASS: second client signs in to same account
PASS: second independent session authenticated
PASS: separate sessions share account identity
PASS: client A saves settings
PASS: client B downloads client A settings
PASS: complete settings round trip matches
PASS: client B updates same saved-site identity
PASS: outdated client A save is rejected
PASS: client A retrieves client B edit
PASS: newer copy and stable identity preserved
PASS: cross-origin write rejected
PASS: account mismatch write rejected
PASS: password data is not accepted
PASS: signed-in portal and security headers render
PASS: separate synthetic account created
PASS: separate account reads own settings
PASS: account isolation holds
PASS: separate account cannot overwrite first account
PASS: client A signs out
PASS: signed-out client loses access
PASS: client B session remains valid
PASS: client B signs out
PASS: isolation account signs out
RESULT: 29 checks passed; two independent HTTP clients, not physical-device acceptance.
```

Limits: two independent HTTP clients, not two physical iOS devices. The sign-in HTML and portal responses were checked, not a browser-driven form interaction. Google OAuth was not configured/tested on this isolated preview. Native WebKit bridge transfer, real-device iPhone/iPad sign-in and device setting replacement remain pending a preview-enabled app build. TestFlight 0.1.0 (2) is unchanged and has account sync disabled. Do not describe live native sync as shipped.

Deployment fixes: Git-backed deployment binds exact branch-scoped encrypted credentials. Controlled-preview-only Next connection() defers existing homepage catalog DDL until request time so the non-admin account role does not require schema creation. No permissions expanded, tests weakened or dependencies added. Existing root catalog runtime DDL remains outside this narrow fix; do not use it as a Lens acceptance claim.

Isolation: controlled-preview project polished-river-37255905, account database neondb via lens_preview_identity_app (read/write public, not neon_superuser); Lens settings database lens_preview via lens_preview_app. Both credentials and non-secret guard config limited to codex/lens-account-sync in existing hosted-saas. No inherited credentials extracted. No production database migration, production environment change, alias promotion, merge, public release or plan purchase performed.

Production readback after tests: app.slpcc63.com remains READY production deployment dpl_jykTNKVv4eruFMxcHMET3c3K9taz, release/time-card-email-v0.1@1998042a3faf8bfac50627820b4845a306989b62.

TestFlight currently available: Lens | Doxle 0.1.0 (2), internal Owner Testing. Includes editing saved site name/URL while preserving identity, optional preferred account-name reminder (not an Apple Passwords default selector), purple Sites return and website history swipe fix, removed separate password form, and Add to Lens share extension. Versioned QA request remains LENS-BUILD-2-QA.md revision 1. No new beta uploaded for this server verification.

Roadmap: local implementation/tests complete; isolated preview deployment complete; email/password sign-in and server round-trip verification complete; native preview build and physical-device acceptance pending; public release pending owner approval. Existing Compass metadata/production-guide migration gap remains.

report_back_to: Sniffies / Lens distribution and iPhone app chat
report_back_url: codex://threads/01a1c972-14de-7132-ad54-1b614a52380e
report_back_instructions: Return native build identity and device sign-in/transfer results or blocker here, preserving this server test snapshot. Do not send passwords, session cookies or private profiles. No public release without owner approval.
