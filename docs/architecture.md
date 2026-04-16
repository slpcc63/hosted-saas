# Architecture Notes

## Domain layout

- `slpcc63.com`: public marketing site on Vercel
- `www.slpcc63.com`: optional redirect to the apex domain
- `app.slpcc63.com`: custom SaaS app on Vercel

## Routing model

- `app/page.tsx` serves the marketing homepage for the apex domain
- internal product pages live under `app/app/*`
- `middleware.ts` rewrites requests from the app subdomain to the internal
  product routes
- protected product routes read a Better Auth session before rendering
- result:
  - `slpcc63.com/` -> marketing homepage
  - `app.slpcc63.com/` -> internal `/app`
  - `app.slpcc63.com/sign-in` -> internal `/app/sign-in`
  - `app.slpcc63.com/dashboard` -> internal `/app/dashboard`

## Recommended early stack

- Frontend and server rendering: Next.js
- Hosting: Vercel
- Database: Postgres via Supabase, Neon, or Railway
- Auth: Better Auth, Clerk, or Auth.js
- Billing: Stripe
- Email: Resend or Postmark

## Vercel-first decision rule

- keep the root domain focused on positioning and conversion
- keep the app subdomain focused on authenticated product use
- share one deployment system until you have a compelling reason to split into
  multiple repos or services

## Auth notes

- Better Auth is the application auth layer
- email/password auth is enabled now
- Google OAuth can be enabled with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- the scaffold is now shaped for Neon-hosted Postgres
- set `DATABASE_URL` to Neon's connection string
- use `DATABASE_URL_UNPOOLED` for migrations if you keep a separate direct URL

## First app data model

- `workspace_profiles` is the first product-owned table beyond auth
- each authenticated user currently has one workspace profile
- the workspace record is the anchor for the next layer of billing, invites,
  and domain-specific workflows
