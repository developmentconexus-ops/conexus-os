# 0015. The data checked at every Hub boundary, the contract in Zod, the rules in TypeScript

**Date**: 2026-10-04
**Status**: Revision 5.2, approved (design 4 chosen by the operator on 2026-10-05; revision approved by HQ the same day under the operator's delegation)
**Lane**: `lane:shaped`
**Depends on**: spec 0014 (merged in #507), whose definer `routes(app)[kind]` and route ledger this spec
extends; spec 0013 (merged in #505) for the job executor and `iam.reap_expired`; spec 0009 for the
failure table. Base `479dfd69`.
**Changes**: the role per capability model of `docs/reference/security-and-authority.md` section 2
and `docs/reference/hub-database-roles.md` is replaced by one login role that each transaction
switches to a reader or a command role; the rules in
`docs/development/review/data-migrations.md` that require a `SECURITY DEFINER` function per command
are rewritten in part 0.

References to "spike N" name facts measured before the build on PostgreSQL 17.10 with every Hub
migration applied, on the real Hub build and its tests: spike 1 the contract path, spike 2 the data
module and the proof, spike 3 the read policies, spike 4 the contract package build. "The split
spike" (`authz-redesign/spike/spike.md`, 2026-10-05) measured the reader and command roles on a
pooled client and the tenant paths of every table after migration 0064. "The interrogations"
(`authz-redesign/interrogate/`, 2026-10-05) are the two reviews of revision 5 that revision 5.1
answers, by the HQ decisions in `authz-redesign/rev51-hq-decisions.md`. Revision 5.2 answers the
confirmation of 5.1 (`authz-redesign/interrogate/sonnet-confirm-51.md`), by the HQ decisions in
`authz-redesign/rev52-hq-decisions.md`. "Review" names the
comparison of three candidate designs. Neither is in this repository. Each part proves its facts again
in its own tests.

## Summary

Today three things the Hub depends on are declared by hand and checked by nobody. A database row is
whatever a generic says it is, a Hub answer is whatever the web's `as` says it is, and who may act is
decided by one of 115 `SECURITY DEFINER` functions whose refusals the code recognizes by message text.
After this spec each of those is checked where it enters: the operation is written once in Zod and both
the Hub and the web check against it, every row is parsed by a schema in one data module, and every
command needs a typed proof that only an admission function makes, inside the command's own
transaction. The business rules move from SQL to TypeScript. PostgreSQL keeps integrity, filters a
person's reads by policy so a list cannot leak, and holds a command's writes by composite tenant keys
and column grants. One login role replaces nine; each transaction runs it as a reader or a command
role. The work lands as a foundation that
ports one owner whole, then one part per owner in parallel, `iam` last.

## Structure

| Child | What it decides |
| --- | --- |
| [0015-contract.md](0015-contract.md) | the operation declared once in Zod, the Hub registration and output check, the web `call`, the emitted OpenAPI and its checks, branded ids, the package build |
| [0015-data.md](0015-data.md) | the one module that imports `pg`, the transaction entries, the database error table, the one receipt, the runtime role and the register |
| [0015-admission.md](0015-admission.md) | the typed proof, the gate, the admission functions and lock order, WS-01 and the concurrent revoke, the split wall (reader policies, the command role, the run time refusal of a role switch and the second wall on writes), the purge guard, the bridges during the parts, what revision 5 deleted and what revisions 5.1 and 5.2 changed |
| [0015-function-map.md](0015-function-map.md) | where each of the 118 functions goes, what stays in SQL, how they leave |
| `0015-part-<owner>.md` (one per part 1 to 6, written when the part starts) | that part's reader policies, table register rows, composite keys, lock order, refusal codes and fixtures, derived from the bodies it ports under the rules of the admission child, sections 4 and 5 |

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
  `tsc`; a statement on a command or job transaction before its admission fails `tsc`; an object
  literal or a spread copy where a gate is due fails `tsc`; no admission takes an account id beside
  its gate.
- **AC-8**: A member removed while writing gets today's outcome in both orders; two owners removing each
  other, and two concurrent administrator revocations, get today's outcomes (one succeeds or
  `LAST_OWNER`), never a deadlock; one member leaving twice at once gets one success and one refusal;
  a command, an application open or a run step racing a project deletion or its purge is refused
  once the tombstone commits, for an administrator too, never a deadlock.
- **AC-9**: For split tables: each is under `FORCE` with the one command policy and, if a person
  reads it, one reader policy named `reader` (and `reader_admin` where the administrator branch is
  separate); a list read whose `WHERE` is deleted still returns only the acting
  account's rows; a read with no account set sees nothing; a client back in the pool after a commit, a
  rollback or an error reads nothing (42501), except on `iam.account` behind the
  `legacy_runtime` bridge until part 6; the reader cannot lock or write; through `read()`, a
  member of one workspace reads no row of another and reads every seeded row of its own, by a test
  generated over every table `hub_reader` can `SELECT`, with an administrator variant over the literal reach list (`project.project_deletion`,
  `connector.connection`, `iam.installation_administrator` and the `iam.account` rows of open
  tenures). For pending tables: each has a register row naming the privileges of
  `hub_runtime`, `hub_reader` and `hub_command`, and the lint asserts it. Every other table is listed
  in `UNSCOPED_TABLES` as permanent with a reason. Every operation run as a member or grantee of one
  tenant with another tenant's ids answers its refusal and changes no row; a command cannot change a
  tenant or owner column, point a row at two tenants, run an `UPDATE`, `DELETE`, `MERGE` or
  `ON CONFLICT DO UPDATE` without a visible top level `WHERE`, or run a purge outside the
  `project-purge` job; an entry opened inside another is refused; a grantee without membership still
  opens its application and its connectors, and reads nothing through `read()`; no `legacy_owner` or
  `legacy_runtime` bridge remains.
- **AC-10**: The Hub connects as `hub_runtime` (`NOINHERIT`, a member of `hub_reader` and
  `hub_command` only, holding no privilege of its own at the end, refused 42501 on any DDL and on
  `factory`) and `hub_factory`; every transaction's first statement is `SET LOCAL ROLE`, and no Hub
  code holds a bare `SET ROLE` or `set_config('role'`; the `sql` tag refuses at run time any text whose
  first keyword is not `select`, `insert`, `update`, `delete` or `with`, and the bare word `conexus`,
  `session_authorization`, `u&`, `set_config` and `current_setting` anywhere in it (a guard against
  accidents, not against our own code written to evade it); both memberships
  of `hub_runtime` have `inherit_option` and `admin_option` false, no `role` setting exists for it or
  the database, and no pool option names a role; `hub_reader`, `hub_command`, `iam_rls` and
  `conexus_owner` are NOLOGIN and pass `assertRoleInvariants`; no capability
  role and none of the seven `*_owner` roles holds a grant, owns an object or logs in, and on a fresh
  cluster none exists; the register, its generated file, provisioning and the two reference documents
  agree.
- **AC-11**: No function in a Hub schema holds a business rule: the catalog holds only the three
  `rls.*` policy helpers of the admission child and `iam.lock_administrators()`, whose body is one
  `LOCK TABLE`, and 115 `SECURITY DEFINER` functions become zero outside them.
- **AC-12**: Ids that cross a boundary are branded once in `packages/contract/src/ids.ts`; a
  `WorkspaceId` where a `ProjectId` is due fails `tsc`; brands come only from a parse, with zero
  `as <Brand>`; a value typed `RawToken` in a `sql` template fails `tsc` (an accident guard, proven
  by a fixture), and a token lookup takes only a `Digest`.
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
typed proof, reads guarded by Row Level Security, the rules in TypeScript. Revision 5 adds design 4,
the split wall, chosen by the operator on 2026-10-05. Revision 5.1 closes the gaps two interrogations
found in it, and revision 5.2 the gap their confirmation proved still open, by HQ decision.

Each operation is declared once in Zod in a shared package and drives the Hub handler, the web caller
and the emitted OpenAPI; every row is parsed at the data module; every command takes a proof made only
by an admission that locks what it read, and runs as a command role the policies do not filter, held
by composite tenant keys, column grants and lints; every person's read runs as a reader role under a
policy keyed to the acting account; the 118 functions leave for TypeScript, part by part.

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
| `apps/hub/src/platform/db.ts` | the only Hub `pg` import: `openDatabase`, `sql` (with its run time text refusal), `Tx`, `CommandGate`, `AuthenticationGate`, `openGate`, `RawToken`, `Digest`, `DATABASE_FAILURES`, the only `SET LOCAL ROLE` and `conexus.*` settings, the nested entry refusal | stores, admission, receipt, lifecycle (`openGate`: admission only) |
| `apps/hub/src/platform/receipt.ts` | `idempotent`, `reserve`, `complete` over `platform.operation_receipt` | idempotent commands |
| `apps/hub/src/identity-access/admission.ts` | `Admitted`, `Scope`, the `admit*` functions (with `admitInstallationAdministrator`), `ROLE_ALLOWS`, `ACTION_REFUSALS`, `grantCreatorMembership` | every store (allowed across owners) |
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
route param helper (contract, 4); `Database` (with `transaction` and `system` handing a
`CommandGate`, and `authenticate` an `AuthenticationGate`), `ReadTx` (with `accountId`), `WriteTx`,
`CommandGate`, `AuthenticationGate` and its `lookupByDigest` family, `openGate`, `sql` (refusing a
`RawToken` at compile time and any statement but `select`, `insert`, `update`, `delete` and `with`, and the words `conexus` and `set_config`, at run time), `RawToken`,
`Digest`, `DATABASE_FAILURES`, `openFactoryPool`, the role and settings each entry sets, and the
nested entry refusal (data, 1 and 2); `idempotent`, `reserve`, `complete` (data, 3); `Admitted`,
`Scope` and its action and job lists, the admission signatures (none takes an account id beside its
gate), `ROLE_ALLOWS`, `CHANGES_OWNER_SET`, `ACTION_REFUSALS`, the lock order, the fresh read after a
lock wait with the deletion predicate, and the scoped read rule (admission, 1 and 2); the three `rls`
helpers, `iam.lock_administrators()`, the rules every reader policy follows, the command policy, the
second wall on writes, the purge guard and the table register (admission, 4 to 7); the policies of the
tables parts 0, 3 and 0b police. A part that needs a fourth helper brings it back here. The reader
policies and register rows of the later parts are decided by their child specs; `authenticate` joins
`Database` in part 6, with its list of digest kinds; the brands (contract, 6).

**Frozen changes in revision 5.1**, against what parts 0 and 3 built and against revision 5: the gate
is a nominal class resolved through a module `WeakMap` (revision 5 had a structural interface with
`accountId`); `system` hands a gate, not a `WriteTx`; every admission drops its `accountId` parameter
and reads the actor from the gate (`admission.ts:95,104-105,139-140` take one today); `ReadTx.accountId` stays
as built (`db.ts:43`; revision 5 had removed it); `authenticate` hands an `AuthenticationGate`, not a
`WriteTx`; `admitApplication` moves from part 6 to part 0b; `admitRun`, `admitBootstrap` and
`admitSystem` have frozen signatures (admission child, section 2).

**Frozen changes in revision 5.2**, against 5.1: the `sql` tag allows only `select`, `insert`,
`update`, `delete` and `with` statements and refuses the bare word `conexus`, `session_authorization`,
`u&`, `set_config` and `current_setting`; reader policies are named `reader` and `reader_admin`; the
administrator reach list is the four tables of the admission child, section 4.2, rule 4; the
`legacy_runtime` bridge exists on `iam.account` only.

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
| 5. Functions with a business rule | 115 definer of 118 | the function count in `hub-catalog-snapshot.json`, read by `db:catalog:check`; at zero any function in a Hub schema other than the `rls.*` helpers and `iam.lock_administrators()` fails | `db:catalog:check` |
| 6. Tables not split, and bridges | the pending list part 0 computes | the catalog lint and the table register (admission child, sections 5 and 7) | `db:catalog:check` |
| 7. Operations still in YAML | 30 | the count of operations in `contracts/api/product/*-paths.yaml` | `contract:check` |
| 8. Unparsed JSON input that is not HTTP or a row | 54 suppressions | counted inside rule 3 by source (manifest, runner IPC, Mastra output) | `verify:quick` |
| 9. Direct privileges of `hub_runtime` | the count part 0b leaves | the catalog lint counts the table and function grants held by `hub_runtime` itself; zero in part 6, when `unportedPool` goes | `db:catalog:check` |

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
- A transaction always runs as `hub_reader` or `hub_command`, switched by its first statement, local
  to the transaction; a read also carries the acting account, set second.
- A command, job or authentication transaction can do nothing before its admission: its callback
  holds a gate, not a transaction, and the gate carries the actor so no admission takes it twice.
- No entry opens inside another, and the tag refuses any statement but `select`, `insert`, `update`,
  `delete` and `with`, so a command's text does not switch its role or set a `conexus` setting.
  Deliberate evasion by our own code is for review and the lints.
- Every Hub table is under `FORCE` with the command policy and, if a person reads it, the reader
  policy, with the command grants its register row names, or is listed with its reason.
- Each fact has one owner: the wire shape in the declaration, the role rule in `ROLE_ALLOWS`, roles in
  the register, failure status in `failures.json`, expiry in `EXPIRY_RULES`.

### 7. Security model

See the admission child, sections 4, 5 and 8. The compliance scope is the same as today (no regulated data class
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
- Proof and leak fixtures, revoke race, last owner race, outsider walk, pooled client roles, generated
  cross tenant reads, write wall and lint fixtures: the admission child, section 10, verifies **AC-7**
  to **AC-9**.
- Roles: as `hub_runtime`, `CREATE TABLE`, `ALTER`, `DROP`, `SET ROLE postgres` and a read of
  `factory` answer 42501; `SET LOCAL ROLE hub_reader` and `hub_command` succeed inside a transaction
  from `db.ts`; the same text through the `sql` tag, in any case, spacing or quoting, is refused, and so
  are `conexus .job` with a space, a `u&` escaped `role`, a `DO` block, a plain `SET` and a `CALL`;
  after the transaction ends, a `SELECT` on `workspace.workspace` is 42501; the membership and setting
  invariants hold, verifies **AC-10**.
- Census fixtures: each rule finds its planted fixture, and a fake "Enforced by" name fails
  `check-enforced-by.mjs`, verifies **AC-13**.

## Build plan

The build approach is Skateboard: the thinnest whole first, then grow. Part 0 is that whole: every new
primitive, used end to end by one real owner (workspace), so nothing lands unused. Part 3 (project)
merges second, alone, because its functions call builder, connector, registry and `iam`, and the
builder, connector and registry policies read `project.project`. Parts 0, 3 and 7 are built, on the
stacked pull requests 509, 510 and 511, under revision 4. Part 0b, the split wall, stacks on 511 and
turns what they built into revision 5.1 before any later part builds; it is mostly subtraction,
plus the guards revision 5.1 adds. Then
parts 1, 2, 4 and 5 run in parallel worktrees, each merging when green, one at a time. Part 6 (`iam`) is last because every other
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
   **AC-6** (WS-01), **AC-7**, **AC-10** (runtime role), **AC-12**, **AC-13**, **AC-14**. Built under
   revision 4; part 0b removes its `created_by`, its receipt and system branches and its `iam.acting_*`
   helpers.
2. **Part 3, project** (10 functions, merged second, alone). PRJ-03 on `reserve` and `complete` under
   the workspace authority, still calling `builder.register_project_repository` as SQL; `admitProject`
   with the parent row lock; the project purge orchestrator in `system('project-purge', fn)`, one
   `WriteTx` across the owners, still calling their SQL purges, and deleting the project's receipts;
   `project.list_project_summaries_with_activity` as one query in `project/store.ts`; its policies, locks and refusal codes per `0015-part-project.md`; the `project-summaries` and thumbnail routes declared (thumbnail
   as `Binary`); `project.operation_idempotency`, the 42501 checks and `generate-project-contracts.mjs`
   deleted; the revoke race on PRJ-03 against today's `iam.remove_workspace_member`. Satisfies
   **AC-1** to **AC-6**, **AC-8** (revoke), **AC-9**, **AC-11**. Built under revision 4; part 0b moves
   its tombstone step to the administrator's transaction and removes its `S` branches.
3. **Part 7, the other JSON input** (built, PR 511). The suppressions on JSON that is neither HTTP, a row nor Mastra
   output: the app manifest (`app-runner/server-manifest.ts`) and the runner IPC (`worker.ts`,
   `module.ts`), parsed with schemas in their own module (the manifest keeps a first fault validator with type guards, `0015-part-json-input.md` section 2.1). Satisfies **AC-13**.
4. **Part 0b, the split wall** (merged fourth, alone, on top of PR 511; fully specified here). It
   changes no operation and no answer, except that a command on a project whose deletion has started
   is now refused for an administrator too (admission child, section 2). Subtract first: the
   migration below drops before it creates, and the code loses `conexus.scope`, `Acting.scope`,
   `ConnectionAction`, the `connection` scope and `admitProjectDeletion` before it gains the gate.

   **Migration `0065_split_wall.sql`** (the next free number when it merges; 0062 to 0064 are not
   edited). In order:
   - Drop every policy `TO hub_runtime` on `workspace.workspace`, `platform.operation_receipt`,
     `project.project`, `project.project_deletion`, `builder.builder_run` and
     `builder.project_working_state` (`0063_workspace_admission.sql:61-85`,
     `0064_project_owner.sql:19-58`). The `legacy_owner` bridges stay.
   - Drop `iam.acting_account()`, `iam.acting_scope()`, `iam.acting_workspaces()`,
     `iam.acting_installation_administrator()` and `iam.acting_applications()`
     (`0063_workspace_admission.sql:15-57`), and `iam_rls`'s `SELECT` on `iam.application_grant`.
   - Drop `workspace.workspace.created_by` (`0063_workspace_admission.sql:3-9`).
   - `CREATE OR REPLACE` the four purge functions (`0064_project_owner.sql:68-128`) with their guard
     reading `conexus.job` instead of `conexus.scope` (admission child, section 6).
   - `CREATE OR REPLACE` `reg.get_served_application`, `reg.read_served_application_file` and
     `reg.get_application_thumbnail` from their latest definitions
     (`0023_application_session.sql:357`, `0024_application_access_review.sql:256`,
     `0048_application_thumbnail.sql:101`) with the condition
     `p_account_id = nullif(current_setting('conexus.account_id', true), '')::uuid` (admission child,
     section 7).
   - Create `hub_reader` and `hub_command`, `NOLOGIN NOINHERIT NOBYPASSRLS`, inside the idempotent
     `DO` block of `0062_runtime_data_boundary.sql:2-12`, and
     `GRANT hub_reader, hub_command TO hub_runtime WITH INHERIT FALSE, SET TRUE`. `USAGE` on every Hub
     schema to both.
   - Create schema `rls` owned by `conexus_owner`, `USAGE` to `hub_reader` and `iam_rls` only, and
     the three helpers of the admission child, section 4.2, owned by `iam_rls`, with
     `SET search_path TO pg_catalog, pg_temp`, `EXECUTE` revoked from `PUBLIC` and granted to
     `hub_reader` only.
   - Create `iam.lock_administrators()`, `SECURITY DEFINER`, owned by `iam_owner` (the owner of
     `iam.installation_administrator`, `0017_installation_administrator.sql:26`), with
     `SET search_path TO pg_catalog, pg_temp` and the one `LOCK TABLE` statement; `EXECUTE` revoked
     from `PUBLIC` and granted to `hub_command` only.
   - On the six tables of the first step and on `iam.account` and `iam.workspace_membership`:
     `ENABLE` and `FORCE` (the six have them already), the reader policy `reader` of section 4.2 (none on the
     receipt), `reader_admin` on `project.project_deletion`, and the command policy of section 4.3.
     On the two `iam` tables also the `FOR SELECT TO iam_rls USING (true)` policy the helpers need
     and the `legacy_owner` bridge for every owner role whose live function reads them (`iam_owner`
     included, since `FORCE` binds the owner; the lint derives the set). On `iam.account` alone also
     the `legacy_runtime` bridge for sign in, which `identity-access/store.ts:100,143,192` still runs
     through `unportedPool`; `iam.workspace_membership` has no unported reader and gets none.
   - Revoke every privilege `hub_runtime` holds on the six tables; it keeps its grants on `iam.account`,
     behind `legacy_runtime`, until part 6; its grants on `iam.workspace_membership` go with the six. Grant `hub_reader` `SELECT` on the five
     reader tables of the six and on the two `iam` tables. Grant `hub_command`: `workspace.workspace`
     `SELECT, INSERT` (no command deletes a workspace, so the `DELETE` of revision 5 goes);
     `platform.operation_receipt` `SELECT, INSERT, DELETE` and `UPDATE (state, response_status,
     response_body, completed_at)`; `project.project` `SELECT, INSERT, DELETE` and `UPDATE (name)`
     (no command on the new path updates it yet; the column is for the row lock, and each later
     command adds the columns it writes); `project.project_deletion`
     `SELECT, INSERT, DELETE` and `UPDATE (purged_at, completed_at)`; `builder.builder_run` and
     `builder.project_working_state` `SELECT`; `iam.account` `SELECT, UPDATE (created_at)` (the row lock goes through a column with no
     rule on it; `0001_baseline.sql:1926-1937`); `iam.workspace_membership` `SELECT, INSERT,
     UPDATE (role)` (`UPDATE (role)` stays because part 6's role change needs it; `DELETE` comes with
     the roster commands of part 6); and on the pending tables the new path reads, each recorded in its register
     row: `iam.installation_administrator` `SELECT, UPDATE (revoked_at)` (the tenure `FOR SHARE`;
     never table level, admission child, section 5), `iam.application` `SELECT`,
     `iam.application_grant` `SELECT, UPDATE (revoked_at)` (for `admitApplication`; the column only
     permits the row lock, since `application_grant_revocation_check`,
     `0022_application_access.sql:60`, refuses a `revoked_at` written without `revoked_by`, which part 6
     grants with the revoke command). `hub_runtime`
     keeps its direct grants on the tables no part has split.
   - `EXECUTE` on `builder.register_project_repository`, the four purges and
     `iam.lock_administrators()` to `hub_command`, the first five revoked from `hub_runtime`; on the
     three `reg` served functions to `hub_reader`; every other live function stays with `hub_runtime`
     for its unported callers. Each `EXECUTE` is a register row. `scripts/function-callers.mjs`
     produces the lists, and the migration's test compares them with the catalog.

   Before the revoke, the caller graph and `tests/repository/hub-call-sites.mjs` confirm that no
   unported code reads the six tables through `unportedPool`, and confirm that `iam.account` is the one `iam` table with an unported reader (its `legacy_runtime`
   bridge) and `iam.workspace_membership` has none.

   **Code.** `platform/db.ts`: each entry's role switch, the read's account setting and the job's
   `conexus.job`, sent on the client directly (data child, section 1); `Acting.scope` and the
   `conexus.scope` setting gone (`db.ts:117,146`); the `Gate` and `AuthGate` classes, the `WeakMap`
   and `openGate`; `system` hands a gate; the `sql` tag's run time text refusal (first keyword allow list and the refused words of the
   admission child, section 4.1); the nested entry
   refusal over `AsyncLocalStorage`; `openDatabase` refusing a role in `options`; `RawToken`,
   `Digest` and the typed `sql` values. `ReadTx.accountId` stays (`db.ts:43`).
   `identity-access/admission.ts`: `ConnectionAction`, the `connection` scope and its three
   `ACTION_REFUSALS` rows gone (`admission.ts:14,56,44-46`); `project.delete` moves to
   `AdministratorAction`; `assertActing` and every `accountId` parameter gone (`admission.ts:91-93`),
   the account read from the gate or from `ReadTx.accountId`; `admitProjectDeletion`
   (`admission.ts:166-172`) becomes `admitInstallationAdministrator`, which reads the acting account's
   open tenure `FOR SHARE` instead of calling `iam.is_installation_administrator`, and calls
   `iam.lock_administrators()` for `administrators.manage`; `admitProject`'s fresh read carries the
   deletion predicate in SQL with no administrator exception (`admission.ts:159-160`); `members.leave`
   locks the acting membership `FOR UPDATE`; `admitApplication` and `admitSystem` built as the
   admission child, section 2, states; `admitRun` declared with its frozen signature, its body built
   in part 1, which grants the column a run lock needs on `builder.builder_run`; `grantCreatorMembership` founds only an empty
   workspace; `JobName` loses `'migration'` (`db.ts:17`). `project/deletion.ts`: the tombstone step
   runs in `database.transaction(accountId, ...)` (`deletion.ts:40-53`) in the order account, tenure,
   project `FOR UPDATE`, fresh tombstone read, `INSERT ... SELECT` from the project row; purge and
   completion stay in `system('project-purge', ...)` after `admitSystem`, and the purge takes the
   project `FOR UPDATE` before anything else (`deletion.ts:56-66` takes no lock today).
   `workspace/store.ts` and `project/store.ts`: the gate; no `created_by`.
   `scripts/hub-catalog-lint.mjs`: the rules of the admission child, sections 5 and 7, replacing
   `RUNTIME_ROLE` and `POLICY_HELPER` (`hub-catalog-lint.mjs:1-3`). `scripts/census-boundaries.mjs`:
   the write lint (admission child, section 5). `contracts/technical/hub-catalog-census.json`: the
   table register with its pending rows and function rows, and census rule 9. `scripts/hub-catalog.mjs`:
   `assertRoleInvariants` as the data child, section 4, states. `contracts/technical/hub-database-roles.json`,
   its generator and `platform/hub-roles.generated.ts`: the two transaction roles, the three `rls`
   helpers and `iam.lock_administrators()`. Biome: the role lint and the restricted import of
   `openGate`. A repository test: `purge_project` only in `project/deletion.ts`.
   `docs/reference/security-and-authority.md` section 2, `docs/reference/hub-database-roles.md` and
   `docs/development/review/data-migrations.md` restated for the split, and
   `docs/tasks/specs/0015-checked-boundaries/0015-part-project.md` updated in the same pull request.

   **Tests.** The pooled client facts, the run time text refusal with the three proved bypasses and the
   plain `SET`, `DO` and `CALL` fixtures, the role invariants, the type
   fixtures (gate, `RawToken`, no `accountId` parameter), the nested entry refusal, the generated cross
   tenant read test over every table `hub_reader` can `SELECT` (the five reader tables of the six and
   the two `iam` tables) with its positive control and administrator variant, the per operation cross
   tenant test over the operations ported so far, the route walk's entry record, the founding guard,
   the column grant refusals, the purge guard and the served function account check, the lint
   fixtures, the administrator deletion cases, the deletion races on the project row (`admitProject`,
   `admitApplication` and the purge), the double leave, and the revoke race on the command
   role: the admission child, section 10. Then the full suite and the local Conexus check of
   **AC-15**, sign in included (the `legacy_runtime` bridge on `iam.account`). Satisfies **AC-7** to **AC-10** for the
   tables it splits, **AC-12** (raw tokens), **AC-13** (rule 9).
5. **Part 1, builder** (31). Its reader policies, register rows, locks and refusal codes per
   `0015-part-builder.md`. Cut from that draft: the 15 `INSERT`, `UPDATE` and `DELETE` rows of its
   section 4; the `S` branch of its five `SELECT` rows; the served pointer paragraph with its `iam_rls`
   grant and policy on `builder.project_working_state`; every `iam.acting_applications` use; the
   section "If the part 0 amendment is refused". It keeps the five `SELECT` rows' person branches as
   reader policies, the bridges, its column grants without `project_id` or `account_id`, and adds the
   `builder.builder_run.account_id` key; the executor runs as section 6 of the admission child says;
   it builds the body of `admitRun` (project `FOR SHARE`, then the run `FOR UPDATE`, then the fresh
   read with the deletion predicate, admission child, section 2) with the column grant on
   `builder.builder_run` its row lock needs, and the run's deletion race tests; a run reads its held
   credential after `admitRun`, filtered by the run from the proof. Every command read follows the
   scoped read rule, proven by the per operation cross tenant test for the BLD operations. Declares the seven BLD operations and the Mastra mount schemas; deletes the
   hand written BLD types on both sides (`builder/routes.ts`, `features/builder/api.ts`) and
   `JsonRow<T>` (`builder/store.ts`); parses the Mastra output the Hub and the web read
   (`mastra-session-routes.ts`, `transcript.ts`, `pending-card.tsx`, `mastra-session.ts`); keeps the
   run row key and current state replay for BLD create; the executor claims under `system` and works
   under the run's account; runs the trigger parity test, then drops the trigger; ports
   `register_project_repository` and `builder.purge_project` as ports wired by `hub.ts` and edits their
   project call sites; the run lease functions ported one for one; its drop migration and part 4's merge
   as one step. Builder rows (21), BLD operations without a declaration (7) and `builder/api.ts` casts
   (8) reach zero. Satisfies **AC-1**, **AC-4** to **AC-6**, **AC-9**, **AC-11**.
6. **Part 2, connectors** (11). Its reader policies, register rows, locks and refusal codes per
   `0015-part-connectors.md`. Cut from that draft: the six `INSERT`, `UPDATE` and `DELETE` rows; the
   `S` and `G` branches of the two `SELECT` rows; `connector.enabled_connection` with its `iam_rls`
   grants; `admitElevated` (CON-02 and CON-04 become `admitInstallationAdministrator` with
   `connection.manage` in the person's transaction); `admitConnection`; the section "If the amendment
   is refused". It keeps the connection `SELECT` (with `ADMIN`) and the binding `SELECT` as reader
   policies, restated so neither reads the other table under its policy; a fourth helper comes back
   here. The workspace owner's connection action is named: `connections.bind`, a `WorkspaceAction`
   row allowed to `owner` only in `ROLE_ALLOWS`, with the same name as a `ProjectAction` admitted
   through `admitProject`, for listing, binding and unbinding a project's connections
   (`connectors/routes.ts:118-147`), which borrow `members.manage` through
   `connector.admit_project_owner` today (`0029_connector.sql:134-151`). The grantee's bound
   connection is read after `admitApplication` (built in part 0b), filtered by
   `proof.scope.projectId`; the broker reads under the grant holder's account on that proof; `connector.purge_project` as a port; the message text
   checks (`connectors/model.ts`) and `generate-connector-contracts.mjs` deleted. Connector rows (8) and
   `connector-api.ts` casts (5) reach zero. Satisfies **AC-1**, **AC-4**, **AC-5**, **AC-9**, **AC-11**,
   **AC-14**.
7. **Part 4, registry** (9). Its reader policies, register rows, locks and refusal codes per
   `0015-part-registry.md`. Cut from that draft: the nine `INSERT`, `UPDATE` and `DELETE` rows; the `S`
   and `H` branches of the three `SELECT` rows; the amendment A paragraph on `iam_rls` grants over
   seven source tables; the section "If the amendment is refused". It keeps the three `SELECT` rows'
   member branch as reader policies and adds the `reg.artifact` and `reg.application_thumbnail` keys;
   `reg.purge_project` as a port; `reg.retain_application_execution` ported, under `admitRun` on the
   command role; served application reads move from `read(accountId, ...)` to reads on the command
   role after `admitApplication` (built in part 0b), each filtered by `proof.scope.projectId`, calling
   `builder.served_preview_revision` as SQL until part 1 lands, then the port; the three `reg` served
   functions, with the `p_account_id` check part 0b added, are dropped; the per operation cross
   tenant test covers the served routes. Satisfies **AC-5**, **AC-9**, **AC-11**.
8. **Part 5, model accounts** (6). Its reader policies, register rows, locks and refusal codes per
   `0015-part-model.md`. Cut from that draft: the two `INSERT` and `UPDATE` rows, the `S` branches and
   the `HELD` branch; a run reads the credential it holds after `admitRun`, filtered by the run from
   the proof. It keeps the
   three `SELECT` rows' person branches and the column grant `UPDATE (kind, secret, updated_at)`; the ten model account routes
   declared; the four argument call to `model.upsert_model_account` fixed in the port; a run's refresh
   of a shared credential tested with sharing withdrawn mid run. Satisfies **AC-1**, **AC-4**, **AC-5**,
   **AC-9**, **AC-11**.
9. **Part 6, identity and access, last** (46). Its reader policies, register rows, locks and refusal
   codes per `0015-part-iam.md`. Cut from that draft: every `INSERT`, `UPDATE`, `DELETE` and lock only
   row of its section 4; every `C` (credential) and `S` branch; the `SELECT` rows of
   `iam.bootstrap_context`, `iam.oidc_transaction`, `iam.host_session`, `iam.preview`, `iam.handoff`
   and the receipt (command only tables); `iam.acting_credential()`, `iam.installation_founded()`,
   `iam.acting_founds()`, `iam.acting_invitations()`, `iam.acting_owned_workspaces()` and the founding
   branch `F`; `admitElevated` (IAM-13 becomes an owner command under `admitProject` with an action
   part 6 adds to `ROLE_ALLOWS`; IAM-16 and IAM-17 use `admitInstallationAdministrator` with
   `administrators.manage`); the table level `UPDATE` on the tenure table that revision 5 planned
   (the table lock goes through `iam.lock_administrators()`, built in part 0b, and `hub_command` keeps
   `UPDATE (revoked_at)` only); the section "If the amendment is refused". It keeps the reader
   `SELECT` of `iam.account`, adding to part 0b's predicate (self, co members) only grantees of owned
   projects and `ADMIN` for open tenures; keeps part 0b's `iam.workspace_membership` policy; adds
   `iam.workspace_invitation`, `iam.installation_administrator` (`ADMIN`, with its `iam_rls` policy),
   `iam.application`, `iam.application_invitation` and `iam.application_grant`, and the
   `iam.preview`, `iam.host_session` and `iam.handoff` keys; `authenticate` with its
   `AuthenticationGate` and the closed list of digest kinds for `lookupByDigest`, and the body of
   `admitBootstrap`; IAM-03 on the bootstrap authority with the first administrator under the table
   lock and the full tenure history; sessions, invitations, roster (`removeMember`, `leaveWorkspace`
   with the owner set lock and the acting membership `FOR UPDATE`, and the `DELETE` grant on
   `iam.workspace_membership`), application access on the `admitApplication` part 0b built,
   installation administration (with the table lock), `iam.purge_project` as a port, `reap_expired`
   as `EXPIRY_RULES`; `iam.operation_idempotency`, every bridge (the `legacy_runtime` bridge on `iam.account`, with
   `unportedPool`), the seven `*_owner` roles (objects moved to
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
- Policies exist only where they hold: one reader `SELECT` policy per table a person lists, and one
  identical command policy per table. The child drafts' 113 policy table rows become about 24 reader
  rows, and the three helpers and `iam.lock_administrators()` are the only functions left.
- Rules are read in one language, tested with ordinary unit and store tests, and change without
  redefining a function in a migration (57 of 59 migrations redefine functions today).
- Ten pools over nine roles become one; the executor pool that crossed a trust boundary goes.

**Negative / tradeoffs**:
- The per role separation of the old model goes: a SQL bug in one owner can now write another owner's
  tables. The import law, the proof's scope, the gate, the scoped read rule with its per operation
  test, the composite keys, the column grants and the write lint bound it; no policy does.
- A command with a wrong `WHERE` inside its admitted scope is not stopped by the database. This
  departs from PostgREST and Supabase, which judge every write by policy; it matches cal.com,
  Documenso, Better Auth and Mastra, which check in code and then write (rationale).
- Read policies are a second guard written in SQL beside the TypeScript admission, with their own
  helper role, and a per row cost (under 1.5 ms measured, more on large tables).
- Every transaction spends one statement on `SET LOCAL ROLE`, and a read or a job one more on its
  setting. Every `sql` call scans its text once for the refused forms.
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

**Decided by HQ on revision 5** (`authz-redesign/rev5-hq-decisions.md`), closed:
- [x] The helper schema is named `rls`.
- [x] `CommandGate` and `openGate` are kept; revision 5.1 makes the gate nominal and has it carry the
  actor.
- [x] The tenure table's table level `UPDATE` is withdrawn by revision 5.1: the table lock goes
  through `iam.lock_administrators()`, and `hub_command` keeps `UPDATE (revoked_at)` only.
- [x] `app-runner/data-plane.ts:100,139` and its bare `SET ROLE` are reviewed in the Applications
  cluster wave.
- [x] Part 0b updates the stale `0015-part-project.md` in its pull request.

**Open for HQ (revision 5.1).**
- [ ] `system` now hands a gate instead of a `WriteTx`, a frozen change beyond decision 5, so that
  `admitSystem` can read its job without taking it twice. Recommended: it also stops a job's
  statements before admission.
- [x] `iam.account` alone carries a `legacy_runtime` bridge to `hub_runtime` until part 6, because
  sign in still reads it through `unportedPool` (`identity-access/store.ts:100,143,192`);
  `iam.workspace_membership` has no unported reader and no bridge (decided by HQ on revision 5.2).

- [ ] Four mismatches between the YAML and the running Hub (IAM-01, IAM-04, IAM-11, CON-09): the owner
  part reads the handler and its web consumer, and the declaration follows the running behavior unless
  it is a Hub bug, which the part fixes.
- [ ] The application databases (`app-runner/worker.ts`, `supervisor.ts`) keep their own `pg` until the
  Applications cluster wave.
- [ ] Connectors declared by a factory (`defineConnector`) is a later wave and builds on these
  declarations.
