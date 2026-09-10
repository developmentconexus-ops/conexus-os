# R3 P4-A Project observation-integrity checkpoint — independent review brief

> **Status:** REVIEW BRIEF / NO VERDICT
> **Subject:** bounded Project observation-gap and recovery-facts slice
> **Authority:** current R3 roadmap grant and P4 census; reviewer output remains Evidence only

## Review question

Does the bounded P4-A slice preserve the accepted Global Maximum for Project
observation integrity: one Project-owned capability records missing or
ambiguous observations, preserves the last committed truth, exposes enough
working facts for a later coordinator, and requires an explicit full
rebaseline before supported truth resumes?

This is a material checkpoint because the slice changes Project migration
lineage, a security-definer write capability and the read-model state exposed
to recovery code. Review the current repository state, not the historical
P2/P3 verdict.

## Candidate binding and read order

The candidate is based on `e9ff12e4394c855e5a15656b0d74e26bc5f46a02` and is
bound to:

```text
freezeSha256          d742d2ee5a1f793a73af585c5c7c9a0a18bf1e7972b26d3963a8d54de5a4a0cd
candidateManifest     4349cf91ef5d29d46a649647b8c5964fa5303894f23e3f93dd1b6d8c8dabb797
projectSourceRevision r3-p2-p3-implementation-candidate/2026-09-09
tuple                 Node 24.20.0 / pg 8.23.0 / PostgreSQL 17.10
```

Read `AGENTS.md`, `docs/roadmap.md`, `docs/index.md`, the Engineering Method,
the Repository Method, `docs/tasks/r3.md`, the P2/P3 adjudication, the
P4-A-scoped qualification receipt and the exact subject paths below. Treat the
task packet and this brief as routing, not as proof or Product authority.

The P2/P3 root-tuple receipt remains a prerequisite qualification artifact.
This review uses
`docs/evidence/4f/4f-r3-p4-a-project-qualification-receipt.json` so its verdict
and observed falsifiers cannot be confused with the P2/P3 claim set.

## Exact subject

```text
apps/hub/project-migrations/001_budget_analyzer_read_model.sql
apps/hub/project-migrations/002_budget_analyzer_observation_gap.sql
apps/hub/src/project/read-model.ts
qualification/4f/r3-root-tuple/run.mjs
tests/implementation/r3-project-read-model.test.mjs
```

The review may inspect directly related migration-runner and candidate-freeze
checks only when needed to test the protected claims. Do not expand into MAR
implementation except to verify that this slice has not made queue state or
MAR state a Project authority.

## Protected claims and red falsifiers

1. **First-load drift fails closed.** A source-binding change between a
   partial observation and a later observation cannot commit supported truth,
   including while the first generation is still working. A fixture that
   stages revision A and completes revision B is red.
2. **Working state is not current truth.** `working_generation`,
   `working_cursor`, `observation_kind` and the active `last_gap_kind` are
   observable recovery facts, while current rows remain limited to committed
   generations. A recovery reader that can mistake working data for current
   data, cannot distinguish the active missing/ambiguous gap, or receives a
   stale gap reason after valid recovery/drift handling is red. A first partial
   observation when `committed_generation = 0` must also report `UNKNOWN`
   freshness and coverage; there is no prior supported truth to call stale or
   partial.
3. **A gap is honest degradation.** `MISSING` or `AMBIGUOUS` records preserve
   committed rows and generation, discard only uncommitted pending work, set
   supported state to `UNKNOWN`, expose the gap kind while that degradation is
   active, and require a full observation to recover. A valid new observation
   or drift rejection clears the active gap reason. A partial full-snapshot
   rebaseline must keep `UNKNOWN` and the active gap reason until commit.
   The function result must report the same degradation state as the persisted
   read state; a returned `STALE` result while the state is `UNKNOWN` is red.
   Applying a gap as zero, an empty complete snapshot, success, rollback or
   terminal truth is red.
   The current fail-closed mechanism rejects an empty `COMPLETE` payload; any
   future support for an empty source requires an explicitly attested
   producer/Project contract outside this P4-A slice.
4. **Gap recording is owned and bounded.** The Project capability validates
   the checkpoint revision and observation identity, rejects stale writers,
   handles an exact replay idempotently, rejects digest conflict, and exposes
   no general table-DML path or public function execute privilege. A direct
   DML or unprivileged bypass is red.
5. **Lineage and authority remain intact.** The migration successor is covered
   by Project checksum/ledger custody, the native runner and source revision;
   Project capability roles are database-derived `NOLOGIN` roles. The
   qualification uses transient per-capability login adopters to exercise the
   `SET ROLE` boundary, while product runtime credential provisioning remains
   a P2 dependency; public database `CONNECT` is revoked. No new database,
   queue authority,
   cross-owner transaction, live source or effect route is introduced. A silent
   custody or owner split is red.

Classify every concrete finding as exactly one of:
`METHOD FINDING`, `PRODUCT / PLAN GAP`, `LOCAL EXECUTION GAP`, or `NO FINDING`.
For each material finding state evidence, failure mode, materiality, smallest
owner/stage, protected property, stop condition and required re-evaluation.
Keep uncertainty explicit and distinguish observed facts from inference.

The controlled fixture invokes the Project observation-apply, gap and
committed-read adapters through transient per-capability login adopters that
adopt the database-derived `NOLOGIN` roles, exercises both `MISSING` and
`AMBIGUOUS` gaps, rejects empty `FULL_SNAPSHOT` input, and reads a canonical
business date under a positive-offset timezone. Direct SQL is retained only
for negative privilege, catalog, capability-level duplicate, stale and
conflict probes. The fixture proves controlled capability adoption, not
production credential provisioning. The RF-05/RF-08 candidate
attestation binds the candidate and its own review brief; this P4-A brief and
its scoped receipt are separately hash-bound by the review wrapper and are not
claimed as attestation fields.

## Explicit non-claims

This checkpoint does not prove or authorize MAR single-flight/coalescing,
settlement, handler quiescence, `R3-P2`, `R3-P3`, `R3-P6`, `R3-P7`, a live
JobRun, Sankhya/source/provider/model execution, external effects, a served
Release, product runtime role provisioning, deployment, publication, merge or
R4+ work. It must not consume or
derive meaning from `BLD10_PREVIEW_SUBJECT_DIGEST`.

The review is read-only. Do not edit files, install dependencies, call
providers, run production effects, create or remove Docker images, push,
create a PR, merge, or ask another reviewer. Reviewer output is advisory
Evidence; the Lead adjudicates it and may route the smallest unresolved owner.
