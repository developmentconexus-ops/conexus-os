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

## 1. Decided

| Decision | Answer | Where |
| --- | --- | --- |
| How several companies share Conexus | One shared installation; a Workspace is a company (O1) | tenancy 9.1; C-024 amended |
| What a company configures | Everything (model accounts, model default, connections, settings) belongs to its Workspace | tenancy 9.2; C-024 amended |
| Names visible across Projects | Re-accepted for a validation installation until the Applications layout changes | tenancy 9.4; C-037 amended |
| Unit of app data | A database per company, a schema per app inside it | database 9.1 |
| Keycloak's store | Its own database in the control cluster, while Keycloak stays (see A2) | database 9.3 |
| Where Mastra's data lives | Its own database `builder`, scoped by Workspace through Mastra's `organizationId`, never a store per company | Builder service 9.1 |
| What a span keeps | Metadata only; content only by a time-boxed administrator capture | Builder service 9.2 |
| How the Builder reaches models | Through the Hub, which admits the run and holds every credential | Builder service 9.4 |
| When the Builder leaves the Hub process | Handed to the architecture session | Builder service 9.3 |

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
     - one policy per company-scoped table, `workspace_id = current_setting('app.workspace_id')::uuid`;
     - `FORCE ROW LEVEL SECURITY`;
     - a runtime role that owns no table;
     - `SET LOCAL app.workspace_id` once per transaction, from the admission proof.
   - It works the same on a self-hosted or a managed PostgreSQL, because it needs no superuser.

## 3. Open: platform and code architecture

Decide A1 and A2 first: they decide most of the cloud services in section 4.

| # | Question | Options | Recommendation | What it decides |
| --- | --- | --- | --- | --- |
| A1 | **Where generated app code runs** | (a) bubblewrap runner on a VM, today; (b) a managed isolate platform for customer code: Cloudflare Workers for Platforms ($25/month plan, [pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/index.md)), Deno Subhosting; (c) an E2B sandbox per app | **Study (b) with a spike before choosing.** It removes the only part that needs Linux user namespaces, so the rest can run on managed containers. It also serves each app's static files and host at the edge. Risks to measure: a Workers runtime instead of Node, a database credential in each app's binding instead of today's certificate in the relay, lock-in | compute (B1), Applications database (B3), hosts and TLS (B5) |
| A2 | **Sign-in** | (a) Keycloak, self-hosted, Java, about 0.5 GB; (b) Better Auth, a TypeScript library inside the Hub with its tables in our database (organization plugin); (c) WorkOS AuthKit, managed, free up to about 1M monthly users, enterprise SSO about $125 per connection per month ([source](https://workos.com/blog/workos-vs-auth0-vs-frontegg)); (d) Supabase Auth | **Drop Keycloak; choose between (b) and (c).** (b) has no new service, keeps the data ours and costs nothing. (c) makes enterprise SSO (Microsoft 365, spec 0006) a configuration. Either way C-015's rule stays: the identity provider authenticates, Conexus grants | C-015, spec 0006, the people screen, one less container |
| A3 | Tenant isolation layers | admission only (spec 0018) / admission + simple RLS (section 2) | **Admission + simple RLS** | the baseline's policies |
| A4 | Data access in code | `pg` with the `sql` tag (Q2) / a typed query builder (Kysely) | **Keep `pg`** with the `sql` tag; the gain does not pay for a dependency | the dependency rule |
| A5 | Database machinery to keep | today: 14 scripts (1,913 lines) and 3 generated registers (859 lines) for roles, grants and catalog drift | **Keep the migration runner, one baseline and a catalog drift check; delete what the 3-role design and simple RLS no longer need** | CI time, review load |
| A6 | Where Conexus Git lives | (a) bare repositories on a persistent disk, today; (b) object storage; (c) a forge (GitHub, Gitea) | **(a) on the Builder's volume for the MVP**; study (b) if compute becomes stateless | managed containers (B1) |
| A7 | Builder process split and sequence | | handed to the architecture session | |
| A8 | Jobs, schedules and automations | Mastra schedules (beta) / pg-boss / a managed engine (Inngest, Trigger.dev) | **Mastra on PostgreSQL at the automations milestone**, pg-boss only for what it lacks | no Redis |
| A9 | ERP data | read through the connector / a mirror per app (Mitra) | **Read through now** | (database 9.5, unanswered) |
| A10 | Who creates a Workspace (company); who connects its ERP | today any account / the administrator only | **The administrator creates; the owner connects** | (tenancy 9.5, 9.6, unanswered) |
| A11 | How a company comes in | operator invites / people screen / open sign-up | **Operator invites now**, the provider's invite flow after A2 | (tenancy 9.3, unanswered) |

## 4. Open: cloud services

Each row names the choice and what blocks it. Prices are third-party listings or vendor pages
read through search, not verified.

| # | Service | Options | Recommendation | Blocked by |
| --- | --- | --- | --- | --- |
| B1 | Compute for the Hub and the Builder | (a) one VM with Docker Compose (Google Cloud São Paulo, about $155/month for 4 vCPU and 16 GB, $2,000 Start credits); (b) managed containers (Cloud Run, Fly) | **(a) if A1 keeps the bubblewrap runner; (b) is open only if A1 moves app code out.** The Builder holds live sessions in memory. Cloud Run's affinity is best effort and a request lasts at most 60 minutes ([docs](https://docs.cloud.google.com/run/docs/triggering/websockets)), so the Builder needs one sticky instance | A1, A6 |
| B2 | Control PostgreSQL (Hub, Builder's Mastra store, sign-in if A2 keeps data in it) | (a) self-hosted on the VM; (b) Neon (São Paulo region, branches, a branch per developer and test); (c) Supabase Pro ($25/month; PITR $100/month per 7 days, [pricing](https://supabase.com/pricing)); (d) Cloud SQL (pays from the Google credits; no scale to zero) | **Decide after the greenfield baseline.** A baseline with three roles, simple RLS and no superuser runs on any of them. Neon's branches fit [database §3](../../reference/database.md#3-a-database-for-every-developer-and-every-test) best; Cloud SQL spends the credits | A2, the baseline |
| B3 | Applications PostgreSQL (a database per company) | self-hosted with certificate login / managed with a role and password per app | **Follows A1.** The bubblewrap runner keeps certificate login (self-hosted only). A managed isolate platform reaches a managed PostgreSQL with a role per app | A1 |
| B4 | Object storage (backups, app files, assets) | Cloudflare R2 / Google Cloud Storage / S3 | **R2** (no egress fees) | — |
| B5 | DNS, TLS, edge, hosts per company and app | Cloudflare (DNS, wildcard certificates, Tunnel, custom hostnames) | **Cloudflare** | address shape (hosting 9.6) |
| B6 | Email (invitations, notices) | Resend / Postmark / Amazon SES | pick one with a Brazil-friendly sender reputation | A2 (the provider may send its own) |
| B7 | Secrets | the cloud's secret manager / Infisical or Doppler / mounted files | **the cloud's secret manager**, mounted as files so the code's `*_FILE` convention stays | B1 |
| B8 | Build and deploy | GitHub Actions, GitHub Container Registry, deploy by Compose pull or the platform's deploy | **GitHub Actions + GHCR** | B1 |
| B9 | Observability and alerts | self-hosted Grafana stack / a managed free tier (Grafana Cloud, Better Stack) | **a managed free tier** for logs, metrics and uptime; spans hold metadata only (decided) | — |
| B10 | The Builder's sandbox | E2B / Daytona / Modal | **Keep E2B** (Hobby, then Pro $150/month when concurrency needs it) | — |
| B11 | Reaching an ERP inside a company | the ERP's public gateway / Cloudflare Tunnel run by the company | **Tunnel only where the gateway is not public** | B5 |

## 5. Still unanswered from the studies

- **Database 9.2: two PostgreSQL clusters.** It is now part of B2 and B3; with managed databases it
  becomes two providers or two projects.
- **Database 9.4: cut the baseline before the first company.** It is now part of the greenfield
  direction.
- **Database 9.5:** A9.
- **Database 9.6, automations and knowledge:** A8.
- **Tenancy 9.3, 9.5, 9.6:** A11 and A10.
- **Tenancy 9.7:** superseded by the defense-in-depth direction.
- **Hosting 9.3, 9.4, 9.6:** B1, A1 and B5.
