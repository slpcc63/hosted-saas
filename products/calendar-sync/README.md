# Calendar Sync product boundary

This directory is the local build-contract root for Cadence. `npm run build`
produces only `.build/product-manifest.json` from `product.json`; it does not
claim a standalone Next.js application yet.

The manifest fixes the intended product-owned runtime, environment, data and
release contract so the later source extraction has an executable acceptance
target. The current shared application remains outside this directory and is
listed as unfinished in `docs/product-environment-release-workflow.md`.
