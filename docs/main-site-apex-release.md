# Public apex release candidate — October 23, 2026

## Release scope

The next release is the public assisted-access hub at `slpcc63.com`. It includes
all three accurately labeled products, suite privacy and terms, the confirmed
monitored support address `support@slpcc63.com`, and the accepted Closing Checklist
production destination `https://closing-checklist-platform.vercel.app`.

It does not release the shared customer application, activate billing or providers,
provision a database, migrate Square tokens, or accept authenticated product workflows.
Those remain separate releases on `app.slpcc63.com`. The public copy explicitly limits
Calendar Sync to a controlled pilot, Time Card Manager to assisted access, and
Closing Checklist to a non-persistent, non-Square-changing prototype.

## Public artifact and isolation

`npm run build:public` builds with unreachable database URLs and disabled provider
credentials, then packages only the prerendered homepage, privacy, terms, a 404 page,
and browser assets into `.vercel/output`. No functions, middleware, APIs, secrets,
customer records, or authenticated app routes are included. Two artifact tests exercise
exclusion of private files and stale functions, and failure without required public pages.

This public package is the apex release artifact. Do not deploy the full shared Next.js
application as the public release. Added employee legal links in shared app source are
prepared for a later app release; they are excluded from the public package and have
not been accepted against authenticated employee data.

## Legal coverage

The pages describe actual product/data boundaries, hosting logs, account/session data,
Square authorization, private calendar links and provider copies, employee response
records, optional messaging, prototype resets, sharing, retention limitations, and
support/privacy requests. Existing SMS consent, STOP/HELP, frequency, charge, and
mobile-data marketing restrictions are retained. Operator is identified by the existing
SLPCC63 service name; no unverified company entity, jurisdiction, retention deadline,
compliance certification, or contractual service guarantee is invented.

Shannon confirmed the monitored support email in this chat. The revised legal text is
part of the candidate for owner approval; preparation and successful links do not
constitute a legal-compliance certification. Reference for the factual data inventory
approach: https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business-0

## Apex routing resolved by read-only inspection

- Team: `team_JnDwaD8py4wOwbQI47xsBKMI`
- Project: `prj_Vsytpghaw0Vmoq4PBXi2EC7puKZx` (`hosted-saas`)
- Existing apex alias: `slpcc63.com`
- Current apex deployment: `dpl_BxkJjEnQagq8cRkyKc6cury8SoTH`
- Current apex URL: `hosted-saas-nnfc9dwlq-slpcc63-8889s-projects.vercel.app`
- Current app production: `dpl_jykTNKVv4eruFMxcHMET3c3K9taz` at `1998042`.
- App aliases: `app.slpcc63.com`, `hosted-saas.vercel.app`,
  `hosted-saas-slpcc63-8889s-projects.vercel.app`.
- Domain config reports `misconfigured=false`; existing Vercel nameservers are active.
  It separately reports `ipStatus=required-change` with recommended IPv4 metadata.
  Do not change DNS based on this advisory alone: current HTTPS serves correctly;
  the stale content is explained by the recorded deployment alias.

## Approval and narrowly scoped execution plan

Only Preview deployment is authorized at present. After the candidate and legal text
are approved, the proposed production action is to stage the exact static artifact
using `--prebuilt --prod --skip-domain`, smoke-test that deployment, then assign ONLY
`slpcc63.com` to it with the existing explicit team scope. Do not use project-wide
`vercel promote`: it could move the app aliases to a static marketing artifact.

Immediately before any approved production action, capture fresh apex/app alias
metadata and verify there is no concurrent release. Preserve all app aliases and DNS.
Apex `/`, `/privacy`, `/terms`, assets, phone navigation, support link, and outbound
product handoffs must pass after assignment. Known legacy manager entry paths redirect
to the existing app; API and unknown paths return 404 in the static artifact.

Rollback is an apex-only alias assignment back to the recorded old deployment URL.
No database rollback is involved in this static release. Do not delete either deployment.
If a routing operation requires changing project-domain configuration, stop and prepare
that exact change for approval rather than broadening the operation silently.

## Separate application gates remain unaccepted

- Preview data plane: isolated test database and Preview-only encryption key.
- Calendar: authenticated manager/employee flow, revocation, live provider and Apple/Google refresh acceptance.
- Time Card: authorized demo entitlement, provider/scheduler acceptance and production token migration.
- Platform: production fail-closed auth configuration, customer scoping, entitlement-filtered dashboard,
  recovery/verification/abuse controls, monitoring and compatible rollback before broader rollout.
- Stripe: complete payment/entitlement/subscription lifecycle before enabling checkout.

The static apex package makes no calls to these backends. Its outward links reach the
existing app sign-in; no new product access or paid onboarding is implied by publication.
