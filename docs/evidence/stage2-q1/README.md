# Stage 2 Q1 evidence

**Task:** [`docs/tasks/stage2-q1-handler-runtime-data-qualification.md`](../../tasks/stage2-q1-handler-runtime-data-qualification.md)
**Branch:** `feat/stage2-q1`
**Status:** proposed verdict **ACCEPT_WITH_BOUNDARY** (see [Verdict](#verdict)), pending the
independent review. Each unit below records what it proved and how to rerun it.

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

## Q1.2 runner boundary

The application runner is its own process (`apps/hub/src/app-runner/main.ts`), outside the Hub. The
Hub reaches it only over a unix socket with mode 600 in a 700 state directory. The runner owns the
whole application data plane. It connects as `app_provisioner`, derives each Project's role
credentials, applies migrations and runs invocations. It runs no generated code itself.

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
  `--max-old-space-size=128`. This is defense in depth only.
- The job, including the database login, arrives on stdin. The result leaves on fd 3. Nothing
  reaches the process arguments or the environment. Measured: the handler's `process.env` is
  `{"PWD":"/"}`.
- The only way to the database is a per-invocation unix socket at `/run/conexus/pg/.s.PGSQL.5432`.
  `pg-relay.ts` reads the startup packet and admits only the pinned role on the application
  database, and only `user`, `database`, `application_name` and `client_encoding` parameters. It
  answers `N` to SSL and GSS negotiation, refuses a CancelRequest, and admits two sessions per
  invocation. It records each BackendKeyData and cancels the backend when the invocation ends.
- The supervisor kills the worker at 5 s (30 s for a migration). It caps the input at 64 KiB and the
  result at 1 MiB, runs at most 4 invocations at once, and validates input and output against the
  manifest's schemas. It projects failures as `{ error: { code, detail? } }` with a status per code.

The runner asserts at startup that an unprivileged process can build the sandbox (a real `bwrap`
probe plus `max_user_namespaces` and `unprivileged_userns_clone`). It also checks its own
provisioner credential. It refuses to serve if either fails.

Measured facts that set the numbers. V8 does not start at 1 GiB of address space. A SCRAM login
aborts the worker at 1.25 GiB (exit 134, found by the suite). 1.75 GiB serves the flow and still
refuses a 2 GiB `Buffer`.

`tests/implementation/application-runner-sandbox.test.mjs` drives the real supervisor against a
throwaway application database. It proves each of these:

- Migrations apply once through the sandboxed migration role, and a second prepare applies nothing.
- A note created in Project A lists in A. Project B lists nothing.
- An input carrying `projectId` is refused with `400 INPUT_REFUSED /projectId: not declared`.
- An undeclared operation returns `404`.
- A wrong output shape returns `502 HANDLER_OUTPUT_REFUSED /id: expected integer`.
- A 2 MiB result returns `502 RESPONSE_TOO_LARGE`.
- `SELECT pg_sleep(60)` returns `504` within 8 s. No `pg_sleep` backend of the runtime role is left
  active afterwards. A busy loop also returns `504`.
- `process.abort()` and heap exhaustion return `HANDLER_CRASHED`. A 256 MiB `Buffer` loop is refused
  by the address-space limit. The next request is served.
- A migration that fails midway applies nothing and returns `42P01 relation "missing_table" does not
  exist`.
- The relay refuses Project B's role, A's migration role and A's role on the `postgres` database.
  It admits A's runtime role on the application database.
- A runner whose `bwrap` cannot run refuses to start with `RUNNER_USER_NAMESPACES_UNAVAILABLE`.

Rerun on the pilot host: `bash ~/q1/run.sh node --test --test-concurrency=1
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
  Project role with its real derived password. A runtime role reading or writing Project B, `SET ROLE`
  to B, its own migration role or the provisioner, any DDL, `TRUNCATE`, the ledger, `public`, `TEMP`,
  `CREATE SCHEMA` and `ALTER ROLE` all get `42501`; its `GRANT USAGE` on its own schema to B grants
  nothing. Neither Project role holds any Hub schema, table or function grant (counts 0, 0, 0). A
  generated migration is refused `CREATE EXTENSION dblink`/`postgres_fdw`, `COPY ... TO PROGRAM`,
  `COPY ... TO '<file>'`, `pg_read_file`, `lo_import`, `ALTER ROLE`, `CREATE ROLE`, `CREATE SCHEMA`,
  writing another schema, reading B's table, writing `pg_authid`, dropping its schema or ledger and
  `SET ROLE app_provisioner`. The three owner-only statements that succeed carry nothing (a
  `SECURITY DEFINER` function runs as the unprivileged migration role; a `GRANT` by a non-owner grants
  nothing).
- Runner isolation and resource bounds: `application-runner-sandbox.test.mjs`. A handler that reads
  `/etc/passwd`, reads `/proc/1/environ`, writes `/tmp` or `/app`, spawns a child, or lists `/` gets
  `ERR_ACCESS_DENIED`; a TCP connect to the database port gets `ECONNREFUSED` (the empty network
  namespace). `process.env` is `{"PWD":"/"}`. Another Project's data is empty across the boundary.
  A wall-clock overrun is killed and its live SQL cancelled; a busy loop, a crash, heap and Buffer
  exhaustion each end the one worker and the next request is served. The relay admits only the pinned
  role on the pinned database and refuses every other identity.
- Network egress: Q1.0 recorded that a TCP connect to `127.0.0.1:<postgres>` inside the sandbox
  answers `ECONNREFUSED`, because the loopback is the namespace's own.

Falsifier results: 1 not observed (handler runs in a worker outside the Hub), 2 not observed
(cross-Project reads refused), 3 not observed (runtime DML cannot alter schema or roles), 4 not
observed (no credential in env, files or `/proc`, and the worker is handed no database password at
all), 5 not observed (Project, role, module and operation all come from the binding and
the admitted manifest), 6 not observed (empty network namespace), 7 not observed (a worker failure
ends the worker, not the runner or Hub), 8 not observed (data is in Postgres, not the worker
filesystem; Q1.6 above), 9 not observed (Q1.5: four runs on two models with no file or
implementation hints, every one reaching a working Preview with no operator repair message), 10 not observed (server source is in Project Git), 11
not observed (a migration gains no authority beyond its own schema).

Adversarial review by GPT-6 Sol (`scratchpad/q1-sol-runner-boundary-out.md`) found three shared-runner
weaknesses, all fixed. The relay now honors backpressure so a large query result cannot buffer in the
runner process; every Project's migrations run through one global chain so a build storm cannot start
many at once; and the worker no longer holds any credential (see the section below).

## The worker holds no credential (Sol blocking finding 1, resolved)

Sol's first finding was that the worker held its own Project's runtime-role password, so a value
leaked out of the sandbox would open a session directly against Postgres on `0.0.0.0:5433`, outside
the relay. Recording "Postgres must be unreachable" was not enough, because the pilot publishes 5433
today. The relay now terminates authentication instead. The worker connects to the relay socket with
no password (`WorkerLogin` has no password field). The relay, in the supervisor process outside the
sandbox, runs the SCRAM-SHA-256 client itself with the Project role's derived credential, keeps its
role and database pin, and presents the worker an immediate `AuthenticationOk`. The credential never
enters the sandbox, so a leaked value opens nothing. `application-runner-sandbox.test.mjs` proves a
client that sends no password is admitted, a client that sends a wrong password is still admitted
(the relay never asks), and every non-pinned identity is refused. This closes the finding
structurally rather than as an operational condition. The runner still connects to the pilot cluster
over TCP 5433; binding that cluster to loopback or a private interface remains good practice but is
no longer what the boundary rests on.

## Verdict

**Proposed: ACCEPT_WITH_BOUNDARY.** The protected result held on the pilot path. A normal Builder
request produced a server-backed Preview whose generated handler runs outside the Hub, persists
Preview data for exactly one Project, and could not acquire another Project's data or privileged
platform or network authority in any probe. The claim rests on conditions that must stay durable,
listed below. The independent review decides.

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
| Adversarial handler cannot acquire forbidden authority | Q1.7 suites; no falsifier observed |

Identities captured for run-2, the Project used for Q1.6: source `c6ae737eb891699cad6507888fef10e7ccaf6b80`,
artifact revision `65804464-bfb1-40fb-b06a-134cd822b0f8`, digest
`3f08585e5ad38dd1147ac3576c65f02108d0f1c537577aa8d1095560cbdb6d6d`, schema
`p_a700a0f2883b427f9f5289c1eb476be3_preview`, runtime role `app_a700a0f2883b427f9f5289c1eb476be3_preview_rt`
(connection limit 8), migration role `app_a700a0f2883b427f9f5289c1eb476be3_preview_mig` (connection
limit 2), neither superuser nor `CREATEROLE` nor `CREATEDB`. Runner code at `b2e6335e`, built and run
by `~/q1/runner.sh` with the configuration in Q1.2. run-3: source `58d5ccb0`, artifact
`9e5dc09b-a3fc-4fb4-bc3e-d3024238f5bd`. run-4: source `b36da41d`, artifact
`3508d66e-7d3c-45fc-85c5-23aa994b9503`.

Boundaries that must become durable:

1. **Rootless namespaces are a host requirement.** The runner refuses to start without them
   (`RUNNER_USER_NAMESPACES_UNAVAILABLE`), and CI lifts ubuntu-24.04's AppArmor restriction for
   the sandbox job. A host without them runs no generated code, and Preview answers
   `503 APPLICATION_RUNNER_UNAVAILABLE`.
2. **The worker runs under the runner's OS user, confined by namespaces, not by a separate user.**
   Its root holds only `dev`, `lib`, `lib64`, `proc`, `runtime`, `tmp` and `usr` (with only
   `/usr/lib` and `/usr/lib64`), plus `/runner`, `/app` and the database socket. It has an empty
   network namespace, its own pid namespace, no capabilities, a cleared environment and no
   credential. The Node permission flag is defense in depth. The committed suite asserts the
   filesystem refusals at that permission layer. The namespace root was observed by the Q1.2 root
   probe (`~/q1/probe/q12-rootfs.sh`, kept outside the repository). A committed assertion of the
   namespace root with the permission layer off is owed before the runner serves anything but a
   Preview.
3. **The runner process is in the Hub's trust domain on the pilot.** It runs as the operator's user
   and holds the provisioner credential and the runner key. Generated code never runs in it. Before a
   production installation, the runner needs its own OS user, apart from the Hub's secrets, beside
   the dedicated Hub user the roadmap already requires.
4. **One runner cap is shared by every Project.** Four invocations in flight, then `429`. One
   Project's burst therefore slows or refuses another's. That is acceptable for Preview. Published
   applications (Q5) need a per-Project share.
5. **Preview data is disposable.** An edited applied migration resets the Preview schema, and the
   conversation says so. Published data needs its own migration rule.

What Q1 did not prove. The Q1.7 probes ran through the committed suites against the real
supervisor, sandbox and relay on the pilot host, with probe handlers and migrations. They did not
run as Builder-generated code behind the live Preview. A standalone attack script for the live path
was not authored, because a safety classifier stopped it. Only the existing reviewed suites were
reused.

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
