# Architecture decisions: decided, directed, open

**Date**: 2026-10-09
**Owner of the open items**: the operator, with the architecture session that designs the cloud
setup.

This page collects what the studies of 2026-10-09 settled and what is still open. It is the
starting list for the cloud design. Research, not execution authority. Each accepted answer moves
to its owning guide or the [decision register](../../decisions/index.md).

The studies behind it:
- [Hosting](../hosting/study.md)
- [Tenancy](../hosting/tenancy.md)
- [Database](../database/study.md)
- [Builder service](../builder-service/study.md)
- [App runtime](../app-runtime/study.md)
- [Deployment](../deployment/study.md): where each part runs, with vendor prices and a cost model

The [target design](target-design.md) (in Portuguese) puts every decision below into one picture, with
the flows from end to end. The approved ones are recorded in the [decision register](../../decisions/index.md)
as C-042 to C-049, with C-015, C-024, C-030, C-037 and C-038 amended.

## 1. Decided

| Decision | Answer | Where |
| --- | --- | --- |
| How several companies share Conexus | One shared installation; a Workspace is a company (O1) | tenancy 9.1; C-024 amended |
| What a company configures | Everything (model accounts, model default, connections, settings) belongs to its Workspace | tenancy 9.2; C-024 amended |
| Names visible across Projects | Re-accepted for a validation installation until the Applications layout changes | tenancy 9.4; C-037 amended |
| Unit of app data | A database per company, a schema per app inside it | database 9.1 |
| Keycloak's store | Superseded: Keycloak leaves (A2, C-015) | database 9.3 |
| Where Mastra's data lives | Its own database `builder`, scoped by Workspace: conversations and memory by the resource id `workspace:<w>:project:<p>`, spans by `organizationId` (Mastra 1.71's memory tables carry `resourceId` only); never a store per company | Builder service 9.1; C-045 |
| What a span keeps | Metadata only; content only by a time-boxed administrator capture | Builder service 9.2 |
| How the Builder reaches models | Through the Hub, which admits the run and holds every credential | Builder service 9.4 |
| When the Builder leaves the Hub process | Handed to the architecture session | Builder service 9.3 |
| App runtime | Workers for Platforms, re-confirmed after the VPS choice | app runtime 9.1, §12 |
| Files and backups (B4) | R2; backups encrypted with the operator's public key before upload; Magalu Object Storage if a company needs its data in Brazil | 2026-10-09; [target design](target-design.md) §11 |
| DNS, TLS, tunnel (B5) | Cloudflare; the domain stays registered at Hostinger | 2026-10-09 |
| Address shape (hosting 9.6) | **One domain:** `hub.<domain>` and `<app>-<company>.<domain>`. No second domain, so the Hub uses `__Host-` cookies, checks `Origin` on every state change and reserves names | 2026-10-09; target design §5 |
| Mail (B6) | Resend, free plan | 2026-10-09 |
| Secrets (B7) | files on the VPS (`*_FILE`, mode 600), placed by the deploy | 2026-10-09 |
| Build and deploy (B8) | GitHub Actions + GHCR | 2026-10-09 |
| Observability (B9) | Sentry and Grafana Cloud free tiers | 2026-10-09 |
| The Builder's sandbox (B10) | E2B | 2026-10-09 |
| Jobs, schedules, automations (A8) | Mastra on PostgreSQL at the automations milestone | 2026-10-09 |
| Data of integrated systems (A9) | read through, no copy, for now | 2026-10-09 |
| Neon projects (B3) | a control project (`hub`, `builder`) and one project per company, created by the operator with the company | 2026-10-09; target design §4 |
| Who creates a company; who connects its systems (A10) | the operator creates the company; its owner connects the integrations. Integrations are every external system (ERP, CRM, spreadsheets, APIs, MCP), not only an ERP | 2026-10-09 |

**Still open after 2026-10-09:**
- **B11: systems with no public address.** To be seen per system; Sankhya offers OAuth on its public
  gateway and needs no tunnel.
- **A6: Conexus Git.** Study whether today's mechanism, bare repositories on disk, is the best fit.
- **A11: invitation, or the operator creates the user.** Decided later.
- **Credits.** Later.

## 2. Directions the operator gave on 2026-10-09

1. **Greenfield data layer.** The schema, the migrations and the roles may be rewritten to fit the
   new architecture. Everything legacy is deleted, and nothing is kept for compatibility.
   - This is allowed now: [database §4](../../reference/database.md#4-database-refactoring) says
     "There is no transition phase while no installation holds company data", and
     [§2](../../reference/database.md#2-migrations) lets one baseline replace the chain until then.
   - It must therefore happen **before the first company's data**.
   - The studies' census and spike scripts measure the current code. They are evidence of today, not
     constraints on the target.
2. **Defense in depth for tenant isolation.**
   - Typed admission in the Hub stays the first wall.
   - A **simple row-level security policy per company** is the second, so a missed filter still
     cannot return another company's rows.
   - This reopens the decision spec 0018 records on its wave (numbered C-039 there, a number `main`
     already uses). Its reopen trigger, "a consumer requires database-enforced row … isolation", is
     met.
   - The target is not the old machinery (50 policies, helper roles, a role switch per transaction).
     It is:
     - one policy per company-scoped table,
       `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`. The `nullif` matters: on a
       reused connection the setting reads `''`, not null, once any earlier transaction set it, and `''::uuid`
       fails ([deployment probe](../deployment/study.md#11-provider-independence-protocols-and-ports));
     - `FORCE ROW LEVEL SECURITY`;
     - a runtime role that owns no table;
     - `SET LOCAL app.workspace_id` once per transaction, from the admission proof.
   - It works the same on a self-hosted or a managed PostgreSQL, because it needs no superuser.

3. **Provider independence** (answered 2026-10-09,
   [deployment §11](../deployment/study.md#11-provider-independence-protocols-and-ports)).
   - Conexus depends on standard protocols where they exist: PostgreSQL, the S3 API, an OCI image,
     OpenTelemetry, OIDC.
   - It writes a port only where none exists (the Builder's sandbox, the app runtime). Each port
     has a production adapter and a local one.
   - A vendor's own API stays in tooling, never in the product path.
   - There is no general cloud layer of our own.

## 3. Platform and code architecture (answers in §1 override the recommendations below)

A1 and A2 are answered; with them most of the cloud services in section 4 are unblocked.

| # | Question | Options | Recommendation | What it decides |
| --- | --- | --- | --- | --- |
| A1 | **Where generated app code runs** — **answered 2026-10-09: Cloudflare Workers for Platforms**, re-confirmed after the VPS choice ([app runtime §12](../app-runtime/study.md#12-re-checked-after-the-vps-choice-is-workers-for-platforms-still-right)), with the handler contract kept portable and an isolated-vm executor tested as the way out ([app runtime study](../app-runtime/study.md) §9) | (a) bubblewrap runner on a VM, today; (b) a managed isolate platform for customer code: Cloudflare Workers for Platforms ($25/month plan, [pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/index.md)), Deno Subhosting; (c) an E2B sandbox per app | **(b), Workers for Platforms.** It removes the only part that needs Linux user namespaces, so the rest can run on managed containers, and it serves each app's static files and host at the edge. App data reaches the company database through a data service next to it (app runtime §11, decision 3 pending) | compute (B1), Applications database (B3), hosts and TLS (B5) |
| A2 | **Sign-in** — **answered 2026-10-09: Better Auth** (its SSO plugin covers OIDC and SAML per organization) | (a) Keycloak, self-hosted, Java, about 0.5 GB; (b) Better Auth, a TypeScript library inside the Hub with its tables in our database (organization plugin); (c) WorkOS AuthKit, managed, free up to about 1M monthly users, enterprise SSO about $125 per connection per month ([source](https://workos.com/blog/workos-vs-auth0-vs-frontegg)); (d) Supabase Auth | **Drop Keycloak; choose between (b) and (c).** (b) has no new service, keeps the data ours and costs nothing. (c) makes enterprise SSO (Microsoft 365, spec 0006) a configuration. Either way C-015's rule stays: the identity provider authenticates, Conexus grants | C-015, spec 0006, the people screen, one less container |
| A3 | Tenant isolation layers | admission only (spec 0018) / admission + simple RLS (section 2) | **Admission + simple RLS** | the baseline's policies |
| A4 | Data access in code | `pg` with the `sql` tag (Q2) / a typed query builder (Kysely) | **Keep `pg`** with the `sql` tag; the gain does not pay for a dependency | the dependency rule |
| A5 | Database machinery to keep | today: 14 scripts (1,913 lines) and 3 generated registers (859 lines) for roles, grants and catalog drift | **Keep the migration runner, one baseline and a catalog drift check; delete what the 3-role design and simple RLS no longer need** | CI time, review load |
| A6 | Where Conexus Git lives | (a) bare repositories on a persistent disk, today; (b) object storage; (c) a forge (GitHub, Gitea) | **(a) on the Builder's volume for the MVP**; study (b) if compute becomes stateless | managed containers (B1) |
| A7 | Builder process split and sequence | | handed to the architecture session | |
| A8 | Jobs, schedules and automations | Mastra schedules (beta) / pg-boss / a managed engine (Inngest, Trigger.dev) | **Mastra on PostgreSQL at the automations milestone**, pg-boss only for what it lacks | no Redis |
| A9 | ERP data | read through the connector / a mirror per app (Mitra) | **Read through now** | answered 2026-10-09, §1 |
| A10 | Who creates a Workspace (company); who connects its systems | today any account / the administrator only | **The administrator creates; the owner connects** | answered 2026-10-09, §1 and C-049 |
| A11 | How a company comes in | operator invites / people screen / open sign-up | **Operator invites now**, the provider's invite flow after A2 | open: invite, or the operator creates the user |

## 4. Cloud services (answers in §1 override the recommendations below)

Each row names the choice and what blocks it. Prices are third-party listings or vendor pages
read through search, not verified.

| # | Service | Options | Recommendation | Blocked by |
| --- | --- | --- | --- | --- |
| B1 | Compute for the Hub, the Builder and the data service | **answered 2026-10-09: a Hostinger VPS in São Paulo, KVM 2 (or KVM 4), one month first, then 12 months** | the operator's choice; Hostinger's Cloud plans are shared hosting and cannot run Conexus ([deployment](../deployment/study.md) 9.2) | — |
| B2 | Control PostgreSQL (Hub, Builder's Mastra store) | **answered 2026-10-09: Neon in São Paulo, starting on the Free plan, paying when needed** | the Free plan suspends a project after 100 CU-hours a month; today's Hub keeps the database awake and would use them by about day 17, so the lease-row refactor comes first, or Launch (no minimum fee) until it does ([deployment](../deployment/study.md) 9.1) | the lease-row refactor |
| B3 | Applications PostgreSQL (a database per company) | the same project as B2 / its own | **Answered 2026-10-09: one Neon project per company** (C-043); its cost at scale is in the target design §8 | — |
| B4 | Object storage (backups, app files, assets) | Cloudflare R2 / Google Cloud Storage / S3 | **R2** (no egress fees) | — |
| B5 | DNS, TLS, edge, hosts per company and app | Cloudflare (DNS, wildcard certificates, Tunnel, custom hostnames) | **Cloudflare** | address shape (hosting 9.6) |
| B6 | Email (invitations, notices) | Resend / Postmark / Amazon SES | **Answered 2026-10-09: Resend** | — |
| B7 | Secrets | the cloud's secret manager / Infisical or Doppler / mounted files | **Answered 2026-10-09: files on the VPS (`*_FILE`), placed by the deploy**; the source of truth is still to be named (review S5) | — |
| B8 | Build and deploy | GitHub Actions, GitHub Container Registry, deploy by Compose pull or the platform's deploy | **GitHub Actions + GHCR** | B1 |
| B9 | Observability and alerts | self-hosted Grafana stack / a managed free tier (Grafana Cloud, Better Stack) | **a managed free tier** for logs, metrics and uptime; spans hold metadata only (decided) | — |
| B10 | The Builder's sandbox | E2B / Daytona / Modal | **Keep E2B** (Hobby, then Pro $150/month when concurrency needs it) | — |
| B11 | Reaching an ERP inside a company | the ERP's public gateway / Cloudflare Tunnel run by the company | **Tunnel only where the gateway is not public** | B5 |

## 5. Still unanswered from the studies

- **Database 9.2: two PostgreSQL clusters.** Answered by C-043: a control project and one project per company.
- **Database 9.4: cut the baseline before the first company.** It is now part of the greenfield
  direction.
- **Database 9.5:** A9.
- **Database 9.6, automations and knowledge:** A8.
- **Tenancy 9.3, 9.5, 9.6:** A11 is open; A10 is answered (C-049).
- **Tenancy 9.7:** superseded by the defense-in-depth direction.
- **Hosting 9.3, 9.4, 9.6:** answered by C-042, C-046 and C-048.
- **Deployment 9.1 to 9.8:** where data and processes run, the stateless refactor, credits.
