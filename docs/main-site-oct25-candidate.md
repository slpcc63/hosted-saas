# October 25 Main Site candidate

Branch: `release/main-site-oct25`. Base: `ef1080c` (Calendar P0 safeguards).
The existing dirty shared checkout was inspected and preserved. This candidate
selectively carries its billing fail-closed actions, payment/ownership validation,
and subscription UI; unrelated seed tooling and generated files are excluded.

## Implemented

- Static homepage with all three offerings, accurate scope and availability.
- Central product destinations in `lib/public-products.ts`.
- Public header without auth/database imports, shared by homepage and legal pages.
- Public navigation, manager sign-in, private employee access explanation.
- Existing privacy and SMS terms remain publicly reachable without a database.
- No local subscription creation/change/cancellation fallback when Stripe is absent.
- Checkout success requires completed paid checkout and matching Stripe/local customer.
- `BILLING_CHECKOUT_ENABLED=true` AND a Stripe key are required before billing is available.
  Leave the switch unset until the full authoritative billing lifecycle is accepted.

## Verified locally, October 23, 2026

- Existing suite: 40 tests passed (15 calendar, 16 response, 9 missing-punch).
- `npm run typecheck` passed.
- `npm run build` passed; `/`, `/privacy`, `/terms` prerender as static pages.
- Production server with DATABASE_URL pointing to unreachable 127.0.0.1:1:
  homepage, privacy and terms each HTTP 200.
- Desktop browser review and 375 × 812 phone-width review; scroll width 375.
- Phone menu opens and closes after product navigation; content and calls to action fit.
- Live destination HTTP checks: sign-in 200; manager routes redirect to sign-in
  preserving their requested product path; accepted prototype preview 200.
- Dependency compiler emitted missing native SWC warnings but completed using fallback.
- Billing changes were reviewed at source level; Stripe lifecycle acceptance was not run.

## Exact extension and release contracts still unresolved

| Owner | Required evidence / decision | Current candidate behavior |
| --- | --- | --- |
| Calendar Sync | Isolated authenticated acceptance, scopes, encrypted production key and token migration, Apple/Google subscription acceptance, support owner and promotion status | Controlled pilot; existing app manager URL, no production-ready claim |
| Time Card Manager | Demo entitlement procedure, allowed delivery modes, provider and scheduler acceptance, production token migration, Stripe lifecycle decision | Assisted demo; manager sign-in; no public purchase claim; checkout default off |
| Closing Checklist | Confirm accepted preview remains Oct 25 destination; separately approve any promotion | Links remediated preview; explicitly no persistence or Square changes |
| Main Site / platform | Healthy hosted preview of exact commit without Production database access; review auth fail-closed and other production security requirements before promotion | Only local preview verified; no hosted deployment made |
| Main Site / Shannon | Identify project serving apex, then separately approve production/routing changes | Apex untouched; its old starter and legal 404 remain a production blocker |
| Legal / product owner | Review suite-wide privacy/terms coverage and support contact | Existing pages cover Time Card Manager messaging only; suite-wide coverage is not accepted |
| Shared platform | Dashboard entitlement filtering and authenticated installed-tool acceptance | Existing implementation retained; not accepted by this marketing verification |

## Next approval

Approve one non-production Vercel Preview deployment of this candidate in the existing
hosted-saas project, with no Production database access and no alias, production
configuration, promotion, or DNS changes. Identify the resulting deployment and exact
commit, verify homepage/legal/CTA behavior there, then request a separate production
approval only after remaining launch gates are resolved.

The handoff explicitly forbids deployment without separate approval. No Git push,
hosted deployment, production configuration, alias, DNS, billing activation, or
production data change was performed in this session.
