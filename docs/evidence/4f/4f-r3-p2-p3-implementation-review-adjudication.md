# R3 P2/P3 implementation review adjudication

> **Status:** ADJUDICATED / PHYSICAL STRUCTURE CONFIRMED / CURRENT ROOT-TUPLE PROVENANCE OPEN / RUNTIME CREDENTIAL ADOPTION OPEN / P4-A ROUTED
> **Authority:** Lead adjudication under the operator R3 implementation grant
> **Scope:** P2/P3 implementation checkpoint only

## Subject and inputs

The subject is the bounded Project read model, MAR admission boundary,
migration custody and controlled root-tuple proof. The candidate is bound to
base `e9ff12e4394c855e5a15656b0d74e26bc5f46a02` and the current candidate
freeze. The retained [root-tuple qualification receipt](4f-r3-p2-p3-root-tuple-qualification-receipt.json)
is a historical projection only: it combines separate subject outputs and is
not a current reproducible aggregate receipt.

The review brief was executed read-only with both configured lanes:

| Lane | Result | Adjudication |
| --- | --- | --- |
| AGY Gemini | `CORRECTION REVIEW COMPLETED / NO FINDING` | The first review found one material over-stopping condition; after correction and multi-batch requalification, the independent correction review reported no surviving material finding. |
| Claude Fable | `FAILED / INCOMPLETE` | `429` rate-limit response: external usage credits exhausted before a report was produced. This is a `LOCAL EXECUTION GAP`, not a code finding or a PASS. |

The bounded [Astra advisor receipt](4f-r3-p2-p3-astra-advisor-receipt.md)
remains supporting Evidence only. The operator waiver for independent closure
remains in force; this result does not imply two-lane convergence.

## Lead adjudication

The first review identified an over-stopping condition: drift recovery required
one complete full snapshot batch, making a dataset above the 10,000-row batch
limit unrecoverable. The smallest correction was to require `FULL_SNAPSHOT`
for rebaseline while allowing incomplete full batches; incremental deltas
remain rejected until the full rebaseline completes. The corrected fixture
proved both paths, including multi-batch recovery, and the independent
correction review reported no surviving material finding.

The current P4-A receipt passes the Project portion of the root tuple (Node
24.20.0, `pg` 8.23.0, pg-boss 12.26.3, PostgreSQL 17.10) and its named
Project falsifiers. The Hub/MAR control surface remains represented by its
retained implementation packet, but the aggregate P2/P3 receipt provenance
and product runtime adoption of Project capability roles are not yet
reproducibly closed. No current evidence falsifies the accepted owner map,
dedicated Project database, generation semantics, MAR owner boundary or
subordinate queue mechanism.

**Decision: PHYSICAL STRUCTURE CONFIRMED; PROOF/ADOPTION OPEN.** Keep the
accepted architecture and bounded implementation. Route P4-A local facts under
the existing envelope, while P2 owns product runtime credential adoption and
P6 owns one reproducible aggregate root-tuple receipt before downstream
consumption.

This adjudication does not turn `R3-P1..P7` green. It does not authorize a live
JobRun, Sankhya/provider/model call, deployment, publication, merge or R4+.
P4 must stop if it needs new Product meaning, a shared Project database,
cross-owner writes, a new trust boundary or an unaccepted dependency.

## Reopen triggers

- Fable review becomes an explicit requirement for independent closure and
  credits/authority are restored.
- A P4 fixture falsifies a P2/P3 invariant or exposes a material review gap.
- Tuple, dependency, vendor-DDL, source-revision or migration drift occurs.
- Recovery would make an effect-capable route reachable without an admitted
  consumer.

## Current review routing after P4-A correction batch

The current P4-A qualification now executes observation apply, gap and
committed-read through transient per-capability login adopters that adopt the
database-derived `NOLOGIN` capability roles. This proves the controlled
database boundary, not product credential provisioning. The Project migration
also rejects duplicate business coordinates inside the bounded capability
function, and the fixture exercises semantic-only drift rejection.

The aggregate P2/P3 JSON receipt is marked
`HISTORICAL_PROJECTION_NOT_CURRENT_PROOF`. Its matching freeze/manifest fields
are insufficient provenance because the record is not emitted by the current
single-subject Project script. P2/P3 therefore remains physically directed but
not current-proof complete until `R3-IMP-P6` supplies the aggregate producer
and receipt.
