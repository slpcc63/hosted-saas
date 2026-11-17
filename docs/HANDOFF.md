# Handoff package — restructuring guardrails

Copy everything in this folder into the **root of the repo** (on a branch off `integration/v1`),
then follow `docs/OWNER_GUIDE.md`.

| File | For | Purpose |
|---|---|---|
| `AGENTS.md` | the AI agent | Rules, protected files, stop-and-ask list, "done" definition |
| `PLAN.md` | agent + owner | Ordered steps, one PR each, with review level and proof |
| `docs/ARCHITECTURE.md` | agent | Target structure, import rules, connector interface draft |
| `docs/OWNER_GUIDE.md` | you | What to press, how to read results, when to hire a reviewer |
| `docs/REPORT_TEMPLATE.md` | agent | Evidence-only report after every step |
| `docs/REVIEW_CHECKLIST.md` | second-AI / human reviewer | Hostile-review checklist |
| `docs/PROGRESS.md` | everyone | Append-only log, starts with the verified baseline |
| `extensions.json`, `guardrails.config.json`, `.dependency-cruiser.cjs` | CI | Machine-readable rules (protected) |
| `scripts/` | CI + agent | `check-boundaries.mjs`, `check-isolation.sh`, `check-test-weakening.sh` |
| `.github/workflows/guardrails.yml`, `.github/CODEOWNERS` | GitHub | Runs the checks; requires your approval to change protected files |

Requires in the repo: `npm i -D typescript@^5 dependency-cruiser` (TypeScript 7+ makes
dependency-cruiser silently skip .ts files; CI fails if that happens).
