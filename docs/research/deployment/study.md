# Study: where Conexus runs for its first companies

**Date**: 2026-10-09
**Base**: `main` at `729bdc5`, with the wave `wave/company-model-accounts-spec` at `7a202a3` read for the
data layer
**Earlier studies used**:
- [hosting](../hosting/study.md): S6, the memory of one installation at rest. Its target shape (a
  cell per company) is superseded by the [tenancy](../hosting/tenancy.md) decision O1. Its cost
  model used third-party price listings; this study replaces them with vendor pages.
- [database](../database/study.md): a database per company, a schema per app (9.1).
- [Builder service](../builder-service/study.md): Mastra in its own database `builder` (9.1).
- [app runtime](../app-runtime/study.md): generated code on Workers for Platforms (9.1), app data
  through a data service next to the database (9.3, recommended, not yet answered).
- [open decisions](../architecture/open-decisions.md): B1 to B11.

The operator's question of 2026-10-09, in short:
- Four companies should start using Conexus now: the operator's own and three of family.
- Should Conexus run on a cloud's managed services, on a VM (Fly, Hetzner), or on a server bought
  for home?
- There are four areas to decide: where Conexus runs, the services Conexus uses, the apps, and the
  database.
- The target is the simplest and cheapest that is still good and reliable. The infrastructure code
  may be refactored as much as needed. The code that matters most today is the Builder's logic on
  Mastra.

Research, not execution authority. Decisions go to the operator (section 9).

<!-- SECTION 1 -->

## 2. Today (census)

Command: `bash docs/research/deployment/census.sh`

| Mechanism | Count | Where |
| --- | --- | --- |
| E1 configuration names the Hub and the runner read | 38 | census output |
| E2 secret files the host must mount (`*_FILE`) | 9 | census output |
| E3 directories that must exist or persist on the host | 4 | `CONEXUS_GIT_ROOT`, `CONEXUS_COMPILE_ROOT`, and two of the runner, which goes away with A1 |
| E4 sockets and binaries on the host | 2 | the runner socket (goes away with A1) and `CONEXUS_CLIPROXY_BIN` |
| E5 listeners opened by Hub code | 9 | `apps/hub/src/hub.ts:224-226` and six internal ones |
| E6 periodic jobs inside the Hub process | 6 | `apps/hub/src/builder/module.ts:243-247`, `apps/hub/src/identity-access/expiry.ts:56` |
| E6 the shortest interval: the Builder's run lease | every 10 s | `apps/hub/src/builder/module.ts:91` |
| E7 a session-level lock held for the life of the Hub | 1 connection, always open | `apps/hub/src/platform/db.ts:359-360` |
| E8 container image, Compose file or deploy workflow for the Hub | 0 | none |

### How it works now

**Overview.** The pilot runs on one WSL laptop for one company ([hosting §2](../hosting/study.md#2-today-census)):
- the Hub and the application runner run as systemd user units from a checkout;
- two PostgreSQL containers (the Hub's and the Applications') and Keycloak run beside them;
- backups go to the same disk.

**What the decided target keeps and drops.** After the decisions of 2026-10-09, five parts remain.
The "instances" column is what **today's code** imposes, not what the parts need; section 5 asks
which of those limits the refactor should remove.

| Part | State it holds | Instances today | Decided by |
| --- | --- | --- | --- |
| Hub (Fastify, Better Auth inside it, the web app's static files) | none on disk; everything in PostgreSQL | exactly one, always on (E6, E7) | O1, A2 |
| Builder (Mastra AgentController, today inside the Hub process) | live sessions in memory; Conexus Git on disk (E3) | one, sticky | Builder service 9.1, A6, A7 |
| Data service (new: the data plane without the sandbox) | app logins and their pools, in memory | one or more, stateless | app runtime 9.3 (recommended) |
| PostgreSQL | the control databases `hub` and `builder`; one database per company | one instance now (section 9) | database 9.1 |
| Generated apps (handlers and static files) | none | Cloudflare's | app runtime 9.1 |

Outside Conexus: E2B runs the Builder's sandboxes, models are called with each company's own model
account (C-032), and connectors reach each company's ERP.

**Gotchas.**
- **The control database never idles while the Hub runs.** The Builder renews its run lease every
  10 seconds (E6), and the Hub holds one connection open for its instance lock (E7). A provider that
  scales an idle database to zero therefore bills the control database for every hour of the month.
  Company databases have no such job: they are idle when nobody uses their apps.
- **The Builder needs a disk.** Conexus Git lives under `CONEXUS_GIT_ROOT` (E3) until A6 moves it.
- **Nothing builds an image yet** (E8). Every topology in this study starts with one image and its
  modes; that is the first piece of infrastructure code to write.
- **TLS is terminated inside the Hub** with the Preview certificate (`apps/hub/src/hub.ts:189-208`).
  Behind Cloudflare the edge terminates TLS, and those listeners become plain HTTP on loopback.

## 3. Why it is so

- The pilot was built for **one company on one machine** (C-024 before its amendment): systemd
  units, secret files in a home directory, backups to the same disk ([hosting §3](../hosting/study.md#3-why-it-is-so)).
- The **instance lock** (E7) protects in-process jobs and the Builder's live sessions from a second
  Hub on the same database. It was the cheap answer while one laptop ran one Hub.
- The **jobs in the Hub process** (E6) followed the same reasoning: no queue, no second process.
  Windmill keeps background work in a PostgreSQL queue with `SKIP LOCKED` instead, and ToolJet and
  Retool run one image with a mode per role ([hosting §4](../hosting/study.md#comparison)).
- Nothing was ever deployed to a cloud, so no image or deploy workflow exists (E8).

## 4. References

A deployment study's references are the vendors' own pages and price data, not code. Each figure
below was read on 2026-10-09 from the vendor's site, its documentation source on GitHub, or its
price API. Figures marked † come from a search engine's extract of the vendor page and should be
rechecked before money is committed.

### Sources and versions

| Reference | What was read |
| --- | --- |
| Neon | [plans](https://neon.com/docs/introduction/plans) (docs source updated 2026-10-06), [regions](https://neon.com/docs/introduction/regions), [roles](https://neon.com/docs/manage/roles), [databases](https://neon.com/docs/manage/databases), [pooling](https://neon.com/docs/connect/connection-pooling), [multitenancy](https://neon.com/docs/guides/multitenancy) |
| Supabase | [pricing](https://supabase.com/pricing), [compute](https://supabase.com/docs/guides/platform/compute-and-disk), [backups](https://supabase.com/docs/guides/platform/backups), the role migration [`demote-postgres.sql`](https://github.com/supabase/postgres/blob/develop/migrations/db/migrations/10000000000000_demote-postgres.sql) |
| Google Cloud | [Compute Engine prices](https://cloud.google.com/products/compute/pricing/general-purpose), [Cloud SQL prices](https://cloud.google.com/sql/pricing), [Cloud Run prices](https://cloud.google.com/run/pricing), [startup credits](https://cloud.google.com/startup/benefits) |
| AWS | the Price List API for EC2, RDS and Lightsail in `sa-east-1` (published 2026-09-15 to 2026-10-08); [Activate](https://aws.amazon.com/startups/credits/)† |
| Fly.io | the [docs source](https://github.com/superfly/docs): regions, prices, [Managed Postgres](https://fly.io/docs/mpg/) |
| Hetzner, Oracle, Akamai, Magalu Cloud | [Hetzner locations](https://docs.hetzner.com/cloud/general/locations/)† and [price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)†; [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)†; [Akamai São Paulo](https://www.akamai.com/cloud/pricing/sao-paulo)†; [Magalu Cloud](https://magalu.cloud/precos/virtual-machines/)† |
| Cloudflare | the [docs source](https://github.com/cloudflare/cloudflare-docs): Workers for Platforms pricing and limits, Workers pricing, R2, Tunnel, Hyperdrive limits, Cloudflare for SaaS plans |
| E2B, mail, observability | [E2B pricing](https://e2b.dev/pricing)† and SDK source (`packages/js-sdk/src/sandbox/index.ts:580`); [Better Auth email](https://www.better-auth.com/docs/concepts/email); [Resend](https://resend.com/pricing)†; [Grafana Cloud](https://grafana.com/pricing/)†; [Sentry](https://sentry.io/pricing/)† |
| PostgreSQL | [row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html): "Superusers and roles with the BYPASSRLS attribute always bypass the row security system" |

### The questions

1. Is there a São Paulo region?
2. What does our size cost: four companies, under 5 GB of data, low traffic?
3. Can Conexus's admin role create databases and roles with SQL, at runtime (P2)?
4. What restore does it give, and how far back?
5. Does it sleep when idle, and what keeps it awake?
6. What makes the bill jump?

### Databases

| | Neon Launch | Supabase Pro | Cloud SQL (Enterprise) | RDS | Fly Managed Postgres | Self-hosted on the VM |
| --- | --- | --- | --- | --- | --- | --- |
| 1 São Paulo | yes, `aws-sa-east-1` | yes, `sa-east-1` | yes | yes | yes, `gru` | where the VM is |
| 2 Price | "$0.106/CU-hour", "$0.35/GB-month", "no minimum monthly fee"; 0.25 CU (about 1 GB of memory) is the smallest | "From $25/month", one Micro project included; each more project adds its compute (about $10) | db-g1-small "$38.325 / 1 month", shared core "not covered by the Cloud SQL SLA"; 1 vCPU with 3.75 GB about $74 | db.t4g.micro "$0.034" an hour, about $25, plus gp3 "$0.219 per GB-month" | Basic "$38.00" (shared, 1 GB), HA included | none beyond a bigger VM |
| 3 Runtime `CREATE DATABASE` and `CREATE ROLE` | yes; `neon_superuser` has "CREATEDB… CREATEROLE… BYPASSRLS"; 500 databases and 500 roles per branch | yes; `postgres` is `NOSUPERUSER CREATEDB CREATEROLE … BYPASSRLS` | yes, `cloudsqlsuperuser` "CREATEROLE, CREATEDB"† | yes, master user `CREATEDB CREATEROLE`† | **no**: databases only from the dashboard, three fixed roles | yes |
| 4 Restore | point in time "Up to 7 days, billed at $0.20/GB-month" of change history | "Daily backups stored for 7 days"; point in time "$100 per month per 7 days retention" and needs Small compute | automated backups, point in time up to 7 days† | automated backups | "backups" included; window not verified | ours: pgBackRest 2.59.3 or WAL-G 3.0.8 to an S3-compatible store |
| 5 Sleeps | after "5 min inactivity"; the Hub keeps it awake (E6, E7) | no; free projects "are paused after 1 week of inactivity" | no | no | no | no |
| 6 Bill jumps | compute hours if the Hub never idles; no SLA below Scale ($0.222/CU-hour) | point in time ($100), compute and IPv4 add-ons are "not covered by the Spend Cap"; restored custom roles lose their passwords | HA doubles it; PostgreSQL 16+ defaults to Enterprise Plus† | Multi-AZ doubles it | Starter "$72.00" | operator hours; a restore nobody tested |

Neon also recommends "one project per user" when each customer needs its own restore
([multitenancy](https://neon.com/docs/guides/multitenancy)). Conexus gets the same from one
project: restore a branch at the wanted time, then move that one company's database back with the
P3 procedure.

### Compute in or near São Paulo

| | Region in Brazil | About 2 vCPU, 4 GB | About 2–4 vCPU, 8 GB | Notes |
| --- | --- | --- | --- | --- |
| AWS Lightsail | yes | "$0.03225 per hour of 4GB bundle Instance including public IPv4 address", about $24 with 80 GB and 4 TB of transfer | 8 GB, 2 vCPU: "$0.05913 per hour", about $44 | same AWS region as Neon's São Paulo; burstable CPU |
| Google Compute Engine | yes | e2-medium "$38.825196 / 1 month", plus disk ($0.15/GiB) and IPv4 (about $3.65) | e2-standard-2 "$77.650392 / 1 month" | Start credits "Up to $2,000 … valid for one year", for a startup "planning to seek venture funding soon" |
| AWS EC2 | yes | t4g.medium "$0.0536" an hour, about $39 | t4g.large about $78 | egress $0.15/GB |
| Magalu Cloud | yes | BV2-4-40 "R$ 102,99 por mês"† (about $21) | about R$220† | prices in reais; the page shows two conflicting tables |
| Akamai | yes | "Linode 4 GB" $33.60† | $67.20† | |
| Fly.io | yes, `gru` | shared-cpu-2x 4 GB about $41 (São Paulo costs 1.6 times Ashburn) | about $82 | "New organizations don't have a free tier" |
| Oracle Always Free | São Paulo, short of capacity | $0, now "2 OCPUs and 12 GB of memory"† | — | the free limit was halved in 2026†; idle instances are reclaimed† |
| Hetzner | **no** (EU, US, Singapore) | CX23 €5.49† (EU) | CX33 €8.49† (EU) | about 128 ms round trip São Paulo to Ashburn†; prices raised twice in 2026†; US prices not verified |
| Cloud Run | yes (Tier 2) | always on, 1 vCPU and 1 GiB, about $63 | — | affinity "best effort, not a guarantee"; requests up to 60 minutes |
| Railway, Render | **no** South America region† | | | |
| A server at home | yes | an N100 mini PC with 16 GB, R$1,731–2,799†, 7–12 W | | Enel SP residential about R$0.79/kWh before taxes†; no SLA; Cloudflare Tunnel needs no public IP |

### Platform services

| Service | What it costs at our size | Source |
| --- | --- | --- |
| Workers for Platforms | "$25 monthly": 20 million requests, 60 million CPU ms, 1,000 scripts; "Max of 30 seconds of CPU time per invocation"; whether the $5 Workers Paid plan is also needed is not verified | Cloudflare docs source |
| Custom host names (Cloudflare for SaaS) | 100 included, then $0.10 each | Cloudflare docs source |
| Tunnel | all plans; 1,000 tunnels per account | Cloudflare docs source |
| R2 | 10 GB-month free, then $0.015/GB-month; egress free | Cloudflare docs source |
| E2B | Hobby: one-time $100 credit, sessions up to 1 hour, 20 at once; Pro "$150/month", 24 hours. A 2 vCPU, 2 GiB sandbox: about $0.133 an hour; a paused one costs nothing | E2B pricing† and SDK source |
| Mail | Better Auth "works with any transactional email provider". Resend: 3,000 a month free, 100 a day, sends from `sa-east-1`; Pro $20 | Better Auth docs; Resend† |
| Errors, logs, uptime | Grafana Cloud free: 10k series, 50 GB logs, 14 days†; Sentry free: one user, 5k errors† | |
| Build and images | GitHub Actions and GHCR are free for a public repository | GitHub docs source |
| Domain | `.com.br` R$40 a year at Registro.br; Cloudflare DNS by delegation† | |

### Comparison

**Where they agree:**
- Every managed PostgreSQL that fits hands over the same thing: an admin role with `CREATEDB` and
  `CREATEROLE`, without superuser. P0 to P3 run on exactly that.
- Every provider with a São Paulo region charges a premium for it: Google about 59% over Iowa,
  Akamai about 40%, Fly 1.6 times.
- **Lightsail is the exception:** about $24 for 4 GB in São Paulo, with transfer and an IPv4
  address included.

**Where they differ:**
- **The point-in-time restore.** Neon includes it for a few cents per GB. Supabase charges $100 a
  month for it, so the Pro plan alone restores only from a daily backup.
- **Fly Managed Postgres cannot create a database with SQL,** so it cannot run P2.
- **Only Neon sleeps** when idle.
- **Only Hetzner and Railway/Render have no Brazil region.**

### What we copy and what we adapt

| Mechanism | From | Kept as is | Adapted, and why |
| --- | --- | --- | --- |
| An admin role with `CREATEDB CREATEROLE`, a runtime role that owns nothing | managed PostgreSQL (all of them) | yes | `createrole_self_grant = 'set, inherit'` on the admin, so it owns what it creates (P2) |
| A backup role reading through a policy, not `BYPASSRLS` | PostgreSQL row security | | the provider's own backups cover disasters; this role is only for a logical export (P1) |
| Point in time by branch, then one company moved back | Neon branches; P3 | | restores one company without rolling back the others |
| Outbound-only tunnel, no open port | Cloudflare Tunnel | yes | the data service is reached only by the dispatch Worker, through an Access service token |
| One image, one mode per role | Windmill, ToolJet, Retool ([hosting §4](../hosting/study.md#comparison)) | yes | modes `hub`, `builder`, `data`, `migrate` |

## 5. The premise

- **The question as it arrived**: managed cloud services, a VM (Fly, Hetzner), or a server at home?
- **Why, until the root cause**:
  1. Why does the place matter? It decides what Conexus costs per month, what breaks it, and how
     many of the operator's hours operations take.
  2. What costs money or breaks at four companies? **Not the compute.** One installation at rest
     uses well under 1 GB of memory (hosting S6), and Keycloak, the largest process measured, is
     gone (A2). What costs or breaks is:
     - **company data**, the only thing that cannot be rebuilt;
     - **untrusted generated code**, already moved to Cloudflare (A1);
     - **the Builder's sandboxes**, billed by the second on E2B;
     - **the fixed monthly floor** of each service;
     - **the operator's hours** for patches, backups and restores.
  3. Does the architecture change with the place? **No**, if three seams hold:
     - one container image with modes (Hub, Builder, data service, migrations);
     - a PostgreSQL where Conexus is **not a superuser** (spikes P0 to P3: the whole data layout,
       and moving a company between hosts, work with one admin role that may create databases and
       roles, which is what Neon, Supabase, Cloud SQL and RDS hand over);
     - object storage through the S3 API.
- **Root cause**: the question mixes a design that is already decided with a placement that is
  open, and the placement that matters most is where company data lives and how it is restored.
- **The premise fell in part.** The answer is not one of the four places for everything. It is one
  place per part, each chosen for what that part needs, with the seams above as the exit:
  - compute that holds nothing irreplaceable can go where it is cheapest in São Paulo;
  - company data goes where a restore is tested and does not depend on the operator's hours;
  - the apps already went to Cloudflare, and the Builder's sandboxes to E2B.

## 6. Proved and not proved

Spikes: `bash docs/research/deployment/spike.sh` (two PostgreSQL 17.10 containers, the pinned image).
On each host Conexus gets one role, `platform_admin`, with `LOGIN CREATEDB CREATEROLE` and nothing
else: no superuser, no `BYPASSRLS`. That is the least that Neon, Supabase, Cloud SQL and RDS hand
over (section 4 cites each). P4 adds the case of an admin that does bypass row security.

| Claim | How it was tested | Result |
| --- | --- | --- |
| P0. The admin role cannot widen itself | `create role escape bypassrls` as the admin | Refused: "Only roles with the BYPASSRLS attribute may create roles with the BYPASSRLS attribute" |
| P1. The simple tenant policy works without a superuser | Control database `hub` made by the admin; `core.connection` with `FORCE ROW LEVEL SECURITY` and one policy, `workspace_id = current_setting('app.workspace_id', true)::uuid`; a runtime role that owns no table | A query with **no** workspace filter returns only company A's row. With no company set: 0 rows. Writing a row for company B while A is set: refused by the policy. The runtime turning the policy off: "must be owner". The owning admin with no company set: 0 rows (FORCE binds the owner too) |
| P1. What the policy does not stop | The runtime sets company B itself | It reads company B's row. The policy stops a **missed filter**; it does not stop SQL an attacker writes. That is why the company comes from the admission proof, set once per transaction by the Hub, never from a request |
| P1. A logical dump of the control database needs a planned role | `pg_dump` as the owning admin; then as `hub_backup` with a read-all policy and `--enable-row-security` | The owner fails: "query would be affected by row-level security policy". `hub_backup` dumps both companies' rows (2 of 2), with no `BYPASSRLS` anywhere |
| P2. A company database and its apps are made at runtime by the admin | `company_a` with two apps and `company_b` with one; per app a `NOLOGIN` owner and a `LOGIN` runtime role; `CONNECT` revoked from `PUBLIC` | App 1 reads its own 10,000 rows. App 1 reading app 2: "permission denied for schema app2". `SET ROLE` to app 2: refused. Opening company B or the control database: "User does not have CONNECT privilege". Creating a schema, or a table in `public`: refused. App 1 sees the schema names of its own company (`app1,app2`), as C-037 accepts |
| P2. The admin needs one setting to own what it creates | `create schema … authorization <new role>` without, then with, `createrole_self_grant = 'set, inherit'` on the admin role | Without: "must be able to SET ROLE". With it (a setting the admin may set on itself, PostgreSQL 16+): every app schema and table is made and owned by the app's owner role |
| P3. A company moves between two hosts with no superuser on either | `pg_dump -Fc` of `company_a` as the admin on host A; on host B the admin recreates the roles **with new passwords** from Conexus's own register, then `pg_restore --exit-on-error` | Dump 40 KB in about 0.2 s; restore in about 0.15 s; both exit 0. The md5 of all 10,000 rows is identical. Table owners are kept. App 1 logs in with its new password and reads its rows; app 2 is still refused to it |
| P3. A company is deleted whole | `drop database company_a with (force)` and its four roles, as the admin on host A | Databases left: `company_b, hub, postgres`; company A roles left: 0 |
| P4. On Neon and Supabase the admin role bypasses row security; the roles it creates do not | an admin with `BYPASSRLS` (as `neon_superuser` and Supabase's `postgres` have, section 4) makes the control database and the runtime role | The admin with no company set sees both rows. The runtime it created has `rolbypassrls = f`: company A set, it sees only A; no company, 0 rows; becoming the admin, refused. So the Hub must never run as the admin role; migrations do |
| E6, E7. The control database is never idle while the Hub runs | census | A query every 10 s and one connection held for the Hub's life |
| Memory at rest | hosting S6 | Hub 251–286 MB RSS; PostgreSQL 52 MiB; Keycloak 529 MiB, now dropped (A2) |

**What P0 to P3 settle.** The data layout of the database study, the simple tenant policy of the
defense-in-depth direction, and the move of a company between hosts need no superuser. So the
database host is a placement choice that can be changed later by moving one company at a time,
not a design choice.

Not verified:
- each provider's exact role attributes (section 4 cites their documentation; nothing was run on
  their services);
- the latency from a São Paulo VM to each managed database;
- memory of the Hub under a real Builder turn on the target VM;
- a point-in-time restore on any provider;
- Cloudflare Tunnel and Workers for Platforms on a real account.

<!-- REST -->
