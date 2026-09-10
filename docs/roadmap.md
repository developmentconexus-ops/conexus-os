# Conexus OS Roadmap

This is the sole mutable authority for the current stage, allowed work, status
and exact next action. Product, architecture, contract and proof meaning remain
in their named owners; this file routes to them.

## Program state

This compact baseline is retained because repository checks and fresh-session
bootstrap consume these phase rows. Historical detail belongs in the linked
owners and Evidence.

| Phase | Status | Preserved result | Reopen trigger |
| --- | --- | --- | --- |
| 3A | CLOSED | Whole-product authority reconciled | Material Product/owner contradiction |
| 3B–3K | CLOSED | Architecture families accepted | Material invariant or boundary falsifier |
| 3L | CLOSED | Packages A/B/D closed and C/E safely deferred | Named qualification trigger |
| 3M | CLOSED | Recovery/reactivation ratified | Material recovery/topology/effect falsifier |
| 3N | CLOSED | Architecture verification survived | Material architecture falsifier |
| 3O | CLOSED | First Budget Analyzer proof contract accepted | Material contract/downstream falsifier |
| C-018 | RATIFIED / OPERATOR RATIFIED | Product architecture continuity ratified | Material Product/architecture falsifier |
| 4A–4C | CLOSED / OPERATOR RATIFIED | Product surface, wire contract and frontend interaction authority preserved | Material owning-authority falsifier |
| 4D | OPEN / R3 PAUSED / PRIOR BOUNDED GRANT HISTORICAL | Prior R3 custody corrections, bounded grant and operator waiver are preserved for their exact historical scopes; no current R3 implementation increment is admitted | Named owner reconciliation plus explicit operator admission of one bounded increment, or a material candidate/owner/dependency/contract/proof falsifier |
| 4E | CLOSED(R1) / OPERATOR APPROVED | R1 whole-system coherence preserved | Material composed-flow contradiction |
| 4F | R1 + R2 + RB INTEGRATED / BLD-10 COMPLETE / R3 HOLD-REPLAN / R4+ PAUSED | Integrated realization Evidence and BLD-10 projection preserved; R3 implementation/review/qualification is paused after the third-review stop | R3 owner/dependency/proof reconciliation or protected-claim falsifier |
| 4G | CLOSED ON PRIOR SUBJECT | Prior readiness result preserved | Material readiness finding on a current tranche |
| Product implementation | BLD-10 COMPLETE / R3 IMPLEMENTATION PAUSED FOR ROOT-CAUSE REPLAN / R4+ PAUSED | BLD-10 projection remains non-ready; no R3 implementation, review or qualification may proceed until the replan is admitted | R3 owner/dependency/proof reconciliation or protected-claim falsifier |

Continuation readiness = DOCUMENTATION PLANNING OPEN / PRODUCT EXECUTION PAUSED / R3 HOLD PRESERVED

## Current grant

On 2026-09-10, the operator approved platform-first local delivery planning,
the six-delivery sequence below, and the existing repository format: this
roadmap owns the complete execution map; each delivery has a detailed task
packet under `docs/tasks/`; `docs/index.md` routes to the owners. This supersedes
the earlier documentation-only write envelope for planning purposes. Allowed
work is documentation in this roadmap, the index and delivery/R3 task packets,
read-only inspection of their dependencies, and documentation/link/diff checks.
Do not create a parallel Superpowers spec/plan hierarchy for this program.

The earlier R3 proof-custody reconciliation remains preserved. This planning
approval does not restore R3 `READY`, accept its candidate, authorize P6,
Product implementation, implementation tests, material closure review,
qualification, live JobRun/Sankhya/provider/model execution, deployment,
publication, commit, push, PR or merge. Preserve every pre-existing dirty path.
Future execution needs the exact bounded contract and grant recorded here;
routine tasks inside that grant do not each create another approval gate.

The prior operating-model publication grant, BLD-10 implementation grant and
R3 operator admission waiver remain historical authority for their exact scopes:
[execution result](evidence/4d/4d-development-operating-model-execution-result.md),
[execution goal](evidence/4f/4f-autonomous-roadmap-execution-goal.md), and
[R3 waiver](evidence/4f/4f-r3-rf05-rf08-operator-admission-waiver.md). They do not
start execution or claim R3 closure. The autonomous Goal is paused and cannot
run overnight under the current board.

## Integrated baseline

- PR [#71](https://github.com/developmentconexus-ops/conexus-os/pull/71) is
  merged at `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`.
- Post-merge [Verify run 34298508264](https://github.com/developmentconexus-ops/conexus-os/actions/runs/34298508264)
  succeeded on that SHA.
- Local dirty changes are candidate Evidence only; they are not publication
  authority.

## Execution board

The board is the operator-facing map. Detailed execution instructions live in
stage task packets, while status remains here.

### Approved local platform delivery design

Conexus is the Product. The operator's first usable target is local platform
use on their PC, initially through localhost. `conexus.fun` remains the accepted
public identity, with access/installation activation after the local journey.
Local Hub/web use does not replace the accepted remote Mastra/E2B Builder
substrate or silently authorize provider calls.

The local release includes app construction/evolution, Project-owned reads and
writes, external read/effect capabilities, managed automation, and Brain
Discovery/publication/feedback. Business Product Agents are a later phase;
Builder and platform-assisted Brain cognition remain in the local target.
Detailed Builder prompt/skill/model-behavior comparison belongs to L6, after
the platform execution paths exist. Earlier deliveries still require enough
instruction/context correctness for their own Builder claims.

An app is a proof consumer, not the platform scope or a required business
domain. Budget Analyzer code and historical proof are preserved; reproducing
that app is not the operator's completion criterion for this local delivery.
The broader accepted F1 contract remains intact. This is delivery sequencing,
not a declaration that the entire historical F1 surface is implemented.

| Delivery | Observable outcome | Status | Detailed task / dependencies |
| --- | --- | --- | --- |
| L1 | Local login → Project → real Builder candidate → usable isolated Preview → requested change visible | `PLAN WRITTEN / T1 OWNER ADMISSION REQUIRED` | [Local build and Preview](tasks/l1-local-build-preview.md); selected producer/viewer proposal and T1–T5 sequence; reconcile record ownership and prove browser feasibility before admitting implementation |
| L2 | Builder-authored apps read and mutate their own persistent data through admitted contracts and SDKs | `PLANNED / CONTRACT DETAIL REQUIRED` | [App data and SDKs](tasks/l2-app-data-sdk.md); L1 source/artifact seams, Project/I&A/Registry capabilities; R3 only for claims actually consumed |
| L3 | Publish locally, use the app under independent access, preserve versions and evolve it | `PLANNED / CONTRACT DETAIL REQUIRED` | [Local publication](tasks/l3-local-publication.md); L1 artifacts and L2 runtime contracts; reuse R5/R6 owners |
| L4 | Apps invoke qualified external reads and effects through Connection/Gateway contracts | `PLANNED / CONTRACT DETAIL REQUIRED` | [External integrations](tasks/l4-external-integrations.md); L2 operations + L3 exact serving; provider-specific adapter/qualification |
| L5 | Managed jobs execute admitted operations with defined restart, cancellation and duplicate behavior | `PLANNED / MAR-GATEWAY OWNER PREREQUISITE` | [Automations](tasks/l5-managed-automations.md); L3/L4; preserve R3/P4-B and reconcile effectful recovery |
| L6 | Guided Brain Discovery, human publication, Project adoption and Builder-initiated knowledge proposals | `PLANNED / CONTRACT DETAIL REQUIRED` | [Brain and Builder knowledge](tasks/l6-brain-builder-knowledge.md); existing R2, L1 Builder and L4 read capabilities; L5 is not automatically a technical dependency |

The order is the approved delivery priority. Contract preparation may precede
its delivery consumer; it is not permission for concurrent implementation.
The old R3→R7 chain below continues to govern its original analytical slice.
It is not automatically a prerequisite for every L1–L6 capability. Any changed
consumption edge must be resolved in the smallest owner before code uses it.

### Packet and completion rules

- Each task packet contains its design, current source/contract references,
  dependency decisions, implementation work breakdown, falsifiers and exit
  criteria. Mutable status and execution grants stay here.
- L1 has a selected implementation proposal and ordered T1–T5 tasks; its
  owner and feasibility checkpoint remains open. L2–L6 are delivery planning
  packets, not mechanical code instructions yet.
  Before a code increment is admitted, complete exact interfaces, file/write
  envelope, owner decisions, commands and proof subject in the same task file.
  Do not invent APIs or mark missing owner decisions complete to fill a plan.
- SDK build-time and runtime seams follow the existing ownership contract.
  SDK implementation lands with its real consumer; neither app code nor the
  SDK may inherit privileged build credentials or bypass Gateway admission.
- Reuse the locked Product/4C interaction and accepted technology decisions.
  Mitra is the primary comparative reference; Factory informs Builder work,
  verification and handoffs. Research is consulted for a named uncertainty,
  never copied over a current Conexus owner.
- Use affected checks during implementation and the complete applicable Linux
  candidate/CI graph at closure/publication, including R1C-14 where required.
  Real composed behavior must have real composed proof; fixtures retain their
  narrower claims. Every live proof requires its own exact authority.
- Existing risk-triggered review and termination laws apply; no new review per
  checkbox. A valid non-blocker gets a why-safe deferral and revisit trigger.

### Task reading and research protocol

Use the task's targeted reading table before broad source exploration. Each
row distinguishes an accepted decision, the exact section to read, the open
question and the result needed to close that question. Section titles are
locators, not an instruction to preload every linked document.

1. Recover grant/status here, then read the task and its named owner sections.
2. Confirm the accepted decision in `docs/decisions/index.md` or its explicit
   downstream owner disposition. Do not reopen a selected mechanism merely
   because research contains an older or different preference.
3. Inspect the actual producer, consumer and existing proof for the named
   question. Record implemented versus fixture-only versus absent wiring.
4. For Mitra/Factory comparisons, use the task's study sections, extract the
   relevant pattern and state how current Conexus authority preserves, adapts
   or rejects it. Research labels such as ADOPT are not fresh execution grants.
5. For framework/API uncertainty, read the applicable skill, exact installed
   package/lock/configuration, embedded documentation and types/source. Query
   Context7/current official documentation for the remaining question; compare
   it with the adopted version before selecting an API. A research request is
   not authorization to install dependencies or call a real provider.
6. Record only the answer, source/version, implication and falsifying test in
   the existing task/owner. If evidence is insufficient, name the exact missing
   contract or bounded probe. Stop researching when implementation choices for
   the admitted increment are mechanical; do not repeat whole-product studies.

Apply this protocol across L1–L6. Mastra guidance applies to Builder work in
L1 as well as L6; provider documentation applies to L4; PostgreSQL/queue/browser
claims use their respective adopted source and official references. Execute
probes only under their actual runtime/resource grant.

### Broader F1 coverage and follow-on routes

L1–L6 does not silently delete the broader [Product scope](product/contract.md#25-f1--current-product-scope).
Create/import/duplicate lifecycle and contextual assistance route through L1;
Data/Capabilities inspection and private Product bytes through L2; Versions,
access and rollback through L3; provider adapters through L4; job controls
through L5; Brain/AnalyticQuery applicability through L6. Each packet must
record inclusion or a justified follow-on disposition before local-release
closure; a listed route alone is not an implemented capability or a deferral.
Activity, errors and truthful cost/usage are cross-cutting within the delivery
that emits them. Optional Areas and other unallocated F1 surfaces remain a
Product scope reconciliation in L1, not an assumed removal.

Business Product Agents and `conexus.fun` activation follow the local release.
First-production backup/restore/emergency-stop requirements remain at their
accepted operations owner. Using real external effects locally still requires
the applicable effect and recovery protections; localhost is not a waiver.
No dates or percent-complete estimates are inferred from stage numbers.

### Retained realization stage map

| Stage | Outcome | Status | Dependency / route |
| --- | --- | --- | --- |
| R1 | Auth, account, Workspace, Project and baseline foundation | `DONE / INTEGRATED` | Accepted R1 owners and retained closure Evidence |
| R2 | Brain, Connection and Gateway realization | `DONE / INTEGRATED` | R2 owners and retained stage packet |
| RB | Builder and governed build-loop realization | `DONE / INTEGRATED` | Builder owner and retained RB packets |
| R3 | Project read model, governed sync/admission contract and cursor/merge semantics | `HOLD / REPLAN REQUIRED / P2-P3 CANDIDATE PRESERVED / P1 HOLD-OPEN OWNER-NOT READY / P4-A NOT ACCEPTED / P4-B STOP-SPLIT / R3 CLOSURE OPEN` | [`tasks/r3.md`](tasks/r3.md), [third-review stop adjudication](evidence/4f/4f-r3-third-review-stop-root-cause-adjudication.md), [P2/P3 decision](evidence/4f/4f-r3-p2-p3-owner-decision.md), [P4-A adjudication](evidence/4f/4f-r3-p4-a-implementation-review-adjudication.md), [P4-A qualification receipt](evidence/4f/4f-r3-p4-a-project-qualification-receipt.json), [root-tuple receipt](evidence/4f/4f-r3-p2-p3-root-tuple-qualification-receipt.json); the post-v6 candidate batch is preserved but unaccepted, v7 was interrupted without a verdict, historical aggregate provenance remains open, Product runtime adoption remains P2 + Identity & Access work, P4-B remains a MAR owner prerequisite, and no new review/qualification is allowed until one bounded increment passes the P1 gate and receives explicit operator admission |
| R4 | Static registered Query artifacts and Product-owned result API/boundary | `PLANNED / BLOCKED BY R3 CLOSURE` | R4 owner route; no unclosed R3 contract consumption |
| R5 | Published Application realization | `PLANNED / BLOCKED BY R4` | Artifact producer and serving owner |
| R6 | Release, Promotion, serving and `SERVED_VERIFIED` | `PLANNED / BLOCKED BY R3–R5` | Release/deployment owners and exact serving pins |
| R7 | Real JobRun, governed Sankhya access and live reconciliation | `PLANNED / BLOCKED BY R6` | Managed execution and live-source owners; separate live authority |

### Current package index

Package status is maintained only in this table. Package detail, owners,
dependencies, proof rows, falsifiers and review routing are in
[`docs/tasks/r3.md`](tasks/r3.md).

| Package | Delivery | Status | Dependency |
| --- | --- | --- | --- |
| `R3-IMP-P1` | Freeze owner map, non-consumption boundary and exact R3 contract | `HOLD / OPEN OWNER / NOT READY` | The reconciliation is durably recorded, but no single increment satisfies all eight conditions; future `READY` requires the same named increment to pass the gate and receive explicit operator admission |
| `R3-IMP-P2` | Admit Project/MAR ownership and migration/runtime boundary | `CANDIDATE PRESERVED / HOLD-REPLAN / ROOT-TUPLE PROVENANCE OPEN / RUNTIME CREDENTIAL ADOPTION OPEN` | Physical/catalog facts are retained as candidate Evidence, but P1 reconciliation and owner contracts precede further consumption |
| `R3-IMP-P3` | Implement Project read model, cursor and atomic merge | `CANDIDATE PRESERVED / HOLD-REPLAN / P4-A NOT ACCEPTED` | Current qualification remains scoped Evidence only; no fresh review or downstream proof consumption until the replan is admitted |
| `R3-IMP-P4` | Implement recovery, quiescence, missing-observation and drift behavior | `HOLD / REPLAN REQUIRED / P4-B STOP-SPLIT` | Project corrections are preserved; P4-A acceptance, P2 runtime adoption, P6 provenance and P4-B MAR contract remain open |
| `R3-IMP-P5` | Produce controlled `3N-V18` and `3N-V19` fixtures | `PLANNED` | P4 |
| `R3-IMP-P6` | Assemble candidate packet and reconcile proof rows | `PLANNED` | P2–P5 |
| `R3-IMP-P7` | Close R3 or route the smallest unresolved owner | `PLANNED / GATE` | P6 and applicable closure review |

L1–L6 task packets now route platform delivery planning. The original R4
analytical-slice execution remains dependent on its admitted R3 prerequisites;
the new packets do not implicitly admit that implementation.

### Review and parallelism

Packages may run in parallel only after their contracts and dependencies are
stable and their write envelopes are disjoint. Shared owner files and
integration have one integrator. Review grouping is risk-based: routine
mechanical packages receive targeted proof and Lead review; material owner,
trust-boundary or structural changes receive a checkpoint; stage closure uses a
candidate-wide proof and two fresh independent lanes unless an exact waiver
applies. Corrections repeat review only when the protected property or proof
reliability changed materially. See the [Engineering Method](development/engineering-method.md)
and [review routing](../.agents/skills/conexus-development/references/review-and-delegation.md).

## Exact next action

**Hand off the written L1 proposal to the next operator-requested session at [T1](tasks/l1-local-build-preview.md#t1--reconcile-and-accept-the-selected-ownerwire-contract). Recover this grant before acting. Request the exact bounded authority for the owner/design review and browser-feasibility probe; resolve preparation-record ownership, transport/Registry amendments and R1/wire custody before admitting T2–T5. Do not repeat a whole-platform survey or treat this planning handoff as a code/live grant. Keep R3 P1 `HOLD / OPEN OWNER / NOT READY`, its candidates and proof-custody rules intact; no P6 or Product execution is admitted.**

P1’s prior documentation projection is reconciled to a durable hold and is not
ready for consumption. P2 and P3 have a preserved implementation candidate with
controlled Project facts, but current aggregate root-tuple provenance and
Product runtime capability adoption remain open. The P4-A correction batch has
scoped qualification Evidence but no acceptance; v7 has no verdict. P4-B,
dependent recovery, live proof and R3 closure remain open. A controlled R3
fixture cannot become R7 live Evidence, and a prior waiver cannot be
generalized to a future material closure.

## History and routing

Locked semantics and reopen routes remain in [`docs/decisions/index.md`](decisions/index.md),
accepted Product/architecture/contract owners and retained Evidence. The R3
selection, freeze, review and MAR packets remain historical records routed from
[`docs/index.md`](index.md); they are not copied into the current board.
