# Square connection separation

Calendar Sync and Time Card Manager no longer select the same saved Square
connection. New connections are keyed by both customer and product.

## Existing data

Rows created before this change have a null `plugin_id`. They are preserved and
treated only as Calendar Sync's legacy connection. Time Card Manager never reads
or deletes a legacy row and remains disconnected until it receives its own OAuth
authorization.

Do not copy the legacy access and refresh tokens into a Time Card Manager row.
Both copies would still represent one Square application authorization, so a
Calendar Sync revocation could invalidate Time Card Manager at Square even though
the local rows were separate.

## Controlled rollout

1. Create a distinct Square application for Time Card Manager.
2. Configure the `TIME_CARD_MANAGER_SQUARE_*` variables in a non-production
   deployment. The code deliberately does not fall back to Calendar Sync's
   legacy Square credentials.
3. Authorize Time Card Manager and verify that a
   `square-time-card-manager` connection row is created.
4. Verify Time Card Manager reads that row and Calendar Sync continues to read
   either its `square-calendar-sink` row or the preserved legacy row.
5. In non-production, disconnect Calendar Sync and verify only its authorization
   and row are removed while Time Card Manager remains connected.
6. Repeat for production only after separate approval, with a database backup,
   a customer reauthorization window, and an encryption-compatible rollback.

No live credentials, rows, authorizations, deployments, or customer sessions are
changed by the source implementation alone.
