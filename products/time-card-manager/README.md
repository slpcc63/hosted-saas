# Time Card Manager product boundary

This directory is the local Next.js application root for Sentinel. The `npm run build`
command creates the independent framework output with the Time Card Manager
runtime marker. `npm run build:contract` separately writes the
contract-consistency manifest from `product.json`.

Sentinel requires its own database, encryption key and
`TIME_CARD_MANAGER_SQUARE_*` settings. It fails closed when those owned settings
are absent and cannot read Cadence's Square configuration. Deployment/project
separation remains pending in the workflow document.
