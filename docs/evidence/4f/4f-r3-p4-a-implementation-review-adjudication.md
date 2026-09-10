# R3 P4-A Project observation-integrity review adjudication

> **Status:** ADJUDICATED / OPUS+AGY FINDINGS ROUTED AND CORRECTED / CURRENT P4-A QUALIFICATION PASS / FRESH REVIEW REQUIRED
> **Authority:** Lead adjudication under the current R3 implementation grant
> **Scope:** P4-A Project observation-integrity and recovery-facts slice only

## Candidate and review inputs

The reviewed implementation is the bounded P4-A slice routed by the [review
brief](4f-r3-p4-a-implementation-review-brief.md): Project migration `002`,
the Project read-model adapter, the first-generation drift correction and the
controlled root-tuple fixture and the P4-A-scoped [qualification
receipt](4f-r3-p4-a-project-qualification-receipt.json). The candidate is
bound to the current base `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`; the
freeze and receipt metadata are maintained by the roadmap/candidate-freeze
reconciliation.

The AGY correction-review result for the pre-reconciliation final
implementation candidate is retained outside the repository at
`/tmp/conexus-r3-p4-a-review-20260909-final-final/conexus-review-result.json`
with SHA-256
`5fb967366e6b9bb1a60df9bccc647f98190a56e6360fabe13147f7788ff47084`.

| Lane | Result | Classification |
| --- | --- | --- |
| AGY Gemini `1.2.0`, conversation `ac65ed47-cd1f-4507-8592-9f9556a96271` | `NO FINDING` on the final corrected candidate | Reviewer Evidence only |
| Claude Fable, session `64220e6c-3a9d-4c82-8c65-92303612238c` | exited `1` without a report | `LOCAL EXECUTION GAP`; no closure or convergence claim |

The one authorized replacement was also executed fresh on 2026-09-10 as
Claude lane `opus`, requested model `fable`, `xhigh`, plan/read-only, session
`150cb654-7e17-4171-a73d-3d7eda14b85c`. It produced wrapper status
`INCOMPLETE`, `inputDrift: false`, exit `1`, empty stderr and no parsed report
or verdict. The machine result is retained outside the repository at
`/tmp/conexus-r3-p4-a-fable-replacement-20260910/conexus-review-result.json`
with SHA-256
`55ec8e973a1f7f2ffc847c9913a3dd88347e3358b37ebf28389c099ebe0ec9ad`.

After that attempt, the roadmap/index/task status projection was reconciled
and the candidate was re-frozen. This was a governance-only change: the P4-A
subject implementation bytes, tuple and qualification output did not change.
The AGY result above therefore remains supporting Evidence for the same
protected implementation claims, but its original candidate/attestation
digest is historical to the pre-reconciliation freeze and is not represented
as a current two-lane closure artifact.

The review sequence found and corrected three concrete defects: discarded gap
reason, stale gap reason after recovery/drift, and partial rebaseline returning
`STALE` while the active gap required `UNKNOWN`. The next Opus+AGY review found
two further material defects: a first partial observation could still report
`STALE/PARTIAL` with no committed truth, and fixed Project role names could
cross database boundaries in one PostgreSQL cluster. Correction 2 now derives
initial degradation from committed truth, derives role identities from the
database name and revokes public database `CONNECT`; the controlled
qualification passes the discriminating sequence, adapter path and ACL probes.
One fresh correction review remains required.

## Opus correction review

The fresh Opus lane was executed against the pre-correction candidate with
brief SHA-256 `0d8d56d3dd337f28fea69cccbe4a6980d6f2385ebc98322804da2c9e3813b17a`,
root-tuple receipt SHA-256
`912aa607518df09175152d68f34521d168348a7b64034f17ddc36b300242ef4d`, and
attestation SHA-256
`4cd6fd8002cfd388e9a4a06f1af854994b7b0d41a878a60c861fb1ee7008717d`.
Claude Code `2.1.257`, requested alias `opus`, resolved canonical model
`claude-opus-5`, `xhigh`, fresh plan/read-only session
`01e39ff9-8c47-408d-af8f-f60ce685251e`, completed with a material stop
verdict. The machine result is retained outside the repository at
`/tmp/conexus-r3-p4-a-opus-replacement-20260910/conexus-review-result.json`
with SHA-256
`b272a61682e2ed71a27a3c1c47ea7dbd110ea770523c48481b65331906bc8cba`.

The surviving findings were:

1. **LOCAL EXECUTION GAP — public function privilege.** The newly created
   wrapper inherited PostgreSQL's default `EXECUTE` to `PUBLIC`, allowing the
   query role to reach the merge capability. This stopped P4-A acceptance.
2. **LOCAL EXECUTION GAP — state dominance.** After drift, an incomplete full
   rebaseline could persist and return caller-declared `STALE/PARTIAL` despite
   the degraded state being `UNKNOWN`.
3. **LOCAL EXECUTION GAP — root cause.** The wrapper-over-legacy split expressed
   one Project meaning twice and made both defects reachable. The correction
   integrates the rule into the single merge function and preserves its ACL.
4. **METHOD / proof-surface routing.** The source-text test is retained only as
   a shape guard; observed ACL/state assertions now live in the controlled
   qualification receipt. Candidate-graph inclusion and durable reviewer
   output remain later repository-proof-owner work and are not counted as
   current P4-A closure.

## Fresh Opus+AGY correction review

The second fresh correction review ran on 2026-09-10 against the corrected
candidate before Correction 2. The wrapper bound brief SHA-256
`a8857d488c14f1d111c85a85244156aa3ef6c39524db501796c680b5bbc8cdcb`, scoped
qualification receipt SHA-256
`416a1867270ea74d4ba499858847eb936613558e07280b349fbb5b6f48421520`, and
attestation SHA-256
`47534b16c210f16486dc1c45d7c4cd6802fbce7b84e70f99e74082f2c87399ef`.
The wrapper result is retained outside the repository at
`/tmp/conexus-r3-p4-a-opus-agy-correction-20260910-v2/conexus-review-result.json`
with SHA-256
`a3eaeffa313638b0d23d7160560886ab53846f6717df17ebf69dfc3802631503`.

| Lane | Result | Classification |
| --- | --- | --- |
| Claude Opus `2.1.257`, canonical `claude-opus-5`, session `836cf3be-db54-4996-8c7d-190960fd9003` | `P4-A NOT ACCEPTABLE AS FROZEN` | Reviewer Evidence; two stop findings |
| AGY Gemini `1.2.0`, conversation `a8b56fca-c84e-4a04-b653-0eca1f1780c5` | `NO FINDING` | Reviewer Evidence only |

Lead accepts Opus findings 1 and 2 as material local execution gaps. The
remaining Opus observations are not current P4-A stops: the adapter proof is
now exercised by the next qualification, the RF-05/RF-08 attestation is
explicitly candidate custody while P4-A inputs are wrapper-bound, and the
fixture's aborted partial sequence is relabelled without claiming a commit.
The role correction is a bounded Project migration/provisioning repair, not a
new shared database or cross-owner authority.

## Lead decision

1. **P4-A implementation:** the prior controlled proof pass is superseded by
   the Opus+AGY findings. Correction 2 is implemented and the fresh
   PostgreSQL qualification passes the first-observation, mid-recovery drift,
   adapter, ACL and isolation-boundary probes. P4-A acceptance remains stopped
   pending one fresh independent review of Correction 2.
2. **Material review status:** the Fable attempts remain incomplete due the
   known external `429/out_of_credits` cause. Operator-authorized Opus is the
   explicit Fable fallback; AGY remains the independent second lane. The next
   review must use Opus+AGY, without calling Fable or claiming convergence from
   the prior round.
3. **P4-B:** remains `STOP / SPLIT PREREQUISITE`. MAR must first accept the
   exact current-occurrence/coalescing coordinate, durable settlement vocabulary
   and positive handler-quiescence evidence. Project P4-A does not invent those
   semantics or consume queue state as authority.
4. **Downstream:** P5, R3 closure, live JobRun/source/provider/model work,
   deployment, publication, merge and R4+ remain paused.

## Global Maximum decision

The sustainable decision is to keep recovery facts local to the Project owner,
retain the bounded successor-field correction, scope Project credentials to the
database identity, and isolate the actual blockers
rather than introducing a generic recovery record, scheduler, workflow engine,
cross-owner transaction or queue-derived authority. The remaining blockers are
therefore assurance/authority items, not a reason to expand the Project slice:

```text
P4-A product/implementation risk  = correction 2 implemented; root qualification PASS; fresh review required
P4-A closure assurance             = Opus found material defects; AGY no finding; Fable unavailable; no current convergence
P4-B semantic readiness            = MAR contract missing; STOP / SPLIT
R3 closure                         = not admitted until P4-B and required proof rows close
```

This is a bounded package decision, not a green `R3-P1..P7` verdict. The
operator may later waive the exact review requirement, but no waiver is
inferred here.

## Fresh Opus+AGY correction review — v6

The review ran on 2026-09-10 with Opus as the explicit operator-authorized
Fable fallback and AGY as the independent second lane. The wrapper result is
retained outside the repository at
`/tmp/conexus-r3-p4-a-opus-agy-correction-20260910-v6/conexus-review-result.json`
with SHA-256
`33ee191da6cf7192a472ab3f2aa9914a282fda37a7a986717a055439d606e918`. The
review input had no drift. Opus session
`a22fa914-dcfe-4d26-bc31-3fff1d6922f0` returned two stop-class findings and
four non-stop findings; AGY conversation
`0fdbbac6-d10c-401c-a715-a17146a5f1cb` returned no material finding. No Fable
call was made.

Lead accepts the following findings and applies one bounded correction batch:

1. **Runtime credential adoption — LOCAL EXECUTION GAP / P2 route.** The
   capability roles are intentionally `NOLOGIN`, but the previous fixture
   adopted them from the DDL-capable DSN and there was no product credential
   adoption path. The fixture now provisions transient, per-capability login
   adopters, grants only the corresponding capability role and proves
   `session_user` versus `current_user` after `SET ROLE`. This makes the
   controlled ACL evidence honest and reproducible. It does not invent Product
   credential provisioning; P2 + Identity & Access still own that contract and
   downstream consumption remains stopped.
2. **Aggregate receipt provenance — METHOD FINDING / P6 route.** The retained
   P2/P3 aggregate JSON is now explicitly marked
   `HISTORICAL_PROJECTION_NOT_CURRENT_PROOF`. It is context only; matching
   freeze and manifest values do not make a record produced by separate runs a
   reproducible aggregate. P6 must produce one aggregate command/receipt bound
   to its producing subject bytes before current P2/P3 or downstream proof
   consumption.
3. **Duplicate coordinate proof — LOCAL EXECUTION GAP / corrected.** Duplicate
   `budget_ref` validation now exists inside the Project security-definer
   capability, and the fixture probes it directly under the adopted sync role;
   the adapter guard remains a separate observation.
4. **Semantic-only drift — PRODUCT / PLAN GAP / routed and partially proved.**
   The fixture now rejects a semantic-only change while preserving the source
   coordinate. That is a fail-closed falsifier only; accepting a new semantic
   meaning still requires the Project/source producer contract and acceptance
   record already routed before P5.
5. **Receipt evaluation semantics — METHOD FINDING / corrected.** Per-row
   literal PASS labels were removed. The receipt now records observations from
   one all-or-nothing assertion gate as `proofGate.status =
   PASS_AFTER_LINEAR_ASSERTION_GATE`; its top-level verdict remains the
   qualification result.
6. **Canonical business date — LOCAL EXECUTION GAP / corrected.** The adapter
   mapper now accepts only the SQL `::text` date representation and no longer
   contains the unsafe JS `Date` to ISO conversion branch. Positive-offset
   qualification remains in the receipt.

The current P4-A implementation is therefore locally corrected and its scoped
qualification passes. P4-A acceptance remains pending one fresh review of this
correction batch. The P2 runtime adoption contract, P2/P3 aggregate receipt
provenance, semantic acceptance, empty-source attestation and P4-B MAR owner
facts remain explicit open routes; none is silently absorbed into P4-A.
