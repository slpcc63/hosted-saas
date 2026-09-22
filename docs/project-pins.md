# Project Pins

Shared running list of paused or blocked project items so any thread can pick
them back up quickly.

## How to use this file

- Add a new entry whenever we "put a pin in" something.
- Record the current state in plain English.
- Record exactly what is needed from Shannon to unblock the next step.
- Update the status instead of creating duplicate entries.

## Active Pins

### 1. Time card notification provider integration

- Status: Live readiness verified; controlled acceptance pending
- Current state:
  Resend email and consent-gated Twilio SMS are configured in production. The
  shift-specific missing-punch workflow, secure weekly digest, manager summary,
  direct A/B replies for a single eligible shift, approval setting, duplicate
  protection, and 15-minute protected automation route are implemented. On
  September 22, 2026, production Neon access was restored after its compute
  quota was exhausted, and the Square production token was verified with
  `TIMECARDS_READ` and `EMPLOYEES_READ` through October 19, 2026. Calendar-feed
  responses are now cached at Vercel's CDN for 15 minutes to reduce repeated
  Neon and Square work while preserving the Time Card Manager scan cadence.
- What is needed from Shannon:
  - Publish one short controlled Square shift for the enrolled test employee
    without clocking that employee in or out
- Next step when resumed:
  Record one complete detection → employee notification → response → manager
  review scenario, including duplicate protection. Square write-back remains a
  separate later milestone.

### 2. Stripe live billing activation

- Status: Paused
- Current state:
  Hosted Stripe Checkout and Billing Portal are wired into the app. The app can
  create Stripe customers, open Checkout for subscription plans, return through
  a success page, and sync the local subscription row after successful Checkout.
- What is needed from Shannon:
  - `STRIPE_SECRET_KEY`
  - Confirmation to use the seeded Stripe lookup keys as-is, or replacement
    lookup keys / Stripe Price IDs
  - Stripe dashboard setup for recurring prices and Billing Portal
- Next step when resumed:
  Configure the env vars, verify live Checkout end-to-end, then add webhook
  handling so Stripe-side changes sync back automatically.

### 3. Stripe webhook sync

- Status: Paused behind Stripe activation
- Current state:
  The app currently syncs local subscription records on the Checkout success
  return path, but not yet from Stripe webhooks for later lifecycle events.
- What is needed from Shannon:
  - `STRIPE_WEBHOOK_SECRET`
  - A Stripe endpoint configuration once the deployment target is ready
- Next step when resumed:
  Add a webhook route for subscription updates, cancellations, and payment
  failures so local subscription state stays aligned with Stripe.

## Completed / Unpinned

### Customer dashboard foundation

- Status: Implemented
- Notes:
  The dashboard is anchored to `customer_profiles`.

### Customer subscriptions screen

- Status: Implemented
- Notes:
  Customers can now view subscriptions and start, change, or cancel plans in
  the app.

### Admin products screen

- Status: Implemented
- Notes:
  Admins can now view and create seeded product records for the catalog.

### Customer account settings

- Status: Implemented
- Notes:
  Customers can now view and update basic account/profile information.
