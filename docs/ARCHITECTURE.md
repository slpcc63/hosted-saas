# ARCHITECTURE.md — target structure and why

## 1. Layout
```
apps/web                    marketing, signup, billing UI, dashboard shell
apps/sentinel               thin Next app: routes/pages for Time Card Manager
apps/cadence                thin Next app: routes/pages for Calendar Sync
apps/closeout               (later) closing checklist
packages/identity           auth, customers, profiles
packages/billing            subscriptions, products, entitlements, Stripe wrapper
packages/connector-kit      Connector interfaces + shared types, OAuth/connection store, token crypto
packages/runtime-kit        extension registry + per-extension runtime/env selection
packages/connector-square   Square implementation of connector-kit interfaces
packages/sentinel-core      data model + workflows (NO Square imports)
packages/cadence-core       data model + workflows (NO Square imports)
packages/closeout-core      (later)
```

## 2. Who may import whom
| from \ to        | shared pkgs | own core | connector-kit | connector-square | other extension | hub |
|------------------|:-----------:|:--------:|:-------------:|:----------------:|:---------------:|:---:|
| apps/web         | yes         | no*      | yes           | no               | no*             | —   |
| apps/<ext>       | yes         | yes      | yes           | yes (wiring)     | **no**          | **no** |
| packages/<ext>-core | yes      | —        | yes           | **no**           | **no**          | **no** |
| connector-square | kit only    | no       | yes           | —                | **no**          | no  |
| shared pkgs      | each other  | no       | yes           | no               | **no**          | no  |

\* The hub reaches extensions only through the registry in `runtime-kit`.
Enforced by `.dependency-cruiser.cjs` (imports) and `guardrails.config.json` (names).

## 3. Why these rules exist
- **Independence:** a customer can subscribe to one extension; each must build, test and deploy
  alone. `scripts/check-isolation.sh` proves it by deleting everything else and building.
- **Connectors later:** cores depend on interfaces, so a new API (Clover, Toast…) is a new
  `connector-*` package with no core changes.
- **Easy versioning:** each extension's version, migrations and flags live with that extension.
- **One copy:** shared logic exists once; fixes (like the auth preview-origin fix) are applied once.

## 4. Connector interfaces (draft — finalize in PLAN 2.5 from real call sites)
```ts
// packages/connector-kit
export interface Worker    { id: string; name: string; email?: string; phone?: string }
export interface TimeEntry { id: string; workerId: string; start: string; end?: string; breaks?: Break[]; jobId?: string }
export interface Shift     { id: string; workerId: string; start: string; end: string; jobId?: string }

export interface TimeSource {
  listWorkers(): Promise<Worker[]>;
  openTimeEntries(): Promise<TimeEntry[]>;
  timeEntriesByDay(day: string): Promise<TimeEntry[]>;
  updateTimeEntry(id: string, patch: Partial<TimeEntry>): Promise<TimeEntry>;
  closeTimeEntry(id: string, end: string): Promise<TimeEntry>;   // needed by Closeout too
  listShifts(range: { from: string; to: string }): Promise<Shift[]>;
}
export interface ScheduleSource { /* what Cadence reads; derive from its call sites */ }
```
Square-specific types (`SquareTimecard`, `SquareTeamMember`, `SquareScheduledShift`) live only in
`connector-square` and are mapped to the generic types at the boundary. Three copies of the
Square types exist today (hosted-saas/sentinel/cadence, plus the checklist repo); end state: one.

## 5. Data and migrations
Migrations only. Each extension owns its tables in its own migrations folder; shared tables
(customers, subscriptions, connections) belong to the shared packages. No runtime `CREATE TABLE`.

## 6. Entitlements
One function decides access: `hasAccess(account, extensionId)`. Nothing else checks subscriptions.
