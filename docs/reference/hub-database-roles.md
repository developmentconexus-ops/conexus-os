# Hub database role register

The Hub connects as one runtime role for its data and one for Mastra's storage. This register maps
each role to its capability, the module that connects as it, and the configuration that supplies its
password.

The register is
[`contracts/technical/hub-database-roles.json`](../../contracts/technical/hub-database-roles.json),
and `scripts/generate-hub-role-register.mjs` projects it into
`apps/hub/src/platform/hub-roles.generated.ts`, from which `platform/db.ts` writes the capability
into `application_name` on every connection. So `pg_stat_activity` and the server log show
the capability beside the role. `npm run db:roles:check` refuses a projection that drifts and
runs inside `npm run verify`, so a label in this table that disagrees with the register is a
defect in this table. Adding a role means adding a row to the register and regenerating.

## Roles the Hub connects as

| Role | Capability | Connects from | Password configuration |
| --- | --- | --- | --- |
| `hub_runtime` | `hub-data` | `hub.ts`, one pool for every owner | `CONEXUS_DB_PASSWORD_FILE` |
| `hub_factory` | `factory-storage` | `builder/module.ts` | `CONEXUS_DB_FACTORY_PASSWORD_FILE` |

`hub_runtime` is the only login role for the Hub's data. It holds `EXECUTE` only on the functions the
older capability roles held, copied by `0062_runtime_data_boundary.sql`, and no default privilege
grants it a function created later. It is refused 42501 on any DDL, on `factory`, and, with no role
switched, on every table a part has split. A transaction starts by switching to one of the two
transaction roles below, and its authority comes from that role, the row policies on the tables a part
has split and the proof an admission function makes (see
[security and authority](security-and-authority.md#2-database-roles)).

## Transaction roles

`hub_reader` and `hub_command` are `NOLOGIN NOINHERIT NOBYPASSRLS` and are listed under
`transactionRoles` in the register. `hub_runtime` is a member of each `WITH INHERIT FALSE, SET TRUE`,
and the Hub runs `SET LOCAL ROLE` as the first statement of every transaction.

| Role | Used by | Holds |
| --- | --- | --- |
| `hub_reader` | `database.read` | `SELECT` on the split tables a person reads, each behind a `reader` policy; `EXECUTE` on the `rls.*` helpers and the `reg` served functions |
| `hub_command` | `database.transaction` and `database.system` | the verbs and columns the table register lists per split table, a `USING (true)` policy named `command`, and `EXECUTE` on the purges, `builder.register_project_repository` and `iam.lock_administrators()` |

## Roles that never connect

| Role | Owns or does | Why it never logs in |
| --- | --- | --- |
| `conexus_owner` | schema `platform` and its tables | the owner of what `hub_runtime` uses; `NOLOGIN` |
| `iam_rls` | the `rls.acting_*` helper functions the policies call | holds `SELECT` on the few tables the helpers read and nothing else; `NOLOGIN`, no `BYPASSRLS` |
| `iam_owner`, `workspace_owner`, `project_owner`, `registry_owner`, `builder_owner`, `connector_owner`, `model_owner` | the schemas and functions of an owner whose rules are still in SQL | `NOLOGIN`; each is dropped, with its objects moved to `conexus_owner`, when its part ports the owner |
| `hub_iam_runtime` and the other capability roles marked `legacy` in the register | nothing the Hub uses | their grants stay until the last owner is ported, and no Hub module connects as them |
| `hub_workspace_read`, `hub_workspace_command` | retired | `0063_workspace_admission.sql` drops them with the last functions they could execute |

`assertRoleInvariants` in `scripts/hub-catalog.mjs` reads `pg_roles` and refuses a role of the Hub that
holds `SUPERUSER`, `CREATEROLE`, `CREATEDB`, `REPLICATION` or `BYPASSRLS`, any membership between Hub or
owner roles other than `hub_runtime` in `hub_reader` and in `hub_command`, either of those two with
`INHERIT` or `ADMIN`, a `role` or `session_authorization` setting on `hub_runtime` or the database, an owner role that can log in, a Hub role that inherits, an object in a Hub schema owned by
a role the register does not list, and any function executable by `PUBLIC`. It also checks that
`iam_rls` owns exactly the helpers the register names and holds nothing but `SELECT`.

## `hub_factory`, the one role that owns its schema

`0011_factory_binding.sql` creates `hub_factory` and the schema `factory`, owned by it. This is
the one login role that owns a schema and runs DDL; `hub_runtime` holds data manipulation only. The Mastra Factory keeps its storage in `factory` through `@mastra/pg`'s
`PgFactoryStorage`, which creates and migrates its own tables at runtime. So the role that connects
for it must be able to run DDL there, and no Hub migration describes what it creates.

The ownership is bounded in both directions:

- `hub_factory` holds `CREATE` and `USAGE` on `factory`, as its owner, and no grant on any other
  schema, table or Hub function. Like every role, it can name `public`, which is empty.
- No other role holds any grant on `factory`. The Hub never reads Factory tables for a Project:
  its source is its repository in the Conexus Git, recorded in `builder.project_repository`.

`scripts/hub-catalog.mjs` leaves the objects inside `factory` out of the catalog snapshot, because
they are the package's, not the migrations'. The `factory` schema line itself stays, with its owner
and grants, so a grant on it to any other role is catalog drift and refuses the next migration run.
`tests/implementation/builder-conexus-git.postgres.test.mjs` asserts both bounds.

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

Eight of them were the phase-named predecessors of the capability roles, and the rest held
surfaces that were dropped with the Brain, the bindings, Baseline, Inception and the Sankhya
connections. `0001_baseline.sql` names none of them, so a cluster built from it never has them, and
`tests/implementation/hub-baseline.postgres.test.mjs` fails if one reappears in the file.

A cluster that ran the old history still carries them, because a role is cluster-global while its
privileges are per database, so no migration could drop one: `DROP ROLE` answers `2BP01` whenever
any other database on the cluster still grants to it, which makes the result depend on what else
the cluster hosts. Removing them was therefore a cluster operation, run once on 2026-09-19 after the
pilot, the only database on the old history, was adopted onto the baseline. No database with the
old ledger exists any more, so there is no cluster left carrying these eighteen names, and the
one-time adoption and role-drop scripts that did the work were deleted with it.

## Roles are cluster-global

A role is not scoped to a database. A test that creates a throwaway database and then runs
`ALTER ROLE hub_builder_executor PASSWORD` changes the credential for every database in that
cluster, including a live Hub's. This caused two incidents; the second was diagnosed on
2026-09-18 when the roles were found holding fixture values from
`builder-run-invariants.postgres.test.mjs`. `tests/implementation/protected-cluster.mjs`
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
Hub's census does not probe them. They live in the application database `conexus_apps` on the
Applications PostgreSQL, a cluster apart from the Hub's with storage of its own
(`scripts/run-application-cluster.sh`, `scripts/mount-application-cluster-storage.sh`). The Hub's
cluster holds none of them.

| Role | Created by | Connects from | Authority |
| --- | --- | --- | --- |
| `app_provisioner` | `scripts/provision-application-database.mjs`, an installation step | the application runner (`apps/hub/src/app-runner/main.ts`), password from `CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE` | `LOGIN CREATEROLE`, no superuser, database creation, replication or Hub authority; owns the application database and every Project Preview schema |
| `app_<project>_preview_mig` | `app_provisioner`, per Project | the runner's sandboxed worker, through its pinned relay | `USAGE, CREATE` on its own Preview schema only |
| `app_<project>_preview_rt` | `app_provisioner`, per Project | the runner's sandboxed worker, through its pinned relay | `USAGE` on its own Preview schema and exactly DML on what its migration role created; the runner revokes anything more a migration grants it or PUBLIC, after every migration |

A Project role has no usable password. Its password is `NULL` and its `VALID UNTIL` is
`-infinity`. Postgres lets a role change its own password but not its `VALID UNTIL`, so a password
that generated code sets for its own role is already expired. The cluster's `pg_hba.conf` admits a
Project role name only over TLS, only to the application database, and only with the runner's
client certificate (CN `conexus-app-relay`, mapped in `pg_ident.conf`). It rejects that name on
every other line. `scripts/confine-application-cluster.mjs` installs those rules and the server's TLS
files. The CA key and the server key stay in a separate authority directory. The runner reads its
certificate from `CONEXUS_APP_RELAY_TLS_DIR`, which must hold exactly `ca.pem`, `relay.pem` and
`relay-key.pem` and be closed to group and others, and presents it only from the per-invocation
relay, outside the sandbox. At startup the runner checks its provisioner credential, refuses to serve
while PUBLIC or a Project role can use a trusted routine language, and brings every Project role it
administers under these rules.

The installation step refuses a cluster that holds any registered Hub role, so application roles
cannot land in the Hub's cluster. It revokes PUBLIC's `CONNECT` on the Applications cluster's
`postgres`, and refuses to revoke while a role that holds `CONNECT` only through PUBLIC is connected.
It grants `app_provisioner` the reserved connection slots (`pg_use_reserved_connections` with
`INHERIT`), so Project sessions cannot take the runner's way in.
