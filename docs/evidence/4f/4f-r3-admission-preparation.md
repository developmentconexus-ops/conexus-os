# R3 — bounded admission preparation

> **Status:** RETAINED DETAILED PREPARATION / ROUTED BY CURRENT PACKET
> **Current packet:** [`4D-C / R3 selection packet`](4f-r3-4d-c-selection-packet.md)
> **Authority:** [`docs/roadmap.md`](../../roadmap.md)
> **Current gate:** BLD-10 approved Baseline subject decision accepted; R3 remains PREPARATION ONLY pending exact 4D-C owner/dependency/contract/proof admission and, if the candidate consumes `subjectDigest` semantics, the separately admitted R1/Builder source-custody requalification

This packet prepares the next realization decision without selecting a runtime,
database package, scheduler, provider transport or Product meaning. It is not
an implementation grant and does not authorize R3 code, live Sankhya access,
MAR execution, deployment or Git publication.

## Planned R3 outcome

R3 is the first Builder-authored Project read-model and governed-sync contract:

```text
exact Builder Change
→ Project-owned migration/read model
→ governed sync artifact and admission contract
→ cursor/merge semantics
→ bounded proof of one current catch-up and read-only recovery
```

The accepted realization plan names the Builder as candidate author and keeps
runtime truth with Project DB, MAR, Release and Connections/Gateway owners. R3
must preserve `3N-V18` (at most one current catch-up after downtime) and
`3N-V19` (read-only sync recovery does not acquire effect-capable machinery).

## Required owner and dependency census

| Concern | Smallest owner | Current posture | Admission condition |
| --- | --- | --- | --- |
| Project business schema, migration, transformation, cursor and result | Project | RF-05 reachable, exact mechanism unselected | Owner accepts schema/data-path contract and migration proof route |
| Sync occurrence, single-flight/coalescing and recovery | MAR | RF-08 reachable, exact occurrence mechanics unselected | MAR accepts occurrence contract and recovery proof route |
| Source transport and read capability | Connections/Gateway | RF-06 applicable only if R3 reaches a real Sankhya read | Exact transport/capability selection and explicit live authority |
| Immutable artifacts and later serving | Registry/Release/MAR | R3 does not produce ready Preview serving | No R3 slice may infer this owner or set `ready=true` |
| Builder authoring and independent proof | Builder + repository proof owner | RB is the prerequisite and remains the authoring lane | Exact Change, owner ports and deciding falsifiers are frozen |

The current roadmap keeps R3+ paused until its own exact 4D-C owner,
dependency, contract and proof route are admitted. The BLD-10
`CURRENT_PROJECT` question is now settled as the approved Baseline; this
packet still does not treat R3 planning as an implementation grant.

### BLD-10 subject-custody prerequisite

The accepted approved-Baseline meaning and the 4C-F15 owner disposition remain
closed. This packet does not reopen either decision. It propagates only the
deferred custody trigger already recorded by that owner:

```text
R3 candidate consumes, compares, derives or validates BLD-10 subjectDigest
-> STOP before R3 admission
-> separately admit the smallest R1/Builder source-custody requalification
-> update and prove the canonical source, aggregate wire digest, generated
   projections, manifests and receipts as one bounded custody change
-> only then may the R3 packet consume that semantic
```

If the R3 candidate does not consume `subjectDigest`, the frozen selection
packet must say so explicitly and its dependency/contract census must show that
no R3 identity, cursor, migration, artifact or proof result is derived from it.
Silence is not evidence of non-consumption. This routing preserves the accepted
Baseline interpretation and 4C-F15 meaning; only a material falsifier named by
their existing reopen laws may reopen them.

## Owner-law crosswalk for the selection packet

| Owner | Meaning retained from accepted authority | R3 boundary to freeze | Evidence that must remain outside this owner |
| --- | --- | --- | --- |
| Project | Business schema, migration, transformation, cursor, merge and freshness of the analytical/read model | Project DB path and the exact source/result facts needed to continue or stop | MAR occurrence identity, queue delivery and external-source truth |
| MAR | Governed occurrence admission, single-flight/coalescing and recovery settlement | One current occurrence derived from an admitted contract; queue mechanics remain subordinate | Project business cursor/merge and Product semantic meaning |
| Builder | Candidate Change and authored Project data-path source | Exact Change, owner ports and acceptance inputs | Runtime success, current authorization, Release or terminal truth |
| Connections/Gateway | Binding/revision/qualification and trusted read capability | Only the declared read capability if R3 reaches a real source | Project migration/cursor authority and any effect-capable machinery |
| Registry/Release | Immutable artifact identity and later composition/serving | No R3 ready state or serving pointer | R3 contract proof and Project business state |
| Repository proof owner | Candidate identity, falsifiers and deciding checks | Proof graph can reject a false claim but cannot accept Product meaning | Every owner’s semantic/terminal decision |

This crosswalk is a planning aid derived from the accepted owner references; it
does not create a shared data owner or a generic synchronization authority.

## Proof crosswalk to freeze before implementation

| Protected claim | Falsifier that must turn red | Required proof subject | R3 or R7 |
| --- | --- | --- | --- |
| Migration identity is complete and reproducible | missing, reordered, checksum-mismatched or partial migration | Project validation database plus migration ledger/conformance fixture | R3 |
| Project isolation and current owner truth hold | cross-Project read/write or stale owner accepted at a boundary | owner-role and current-authority negative fixtures | R3 |
| Cursor/merge/freshness are Project-owned | queue/framework state advances business state without the Project fact | Project transaction/restart fixture | R3 |
| Concurrent admissions collapse correctly | two equivalent admissions create two current occurrences | MAR/Project contract fixture with concurrent transactions | R3 |
| Process loss is deterministic | kill before/after merge causes duplicate, skip or ambiguous continuation | restart fixture around merge and cursor commit | R3 |
| Downtime does not replay missed slots | multiple missed intervals produce more than one current catch-up | freshness-derived recurrence fixture | R3 |
| Recovery waits for proven quiescence | a replacement/continuation mutates while the prior handler may still be active | owner fixture that withholds quiescence and requires `STOP/UNKNOWN` with no new progression | R3 |
| Missing observation stays missing | absent handler/queue/settlement observation is narrated as rollback, success, terminal truth or permission to continue | observation-gap fixture that preserves unknown state and blocks owner progression | R3 |
| Coverage and drift fail closed | incomplete paging/coverage or source/schema/mapping drift advances freshness/cursor or emits supported truth | owner-authored coverage, mutation and drift fixtures over the declared source profile | R3 contract; R7 live proof |
| Read-only recovery cannot gain effect authority | read path reaches external write/effect capability | capability negative control with denied effect route | R3 |
| `3N-V18` survives the real composition | the exact served Release admits N historical slots or more than one current catch-up after downtime | real JobRun under exact served pins and current freshness | R7 composed proof after R3 contract proof |
| Real source and result reconcile independently | candidate-produced comparison is used as its own oracle, or missing live coverage is reported as `MATCH` | real served Release, live source, common comparison coordinate and independent oracle; missing observation remains `INDETERMINATE` | R7 |

The rows are a preparation crosswalk, not a closure result. A row can be
admitted only when its owner, exact candidate and firing negative control are
recorded.

### R3/R7 execution boundary

R3 freezes and proves the owner contract with controlled, owner-authored
subjects. It covers migration and Project isolation, atomic cursor/merge,
single-flight/coalescing, the `3N-V18` one-current-catch-up law, recovery around
merge, quiescence refusal, missing-observation honesty, declared coverage/drift
behavior and `3N-V19` read-only authority. It does not admit a real JobRun, a
served Release or a live Sankhya read.

R7 consumes that accepted contract only after R6 supplies the exact served
Release pins and a separate grant admits the real source boundary. R7 executes
the real JobRun, re-exercises `3N-V18` on the composed path, proves provider
coverage/drift at an honest common coordinate and runs the independent
`3O-P1..P7` reconciliation. Missing provider, traversal, coverage, mutation or
oracle observation remains `INDETERMINATE`; it cannot be converted into
quiescence, completeness, `MATCH`, success or terminal owner truth.

Therefore a controlled R3 fixture proves only the contract/recovery mechanics
it exercises. It cannot close the R7 live-source, real-occurrence or independent
reconciliation claims.

## 4D-C selection questions

Before R3 implementation, the smallest owner must record for every selected
mechanism:

1. the exact package/source/version and physical boundary;
2. the protected property it proves and the accepted alternative mechanisms;
3. the owner of migration/admission/terminal truth and the trust boundary;
4. the failure, restart, duplicate, stale-cursor and concurrent-writer
   falsifiers;
5. the read-only proof route, including the negative control that would turn
   red; and
6. the requalification trigger when source, package, schema or topology changes.

No existing Postgres, pg-boss, Gateway or package usage is an automatic R3
selection. Existing code is Evidence and may challenge a choice, but it cannot
silently create the missing authority.

## Current 4D-C evidence census

The parallel planning work may compare existing Evidence, but it does not
select a mechanism or admit implementation:

| Selection family | Existing Evidence | Current disposition | Missing admission fact |
| --- | --- | --- | --- |
| `RF-05` Project data path | PostgreSQL 17 architecture and the B02 access/migration study; `pg` is the leading access candidate and migration tooling remains unselected | Candidate comparison only | Exact Project schema/migration/source version, physical boundary, cursor/merge/freshness contract and rehearsal/conformance proof |
| `RF-08` managed occurrence | B03 Package-D qualification proves bounded PostgreSQL/pg-boss co-admission at the qualified pin `12.26.3` | Incumbent Evidence, not selected dependency | Exact R3 occurrence contract, version/DDL custody, single-flight/coalescing, one-catch-up and process-loss proof |
| `RF-06` source read capability | R2 binding and Gateway laws are integrated; source transport and common comparison coordinate remain unresolved for a real read | Conditional / not reached by contract-only R3 | Exact transport/capability and explicit live authority if R3 is widened to a real Sankhya read |
| `RF-09`/`RF-10` Builder runtime and guest | RB source inspection and prior qualification planning are retained; exact Mastra/E2B source admission remains consumer-gated | RB prerequisite Evidence, not a new R3 mechanism | Exact admitted Builder runtime/source, owner ports and the proof that Builder authoring does not become runtime authority |
| R3/R7 boundary | Realization planning places the R3 contract before a real JobRun and reserves live source reconciliation for R7 | Boundary accepted, implementation absent | Candidate packet must label every claim as R3 or R7 and refuse a real occurrence from an unpinned candidate |

The primary comparison inputs are [`4d-opp-b02-postgresql-migrations-cr1-study.md`](../4d/4d-opp-b02-postgresql-migrations-cr1-study.md), [`4d-opp-b03-governed-sync-mar-study.md`](../4d/4d-opp-b03-governed-sync-mar-study.md), [`4d-04-runtime-family-applicability.md`](../4d/4d-04-runtime-family-applicability.md) and the ordered slices in [`realization-planning.md`](../../phases/realization-planning.md). Their dispositions are planning Evidence; they do not silently promote a package or topology.

## Operator-directed parallel work package

The current planning cycle can advance in parallel on four bounded outputs:

1. **Owner and contract crosswalk:** map Project, MAR, Builder, Gateway and
   Release responsibilities to the accepted laws and name every unresolved
   owner decision.
2. **Mechanism comparison:** compare the RF-05 data/migration candidates and
   RF-08 occurrence candidates against the same protected properties, including
   exact source/version/DDL custody and requalification triggers.
3. **Proof graph:** map each R3 falsifier to a fixture, negative control and
   deciding check without implementing a schema or queue.
4. **Repository-proof integrity:** make candidate guards inspect the real dirty
   candidate, including non-ignored untracked Evidence, so a new packet cannot
   be invisible to documentation or hygiene checks.

These outputs may be produced independently. The final mechanism selection,
owner acceptance, contract wording and R3 admission remain one serialized
adjudication checkpoint. No parallel output can promote itself into authority.

## Material selection gaps

The selection packet is ready to close only after it resolves, or explicitly
routes to the smallest owner, all of the following:

- exact Project data schema and migration custody;
- exact cursor, merge, freshness and terminalization facts;
- MAR occurrence identity, coalescing and recovery boundary;
- the proof that queue delivery remains subordinate to MAR admission;
- quiescence and missing-observation behavior before continuation or
  terminalization;
- declared coverage, paging and source/schema/mapping-drift behavior, with live
  closure retained for R7;
- Builder Change and runtime ports without a second authority;
- R3 versus R7 claim ownership and live-source boundary;
- explicit `subjectDigest` non-consumption or completed separately admitted
  R1/Builder source-custody requalification; and
- package/source/schema/topology requalification triggers.

If any gap requires new Product meaning, a new trust boundary, an unaccepted
dependency or live provider/source execution, the packet is `STOP / SPLIT
PREREQUISITE` rather than an implementation grant.

## Minimum proof route to admit R3

The R3 candidate must prove, with owner-authored fixtures and no live provider
effect unless separately granted:

- migration census, checksum and rollback/partial-application refusal;
- Project isolation and current owner recheck at every read/write boundary;
- one governed sync contract whose cursor and merge are Project-owned;
- duplicate/concurrent admissions collapse to one current occurrence;
- process loss before and after merge does not duplicate or skip the current
  state;
- continuation or replacement cannot proceed until prior-handler quiescence is
  proven, and missing observation remains unknown rather than inferred;
- downtime produces at most one current catch-up, never replay of missed slots;
- incomplete coverage or source/schema/mapping drift blocks cursor/freshness
  advancement and supported truth in the declared R3 contract;
- a read-only path cannot gain external write or effect authority; and
- independent review of the exact candidate and proof graph.

The proof must identify which claims are R3 and which remain R7. R3 may define
the contract and recovery seam without admitting a real JobRun or serving
Release; R7 owns the later real governed occurrence under the exact served
Release pins.

## Stop law

Stop at the smallest owner if any next action requires:

- inventing a new `CURRENT_PROJECT` meaning or reconciliation mechanism beyond
  the accepted approved-Baseline decision;
- consuming `subjectDigest` before its separately admitted R1/Builder
  source-custody requalification, or reopening Baseline/F15 to avoid that route;
- inventing a Project/MAR/Gateway operation, table, artifact or trust boundary;
- selecting a package or topology from name-only precedent;
- executing live Sankhya, provider/model, E2B or production effects; or
- claiming R3 implementation or readiness from this preparation packet.

The next permitted action is to reopen this preparation as the smallest
4D-C/R3 selection packet, record its exact owners/dependencies/contracts and
proof route, and independently review it before code is admitted.
