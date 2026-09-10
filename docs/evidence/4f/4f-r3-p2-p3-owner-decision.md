# R3 P2/P3 — Project read model and MAR tuple decision

> **Status:** OPERATOR DECISION / IMPLEMENTATION ENABLED
> **Date:** 2026-09-09
> **Authority:** explicit operator instruction in the active session
> **Current status:** [`docs/roadmap.md`](../../roadmap.md)

This decision closes the two material implementation blockers identified by the
R3 packet: the physical Project read-model boundary and the RF-08 runtime tuple.
It does not authorize a real JobRun, live Sankhya/source access,
provider/model execution, deployment or publication.

## Decision outcome

The accepted owner structure is confirmed. The smallest implementation is:

```text
one dedicated Project database per Project
  → Project-owned budget_analyzer read-model schema
  → pending_budget projection + sync_checkpoint authority

Hub control database
  → MAR-owned mar.job_run
  → pg-boss private queue substrate in mar
```

The Project database may share the PostgreSQL 17 cluster with Hub control, but
it is a separate database and credential boundary. The Hub `project` schema is
control-plane state and must not receive business/read-model rows. MAR remains
in Hub control; it does not own Project business rows or their cursor.

## Project physical contract

The first admitted consumer is the accepted Budget Analyzer result pair
`AnalyzePendingBudgets` and `ListPendingBudgets`. The Project read model stores
only the row facts needed by those results:

### `budget_analyzer.pending_budget`

| Column | Contract |
| --- | --- |
| `budget_ref` | non-empty source-qualified business identity; unique within each generation |
| `canonical_business_date` | required business date; age is derived at the result boundary |
| `last_change_at` | optional source change timestamp |
| `budget_value` | exact PostgreSQL `numeric`; no invented scale or currency conversion |
| `currency_code` | required uppercase ISO-4217-shaped code |
| `seller_id`, `seller_name` | required non-empty seller identity and owner-issued presentation |
| `customer_id`, `customer_name` | required non-empty customer identity and owner-issued presentation |
| `source_company_id` | required non-empty source-company scope |
| `pending_evidence_state` | exactly `CONFIRMED`, `AMBIGUOUS` or `UNVERIFIED` |
| `generation` | Project-owned committed/working generation marker; never MAR or queue state |

The physical primary key is `(generation, budget_ref)`. A row from a working
generation is never visible to a query until the checkpoint commits that
generation.

`budget_age_days` and `aging_band` are not persisted. They are deterministic
projections from `canonical_business_date` and the disclosed system coordinate;
a negative age can therefore never be silently assigned to an aging band.

### `budget_analyzer.sync_checkpoint`

One row is maintained for the named governed sync consumer. It owns:

```text
sync identity
committed generation and opaque committed cursor
working generation and opaque working cursor, when ingestion is incomplete
freshness = CURRENT | STALE | UNKNOWN
coverage = COMPLETE | PARTIAL | UNKNOWN
merge state = IDLE | INGESTING | UNKNOWN
source-binding revision and semantic revision when known
last completed time and update time
```

The cursor is an opaque Project-owned source coordinate. R3 does not select a
Sankhya coordinate or claim live-source coverage. The checkpoint also carries
an optimistic `checkpoint_revision` and the current `observation_kind`:
`FULL_SNAPSHOT` or `INCREMENTAL_DELTA`.

Queries read only rows at the checkpoint's committed generation. A complete
`FULL_SNAPSHOT` atomically replaces the committed generation; an
`INCREMENTAL_DELTA` atomically upserts observed rows and removes only explicit
source-qualified tombstones. Absence from a delta is never treated as a
deletion. Both paths advance cursor, generation and freshness/coverage only in
the same Project transaction as their accepted merge. Incomplete, ambiguous or
drifted observations may retain working rows but may not advance committed
cursor, generation, freshness or supported Product truth. A previously current
checkpoint is allowed to degrade to `STALE`, `PARTIAL` or `UNKNOWN` while its
last confirmed generation remains queryable with that disclosed state.

The Project runtime does not receive direct table DML. A single bounded,
Project-owned `SECURITY DEFINER` function (with a fixed safe `search_path`)
accepts the validated observation, expected checkpoint revision, rows and
explicit tombstones, performs the merge and checkpoint transition atomically,
and rejects stale writers. `project_sync_runtime` receives only `EXECUTE` on
that function; `project_query_runtime` can read only committed rows/checkpoint
state. Direct-DML denial and stale-writer rejection are required R3-P1
negative controls.

The implementation files are bounded to:

```text
apps/hub/project-migrations/001_budget_analyzer_read_model.sql
scripts/run-project-migrations.mjs
apps/hub/src/project/read-model.ts
tests/implementation/r3-project-read-model.test.mjs
```

The Project migration runner is the same native Conexus checksum/transaction
pattern applied to the distinct Project database, with a Project-local
`project_meta.schema_migration` ledger recording migration version, checksum,
exact Project Git source revision and applied time. The runner refuses a
missing or mismatched source revision and is exercised against separate
Project databases/roles in controlled PostgreSQL proof. It is not a second
authority for Hub control migrations and it does not expose migration
administration as Product operations.

The migration owner owns schema/role setup. `project_sync_runtime` may write
the two Project-owned tables through the bounded read-model module;
`project_query_runtime` receives read-only access. Neither role can reach Hub
control, MAR, Brain, Builder, Mastra or provider persistence.

## MAR dependency and runtime contract

The RF-08 first implementation candidate is selected as:

```text
Node       24.20.0 (repository pin)
pg         8.23.0 (repository root pin)
pg-boss    12.26.3 (new direct root pin)
PostgreSQL 17.10 for the first controlled requalification subject
```

The old Package-D qualification remains immutable Evidence for its exact
tuple (`Node 24.18.0`, `pg 8.22.0`, `pg-boss 12.26.3`, PostgreSQL 17.10). It
is not transferred to the root. The current tuple requires a bounded local
requalification before any R3 proof row that depends on queue co-admission is
declared green and before any live occurrence is admitted. R3 implementation
may prepare and test the adapter without running a real JobRun.

MAR runtime configuration remains exact:

```text
schema=mar
createSchema=false
migrate=false
schedule=false
retryLimit=0
```

Admission inserts the MAR owner row and calls the queue projection using the
same Hub transaction. A null/suppressed queue projection aborts the
transaction. `mar.job_run` owns occurrence identity, pins and state;
pg-boss job rows, delivery, retry and queue IDs are subordinate mechanics.

The implementation file is bounded to:

```text
apps/hub/src/mar/admission.ts
tests/implementation/r3-mar-admission.test.mjs
```

No MAR API route, served-Release resolver or live worker is added in R3. A
later real occurrence remains an R7 action derived from an exact served
Release.

## Protected invariant and falsifiers

```text
one Product row truth → Project
one sync cursor/merge truth → Project
one occurrence/recovery truth → MAR
queue state never advances either owner truth
```

The decision is falsified by any of the following:

- read-model rows appear in Hub control or MAR;
- a query exposes a working generation as committed truth;
- a partial/ambiguous/drifted observation advances the committed cursor or
  freshness;
- age is stored as an authoritative value or negative age is banded;
- an admission commits `mar.job_run` without a queue projection, or queue
  state creates an occurrence without the MAR owner row;
- the root tuple, pg-boss source/DDL or runtime configuration changes without
  requalification;
- a real JobRun or source/provider execution is introduced into the R3 proof.

## Reopen triggers

Reopen this decision at the smallest owner if a future consumer needs a new
business field/operation, a shared/multi-Project database, a different source
comparison coordinate, a new cross-owner transaction, a changed dependency
tuple/source/DDL, effect-capable recovery, or real served-Release execution.
Those changes are not implementation details and cannot be smuggled through a
review finding.

## Decision and next action

Decision outcome: **CURRENT STRUCTURE CONFIRMED for ownership and physical
direction; controlled root-tuple requalification and the contract corrections
above are mandatory proof prerequisites, not an inherited qualification.**

P2/P3 may now implement the bounded migrations, bounded function/adapter and
controlled fixtures above. P2/P3 proof rows remain open until their exact
requalification, isolation, stale-writer, direct-DML and snapshot/delta
falsifiers are reproducible. P4 remains blocked until those contracts and
targeted proofs are complete. R3/R7 boundaries, BLD-10 subject
non-consumption and all pre-existing dirty paths remain unchanged.
