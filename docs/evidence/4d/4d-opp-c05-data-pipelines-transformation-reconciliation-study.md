# 4D OPP-C05 — Data Pipelines, Transformation and Reconciliation Study

> **Status:** `PASS 1 OPERATOR APPROVED / GOVERNED PROJECT DATA PATH PROMOTED / MECHANISM SELECTION OPEN`
> **Inputs:** C-006/C-007/C-009/C-013/C-014/C-017; Data/Project/Gateway/MAR/Release owners; 3O; B03/B04; first Builder-generated Budget Analyzer
> **Research date:** `2026-08-29`
> **Live Sankhya/database/runtime execution:** `NOT PERFORMED / FIRST-BUILD PROOF REQUIRED`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

What is the smallest reusable Project data path that lets the Builder create
correct enterprise applications without making every Project reinvent
extraction, transformation, restart and reconciliation, while preserving
provider, Product, Project, Gateway, MAR and Release authority?

## 2. Current consumer and root cause

The current consumer is not a hypothetical data platform. It is the first
Builder-generated Budget Analyzer:

```text
exact served Release + Project binding
→ governed read-only Sankhya extraction
→ deterministic bounded coverage
→ Project-owned transformation and read-model merge
→ truthful freshness/result projection
→ independent live-source reconciliation
```

The first slice therefore needs more than an ad hoc script. Its extraction,
cursor, transformation, merge and Evidence identities must be reproducible and
regenerable by the Builder. The root cause is not missing orchestration breadth;
it is the absence of one explicit Project data-path contract across mechanisms.

The opposite error is a universal Data Product/platform owner. Framework asset,
pipeline, task, model, state, catalog, lineage and test objects remain mechanics
or Evidence. They cannot own Sankhya truth, Budget semantics, JobRun occurrence,
Project data, Release composition or reconciliation verdict.

## 3. Non-collapsible planes

```text
P1 source admission
   exact Connection revision/environment/company/capability/query artifacts

P2 extraction coverage
   ordered pages/ranges, provider limits, duplicate/drop/mutation/deletion state

P3 transformation
   Project-authored semantic mapping and deterministic compiled realization

P4 materialization
   staging/generation, stable keys, atomic merge and Project-owned cursor

P5 owner settlement
   MAR JobRun + Project freshness/result truth under exact Release pins

P6 reconciliation
   independent live-source oracle + exact common boundary + Evidence verdict
```

A successful HTTP call, framework load, task, model, test, trace or JobRun does
not collapse any later plane. Positive reconciliation requires all six relevant
truths; missing closure is `INDETERMINATE`/`NOT_PROVEN`, never success.

## 4. Governed Project data-path profile

The leading architecture is a platform contract, not a selected engine:

```text
Release-pinned Project job/query/migration/source artifacts
+ exact semantic and binding references
+ stage manifest and ownership map
+ source coverage / cursor / deletion / late-arrival policy
+ transformation and target relation identities
+ merge and restart checkpoints
+ reconciliation manifest and firing negative controls
→ one governed Project data path
```

The Builder authors/evolves app-owned source and transformations through Change.
Generated/platform seams compile and validate the profile. Gateway alone obtains
Sankhya credentials and performs admitted provider operations. MAR owns JobRun
admission; the Project owns durable cursor/merge/freshness facts; Release pins the
exact composition. No new Product operation, semantic owner or durable Hub record
is introduced.

This profile is mandatory for the first operational Budget Analyzer. It prevents
both improvised per-app sync and framework lock-in while retaining richer
mechanisms when they prove value.

## 5. Extraction and loading candidates

### Native Project implementation over Gateway

A narrow TypeScript/SQL realization inside the existing Project + Gateway + MAR
composition naturally preserves current identities and minimizes runtime/state
planes. It is a baseline candidate, not an assumed winner. Conexus would own page
traversal, overlap, staging, merge, schema checks and recovery correctness.

**Disposition:** `BASELINE CANDIDATE / MUST COMPETE`.

### dlt OSS

dlt is the strongest embedded library challenger. It provides REST pagination,
incremental cursors, destination-restorable state, load packages, merge/upsert,
schema contracts and interrupted-load continuation without requiring a separate
platform service.

Material constraints:

- Python and dlt metadata/state add a runtime and persistence surface;
- default schema evolution is too permissive for value-bearing Project facts;
- dlt state cannot become the Project business cursor or source completeness;
- dlt must consume a bounded Conexus Gateway capability, never Sankhya credentials,
  caller-selected company/destination or a generic external connector;
- merge/load success does not prove source coverage or reconciliation.

**Disposition:** `STRONGEST EXTRACTION/LOAD LIBRARY CHALLENGER / BOUNDED PROBE REQUIRED`.

### Airbyte

Airbyte offers a mature source/destination protocol, black-box checkpoint state,
catalogs, partial progress and append/dedup modes. For the first slice it has no
qualified Sankhya connector, would still require provider-specific logic and
introduces platform Connection/config/state/job surfaces plus substantial
self-managed deployment. Its current platform licensing is also materially
different from its MIT protocol.

**Disposition:** `DEFER UNTIL MULTIPLE HETEROGENEOUS REAL CONNECTORS + LICENSE/FOOTPRINT TRIGGER`.

### Meltano / Singer

Meltano provides plugin isolation and durable Singer state, but Singer delivery
is at-least-once, schema and behavior depend on each tap/target, and a custom
Sankhya tap still carries all deciding source semantics. It currently offers no
material advantage over the embedded dlt challenger.

**Disposition:** `DEFER UNTIL MAINTAINED REAL SINGER CONNECTORS CREATE PORTABILITY VALUE`.

### Debezium / Kafka Connect

Debezium Oracle CDC consumes database redo/SCN and direct database privileges.
That is an Oracle Database connector, not Sankhya. It cannot emit invoices,
orders or Sankhya-governed business behavior, and cannot repair an API coverage
gap by crossing the accepted provider boundary.

**Disposition:** `REJECT FOR SANKHYA / REOPEN ONLY FOR A SEPARATELY AUTHORIZED ORACLE DATABASE SOURCE`.

### Dagster and other orchestrators

Dagster's assets, checks, partitions, backfills and observability are valuable
for a real multi-asset data estate. For one governed sync it duplicates MAR
run/schedule/recovery machinery while relying on another extractor and merge
implementation for correctness.

**Disposition:** `DEFER UNTIL REAL MULTI-ASSET DAG/OPERATIONS CONSUMER`.

## 6. Transformation candidates

### Native versioned SQL/TypeScript

The existing Project Git/migration/query path is the smallest baseline. It keeps
Budget logic app-owned and can prove exact compiled SQL, migration and test
identity, but Conexus would own dependency ordering, incremental impact,
artifacts and transformation lineage.

**Disposition:** `BASELINE CANDIDATE / MUST COMPETE`.

### dbt Core

dbt Core is the conservative mature challenger: Project-owned SQL/YAML, model
DAG, data/unit tests and versioned JSON artifacts are useful Builder and review
surfaces. Incremental correctness remains author/adapter dependent: filters,
keys, late arrivals, deletion, merge semantics and historical logic changes are
not solved by `incremental` or a green test alone.

**Disposition:** `REQUIRED TRANSFORMATION CHALLENGER`.

### SQLMesh

SQLMesh is the strongest correctness-oriented challenger. Content fingerprints,
model snapshots, missing intervals, isolated plans, backfills and blocking audits
could materially reduce data-change risk. Its durable state, scheduler,
environment/promotion model and fast-moving release surface may duplicate current
Project/Release/MAR authority unless narrowly adapted.

**Disposition:** `REQUIRED TRANSFORMATION CHALLENGER / STATE-PLANE PROBE REQUIRED`.

### DuckDB and Polars

Both are strong embedded compute/test kernels. Neither owns model lifecycle,
durable interval state, release composition, lineage or reconciliation. They may
be selected below the profile for a measured workload, but cannot replace it.

**Disposition:** `KEEP AS EXECUTION/QUALIFICATION KERNELS`.

## 7. Data quality and reconciliation candidates

Native deterministic Project assertions and firing negative controls are the
first line. dbt tests or SQLMesh audits may realize them when those engines are
selected, but framework pass remains Evidence only.

Great Expectations is a credible supplemental semantic/data-quality layer when
multiple pipelines/assets need reusable suites and human-readable validation
history. It does not provide transformation lineage or full source reconciliation;
its current multi-source comparison is sample-limited.

Soda Core's checks are attractive, but current licensing and commercial
reconciliation dependency make it an unjustified default. `dbt-audit-helper`
is a narrow same-engine challenger only if dbt is selected and exact keys/adapter
behavior qualify.

```text
native deterministic assertions = REQUIRED FLOOR
dbt tests / SQLMesh audits        = ENGINE-LOCAL CANDIDATES
Great Expectations               = SUPPLEMENTAL TRIGGERED CANDIDATE
dbt-audit-helper                  = DBT-CONDITIONAL CHALLENGER
Soda                              = DEFER / LICENSE + REAL CONSUMER TRIGGER
```

No candidate replaces the independent live-source oracle required by 3O.

## 8. Incremental, deletion and schema law

An incremental cursor is an optimization over an exact source contract, not
proof of completeness. Before incremental admission, the real Sankhya probe must
establish inclusivity, precision/timezone, stable tie ordering, paging under
mutation, deletion representation, provider limits and endpoint coverage.

```text
late-arrival overlap + stable provider key + idempotent merge
!= proof of no missing/deleted source rows
```

If deletion/change closure is absent, the profile needs a qualified full scan,
provider deletion feed, bounded quiescence/double-read or an honest incomplete
state. Destination absence never authorizes deletion.

Schema evolution is explicit per source fact:

- unknown/additional non-deciding fields may be quarantined/observed;
- missing, renamed or type-changed deciding fields fail the affected path;
- silent evolve, discard-row/value or type coercion cannot preserve a clean PASS;
- mapping change requires a new artifact/semantic identity and revalidation.

## 9. Restart and cursor commit law

For one exact JobRun:

```text
fetch page/range
→ durable stage with exact source/coverage identity
→ validate/transform under pinned artifacts
→ atomic Project merge + next cursor/checkpoint
→ only then admit progress/freshness settlement
```

Process loss before Project commit replays safely; loss after commit observes the
same committed checkpoint. Queue/framework redelivery never creates a new
semantic occurrence or advances the cursor. Incompatible code/state/schema pins
stop rather than silently migrate active work.

## 10. Independent reconciliation

The oracle shares accepted Budget semantics but not candidate extraction,
transformation, staging, read model or result path. It independently queries the
governed live source and compares under one proved common coverage boundary.

Required comparison layers:

1. traversal/page/range coverage and mutation checks;
2. key-set, duplicate and deletion/absence checks;
3. row-level deciding facts;
4. counts and monetary totals;
5. each materially distinct semantic rule class;
6. final Product result/page truth and provenance.

Every supported result maps to an exact rule class and live case. A framework
diff or aggregate match cannot cover an unmapped semantic rule. Candidate-only
perturbation must make reconciliation red without mutating the source/oracle.

## 11. Promoted properties and owner reuse

The first draft proposed seventeen `DPL`/`RCN` rows. Adversarial owner mapping
showed that eleven would duplicate accepted `DAT-08`, `INT-01..06`, `REL-01`,
`RUN-02..04`, `VER-05`, `EVA-01..07` and `3O-P1..P7`. They remain required
proof coverage through those existing owners; they are not restated as new
ledger authority.

Only the missing data-path deltas are promoted:

1. `DPL-01`: one Release-pinned Project data-path manifest closes over exact
   stage, source/query, semantic/binding, code/lockfile, target and mechanism
   identities without becoming a Product/pipeline owner;
2. `DPL-02`: transformation source remains Project-authored/versioned with exact
   accepted semantic refs; compiled/framework DAGs are reproducible projections
   and own no Product meaning;
3. `DPL-03`: source admission, extraction coverage, transformation,
   materialization, owner settlement and reconciliation remain non-collapsible
   truth planes;
4. `DPL-04`: Project cursor/checkpoint advances atomically only with the durable
   merge it covers; framework pipeline state remains subordinate Evidence and
   cannot authorize continuation;
5. `DPL-05`: every admitted source profile has exact paging/order/limits,
   late-arrival, deletion/absence and schema/mapping-drift behavior, with unknown
   closure explicitly incomplete/fail-closed;
6. `DPL-06`: the first Builder-generated Budget Analyzer must realize and evolve
   this governed profile without protected-seam edits; native/dlt/dbt/SQLMesh
   mechanisms remain comparable behind the same envelope.

Reconciliation requirements route unchanged through:

```text
DAT-08 + INT-06 + VER-05
+ 3O-P1..P7
+ EVA-01..07 where comparative tooling is selected
```

## 12. Required falsifiers

1. `C05-P1`: alternate Connection revision/company/endpoint/query/credential hint is denied before fetch.
2. `C05-P2`: unknown operation code, derivative topology, business date, currency or name mapping cannot emit supported truth.
3. `C05-P3`: page overlap, omission, unstable order, mutation and provider-limit exhaustion prevent completeness.
4. `C05-P4`: late-arriving equal/older cursor value remains discoverable under the admitted overlap/tie policy.
5. `C05-P5`: source deletion without an admitted deletion/full-scan contract cannot delete destination truth.
6. `C05-P6`: missing/renamed/type-changed deciding field cannot silently evolve, discard or coerce into PASS.
7. `C05-P7`: kill before/after fetch, stage, merge, cursor commit and settlement yields one explicit deterministic outcome.
8. `C05-P8`: framework state/task/run success without Project merge/owner settlement advances nothing.
9. `C05-P9`: transformation code/model/compiled SQL/adapter change under the same identity fires drift.
10. `C05-P10`: duplicate/null key, missing interval and changed historical rule each turn deterministic controls red.
11. `C05-P11`: candidate-only one-row and aggregate perturbations produce `MISMATCH` through the independent oracle.
12. `C05-P12`: removal of the common boundary produces `INDETERMINATE`, not tolerant/approximate `MATCH`.
13. `C05-P13`: every exposed supported result has exact rule-class/live-case coverage; labels/counts alone fail.
14. `C05-P14`: runtime/transform/quality mechanism swap preserves owner/provenance/restart/result semantics.
15. `C05-P15`: first Builder Worker Eval rejects an ad hoc unmanifested sync or protected-seam bypass.
16. `C05-P16`: Airbyte/Dagster/other platform cannot be admitted by connector/UI/lineage breadth without a named consumer and authority-preserving proof.
17. `C05-P17`: Debezium/Oracle SCN cannot satisfy the Sankhya source/reconciliation contract.

## 13. Selection path

At the exact 4D-C row, compare:

```text
extraction/load:
  native Project TypeScript/SQL
  vs dlt behind a Gateway-only adapter

transformation:
  native versioned SQL/TypeScript
  vs dbt Core
  vs SQLMesh

quality:
  native deterministic assertions
  plus engine-local tests/audits
  with GX only when a named reusable semantic-check consumer fires
```

Use the same Budget corpus, real PostgreSQL, real Gateway-bound Sankhya proof,
restart matrix, schema/deletion/late-arrival cases, independent oracle, operational
footprint, upgrade/state migration, licensing and Builder maintenance task. A
richer tool wins only if it materially reduces accepted defects/maintenance
without duplicating authority or increasing total complexity.

## 14. Current sources

Primary/current sources include:

- [Sankhya integration guide](https://developer.sankhya.com.br/reference/guia-integracao),
  [Gateway requests](https://developer.sankhya.com.br/reference/requisi%C3%A7%C3%B5es-via-gateway)
  and [paginated NF-e example](https://developer.sankhya.com.br/reference/getnfe);
- [dlt state](https://dlthub.com/docs/general-usage/state),
  [incremental loading](https://dlthub.com/docs/general-usage/incremental-loading),
  [schema contracts](https://dlthub.com/docs/general-usage/schema-contracts) and
  [merge loading](https://dlthub.com/docs/general-usage/merge-loading);
- [Airbyte protocol](https://docs.airbyte.com/platform/understanding-airbyte/airbyte-protocol),
  [incremental append/dedup](https://docs.airbyte.com/platform/using-airbyte/core-concepts/sync-modes/incremental-append-deduped)
  and [schema change management](https://docs.airbyte.com/platform/using-airbyte/schema-change-management);
- [dbt artifacts](https://docs.getdbt.com/reference/artifacts/dbt-artifacts),
  [incremental models](https://docs.getdbt.com/docs/build/incremental-models) and
  [unit tests](https://docs.getdbt.com/docs/build/unit-tests);
- [SQLMesh plans](https://sqlmesh.readthedocs.io/en/stable/concepts/plans/) and
  [audits](https://sqlmesh.readthedocs.io/en/stable/concepts/audits/);
- [Great Expectations Core](https://docs.greatexpectations.io/docs/core/introduction/gx_overview/)
  and [multi-source expectation limits](https://docs.greatexpectations.io/docs/core/customize_expectations/define_a_multi_source_expectation/);
- [Dagster OSS deployment architecture](https://docs.dagster.io/deployment/oss/oss-deployment-architecture)
  and [dlt integration](https://docs.dagster.io/integrations/libraries/dlt);
- [Debezium Oracle connector](https://debezium.io/documentation/reference/stable/connectors/oracle.html).

## 15. Independent challenge and adjudication

Three fresh bounded reviewers independently reconstructed owner semantics,
ingestion/platform candidates and transformation/quality candidates. Their
material challenge was that a new reconciliation family and several runtime/
Gateway rows would duplicate accepted authority. Lead accepted that finding and
reduced the promotion from seventeen rows to the six true data-path deltas above.

The reviewers otherwise converged that the profile is current for the first
Builder product, dlt is the strongest embedded extraction challenger, dbt Core
and SQLMesh are the deciding transformation challengers, and external platform
breadth does not prove first-slice value. No reviewer selected a dependency.

Claude Code/Fable was invoked in read-only plan mode for an additional external
challenge but returned no output after repeated bounded waits and was
interrupted. Its opinion is unavailable and is not simulated. The completed
independent owner/tool reviews provide the pass-1 challenge; a later Global
Coherence/4D-07 review remains required before 4D ratification.

## 16. Pass-1 outcome

```text
OPP-C05 PASS 1 = OPERATOR APPROVED
governed Project data-path profile = REQUIRED FIRST BUILDER CAPABILITY
ad hoc per-Project sync = REJECT
universal Data/pipeline Product owner = REJECT
native Gateway + Project + MAR composition = BASELINE CANDIDATE
dlt = STRONGEST EXTRACTION/LOAD LIBRARY CHALLENGER
Airbyte/Meltano = DEFER WITH REAL MULTI-CONNECTOR TRIGGER
Debezium = REJECT FOR SANKHYA
Dagster = DEFER WITH MULTI-ASSET ORCHESTRATION TRIGGER
native SQL/TypeScript vs dbt Core vs SQLMesh = REQUIRED TRANSFORMATION COMPARISON
DuckDB/Polars = EXECUTION/QUALIFICATION KERNELS ONLY
native deterministic checks = QUALITY FLOOR
GX = SUPPLEMENTAL TRIGGERED CANDIDATE
independent Conexus live-source reconciliation = REQUIRED
DPL-01..06 = PROMOTE TO 4D PROPERTY CONTRACTS
DAT-08 + INT-06 + VER-05 + 3O-P1..P7 = REUSE / NO DUPLICATE RCN FAMILY
new Product owner/operation/record = 0
exact pipeline/transform/quality dependency selection = 0
Product implementation authority = 0
```
