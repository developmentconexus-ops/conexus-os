# R3 — RF-05 / RF-08 owner decision candidate

> **Status:** OWNER ACCEPTED / EXACT CANDIDATE FREEZE IN PROGRESS
> **Current authority:** [`docs/roadmap.md`](../../roadmap.md)
> **Parent packet:** [`4D-C / R3 current selection packet`](4f-r3-4d-c-selection-packet.md)
> **Implementation authority:** `0`

This record routes the next serialized decision. It does not select a package,
create Product meaning, or admit R3 implementation. The retained B02/B03 studies
are Evidence; the owner accepts the semantic boundary and the proof route.

## Decision disposition

| Family | Leading candidate Evidence | Current disposition | Required owner decision |
| --- | --- | --- | --- |
| RF-05 access | `pg` / node-postgres; bounded Kysely only as an owner-local query alternative | `ACCEPTED CANDIDATE: pg 8.23.0` | Project accepts exact driver/version, client/transaction custody, role boundary and representative proof |
| RF-05 migration | Existing Conexus runner over exact Project SQL; the archived `docs/evidence/4d/atlas.sum-legacy-019.txt` is historical Evidence only | `ACCEPTED CANDIDATE: native runner sole integrity authority` | Project/platform accepts exact runner/version boundary, checksum/integrity, forward-only policy and rehearsal/conformance route |
| RF-08 occurrence | pg-boss `12.26.3` qualified incumbent; current `12.28.1` requires requalification | `ACCEPTED FIRST-PROOF CANDIDATE: pg-boss 12.26.3` | MAR accepts exact pin/source/DDL, owner-row + queue co-admission, one-catch-up and recovery proof |

Package-D custody is a tuple, not a queue version alone: the qualification
used PostgreSQL 17.10, `pg-boss 12.26.3`, `pg 8.22.0` and Node `24.18.0`.
The current root uses `pg 8.23.0` and Node `24.20.0`; the qualified proof does
not transfer automatically. Any owner disposition retaining pg-boss must choose
between an exact re-pin and a bounded requalification of the changed tuple.
The exact Package-D lock is recorded in
[`qualification/3l/managed-execution/package.json`](../../../qualification/3l/managed-execution/package.json)
and its durable pin is described in the
[managed-execution qualification](../../reference/managed-execution-qualification.md).

No challenger is promoted from feature breadth. Graphile Worker, BullMQ,
Temporal, custom queue and other references open only if a named falsifier
defeats the incumbent property or a new consumer requires them.

## Repository candidate and exact decision boundary

The current repository contains an already exercised PostgreSQL migration
composition:

```text
Project-owned SQL files in apps/hub/migrations
+ `iam.schema_migration` as the applied integrity ledger
+ scripts/run-hub-migrations.mjs as the Conexus admission runner
+ SHA-256 constants, lexical order and advisory transaction lock
+ real catalog/role/grant/function conformance checks
```

R1/R2/RB Evidence exercises this runner directly through
`runHubMigrations`, `runR2HubMigrations` and `runCurrentHubMigrations`. No
Atlas, Flyway or Sqitch executable is currently wired as the Hub runtime
migrator. Therefore the B02 Atlas row is a migration-conformance alternative,
not evidence that Atlas already owns R3 migration execution. The current
smallest candidate is **native runner + exact SQL**, with the archived
`atlas.sum-legacy-019.txt` retained only as historical Evidence and excluded
from the deciding path.
Selecting that candidate confirms the existing structure and avoids a second
migration authority; it still requires the R3 owner to accept the
forward-only/rehearsal/conformance contract.

The Lead recommendation for RF-05 is therefore:

```text
access       = pg 8.23.0 from the current root lock
  migrations   = existing Conexus runner + Project SQL; runner is sole integrity authority
query layer  = owner-local SQL; Kysely remains unselected
```

This recommendation does not select an external migration CLI. The existing
The archived `atlas.sum-legacy-019.txt` is not enforced and is not part of the
exact candidate. Atlas 1.3.0
remains historical qualification Evidence only; any future CLI adoption
must reopen the exact edition/license/feature boundary rather than inherit the
label “Atlas.”

For RF-08 the repository has no root `pg-boss` dependency. The only qualified
occurrence evidence is Package-D's exact tuple:

```text
PostgreSQL 17.10 + pg-boss 12.26.3 + pg 8.22.0 + Node 24.18.0
```

The root's `pg 8.23.0` and Node `24.20.0` mean that tuple is not transferable
without either an exact Package-D re-pin for the proof lane or a bounded
requalification of the changed tuple. The Lead recommendation is to retain
`pg-boss 12.26.3` as the first R3 proof candidate, add no queue dependency yet,
and make the re-pin/requalification choice explicit before implementation.

### Acceptance record — operator authorization 2026-09-09

The smallest semantic owners must accept or reject these exact proposals:

| Proposal | Acceptable disposition | What remains blocked until accepted |
| --- | --- | --- |
| RF-05 current native migration composition | `ACCEPTED` | migration owner/proof freeze may proceed |
| RF-05 `pg 8.23.0` owner-local access | `ACCEPTED` | client/transaction custody freeze may proceed |
| RF-08 `pg-boss 12.26.3` first proof candidate | `ACCEPTED` | occurrence/DDL/recovery proof freeze may proceed |
| RF-08 Package-D custody | `RE-PIN` qualification lane to `8.22/24.18` | exact tuple identity and deciding receipt remain required |

The operator's `A/A` authorization accepts these candidate and proof routes.
It does not
authorize dependency installation, a real JobRun, a live source read, or R3
implementation; those remain separate roadmap gates.

## Owner boundaries

- **Project** accepts business schema, migration, transformation, cursor, merge
  and freshness truth. It must reject queue/framework state as business truth.
- **MAR** accepts occurrence identity, single-flight/coalescing and recovery
  settlement. Queue delivery, retry and job IDs remain subordinate mechanics.
- **Connections/Gateway** is consulted only if the R3 contract widens to a real
  source read; that requires a separate live authority and honest common
  comparison coordinate.
- **Registry/Release** owns the later immutable artifact and served Release;
  it is outside this R3 decision.
- **Repository proof** owns candidate identity and falsifiers, never Product
  meaning or terminal owner truth.

## Minimum proof route before selection

### RF-05

The selected driver/query composition must pass the existing B02 falsifiers:

- B02-P1/P8: physical role/store isolation and forbidden cross-owner paths;
- B02-P2/P3/P4: narrow CR-1 guard hardening, concurrency and bypass refusal;
- B02-P5/P6/P7: migration integrity, rehearsal/classification and real-target
  schema/privilege drift;
- B02-P9: `pg` versus bounded Kysely fit without a second schema authority; and
- B02-P10: same migration corpus through Atlas and the strongest challenger,
  comparing checksum, license/edition, reproducibility, lint, history, drift
  and transaction control.

The migration comparison must not attribute all Atlas capabilities to the
Community Edition. Exact edition support for lint, drift detection, functions,
RLS and related objects must be established. Sqitch is a viable challenger
because `sqitch check` compares deployed-script SHA1, but its selected version
and forward-only operating boundary still require proof.

### RF-08

The selected occurrence mechanism must pass the B03 falsifiers:

- B03-P1: exact source/package pin and vendor DDL/config requalification;
- B03-P2/P3: atomic owner-row + queue admission, uniqueness and null/suppression
  refusal;
- B03-P4/P5: one current catch-up and exact served-Release handoff;
- B03-P6/P7/P8: process-loss matrix, queue-not-authority and retry/cancel/
  timeout discipline; and
- B03-P9: vendor schema/runtime privilege and migration discipline.

B03-P10 is a challenger trigger, not a requirement to benchmark every queue.

## Stop and next action

The owner decision is accepted. Before implementation, freeze the exact
source/version/DDL, candidate identity, Package-D proof tuple, deciding checks
and review brief in one new checkpoint. The isolated Package-D qualification
lane must remain exact; a later runtime tuple change reopens that proof.

`subjectDigest` remains a separate prerequisite: any R3 consumer must first
complete the admitted R1/Builder source-custody requalification, or prove
non-consumption in the frozen candidate.
