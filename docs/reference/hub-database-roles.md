# Hub database role register

Every Hub connection authenticates as a capability role. The role names carry the program
phase that introduced them rather than what they permit, so this register maps each one to
its capability, the module that connects as it, and the configuration that supplies its
password.

The capability labels are not prose. The register is
[`contracts/technical/hub-database-roles.json`](../../contracts/technical/hub-database-roles.json),
and `scripts/generate-hub-role-register.mjs` projects it into
`apps/hub/src/platform/hub-roles.generated.ts`, from which `createPostgresPool` writes the capability
into `application_name` on every connection. So `pg_stat_activity` and the server log show
the capability beside the role. `npm run db:roles:check` refuses a projection that drifts and
runs inside `npm run verify`, so a label in this table that disagrees with the register is a
defect in this table. Adding a role means adding a row to the register and regenerating.

## Roles the Hub connects as

| Role | Capability | Connects from | Password configuration |
| --- | --- | --- | --- |
| `hub_iam_runtime` | `identity-and-access` | `server.ts` main pool | `CONEXUS_DB_PASSWORD_FILE` |
| `hub_s2_read` | `workspace-read` | `server.ts` | `CONEXUS_DB_S2_READ_PASSWORD_FILE` |
| `hub_ws01_command` | `workspace-command` | `server.ts` | `CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE` |
| `hub_s3_read` | `project-read` | `project/module.ts` | `CONEXUS_DB_S3_READ_PASSWORD_FILE` |
| `hub_prj03_command` | `project-command` | `project/module.ts` | `CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE` |
| `hub_r2_connections` | `connections` | `claude-account/module.ts` | `CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE` |
| `hub_rb_ingress` | `builder-request` | `builder/module.ts` | `CONEXUS_DB_RB_INGRESS_PASSWORD_FILE` |
| `hub_rb_executor` | `builder-run-execution` | `builder/module.ts` | `CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE` |

`hub_r2_project_binding`, `hub_r2_brain_read`, `hub_r2_brain_attester` and
`hub_r2_key_conformance_subject` used to appear here. The pools that opened them are gone with
the Brain and the bindings, so they moved to the table below.

## The Builder split, which is load-bearing

`hub_rb_ingress` and `hub_rb_executor` are not two names for one thing. `builder/store.ts`
routes nine read and admit calls through the ingress pool and eleven claim and
state-changing calls through the executor pool. HTTP handlers reach only the ingress side;
the background execution loop reaches the executor side. A request path holding
`hub_rb_ingress` has no grant to claim, settle, fail or interrupt a BuilderRun.

The separation bounds a logic bug, not an attacker. Both pools live in the same process,
declared three lines apart, so code execution in the Hub reaches either one. The property
that does hold against a wider class of failure is that no Hub role has table grants at
all: 236 functions are `SECURITY DEFINER` and `REVOKE ALL ON ALL TABLES` is applied.
`hub_iam_runtime` is the exception, holding direct `SELECT`, `INSERT` and `UPDATE` on the
`iam` tables from `001_iam_foundation.sql`.

## Roles that exist but are not connected as

| Role | State |
| --- | --- |
| `hub_r2_brain_bootstrap` | The bootstrap script connects by admin connection string instead. |
| `hub_r2_project_binding` | Held the binding intent surface. `055` revoked every privilege it has. |
| `hub_r2_brain_read` | Held the Brain read surface. `055` revoked every privilege it has. |
| `hub_r2_brain_attester` | Held the Brain attestation surface. `055` revoked every privilege it has. |
| `hub_r2_key_conformance_subject` | Held the key conformance subject. `055` revoked every privilege it has. |
| `hub_s4_baseline_read` | Held the Baseline read surface. `055` revoked every privilege it has. |
| `hub_s4_baseline_command` | Held the Baseline command surface. `055` revoked every privilege it has. |
| `hub_s6_inception_command` | Held the Inception command surface. `055` revoked every privilege it has. |

Migration `055` dropped the Brain, the bindings, Baseline, Inception and the Sankhya connections,
and revoked every privilege the roles above still held. It did not drop the roles themselves. A
role is cluster-global while its privileges are per database, so `DROP ROLE` answers `2BP01`
whenever any other database on the cluster still grants to it. A migration that dropped them would
succeed or fail depending on what else the cluster hosts, which is not a property a forward-only
migration may have. Removing them is a cluster operation, listed under follow-ups.

## Roles are cluster-global

A role is not scoped to a database. A test that creates a throwaway database and then runs
`ALTER ROLE hub_rb_executor PASSWORD` changes the credential for every database in that
cluster, including a live Hub's. This caused two incidents; the second was diagnosed on
2026-09-18 when the roles were found holding fixture values from
`builder-run-invariants-postgres.test.mjs`. `tests/implementation/protected-cluster.mjs`
now refuses those suites against a cluster hosting a protected database.

## Provisioning and the startup census

Migration `019` creates the roles with `LOGIN` and no password, so a fresh cluster needs them
supplied from outside. `scripts/provision-hub-roles.mjs` does that as an installation step,
not as a power the Hub holds. It reads each role's password from the file its register row
names, and it issues `ALTER ROLE` only for a role whose current password does not already
authenticate, so a second run writes nothing. It never generates a password, never creates a
role, and never touches a grant or a role attribute.

- `npm run db:roles:census` is the read-only mode. It reports each role as `ok`, `invalid`
  with its SQLSTATE, or `unconfigured` when no password file is configured.
- `npm run db:roles:provision` repairs the invalid ones. It needs `CONEXUS_PROVISION_USER` and
  `CONEXUS_PROVISION_PASSWORD_FILE` for a credential that may `ALTER ROLE`, and it reaches for
  them only when there is something to repair. In the pilot that is `db-root`.

`apps/hub/src/platform/connection-census.ts` runs the same read-only probe once at Hub
startup and logs one `HUB_CONNECTION_CENSUS` line per connection that is not `ok`. It never
stops the Hub, because one capability holding a bad credential must not take the others down.
Before it existed the pools connected lazily, so a `28P01` first appeared in the middle of
somebody's request.

Its states are more specific than the provisioning census's, because a startup probe must tell
an operator whether to fix a credential or fix a network path. A role is `invalid` only on an
authentication SQLSTATE (`28P01` wrong password, `28000` role does not exist or similar); a
cluster that refuses the connection outright (`ECONNREFUSED`, a timeout, no SQLSTATE at all) is
`unreachable`. A role whose password file cannot be read, or reads empty, is `unreadable`; that
role is skipped and the rest of the census still runs, and the report never repeats the file's
content or path, only the role.
