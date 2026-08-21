# Hosted SaaS Starter

This project is a Vercel-first starter for `slpcc63.com`, with marketing on the
root domain and the SaaS app on `app.slpcc63.com`.

## Recommended setup

- `slpcc63.com` -> Vercel marketing homepage
- `www.slpcc63.com` -> optional redirect to the apex domain
- `app.slpcc63.com` -> Vercel-hosted SaaS app
- `api.slpcc63.com` -> optional future API split

## How routing works

- the root domain serves the marketing homepage at `/`
- requests for `app.slpcc63.com` are rewritten by middleware to internal app routes
- the app subdomain owns `/` and `/dashboard` externally, even though the code
  lives under internal `/app/*` routes
- the app root and dashboard now require a Better Auth session

## Why this setup fits the project

This gives you:

- one host for domain, DNS, SSL, and deployments
- one codebase for marketing and product
- a clean customer-facing split between public site and application
- an easier path to auth, billing, and product infrastructure

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env template:

   ```bash
   cp .env.example .env.local
   ```

3. Run the app:

   ```bash
   npm run dev
   ```

4. Optional local subdomain testing:

   Visit `http://localhost:3000` for marketing.

   If your browser resolves `app.localhost`, you can also use:

   ```text
   http://app.localhost:3000
   ```

## Demo auth

Better Auth is now installed with email/password auth and is configured for a
Neon-style Postgres database.

- sign-in page: `http://app.localhost:3000/sign-in`
- auth API: `http://app.localhost:3000/api/auth/*`
- set `DATABASE_URL` from Neon before using auth flows
- use `DATABASE_URL_UNPOOLED` for migrations if you want to keep a separate direct connection

## Auth setup

1. Copy `.env.example` to `.env.local`.
2. Set `BETTER_AUTH_SECRET` to a strong random value.
3. Create a free Neon project and paste its connection string into
   `DATABASE_URL`.
4. Run the Better Auth migration:

   ```bash
   npx @better-auth/cli migrate
   ```

5. Start the app and create your first account on the sign-in page.

## Google auth setup

1. Open Google Cloud Console and create an OAuth client of type `Web application`.
2. Add these authorized redirect URIs:

   ```text
   http://localhost:3000/api/auth/callback/google
   https://app.slpcc63.com/api/auth/callback/google
   ```

3. Put the credentials into `.env.local` as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.
4. Restart `npm run dev`.

The Google button appears only when both environment variables are present.

## Suggested next implementation steps

1. Point the app at your free Neon database.
2. Add Stripe billing and customer portal support.
3. Finalize the approved phase 1 scope for the Time Card Manager.
4. Attach both domains in Vercel and deploy.

## Stripe billing setup

The repo now supports a first hosted Stripe flow for subscription checkout and
billing portal access.

1. Add `STRIPE_SECRET_KEY` to `.env.local`.
2. Optionally add `STRIPE_PUBLISHABLE_KEY` if you want it available later for
   frontend billing UI.
3. In Stripe, create recurring prices with these lookup keys:

   ```text
   slpcc63_square_calendar_sync_starter_monthly
   slpcc63_square_calendar_sync_growth_monthly
   slpcc63_square_time_card_manager_operations_monthly
   slpcc63_square_time_card_manager_scale_monthly
   ```

4. Make sure Billing Portal is enabled in your Stripe dashboard.
5. Visit `/subscriptions` in the app and start a plan through hosted Checkout.

For now, successful Checkout returns to the app and syncs the local
subscription row using the Checkout session metadata.

## Current product baseline

- Better Auth protects the app routes
- Neon stores auth data and customer-owned product records
- signed-in users land in the customer dashboard and Time Card Manager screens
- the current approved customer-facing product is the Square Time Card Manager

## Square Time Card Manager baseline

- the seller starts the Square connect flow from your hosted dashboard
- Square shows the authorization screen on its own domain
- Square redirects back to your hosted callback URL
- your app exchanges the authorization code for tokens and stores the Square connection against the customer account
- the current approved workflow centers on missed clock-out notifications
- additional offerings remain unpublished or in backlog until approved

Add these environment variables before testing Square OAuth:

```text
SQUARE_ENVIRONMENT=production
SQUARE_APPLICATION_ID=...
SQUARE_APPLICATION_SECRET=...
SQUARE_REDIRECT_URI=https://app.slpcc63.com/api/integrations/square/callback
SQUARE_SCOPES=MERCHANT_PROFILE_READ TIMECARDS_READ EMPLOYEES_READ
```

## Time Card Manager automation

Time Card Manager automation is now wired for production through a protected app
route plus a scheduled GitHub Actions workflow.

1. Add these environment variables in Vercel and locally:

   ```text
   CRON_SECRET=replace-with-a-long-random-secret
   TIME_CARD_AUTOMATION_LIVE=true
   TIME_CARD_AUTOMATION_WINDOW_MINUTES=60
   TIME_CARD_AUTOMATION_THRESHOLD_HOURS=12
   ```

2. Add this GitHub Actions secret in the `slpcc63/hosted-saas` repo:

   ```text
   TIME_CARD_AUTOMATION_CRON_SECRET=<same value as CRON_SECRET>
   ```

3. The workflow at `.github/workflows/time-card-manager-automation.yml` runs
   every 15 minutes and calls:

   ```text
   https://app.slpcc63.com/api/cron/time-card-manager
   ```

4. The automation route checks for schedule entries whose
   local weekday and time fall inside that window.
5. Each schedule window is deduplicated so the same saved run only executes
   once per cron window.
6. Missed clock-out alerts are also deduplicated per Square timecard so the
   same open timecard is not emailed repeatedly on later runs.

Important notes:

- The scheduler calls the production app only; preview deployments do not run automation.
- Vercel Hobby blocks sub-daily platform cron jobs, which is why this project
  uses GitHub Actions as the runner.
- If you later upgrade Vercel and want platform-native cron, the route can be
  reused without changing the automation engine.

## Phase 1 employee confirmations

Phase 1 uses email only. Managers sync active Square employees, add an email
address and timezone for each employee, send a dated confirmation request, and
review the employee's secure response in the manager inbox.

- Employees choose either "I did not work" or "I worked" in the secure form.
- Worked responses include a shift date, time in, and time out for manager review.
- Every response requires an explicit manager approval or rejection.
- Approved responses are retained as authoritative app records but are not yet
  written back to Square.
- SMS remains disabled unless `TIME_CARD_TEXTING_LIVE=true` is explicitly set
  in a later release with a configured Twilio account.
