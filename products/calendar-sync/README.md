# Calendar Sync product boundary

This directory is the local Next.js application root for Cadence. The `npm run build`
command creates the independent framework output with the Calendar Sync runtime
marker. `npm run build:contract` separately writes the contract-consistency
manifest from `product.json`.

Cadence requires its own database, encryption key and `CALENDAR_SYNC_SQUARE_*`
settings. It fails closed when those owned settings are absent and cannot read
Sentinel's Square configuration. Deployment/project separation remains pending
as described in `docs/product-environment-release-workflow.md`.
