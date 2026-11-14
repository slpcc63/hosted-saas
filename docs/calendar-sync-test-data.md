# Calendar Sync test schedules and demos

Use Node.js 24 (tested with 24.14). This utility talks exclusively to **Square Sandbox**. It does not connect to the hosted database, enable a live pilot, create timecards, send employee invitations, or run Time Card Manager. Published schedule notifications are explicitly disabled.

## One-time setup

In Square Developer Console, open the existing application's **Sandbox** credentials. Put its Sandbox access token in the ignored file `.env.calendar-sync.local` in the repository root:

```dotenv
SQUARE_SANDBOX_ACCESS_TOKEN=your-sandbox-token
```

Use a Sandbox personal access token, or a Sandbox OAuth token with `MERCHANT_PROFILE_READ`, `EMPLOYEES_READ`, `EMPLOYEES_WRITE`, `TIMECARDS_READ`, and `TIMECARDS_WRITE`. Production credentials are never used as a fallback. No paid scheduling plan is needed for this API test.

## Create a test or demo

Choose a memorable new run name, date, and number of days (1–14). With no date, a new run starts tomorrow by UTC date; explicit dates avoid ambiguity near midnight. Times are 9am–1pm and 10am–2pm in the selected Square location's timezone, including daylight-saving offsets.

```sh
# Offline preview; no credentials or network needed.
npm run calendar:seed -- plan --run demo-october --date 2026-10-05 --days 3

# Create the planned schedules in Sandbox.
npm run calendar:seed -- seed --run demo-october --date 2026-10-05 --days 3

# Read the real Square records through the app's Square reader and build calendars.
npm run calendar:seed -- verify --run demo-october
```

For multiple active Sandbox locations, pass `--location SANDBOX_LOCATION_ID`. The script refuses to choose between locations. It creates two fictional employees, Alex Test and Casey Test (with the run name appended), and two clearly labeled test jobs. Employees have no email address or phone number. The script creates their profiles first, then assigns the required test job through Square’s wage-setting endpoint using a fictional $20/hour rate. Creating both in one request fails in this Sandbox because of a permission-set prerequisite; the separate endpoint works. No timecards or payroll runs are created. Each day has two overlapping published shifts. An additional unpublished shift tests draft exclusion. Dates for a future subscribed feed should fall within the app's feed window (7 days back through 62 days ahead).

The manifest is `.calendar-sync-seeds/RUN.json`. It contains IDs and test data, never the access token. Preserve it: repeated `seed` calls resume that run with the same IDs and idempotency keys. After a request failure, run the exact command again. To change dates or duration, choose a new run name. Do not manually publish or reassign records during seeding. Do not run two commands against the same manifest simultaneously. After a crash, remove a leftover `.lock` file only after confirming its recorded process is no longer running.

## Verify and inspect

`verify` reads actual Sandbox records with `lib/square.ts`, then renders with `lib/icalendar.ts`. It checks published/assigned filtering, draft exclusion, employee isolation, timestamps, location, role, unique stable event identities, coworker context, and stable ETags. It writes:

- `.calendar-sync-seeds/RUN-calendar/alex.ics`
- `.calendar-sync-seeds/RUN-calendar/casey.ics`
- `.calendar-sync-seeds/RUN-calendar/verification.json`

The JSON records source hashes and verification time. The ICS files can be opened for a visual demo, but an imported file is a snapshot, not a subscription. This API-to-calendar check does **not** establish hosted database/feed-token routing, subscribed-client refresh, or live-pilot acceptance. A full hosted integration test needs a separate Sandbox-configured app and isolated test database; do not switch production to Sandbox or put a Sandbox connection into the production customer record.

## Clean up this run

```sh
npm run calendar:seed -- cleanup --run demo-october
```

Cleanup checks the saved ownership marker, employee, job, and location before permanently deleting each recorded test shift. It verifies deletion with a subsequent read and safely resumes if a deletion response was lost. Published deletions also suppress notifications. The two fictional employees are deactivated. Square's job records remain, clearly labeled as test jobs; the API does not expose job deletion. The manifest remains as an audit record. Use a new run name for the next demo. Keep `.env.calendar-sync.local` and `.calendar-sync-seeds/` out of Git.

## Developer checks

```sh
npm run test:calendar-seed
npm run test:calendar-sync
```

Local tests use an in-memory API model to verify request safety and recovery; they are not evidence that Square accepted a seed. Only a successful Sandbox `seed` followed by `verify` proves that.

API references: [manage scheduled shifts](https://developer.squareup.com/docs/labor-api/manage-scheduled-shifts), [create team member](https://developer.squareup.com/reference/square/team-api/create-team-member), [publish scheduled shift](https://developer.squareup.com/reference/square/labor-api/publish-scheduled-shift).
