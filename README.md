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
2. Use the built-in workspace setup flow to create your first workspace.
3. Add Stripe billing and customer portal support.
4. Add your first real customer data model.
5. Attach both domains in Vercel and deploy.

## Current product baseline

- Better Auth protects the app routes
- Neon stores auth data and the first `workspace_profiles` record for each user
- signed-in users can create and edit their workspace from `/` and `/dashboard`
