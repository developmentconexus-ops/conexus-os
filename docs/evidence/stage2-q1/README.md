# Stage 2 Q1 evidence

**Task:** [`docs/tasks/stage2-q1-handler-runtime-data-qualification.md`](../../tasks/stage2-q1-handler-runtime-data-qualification.md)
**Branch:** `feat/stage2-q1`
**Status:** proposed verdict **ACCEPT_WITH_BOUNDARY** against the task as amended on 2026-09-23
(two PostgreSQL clusters; Q1.8 proven structurally). See [Verdict](#verdict). The third independent
review decides. Each unit below records what it proved and how to rerun it.

Two amendments changed the task after the first candidate. The first moved application data to an
Applications PostgreSQL cluster of its own, apart from the Hub's. The second made Q1.8 a structural
proof. [The two-cluster topology](#the-two-cluster-topology-2026-09-23-amendment) records how the
pilot realizes it. Q1.1, Q1.6 and the database cases of Q1.7 ran again against that cluster. The
Builder runs of Q1.5 do not depend on where data lives and stand as recorded.

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
- GitHub's `ubuntu-24.04` runners restrict unprivileged user namespaces through AppArmor. Q1.2
  lifts that restriction in the verify job, so the sandbox suite also runs in CI.

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

## The two-cluster topology (2026-09-23 amendment)

The Control Plane is the Hub and the Hub PostgreSQL (`conexus-s7-postgres`, 127.0.0.1:5433). The
Data Plane is the application runner and the Applications PostgreSQL (`conexus-apps-postgres`,
127.0.0.1:5434). They are two clusters in two containers, with different system identifiers
([`q1.8/structural.txt`](q1.8/structural.txt)). The Hub cluster holds no application database,
schema or Project role. The Applications cluster holds `conexus_apps`, with one schema per Project ×
environment.

### Q1.0 step 4: the storage mechanism

The pilot uses a preallocated, fixed-size filesystem image for the Applications cluster:

| Fact | Pilot value | Evidence |
| --- | --- | --- |
| Image | `/var/lib/conexus/applications-postgres.img`, 4,294,967,296 bytes, 8,388,616 × 512 bytes allocated (not sparse) | `stat`, [`q1.8/structural.txt`](q1.8/structural.txt) |
| Filesystem | ext4 on `/dev/loop2`, mounted at `/var/lib/conexus/applications-postgres` by the systemd unit `var-lib-conexus-applications\x2dpostgres.mount` (`Before=docker.service`, `nodiscard,noatime`) | `findmnt`, `systemctl` |
| What it holds | PGDATA, `pg_wal` (a directory, not a link), the server log (`logging_collector` into `PGDATA/log`) and temporary files (`temp_tablespaces` empty; the only tablespaces are `pg_default` and `pg_global`). Each path reports device `/dev/loop2` from inside the container. | [`q1.8/structural.txt`](q1.8/structural.txt) |
| How the cluster reaches it | `--mount type=bind,source=/var/lib/conexus/applications-postgres/pgdata`, never `-v`, so a missing source is an error, not a new directory on the root filesystem | `docker inspect` |
| Probe image for destructive proofs | `/var/lib/conexus/q1-storage-probe.img`, 1 GiB, 2,097,160 × 512 bytes allocated, on `/dev/loop0` | [`topology/storage-proof.txt`](topology/storage-proof.txt) |

`scripts/mount-application-cluster-storage.sh` installs the image and
`scripts/run-application-cluster.sh` starts the cluster. The operator ran the install with `sudo`.
Its first version had two defects, both fixed in the script and repaired by hand on the pilot:
`install -o 999` failed with "invalid user", so no `pgdata` directory existed; and each image came
out about 1.56% sparse, because mke2fs and the ext4 lazy initializer zero ranges of a loop device by
punching holes in the backing file. The script now initializes the inode tables and journal at
mkfs time (`-E nodiscard,lazy_itable_init=0,lazy_journal_init=0`), allocates the image again after
mkfs, rechecks the allocation after mounting and fails if it is sparse, and sets `pgdata` ownership
by numeric id.

The storage bound was proven on the 1 GiB probe filesystem, never the pilot's:

- **An unmounted filesystem stops the cluster, on every start (round 3).** The round-2 proof used a
  source path that did not exist, and the run script checked only that `pgdata` existed. An
  unmounted mountpoint holding a stale `pgdata` would have passed that check, and Docker restarts
  the container without the script. The install step now leaves a marker,
  `.conexus-apps-storage`, at the filesystem's root. `run-application-cluster.sh` takes the storage
  root and refuses without the marker (`APPLICATION_CLUSTER_STORAGE_MISSING`), without a mountpoint
  there (`APPLICATION_CLUSTER_STORAGE_NOT_MOUNTED`), and, for a loop image, with any block of the
  image unallocated (`APPLICATION_CLUSTER_STORAGE_SPARSE`). The container's entrypoint is a guard
  around the image's own: on every start it requires the marker, bound read-only from the root, on
  the same filesystem as PGDATA, and otherwise exits with `APPLICATION_CLUSTER_STORAGE_UNMOUNTED`.
  `application-cluster-installation.test.mjs` proves it on an ordinary directory holding a stale,
  initialized `pgdata`: the script refuses without the marker and without the mount, and with the
  marker removed the restart policy's own restart, `docker start` and `docker restart` are each
  refused and nothing serves ([`q1.8/start-guard-proof.txt`](q1.8/start-guard-proof.txt)). CI runs
  it; CI's own cluster opts out of the mountpoint and allocation checks only
  (`CONEXUS_APP_CLUSTER_UNMOUNTED_STORAGE=ci`), because its runner has no loop mount.
- **Filling it stays inside it.** A session wrote incompressible rows until the probe filesystem was
  full (192 KiB left). That cluster then restarted in a loop, unable to write WAL. Throughout, the
  Hub PostgreSQL kept its start time and served a write and read-back
  ([`topology/storage-proof.txt`](topology/storage-proof.txt)).
- **Writes into an allocated image do not consume the host's root filesystem; the fill's own numbers
  show a sparse image (corrected in round 3).** During the fill, the WSL root filesystem's free space
  fell by about 1.04 GB in step with the probe filesystem, and D: fell by 1.71 GB
  ([`topology/storage-proof.txt`](topology/storage-proof.txt)). The probe image was sparse while
  that fill ran: it was created before the allocation fix. `reserve-proof.txt` ran after the fill had
  allocated every block, so its 4 KiB delta for 400 MiB written shows only that writes into
  allocated blocks take no new root space
  ([`topology/reserve-proof.txt`](topology/reserve-proof.txt)). For the pilot image, Q1.8 item 3
  rests on its allocation (8,388,616 × 512 bytes for 4,294,967,296) and on a write measured on it in
  round 3: 400 MiB written into the pilot's PGDATA changed the WSL root filesystem's free space by 0
  bytes ([`q1.8/pilot-start-guard.txt`](q1.8/pilot-start-guard.txt)). The run script now refuses
  to start the cluster on an image with any block unallocated, since a trim punches holes even with
  `nodiscard`. On the pilot `fstrim.timer` is enabled but inactive, with no next run scheduled. On
  this Windows host the WSL disk file on D: still grows as the cluster writes: 1.71 GB for a 1 GiB
  image in the fill above, so the image size is not a bound on D:.
- **A full cluster recovers.** A full cluster restarted nine times in 60 seconds and could not
  recover alone. Deleting a 256 MiB root-owned `recovery-ballast` file beside `pgdata`, from a root
  container and with no `sudo`, let it start. It then dropped the filling table and wrote and read
  again ([`topology/recovery-proof.txt`](topology/recovery-proof.txt)). The install script now leaves
  that file, and the pilot volume has one.

**Carry-over.** On a VPS, a separate block volume mounted at the same path replaces the image, with
the same marker and `pgdata` at its root. The run script and the container's guard stay the same;
the allocation check applies only to a loop image. Backups of this cluster pass
`PGOPTIONS='-c transaction_timeout=0 -c statement_timeout=0'`: the cluster's 120 s
`transaction_timeout` ends a longer `pg_dump`. No repository script dumps it; the round-3 pilot
backup did so. On a managed PostgreSQL plan, the plan's storage size is
the bound, and the settings below become the plan's parameters.

**Container.** `postgres:17.10-bookworm` at the pinned digest. Published on 127.0.0.1:5434 only, with
`--memory 1g --memory-swap 1g` (the container's cgroup reads `memory.max` 1073741824 and
`memory.swap.max` 0 on cgroup v2), `--cpus 2`, `--pids-limit 512`, a read-only root, tmpfs
`/var/run/postgresql` and `/tmp`, `no-new-privileges`, Docker logs capped at 2 × 10 MB, and restart
`unless-stopped`. Its entrypoint is the storage guard above. Server logs rotate hourly into 24 files
named by the hour inside PGDATA, each truncated when its hour comes round, with no size-driven
rotation: PostgreSQL truncates only on a time-driven rotation, so round 2's 16 MB size rotation
appended to the same file and bounded nothing (round-3 N6). The logs hold at most the last day. The host has 14.6 GB of memory and 10 CPUs. The Hub cluster's container has no
memory limit.

### The settings

Cluster values come from `run-application-cluster.sh`, set on the server command line. Role values
are set per Project role by the runner (`data-plane.ts`) and restored at every prepare. The last
column is what a Project session can do, from the bounds test in `application-data-postgres.test.mjs`.

| Setting | Cluster | Runtime role | Migration role | Can a Project session change it? |
| --- | --- | --- | --- | --- |
| `statement_timeout` | 60s | 5s | 30s | Yes: `SET`, and `ALTER ROLE` on itself. The invocation wall clock bounds it: the worker is killed at 5 s (30 s for a migration) and the relay cancels its backend. |
| `transaction_timeout` | 120s | 6s | 30s | Yes, as above. |
| `lock_timeout` | 10s | 2s | 5s | Yes, as above. |
| `idle_in_transaction_session_timeout` | 30s | 10s | 10s | Yes, as above. The relay also closes every session when the invocation ends. |
| `temp_file_limit` | 1GB | 256MB | 1GB | No. `42501` on `SET` and `ALTER ROLE`. It is a superuser setting, and only `app_provisioner` holds `SET` on it. |
| Connection limit | `max_connections` 60, `reserved_connections` 4, `superuser_reserved_connections` 3 | 8 | 2 | No. `42501` on `ALTER ROLE ... CONNECTION LIMIT`, `ALTER SYSTEM` and `ALTER DATABASE`. The relay admits 2 sessions per invocation. `app_provisioner` holds `pg_use_reserved_connections` with `INHERIT`, so Project sessions cannot take the runner's last slots. |
| `max_wal_size` / `min_wal_size` | 512MB / 80MB | | | No |
| `work_mem` | 4MB (default) | | | Yes. Any session may raise it. The container's 1 GiB memory limit is the bound. The Data Plane contains that failure; the setting does not prevent it. |
| `shared_preload_libraries` | `pg_stat_statements` | | | No |

`pg_stat_statements` is loaded and its extension lives in `postgres`, never in `conexus_apps`. A
Project role gets `42P01` for it. It serves measurement and diagnosis only. No bound depends on it.

### The pilot switch

Every step followed a backup under `~/.local/share/conexus/pilot/slice7/backups/`:

1. `q1-apps-cluster-20260923T170144Z`: `conexus_s7` (95 table-data entries), `conexus_apps` (9),
   the Hub cluster's globals, `pg_hba.conf`, `pg_ident.conf` and `postgresql.auto.conf`, and the Hub
   env file. Then the Applications cluster started, was confined and was provisioned
   ([`topology/pilot-apps-up.txt`](topology/pilot-apps-up.txt)).
2. The runner now reads `CONEXUS_APP_DB_PORT=5434` and the relay directory `apps-relay-tls`. The
   runner's own `prepare` recreated the four Previews on the new cluster from each Project's latest
   artifact ([`topology/recreate-previews.txt`](topology/recreate-previews.txt)). Preview data is
   disposable and was not copied.
3. `q1-hub-remove-apps-20260923T171408Z`: the operator dropped `conexus_apps`, the ten Project roles
   and `app_provisioner` from the Hub cluster.
4. `q1-hub-unconfine-20260923T172210Z`: with the operator's approval, the application-role blocks
   left `pg_hba.conf` and `pg_ident.conf`, and the four `ssl` settings were reset. That was a reload,
   not a restart. The Hub cluster is back to its configuration before Q1
   ([`q1.8/hub-cluster-unconfine.txt`](q1.8/hub-cluster-unconfine.txt)).
5. Round 3, `q1-r3-apps-20260923T180920Z` (dumped with the timeouts lifted): the operator created
   the storage marker, and `conexus-apps-postgres` was recreated from the round-3 run script on the
   same mounted image. The round-2 container is kept stopped as `conexus-apps-postgres-r2` with
   restart `no`. The new container passed the mountpoint and allocation checks and restarted
   through its guard. The runner restarted on the round-3 code, its startup left every runtime role
   exactly DML with nothing for PUBLIC, and run-2's Preview read passed through the relay
   ([`q1.8/pilot-start-guard.txt`](q1.8/pilot-start-guard.txt)).

The Hub PostgreSQL's start time stayed `2026-09-23 14:35:07.161635+00` through all five steps.

CI runs the same shape. The verify job starts its own Applications cluster from
`run-application-cluster.sh` on 5434, confines it, and runs the suites against both clusters. Its
storage is an ordinary directory carrying the marker, started with
`CONEXUS_APP_CLUSTER_UNMOUNTED_STORAGE=ci`, so CI proves the guards but not the fixed-size mount;
the pilot records carry that.

## Q1.1 data isolation substrate

The application database `conexus_apps` lives on the Applications cluster and is owned by
`app_provisioner`, a `CREATEROLE` role with no superuser, database-creation, replication or Hub
authority. `scripts/provision-application-database.mjs` creates both with the Applications cluster's
installation credential (`CONEXUS_APP_DB_*`) and closes what PUBLIC holds there (`CONNECT`,
`TEMPORARY`, the `public` schema). It refuses a cluster that holds any registered Hub role
(`APPLICATION_CLUSTER_HOLDS_HUB_ROLES`), so it cannot put application data back into the Hub's
cluster. Per Project,
`apps/hub/src/app-runner/data-plane.ts` derives every name from the Project id alone:

| Object | Name | Authority |
| --- | --- | --- |
| Preview schema | `p_<projectHex>_preview` | Owned by `app_provisioner`, so no Project role can grant it away or drop it |
| Migration role | `app_<projectHex>_preview_mig` | `USAGE, CREATE` on its schema, `SELECT, INSERT` on the ledger, connection limit 2, `temp_file_limit` 1GB |
| Runtime role | `app_<projectHex>_preview_rt` | `USAGE` on its schema, DML on what the migration role creates (default privileges), connection limit 8, `temp_file_limit` 256MB |
| Ledger | `<schema>.conexus_migration` | Owned by `app_provisioner`; row-level policy admits the migration role only in a session that logged in as it |

A Project role has no usable password: `PASSWORD NULL VALID UNTIL '-infinity'`. The cluster admits
Project role names only over TLS, only to the application database and only with the runner's client
certificate (`scripts/confine-application-cluster.mjs`, see "Independent review at 8ad7d5bf" below).
PUBLIC holds no `USAGE` on any trusted routine language in the application database, and no
`CONNECT` on it or on `postgres`. The runner refuses to serve while PUBLIC or a Project role can use
a trusted language (round-2 N3). Migrations run in one transaction as the migration role. The
applied history must be an exact prefix of the artifact's migrations; otherwise the Preview schema is
dropped, every migration replays, and the caller says so.

`tests/implementation/application-data-postgres.test.mjs` logs in as each Project role through the
runner's relay with its client certificate and proves, on a throwaway application database on the
Applications test cluster plus a throwaway Hub database on the separate Hub test cluster:

- Project A's runtime role reads and writes its own table. It gets `42501` for Project B's table,
  `SET ROLE` to B, to its own migration role or to the provisioner, any DDL, `TRUNCATE`, the ledger,
  `public`, `TEMP` and `CREATE SCHEMA`. Its `GRANT USAGE` on its own schema to B only warns and grants
  nothing. `TRUNCATE` and `CREATE TRIGGER` stay refused after a migration grants the runtime role
  `TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` and grants PUBLIC everything: after every migration the
  runner revokes all of it and grants DML again (`restoreRuntimePrivileges`, round 3;
  `application-runner-sandbox`).
- A Project role that sets its own password (Postgres allows it) still logs in only through the
  relay. On the Applications cluster, a password login to the application or `postgres` database
  and a direct certificate login to `postgres` each get `28000` from `pg_hba`. With the role renamed
  outside the `pg_hba` rules, the self-set password gets `28P01`, because it expired before it was
  set. The role cannot change its own `VALID UNTIL` (`42501`). On the Hub cluster the role does not
  exist, so its password gets `28P01` for the Hub database.
- The Hub cluster holds none of the Project roles. Provisioning pointed at it is refused with
  `APPLICATION_CLUSTER_HOLDS_HUB_ROLES` and leaves no `app_provisioner` behind.
- A role with no grant cannot connect to the application or `postgres` database (`42501`).
- A Project session reads its `temp_file_limit` and cannot lift it with `SET` or `ALTER ROLE ... SET`
  (`42501`). The settings table above lists every bound, where it is set and what a session can do.
  The test also asserts that `app_provisioner`, and no Project role, holds the reserved connections.
- The migration role gets `42501` for `CREATE EXTENSION dblink` and `postgres_fdw`, `COPY ... TO
  PROGRAM`, `COPY ... TO '<file>'`, `pg_read_file`, `lo_import`, `ALTER ROLE` on its runtime role or on
  a foreign role, `CREATE ROLE`, `CREATE SCHEMA`, creating in `public` or in B's schema, reading B's
  table, writing `pg_authid`, dropping its own schema or ledger, rewriting the ledger and
  `SET ROLE app_provisioner`. It also gets `42501` for a `SECURITY DEFINER` function, a PL/pgSQL
  function that runs DDL, a SQL-standard function body, a procedure and a `DO` block. A runtime call
  finds no such routine (`42883`). Two owner-only statements succeed and carry nothing: `GRANT USAGE
  ON SCHEMA` to B (it is not the owner, so nothing is granted) and `GRANT SELECT` on its table to B (B
  still lacks schema usage and reads `42501`).
- An owner-rights view over the ledger and a rule that appends to it both run with the migration
  role's rights, and a runtime session still reads 0 ledger rows and gets `42501` on each append.
- A failing second migration rolls back: no new column, one ledger row. An edited applied migration
  plans a reset; after it the table is empty and the ledger holds the new digest.

Rerun with `CONEXUS_TEST_DB_*` pointing at a disposable Hub cluster and `CONEXUS_TEST_APP_DB_*` and
`CONEXUS_TEST_APP_TLS_DIR` at a disposable Applications cluster that `run-application-cluster.sh`
started and `confine-application-cluster.mjs` confined:
`node --test --test-concurrency=1 tests/implementation/application-data-postgres.test.mjs`. The suite
refuses a cluster that hosts `conexus_apps`. CI runs it as the `application-data-postgres` step.
On the pilot, the four recreated Previews on the Applications cluster and the Q1.7 database probe
below show the same substrate in place.

## Q1.2 runner boundary

The application runner is its own process (`apps/hub/src/app-runner/main.ts`), outside the Hub. The
Hub reaches it only over a unix socket with mode 600 in a 700 state directory. The runner owns the
whole application data plane. It connects as `app_provisioner`, applies migrations and runs
invocations, and its relay logs Project roles in with its client certificate. It runs no generated
code itself.

Each migration and each invocation runs in a fresh worker (`sandbox.ts`, `worker.ts`), built like this:

- `prlimit --as=1792MiB --core=0 --nofile=256` around `bwrap` with `--unshare-user --unshare-pid
  --unshare-net --unshare-ipc --unshare-uts --unshare-cgroup-try --disable-userns --cap-drop ALL
  --die-with-parent --new-session --clearenv`.
- Root filesystem: `/usr/lib` and `/usr/lib64` read-only with their `lib`/`lib64` symlinks (no
  `/usr/bin`, so no shell), a new `/proc` for the sandbox's own
  pid namespace, a minimal `/dev`, a 1 MiB `/tmp`, the Node binary at `/runtime/node`, `/runner`
  (the worker, `data-plane.js` and a copy of pg's dependency closure) and, for an invocation, `/app`
  (only the admitted artifact's `conexus-server/*.mjs`). The operator's home, `/etc` and `/sys` are
  absent.
- Node runs with `--permission --allow-fs-read=/runner/* --allow-fs-read=/app/*` and
  `--max-old-space-size=128`. This is defense in depth only. `SandboxConfig.nodePermission: false`
  turns it off for the namespace tests and the pilot probe.
- The job, including the database login, arrives on stdin. The result leaves on fd 3. Nothing
  reaches the process arguments or the environment. Measured: the handler's `process.env` is
  `{"PWD":"/"}`.
- The only way to the database is a per-invocation unix socket at `/run/conexus/pg/.s.PGSQL.5432`.
  `pg-relay.ts` reads the startup packet and admits only the pinned role on the application
  database, and only `user`, `database`, `application_name` and `client_encoding` parameters. It
  answers `N` to SSL and GSS negotiation, refuses a CancelRequest, and admits two sessions per
  invocation. Upstream it opens TLS, verifies the cluster's certificate against its CA, and logs in
  with its client certificate; the worker holds no credential. It records each BackendKeyData and
  cancels the backend when the invocation ends.
- The supervisor kills the worker at 5 s (30 s for a migration). It caps the input at 64 KiB and the
  result at 1 MiB, runs at most 4 invocations at once, and validates input and output against the
  manifest's schemas. It projects failures as `{ error: { code, detail? } }` with a status per code.

The runner asserts at startup that an unprivileged process can build the sandbox (a real `bwrap`
probe plus `max_user_namespaces` and `unprivileged_userns_clone`). It also checks its own
provisioner credential and brings every Preview allocation in its database under the current rules.
It refuses to serve if either check fails.

Measured facts that set the numbers. V8 does not start at 1 GiB of address space. When the worker
still ran a SCRAM login, it aborted at 1.25 GiB (exit 134, found by the suite). 1.75 GiB serves the
flow and still refuses a 2 GiB `Buffer`.

`tests/implementation/application-runner-sandbox.test.mjs` drives the real supervisor against a
throwaway application database. It proves each of these:

- Migrations apply once through the sandboxed migration role, and a second prepare applies nothing.
- A note created in Project A lists in A. Project B lists nothing.
- An input carrying `projectId` is refused with `400 INPUT_REFUSED /projectId: not declared`.
- An undeclared operation returns `404`.
- A wrong output shape returns `502 HANDLER_OUTPUT_REFUSED /id: expected integer`.
- A 2 MiB result returns `502 RESPONSE_TOO_LARGE`.
- A handler that sets `statement_timeout = 0` and runs `SELECT pg_sleep(60)` gets `504` within 8 s.
  No `pg_sleep` backend of the runtime role is left active afterwards, so the relay's cancel ended
  it. A busy loop also returns `504`.
- `process.abort()` and heap exhaustion return `HANDLER_CRASHED`. A 256 MiB `Buffer` loop is refused
  by the address-space limit. The next request is served.
- A migration that fails midway applies nothing and returns `42P01 relation "missing_table" does not
  exist`.
- The relay refuses Project B's role, A's migration role and A's role on the `postgres` database.
  It admits A's runtime role on the application database.
- With Node's permission layer off, the arena's reviewed cases (`tests/implementation/sandbox-probe/`)
  find the host home, `/home`, `/root`, `/etc`, `/etc/passwd`, `/etc/shadow`, the test process's
  `/proc/<pid>/environ` and `cmdline`, the relay's private key, the runner state directory and the
  docker socket all `ENOENT`. At most 3 pids are visible. A listener the test starts on `0.0.0.0`,
  which the host reaches on `127.0.0.1` and on its non-loopback address, and the Postgres cluster
  all refuse the sandbox, and `https://example.com` does not resolve.
- A runner whose `bwrap` cannot run refuses to start with `RUNNER_USER_NAMESPACES_UNAVAILABLE`.

Rerun with the same two-cluster environment as Q1.1: `node --test --test-concurrency=1
tests/implementation/application-runner-sandbox.test.mjs`. CI runs it as the
`application-runner-sandbox` step. The workflow installs `bubblewrap` and lifts ubuntu-24.04's
AppArmor restriction on unprivileged user namespaces for that job.

## Q1.3 same-origin Preview API and the build pipeline

**Preview API.** The Preview listener adds `POST /__conexus/api/<operation>` (`mar/preview-routes.ts`).
The request needs the same Preview cookie binding as a page request. It also needs `Origin` equal to
that Preview's own origin (`https://preview-<artifact>.conexus.localhost:3444`),
`content-type: application/json` and a body of at most 64 KiB. The operation must match
`^[a-z][A-Za-z0-9]{0,63}$`, and the artifact must retain a `conexus-server/` tree. The Hub passes the
runner only the binding's Project, the artifact's retained server files read from the registry, the
operation name and the parsed body. Project, artifact, role and module all come from the binding and
the admitted artifact, never from the page. The listener never serves `conexus-server/` to the
browser. A runner that is unreachable or not configured answers
`503 APPLICATION_RUNNER_UNAVAILABLE`, and the Hub stays up.

**CSP.** `connect-src 'none'` became `connect-src 'self'`, the smallest rule for a same-origin API.
Every other directive is unchanged. In a real Chromium, `preview-form-policy.test.mjs` proves the
page's `fetch` to its own `/__conexus/api/listNotes` reaches the server. A `fetch` to another origin
is blocked and never arrives.

**Build pipeline.** The Conexus build snapshot now takes `app/` plus the server half of the admitted
source: `conexus/manifest.json`, `conexus/handlers/**` and `conexus/migrations/**`
(`admitApplicationTree`). After the app's own vite build, the build writes the Hub-owned server build
script (`builder/application-server-build.ts`) into the root-only build directory and runs it. The
script admits the manifest with the same `admitManifest` the runner uses, serialized into the script.
It bundles only the declared handlers with the pinned compiler's vite (SSR, `noExternal`, target
node24). It confines imports to `.ts`/`.js`/`.json` inside `conexus/` and `node:` built-ins, and
inlines `conexus/migrations/*.sql` in name order with their sha256. It writes
`dist/conexus-server/manifest.json` and `dist/conexus-server/handlers/*.mjs`, which the registry
retains with the artifact. It needs no registry migration and no template rebuild.

**Migrations before Preview.** After the artifact is retained, `prepareApplicationServer` sends its
server tree to the runner, and the run settles with the artifact only after the migrations apply.
A failed migration settles `APPLICATION_MIGRATION_FAILED`, offers no Preview, and appends a note to
the conversation with the database's own error, so the Builder's next turn reads it. A reset says so
in the conversation (`APPLICATION_PREVIEW_DATA_RESET`). An artifact with a server tree on a Hub
without a runner settles `APPLICATION_RUNNER_UNAVAILABLE`.

**Smoke.** The smoke serves a local fixture for `POST /__conexus/api/<operation>`. It answers each
declared operation with the smallest value its output schema admits (`[]`, or an object of its
required fields at their minimums). Any other operation gets 404, and `conexus-server/` stays
unserved. The smoke still fails every non-local request, so it depends on no external host.

Proven by:

- `tests/implementation/preview-application-api.test.mjs` covers identity from the binding, refusals
  before the runner, the unavailable runner, and the unserved tree.
- `tests/implementation/application-server-build.test.mjs` runs the real script. It bundles a
  TypeScript handler with an `enum` and a sibling import, and the bundle runs. It refuses, with a
  message the Builder can act on, a missing manifest, invalid JSON, an unknown schema keyword, an
  open object, a handler path outside `conexus/`, an import of `react`, an import of
  `../../app/src/secret`, a misnamed migration and a missing handler file.
- `builder-application-runtime.test.mjs` runs the smoke fixture in a real browser.
- `builder-factory-runtime.test.mjs` covers migration gating: READY, MIGRATION_FAILED with its
  detail, reset, and no runner.
- `builder-working-source-runtime.test.mjs` covers tree admission.

## Q1.4 Builder guidance

The guidance is source-owned, in the order the task prefers:

1. **Starter and check contract.** Every BUILD run writes `conexus/SERVER.md` into a checkout that
   lacks it, beside `conexus/check.sh`. It is about 80 lines: the three locations, one manifest
   example, the schema subset, a handler signature, the Postgres type mapping, a migration example
   and the browser `fetch` call. `conexus/check.sh` now runs the same server build as the Conexus
   build, from a root-owned copy the run installs at `/opt/conexus/server-build.mjs`. The agent's
   check therefore refuses exactly what the build refuses.
2. **Compiler feedback.** The check prints `conexus server check: <what is wrong>`, naming the file
   and the rule. `builder-application-starter.test.mjs` parses the guide's example manifest.
3. **No Builder Skill was added.** Preferences 1 and 2 are in place, and Q1.5 measures whether
   they suffice. A skill would add a second copy of the same contract outside the Project source.
4. **Host instruction.** One existing line changed. "Keep application edits under app/**" became
   "Keep application edits under /workspace/repo/app/**, except server logic and saved data, which
   follow /workspace/repo/conexus/SERVER.md." That line is the invariant that would otherwise forbid
   the server source.

## Q1.5 real Builder generation

Every run sent the task's request, in Portuguese product language, as the first message of a fresh
Project, through the product UI, with `scripts/builder-eval/run.mjs` and
`scripts/builder-eval/cases/follow-up-notes.json`. No file names, locations or implementation were
given. The test operator drove the runs. Each run spends one of the operator's Builder runs and
creates one `eval-*` repository.

| Run | Model | Project | Source before → after | Builder steps / tool calls | Found `conexus/SERVER.md` | Check runs (failing) | Repairs | Request → usable Preview | Eval outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| run-1 | `google-ai-pro/gemini-3-flash` | `0429fa8e` | `19687a4b` → `d5197295` | 24 / 24 | yes, first tool call | 3 (0) | 0 | 332 s | FAIL, harness misread |
| run-2 | `google-ai-pro/gemini-3-flash` | `a700a0f2` | `1190d2df` → `c6ae737e` | 16 / 16 | yes, second tool call | 3 (0) | 0 | 318 s to Preview committed | FAIL, harness misread; regraded PASS |
| run-3 | `google-ai-pro/gemini-3-flash` | `e39250ac` | `625b2592` → `58d5ccb0` | 22 / 22 | yes, second tool call | 2 (0) | 0 | 315 s | **PASS** with reload |
| run-4 | `google-ai-pro/gemini-3.8-flash-high` | `f0d631f4` | `f7403b93` → `b36da41d` | 32 / 35 | yes, second tool call | 4 (1, repaired in the same run) | 0 | 180 s | FAIL on the case's reload step; regraded PASS |

Runs 1 to 3 used `google-ai-pro/gemini-3-flash`. After them the operator directed that every later
Builder run use Gemini 3.8 Flash. The test operator's model list
(`GET /api/control/model-accounts/models`) offers it as `google-ai-pro/gemini-3.8-flash-high`
with a usable key, and run-4 used that id. Runs 1 to 3 stay recorded as `gemini-3-flash` results.

In every run the Builder created the server half by itself, in the places the guide names: a
handler under `conexus/handlers/`, `conexus/manifest.json` and one migration under
`conexus/migrations/`, plus changes to `app/src/main.tsx` and `app/src/style.css`. Runs 1 to 3
chose `handlers/notes.ts`; run-4 chose `handlers/purchase_order_notes.ts`. Every run's first check
ran before any server source existed. In runs 1 to 3 every later check printed `conexus server
check: 2 operations, 1 migrations`. In run-4 one check failed with `conexus server check:
MANIFEST_REFUSED: operations.listNotes: "handler" must be a path like handlers/notes.ts inside
conexus/`. The Builder read that line, fixed its manifest and reran the check to green in the same
run, without an operator message. That is the check-and-repair loop Q1.4 asks for. No Conexus build
failed. The resulting Preview operations are `listNotes` and `addNote` in every run. The generated
server source is 2.7 to 3.0 KB per run (manifest, handler and migration). run-2's is kept in
[`q1.5/run-2/server-source/`](q1.5/run-2/server-source/) as read back from Project Git through the
Hub's source API.

run-4's app lists notes per order number: a person enters the number and presses "Carregar
Notas". The request says exactly that ("Eu informo o número do pedido"). The generic case's reload
step expects the note on the page with no number entered, so it failed although the row was saved
(`PC-4521`, 13:50:46Z). A fresh page load graded with
[`q1.5/run-4-grade/case.json`](q1.5/run-4-grade/case.json), which enters the number again and loads,
shows the note. PASS. A fixed selector list cannot grade every reasonable reading of one request.
That limit belongs to the eval's grader, not to Q1.

The two misreads were harness defects, not product behavior:

- run-1 read `expectText` once while the app still showed "Salvando...". The row was saved
  (`PC-4521` in its Preview schema).
- run-2 read `builder-session` once as the run settled and saw the run `SUCCEEDED` beside the
  previous Preview. The next section explains that read.

`24ef941e` fixed both. The tool now polls `builder-session` until the Preview names the final run's
`resultSourceRevision`, bounded by `PREVIEW_READY_TIMEOUT_MS`, and otherwise fails
`PREVIEW_NOT_FROM_FINAL_RUN`. `expectText` is Playwright's retrying `toContainText`. A new
`--project <id> --grade-only` path sends no request and grades the Project's current Preview.
run-2 graded that way passed every check, initially and after a reload
([`q1.5/run-2-grade/result.json`](q1.5/run-2-grade/result.json)). run-3 is the first run graded
end to end by the fixed tool, and it passed, reload included.

Where the numbers come from. Source revisions, files and outcomes come from each `result.json`.
Steps, tool calls, the guide read and the check runs come from Mastra's own message store
(`factory.mastra_messages`, one row per model message with its tool-invocation parts), summarized
in `q1.5/run-*/turns.json`. Mastra's span store (`factory.mastra_ai_spans`) holds no rows on the
pilot, and the Hub's trace endpoint answers `available: false` for these runs, so the spans could
not be cited. run-2's time is from the pilot row: the run was created at 12:51:41.28Z and its
Preview committed at 12:56:59.44Z.

Rerun a grade without spending a Builder run:
`node scripts/builder-eval/run.mjs --case scripts/builder-eval/cases/follow-up-notes.json --project <id> --grade-only --out <dir>`.

### Does a run show SUCCEEDED before its Preview exists?

No. The store settles both in one transaction. `builder.settle_builder_run_build`
(`apps/hub/migrations/0001_baseline.sql`, lines 603 to 638) updates
`project_working_state.last_preview_source_revision` and the artifact columns, then sets the run
`SUCCEEDED`, inside one function call. The pilot row agrees: run-2's `finished_at` is
12:56:59.443923Z and the working state's `updated_at` is 12:56:59.44383Z. They are 93
microseconds of `clock_timestamp()` apart, inside one transaction.

The gap is in the read. `BuilderSessionPort.read` (`apps/hub/src/builder/module.ts`, lines 284 to
294) runs `store.readPreviewSubject` and then `store.listBuilderRuns` as two statements with no
shared snapshot. A settle that commits between them yields one response with the new run state and
the old Preview. That is what run-2's single read saw. The UI polls the same endpoint, so for one
poll it can show a finished run beside the previous Preview, and the next poll corrects it. It is
not an ordering the UI must represent. It is a torn read the endpoint should not produce. Reading
both inside one repeatable-read transaction, or through one function, removes it. This is a Hub
read defect outside Q1's protected claim, reported for its own fix.

## Q1.6 restart persistence and a second Project, on the live path

Every step ran through the real Preview in a browser, against the pilot Hub and the runner from this
branch, with the rerunnable cases in [`q1.6/cases/`](q1.6/cases/).

1. `write-before-restart.json` on run-2's Project wrote the note "Q1.6 nota antes do reinicio do
   runner" through the app and saw it again after a reload. PASS. The row landed in
   `p_a700a0f2883b427f9f5289c1eb476be3_preview.purchase_order_note` as id 3.
2. `~/q1/runner-kill.sh` sent `SIGKILL` to the runner at 13:40:46.355Z. It was gone 15 ms later and
   the Hub still answered `200`.
3. The runner restarted from the same build and reported ready in 70 ms
   ([`q1.6/runner-after-restart.log`](q1.6/runner-after-restart.log)). Its state directory holds
   only the worker runtime it rewrites at startup and per-invocation directories, empty after each
   call. No application data is on its disk. The note lives in Postgres.
4. `read-after-restart.json` reopened the Preview. The note was there, initially and after a reload.
   PASS.
5. `second-project-isolation.json` opened run-1's Project, a second Project with its own schema
   and roles. Its Preview listed its own `PC-4521` note and not the marked note, initially and after
   a reload. PASS. The `expectText` step runs first so the absence is read from a rendered list.

The data-plane suites already prove the database refuses cross-Project reads. This is the same
claim on the path a person uses.

### Rerun on the Applications cluster

The same steps ran again after the switch, through the live Preview with the rerunnable cases in
[`q1.6-apps/cases/`](q1.6-apps/cases/) (driver scripts `q16-before.sh` and `q16-after.sh`):

1. `write-second-project.json` wrote "Q1.6 nota do projeto run-1" (`PC-Q16B`) through run-1's
   Preview. `write-before-restart.json` wrote "Q1.6 nota no cluster de aplicacoes antes do reinicio"
   (`PC-Q16A`) through run-2's. Both PASS. The rows are in
   `p_0429fa8e34324ae593f1648b53cf07cf_preview.purchase_order_notes` and
   `p_a700a0f2883b427f9f5289c1eb476be3_preview.purchase_order_note` on the Applications cluster
   ([`q1.6-apps/rows-on-applications-cluster.txt`](q1.6-apps/rows-on-applications-cluster.txt)).
2. The runner got `SIGKILL` at 17:04:24.873Z and was gone 17 ms later. The Hub answered `200`.
3. The runner restarted and was ready in 260 ms
   ([`q1.6-apps/runner-after-restart.txt`](q1.6-apps/runner-after-restart.txt)).
4. `read-after-restart.json` read run-2's note after the restart, initially and after a reload. PASS.
5. `second-project-isolation.json` showed run-1's own note and not run-2's. PASS.

## Measurements

| Measurement | Value | Source |
| --- | --- | --- |
| Builder request → usable Preview | 315 to 332 s on `gemini-3-flash` (runs 1 to 3), 180 s on `gemini-3.8-flash-high` (run-4) | `result.json`, pilot row for run-2 |
| Builder repair iterations | 0 repair messages in every run; run-4 repaired one failing check inside its own run | `result.json`, `turns.json` |
| Generated server source | 2,668 to 2,982 bytes (manifest + handler + migration) | Project Git through the source API |
| Runner start to ready | 138 ms and 70 ms (two starts) | runner `ready` event |
| First handler after a restart | 76 ms (runner) | runner log |
| `listNotes`, 40 sequential calls from the Preview page | browser p50 73 ms, p95 88 ms; runner p50 66 ms, p95 91 ms | [`q1.6/measurements.json`](q1.6/measurements.json) |
| 8 concurrent calls | 4 answered 200, 4 answered 429 at the runner's cap of 4 in flight | same |
| Postgres sessions used by one Preview | observed peak 1 during the sample, 0 at rest; bounded at 2 per invocation by the relay and 8 by the runtime role's connection limit | `pg_stat_activity`, `data-plane.ts` |
| Adversarial falsifiers | see Q1.7 | suites |

The per-invocation worker dominates the latency. Most of the 66 ms is building the namespace and
starting Node. That is usable for a Preview. A warm-worker strategy is a later question, not a Q1
blocker. The cap of 4 is one number for the whole runner, not per Project, so one Project's burst
can make another Project wait or see `429`.

## Q1.7 adversarial boundary

Every forbidden capability in the task's section 9 is exercised as generated handler or migration
code and refused. The proofs live in two rerunnable suites, not a one-off script:

- Database authority and migration attacks: `application-data-postgres.test.mjs`, logging in as each
  Project role through the relay. A runtime role reading or writing Project B, `SET ROLE`
  to B, its own migration role or the provisioner, any DDL, `TRUNCATE` (also after a migration grants
  it, round 3), the ledger, `public`, `TEMP`,
  `CREATE SCHEMA` and `ALTER ROLE` all get `42501`; its `GRANT USAGE` on its own schema to B grants
  nothing. Neither Project role holds any Hub schema, table or function grant (counts 0, 0, 0). A
  generated migration is refused `CREATE EXTENSION dblink`/`postgres_fdw`, `COPY ... TO PROGRAM`,
  `COPY ... TO '<file>'`, `pg_read_file`, `lo_import`, `ALTER ROLE`, `CREATE ROLE`, `CREATE SCHEMA`,
  writing another schema, reading B's table, writing `pg_authid`, dropping its schema or ledger and
  `SET ROLE app_provisioner`, and cannot create any routine (`SECURITY DEFINER`, PL/pgSQL, SQL
  body, procedure, `DO`). A `GRANT` by a non-owner grants nothing. A self-set password opens no
  login outside the relay.
- Runner isolation and resource bounds: `application-runner-sandbox.test.mjs`. A handler that reads
  `/etc/passwd`, reads `/proc/1/environ`, writes `/tmp` or `/app`, spawns a child, or lists `/` gets
  `ERR_ACCESS_DENIED` from Node's permission layer. With that layer off, the namespaces alone hide
  every host path, process and listener the suite probes (Q1.2 above). `process.env` is `{"PWD":"/"}`. Another Project's data is empty across the boundary.
  A wall-clock overrun is killed and its live SQL cancelled; a busy loop, a crash, heap and Buffer
  exhaustion each end the one worker and the next request is served. The relay admits only the pinned
  role on the pinned database and refuses every other identity.
- Pilot secret paths: `tests/implementation/sandbox-probe/pilot-probe.mjs` runs the same cases
  through the real runner path on the pilot host, with the permission layer off. See
  [`review-fixes/pilot-namespace-probe.json`](review-fixes/pilot-namespace-probe.json).

**Rerun against the Applications cluster.** Both suites now run on the two test clusters, locally and
in CI. On the pilot, two probes ran through the real supervisor, relay and sandbox with the
runner's own configuration ([`q1.7-apps/`](q1.7-apps/)):

- `tests/implementation/sandbox-probe/pilot-data-probe.mjs` is new. Its runtime handler runs 14
  statements as a probe Project's runtime role on the pilot's Applications cluster. Reading run-2's
  table gets `42501`. `pg_database` lists only `conexus_apps`, `postgres`, `template0` and
  `template1`: the Hub database is not in this cluster. A `dblink` call to it gets `42883`. `CREATE
  TABLE`, `CREATE SCHEMA`, `CREATE EXTENSION dblink`, `SET ROLE` to the provisioner or to another
  Project, `pg_read_file`, `COPY ... TO PROGRAM`, lifting `temp_file_limit` and `CREATE FUNCTION` all
  get `42501`. `pg_stat_statements` gets `42P01`. Eleven probe migrations are refused as well:
  `dblink`, `postgres_fdw`, a `SECURITY DEFINER` function, a `DO` block, `COPY ... TO PROGRAM`,
  `ALTER ROLE` on its runtime role, `CREATE ROLE`, `CREATE SCHEMA`, a table in another Project's
  schema and a read of another Project's table all get `42501`, and a foreign server gets `42704`.
  25 of 25 match, `breach: false` ([`q1.7-apps/pilot-data-probe.json`](q1.7-apps/pilot-data-probe.json)).
- `pilot-probe.mjs` also targets 5434 now, and it reads the relay TLS through the runner's own
  reader. All 60 secret paths, including the new `apps-cluster-authority`, `apps-relay-tls` and
  `db-apps-root`, are unreadable. All 12 listener probes are refused, both clusters included, and
  the docker socket is `ENOENT`. `breach: false`
  ([`q1.7-apps/pilot-namespace-probe.json`](q1.7-apps/pilot-namespace-probe.json)).

The falsifier table after the review fixes is in "Independent review at 8ad7d5bf" below.

Adversarial review by GPT-6 Sol (`scratchpad/q1-sol-runner-boundary-out.md`) found three shared-runner
weaknesses, all fixed. The relay now honors backpressure so a large query result cannot buffer in the
runner process; every Project's migrations run through one global chain so a build storm cannot start
many at once; and the worker no longer holds any credential (see the section below).

## Q1.8 Data Plane containment, structural proof

The operator decided on 2026-09-23 (#200) that the first version proves containment structurally.
Evidence from the pilot, rerunnable with [`q1.8/structural.sh`](q1.8/structural.sh) and
[`q1.8/stop-proof.sh`](q1.8/stop-proof.sh):

| # | Required | Observed |
| --- | --- | --- |
| 1 | Separate clusters in separate containers | `conexus-s7-postgres` (Docker volume, 127.0.0.1:5433, system identifier 7685719825529860133) and `conexus-apps-postgres` (bind mount on `/dev/loop2`, 127.0.0.1:5434, system identifier 7688777040721199149) |
| 2 | The Hub cluster holds no application database, schema or Project role | Databases `conexus_s7`, `postgres`, `template0`, `template1`. Roles matching `^app_`: 0. Application schemas in every database: 0. |
| 3 | All Applications storage on its own fixed-size, fully preallocated filesystem | See [the storage mechanism](#q10-step-4-the-storage-mechanism). PGDATA, `pg_wal`, `log` and `base` report `/dev/loop2` (device 1794; the host root is device 2128). The image is 4,294,967,296 bytes with 8,388,616 × 512 bytes allocated. |
| 4 | The container refuses to start without that filesystem | The source is a bind `--mount`. A missing source is refused by the run script and by Docker ([`topology/storage-proof.txt`](topology/storage-proof.txt)). |
| 5 | The container runtime enforces a memory limit | `HostConfig.Memory` 1073741824, `MemorySwap` 1073741824. Inside the container, cgroup v2 reads `memory.max` 1073741824 and `memory.swap.max` 0. |
| 6 | One ordinary stop leaves the Hub serving | Below |

Item 6 ([`q1.8/stop-proof.txt`](q1.8/stop-proof.txt)). The Hub heartbeat
([`q1.8/hub-heartbeat.mjs`](q1.8/hub-heartbeat.mjs)) runs as the test operator in a browser session.
It reads the IAM access context, reads the Workspace and lists its 13 Projects. It then writes the
operator's personal model defaults, which live in the Hub PostgreSQL (`factory` schema), reads them
back and restores them.

- Before: heartbeat ok. A Preview read of run-2's note through the live Hub PASS.
- `docker stop conexus-apps-postgres` took 0.33 s. Three heartbeats ran 6 s apart while the
  container was down. Every step answered 2xx, every write read back and was restored. The Preview
  read FAILED, as expected: the Data Plane is down.
- `docker start`: ready 1.3 s later. The heartbeat was ok, and the Preview read PASSED again with the
  runner untouched.
- Throughout: the Hub PostgreSQL's start time stayed `2026-09-23 14:35:07.161635+00` with restart
  count 0. The Hub process (pid 452828) and the runner (pid 454856) did not change.

The operator's drop of application data from the Hub cluster started at 17:14:08Z, inside that
stop window (its backup directory carries the timestamp). The Hub PostgreSQL did not restart for
that either.

The settings and `pg_stat_statements` are in [the settings table](#the-settings).
Active capacity and failure runs are not part of this version. The task's section 17 returns them
on the first of: a second Project with real users, the first Publish, or evidence of a noisy
neighbour. What the structure does not prove is listed under the verdict.

## The worker holds no credential (Sol blocking finding 1, resolved)

Sol's first finding was that the worker held its own Project's runtime-role password, so a value
leaked out of the sandbox would open a session directly against Postgres, outside the relay. The
relay terminates authentication instead. The worker connects to the relay socket with no credential
(`WorkerLogin` has no password field). The relay, in the supervisor process outside the sandbox,
logs in upstream and presents the worker an immediate `AuthenticationOk`. Since the review fixes it
logs in with a TLS client certificate, and Project roles have no usable password at all.
`application-runner-sandbox.test.mjs` proves a client that sends no password is admitted, a client
that sends a wrong password is still admitted (the relay never asks), and every non-pinned identity
is refused.

## Independent review at 8ad7d5bf and how each finding closed

Two independent reviews read `8ad7d5bf`: one by Claude (strongest-judgment role) and one by GPT-6
Sol. Both returned **REJECT**. Each fix below landed with a test that fails when the protection is
removed. The mutation runs removed one protection each, ran the suite, and restored the file
(`~/q1/mutate.sh`, `~/q1/mutate-hba.sh` on the pilot host).

| Finding | Closed by | Test, and the mutation that fails it |
| --- | --- | --- |
| Claude B1: a Project role sets its own password and logs in directly to the application, Hub or `postgres` database, outside the relay pin (falsifiers 3, 5, 11) | `64b70033`. Project roles are `PASSWORD NULL VALID UNTIL '-infinity'`; a role may change its password but not its `VALID UNTIL`. `confine-application-cluster.mjs` turns on TLS and puts a `pg_hba` block first: Project role names log in by certificate only (`pg_ident` maps CN `conexus-app-relay`), only to the application database, and are rejected on every other line. The relay logs in with that certificate; the SCRAM client and the per-Project derived password are deleted. PUBLIC loses `CONNECT` on the Hub database and `postgres` after explicit grants to the registered Hub roles. | `application-data-postgres`: self-set password then `28000` on every direct login, `28P01` with `pg_hba` out of the way, `42501` for PUBLIC `CONNECT`, relay still admits. Fails without `VALID UNTIL`, without the `pg_hba` reject line, and without the PUBLIC revoke. |
| Both reviews: a generated `SECURITY DEFINER` function gives runtime code migration-role DDL (falsifier 3) | `385ff4b6`. PUBLIC loses `USAGE` on `LANGUAGE sql` and `plpgsql` in the application database. Chosen over an event trigger that refuses `SECURITY DEFINER`, because an invoker function also runs with owner rights through an owner-rights view, a rule or a foreign-key action, a `DO` block needs `plpgsql`, and none of the four Q1.5 migrations used a routine. Ownership stays with the migration role: without routines, an owner-rights path runs only DML and built-in functions, and the ledger, the one thing the migration role may write that the runtime may not, admits it only when `session_user` is the migration role. | `application-data-postgres`: every routine form `42501`, runtime call `42883`, owner-rights view and rule get 0 ledger rows and `42501`. Fails without the language revoke and without the ledger policy. |
| Claude condition: shared-cluster exhaustion; `statement_timeout` is user-settable | `5501a6df`. `temp_file_limit` per Project role (runtime 256MB, migration 1GB), set by the provisioner through `GRANT SET ON PARAMETER`; a session cannot lift it. `statement_timeout` and the other session timeouts stay settable, and the relay's cancel at the wall clock bounds them. **Corrected after round 2 (N1):** this row once named `work_mem` among the settings the wall clock bounds. A wall clock bounds time, not bytes, and any session may raise `work_mem`. Since the two-cluster topology, the Applications container's 1 GiB memory limit and its fixed-size filesystem bound memory, table and WAL growth. Their exhaustion stays in the Data Plane; nothing prevents it. | `application-data-postgres` reads the limit and gets `42501` lifting it; `application-runner-sandbox` lifts `statement_timeout` before `pg_sleep(60)` and still finds no active backend. Fails without the limit and without the relay's cancel. |
| Claude N4 and Sol blocking 2: the namespace root and the pilot's real secret paths had no committed proof (falsifier 4) | `78964517`. `SandboxConfig.nodePermission`; the arena's reviewed cases vendored with only their paths made inputs; a permission-off suite; `pilot-probe.mjs` on the pilot. | `application-runner-sandbox` permission-off test. Fails with `--unshare-pid` removed, with `--unshare-net` removed, and with `/home` bound. Pilot: 50 secret paths, the runner's and Hub's `/proc` entries and the operator home all `ENOENT`, 2 pids visible, 12 listener probes refused ([`review-fixes/pilot-namespace-probe.json`](review-fixes/pilot-namespace-probe.json)). |
| Claude N3: the network test hit `127.0.0.1:5432`, where nothing listens on the pilot | `78964517`. The test starts a listener on `0.0.0.0`, proves the host reaches it on loopback and on the non-loopback address, adds the Postgres cluster, and requires the sandbox to reach none. | Fails with `--unshare-net` removed: all three targets `CONNECTED`. |
| Claude B1 fix item 4: the pilot cluster was published on `0.0.0.0:5433` | Operator-approved rebind, 2026-09-23. Backup `before-loopback-20260923T143503Z.sql` (`pg_dumpall`) and `.inspect.json`. The data lives in a Docker volume. The old container is kept stopped as `conexus-s7-postgres-old` with restart policy `no`. The new one has the same image digest, environment, volume, network and restart policy, published on `127.0.0.1:5433` only. | `ss -ltn` shows only `127.0.0.1:5433`. Accounts 2 = 2, Preview schemas 4 = 4, run-2 notes 3 = 3. TCP to the host's non-loopback address on 5433 gets `ECONNREFUSED`. Hub `200`, census `ok=8`, test operator session valid, run-2 Preview read `PASS`. |

Findings not fixed in this round, with their scope:

- **Claude N2: a migration containing `COMMIT` escapes the migration transaction.** The damage stays
  in the Project's own Preview schema, which is disposable. A migration must remain multi-statement,
  so the extended protocol does not fit. Owed before Published data (Q5).
- **Claude N5: no memory cgroup.** Each worker is capped at 1792 MiB of address space, with up to
  4 invocations and 1 migration live. The kernel's OOM killer could choose the Hub or Postgres.
- **Claude N6: no seccomp filter.** Acceptable for Preview; required before other use.
- **Claude N7: catalogs are shared across Projects.** Any Project role can read other Projects'
  schema, table and column names in the one application database. Row data stays refused.
- **Claude N8: the Hub sends and the runner stores the whole server tree before the cap check.**
  Closed in round 2 by the Hub's admission bound (Sol 2, below).
- **Sol: the adversarial cases did not run as Builder-generated code behind the live Preview.** The
  pilot probe runs them through the real supervisor, relay and sandbox on the pilot host, not
  through the Hub's ingress.

The runner on the pilot runs `5501a6df` code (the probe and test changes after it touch no runner
behaviour). After each pilot change, run-2's Preview read passed through the certificate relay
(`~/q1/fix1-live-read`, `~/q1/rebind-live-read`, `~/q1/fix3-live-read`). Pilot changes, each after a
backup: `backups/q1-confine-20260923T143118Z` (TLS, `pg_hba`, `pg_ident`, PUBLIC `CONNECT`),
`backups/before-loopback-20260923T143503Z.*` (rebind), `backups/q1-provision-20260923T144129Z`
(language revoke, `SET` on `temp_file_limit`). The probe allocated one fixed Project,
`00000000-0000-4000-8000-0000000000be`, in `conexus_apps`.

Falsifiers after the fixes:

| # | Result | Evidence |
| --- | --- | --- |
| 1 | not observed | Handlers run only in the sandboxed worker, outside the Hub. |
| 2 | not observed | Cross-Project reads and writes `42501`; Q1.6 on the live path. |
| 3 | not observed | Runtime DDL `42501`; no routine can exist to lend it migration authority; the self-set password opens nothing. A migration's extra grants to its runtime role or to PUBLIC (`TRUNCATE`, `TRIGGER`, `REFERENCES`, `MAINTAIN`) are revoked after every migration, so `TRUNCATE` and `CREATE TRIGGER` stay `42501` (round 3; round-2 N2). |
| 4 | not observed | Permission-off suite and the pilot probe: no secret path, `/proc` entry or home reachable; the worker holds no credential. |
| 5 | not observed | Project, operation and module come from the binding and manifest; the database identity is pinned by the relay and cannot be re-minted by a password. |
| 6 | not observed | Empty network namespace; the test now targets listeners that accept the host. |
| 7 | not observed | A worker crash or kill ends only that worker; runner `SIGKILL` left the Hub at `200`. |
| 8 | not observed | Data in Postgres; Q1.6. |
| 9 | not observed | Q1.5, four runs, no implementation hints. |
| 10 | not observed | Server source in Project Git. |
| 11 | not observed | Migration attacks `42501`, including every routine form; a self-set password opens nothing. |

## Round-2 reviews at 994a4fa0 and how each finding closed

Claude proposed ACCEPT_WITH_BOUNDARY. GPT-6 Sol returned REJECT on two findings: generated SQL could
fill storage the Hub shares, and the Hub did unbounded work before the runner's cap. The operator's
topology decision answers the first. Lane B's admission bound answers the second.

| Finding | Closed by | Evidence |
| --- | --- | --- |
| Sol 1 and Claude N1: persistent writes, WAL and `work_mem` can exhaust the cluster the Hub shares | The two-cluster topology: the Applications cluster on its own 4 GiB preallocated filesystem, with a 1 GiB container memory limit | Q1.8 above; the fill and recovery proofs. Exhaustion is now contained, not prevented. The corrected row above no longer names `work_mem`. |
| Sol 2: the Hub reads and base64-encodes the whole server tree before any cap | `feat/stage2-q1-admission` (`4cd64b0f`, `8a1396ee`), merged here. The Hub admits at most 4 Preview application calls in flight, and 2 per Project, before it reads any artifact file. It limits a server tree to 8 MiB, reads it sequentially and answers `413` as soon as the limit is crossed. | `tests/implementation/application-invoker.test.mjs`, `preview-application-api.test.mjs` |
| Claude N3: the language revoke named `sql` and `plpgsql` only | Provisioning revokes every trusted language. `checkProvisioner` refuses to serve while PUBLIC or a Project role can use one (`RUNNER_ROUTINE_LANGUAGE_USABLE`). | `application-runner-sandbox`: granting `plpgsql` to PUBLIC, or `sql` to a Project's migration role, stops the runner's census |
| Claude N4: the CA key and the server key sat in the directory the runner reads | `confine-application-cluster.mjs` keeps them in an authority directory. The runner's directory holds exactly `ca.pem`, `relay.pem` and `relay-key.pem`, and `readRelayTls` refuses anything else or a directory open to group or others. | `application-runner-sandbox` relay-directory test; the pilot uses `apps-cluster-authority` and `apps-relay-tls` |
| Claude N5: a failed TLS load left `ssl = on` persisted, which kills the next restart | Round 2's own fix did not work: it polled `SHOW ssl`, which reports the setting, not whether the certificate loaded. The same mismatched-key run left four `ssl` lines and a container that did not start again. Confinement now refuses a key that is not the certificate's, or a certificate the CA did not sign, before it changes anything. After each reload it requires a TLS handshake verified against the CA, and resets the settings if there is none. | `application-data-postgres` material test; [`topology/n5-proof-2.txt`](topology/n5-proof-2.txt): refused, `ssl` off, restarts; then loads and restarts with `ssl` on |
| Claude N2 and N7: a migration may grant the runtime role more on its own tables; a source comment said otherwise | The `data-plane.ts` comment now says so. The claim is reworded: a migration's grants reach no schema but its own. Round 3 closed the rest (below). | Round 3 |
| Claude N6: the PUBLIC `CONNECT` revoke checks only roles connected now | On the Applications cluster it closes only `postgres`, where nothing but the superuser connects. The Hub database is no longer touched. | provisioning code |
| New in this round: `pg_use_reserved_connections` never applied | The provisioner is `NOINHERIT`, so a plain grant gave it membership without the privilege, and Project sessions could take the runner's last slots. The grant now says `WITH INHERIT TRUE`. | The bounds test asserts the privilege. It failed before the fix. |

**The guards are load-bearing.** [`tests/implementation/guard-mutations.mjs`](../../../tests/implementation/guard-mutations.mjs)
removes one guard at a time, runs the suite that should catch it and restores the file. It ran on
freshly created throwaway clusters:
[`guard-mutations.txt`](guard-mutations.txt), driven by
[`guard-mutations-fresh.sh`](guard-mutations-fresh.sh). All 20 mutations fail their suite, each
naming the test that caught it: the language revoke and its startup check, the PUBLIC `CONNECT`
revoke, the reserved-connection grant, the TLS key check, `VALID UNTIL`, the ledger policy, the
runtime role's schema grants, the role `temp_file_limit` and `transaction_timeout`, both relay
directory checks, `--unshare-net`, the relay's cancel and the Hub-cluster refusal, plus round 3's
four: the TLS reset, the storage mountpoint check, the storage entrypoint guard and the restore of
runtime privileges after a migration. The driver now starts its own clusters from the repository's
run script. Round 3 reran all 20 on fresh clusters at `f52fe380`. Two guards leave
state in the cluster once any provisioning has run: PUBLIC's `CONNECT` on `postgres` and the
provisioner's membership. Each of them only shows on a cluster nothing has provisioned yet, so each
ran on its own fresh cluster. A first run on a shared cluster reported both as passing without their
guard, for that reason.

Falsifier 12, added by the amendment:

| # | Result | Evidence |
| --- | --- | --- |
| 12 | not observed, structurally | Separate clusters and containers; no application data or Project role in the Hub cluster; bounded, preallocated storage and memory; the Hub wrote, read back and served IAM, Workspace and Project requests with the Applications container stopped, and the Hub PostgreSQL did not restart. The fill and recovery ran on the probe filesystem. |

## Round-3 reviews at 8b79b11d and how each finding closed

Sol returned REJECT on two findings; Claude proposed ACCEPT_WITH_BOUNDARY with conditions. Both
agreed on the first two.

| Finding | Closed by | Evidence |
| --- | --- | --- |
| Sol 1 and Claude N3/C3: Q1.8 item 4 was neither enforced nor shown. The run script checked only that `pgdata` existed, Docker's restart bypasses the script, and the proof used an absent path. | A marker at the storage root, a mountpoint and allocation check in the run script, and a guard entrypoint that requires the marker on PGDATA's filesystem at every start, restarts included (Q1.8 above). | `application-cluster-installation.test.mjs` in CI; mutations `no-storage-mountpoint-check` and `no-storage-entrypoint-guard`; [`q1.8/start-guard-proof.txt`](q1.8/start-guard-proof.txt); the pilot ([`q1.8/pilot-start-guard.txt`](q1.8/pilot-start-guard.txt)) |
| Sol 2 and Claude round-2 N2: a migration could grant the runtime role `TRUNCATE`, `TRIGGER`, `REFERENCES` or `MAINTAIN`, or grant PUBLIC anything, so "the runtime role cannot run DDL" had an exception | `restoreRuntimePrivileges` in `data-plane.ts`. After every migration, whatever its outcome, and at every allocation repair, the provisioner acts as the migration role (the owner). It revokes everything from PUBLIC and the runtime role on the schema's tables, sequences and routines, with `CASCADE`, then grants DML on tables and `USAGE, SELECT` on sequences. Idempotent; startup converges existing Previews. Between a migration's commit and this step, a handler running at that moment holds the migration's grants for milliseconds. | `application-runner-sandbox`: a migration grants all four to the runtime role and everything to PUBLIC; the runtime role then gets `42501` for `TRUNCATE` and `CREATE TRIGGER` and can still insert. Failed before the fix (`truncate: 'ok', createTrigger: 'ok'`); mutation `no-runtime-privilege-restore` |
| Claude C1/N1: the storage claims contradicted `storage-proof.txt`; `TRUNCATE` was listed as refused without qualification | Q1.8 storage bullets and the Q1.1 and Q1.7 lists corrected above. `TRUNCATE` is now refused after a granting migration too. | This file |
| Claude C2/N2: preallocation can decay through a trim | The run script refuses an image with any block unallocated. `fstrim.timer` on the pilot: enabled, inactive, no next run. | Q1.8 above |
| Claude C4/N4: confinement's TLS reset had no test | A server certificate the runner cannot verify (`DNS:elsewhere.invalid`) makes confinement fail with `CONFINE_TLS_NOT_LOADED`, and afterwards `ssl` is `off` with no `ssl` line in `postgresql.auto.conf`. | `application-cluster-installation.test.mjs`; mutation `no-tls-reset` |
| Claude N6: a size rotation appended to the same log file | Hourly time-driven rotation into 24 files with truncation, no size rotation. | `run-application-cluster.sh` |
| Claude N7: `transaction_timeout=120s` ends a longer `pg_dump` | The run script names the `PGOPTIONS` a dump needs; the round-3 pilot backup used them. No repository script dumps this cluster. | Carry-over above |
| Claude N5, N8 | Boundary lines, not fixes: unsized `/dev` and `/dev/shm` tmpfs for workers (boundary 2); no I/O isolation on the shared physical disk (boundaries 9 and 10). | Boundaries |
| Claude C7: the pilot's stale `app-relay-tls/` still holds `ca-key.pem` | Not done in round 3; inert, owed to the operator. | |

## Verdict

**Proposed: ACCEPT_WITH_BOUNDARY on the task as amended on 2026-09-23.** The two REJECT reviews at
`8ad7d5bf`, Sol's REJECT at `994a4fa0` and Sol's REJECT at `8b79b11d` each closed with a change and
a test (above). Both protected statements held on the pilot path.

- A normal Builder request produced a server-backed Preview. Its generated handler runs outside the
  Hub and persists Preview data for exactly one Project, on the Applications cluster. It could not
  acquire another Project's data or privileged platform or network authority in any probe.
- The Applications PostgreSQL is a separate cluster with bounded storage and memory. Stopping it
  left the Hub writing, reading back and serving IAM, Workspace and Project requests, and the Hub
  PostgreSQL did not restart. That holds structurally, as the amended Q1.8 requires. Active capacity
  and failure runs were not made.

The claim rests on conditions that must stay durable, listed below. The next independent review
decides.

The positive completion proof of task section 12, step by step:

| Step | Evidence |
| --- | --- |
| Natural-language request → Builder edits browser and server/data source | Q1.5, four runs, `result.json` `filesChanged` and `turns.json` |
| Project check | `conexus/check.sh` runs in every run; run-4 repaired a refused manifest by itself |
| Conexus build → Preview opens | runs settled `SUCCEEDED`/`SOURCE_CHANGED`; Preview veil lifted in each graded run |
| Browser creates a note through the same-origin API | `addNote` 200 in the runner log; rows in each Project's Preview schema |
| Reload reads the persisted note | run-2 regrade, run-3, Q1.6 step 1, all with reload; run-4 on a fresh page load |
| Runner restart still reads it | Q1.6 steps 2 to 4, after `SIGKILL` |
| Second Project cannot read it | Q1.6 step 5 on the live path; `application-data-postgres` and `application-runner-sandbox` at the database and runner |
| Adversarial handler cannot acquire forbidden authority | Q1.7 suites, the permission-off suite and the pilot probe; no falsifier observed after the review fixes |
| Applications PostgreSQL separated and bounded; stopping it leaves the Hub serving | Q1.8 items 1 to 6 |
| (after the switch) Runner restart still reads it; second Project cannot read it | Q1.6 rerun on the Applications cluster |

Identities captured for run-2, the Project used for Q1.6: source `c6ae737eb891699cad6507888fef10e7ccaf6b80`,
artifact revision `65804464-bfb1-40fb-b06a-134cd822b0f8`, digest
`3f08585e5ad38dd1147ac3576c65f02108d0f1c537577aa8d1095560cbdb6d6d`, schema
`p_a700a0f2883b427f9f5289c1eb476be3_preview`, runtime role `app_a700a0f2883b427f9f5289c1eb476be3_preview_rt`
(connection limit 8), migration role `app_a700a0f2883b427f9f5289c1eb476be3_preview_mig` (connection
limit 2), neither superuser nor `CREATEROLE` nor `CREATEDB`. Runner code at `b2e6335e`, built and run
by `~/q1/runner.sh` with the configuration in Q1.2. run-3: source `58d5ccb0`, artifact
`9e5dc09b-a3fc-4fb4-bc3e-d3024238f5bd`. run-4: source `b36da41d`, artifact
`3508d66e-7d3c-45fc-85c5-23aa994b9503`. Since the switch, run-2's schema and roles have the same
names on the Applications cluster (`conexus-apps-postgres`, 127.0.0.1:5434, database
`conexus_apps`). The runner is built and run by `~/q1c/runner.sh` from this branch, and its log
records the head it built.

Boundaries that must become durable:

1. **Rootless namespaces are a host requirement.** The runner refuses to start without them
   (`RUNNER_USER_NAMESPACES_UNAVAILABLE`), and CI lifts ubuntu-24.04's AppArmor restriction for
   the sandbox job. A host without them runs no generated code, and Preview answers
   `503 APPLICATION_RUNNER_UNAVAILABLE`.
2. **The worker runs under the runner's OS user, confined by namespaces, not by a separate user.**
   Its root holds only `dev`, `lib`, `lib64`, `proc`, `runtime`, `tmp` and `usr` (with only
   `/usr/lib` and `/usr/lib64`), plus `/runner`, `/app` and the database socket. It has an empty
   network namespace, its own pid namespace, no capabilities, a cleared environment and no
   credential. The Node permission flag is defense in depth. The committed permission-off suite
   and the pilot probe assert the namespace root itself. `/usr/lib` holds helper executables
   (git-core, ssh-keysign); `no_new_privs` keeps any setuid one inert, and a seccomp filter and a
   memory cgroup are owed before anything but Preview. The worker's memory bound is `RLIMIT_AS`,
   which does not count tmpfs pages, and bubblewrap's `--dev` mounts `/dev` (with `/dev/shm`) as a
   tmpfs of no fixed size. A worker that writes there takes host memory outside any limit. When the
   memory cgroup lands, `/dev/shm` gets a sized tmpfs and the permission-off probe writes to it
   (round-3 N5).
3. **The runner process is in the Hub's trust domain on the pilot.** It runs as the operator's user
   and holds the provisioner credential and the relay's client key. Generated code never runs in it. Before a
   production installation, the runner needs its own OS user, apart from the Hub's secrets, beside
   the dedicated Hub user the roadmap already requires.
4. **One runner cap is shared by every Project.** Four invocations in flight, then `429`. One
   Project's burst therefore slows or refuses another's. That is acceptable for Preview. Published
   applications (Q5) need a per-Project share.
5. **Preview data is disposable.** An edited applied migration resets the Preview schema, and the
   conversation says so. A migration with `COMMIT` can escape its transaction inside its own schema.
   Published data needs its own migration rule.
6. **Project roles log in only through the relay, and the Applications cluster must keep that
   rule.** `confine-application-cluster.mjs` owns the TLS files and the `pg_hba`/`pg_ident` blocks; a
   cluster without them refuses the relay rather than admitting a password. The CA key and the
   server key stay out of the directory the runner reads. The application database grants no
   routine language to PUBLIC, and the runner refuses to serve if one becomes usable; a future
   profile that needs triggers must reopen this.
7. **One application database shares its catalogs.** Project roles see other Projects' object names,
   not their rows. Per-Project databases or catalog hiding are owed before names are sensitive.
8. **Both clusters listen on loopback only.** This is defense in depth. The `pg_hba` confinement of
   boundary 6 carries the claim (round-2 review).
9. **Containment, not resistance.** Preview code can still fill the Applications cluster's 4 GiB
   filesystem, raise `work_mem` up to the container's 1 GiB, or hold connections up to its roles'
   limits. That takes every Preview down until an operator recovers it: a full cluster restarts in a
   loop until the `recovery-ballast` file is deleted. The Hub stays up. Fairness between Projects
   returns on the triggers of the task's section 17. There is no I/O isolation: no
   `--device-write-bps` or `io.max` is set, and the loop image shares the physical disk (the WSL
   disk file on D:) with the Hub. A write storm can slow the Hub without stopping it (round-3 N8).
10. **The Applications storage must stay a separate, fixed-size, preallocated volume.** On the pilot
    it is a preallocated image on the WSL disk, and the cluster refuses to start on it if any block
    is unallocated. That disk's file on D: still grows as the cluster writes: the probe fill grew
    D: by 1.71 GB for a 1 GiB image, so the image size does not bound D:. The pilot's preflight must
    keep D: headroom for the image and the Hub. It shares that physical disk's I/O with the Hub
    (boundary 9). A production installation needs a separate volume or a managed plan sized apart
    from the Hub's (already on the roadmap's production list). The Hub cluster's
    container has no memory limit. The Applications container is capped at 1 GiB of the host's
    14.6 GB.
11. **Q1.8 is structural.** No active capacity or failure run was made against the pilot's
    Applications cluster. The fill and recovery ran once, on the 1 GiB probe filesystem. The run
    returns on the section 17 triggers.
12. **The Applications cluster's superuser password and TLS authority sit with the operator's
    secrets** (`db-apps-root`, `apps-cluster-authority`), in the Hub's trust domain like boundary 3.
    The runner reads neither.

What Q1 did not prove. The Q1.7 probes ran through the committed suites against the real
supervisor, sandbox and relay on the pilot host, with probe handlers and migrations. They did not
run as Builder-generated code behind the live Preview. A standalone attack script for the live path
was not authored, because a safety classifier stopped it. Only the existing reviewed suites were
reused. Q1.8 proved containment by structure and by one ordinary stop, not by exhaustion runs against
the pilot. The unmounted-filesystem refusal is proven on an ordinary directory with a stale
`pgdata` (the unmounted mountpoint's shape) and on the pilot's own container, not by stopping the
pilot's systemd mount unit, which needs `sudo`.

Found on the way, outside Q1's claim, each owed its own fix:

- **Torn `builder-session` read.** The session read issues two statements, so one response can
  pair a settled run with the Preview it replaced (see Q1.5). The UI can show that for one poll.
- **No Mastra spans on the pilot.** `factory.mastra_ai_spans` is empty and the Hub's trace endpoint
  answers `available: false` for every Q1 run. The Builder record here comes from Mastra's message
  store instead.
- **The eval grades with fixed selectors.** run-4 shows a correct app failing a generic reload step.
  Mastra ships scorers, datasets and experiments (`@mastra/core` evals and the `scores`,
  `datasets` and `experiments` storage domains in `@mastra/pg`). Another lane is qualifying them for
  this tool, so it was not migrated here.

Builder runs used by Q1: four (run-1 to run-4). The operator's budget has 11 left.
