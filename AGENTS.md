# AGENTS.md — rules for any AI agent (Codex, ChatGPT, Claude) working in this repo

You are restructuring a working product. The owner is a product owner, not a programmer, and
will judge your work by **command output and plain-language reports, not by reading code**.
Your claims count for nothing until a command proves them.

## 1. Read first, every session
1. This file, then `PLAN.md` (find the first unchecked item; work only on that item).
2. `docs/ARCHITECTURE.md` (target structure and the rules behind it).
3. The last entry in `docs/PROGRESS.md` (what happened last session).

Do not rely on chat history. If the repo files and the chat disagree, the repo files win.

## 2. The target in one paragraph
One repo. `apps/web` is the marketing site, signup, billing and dashboard. Each extension
(`sentinel`, `cadence`, later `closeout`) is an `apps/<name>` plus a `packages/<name>-core`
holding its data model and business logic. Core code never mentions Square: it uses interfaces
from `packages/connector-kit`, and `packages/connector-square` implements them. Shared packages
(`identity`, `billing`, `connector-kit`, `runtime-kit`) never mention any product by name.
Extensions never import each other or the hub. The dashboard learns about extensions through a
registry, not by importing them.

## 3. Hard rules (CI enforces most; you must follow all)
- Work only on a branch off `integration/v1`. **Never** touch `main`, `qa`, `release/*`,
  prod branches or deploy settings. Never force-push, rewrite history, or delete branches.
- **One PR = one step of PLAN.md.** Move code OR change behavior, never both in one PR.
  A "move" PR changes only paths and imports.
- Behavior must not change unless PLAN.md says so. Pin current behavior with tests *before*
  refactoring anything that sends email/SMS, talks to Square, or touches billing.
- Do not add dependencies without listing them in the report with a one-line reason.
- Never commit secrets, `.env` files, databases (`*.db`), or build output (`.next`, `*.tsbuildinfo`).
- Do not write real credentials into any command, log or report.

## 4. Protected files — you may not edit these without owner approval
`extensions.json`, `guardrails.config.json`, `.dependency-cruiser.cjs`, `scripts/`, `.github/`,
`AGENTS.md`, `PLAN.md`, `docs/ARCHITECTURE.md`, `docs/REVIEW_CHECKLIST.md`.
If a check fails and the "fix" is to change one of these, **stop and ask**. A failing check
means the code is wrong, not the check. Only exception: ticking boxes and adding notes in `PLAN.md`
and appending to `docs/PROGRESS.md`.

## 5. Stop and ask the owner (do not continue, do not work around) when
1. A check fails and you think the check is wrong.
2. You want to edit, skip, loosen or delete any test or assertion, or add an allow-list entry.
3. The change touches: OAuth, token storage/encryption, Stripe/billing, webhook handling,
   SMS/email sending, database migrations, auth/session code, or production env/deploy config.
4. You are about to change what a customer sees or receives (emails, texts, billing amounts).
5. The step in PLAN.md is unclear, or doing it would require a step that is not in PLAN.md.
6. Something you did not expect is in the repo (secrets, unexplained files, branches).
7. You have tried the same fix 3 times without success. Stop, report, and ask. Do not loop.

Asking looks like: what you were doing, what blocked you, 2 options with trade-offs, your
recommendation. Then stop.

## 6. Before you say "done"
Run these and paste the **actual output** into the report (not a summary of it):
```
node scripts/check-boundaries.mjs
npx depcruise --config .dependency-cruiser.cjs apps packages   # only the folders that exist; SKIPPED if neither does yet
bash scripts/check-test-weakening.sh origin/integration/v1
npm run typecheck
npm test
bash scripts/check-isolation.sh sentinel     # and cadence / closeout once those apps exist
```
Any command you cannot run, or that fails, is listed as **NOT VERIFIED** with the reason.
Never write "should work", "likely passes" or "all tests pass" without the output next to it.

## 7. Report format (fill `docs/REPORT_TEMPLATE.md`; append it to `docs/PROGRESS.md`)
Plain language first. A non-programmer must be able to tell what changed, whether anything a
customer could notice changed, and what you did not check.

## 8. Known issues the plan must remove (do not hide or paper over these)
- `TCM_QA_APP_ORIGIN` (a Sentinel-only setting) lives in shared `lib/deployment.ts`; it is
  allow-listed with an expiry in `guardrails.config.json` until Phase 2 moves it.
- ~41 platform files are duplicated byte-for-byte across `sentinel`, `cadence` and `hosted-saas`.
  After extraction there must be exactly one copy.
- `lib/time-card-email-workflow.ts` (~2,100 lines) mixes workflow, Square calls, email, SMS and
  table creation. `lib/square-time-card-manager.ts` (~1,400 lines) is mostly Sentinel settings,
  not Square. `app/app/actions.ts` mixes both extensions' actions.
- `app/page.tsx` calls `ensureSeedCatalog()` at render, so `next build` needs a database.
- Tables are created both at runtime (`ensure…Table`) and by migrations. Migrations win.
