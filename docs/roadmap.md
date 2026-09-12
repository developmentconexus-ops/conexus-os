# Conexus OS Roadmap

This is the sole mutable authority for the current stage, allowed work, status
and exact next action. Product, architecture, contract and proof meaning remain
in their named owners; this file routes to them.

## Current direction and tracking

On 2026-09-11, the operator approved recording the directed consolidation of
the smaller Conexus MVP. Keep the selected direction and useful implementation
and proof. Clarify the remaining decisions through brainstorming before
resuming implementation. This is neither a restart of all planning nor a claim
that the complete implementation plan is ready.

The [consolidation agreement](tasks/builder-first-app.md#directed-mvp-consolidation)
records scope, decision gaps, proof limits and how to continue. R1–R7 and L1–L6
are historical delivery plans, not the pilot execution queue. Their code,
semantic constraints and evidence remain subject to concrete dependency checks.
The retained phase rows below do not create global pilot prerequisites.

| Work | Current state | Observable result needed |
| --- | --- | --- |
| Record the agreed direction and continuation boundary | Recorded by this update | Roadmap, current task and index identify the same next action |
| Consolidate MVP scope and distinguish its first increment | In progress; internal Metalnobre use clarified on 2026-09-12 | One user journey with explicit included and deferred behavior, plus only the unresolved questions |
| Bind minimum architecture to that journey | Pending consolidation | Process, source, data and credential boundaries; reuse and exact owner refinements identified |
| Specify high-impact practical validations | Pending; execution not admitted by this update | Each unresolved risk has a real consumer, expected result, falsifier and bounded execution proposal |
| Reconcile the documents that steer implementation | Initial routing clarified; broader reconciliation pending | Current entry documents agree; historical plans cannot silently resume; useful code and proof remain available |

This approval admits the tracking update and targeted documentation checks.
Product implementation remains paused during consolidation. It does not restart
Registry work, the interrupted migration review, historical qualification or
live provider experiments. Earlier grants below preserve chronology; they do
not override this continuation boundary. Full repository cleanup is not a
prerequisite for the first app.

On 2026-09-12, the operator started consolidation and clarified the immediate
target as internal Metalnobre use, not a product ready for sale. The
[internal-use clarification](tasks/builder-first-app.md#internal-use-clarification)
records that priority and the comparison with the pasted GPT Pro proposal.
The operator wants practical testing next. This planning continuation does not
yet specify or admit a new live experiment or approve a runtime implementation.

The operator then requested GitHub publication so GPT Pro can inspect the local
state. This admits a commit and push to `analysis/internal-mvp-2026-09-12` for
analysis, including the current planning, compiler candidate, migration
correction and their focused tests. It does not admit merge, deployment,
implementation resumption or candidate acceptance. The existing local parent
commit is preserved without rewriting history. The isolated Registry draft and
temporary experiment files are not included. Review the
[snapshot verification limits](tasks/builder-first-app.md#analysis-snapshot-verification)
before treating any code on that branch as ready.

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

Continuation readiness = INTERNAL PILOT / DIRECTED MVP CONSOLIDATION / DIRECTION RECORDED / IMPLEMENTATION PAUSED

## Current grant

On 2026-09-11, after approving a smaller internal pilot, the operator approved
one bounded architect/arena design round and a practical-proof plan for the
first Builder-created application. The current task is
[`tasks/builder-first-app.md`](tasks/builder-first-app.md). It owns the design,
comparison, implementation detail and exact experiment proposal; this roadmap
owns admission and status. Reuse the existing investigation and compare at
least two structurally different implementations of the first build/Preview
path. That design round is complete. The subsequent operator approval accepts
the proposed pilot direction and admits preparation of its first compiler
experiment, not the broader Product implementation.

Allowed work is read-only source/configuration/owner inspection, updates to
this roadmap, index and current task, and targeted documentation checks. Local
preparation may create a synthetic app profile and compiler recipe only in
`/tmp/conexus-app-compiler-prep-1RGMat`, generate its lockfile from the existing
offline npm cache, and render/hash the recipe with the installed SDK. This
does not install host dependencies or run app builds on the host. No additional
arena is needed without a new falsifier.
No live model/E2B/Sankhya call, template publication, dependency installation,
container creation, Product code/schema/contract change, deployment, commit,
push, PR or merge is admitted by this design round. State exact resources,
effects, limits and proof claims before admitting the executable experiment.
Agent-assisted design is not live Product-model proof or closure review.

The subsequent operator message, "Pode consumir creditos sem problema",
admits the concrete publication and compiler experiment just proposed in
[the prepared experiment](tasks/builder-first-app.md#prepared-compiler-experiment).
This is a narrow exception to the preceding live-call prohibition: one new
`conexus-app-compiler-pilot` template publication from the frozen recipe, up to
two fresh network-denied sandboxes at 2 vCPU/2048 MiB, and loopback-only browser
inspection of their retrieved output. Prepare/run disposable scripts in the
named scratch directory, use the existing protected E2B credential, retain
sanitized results and clean up only this experiment's resources. Publication
and sandbox calls may consume credits. The 120-second command, 180-second
sandbox, 15-minute publication observation and 15-minute experiment bounds
apply. No model/Sankhya calls, company data, existing-template overwrite,
host dependency installation, production deployment or broader Product wiring
is admitted. Stop on the task's falsifiers; do not weaken constraints to pass.

That bounded experiment is complete. The [observed result](tasks/builder-first-app.md#observed-compiler-result)
records one ready image, two identical compiled outputs, real browser controls
and successful cleanup of both sandboxes and the loopback server. The image is
retained. This consumes the one-publication/two-sandbox grant; no repeat or
broader Product implementation is automatically admitted. Read-only result
inspection, this roadmap/index/task update and documentation checks remain
allowed. The result validates only the named compiler/profile mechanism.

The next operator approval admits implementation of the approved Builder to
Preview integration, starting with the independently verifiable source-to-build
part in [the implementation packet](tasks/builder-first-app.md#verified-source-to-compiler-implementation).
The existing WSL checkout is already a linked worktree. Preserve all six
pre-existing dirty paths. This part may change the named Builder modules,
focused tests and its owner/task/roadmap documentation. It adds an internal
authorized compilation consumer and the production E2B adapter, using existing
source custody and the already-published immutable compiler image. It does not
make Preview ready, add a public route, change database schemas or conflate
compiled bytes with a registered artifact. Allow targeted local verification
and at most two fresh E2B builds to check the actual new adapter, under the
same 120-second command/180-second sandbox and 12 MiB/256-output-file bounds.
No new image publication, model/Sankhya call, host configuration, commit, push
or merge is admitted by this part. Freeze exact owner/wire mutations before
the later Registry/MAR/continuation consumers. Routine mechanical steps within
this integration do not require repeated approval.

The first part now has a code candidate and [module-level proof](tasks/builder-first-app.md#implementation-observations).
Both authorized adapter sandboxes were used and confirmed absent after cleanup.
This consumes that two-sandbox allowance. The existing image remains unchanged.
The internal Builder compilation call is configured, but no HTTP/UI path
invokes it and no Preview readiness is claimed. Continue the approved
integration by freezing the exact Registry/MAR owner refinements before their
code mutations, not by repeating the compiler experiment or design arena.
Full candidate verification and independent closure remain outstanding.

The operator's continuation admits the next bounded
[Registry retention part](tasks/builder-first-app.md#registry-retention-implementation)
within that integration. Freeze its Registry/Builder refinement before code.
Allowed changes are the named application Registry adapter, migration 026 and
its runner checks, the existing compilation consumer, focused tests and their
current owner/task/status documentation. Verification may start one disposable
local PostgreSQL container from the already cached CI-pinned 17.10 image, bound
only to loopback with synthetic data and no host data mounts. Remove only that
test resource after proof. Fresh Fable/Gemini structural review is admitted for
the resulting frozen material candidate. This does not admit new Product-model,
E2B or Sankhya calls, host/TLS changes, publication, commit, push or merge.
Registry availability alone must not change BLD-10 readiness or expose a URL.

That part found a pre-existing migration-lineage blocker. The main runner
refuses migration 024 with `MIGRATION_024_DIGEST_REFUSED`; its expected bytes
match the earlier R3 freeze, not the later preserved unaccepted candidate.
The [retention checkpoint](tasks/builder-first-app.md#retention-checkpoint-and-migration-blocker)
records the hashes, isolated draft and proof limits. No Registry implementation
has been integrated into the main checkout and no 024 checksum change is
accepted. Stop the affected persistence integration pending the operator's
bounded disposition of the pilot migration lineage versus suspended R3.
Read-only diagnosis, preservation, cleanup of this part's disposable resources
and checkpoint/documentation checks remain allowed. This is not a grant to
resume the R3 implementation or review queue.

The operator's subsequent "Sim" admits the bounded installation correction
proposed at that checkpoint. Separate the executable pilot migration selection
from preserved unaccepted R3 files in the existing runner, preserve every SQL
file and checksum, and refuse incompatible applied ledgers without rewriting
them. The [migration isolation packet](tasks/builder-first-app.md#migration-isolation)
owns the exact change and proof. Allow focused runner/tests/verification-routing
and owner-documentation changes, one disposable loopback-only PostgreSQL
container with synthetic data from the cached CI image, and independent
material review. After this prerequisite is verified, resume the previously
admitted Registry retention part. No R3 qualification, live Product-model,
E2B/Sankhya call, deployment, host dependency change or Git publication is added.

The operator then clarified that R1/R2/R3 and the former delivery plans are
legacy, not the current execution methodology. Current work uses poteto-mode
and brainstorming to select and test the first-app increments. The immediate
request is to verify the mixed legacy/current routing before proceeding.
Historical stage statuses must not become global prerequisites for the pilot.
Existing code, data integrity, security requirements and objective CI properties
still need claim-specific evaluation; old names alone neither require nor
invalidate a check. The migration correction has local technical proof, but
its independent review was interrupted and does not establish convergence.
Do not restart that review or Registry implementation before resolving this
routing clarification. This statement does not silently amend the retained
engineering/repository methods or authorize repository-wide deletion.

The pilot keeps Conexus as the Product: a human creates and evolves an app
through Builder, then adds manually maintained store knowledge and the narrow
SDK/integration operations the app needs. Automatic Brain learning/proposals,
business Product Agents, generic app backends and broad automation are outside
the first pilot. This sequencing does not claim completion of the broader F1
contract or ratify changes to its existing semantic owners.

| Pilot outcome | Disposition | Next consumer |
| --- | --- | --- |
| Builder works in app files, creates a usable Preview and preserves the app through a second request | Pilot direction approved; clean compiler/browser feasibility observed; real Builder/Preview wiring and journey pending | [First app task](tasks/builder-first-app.md) |
| Operator maintains store knowledge; Builder uses the chosen Brain revision | Follow-on in the same pilot; no learning/discovery requirement | Brain authoring/adoption and Builder context, detailed after the first app path |
| The app uses narrow SDK operations and an authorized real Sankhya operation | Follow-on in the same app; exact operation and effects must be specified | Existing Project/I&A/Gateway/Connection owners, no generic backend prerequisite |
| A colleague opens the usable app under their own authorized access | Pilot completion consumer; local creator Preview alone does not prove it | Existing application-access/deployment owners; explicit network/activation grant |

Full repository consolidation is deferred and is not a prerequisite for this
pilot. Preserve its map and all prior dirty inputs. The retained L1–L6 and R3
records below are dependency/history routes, not the current execution queue.

### Prior consolidation context — suspended

On 2026-09-11, the operator approved controlled repository consolidation,
starting with the concrete document/check disposition map in
[`tasks/repository-consolidation.md`](tasks/repository-consolidation.md).
This replaces runtime diagnosis and L1–L6 elaboration as the current work.
Allowed work for this preparation is read-only dependency inspection, this
roadmap, the documentation index, that task packet and targeted documentation
checks. The written migration design awaits operator review before a mechanical
implementation plan and migration execution. No deletion, skill/check/code
change, semantic ratification, runtime experiment or Product resumption is
admitted by this preparation. Existing publication/live-effect restrictions
and all pre-existing dirty-state preservation obligations remain intact.

### Prior planning and probe context — suspended

The following grants explain preserved inputs; they do not override the
current consolidation scope or automatically restart research or experiments.

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

On 2026-09-11, the operator requested deep, read-only research by Luna agents
before selecting the managed TypeScript application-function runtime, and
required high-impact assumptions to carry explicit practical-proof needs.
This admits bounded research delegation, official/Context7 documentation
queries, read-only local capability inspection and findings/probe planning in
these task packets. Research-agent calls are not live Product-model proof or
independent closure review. No container/sandbox execution, installation,
runtime reconfiguration or live integration test is admitted by this research
request. The proposed local-container mechanism remains unselected.

The subsequent operator approval admits one bounded, disposable local L2.0
feasibility experiment under the [frozen probe envelope](tasks/l2-app-data-sdk.md#disposable-local-probe-envelope).
This narrow exception permits synthetic probe sources/results in a uniquely
created `/tmp/conexus-l2-spike-*` directory and creation/execution/inspection/
removal of only its explicitly named containers, using an already-present
image. It does not admit Product implementation, live providers, dependency
installation, daemon/host reconfiguration, production runtime selection or
closure review. The existing rootful daemon may run only the authored synthetic
cases under fixed limits; this does not accept rootful Product execution risk.

That bounded experiment ended after the nominal case and one bare-Node
diagnostic failed to produce output within the frozen window. Both containers
were removed; the remaining fault cases were not run. The
[observations](tasks/l2-app-data-sdk.md#disposable-probe-observations) are scoped
failure Evidence, not runtime acceptance. Its former next cycle was readonly
diagnosis; that investigation is now suspended for consolidation. No rerun with relaxed limits,
different image, daemon change or warm-worker architecture is admitted.

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

**Current work:** continue from the [compiler implementation](tasks/builder-first-app.md#implementation-observations)
to retained artifacts and authorized Preview serving. Freeze only their consumed
owner refinements; full repository consolidation remains deferred.
The delivery and realization tables below preserve prior planning and candidate
dispositions; none is the current next-action queue. The pilot task states its
narrower delivery scope without deleting historical proof or accepting R3.

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
| L2 | Builder-authored apps read and mutate their own persistent data through admitted contracts and SDKs | `PLANNED / LOCAL PROBE STOPPED AT BOOTSTRAP / RUNTIME UNSELECTED` | [Probe observations](tasks/l2-app-data-sdk.md#disposable-probe-observations); diagnose exact local image/daemon/WSL startup before another bounded probe; no function/SDK/isolation acceptance; L1 source/artifact seams, Project/I&A/Registry capabilities |
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

The operator clarified the MVP acceptance target during the local-delivery
brainstorming: demonstrate Conexus creating and evolving functional apps with
persistent Project data, authorized publication, Sankhya integration and use of
platform resources including Brain. No particular business application or
Sankhya business task defines the platform's scope. Test applications are proof
consumers selected to exercise the supported platform contracts. Brain is part
of this MVP target; its placement in L6 must not be interpreted as permission
to omit it from MVP acceptance. Business Product Agents remain deferred.

This fixes the observable target, not the unresolved implementation contracts.
The next design sections must state the initial managed-app execution model,
build/runtime SDK responsibilities, supported integration operation envelope,
Brain construction/runtime use, Preview and Published-App access, and proof
criteria. An accepted connector or Brain read surface does not establish that
arbitrary provider operations or knowledge authoring/publication are already
implemented. No new Product implementation or live-effect grant follows from
this clarification.

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

### High-impact assumptions requiring practical proof

Apply the existing Engineering Method's proof-before-implementation rule in
the consuming task, without creating another decision register or a mandatory
spike for every coding choice. For each material uncertainty, record the
hypothesis, semantic owner, current Evidence and its limit, smallest falsifying
probe, acceptance/rejection criteria, blocked consumer and reopen trigger.
Research support, a successful isolated experiment, composed Product proof and
owner acceptance are different claims. None silently implies the next.

| Decision or assumption | Evidence gap / required checkpoint | Consuming owner |
| --- | --- | --- |
| Managed TypeScript function execution and containment | Docker availability and vendor docs do not prove guest isolation, SDK authority or lifecycle. Compare candidates, then execute an explicitly admitted disposable local probe before selecting the mechanism | [L2 runtime research and probe](tasks/l2-app-data-sdk.md#managed-function-runtime-research-and-practical-proof); Security/MAR/deployment owners |
| Real Preview URL, embedding and app access | Prove exact origins, cookies, request policy, expiry/revocation and embedded/standalone behavior in the target browser; resolve attempted-request versus unauthorized-access guarantees | [L1 T1](tasks/l1-local-build-preview.md#t1--reconcile-and-accept-the-selected-ownerwire-contract), [L3 access](tasks/l3-local-publication.md#l31--close-composition-and-local-serving-contract); I&A/Security/MAR |
| Source to exact executable artifact and published version | A source-inspection result is not a build or serving result. Exercise reproducible frontend/function production and exact-version selection without rebuild/latest fallback | L1 producer, [L2](tasks/l2-app-data-sdk.md), [L3](tasks/l3-local-publication.md); Builder/Registry/Release |
| App SDK to Project data and Gateway | Prove useful admitted calls while forged scope, read-to-write escalation, stale/revoked grants and DEV-to-PROD crossing are denied at the receiving boundary | [L2](tasks/l2-app-data-sdk.md), [L4](tasks/l4-external-integrations.md); Project/I&A/Gateway |
| Sankhya effects after timeout or lost response | Controlled fault injection must preserve ambiguous outcome and block unsafe duplicate intent; exact provider qualification needs its own test operation/environment/grant | [L4](tasks/l4-external-integrations.md#l41--close-one-real-effect-and-the-reusable-execution-seam); Gateway/Connections |

These checkpoints block only consumers of their unproven claims. They do not
make external-effect qualification a prerequisite for static Preview, require
all future platform risks to be tested before one vertical increment, or move
L6's bounded Builder-recognition evaluations ahead of their actual consumer.

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

L1–L6 task packets previously routed platform delivery planning. The original R4
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

**Resume brainstorming from the recorded MVP agreement in the current first-app task. Consolidate the user journey and its first increment, identify only unresolved architecture decisions, and specify the practical evidence needed before committing to high-impact choices. Preserve the compiler proof, migration candidate and isolated Registry draft. Reconcile only the documents needed to guide that increment. Do not restart all planning, resume implementation or the interrupted review, or execute live experiments under this documentation approval.**

The following paragraph records legacy R3 disposition, not the next pilot action.
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
