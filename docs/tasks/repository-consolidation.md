# Repository consolidation — design and disposition map

## Outcome and boundary

A fresh session can find the desired platform capability, existing implementation,
actual proof limits and next authorized observable result without reconstructing
phase history. Conexus remains the Product; no specific demonstration app defines
its scope. This is consolidation of continuity, not a Product reset.

The operator approved this direction and preparation of the concrete map on
2026-09-11. Mutable status, approval of the written design and execution grants
belong only to [roadmap](../roadmap.md#current-grant). This packet is not a deletion
manifest or an executable code plan. It defines the first migration boundary for
review; mechanical edits and their exact proof are detailed here after review.

Preserve the [Engineering Method](../development/engineering-method.md) and
[Repository Method](../development/repository-method.md). The concrete blocker is
conflicting continuation routes and historical-stage coupling in navigation and
checks, not the mere existence of many files. Renaming everything, redesigning
the stack and imposing another documentation framework are outside this work.

## Inspection basis and limits

Read-only inspection used `main@3baea8d0a5296b2e75f3519f52bcf96e9d0ef5d9`
plus the pre-existing dirty roadmap, L1 and L2 documents. Before this packet,
the tracked/non-ignored census contained 459 files under `docs/`: 383 Evidence,
12 phase documents and 7 task packets. File counts are orientation, not a quality
metric or permission to delete. The roadmap had 316 lines; L1/L2 had 523/538.

Inspected roadmap/index, methods, task inputs, selected authority sections,
check implementations and incoming filename references for 25 retirement-sensitive
documents. Filename search finds candidate consumers; it does not prove absence
of dynamic paths, semantic obligations or digest dependencies. This is a concrete
first-batch map, not a claim that all 383 Evidence files were individually audited.

Two different dependency classes were confirmed:

- [architecture verification](../../scripts/check-architecture-verification.mjs)
  reads current phase files and enforces old roadmap progression; its other
  sections also check real owner/data/proof obligations. Do not delete the suite.
- [RC-01 custody check](../../scripts/record-r1-candidate-custody.mjs)
  validates three frozen outputs against each other in `checkFrozenOutputs`.
  A path mentioned in its old inventory is not automatically a live-file pin.
  Conversely, S2 profile source inputs and the
  [R3 candidate checker](../../scripts/check-r3-candidate-freeze.mjs) require
  their own dependency analysis before affected files can change.

No application, login journey, provider call or runtime experiment was executed
for this map. Prior receipts remain evidence only for their original subjects.

## Target organization

| Surface | Target responsibility | Change limit |
| --- | --- | --- |
| `AGENTS.md`, `README.md` | Entry and runnable/setup routes | Keep short; no phase summaries or duplicated methods |
| `docs/roadmap.md` | MVP target, capability board, current grant and exact next result | Replace chronological boards; keep all mutable execution status here |
| `docs/index.md` | Route by intent/capability to the smallest owner | Separate current work from retained proof; no required historical reading |
| `docs/product/`, `docs/architecture/`, `docs/reference/` | Current meaning, structure, contracts and technical rationale | Preserve semantics; split out chronology, not invariants |
| `docs/decisions/index.md` | Current decision disposition and reopen route | Reconcile stale first-vertical/phase wording explicitly |
| `docs/tasks/` | Current bounded increment and its implementation/proof detail | Future capabilities stay brief in roadmap; create a task only when preparing its consumer |
| `docs/research/`, `docs/evidence/`, `qualification/` | Comparative sources, bounded observations and reproducible proof | Retain current consumers; retired deliberation remains recoverable in Git |

No new capability database, generated planning schema, synchronization mechanism,
parallel spec tree or mandatory skill per domain. Historical identifiers in SQL,
tests, receipts and source paths may stay; they are not a delivery sequence.

## Document disposition

Paths below are relative to `docs/` unless stated otherwise. **Absorb** means
transfer each surviving requirement, open question and proof limit to the named
destination before retirement. Hypotheses do not become accepted architecture
merely because they are moved. Anything not explicitly selected for change stays.

### Entry, semantics and methods

| Exact target | Disposition | Destination / condition |
| --- | --- | --- |
| `roadmap.md`, `index.md` | Consolidate | Use target organization above; preserve suspended candidates and unresolved dependencies by capability, not a global R3 gate |
| `architecture/index.md`, especially §§39–42 and 48–50 | Separate present structure from historical qualification/continuation | Keep §§1–4.1 and surviving invariants; retain exact qualification scope at existing proof owners; old package pins are not installed runtime pins. Map each affected checker assertion before editing |
| `decisions/index.md`, C-000/C-001/C-018 and Phase-4 refinements | Reconcile scope/disposition | C-001 still names Budget Analyzer first vertical; make the operator's platform-first target explicit while preserving the old proof scope. C-018 provenance is not a new execution gate or permission |
| `product/contract.md`, other `product/` files; `reference/` | Keep semantic authority | Reopen only the specific contradiction required by a consuming capability; do not weaken auth, effect, publication or data contracts for cleanup |
| `development/engineering-method.md`, `repository-method.md`, `frontend-product-experience-planning-method.md` | Keep adopted methods | No method-version amendment in this migration; changing core review/proof policy needs its own decision |
| `development/engineering-rules.md`; repository `.agents/skills/conexus-development/SKILL.md` | Consolidate routing, not Product semantics | Cite methods/owners instead of repeating them; proposed skill behavior below |
| `development/production-realization-guide.md` | Keep, consult by section | §5 contains Keycloak meaning, not just method. Do not delete it as obsolete planning; resolve duplicated reading guidance through its existing §3 |
| `development/blueprint-harness-design.md`, `softwareforge-reference-assessment.md`; `research/` | Keep on demand | Not required onboarding; no new whole-platform comparative research |

### Delivery task packets

| Exact source | Proposed destination and surviving content | Retirement condition |
| --- | --- | --- |
| `tasks/l1-local-build-preview.md` | Roadmap build/Preview capability: exact artifact production, MAR-owned serving, separate app origin/access, real browser proof; preserve T1 owner/transport/Registry uncertainties as open | Preserve dirty source recoverably; no migration may choose between competing Preview proposals or claim T1 accepted |
| `tasks/l2-app-data-sdk.md` | Roadmap app-data/runtime capability plus proposed `evidence/application-runtime-feasibility.md`: managed-function direction, unresolved mechanism, research source/limits, failed local probe and original budgets | Preserve dirty source and failure facts; consolidate observations without new runtime selection, rerun, relaxed thresholds or fabricated proof |
| `tasks/l3-local-publication.md` | Roadmap publication capability, linked to Release/Security owners | Preserve exact versions, independent app access, DEV/published distinction, failed promotion and migration-compatible rollback obligations |
| `tasks/l4-external-integrations.md` | Roadmap integrations capability, linked to Connections/Gateway | Preserve reads **and effects**, unresolved exact operation/provider scope, credential boundary and ambiguous-outcome/duplicate behavior; messaging examples do not mandate all adapters |
| `tasks/l5-managed-automations.md` | Roadmap automation capability, linked to MAR/Gateway and preserved R3 facts | Preserve occurrence/settlement/quiescence prerequisites and effect-safe restart; queue mechanics are not effect authority |
| `tasks/l6-brain-builder-knowledge.md` | Roadmap Brain capability, linked to Brain/Builder owners | Preserve guided Discovery and Builder-initiated proposals, human publication, explicit Project adoption and honest recognition evaluation; Product Agents remain later |
| `tasks/r3.md` | Retain as a non-current candidate/proof input, reachable under retained evidence routing | Keep bytes/path in the first batch: directly named by `check-r3-candidate-freeze.mjs`. Later rename/retirement needs exact custody disposition, not simulated R3 acceptance |

Retire the six L task paths only after their surviving content is visible in
the new board/owners and preserved research note. Do not create six renamed task
plans. The next active Product task is prepared around the real baseline journey,
not mechanically inherited from this old sequence. Broader F1 obligations,
activity/error/cost truth, public-domain activation and first-production recovery
remain routed rather than silently omitted from the scope census.

### Phase documents and historical evidence

| Exact target or enumerated family | First-batch treatment | Reason / later route |
| --- | --- | --- |
| `phases/3a-authority-baseline.md` | Retire after absorbing its routing/provenance | Current documents and Repository Method already own its surviving rules; preserve PR #40 / `01f01fa7cbef698ee06ecfd0b7b3828c72a2173e` provenance at decision C-000 before unlinking |
| `phases/3l-technology-qualification.md`, `3m-failure-recovery-architecture.md`, `3n-architecture-verification.md`, `3o-vertical-architecture-proof-contract.md`, `c-018-final-architecture-ratification.md` | Keep exact files outside default continuation | Qualification, recovery, actual proof requirements and ratification remain consumers; 3M/3N are directly read by a checker. Historical closure is not the current grant |
| `phases/4-implementation-readiness-program.md`, `4a-product-surface-and-authority-contract.md`, `4b-executable-wire-contract.md`, `4c-frontend-interaction-and-authority-realization.md`, `4d-project-paved-road-and-runtime-realization.md`, `realization-planning.md` | Keep as scoped contract/history inputs; remove their phase sequence from onboarding | Contains accepted surface, wire, scaffold and first-slice obligations; not safe bulk-deletion targets. Trace normative consumers before any later absorption |
| `evidence/4f/4f-r1-implementation-slice-plan.md` | Keep exact path/bytes | S2 profile/ownership inputs and native readmission provenance mention it; it is not just an old narrative plan |
| `evidence/4f/4f-autonomous-roadmap-execution-goal.md`, `4f-preview-resumption-preparation.md`; `evidence/4d/4d-rb-c0-frozen-planning.md`, `4d-rb-c0-worker-eval-and-probe-design.md` | Keep as suspended/history inputs, not current instructions | Grant history, surviving Preview constraints and possible proof consumers require separate absorption; a filename-only search does not authorize removal |
| Other `evidence/`, including R1C-14/RC-01, R2 live receipt, BLD-10 owner disposition and R3 stop/receipts; repository `qualification/` | Keep | No recursive purge, blanket requalification or historical receipt rewrite. Revisit individual files only for a current consumer or concrete navigation/proof defect |

The proposed deletion set is therefore **seven exact Markdown files**: six L
packets and the 3A summary, conditional on absorption above. This is a bounded
first cleanup, not a declaration that all remaining historical files are needed
forever. The primary win is ending their role as default execution instructions.

## Check migration map

| Exact repository path / consumer | Proposed change | Property that must survive |
| --- | --- | --- |
| `scripts/check-current-state.mjs` | Replace old 3A–3O/C-018 progression interpretation | One explicit current execution state/grant route; missing/contradictory state cannot silently admit work; retain repository identity, conflict, worktree and workflow-safety checks |
| `scripts/conexus-preflight.mjs`, `tests/repository/conexus-preflight.test.mjs` | Verify phase-free roadmap compatibility; change parser only if needed | Existing `Product implementation` row, continuation field and exact-next-action can be retained without a schema redesign; no inferred approval from prose/history |
| `scripts/check-architecture-verification.mjs` | Remove historical roadmap progression assertions; relocate semantic locators only with exact successors | Owner/dependency, record/FK, recovery and proof-family obligations still checked; not a whole-suite deletion |
| `tests/repository/architecture-verification.test.mjs`, `3o-closure-progression.test.mjs`, `c018-ratification.test.mjs` | Classify assertions affected by the new board; replace obsolete progression expectations | Current contract violations must still fail; fixtures here prove a repository checker, never a Product journey |
| `scripts/check-doc-index.mjs` | Use existing link/reachability behavior; no new metadata | No broken local links or unreachable current document; historic proof can remain discoverable without being required reading |
| `scripts/check-repository-hygiene.mjs` | Keep existing behavior for this batch unless an exact selected path exposes a concrete false stop | No broad policy rewrite or disabling checks to accommodate arbitrary directory names |
| `scripts/check-qualification-provenance.mjs`, `check-r1c14-native-readmission.mjs`, `record-r1-candidate-custody.mjs`; generation profiles/manifests | Preserve checks and proof bytes | Historical evidence identity remains verifiable; do not regenerate old receipts to make new content look previously proven |
| `scripts/check-r3-candidate-freeze.mjs` | Keep while its subject/path is preserved | Unaccepted candidate cannot become accepted through cleanup; its proof is not a global gate for unrelated capabilities |
| `scripts/conexus-verify.mjs`, `tests/repository/conexus-verify.test.mjs`, `package.json`, `.github/workflows/verify.yml` | Preserve candidate/CI coverage; edit only if an exact changed leaf requires routing | `verify` protection, environments, relevant negative controls, R1C-14 and flat execution remain; old npm/test names alone do not require renaming |

Before editing a checker, identify the exact assertion to retire or relocate and
the concrete property enforced by its replacement. Do not replace phase-string
tests with tests that merely require new plan headings. Independent material
review follows the existing method under its exact grant, not a new review per
document. This map is not independent closure review.

## Capability baseline and real validation

Seed the new roadmap with these claim-relative observations; they are not a new
runtime acceptance report. Preserve richer existing receipts where applicable.

| Capability | Existing source/proof route | What still needs direct observation for the local journey |
| --- | --- | --- |
| Login / Workspace / Project | `apps/hub/src/server.ts`, `identity-access/`, `workspace/`, `project/`; retained R1 results | Normal Hub/web entry, actual configured Keycloak, usable Project and authorization denial; current environment not revalidated by this map |
| Brain context | `apps/hub/src/brain/`, Project binding/context; retained R2 proof | Actual Builder/app consumer obtains authorized exact context; read/context implementation does not establish Discovery or publication |
| Builder | `apps/hub/src/builder/`; retained RB source-inspection/build-loop evidence | Current real provider/runtime composition creates and changes usable normal-code app artifacts |
| Preview / publication | `apps/hub/src/builder/preview.ts`; Registry/MAR and Release owners | Projection currently returns `ready: false`; demonstrate actual artifact serving, browser isolation, independent app access and exact published version |
| App data / SDK / runtime | Project data/operation owners; preserved L2 observations | A real app invokes admitted backend operations and persists data; local failed probe never reached useful function execution |
| Integrations / automations | Connections/Gateway modules, MAR admission; R2 P7 receipt and preserved R3 candidate | Prior live read and separately simulated-provider composition do not prove app-driven effects, jobs or effect-safe recovery |

For the first post-consolidation baseline, inspect documented startup/configuration
and current setup before admitting a runtime command. Then exercise normal login
and an existing Project/Brain path with real dependencies under a bounded grant.
Do not create another auth implementation or require whole-platform requalification
to observe this baseline. Its result selects the next missing vertical connection.

Each later increment states the real actor, entrypoint, component/configuration,
allowed data/effects, observable result, failure that would disprove it and proof
limit. Useful automated tests remain; substitutes cannot close real-composition
claims. Demonstrate denial/revocation, persistence and ambiguous effects where
the consumed contract requires them, not just the nominal UI path.

## Skill and technology treatment

Refine the existing `conexus-development` skill; do not add overlapping analysis,
documentation, planning and verification skills. Its entry routes to methods and
owners, distinguishes implemented/proven/unknown and selects proof by the real
consumer. Keep WSL and review delegation references conditional. Move the
roadmap's repeated reading/research procedure to a thin reference to the existing
realization guide and methods; do not copy Product architecture into instructions.

Validate revised instructions through a fresh session recovering current work,
locating Brain/auth authority, distinguishing Preview projection from serving and
refusing ungranted live effects. A skill file or regex test alone is not evidence
that this behavior works. Skill creation/editing uses the applicable skill-authoring
instructions when that implementation is admitted.

No technology is reselected in consolidation. For a later concrete capability,
compare reuse, adaptation and replacement including migration/operating cost.
Consult Mitra/Factory studies for the named uncertainty; use exact adopted source
and current official/Context7 documentation when APIs or guarantees are at issue.
Do not let a past selection prevent an evidenced improvement, or let a preferred
new library cause a whole-stack rewrite.

## Migration order, proof and termination

1. Review this written design. Then detail mechanical edits in this packet:
   exact assertion/owner changes, survivor destinations and approved write scope.
2. Preserve dirty inputs recoverably before any retirement. L1 and L2 must not
   disappear based only on their committed predecessors; do not commit, stash or
   absorb other worktrees without authority.
3. Update entrypoints, roadmap capability board and affected progression checks
   as one coherent candidate. Keep all useful protected claims and candidate holds.
4. Absorb the six task packets and 3A provenance, preserve bounded runtime
   observations, repair incoming links, and retire only the seven selected paths.
   If a unique unaccepted proposal cannot be represented honestly, retain that
   source with the exact unresolved item; do not silently accept or discard it.
5. Verify link/diff checks, affected checker regressions, retained custody and
   applicable candidate/CI graph in pinned Linux. Use clean-install/browser/DB
   requirements at the candidate gate; no live proof is implied by passing CI.
6. Exercise fresh-session recovery and prepare the first real baseline task.
   End consolidation when next work is unambiguous and protected proof survives;
   residual historical files without a current navigation defect do not block it.

Reopen on a lost invariant, false approval/false stop, broken retained proof,
unrecoverable dirty input, fabricated behavior claim or new competing authority.
Do not expand into all architecture, all Evidence, all skills or all dependencies.
