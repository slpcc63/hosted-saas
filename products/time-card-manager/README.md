# Time Card Manager product boundary

This directory is the local build-contract root for Sentinel. `npm run build`
produces only `.build/product-manifest.json` from `product.json`; it does not
claim a standalone Next.js application yet.

The contract excludes Calendar Sync runtime and secrets and records the target
data, environment and release boundary for the later source extraction.
