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

## PLAN 1.3 — Homepage no longer touches the database (Claude, 2026-11-22)

### 1. In plain language
The public homepage used to write the product catalog into the database every time it was built or
visited, so the site could not even be built without a database. It now lists products from a file in
the code (`lib/catalog-data.ts`). The app pages (dashboard, subscriptions, admin) still write the same
catalog to the database as before.

### 2. Could a customer notice?
No change expected: the homepage shows the same products, prices and order as the database query did,
because the database rows came from this same seed data (it was rewritten on every visit).
One difference by design (owner decision 2026-11-22): a product added only through the admin products
screen will not appear on the homepage until it is added to `lib/catalog-data.ts`.

### 3. What changed
- `lib/catalog-data.ts` (new): the seed catalog data, moved unchanged from `lib/seed.ts`, plus
  `getPublishedSeedMarketingProducts()`, which repeats the database query's filtering and ordering.
- `lib/seed.ts`: imports that data instead of defining it. Database writes unchanged.
- `app/page.tsx`: uses the code catalog; no `ensureSeedCatalog()` / database query.
- `tests/homepage-static-catalog.test.mts` (new, 3 tests) and its `package.json` script.
No dependencies added. No protected files edited except PLAN.md notes/tick.

### 4. Owner decisions recorded
- 1.2 deferred (see PLAN.md note): Vercel Root Directory is project-wide.
- 1.3: code-defined public catalog (option a), not per-visit or cached database reads.

### 5. Required checks
```
$ node scripts/check-boundaries.mjs
PASS   (all rules skipped: apps/ and packages/* do not exist yet)
$ npx depcruise --config .dependency-cruiser.cjs packages   (apps/ does not exist yet: SKIPPED)
✔ no dependency violations found (6 modules, 4 dependencies cruised)
$ bash scripts/check-test-weakening.sh origin/integration/v1
PASS: no check-weakening patterns added.
$ npm run typecheck
✓ Route types generated successfully   [exit 0]
$ npm test
tests 102 / pass 102 / fail 0
$ DATABASE_URL unset; npx next build
exit 0   (before this change: "Error occurred prerendering page "/" … ECONNREFUSED 127.0.0.1:5432")
$ bash scripts/check-isolation.sh sentinel
SKIPPED: apps/sentinel does not exist yet.
```
Test count before → after: 99 → 102.

### 6. NOT VERIFIED
- The homepage on QA after deploy: compare it with the current QA homepage (same products, prices, order).
- Whether the production database holds products added through the admin screen that the old homepage
  showed. Claude has no database access. Check the admin products page on QA/production.
- The homepage still renders per request (`ƒ /`) because the header reads the sign-in session. It no
  longer writes to the database; making it fully static is not part of this step.

### 7. Risks and surprises
- The homepage on `integration/v1` uses the old names and shows Time Card Manager from $79/month. The live
  slpcc63.com is a separate static build from `release/main-site-oct25` (Sentinel/Cadence/Handoff naming,
  no prices). The two drift until the catalog step in Stage 3. Not changed here.
- `build:public` (the static apex build) exists only on `release/main-site-oct25`.
- Owner note 2026-11-22, target domains: www.slpcc63.com = marketing pages; app.slpcc63.com = sign-in,
  then dashboard. Current state: the apex holds the static release, www is on an older deployment.

### 8. Stop-and-ask items raised
- None new.

### 9. Next PLAN item
2.1 — `packages/identity` (then 2.2 review).

## PLAN 2.1 — Sign-in and customer-account code moved into `packages/identity` (Claude, 2026-11-26)

### 1. In plain language
The 12 files that handle sign-in, password reset, Google sign-in, admin checks and customer profiles
moved from `lib/` into one shared folder, `packages/identity/`. Nothing inside them changed except the
lines that say where other files are. Every page and file that used them now points at the new place.

### 2. Could a customer notice?
No. This is a move. 8 files are byte-identical after the move; the other 4 differ only in import lines.

### 3. What changed
- Moved (git history kept): `auth`, `auth-client`, `auth-password-config`, `auth-provider-config`,
  `auth-recovery`, `auth-recovery-content`, `auth-redirect`, `auth/server`, `authorization`, `customers`,
  `customer-profile-initialization`, `google-sign-in`.
- 27 app/lib/component files: import paths only (`@/lib/x` → `@/packages/identity/x`).
- 6 test files: import/file paths only. In `current-customer-wrapper.test.mts` the stubbed module name
  changed from `@/lib/auth` to `@/packages/identity/auth` so the same stub still applies.
- New `packages/identity/package.json` (name only).
- Not moved: `lib/admin.ts` (hub dashboard counts, not identity); `packages/shared-identity` (has its own test).
No dependencies added.

### 4. Known leftovers (not hidden)
`packages/identity` still imports three app files: `@/lib/db`, `@/lib/email`, `@/lib/deployment`.
`deployment.ts` holds the Sentinel-only `TCM_QA_APP_ORIGIN` (PLAN 2.7). These make the package depend
on the app until db/email/deployment get their own packages.

### 5. Required checks
```
$ node scripts/check-boundaries.mjs
Boundary check: 24 files scanned, 7 rules.   (shared-packages-know-no-products / -no-vendors now
PASS                                          run on packages/identity)
$ npx depcruise --config .dependency-cruiser.cjs packages   (apps/ does not exist: SKIPPED)
✔ no dependency violations found (33 modules, 28 dependencies cruised)
$ bash scripts/check-test-weakening.sh origin/integration/v1
PASS: no check-weakening patterns added.
$ npm run typecheck
exit 0
$ npm test
tests 102 / pass 102 / fail 0
$ DATABASE_URL unset; npx next build
exit 0
$ npm run build:product-contracts
exit 0 (same as before the move)
$ bash scripts/check-isolation.sh sentinel
SKIPPED: apps/sentinel does not exist yet.
```
Test count before → after: 102 → 102.

### 6. NOT VERIFIED
- Live sign-in, sign-out, password reset and Google sign-in on the PR's Preview (owner click-through).
- PLAN 2.2 review (auth code moved). The diff is import paths only; see section 2.

### 7. Risks and surprises
None found. AGENTS.md §5.3 lists auth code as stop-and-ask: flagged to the owner in the PR.

### 8. Next PLAN item
2.2 review, then 2.3 `packages/billing`.

## PLAN 2.3 (part 1 of 2) — Billing code moved into `packages/billing` (Claude, 2026-11-26)

### 1. In plain language
The three files for plans and products, subscriptions, and Stripe (checkout and billing portal) moved
from `lib/` into `packages/billing/`. Nothing inside them changed except one import line. Every file that
used them now points at the new place. The "one access check" part of 2.3 is a real code change, so it
gets its own PR next.

### 2. Could a customer notice?
No. `products.ts` and `stripe.ts` are byte-identical after the move; `subscriptions.ts` differs only in
one import line (it now imports products from its own package).

### 3. What changed
- Moved (history kept): `lib/subscriptions.ts`, `lib/products.ts`, `lib/stripe.ts` → `packages/billing/`.
- 13 other files: import paths only. One code comment in `lib/catalog-data.ts` updated to the new path.
- New `packages/billing/package.json` (name only). No dependencies added.

### 4. Known leftovers (not hidden)
`packages/billing` still imports `@/lib/db` and `@/lib/deployment` (for the app address used in Stripe
return links), same situation as identity. None of the three files names a product or Square.

### 5. Required checks
```
$ node scripts/check-boundaries.mjs
Boundary check: 30 files scanned, 7 rules.   (shared rules now also cover packages/billing)
PASS
$ npx depcruise --config .dependency-cruiser.cjs packages
✔ no dependency violations found (38 modules, 36 dependencies cruised)
$ bash scripts/check-test-weakening.sh origin/integration/v1
PASS: no check-weakening patterns added.
$ npm run typecheck
exit 0
$ npm test
tests 102 / pass 102 / fail 0
$ DATABASE_URL unset; npx next build
exit 0
$ npm run build:product-contracts
exit 0
$ bash scripts/check-isolation.sh sentinel
SKIPPED: apps/sentinel does not exist yet.
```

### 6. NOT VERIFIED
- Subscriptions page and admin products page on the PR Preview (owner click-through; use the Preview's
  unique deployment address, not the branch address, until the origin fix lands).
- Stripe checkout: off by design (`BILLING_CHECKOUT_ENABLED` not true), so not exercised.
- PLAN 2.4 review (Stripe code moved). Diff is import paths only.

### 7. Risks and surprises (found this session, not caused by this PR)
- Preview branch addresses (`hosted-saas-git-<branch>…`) fail sign-in with "Invalid origin": only
  `VERCEL_URL` (the unique deployment address) is trusted. Confirmed on `integration/v1` too. Fix proposed
  as a separate auth PR (trust `VERCEL_BRANCH_URL`), pending owner OK.
- Password reset on the PR #7 Preview: request returned 200 with no error logged (so Resend accepted it,
  or the error was swallowed), but the email did not arrive at an iCloud address, junk included. Not yet
  diagnosed: needs the Resend dashboard (delivery status) and a check of the slpcc63.com sending-domain
  DNS records. Affects every email the platform sends, including Sentinel's.

### 8. Next PLAN item
2.3 part 2 — `hasAccess(account, extensionId)`; then 2.4 review.

## Fix — Preview "Preview" links can sign in (Claude, 2026-11-26; owner-approved)

### 1. In plain language
Every Preview has two addresses: a unique one and a branch one (the "Preview" link on pull requests).
Sign-in only trusted the unique one, so the PR link always failed with "Invalid origin". Previews now
also trust their own branch address.

### 2. Could a customer notice?
No. Production and app.slpcc63.com are untouched: the new address is only trusted when Vercel says the
deployment is a Preview, and only if it is a plain `*.vercel.app` host name.

### 3. What changed
- `lib/deployment.ts`: new `getVercelBranchOrigin()` reads Vercel's built-in `VERCEL_BRANCH_URL`; added to
  the trusted-origin list. The main sign-in address (`getBetterAuthOrigin`) is unchanged, so reset-email
  links still use the unique address.
- `tests/auth-preview-origin.test.mts`: 3 new tests (trusted on Preview; never outside Preview; malformed
  values ignored). Existing tests unchanged.

### 4. Required checks
```
$ node scripts/check-boundaries.mjs                         PASS
$ npx depcruise --config .dependency-cruiser.cjs packages   ✔ no dependency violations found
$ bash scripts/check-test-weakening.sh origin/integration/v1  PASS
$ npm run typecheck                                         exit 0
$ npm test                                                  tests 105 / pass 105 / fail 0
$ DATABASE_URL unset; npx next build                        exit 0
```
Test count before → after: 102 → 105.

### 5. NOT VERIFIED
- Sign-in on this PR's branch address (owner check after the Preview builds).
- Google sign-in on Preview branch addresses: Google only accepts redirect addresses registered with it,
  and Previews do not have Google keys anyway. Unchanged by this fix.

### 6. Next
2.3 part 2 — `hasAccess(account, extensionId)`.

## PLAN 2.7 (part 1) — Extension registry (Claude, 2026-11-26; order change owner-approved)

### 1. In plain language
Each product (Cadence, Sentinel) now has one entry listing its facts: ID, catalog ID, settings prefix,
home page and Square permissions. Code that used to say "if Calendar Sync … else Time Card Manager"
now looks the answer up in that entry. Adding a product (Trace, Lens) means adding an entry, not editing
shared code in four places. The shared registry code never names a product or Square; a product lists
the services it connects to by name (`connections: { square: … }`), and products with none (Trace, Lens)
simply leave it out.

### 2. Could a customer notice?
No. I ran the old and new code on the same inputs and got identical answers for: plugin ID per product,
settings prefix, Square setting lookups (including the legacy unprefixed fallback and the cross-product
block), the legacy redirect address, and each product's home page.
```
old: ["square-calendar-sink","square-time-card-manager","CALENDAR_SYNC","TIME_CARD_MANAGER","cal-app","tcm-app","sandbox","","","https://hosted-saas.vercel.app/api/integrations/square/callback","","","/calendar-sink","/time-card-manager","/dashboard"]
new: ["square-calendar-sink","square-time-card-manager","CALENDAR_SYNC","TIME_CARD_MANAGER","cal-app","tcm-app","sandbox","","","https://hosted-saas.vercel.app/api/integrations/square/callback","","","/calendar-sink","/time-card-manager","/dashboard"]
```
Default Square permissions are pinned by a test against the exact old lists.

### 3. What changed
- New `packages/runtime-kit/registry.ts`: entry shape + checks (unique ID/slug/prefix, valid home path,
  any declared connection must list scopes).
- New `lib/extension-registry.ts`: the two entries. Both live in this one app file because a per-product
  file under `products/<id>/` pulled Sentinel's file into Cadence's import graph (the isolation test caught
  it on the first attempt). Each app gets its own registry when Sentinel/Cadence become separate apps.
- `lib/product-runtime.ts`, `lib/square-product-config.ts`, `lib/square.ts`, `lib/public-routing.ts`:
  read the registry instead of hardcoded product branches.
- New `tests/extension-registry.test.mts` (7 tests) + its `package.json` script.
- **Test assertion changed (AGENTS.md §5.2, needs owner approval):** `tests/calendar-sync.test.mts`
  "Square OAuth supports independent product application settings" checked the source text for the old
  hardcoded `pluginId === "square-calendar-sink" … "CALENDAR_SYNC" … "TIME_CARD_MANAGER"`. It now checks
  that the settings prefix comes from the registry; the actual prefix values are checked by the new tests.
  The other five assertions in that test are unchanged.
- First attempt put "Square" in the shared registry; the boundary check failed it. Fixed by making the
  registry provider-neutral (`connections`), not by touching the check.
No dependencies added.

### 4. Required checks
```
$ node scripts/check-boundaries.mjs
Boundary check: 32 files scanned, 7 rules.
PASS
$ npx depcruise --config .dependency-cruiser.cjs packages
✔ no dependency violations found (39 modules, 36 dependencies cruised)
$ bash scripts/check-test-weakening.sh origin/integration/v1
PASS: no check-weakening patterns added.
$ npm run typecheck
exit 0
$ npm test
tests 112 / pass 112 / fail 0
$ DATABASE_URL unset; npx next build
exit 0
$ npm run build:product-contracts
exit 0
$ (products/time-card-manager) TIME_CARD_MANAGER_DATABASE_URL=<placeholder> npx next build   exit 0
$ (products/calendar-sync) CALENDAR_SYNC_DATABASE_URL=<placeholder> npx next build           exit 0
$ bash scripts/check-isolation.sh sentinel
SKIPPED: apps/sentinel does not exist yet.
```
Test count before → after: 105 → 112 (npm test also gained the registry suite).

### 5. NOT VERIFIED
- Connecting Square on the PR Preview (Square sandbox apps are owner config; Cadence's QA sandbox app is
  known-missing from the Nov 16 baseline).
- PLAN 2.7 part 2 (`TCM_QA_APP_ORIGIN`, `TCM_QA_HOST`): not done; needs a Vercel setting rename.

### 6. Next
Owner: approve the one assertion change. Then 2.7 part 2 decision, then 2.8 (dashboard reads registry).
