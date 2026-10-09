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

<!-- SECTION 4 -->

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
over (section 4 cites each).

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
