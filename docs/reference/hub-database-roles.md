# Hub database role register

Every Hub connection authenticates as a capability role. The role names carry the program
phase that introduced them rather than what they permit, so this register maps each one to
its capability, the module that connects as it, and the configuration that supplies its
password.

The capability labels are not prose. They live in `CAPABILITY_BY_ROLE` in
`apps/hub/src/platform/postgres.ts`, and `createPostgresPool` writes them into
`application_name` on every connection, so `pg_stat_activity` and the server log show the
capability beside the role. A label in this table that disagrees with that map is a defect
in this table.

## Roles the Hub connects as

| Role | Capability | Connects from | Password configuration |
| --- | --- | --- | --- |
| `hub_iam_runtime` | `identity-and-access` | `server.ts` main pool | `CONEXUS_DB_PASSWORD_FILE` |
| `hub_s2_read` | `workspace-read` | `server.ts` | `CONEXUS_DB_S2_READ_PASSWORD_FILE` |
| `hub_ws01_command` | `workspace-command` | `server.ts` | `CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE` |
| `hub_s3_read` | `project-read` | `project/module.ts` | `CONEXUS_DB_S3_READ_PASSWORD_FILE` |
| `hub_prj03_command` | `project-command` | `project/module.ts` | `CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE` |
| `hub_s4_baseline_read` | `project-baseline-read` | `project/module.ts` | `CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE` |
| `hub_s4_baseline_command` | `project-baseline-command` | `project/module.ts` | `CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE` |
| `hub_s6_inception_command` | `project-inception-command` | `project/module.ts` | `CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE` |
| `hub_r2_project_binding` | `project-binding` | `project/module.ts` | binding password file |
| `hub_r2_brain_read` | `brain-read` | `server.ts` | brain read password file |
| `hub_r2_key_conformance_subject` | `key-conformance-subject` | `server.ts` | key conformance password file |
| `hub_r2_connections` | `connections` | `connections/module.ts`, `claude-account/module.ts` | `CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE` |
| `hub_rb_ingress` | `builder-request` | `builder/module.ts` | builder ingress password file |
| `hub_rb_executor` | `builder-run-execution` | `builder/module.ts` | builder executor password file |

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
| `hub_r2_brain_attester` | Named `legacyAttester` in `config.ts`. No pool connects as it. |
| `hub_r2_brain_bootstrap` | The bootstrap script connects by admin connection string instead. |
| `hub_mar_runtime` | Created only by held migration `024`, so absent from a current install. |

## Roles are cluster-global

A role is not scoped to a database. A test that creates a throwaway database and then runs
`ALTER ROLE hub_rb_executor PASSWORD` changes the credential for every database in that
cluster, including a live Hub's. This caused two incidents; the second was diagnosed on
2026-09-18 when the roles were found holding fixture values from
`builder-run-invariants-postgres.test.mjs`. `tests/implementation/protected-cluster.mjs`
now refuses those suites against a cluster hosting a protected database.

Nothing in the repository provisions these passwords. Migration `019` creates the roles
with `LOGIN` and no password, so a fresh cluster needs them supplied from outside. Closing
that gap is step 3 of the remediation in `docs/roadmap.md`.
