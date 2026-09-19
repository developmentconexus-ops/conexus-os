# Hub database role register

Every Hub connection authenticates as a capability role, named for the capability it holds rather
than for the program phase that introduced it. This
register maps each one to its capability, the module that connects as it, and the configuration
that supplies its password.

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
| `hub_workspace_read` | `workspace-read` | `server.ts` | `CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE` |
| `hub_workspace_command` | `workspace-command` | `server.ts` | `CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE` |
| `hub_project_read` | `project-read` | `project/module.ts` | `CONEXUS_DB_PROJECT_READ_PASSWORD_FILE` |
| `hub_project_command` | `project-command` | `project/module.ts` | `CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE` |
| `hub_model_connection` | `connections` | `model-connection-account/module.ts` | `CONEXUS_DB_MODEL_CONNECTION_PASSWORD_FILE` |
| `hub_builder_ingress` | `builder-request` | `builder/module.ts` | `CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE` |
| `hub_builder_executor` | `builder-run-execution` | `builder/module.ts` | `CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE` |

These eight and the six owner roles `iam_owner`, `workspace_owner`, `project_owner`,
`registry_owner`, `builder_owner` and `model_connection_owner` are every role the product has. A
cluster built only from `apps/hub/migrations/0001_baseline.sql` holds exactly those fourteen.

## The Builder split, which is load-bearing

`hub_builder_ingress` and `hub_builder_executor` are not two names for one thing. `builder/store.ts`
routes nine read and admit calls through the ingress pool and eleven claim and
state-changing calls through the executor pool. HTTP handlers reach only the ingress side;
the background execution loop reaches the executor side. A request path holding
`hub_builder_ingress` has no grant to claim, settle, fail or interrupt a BuilderRun.

The separation bounds a logic bug, not an attacker. Both pools live in the same process,
declared three lines apart, so code execution in the Hub reaches either one. The property
that does hold against a wider class of failure is that no Hub role has table grants at
all: 236 functions are `SECURITY DEFINER` and `REVOKE ALL ON ALL TABLES` is applied.
`hub_iam_runtime` is the exception, holding direct `SELECT`, `INSERT` and `UPDATE` on the
`iam` tables.

## Roles the replaced history left behind

Eighteen role names were created by migrations 001 to 059 and are created by nothing today:

```
brain_owner            claude_connection_owner  connections_owner
hub_prj03_command      hub_r2_brain_attester    hub_r2_brain_bootstrap
hub_r2_brain_read      hub_r2_connections       hub_r2_key_conformance_subject
hub_r2_project_binding hub_rb_executor          hub_rb_ingress
hub_s2_read            hub_s3_read              hub_s4_baseline_command
hub_s4_baseline_read   hub_s6_inception_command hub_ws01_command
```

Eight of them were the phase-named predecessors of the capability roles above, and the rest held
surfaces that were dropped with the Brain, the bindings, Baseline, Inception and the Sankhya
connections. `0001_baseline.sql` names none of them, so a cluster built from it never has them, and
`tests/implementation/hub-baseline.test.mjs` fails if one reappears in the file.

A cluster that ran the old history still carries them, because a role is cluster-global while its
privileges are per database, so no migration could drop one: `DROP ROLE` answers `2BP01` whenever
any other database on the cluster still grants to it, which makes the result depend on what else
the cluster hosts. Removing them is therefore a cluster operation, run once, after every database
on that cluster has been adopted onto the baseline:

```bash
node scripts/drop-superseded-hub-roles.mjs            # dry run, reports what it would drop
node scripts/drop-superseded-hub-roles.mjs --apply
```

It surveys every database in the cluster first and refuses, naming the role and the database, if
any of them still owns a relation, schema, function or type, or holds a role membership. With
`--apply` it runs `DROP OWNED BY` in each database and then `DROP ROLE`. Three of the eighteen
still hold grants on a database at `059`; `--adopt-baseline` removes those as part of adoption, so
adoption runs first.

An operator upgrading a deployment renames the secret files and the environment variables with
`scripts/cutover-hub-role-names.mjs`, which is a dry run unless given `--apply`. It copies each
secret file to its new name at mode 0600, rewrites the variable names in the environment file and
keeps a timestamped backup, prints names only, and changes nothing on a second run. It never
generates a password. After it and the adoption, `npm run db:roles:provision` gives the new roles
the passwords in those files, and the startup census should then report every role `ok`. The Hub
refuses a stale environment rather than failing to authenticate: each retired variable name is
rejected at startup with `RETIRED_CONFIG_<old>_USE_<new>`.

## Roles are cluster-global

A role is not scoped to a database. A test that creates a throwaway database and then runs
`ALTER ROLE hub_builder_executor PASSWORD` changes the credential for every database in that
cluster, including a live Hub's. This caused two incidents; the second was diagnosed on
2026-09-18 when the roles were found holding fixture values from
`builder-run-invariants-postgres.test.mjs`. `tests/implementation/protected-cluster.mjs`
now refuses those suites against a cluster hosting a protected database.

## Provisioning and the startup census

`0001_baseline.sql` creates the roles with `LOGIN` and no password, so a fresh cluster needs them
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
