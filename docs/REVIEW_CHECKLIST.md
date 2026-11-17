# REVIEW_CHECKLIST.md — for the second-AI reviewer (and a paid human, if used)

How to use: open a **fresh** chat with a different model session than the one that wrote the PR.
Give it: this file, `AGENTS.md`, `docs/ARCHITECTURE.md`, the PR diff, and the author's report.
Ask: "Review this PR against REVIEW_CHECKLIST.md. Answer every item PASS / FAIL / CAN'T TELL
with one line of evidence. Do not be polite; look for reasons it is wrong."

## A. Scope
1. Does the PR do exactly one PLAN item? (list anything extra)
2. Is it a pure move, or does it change behavior? If both, FAIL.
3. Were any protected files touched (AGENTS.md §4)? Was owner approval recorded?

## B. Evidence
4. Is real command output pasted for every command in AGENTS.md §6 (not summaries)?
5. Is the test count equal to or greater than before? Any removed tests/assertions? Any new `.skip`, `@ts-ignore`, `eslint-disable`, `|| true`?
6. Are any `allow` entries added in `guardrails.config.json`? (should be FAIL unless owner approved)
7. Is anything listed as NOT VERIFIED that should have been verified?

## C. Architecture
8. Do shared packages still avoid product names and vendor names?
9. Do cores still avoid importing `connector-square` or mentioning Square?
10. Does any extension import another extension or the hub?
11. Is there now exactly one copy of each moved file? (search the repo for duplicates)
12. Is any product-specific env var or constant now in shared code?

## D. Behavior risk (read the diff, not just the report)
13. Could emails/SMS/billing amounts a customer receives change? Point to the code if yes.
14. Any change to auth, sessions, OAuth, tokens, encryption, Stripe, webhooks, migrations?
    If yes → this PR needs the paid human reviewer before merge.
15. Does any new code swallow errors, add a fallback that hides a failure, or log secrets/PII?
16. Does anything run at import/render time that talks to the network or database?

## E. Verdict
`APPROVE` / `APPROVE WITH NOTES` / `BLOCK` + the three most important concerns.
A reviewer that answers everything PASS without citing evidence is not reviewing; rerun it.
