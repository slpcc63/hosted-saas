# Cadence and Sentinel environment and release workflow

## Status of this cutoff

This checkpoint records executable product boundary contracts and a release
workflow. It does **not** complete the extension split. Both products still run
inside the root Next.js application, use one root `package.json`, and deploy
through one Vercel project. The accepted Square Sandbox disconnect evidence at
commit `8c43bc1` proves authorization and stored-connection isolation only.

The remaining full local extraction is estimated at **6–8 additional Codex
points** after this checkpoint: move each product's pages, APIs and runtime into
its own application root; replace shared database and encryption settings with
product-owned settings; introduce a side-effect-free shared identity package;
and pass two real Next.js builds plus isolation regression tests. Separate
Vercel projects, domains, provider configuration, migration and production
cutover are later approval-gated work.

## Source and branch model

1. Select one reviewed common baseline by exact commit. Record why it is the
   baseline and which QA evidence belongs to it.
2. Create `release/calendar-sync/<candidate>` and
   `release/time-card-manager/<candidate>` from that same baseline. Never stack
   one product branch on the other.
3. Product changes stay inside their application root plus reviewed shared
   packages. Shared packages must be side-effect-free: no database connection,
   OAuth request, token revocation, email, SMS or scheduled work at import time.
4. Authentication is a shared identity contract only (`auth_user_id`,
   `customer_profile_id`, `display_name`, `email`). Product settings,
   connections and operational data remain owned by the product. Products map
   ownership by the stable auth user ID; email alone never associates identity.
5. Merge shared-baseline changes into each candidate separately and rerun that
   product's gates. Never promote an unrelated stacked product branch.

## Target application roots

- `products/calendar-sync`: Cadence build root. It will own Calendar pages,
  feed APIs, Square callback/disconnect handling and Calendar workers.
- `products/time-card-manager`: Sentinel build root. It will own manager and
  employee pages, Square callback/disconnect handling, email/SMS workflows and
  scheduled runners.
- `packages/*`: reviewed side-effect-free schemas, identity types and UI
  primitives only. A package that opens a database or calls a provider belongs
  to one product, not `packages`.

The current `product.json` files are executable target contracts. Their builds
do not consume provider secrets and deliberately cannot be mistaken for a full
Next.js application build.

## Environment and data ownership

| Boundary | Cadence | Sentinel |
| --- | --- | --- |
| Database | `CALENDAR_SYNC_DATABASE_URL` | `TIME_CARD_MANAGER_DATABASE_URL` |
| Token encryption | `CALENDAR_SYNC_SQUARE_TOKEN_ENCRYPTION_KEY` | `TIME_CARD_MANAGER_SQUARE_TOKEN_ENCRYPTION_KEY` |
| Square application | `CALENDAR_SYNC_SQUARE_*` | `TIME_CARD_MANAGER_SQUARE_*` |
| Callback | Cadence project callback | Sentinel project callback |
| Connection row | `square-calendar-sink` | `square-time-card-manager` |
| Operational data | feeds and deliveries | punches, responses, notifications and runs |

No product may fall back to the other product's database, encryption key,
Square application, callback, connection row or operational tables. Legacy
shared values are migration inputs only and require a separately approved,
backed-up, rollback-compatible procedure.

## Local and QA gates

For every candidate:

1. Run the product's contract build and boundary test from a clean checkout.
2. Run that product's focused unit/integration suite with synthetic local data.
3. Run its real framework build with only its environment contract available.
4. Confirm imports and generated output contain no other-product runtime.
5. Confirm disconnect/delete/revoke statements include the owned plugin ID and
   cannot select or mutate the other product's rows.
6. Record the exact commit, build output hash, tests and database fixture.

Until separate QA projects exist, only one named candidate may own the temporary
shared QA alias at a time. Record the prior alias target, candidate commit and
rollback target before promotion. The other product's accepted QA evidence is
preserved, not silently replaced.

## Deployment, promotion and rollback

The final boundary requires two Vercel projects with independent environment
variables, domains, deployment histories and rollback targets. A product is
promotable only after its exact candidate passes its own build and QA gates.
Rollback means selecting a prior deployment from the same product project whose
database/encryption reader is compatible with current data.

Production promotion requires separate authorization. It must not create or
move credentials, migrate live data, change domains, contact customers or alter
provider settings under this local workflow alone.
