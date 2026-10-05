# 0015. The data checked at every Hub boundary, the contract in Zod, the rules in TypeScript

**Date**: 2026-10-04
**Status**: Approved (approved by the operator on 2026-10-04)
**Lane**: `lane:shaped`
**Depends on**: spec 0014 (merged in #507), whose definer `routes(app)[kind]` and route ledger this spec
extends; spec 0013 (merged in #505) for the job executor and `iam.reap_expired`; spec 0009 for the
failure table. Base `479dfd69`.
**Changes**: the role per capability model of `docs/reference/security-and-authority.md` section 2
and `docs/reference/hub-database-roles.md` is replaced by one runtime role; the rules in
`docs/development/review/data-migrations.md` that require a `SECURITY DEFINER` function per command
are rewritten in part 0.

References to "spike N" name facts measured before the build on PostgreSQL 17.10 with every Hub
migration applied, on the real Hub build and its tests: spike 1 the contract path, spike 2 the data
module and the proof, spike 3 the read policies, spike 4 the contract package build. "Review" names the
comparison of three candidate designs. Neither is in this repository. Each part proves its facts again
in its own tests.

## Summary

Today three things the Hub depends on are declared by hand and checked by nobody. A database row is
whatever a generic says it is, a Hub answer is whatever the web's `as` says it is, and who may act is
decided by one of 115 `SECURITY DEFINER` functions whose refusals the code recognizes by message text.
After this spec each of those is checked where it enters: the operation is written once in Zod and both
the Hub and the web check against it, every row is parsed by a schema in one data module, and every
command needs a typed proof that only an admission function makes, inside the command's own
transaction. The business rules move from SQL to TypeScript, PostgreSQL keeps integrity and adds read
policies so a list cannot leak, and one runtime role replaces nine. The work lands as a foundation that
ports one owner whole, then one part per owner in parallel, `iam` last.

## Structure

| Child | What it decides |
| --- | --- |
| [0015-contract.md](0015-contract.md) | the operation declared once in Zod, the Hub registration and output check, the web `call`, the emitted OpenAPI and its checks, branded ids, the package build |
| [0015-data.md](0015-data.md) | the one module that imports `pg`, the transaction entries, the database error table, the one receipt, the runtime role and the register |
| [0015-admission.md](0015-admission.md) | the typed proof, the admission functions and lock order, WS-01 and the concurrent revoke, the read policies and the bridge during the parts |
| [0015-function-map.md](0015-function-map.md) | where each of the 118 functions goes, what stays in SQL, how they leave |
| `0015-part-<owner>.md` (one per part 1 to 6, written when the part starts) | that part's policies per table and command, lock order, refusal codes and fixtures, derived from the bodies it ports under the rules of the admission child, section 4 |

This file holds what crosses the children: the requirements, the frozen signatures, the census rules,
the parts and their order.

## Requirements

**User stories**:
- As a person using Conexus, I see exactly what I saw before, and I still cannot see or change another
  workspace's data, so that the change is invisible to me except that failures name their cause.
- As an engineer, I declare an operation once and get the Hub handler, the web call, the OpenAPI and the
  checks from it, so that the wire cannot drift from the code.
- As an engineer, I cannot write a command that skips its permission check, or a read that leaks
  another workspace's rows, so that authorization does not depend on remembering it.
- As a reviewer, each census of the study is a rule in CI that can only fall, so that the base stays
  clean after this wave.

**Acceptance criteria**:
- **AC-1**: Every product operation the web calls is declared once in `packages/contract`. The
  `contracts/api/product/*.yaml` paths, the four `scripts/generate-*-contracts.mjs`,
  `scripts/schema-to-typescript.mjs` and the generated contract files are gone. `openapi.json` is emitted
  from the declarations and committed; `contract:check` fails on any difference, Redocly lint passes, and
  the bijection with `docs/product/operation-ledger.md` reads it.
- **AC-2**: A Hub handler's input and return are typed from its declaration (a wrong return or header
  fails `tsc`); input is checked by the declaration's Zod per route; the reply is encoded through the
  success schema, so a column the schema does not name never reaches the wire; a Hub route under
  `/api/control` or `/api/builder` without an operation stops the Hub at boot.
- **AC-3**: A malformed id in a path answers the same 404 `*_NOT_FOUND` as an absent id; a malformed
  query, header or body answers 400 `REQUEST_VALIDATION_FAILED`.
- **AC-4**: The web reaches the Hub only through `call`, which returns the parsed domain type and throws
  `HubFailure` for a `problem+json`; zero `response.json() as` (26 today) and zero `fetch` outside
  `app/http.ts`; the fields the web reads from the Builder Mastra mount are parsed.
- **AC-5**: `pg` is imported only by `platform/db.ts` and the two app runner files of the application
  databases; every Hub row is read through a Zod schema (79 unparsed reads today, zero after); one
  transaction helper; database errors map by SQLSTATE and constraint, and no code reads a database
  error's message.
- **AC-6**: One receipt table for WS-01, PRJ-03 and IAM-03, keyed by the proof's authority. A replay
  returns the first answer; the same key with a different input answers `IDEMPOTENCY_CONFLICT`; the same
  key and body sent to another workspace creates there and does not replay; a project creation that
  crashed between Git and completion reaches the same project id on retry; a retry after the account
  lost the workspace is refused; a purged project's receipts are gone; a BLD replay answers the run's
  current state, as today.
- **AC-7**: A command called without an admission proof, with a proof of another scope or action, with
  an object literal, a spread copy or a read proof, fails `tsc`; `run` on a read transaction fails
  `tsc`.
- **AC-8**: A member removed while writing gets today's outcome in both orders; two owners removing each
  other, and two concurrent administrator revocations, get today's outcomes (one succeeds or
  `LAST_OWNER`), never a deadlock.
- **AC-9**: Every Hub table is under a read policy with `FORCE`, or listed in `UNSCOPED_TABLES` as
  permanent with a reason; a list read whose `WHERE` is deleted still returns only the acting account's
  rows; with no account set a transaction sees nothing; an outsider cannot write a row into, or join, a
  workspace it cannot see; a grantee without membership still opens its application and its connectors;
  no `legacy_owner` bridge remains.
- **AC-10**: The Hub connects as `hub_runtime` (DML only, refused 42501 on any DDL and on `factory`) and
  `hub_factory`; `iam_rls` and `conexus_owner` are NOLOGIN and pass `assertRoleInvariants`; no capability
  role and none of the seven `*_owner` roles holds a grant, owns an object or logs in, and on a fresh
  cluster none exists; the register, its generated file, provisioning and the two reference documents
  agree.
- **AC-11**: No function in a Hub schema holds a business rule: the catalog holds only the `iam.*`
  policy helpers of the admission child, and 115 `SECURITY DEFINER` functions become zero outside them.
- **AC-12**: Ids that cross a boundary are branded once in `packages/contract/src/ids.ts`; a
  `WorkspaceId` where a `ProjectId` is due fails `tsc`; brands come only from a parse, with zero
  `as <Brand>`.
- **AC-13**: Each census is a CI rule by mechanism with today's count as a ceiling that only falls and
  ends at zero: unparsed rows, `json() as`, `noUnsafeTypeAssertion: debt` suppressions (97), web called
  routes without an operation (18 plus 7), definer functions, tables without a policy, operations still
  in YAML. A "Enforced by" line in `codebase-principles.md` that names a missing script, test or rule
  fails CI.
- **AC-14**: The five defects are gone: `identity-access/installation-administration.ts:69` (a missing
  row typed as `AccountId`) answers a named failure; the worker result in `app-runner/sandbox.ts:176` is
  parsed; database errors read by message text (5 places); the executor pool handed to the application
  host (`hub.ts:129-137`); `fedMirrors` (`builder/run/mirror.ts:89`), which `shapes.md` forbids by name.
- **AC-15**: Behavior is unchanged for a person: the full test suite passes, and on the local Conexus a
  person signs in, creates a workspace and a project, runs the Builder, opens the application, invites a
  member and removes one, as before; a grantee opens an application that reads a connector. Each part
  ends green, deletes what its build step names, and lowers the census ceilings it owns.

## Decision

**Chosen option**: Option 1, the operation in Zod, rows parsed in one data module, commands guarded by a
typed proof, reads guarded by Row Level Security, the rules in TypeScript.

Each operation is declared once in Zod in a shared package and drives the Hub handler, the web caller
and the emitted OpenAPI; every row is parsed at the data module; every command takes a proof made only
by an admission that locks what it read; every read runs under a policy keyed to the acting account; the
118 functions leave for TypeScript, part by part.

**Implementation skills**: `conexus-development` (`.agents/skills/conexus-development/`)

## Rationale

Reasoning, the options compared and the evidence: see [rationale.md](rationale.md).

## Feature design

### 1. Four edges parse, nothing inside does

| Edge | Parser | Child |
| --- | --- | --- |
| HTTP in | the operation's Zod, per route validator | contract |
| HTTP out | `op.success.body.parse` before send | contract |
| database rows | the schema each `rows`, `one`, `maybe` takes | data |
| Hub answer in the web | `call`, and `parseForeign` for the Mastra mount | contract |

Inside, types are trusted. Invariants (last owner, tombstone, receipt replay) are pure functions over
rows the command locked.

### 2. Module map

| Path | Owns | Imported by |
| --- | --- | --- |
| `packages/contract/src/*` (built to `dist/`) | operations, ids, problem, failure codes, `OPERATIONS` | both apps, the emitter, the tests |
| `apps/hub/src/http/access.ts` | `routes(app).operation(op, handler)` on the S3 definer | each owner's `routes.ts` |
| `apps/hub/src/platform/db.ts` | the only Hub `pg` import: `openDatabase`, `sql`, `Tx`, `DATABASE_FAILURES` | stores, admission, receipt, lifecycle |
| `apps/hub/src/platform/receipt.ts` | `idempotent`, `reserve`, `complete` over `platform.operation_receipt` | idempotent commands |
| `apps/hub/src/identity-access/admission.ts` | `Admitted`, `Scope`, the `admit*` functions, `ROLE_ALLOWS`, `grantCreatorMembership` | every store (allowed across owners) |
| `apps/web/src/app/http.ts` | `call`, `query`, `href` | every web feature |
| `apps/web/src/app/foreign.ts` | `parseForeign` | the Builder feature |
| `scripts/emit-openapi.mjs` | `contracts/api/product/openapi.json` | `contract:check`, Redocly, bijection |
| `scripts/census-boundaries.mjs` | the census rules that need the type checker | `verify:quick` |

"What does WS-01 accept and return" is answered in one file; "who may call it" by `access` and the
first line of the store function; "where does this row come from" by the schema in the call that read
it.

### 3. Frozen in part 0 (the contract between the children and the parts)

Parts 1 to 7 build against these and do not change them; a needed change goes back through this spec.
`Operation`, `operation()`, `Success`, `Effect`, `Input`, `Reply`, `Result` (contract child, section 2);
`routes(app).operation` and `Handler<O>` (contract, 3); `call`, `query`, `href`, `parseForeign` and the
route param helper (contract, 4); `Database`, `ReadTx`, `WriteTx`, `sql`, `DATABASE_FAILURES`,
`openFactoryPool` (data, 1 and 2); `idempotent`, `reserve`, `complete` (data, 3);
`Admitted`, `Scope` and its action and job lists, the admission signatures, `ROLE_ALLOWS`,
`CHANGES_OWNER_SET`, `ACTION_REFUSALS` and the lock order (admission, 1 and 2); the helpers part 0 owns
(`iam.acting_founds()` lands in part 6) and the rules every policy follows (admission, 4); the policies of the
tables part 0 polices. The policies of the later parts are decided by their child specs; `authenticate`
joins `Database` in part 6; the brands (contract, 6).

**Shared files have one writer at a time.** `hub.ts`, the route ledger, `openapi.json`,
`operation-ledger.md`, `hub-catalog-snapshot.json`, the census ceilings, the role register and the
migration digests in `run-hub-migrations.mjs` change in every part. Parts merge one at a time; each
rebases on `main`, regenerates the generated files (`npm run generate`, `contract:build`,
`db:catalog:snapshot`) and resolves `hub.ts` by hand. A part's migration takes the next free number
when it merges, and its digest row is regenerated then; a migration file is never renumbered after it
reaches `main`.

### 4. The census rules

Part 0 adds each rule with today's count as a ceiling. The ceiling may only fall, and the part that
removes the last occurrence makes it a hard zero. Findings are recorded by resolved symbol and module,
not by line, so moving a file does not retire one.

| Rule | Today | Mechanism | Where |
| --- | --- | --- | --- |
| 1. Rows read without a schema | 79 | `pg` allowed only in `db.ts` and the two app runner files; no transaction type has an untyped read; `openFactoryPool` is the one named exception, for Mastra storage. While parts migrate, `census-boundaries.mjs` (TypeScript checker) counts query results used without a schema in files still allowed `pg` | `verify:quick` |
| 2. `response.json() as` in the web | 26 by the study (22 single line); the checker's count in part 0 is the ceiling | `fetch` only in `app/http.ts` (`noRestrictedGlobals`, exists); the checker counts `.json()` on a `Response` outside `app/http.ts` and assertions on its result | `verify:quick` |
| 3. `noUnsafeTypeAssertion: debt` | 97 | the existing census item `unsafeAssertionDebt` counts suppressions; at zero the `debt` form is refused | `verify:quick` |
| 4. Web called routes without an operation | 18 + 7 | boot refusal `ROUTE_OPERATION_UNDECLARED` with its shrinking list; the walk's "every operation has one ledger row" | route walk, boot |
| 5. Functions with a business rule | 115 definer of 118 | the function count in `hub-catalog-snapshot.json`, read by `db:catalog:check`; at zero any function in a Hub schema other than the `iam.*` helpers fails | `db:catalog:check` |
| 6. Tables without a policy, and bridges | the pending list part 0 computes | the catalog lint (admission child, section 4) | `db:catalog:check` |
| 7. Operations still in YAML | 30 | the count of operations in `contracts/api/product/*-paths.yaml` | `contract:check` |
| 8. Unparsed JSON input that is not HTTP or a row | 54 suppressions | counted inside rule 3 by source (manifest, runner IPC, Mastra output) | `verify:quick` |

The `uncheckedQueryRows` regex (`scripts/census-builder-run.mjs`) is deleted; it miscounts both ways
(76 by regex against 79 by the checker). Each rule has fixtures that must be found: a renamed query
call, a wrapper that returns rows, a double assertion, a helper that returns `json()`.

**"Enforced by" lines.** In `docs/development/codebase-principles.md`: principle 1 replaces the
contract generators with `contract:check` and `OPERATIONS`; principle 2 adds the brands and the proof;
principle 3 replaces `uncheckedQueryRows` with the `pg` rule and `census-boundaries.mjs`; principle 6
adds the one data module and the one caller; principle 7 names `biome/plugins/no-error-code.grit` and
`DATABASE_FAILURES`; principle 8 names `EXPIRY_RULES` after part 6. A new
`scripts/check-enforced-by.mjs` fails when such a line names a script, test, Biome rule or census item
that does not exist.

### 5. Value sourcing

Each child has its table (contract 7, data 6). Across children: the acting account of every
transaction is the S3 session grant's `account.accountId`, parsed into `AccountId` by the session store;
every id a command acts on is read from its proof's scope; every failure's status is the failure
table's.

### 6. Key invariants

- A command's transaction is the one its proof was admitted in (`proof.tx`), and the proof dies with it.
- A row reaches TypeScript only through a schema; a reply reaches the wire only through the success
  schema; a Hub answer reaches a web feature only through `call` or `parseForeign`.
- A transaction always carries the acting account or the system scope, set first, local to the
  transaction.
- Every Hub table is under `FORCE` with a policy for all commands, or is listed with its reason.
- Each fact has one owner: the wire shape in the declaration, the role rule in `ROLE_ALLOWS`, roles in
  the register, failure status in `failures.json`, expiry in `EXPIRY_RULES`.

### 7. Security model

See the admission child, section 5. The compliance scope is the same as today (no regulated data class
is added); the audit trail of who changed what is not changed by this spec.

### 8. Critical test scenarios

- Happy path: on the local Conexus, sign in, create a workspace (WS-01), a project (PRJ-03), run the
  Builder, open the application; the route walk parses every sample answer, verifies **AC-2**, **AC-4**,
  **AC-15**.
- Drift: change a field in a declaration without emitting; `contract:check` fails. Return an extra
  column from a store; the wire answer does not carry it, verifies **AC-1**, **AC-2**.
- Malformed id: `GET /api/control/workspaces/not-a-uuid` answers 404 `WORKSPACE_NOT_FOUND`, verifies
  **AC-3**.
- Wrong row: a migration fixture changes a column type; the read throws at the schema and the answer is
  `INTERNAL_UNEXPECTED`, verifies **AC-5**.
- Receipt: replay, conflict, crash between Git and completion, retry after revoke, verifies **AC-6**.
- Proof and leak fixtures, revoke race, last owner race, outsider walk: the admission child, section 6,
  verifies **AC-7** to **AC-9**.
- Roles: as `hub_runtime`, `CREATE TABLE`, `ALTER`, `DROP`, `SET ROLE` and a read of `factory` answer
  42501, verifies **AC-10**.
- Census fixtures: each rule finds its planted fixture, and a fake "Enforced by" name fails
  `check-enforced-by.mjs`, verifies **AC-13**.

## Build plan

The build approach is Skateboard: the thinnest whole first, then grow. Part 0 is that whole: every new
primitive, used end to end by one real owner (workspace), so nothing lands unused. Part 3 (project)
merges second, alone, because its functions call builder, connector, registry and `iam`, and the
builder, connector and registry policies read `project.project`. Then parts 1, 2, 4, 5 and 7 run in
parallel worktrees, each merging when green, one at a time. Part 6 (`iam`) is last because every other
owner's SQL calls `iam` until it is ported. Parts 1 to 6 each start with their child spec
(`/jm-architect S1 part <owner>`), approved by the operator, then build (`/jm-develop`); part 0 is fully
specified here. A child spec decides inside this umbrella; a change to the frozen surface comes back
here. The real dependencies come from the caller graph script
(function map child, section 2), not from this list.

1. **Part 0, the foundation and the workspace owner.** Subtract first: delete WS-02 and
   `workspace.get_workspace_summary` (no caller in the web or anywhere else) with its rows in
   `docs/product/operation-ledger.md` and `docs/product/human-context-identity-contract.md`, the five
   `x-conexus-*` keys with no reader, and `uncheckedQueryRows`. Then add `packages/contract` with
   `dist/`, the import law rows, `generate-failures.mjs` writing the package's failure codes;
   `routes(app).operation` with effects, the boot refusal and its list; `call`, `query`, `href`,
   `parseForeign`, the route param helper; `emit-openapi.mjs` with its YAML bundle branch, and
   `contract:check`; `platform/db.ts` replacing `platform/postgres.ts`, with `openFactoryPool`;
   `hub_runtime`, `conexus_owner`, `iam_rls`, schema `platform` and `platform.operation_receipt`, with
   the register, provisioning and `assertRoleInvariants`; `admission.ts` with the `Scope` union,
   `admitAccount`, `admitWorkspace` and `grantCreatorMembership`; the helpers part 0 owns
   (not `iam.acting_founds()`); `workspace.workspace.created_by`; the policies on `workspace.workspace`
   and `platform.operation_receipt`, per command and with no bridge;
   `scripts/function-callers.mjs`; the catalog lint with its permanent and pending lists; the census
   rules with ceilings taken from the checker's own count and `check-enforced-by.mjs`; the negative type
   fixtures for the proof and the transaction modes. Port workspace whole: WS-01 on the new path, its
   four functions and `iam.establish_workspace_creator_access` dropped, `workspace.operation_idempotency`
   dropped, the workspace YAML section, its generator and generated files and
   `features/workspace/api.ts` deleted. Move every Hub pool to `hub_runtime` (with `EXECUTE` on every
   live function and DML on the tables the TypeScript reads directly today) and delete the executor pool
   handed to the application host. Fix `installation-administration.ts:69` with `one`, parse the worker
   result in `sandbox.ts:176`, and replace `fedMirrors` (a module `WeakMap` keyed by the Mastra
   `Workspace`) with a field of the conversation's sandbox record, which already creates that
   `Workspace`. Rewrite `security-and-authority.md` section 2, `hub-database-roles.md` and
   `data-migrations.md` for the new model. Satisfies **AC-1** to **AC-3** (for workspace), **AC-5**,
   **AC-6** (WS-01), **AC-7**, **AC-10** (runtime role), **AC-12**, **AC-13**, **AC-14**.
2. **Part 3, project** (10 functions, merged second, alone). PRJ-03 on `reserve` and `complete` under
   the workspace authority, still calling `builder.register_project_repository` as SQL; `admitProject`
   with the parent row lock; the project purge orchestrator in `system('project-purge', fn)`, one
   `WriteTx` across the owners, still calling their SQL purges, and deleting the project's receipts;
   `project.list_project_summaries_with_activity` as one query in `project/store.ts`; its policies, locks and refusal codes per `0015-part-project.md`; the `project-summaries` and thumbnail routes declared (thumbnail
   as `Binary`); `project.operation_idempotency`, the 42501 checks and `generate-project-contracts.mjs`
   deleted; the revoke race on PRJ-03 against today's `iam.remove_workspace_member`. Satisfies
   **AC-1** to **AC-6**, **AC-8** (revoke), **AC-9**, **AC-11**.
3. **Part 1, builder** (31). Its policies, locks and refusal codes per `0015-part-builder.md`. Declares the seven BLD operations and the Mastra mount schemas; deletes the
   hand written BLD types on both sides (`builder/routes.ts`, `features/builder/api.ts`) and
   `JsonRow<T>` (`builder/store.ts`); parses the Mastra output the Hub and the web read
   (`mastra-session-routes.ts`, `transcript.ts`, `pending-card.tsx`, `mastra-session.ts`); keeps the
   run row key and current state replay for BLD create; the executor claims under `system` and works
   under the run's account; runs the trigger parity test, then drops the trigger; ports
   `register_project_repository` and `builder.purge_project` as ports wired by `hub.ts` and edits their
   project call sites; the run lease functions ported one for one; its drop migration and part 4's merge
   as one step. Builder rows (21), BLD operations without a declaration (7) and `builder/api.ts` casts
   (8) reach zero. Satisfies **AC-1**, **AC-4** to **AC-6**, **AC-9**, **AC-11**.
4. **Part 2, connectors** (11). Its policies, locks and refusal codes per `0015-part-connectors.md`; the
   broker reads under the grant holder's account; `connector.purge_project` as a port; the message text
   checks (`connectors/model.ts`) and `generate-connector-contracts.mjs` deleted. Connector rows (8) and
   `connector-api.ts` casts (5) reach zero. Satisfies **AC-1**, **AC-4**, **AC-5**, **AC-9**, **AC-11**,
   **AC-14**.
5. **Part 4, registry** (9). Its policies, locks and refusal codes per `0015-part-registry.md`; `reg.purge_project` as a
   port; `reg.retain_application_execution` ported; served application reads under
   `read(accountId, ...)`, calling `builder.served_preview_revision` as SQL until part 1 lands, then the
   port. Satisfies **AC-5**, **AC-9**, **AC-11**.
6. **Part 5, model accounts** (6). Its policies, locks and refusal codes per `0015-part-model.md`; the ten model account routes
   declared; the four argument call to `model.upsert_model_account` fixed in the port; a run's refresh
   of a shared credential tested with sharing withdrawn mid run. Satisfies **AC-1**, **AC-4**, **AC-5**,
   **AC-9**, **AC-11**.
7. **Part 7, the other JSON input.** The suppressions on JSON that is neither HTTP, a row nor Mastra
   output: the app manifest (`app-runner/server-manifest.ts`) and the runner IPC (`worker.ts`,
   `module.ts`), parsed with schemas in their own module (the manifest keeps a first fault validator with type guards, `0015-part-json-input.md` section 2.1). Satisfies **AC-13**.
8. **Part 6, identity and access, last** (46). Its policies, locks and refusal codes per
   `0015-part-iam.md`; `authenticate`, IAM-03 on the
   bootstrap authority, `iam.acting_founds()` and the claim branch; sessions, invitations, roster
   (`removeMember`, `leaveWorkspace` with the owner set lock), application access, installation
   administration (with the table lock), `iam.purge_project` as a port, `reap_expired` as
   `EXPIRY_RULES`; `iam.operation_idempotency`, every bridge, the seven `*_owner` roles (objects moved to
   `conexus_owner`), the last capability role, `generate-iam-contracts.mjs`, `schema-to-typescript.mjs`,
   the root `openapi.yaml` and the YAML branch of the emitter, the global Ajv, `toFailure`'s `P0001`
   branch and the boot refusal list deleted; the shape lines restated. Rules 1, 4, 5, 6 and 7 reach
   zero; rule 3 reaches zero with part 7. Satisfies **AC-1**, **AC-4** to **AC-6**, **AC-8**, **AC-9**
   to **AC-11**, **AC-13**, **AC-15**.

Each part's tests: the route walk for its operations, signed in and as an outsider; one store test with
a literal expected value per invariant it ports; `db:catalog:check`, `contract:check`,
`wire:bijection` and the caller graph check; the full suite and the local Conexus check of AC-15
before it merges.

## Consequences

**Positive**:
- One declaration per operation drives the handler types, the input check, the output encode, the web
  parse and the OpenAPI; the wire cannot drift silently.
- A forgotten permission check does not compile, and a forgotten list filter does not leak.
- Rules are read in one language, tested with ordinary unit and store tests, and change without
  redefining a function in a migration (57 of 59 migrations redefine functions today).
- Ten pools over nine roles become one; the executor pool that crossed a trust boundary goes.

**Negative / tradeoffs**:
- The per role separation of the old model goes: a SQL bug in one owner can now write another owner's
  tables. The import law, the proof's scope and the policies are what bound it.
- Read policies are a second guard written in SQL beside the TypeScript admission, with their own
  helper role, and a per row cost (under 1.5 ms measured, more on large tables).
- One Zod parse per JSON answer on the Hub and one in the web.
- `packages/contract/dist` is committed, so contract changes show twice in a diff (folded as generated).
- A receipt that spans the deploy of its owner's part runs fresh, since old receipt rows are not copied.
- Eight parts touch shared files; merges are serial and each rebases. Part 3 must merge before the
  parallel parts start merging, so it is on the critical path.
- A ported owner keeps calling an unported owner's SQL function for a while; the caller graph check
  makes that visible and blocks the drop until the call is a port.

**Neutral**:
- `shapes.md` gains one allowed class (the nominal proof) and loses the `iam.reap_expired` line.
- The technical OpenAPI (`contracts/api/technical/`) is untouched.

## Migration plan

**Strategy**: strangler by owner. Old and new run side by side between parts: an unported owner keeps
its YAML route, its Ajv check, its functions and its bridge policy; a ported owner has none of them.
**Phases**: the parts of the build plan, in that order, each one merge.
**Rollback**: revert the part's merge commit and add a migration that restores what its migration
dropped (migrations are append only); the parts before it stay.
**Risks**: a function still called from an unported body or TypeScript SQL (caught by the caller graph
check); a policy that filters a definer function silently (the bridge, whose owner set the lint derives
from the bodies); two parts' drop migrations that depend on each other (builder and registry, merged as
one step).

## Follow-up

- [ ] Four mismatches between the YAML and the running Hub (IAM-01, IAM-04, IAM-11, CON-09): the owner
  part reads the handler and its web consumer, and the declaration follows the running behavior unless
  it is a Hub bug, which the part fixes.
- [ ] The application databases (`app-runner/worker.ts`, `supervisor.ts`) keep their own `pg` until the
  Applications cluster wave.
- [ ] Connectors declared by a factory (`defineConnector`) is a later wave and builds on these
  declarations.
