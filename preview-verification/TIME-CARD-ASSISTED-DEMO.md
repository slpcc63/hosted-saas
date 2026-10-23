# Time Card Manager controlled assisted demo

Status: Preview infrastructure verified; authenticated customer workflow is pending.

Safety boundary: independent Neon project `polished-river-37255905`, Preview-only connection, synthetic data only. New Preview credentials were rejected by the Production endpoint (28P01). Production data was not queried. Preview rejects a database URL that differs from the explicit host/database/role binding. Square Sandbox only; live billing, messaging and automation disabled. No paid customer rollout.

Completed: fresh Time Card schema initialization and repeat initialization; empty authentication, subscription, product and Square connection tables; parser, missing-punch, Calendar, public-artifact, auth and database-binding tests; production-mode build.

Acceptance path:
1. Arrange a synthetic employer account and Preview-only demo entitlement. Keep public registration disabled; never use a Production account or subscription.
2. Configure Square Sandbox OAuth for the exact Preview callback `/api/integrations/square/callback`. Use a Sandbox seller with synthetic employees and labor entries. No Production credentials or merchant data.
3. Sign in, connect Sandbox, confirm the selected synthetic location and employees, inspect the Time Card report and verify dates/timezone, totals and CSV export against the Sandbox fixture.
4. Use synthetic contacts with reserved `.invalid` addresses. Preview a missing-punch digest and employee confirmation, record a synthetic reply, inspect owner review/audit history. Do not send external mail/SMS or enable scheduled execution.
5. Confirm a second synthetic employer cannot read the first employer's reports, private responses, or export. Disconnect Sandbox and verify authorization removal.
6. Shannon accepts the demonstrated results before any broader access decision. A separate explicit approval is required for any Production change or paid customer rollout.

Blocker: no Square Sandbox application/seller connection or approved demo identity is configured. No authenticated or Square-backed workflow is claimed as demonstrated.
