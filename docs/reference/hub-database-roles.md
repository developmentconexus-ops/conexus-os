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
| `hub_builder_ingress` | `builder-request` | `builder/module.ts` | `CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE` |
| `hub_builder_executor` | `builder-run-execution` | `builder/module.ts` | `CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE` |
| `hub_factory` | `factory-storage` | `builder/factory.ts` | `CONEXUS_DB_FACTORY_PASSWORD_FILE` |

These eight and the five owner roles `iam_owner`, `workspace_owner`, `project_owner`,
`registry_owner` and `builder_owner` are every role the product has. A cluster built from
`apps/hub/migrations/` holds exactly those thirteen. `0009_remove_model_connections.sql` dropped
`hub_model_connection` and `model_connection_owner` with the model connection subsystem, and leaves
either one in place while another database on the cluster still grants to it.

## The Builder split, which is load-bearing

`hub_builder_ingress` and `hub_builder_executor` are not two names for one thing. `builder/store.ts`
routes nine read and admit calls through the ingress pool and eleven claim and
state-changing calls through the executor pool. HTTP handlers reach only the ingress side;
the background execution loop reaches the executor side. A request path holding
`hub_builder_ingress` has no grant to claim, settle, fail or interrupt a BuilderRun.

The separation bounds a logic bug, not an attacker. Both pools live in the same process,
declared three lines apart, so code execution in the Hub reaches either one. The property
that does hold against a wider class of failure is that no Hub role has table grants at
all: every one of the 62 functions is `SECURITY DEFINER` and `REVOKE ALL ON ALL TABLES` is applied.
`hub_iam_runtime` is the exception, holding direct `SELECT`, `INSERT` and `UPDATE` on the
`iam` tables. `iam.installation_administrator` is not among them: `hub_iam_runtime` reaches it
only through the installation administration functions (`iam.is_installation_administrator`,
`iam.grant_installation_administrator`, `iam.revoke_installation_administrator`,
`iam.list_installation_administrators`, `iam.grant_installation_administrator_by_email`), and no
Hub role may execute `iam.bootstrap_installation_administrator`. The operator runs that one with
the provisioning credential described below.

## `hub_factory`, the one role that owns its schema

`0011_factory_binding.sql` creates `hub_factory` and the schema `factory`, owned by it. This is
the one exception to the rule that an owner role holds each schema and login roles reach it only
through granted functions. The Mastra Factory keeps its storage in `factory` through `@mastra/pg`'s
`PgFactoryStorage`, which creates and migrates its own tables at runtime. So the role that connects
for it must be able to run DDL there, and no Hub migration describes what it creates.

The exception is bounded in both directions:

- `hub_factory` holds `CREATE` and `USAGE` on `factory`, as its owner, and no grant on any other
  schema, table or Hub function. Like every role, it can name `public`, which is empty.
- No other role holds any grant on `factory`. The Hub reads a Project's binding to the Factory
  through `builder.factory_binding`, owned by `builder_owner` like the rest of `builder`, never
  from Factory tables.

`scripts/hub-catalog.mjs` leaves the objects inside `factory` out of the catalog snapshot, because
they are the package's, not the migrations'. The `factory` schema line itself stays, with its owner
and grants, so a grant on it to any other role is catalog drift and refuses the next migration run.
`tests/implementation/builder-factory-binding-postgres.test.mjs` asserts both bounds.

Its register row is `"optional": true`, so a Hub without `CONEXUS_DB_FACTORY_PASSWORD_FILE` leaves it
out of the startup census instead of reporting it `unconfigured`. With the file, it is censused like
any other role.

The Hub connects as `hub_factory` only when the Factory is configured, and its pool pins
`search_path` to `factory` on every connection, because `PgFactoryStorage` creates its tables under
unqualified names. `tests/implementation/builder-factory-composition.test.mjs` runs `prepare()` as
a throwaway role owning a throwaway `factory` schema and asserts every table lands there.

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
the cluster hosts. Removing them was therefore a cluster operation, run once on 2026-09-19 after the
pilot, the only database on the old history, was adopted onto the baseline. No database with the
old ledger exists any more, so there is no cluster left carrying these eighteen names, and the
one-time adoption and role-drop scripts that did the work were deleted with it.

An operator upgrading a deployment renames the secret files and the environment variables with
`scripts/cutover-hub-role-names.mjs`, which is a dry run unless given `--apply`. It copies each
secret file to its new name at mode 0600, rewrites the variable names in the environment file and
keeps a timestamped backup, prints names only, and changes nothing on a second run. It never
generates a password. After it, `npm run db:roles:provision` gives the new roles the passwords in
those files, and the startup census should then report every role `ok`. The Hub refuses a stale
environment rather than failing to authenticate: each retired variable name is rejected at startup
with `RETIRED_CONFIG_<old>_USE_<new>`.

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

## Roles outside the Hub database: the application runner

Stage 2 Q1 adds roles the Hub never connects as, so they are not rows of the register above and the
Hub's census does not probe them. They live in the application database, which is separate from the
Hub database on the same cluster.

| Role | Created by | Connects from | Authority |
| --- | --- | --- | --- |
| `app_provisioner` | `scripts/provision-application-database.mjs`, an installation step | the application runner (`apps/hub/src/app-runner/main.ts`), password from `CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE` | `LOGIN CREATEROLE`, no superuser, database creation, replication or Hub authority; owns the application database and every Project Preview schema |
| `app_<project>_preview_mig` | `app_provisioner`, per Project | the runner's sandboxed worker, through its pinned relay | `USAGE, CREATE` on its own Preview schema only |
| `app_<project>_preview_rt` | `app_provisioner`, per Project | the runner's sandboxed worker, through its pinned relay | `USAGE` on its own Preview schema and DML on what its migration role created |

A Project role's password is `HMAC-SHA256(runner key, role name)` with the key in
`CONEXUS_APP_RUNNER_KEY_FILE`, so the runner never stores a secret per Project. The runner checks
its own credential at startup and refuses to serve without it.
