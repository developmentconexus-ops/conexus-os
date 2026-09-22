# Stage 2 Q1 evidence

**Task:** [`docs/tasks/stage2-q1-handler-runtime-data-qualification.md`](../../tasks/stage2-q1-handler-runtime-data-qualification.md)
**Branch:** `feat/stage2-q1`
**Status:** in progress. Each unit below records what it proved and how to rerun it.

## Q1.0 exact dependency and API verification

Measured on the pilot host (WSL2 kernel 6.18.33.2, Ubuntu) on 2026-09-22 against the scratch
cluster `conexus-r05-scratch` (127.0.0.1:55432). The pilot cluster on 5433 was not touched.

| Fact | Observed |
| --- | --- |
| Node | 24.20.0. `process.features.typescript` is `strip`. |
| Installed baseline | Fastify 5.12.1, pg 8.23.0, Zod 4.5.2, vite 8.2.2, esbuild 0.28.2, TypeScript 6.0.2. No package is added by Q1. |
| Postgres | 17.10 on both the pilot and the scratch cluster, `password_encryption=scram-sha-256`. |
| bubblewrap | `/usr/bin/bwrap` 0.11.1, rootless. `kernel.unprivileged_userns_clone` absent (enabled by default), `user.max_user_namespaces=55865`, no AppArmor userns restriction sysctl. |
| fd passing through bwrap | A pipe on fd 3 of the `bwrap` process reaches the sandboxed Node as fd 3. The worker's result travels there and its stdout stays free for logs. |
| Database socket into the sandbox | A unix socket created by the supervisor and bound at `/run/conexus/pg/.s.PGSQL.5432` carries a pg 8.23 session from inside an empty network namespace to the host's TCP Postgres. Inside the sandbox a TCP connect to `127.0.0.1:<postgres port>` answers `ECONNREFUSED`, because the loopback is the namespace's own. |
| Node permission model | `--permission --allow-fs-read=/app/*` still lets the bundled pg client use the bound unix socket, and refuses `child_process` with `ERR_ACCESS_DENIED`. It is defense in depth only. The boundary is the namespace sandbox. |
| Postgres 17 `CREATEROLE` | A `CREATEROLE` role creates and alters the roles it created, can grant itself `SET` membership in them, and gets `42501` for altering a role it did not create, granting itself a foreign role, creating a superuser, creating a database and making itself superuser. |
| Handler bundling | The pinned compiler's own vite 8.2.2 JS API (`build({ ssr: { noExternal: true }, build: { ssr: true, rolldownOptions: { input } } })`) bundles TypeScript handlers, including `enum`, into self-contained ESM with shared chunks. A bare import that the handler root cannot resolve fails the build (`Rolldown failed to resolve import "react"`). No E2B template rebuild is needed. |

Material limitations recorded before the runner was written:

- The operator's OS user owns every Hub secret file, so the supervisor itself is in the Hub's trust
  domain. Only the per-invocation sandbox is a boundary. This is the arena's finding and the reason
  the worker, not the supervisor, runs generated code.
- A worker killed on its wall-clock bound can leave its SQL statement running in its backend. The
  relay therefore records each session's `BackendKeyData` and sends a `CancelRequest` for it when the
  invocation ends.
- GitHub's `ubuntu-24.04` runners restrict unprivileged user namespaces through AppArmor, so the
  sandbox suites run on the pilot host and are recorded here; the database-privilege suites run in CI.

Rerun: `node ~/q1/probe/q10.mjs` and `node ~/q1/probe/vite-ssr.mjs` from `~/wt-q1` with the scratch
cluster up (throwaway probes, kept outside the repository; the unit tests below encode the same facts).

### Code census before the first product edit

| Path | Disposition | Why |
| --- | --- | --- |
| `apps/hub/src/builder/application-starter.ts` | CHANGE | The check contract gains the server check and the server skill, and the agent instruction that confines edits to `app/**` must admit `conexus/handlers`, `conexus/migrations` and `conexus/manifest.json`. |
| `apps/hub/src/builder/application-artifact-runtime.ts` | CHANGE | The build bundles handlers and normalizes the manifest into `conexus-server/` of the same output, and the smoke answers the app API from a local fixture. |
| `apps/hub/compiler-template/**` | KEEP | Its vite 8.2.2 already has the JS API the handler bundle needs. The template ref stays `537fnzf4c16x9d7oz21k:0f44de30-d856-40d1-b6b3-54a8bbf2f440`. |
| `apps/hub/src/mar/module.ts` | CHANGE | Carries the application runner client into the Preview routes. |
| `apps/hub/src/mar/preview-routes.ts` | CHANGE | Adds `POST /__conexus/api/<operation>`, changes `connect-src 'none'` to `connect-src 'self'`, and never serves `conexus-server/`. |
| `apps/hub/src/registry/application-artifact-store.ts` and `reg.retain_application_execution` | KEEP | Handler bundles are `.mjs` and the normalized manifest is `.json` under `conexus-server/`, which the path rule and the media-type table already admit. No registry migration. |
| `scripts/provision-hub-roles.mjs`, `contracts/technical/hub-database-roles.json`, census | CHANGE | One new register row, `app_provisioner`, connecting to the application database from the application runner. |
| `scripts/check-import-law.mjs` | MEASURE | The runner is a new owner under `apps/hub/src/app-runner`; it must import no Hub owner. |
| Builder compile/smoke/Preview tests | CHANGE | `builder-application-runtime`, `builder-application-starter`, `preview-form-policy` follow the changed contracts. |
| E2B template runtime assumptions | KEEP | Root runs the Conexus build; `conexus-agent` runs the check; both can import `/opt/conexus/compiler/node_modules/vite`. |

## Q1.1 data isolation substrate

The application database is separate from the Hub database and is owned by `app_provisioner`, a
`CREATEROLE` role with no superuser, database-creation, replication or Hub authority.
`scripts/provision-application-database.mjs` creates both with the installation credential and closes
what PUBLIC holds there (`CONNECT`, `TEMPORARY`, the `public` schema). Per Project,
`apps/hub/src/app-runner/data-plane.ts` derives every name from the Project id alone:

| Object | Name | Authority |
| --- | --- | --- |
| Preview schema | `p_<projectHex>_preview` | Owned by `app_provisioner`, so no Project role can grant it away or drop it |
| Migration role | `app_<projectHex>_preview_mig` | `USAGE, CREATE` on its schema, `SELECT, INSERT` on the ledger, connection limit 2 |
| Runtime role | `app_<projectHex>_preview_rt` | `USAGE` on its schema, DML on what the migration role creates (default privileges), connection limit 8 |
| Ledger | `<schema>.conexus_migration` | Owned by `app_provisioner`; the migration role appends inside its own transaction |

Role passwords are `HMAC-SHA256(runner key, role name)`, so provisioning converges after a restart
without storing a secret per Project. Migrations run in one transaction as the migration role. The
applied history must be an exact prefix of the artifact's migrations; otherwise the Preview schema is
dropped, every migration replays, and the caller says so.

`tests/implementation/application-data-postgres.test.mjs` logs in as each Project role with its real
derived password and proves, on a throwaway application database plus a throwaway Hub database:

- Project A's runtime role reads and writes its own table. It gets `42501` for Project B's table,
  `SET ROLE` to B, to its own migration role or to the provisioner, any DDL, `TRUNCATE`, the ledger,
  `public`, `TEMP` and `CREATE SCHEMA`. Its `GRANT USAGE` on its own schema to B only warns and grants
  nothing.
- Neither Project role holds usage on any Hub schema, any Hub table privilege or any executable Hub
  function (counts 0, 0, 0). A role with no grant cannot connect to the application database.
- The migration role gets `42501` for `CREATE EXTENSION dblink` and `postgres_fdw`, `COPY ... TO
  PROGRAM`, `COPY ... TO '<file>'`, `pg_read_file`, `lo_import`, `ALTER ROLE` on its runtime role or on
  a foreign role, `CREATE ROLE`, `CREATE SCHEMA`, creating in `public` or in B's schema, reading B's
  table, writing `pg_authid`, dropping its own schema or ledger, rewriting the ledger and
  `SET ROLE app_provisioner`. Three owner-only statements succeed and carry nothing: `GRANT USAGE ON
  SCHEMA` to B (it is not the owner, so nothing is granted), `GRANT SELECT` on its table to B (B still
  lacks schema usage and reads `42501`), and a `SECURITY DEFINER` function, which runs as the
  unprivileged migration role.
- A failing second migration rolls back: no new column, one ledger row. An edited applied migration
  plans a reset; after it the table is empty and the ledger holds the new digest.

Rerun with `CONEXUS_TEST_DB_*` pointing at a disposable cluster:
`node --test --test-concurrency=1 tests/implementation/application-data-postgres.test.mjs`. CI runs it
as the `application-data-postgres` step.
