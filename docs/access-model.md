# Access Model

This document describes the first-pass access rules for the product catalog,
customer app, and admin area.

## Important auth note

The current app uses Better Auth, not Supabase Auth. The SQL policies in
`supabase/migrations` assume requests eventually reach Postgres with a user id
available through `auth.uid()`. That is the standard Supabase RLS model.

Until the app uses Supabase Auth or injects equivalent JWT claims for database
requests, customer authorization still needs to be enforced in the application
server.

## Public visitors

Public visitors can:

- view published products
- view active plans for published products
- view approved reviews
- view public demos
- submit leads and quote requests

Public visitors cannot:

- view customer records
- view subscriptions
- view invoices
- view payment methods
- access admin-only data

## Signed-in customers

Signed-in customers can:

- view their own customer profile
- edit their own customer profile
- view their own subscriptions
- view their own invoices
- view their own saved payment methods

Signed-in customers should not directly update billing or subscription rows from
the client. Subscription changes, cancellations, billing changes, and payment
workflows should go through secure server actions, API routes, or provider
webhooks.

## Admin users

Admin users can:

- create and edit products
- create and edit plans
- manage demos
- manage reviews
- view and manage customers
- view and manage subscriptions
- view and manage leads
- handle billing exceptions

Admin access is represented by the `app_admins` table in the migration.
