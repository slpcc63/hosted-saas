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

- Status: Paused
- Current state:
  Subscription-aware entitlement, notification settings, schedule controls,
  monthly text usage tracking, and managed email sender addresses on
  `@slpcc63.com` are now wired in-app for the Square Time Card Manager. A
  Resend-compatible email helper is in the codebase, and the app can now send a
  manual Time Card Manager test email plus a missed clock-out alert email
  through the configured managed sender. The app can also scan live Square open
  timecards and send missed clock-out alerts when the existing Square
  connection includes `TIMECARDS_READ` and `EMPLOYEES_READ`. SMS still needs a
  provider, and scheduled runs are not yet hooked into a background job.
- What is needed from Shannon:
  - Which email provider should send these notifications
  - Which texting provider should send SMS
  - Whether scheduled runs should use Vercel cron, workflow jobs, or another
    runner
- Next step when resumed:
  Move from manual live scans to automated Square-backed detection runs, then
  connect SMS and scheduled runs to the chosen automation/runtime path.

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
