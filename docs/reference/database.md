# Database guide

How Conexus stores data and changes its schema. This guide follows the practices of
[Evolutionary Database Design](https://martinfowler.com/articles/evodb.html) by Pramod Sadalage
and Martin Fowler, with the PostgreSQL documentation for roles and row security. Each rule uses the
words of [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): **must** and **must not** are defects
in review, **should** and **should not** need a stated reason to break, and **may** is a free
choice.

The guide states the target. Code that departs from it is listed in
[architecture section 11](architecture.md#11-risks-and-technical-debt) with the wave that removes
it. Owners next door: [security](security-and-authority.md) decides who may act,
[architecture](architecture.md) which store owns which concept, the [API guide](../product/wire-contract.md)
the wire, and [backup](backup.md) the restore runbook. Exact facts live in machine registers: the
role register `contracts/technical/hub-database-roles.json`, the table register
`contracts/technical/hub-catalog-census.json`, the catalog snapshot and the generated
[function callers](function-callers.md).

## 1. Stores

- Hub PostgreSQL **must** hold the Conexus schemas. Mastra's storage lives in the schema `factory`,
  owned by `hub_factory`, and Mastra migrates it itself. Conexus code **must not** write to
  `factory`.
- The Applications cluster holds `conexus_apps`, one schema per Project and environment. Each schema
  has a migration role and a runtime role, admitted only over TLS with the runner's client
  certificate. The Applications cluster **must not** hold a Hub role, and the Hub cluster **must
  not** hold an application role.

**Why.** Separate stores fail separately: a full Applications cluster leaves the Hub running, and a
Project's code can never reach Conexus data.

**Right.** A Project handler reads its own schema through the runner's per-call relay.

**Wrong.** A Hub store joins a table in `factory` to read Mastra's messages.

## 2. Migrations

- The application runner **must** reject migration transaction-control statements before allocation
  or reset and **must** execute an admitted pending batch and its ledger in one transaction under
  matching parser settings.
- Every change to a Conexus-owned Hub schema, Hub role or Hub reference data **must** be a migration:
  a new numbered file in `apps/hub/migrations`, applied only by `scripts/run-hub-migrations.mjs`.
  A Project's migrations belong to its repository ([the architecture guide](architecture.md)). Nobody changes a live
  database by hand.
- An applied migration **must not** change. The runner pins each file by SHA-256 and records it in
  `iam.schema_migration`. A migration change commits the regenerated catalog snapshot
  (`npm run db:catalog:snapshot`).
- Migrations **must** only go forward. A migration that reached a database is undone by a new
  migration.
- A dropped function **must** name its exact signature, **must not** use `CASCADE`, and **must**
  leave no caller (`npm run db:callers:check`).
- A function a later migration recreates **must** keep every invariant the earlier body enforced.
- Until an installation holds company data, a reset of the local databases **may** replace the
  chain with one baseline. After that, the baseline **must not** change.
- A migration carries `needs:aprovo` ([delivery](../development/delivery.md#ask-for-aprovo-on-three-kinds-of-change)).

**Why.** A database is only reproducible when every change is a file in the repository, applied the
same way everywhere.

**Right.** A new migration drops a column, and the catalog snapshot changes in the same commit.

**Wrong.** An edit to a migration file after it ran on the pilot.

## 3. A database for every developer and every test

- Every developer and every test suite **must** use its own disposable database, built from the
  migrations.
- A test **must not** change a role on a cluster that hosts a protected database. Roles are
  cluster-global.
- The Hub **must** refuse to start on a database that lacks a migration shipped with it
  (`assertSchemaCurrent`).

**Why.** A shared database hides which change broke it. A database built from migrations proves the
migrations work.

**Right.** CI applies every migration to an empty cluster and compares the catalog with the
snapshot.

**Wrong.** A test that creates a role on the developer's main cluster.

## 4. Database refactoring

- A rename or a split **must** move every caller and remove the old shape in the same wave. There is
  no transition phase while no installation holds company data.
- Once an installation holds company data, a refactoring **must** expand, migrate the callers, then
  contract, so every step runs against live data.

**Why.** A transition phase keeps two shapes alive. It is worth its cost only when real data must
survive the change.

**Right.** A column rename updates the migration, the row schema and every store in one pull
request.

**Wrong.** A new column beside the old one "for compatibility" in development.

## 5. Database access code

- A store **must** reach the database only through `apps/hub/src/platform/db.ts`.
- Values **must** be bind parameters, which the `sql` tag guarantees by construction.
- A write **must** keep its filter visible in the SQL template: `update` and `delete` have a
  top-level `where`, an upsert's `do update` has its own `where`, and `merge` is not used.
- A read transaction **must** be `REPEATABLE READ READ ONLY`. A command **must** run in
  `READ COMMITTED` and lock the rows it decides on.
- A database error **must** be mapped by its SQLSTATE and constraint name to a typed failure, never
  by its message.

**Why.** One access path means one place sets the role, the isolation and the timeouts, and one
place a reviewer reads.

**Right.** An `update` written with the `sql` tag, its values bound and its `where` in the template.

**Wrong.** A string built with `+` and sent through a raw `pg` client.

## 6. Roles and transactions

- The Hub **must** log in as `hub_runtime`, which runs no DDL, holds nothing on `factory` and has no
  `BYPASSRLS`.
- Every Hub transaction **must** run as `hub_runtime`; it **must not** switch roles or set an acting
  account or job in a session setting.
- A person's read **must** enter through a closed `ReadGate` and obtain an action-specific `Admitted`
  read proof before it queries rows. A command **must** obtain its `Admitted` proof before it reads or
  writes business rows.
- SQL privileges **must** preserve the registered verbs and column limits. They **must not** be
  treated as row-level authorization: the proof and its scoped query filters own that decision.
- A new role **must** be a row in the role register, created in an idempotent `DO` block, with its
  password supplied by `npm run db:roles:provision`.

**Why.** One runtime role removes role-switch plumbing. Nominal gates keep queries behind admission;
native grants still refuse unregistered verbs and columns.

**Right.** A Project read obtains `project.read` from `ReadGate` and queries only the admitted
Project id.

**Wrong.** A person read that receives a raw query transaction or a query that omits its admitted
Workspace or Project filter.

## 7. Native privileges and row access

- Hub-owned tables **must** have row-level security disabled and no row policies. The runtime role
  **must** hold exactly the privileges in the catalog census: table and column verbs stay narrow.
- Person-visible rows **must** be filtered by the admitted proof in the same query or by an owner
  helper that accepts that proof. An outsider and an unknown subject **must** receive the same
  not-found response.
- A foreign key across owners **must** only protect structural identity or containment. Any other
  reference across owners is an id without a key.

**Why.** The Hub owns business access decisions in one admission path. PostgreSQL continues to own
structural integrity and the allowed table and column operations.

**Right.** `admitProject(gate, { projectId, action: 'project.read' })` returns a proof whose query
uses `scope.projectId`.

**Wrong.** A store that treats `SELECT` on a relation as proof that the caller may see every row.

## 8. Where a rule lives

- Integrity **must** stay in PostgreSQL: keys, `CHECK` and partial indexes.
- A business rule **must** be a pure TypeScript function over the rows the command locked, behind an
  admission proof. SQL **must not** hold a business rule, and TypeScript **must not** repeat a rule
  PostgreSQL enforces.
- A write that consumes authority owned elsewhere **must** serialize with a concurrent revoke
  through its commit.

**Why.** A rule in TypeScript is read, tested and changed with the rest of the code. Integrity in
PostgreSQL holds even when the code is wrong.

**Right.** "The last owner stays" is a function over the locked roster, and a unique index keeps one
open grant per Project and Account.

**Wrong.** A `SECURITY DEFINER` function that decides who may invite.

## 9. Reference data

- Reference data **must** enter by migration or by a generated file, never by a manual seed.
- A change to the output of `packages/canonical-json` **must** be treated as a data change: stored
  digests stop matching.

**Why.** Reference data is part of the schema's meaning. A database without it is not the same
database.

**Right.** A new failure code is a row in `failures.json`, generated into the Hub.

**Wrong.** An `insert` run by hand on the pilot.
