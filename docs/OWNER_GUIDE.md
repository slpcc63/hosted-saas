# OWNER_GUIDE.md — what you do, in order. You never need to read the code.

Your job is three things: **press the buttons, read green/red, and hold the stop line.**

## 1. Get `integration/v1` onto GitHub (one time)
The branch was built by Claude in a sandbox and handed over as a file:
`hosted-saas-integration-v1.bundle`. In Terminal:
```
cd ~/slpcc63/hosted-saas
git fetch origin                       # makes sure QA and 97f5640 exist locally
git fetch /path/to/hosted-saas-integration-v1.bundle integration/v1:integration/v1
git log --oneline -3 integration/v1    # top commit should be dc69436 "Resolve @/lib aliases generically in calendar seed verification"
git push origin integration/v1
```
If `git fetch` of the bundle complains about missing commits, run `git fetch origin` again and
tell Claude the exact error text.

## 2. Turn on the safety net in GitHub (5 minutes, Settings → Branches)
For `integration/v1` (and later `qa` and `main`) add a protection rule:
- Require a pull request before merging, with **1 approval**.
- **Require review from Code Owners** (this is what protects the "protected files").
- Require status checks to pass: select `guardrails` once the first CI run exists.
- Do not allow force pushes; do not allow deletions.
Also add `.github/CODEOWNERS` (included) and check the username in it is yours.

## 3. Before refactoring: baseline QA (PLAN 0.2)
Deploy QA from `integration/v1`. Click through signup, subscribe, dashboard, each extension page.
Write what works and what is already broken in `docs/PROGRESS.md`. Anything broken *now* must
not be blamed on the refactor later.

## 4. Running a session with Codex (or any agent)
One session = one PLAN item. Start a fresh session each time. Paste:

> Read AGENTS.md, then PLAN.md, then docs/ARCHITECTURE.md, then the last entry of docs/PROGRESS.md.
> Work only on PLAN item **<number>**, on a new branch off `integration/v1`. Follow AGENTS.md exactly,
> including the stop-and-ask list. When finished, fill docs/REPORT_TEMPLATE.md with real command
> output and append it to docs/PROGRESS.md. Do not start the next item.

## 5. Reading the result (this is the whole job)
1. **Is CI green?** Red = not done, whatever the report says. Do not merge red.
2. **Read report sections 2, 4 and 6 only** (customer-visible change? protected files touched?
   what was NOT verified?). Red flags:
   - It says "should", "likely", "probably", or summarizes output instead of pasting it.
   - Section 4 says yes and there is no approval line from you.
   - The test count went down.
   - "NOT VERIFIED: none" on a big change.
   - It touched more than the one PLAN item.
3. **Run the second-AI review** (docs/REVIEW_CHECKLIST.md) in a fresh chat. Any BLOCK, or an
   all-PASS with no evidence → ask the author to fix, or rerun the reviewer.
4. **Check the review level** on the PLAN item. M → merge if 1–3 are fine. D → the second-AI review
   must say APPROVE. **H → do not merge until the paid human reviewer has looked (below).**
5. Merge. Tick the box in PLAN.md.

## 6. The stop line
If the agent stops and asks you something from AGENTS.md §5, that means the system is working.
You don't need to judge the code; judge the options it offers. Good questions to ask back:
"What breaks for a customer if I choose each option?" and "What did you check to know that?"
If you can't tell, bring the question to Claude or the paid reviewer rather than guessing.

## 7. The paid reviewer (items marked H: about 5 reviews in total)
Hire a freelance developer who knows TypeScript, Next.js and Postgres, ideally someone who has
worked with OAuth/Stripe. Hand them: ARCHITECTURE.md, the PR diff, and this exact ask:
"Review only for security and correctness of auth, tokens, billing and the connector interface.
List anything that could leak a token, double-charge, or lock a customer out." Scope each review
to a few hours. If you decide not to hire: the fallback is two independent AI reviews (different
models) **plus** you test the specific flow by hand in QA, and you skip nothing marked H —
just slow down. Do not cut over prod without the human review of auth and billing.

## 8. Public-repo hygiene
The repos are public now. Claude scanned git history for keys with a pattern search and found
only placeholder and localhost URLs, but that is not a full audit. Run `gitleaks detect` on each
repo once, and make them private again when you can.

## 9. Branch cleanup (only after QA passes from integration/v1)
Tag first so nothing is lost, then delete:
```
git tag archive/<branch> origin/<branch> && git push origin archive/<branch>
```
Keep `release/main-site-oct25` as the demo candidate. Port its general bug fixes later (date
preservation in time-card reports, safe disconnect/revocation, per-preview OAuth callbacks).
