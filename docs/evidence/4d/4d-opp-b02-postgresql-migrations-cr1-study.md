# 4D OPP-B02 — PostgreSQL Access, Migrations and CR-1 Study

> **Status:** `PASS 1 OPERATOR APPROVED / PG + NARROW I&A GUARD LEADING / MIGRATION TOOLING UNSELECTED`
> **Inputs:** PostgreSQL 17 authority; `DAT-01..08`; Release current-proof/concurrency; CR-1 joint invariant
> **Research date:** `2026-08-28`
> **Implementation authority:** `BLOCKED`

## 1. Decision questions

1. What is the smallest PostgreSQL access road that preserves one owner per
   schema/capability and Project DB isolation?
2. How does CR-1 prevent a protected mutation from committing after an
   authority revoke/narrow without giving the consuming owner broad I&A SQL?
3. Which migration composition preserves exact Git source, checksums,
   forward-only production, conformance and real PostgreSQL features?

## 2. Current invariants

```text
normal owner role A arbitrary SQL -X-> owner B schema
-X-> SET ROLE into unrelated owner
-X-> superuser / BYPASSRLS / object-owner authority

Project runtime/query/migrator -X-> hub_control / another Project / Mastra / Keycloak

stale authority pre-read + concurrent revoke/narrow
-X-> protected mutation commits

migration source in Project Git
!= applied migration ledger
!= real target schema fingerprint/conformance
```

The closed cross-owner domain atomicity set and 16-FK allowlist remain unchanged.
CR-1 is a narrow current-authority serialization capability, not a generic
cross-owner UnitOfWork.

## 3. PostgreSQL source evidence

Current PostgreSQL 17 documentation confirms:

- row locks obtained by `SELECT ... FOR UPDATE/SHARE` are held to transaction
  end and block conflicting writers/lockers;
- a blocked locker re-reads/locks the updated row after the conflicting
  transaction resolves under Read Committed;
- explicit locks require consistent acquisition order and deadlock handling;
- transaction-level advisory locks are automatically released at transaction
  end but remain cooperative application-defined locks;
- `SECURITY DEFINER` functions execute with owner privilege and require a secure
  `search_path`, fully controlled grants and no untrusted writable schema;
- adding writable schemas to `search_path` grants effective trust and is unsafe;
- `SELECT FOR UPDATE/SHARE` and transaction isolation alone must be designed so
  the relevant conflicts are actually visible.

Primary sources:

- [PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html)
- [PostgreSQL 17 application consistency](https://www.postgresql.org/docs/17/applevel-consistency.html)
- [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
- [PostgreSQL 17 CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html)
- [PostgreSQL 17 schemas/search path](https://www.postgresql.org/docs/17/ddl-schemas.html)
- [PostgreSQL 17 privileges](https://www.postgresql.org/docs/17/ddl-priv.html)

## 4. CR-1 alternatives

### A — application pre-read, then separate owner transaction

Rejected. Authority can change between the read and protected commit.

### B — consuming owner reads/locks I&A tables directly

Rejected. It violates owner isolation and creates a broad cross-owner SQL
capability.

### C — `SERIALIZABLE` transaction only

Insufficient alone. Serializable behavior protects only conflicts PostgreSQL can
observe through the transaction's read/write set. It does not create the narrow
owner capability or guarantee every protected path reads the exact authority
facts correctly.

### D — advisory lock only

Insufficient as baseline. Advisory locks are cooperative: every relevant check,
revoke and mutation path must use exactly the same derived key. They are useful
only when no stable authority row can represent the serialization subject and
must remain inside an I&A-owned capability with collision/key-domain proof.

### E — cross-owner trigger

Potential structural enforcement, but not leading. A trigger still needs a
safe authenticated subject/current-authority input, creates hidden cross-schema
coupling and can obscure which Product command consumed authority.

### F — narrow I&A `SECURITY DEFINER` guard in the same transaction

Leading hypothesis:

```text
runtime command role
→ begin transaction on one checked-out client
→ call exact I&A guard capability
   → fixed fully-qualified SQL / secure search_path
   → resolve exact current Account/scope/Permission facts
   → lock every supporting mutable authority row in canonical order
   → return bounded checked identity/version or deny
→ execute exact consuming-owner mutation through its own protected capability
→ commit
```

Concurrent revoke/narrow must update/lock the same I&A rows. Outcomes:

```text
protected mutation locks first
→ authority remains current through its commit
→ revoke proceeds afterward

revoke locks/commits first
→ guard observes current narrowed truth
→ mutation denied
```

The lock persists after the guard function returns because it belongs to the
same database transaction/client.

Security requirements:

- guard owner is a `NOLOGIN`, non-superuser, non-BYPASSRLS role;
- `REVOKE ALL ... FROM PUBLIC`; grant `EXECUTE` only to exact consuming command
  roles;
- function fixes a secure `search_path` and fully qualifies owner objects;
- no dynamic SQL or caller-selected table/Permission expression;
- return value discloses only the bounded checked fact/version needed;
- all supporting authority rows are locked in deterministic order;
- absence/composite authority cannot become an unlocked success path;
- direct protected-table DML is withheld from runtime roles so application code
  cannot bypass the guarded owner command;
- timeout/deadlock/serialization failure is explicit and boundedly retryable
  only where the Product command admits retry.

**Pass-1 disposition:** `PROMOTE_TO_4D-CANDIDATE / LEADING CR-1 REALIZATION`.

## 5. Database access layer

### `pg` / node-postgres

Current official behavior is deliberately low-level: transactions use explicit
`BEGIN/COMMIT/ROLLBACK` on the same checked-out client; `pool.query` cannot span
a transaction; pool shutdown waits for checked-out clients to return.

This matches Conexus needs:

- exact client/transaction custody is visible;
- SQL capabilities remain owner-local;
- PostgreSQL-native functions/locks/roles are accessible;
- no ORM schema/lifecycle becomes authority;
- pool lifecycle integrates with Hub readiness/shutdown.

**Disposition:** `LEADING ADOPT CANDIDATE / NOT SELECTED`.

### Kysely

Useful owner-local typed SQL/query composition over `pg`, strict TypeScript and
compile-only capability. Risks:

- its `Database` interface is another schema projection that must be generated
  or proved against actual migrations, never hand-owned authority;
- repository examples can encourage generic repositories and CRUD shapes;
- it does not validate runtime values or replace database constraints;
- owner-specific SQL functions/locks and complex migrations still require raw
  PostgreSQL access.

**Disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE` for bounded owner-local
queries after schema-projection proof; not a generic repository layer.

### Postgres.js

Small typed-template alternative with low dependency surface. It does not remove
the need to prove transaction-client custody, pool/lifecycle behavior and exact
type handling. No current property defeats the already ecosystem-aligned `pg`
candidate.

**Disposition:** `KEEP_REFERENCE_ONLY / DRIVER CHALLENGER ON MATERIAL PG GAP`.

### Drizzle / Prisma

Both can provide productive Project application development, but schema-first
models, generated clients and migration systems risk becoming a parallel
authority over Git migrations, PostgreSQL owner roles/functions/constraints and
Project-specific physical truth. Their broad cross-database/ORM surfaces are not
required for Hub owner persistence.

**Disposition:** `REJECT AS UNIVERSAL HUB/PROJECT BASELINE`; reconsider only for
a named Project/profile where the exact migration/schema/role laws remain
canonical and the total road is smaller.

## 6. Migration alternatives

### Required migration law

```text
versioned exact SQL/DDL source in Git
+ immutable applied identity + checksum
+ ordered/current migration ledger
+ real target schema fingerprint
+ role/privilege/function/constraint conformance
+ transactional by default
+ explicit non-transactional exception
+ backward-compatible or maintenance-required classification
+ forward-only production
+ validation DB → rehearsal → real target proof
```

Down/revert scripts, where present, are DEV/investigation helpers. They are not
production Release rollback.

### node-pg-migrate

Strengths:

- PostgreSQL/Node/TypeScript-native;
- supports schemas, constraints, indexes, functions, triggers, roles, policies,
  grants and raw SQL;
- transaction by default and migration advisory lock;
- programmatic API over `pg`;
- current Node/PostgreSQL support aligns with architecture.

Gap:

Current official documentation demonstrates an applied migration table/order
and locking but not content checksums. Without exact checksum enforcement,
editing an applied migration can evade the accepted history-drift property.
Automatic down/reversal conveniences must also be disabled/bounded for
forward-only production semantics.

**Disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / CHECKSUM ADAPTATION OR
EXTERNAL CONFORMANCE REQUIRED`.

### dbmate

Strengths: small standalone SQL-first tool, atomic migrations, strict ordering
option and schema dump.

Gap: official documentation explicitly says only the migration version is
stored, not the contents. That cannot close the checksum law by itself.

**Disposition:** `REJECT AS COMPLETE BASELINE / KEEP REFERENCE_ONLY`.

### Flyway

Strengths:

- versioned SQL migrations with schema history and checksums;
- `validate` detects edited/missing/out-of-order migrations;
- mature PostgreSQL support, transactions and migration status;
- foundational validate/migrate/info features are available without adopting
  advanced platform features.

Costs/risks:

- Java/JDBC/binary toolchain in a Node-first system;
- Redgate edition/licensing and advanced-feature boundary require exact review;
- `repair` is powerful and must not silently rewrite Conexus accepted history;
- generic multi-database/platform features exceed current need.

**Disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / STRONG CHECKSUM
BASELINE`.

### Sqitch

Strengths:

- PostgreSQL-native SQL deploy/verify scripts;
- explicit dependency plan, deployment log and independent verify scripts;
- strong alignment with proof-before-acceptance and exact PostgreSQL objects.

Costs/risks:

- deploy/revert/rework ontology must be narrowed around forward-only production;
- external Perl/psql toolchain and plan ceremony may exceed the first consumer;
- exact file-integrity/checksum behavior needs proof against the current law.

**Disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / VERIFICATION-RICH
CHALLENGER`.

### Atlas versioned migrations

Strengths:

- SQL versioned workflow with `atlas.sum` integrity file containing per-file and
  directory hashes;
- migration linting for destructive/data/lock/backward-compatibility risks;
- PostgreSQL roles/grants/functions/policies and security-as-code support;
- migration-directory drift, schema inspection and test capabilities;
- language/runtime independent CLI.

Costs/risks:

- declarative schema/apply mode must not become production authority by
  convenience; Conexus requires reviewed versioned migrations and Release gates;
- cloud/registry/operator/advanced features are not current requirements;
- default binary EULA versus Apache community binary requires an exact edition,
  license, feature and reproducibility decision;
- auto-generated SQL still requires human/owner review and real rehearsal;
- drift auto-remediation must not bypass Release/owner authority.

**Disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / LEADING MIGRATION
CONFORMANCE CANDIDATE`, not selected.

## 7. Leading composition hypothesis

```text
runtime persistence
→ pg pools isolated per physical role/store boundary
→ owner-local SQL / optional bounded Kysely projection
→ protected command functions where structural enforcement requires them

migration source
→ exact versioned PostgreSQL SQL in Project/platform Git
→ checksum/integrity + lint/conformance candidate (Atlas leading; Flyway/Sqitch challengers)
→ BuildValidationDatabase
→ migration rehearsal
→ EnvironmentConformance
→ Release/Promotion gate
```

CR-1 remains independent of migration-tool selection:

```text
narrow I&A SECURITY DEFINER lock/check capability
+ consuming-owner protected mutation
+ same pg client/transaction
+ direct DML denied
```

## 8. Required falsifiers before selection

### `B02-P1` — physical capability matrix

Create real PostgreSQL roles/stores and prove every forbidden cross-owner/store
query, `SET ROLE`, object-owner, superuser and BYPASSRLS path fails.

### `B02-P2` — SECURITY DEFINER hardening

Attempt `search_path`/temporary-object/operator/function shadowing, PUBLIC
execution, dynamic identifiers and over-broad outputs; every path must fail.

### `B02-P3` — CR-1 concurrency

Run controlled races:

1. mutation guard locks first, commit then revoke;
2. revoke commits first, mutation denied;
3. revoke/narrow during stale application pre-read;
4. missing/changed composite authority row;
5. deadlock/timeout/serialization failure.

No protected mutation may commit from stale authority and no owner gains broad
I&A SQL.

### `B02-P4` — bypass paths

Runtime role attempts direct DML, alternate function, trigger disabling, owner
role assumption and unguarded command path. All must be structurally denied.

### `B02-P5` — migration integrity

Apply a migration, edit bytes, delete/reorder/duplicate a migration and present
an out-of-order branch. Integrity/validate must turn red before target mutation.

### `B02-P6` — migration class/rehearsal

Prove backward-compatible and maintenance-required paths separately, including
old/new compatibility, drain, backup evidence, idempotent ledger handling and
blocked incompatible old serving.

### `B02-P7` — schema/privilege drift

Perturb a table/index/function/role/grant/search_path outside migrations.
EnvironmentConformance must detect exact real-target drift.

### `B02-P8` — Project DB isolation

Project query/action/migrator roles cannot reach Hub, another Project, Mastra or
Keycloak persistence; validation DB credentials cannot become persistent
business authority.

### `B02-P9` — driver/query-layer fit

Compare `pg` alone with bounded Kysely for representative owner-local reads,
transactions, functions and typed results. Select Kysely only if it reduces
total app-code defects without creating hand-owned schema/repository authority.

### `B02-P10` — migration tooling comparison

Run the same PostgreSQL roles/functions/constraints/index/transactional-exception
migration through Atlas versioned mode and the strongest remaining challenger.
Compare checksum, offline reproducibility, license/edition, lint, exact SQL,
history, schema drift, transaction control and operational footprint.

## 9. Pass-1 outcome

```text
OPP-B02 PASS 1 = OPERATOR APPROVED
pg = LEADING RUNTIME DRIVER CANDIDATE / NOT SELECTED
Kysely = BOUNDED OWNER-LOCAL ALTERNATIVE
Drizzle/Prisma = REJECT AS UNIVERSAL BASELINE
CR-1 narrow I&A SECURITY DEFINER guard + same transaction = LEADING HYPOTHESIS
row locks = preferred positive-authority serialization
advisory locks = bounded fallback for no-row/composite subject only
Atlas versioned mode = LEADING MIGRATION CONFORMANCE CANDIDATE
Flyway = STRONG CHECKSUM CHALLENGER
Sqitch = VERIFICATION-RICH CHALLENGER
node-pg-migrate = TS-NATIVE ALTERNATIVE WITH CHECKSUM GAP
dbmate = INSUFFICIENT ALONE
exact driver/query/migration selection = 0
Product implementation authority = 0
```

The selected Global Maximum must be the smallest composition that proves CR-1,
owner isolation, migration integrity and real-target conformance together. Tool
convenience cannot split those claims into mutually blind green checks.
