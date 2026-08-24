# 4C — Candidate Screen / Material-Surface Inventory

> **Status:** CANDIDATE / 4C-5 / `4C-F02` + `4C-F03` + `4C-F11` + `4C-F12` COVERAGE RECOMPILED
> **Authority posture:** derived from the operator-accepted-for-progression 4C-4 candidate IA, the current 4C-0→4C-3 foundation and accepted Product authority. This document does not create Product operations, DTOs, authorization, runtime behavior, implementation authority or final visual structure.
> **Method:** `docs/development/frontend-product-experience-planning-method.md` v2.2 profiled by the Conexus 4C contract.

4C-5 answers one question only:

> Which candidate route/pages and material sub-surfaces are necessary to complete accepted human work without turning endpoint count, backend topology or visual convenience into screen authority?

4C-4 remains CANDIDATE and is not `LOCKED`. Later operator locks apply only to exact material blocks, not to this entire inventory.

At the original 4C-5 closure:

```text
4C-0→3 foundation                    = GREEN
4C-4 candidate IA                    = ACCEPTED FOR PROGRESSION / NOT LOCKED
4C-5 candidate screen inventory      = THIS DOCUMENT
4C-8 rendered structural wireframes  = NOT STARTED
4D Paved Road/runtime                = NOT STARTED
Product implementation               = BLOCKED
```

Later block work may recompile coverage when a valid upstream finding changes Product/wire authority. `4C-F02` added `PRJ-23`; `4C-F03` added `PRJ-24` and bounded exact-candidate refinement semantics. W-02B later recompiled `WS-S06..09` into card browse + contextual detail + inline maintenance without operation-count change.

W-03 authority-feasibility subsequently exposed two accepted findings. `4C-F11` adds human Account/Area presentation plus `IAM-18..20` so access administration can inspect exact current subjects and I&A-derived effective access without frontend pseudo-authority. `4C-F12` keeps `OBS-04/05` as the Audit owner while making immutable Audit server-filterable and historically human-readable. After those bounded corrections went GREEN, the operator approved W-03 P7 and the exact functional P8; `WS-S10..11` below now reflect the locked subject-first/context-preserving interaction shapes without widening Product authority.

W-04 later proved `WS-S03` as an Agent-first Workspace discovery catalog over `PRJ-22`. The operator-approved revised P8 makes Purpose and owning Project materially legible and ends `Open Agent` at the future Project-owned Agent workspace boundary without opening P-03 or widening `project.read` into `project.source.read`.

---

## 1. Surface-splitting law

A Product operation does not imply a screen. Multiple operations may share one human surface when they serve one coherent job and preserve one semantic context.

A separate material surface is justified only when one or more change materially:

```text
primary semantic truth
safe user action
write owner
identity source
concurrency / idempotency behavior
content exactness / integrity
security / disclosure context
recovery path
viewer / editor mode
```

Recognized candidate surface kinds:

```text
ROUTE_PAGE
MATERIAL_REGION
DRAWER_MODAL
INLINE_COMPOSITION
ALTERNATE_VIEW
MATERIAL_STATE_VARIANT
APP_COMPOSED_SURFACE
```

Exact URL paths, component boundaries, responsive placement, visual density and reusable component APIs are not selected here.

---

## 2. Global Control Plane + Workspace candidate surfaces

| Surface ID | Candidate surface | Kind | Human job / truth | Material boundary / reason |
| --- | --- | --- | --- | --- |
| CP-S01 | Access & context frame | `INLINE_COMPOSITION` | know current authenticated Account/session and disclosable Workspace context; end session safely | global session/context truth; never owns grants |
| CP-S02 | First access / Workspace chooser | `ROUTE_PAGE` + bounded create modal | enter an authorized Workspace or create the trusted F1 Workspace when eligible | first-access recovery differs from normal Workspace work |
| CP-S03 | Trusted Account provisioning | `ROUTE_PAGE` / privileged internal surface | provision a known human Account at the trusted F1 operator boundary | platform-operator-only; not public signup |
| WS-S01 | Projects | `ROUTE_PAGE` | browse current disclosed Projects and start Project creation | primary Workspace work entry |
| WS-S02 | Project create / source-bootstrap flow | `ROUTE_PAGE` or `DRAWER_MODAL` candidate | establish one source-complete Project under an exact Workspace and continue to Inception | `PRJ-03` owns creation-time `NEW | EXISTING_GIT`; no second Repository/source-mutation domain |
| WS-S03 | Workspace Agent catalog | `ROUTE_PAGE` | discover accessible Project-owned Agents by human name/purpose/owning Project and exact Release presence, then hand off deeper work to the future Project-owned Agent workspace | `PRJ-22` filtered projection only; no `PRJ-21` dependency, editor or fleet owner |
| WS-S04 | Workspace Brain overview | `ROUTE_PAGE` | inspect Brain identity, immutable revisions and health/provenance | Workspace semantic authority differs from Project binding |
| WS-S05 | Brain discovery + proposal review | `ROUTE_PAGE` with material review regions | run bounded discovery, inspect proposals, decide/publish reviewed meaning | machine-propose/human-decide and publication states |
| WS-S06 | Connections browse + contextual detail | `ROUTE_PAGE` + `DRAWER_MODAL` | browse Connector definitions and Connections; open exact Connection detail while preserving collection/search context | Connection lifecycle owner truth; ownerScope and current test applicability remain explicit |
| WS-S07 | Connection create / inline revise | `DRAWER_MODAL` + `MATERIAL_REGION` | establish a Connection in a bounded create flow or revise its current non-secret configuration inline in the contextual panel | create identity and exact current-revision write semantics remain distinct without page round-trips |
| WS-S08 | Connection credential entry | `MATERIAL_REGION` inside contextual panel | replace credential material through the write-only secret boundary without leaving Connection context | no secret readback; credential write stays distinct from configuration |
| WS-S09 | Connection qualification | `MATERIAL_REGION` inside contextual panel | run exact-environment Test connection and inspect result/problem/remediation in the same Connection context | proof operation, not generic Save/Test URL or runtime-health claim |
| WS-S10 | People & access | `ROUTE_PAGE` | understand and administer exact Workspace membership, Areas and Project access without frontend-derived authorization | current I&A authority work; does not imply Published-App business access or generic RBAC |
| WS-S10A | People / Workspace membership + member access | `MATERIAL_REGION` + `DRAWER_MODAL` | list human-recognizable members, find an existing membership candidate, add/remove membership and inspect one member's exact Area/direct/effective Project access while preserving People context | `IAM-04/18/19` read truth stays I&A-owned; effective access is server-derived and all DIRECT/AREA sources remain visible |
| WS-S10B | Areas + Area access | `MATERIAL_REGION` + `DRAWER_MODAL` | list/create human-recognizable Areas; inspect exact current Area members and Project grants in a contextual Area panel; add/remove Area membership and Project grants | Area is grouping, not software owner; `IAM-20` exposes current access truth without grant CRUD symmetry |
| WS-S10C | Direct Account Project access | `MATERIAL_REGION` inside contextual person panel | grant/revoke exact Account access to exact contained Project while preserving all server-returned effective sources | direct access remains one current-authority source; summary disclosure grants no Project content authority |
| WS-S11 | Audit investigation | `ROUTE_PAGE` + `DRAWER_MODAL` | apply server-side period/actor/action/exact-known-Project filters, scan immutable human summaries, and inspect one exact immutable fact + Evidence while preserving filtered collection context | filters apply before pagination; historical presentation is append-time snapshot Evidence; Audit never becomes current business-state authority |

No generic Workspace `Settings` screen is created by symmetry. `4C-F11` adds evidence-driven Area creation/read presentation, not generic Workspace/Area metadata mutation or `WS-06` resurrection.

---

## 3. Project candidate surfaces

| Surface ID | Candidate surface | Kind | Human job / truth | Material boundary / reason |
| --- | --- | --- | --- | --- |
| PRJ-S00 | Project context frame | `INLINE_COMPOSITION` | understand exact current Project context and disclosure | identity/context projection only; no generic metadata editor |
| PRJ-S01 | Project Inception / investigation | `ROUTE_PAGE` | supply current business intent, inspect objective/users/constraints/source reality, run bounded investigation and explicitly apply feedback against one exact prior candidate when refinement is needed | Journey B is not a fake Change; source admission already occurred at Project birth; Candidate A remains immutable while refinement produces Candidate B |
| PRJ-S02 | Candidate + approved Baseline visual review / decision | `MATERIAL_REGION` or focused route candidate | inspect a deterministic visual projection of the exact candidate, select bounded candidate-local context, ask Conexus about that exact candidate, distinguish it from current approved Baseline and approve only the exact reviewed candidate subject | `PRJ-23` durable read + `PRJ-24` candidate-bound contextual read + `PRJ-08` approved read + `PRJ-09` exact decision; local/HTML/Mastra review state is never Product authority |
| PRJ-S03 | Build workspace | `ROUTE_PAGE` | state Change intent, inspect current Change/progress and keep build work centered | Hub truth, not model narration |
| PRJ-S04 | Plan + checkpoint review | `MATERIAL_REGION` | inspect exact Plan revision and make eligible checkpoint decision | decision/current-subject semantics |
| PRJ-S05 | Preview lens | `ALTERNATE_VIEW` | inspect last-good/current candidate Preview honestly | Preview ready != verified/live |
| PRJ-S06 | Code/source lens | `ALTERNATE_VIEW` | inspect exact source tree/file revision | source read authority differs from Build mutation |
| PRJ-S07 | Diff lens | `ALTERNATE_VIEW` | inspect exact candidate/result lineage | immutable/source lineage truth |
| PRJ-S08 | Findings + Evidence | `MATERIAL_REGION` / drawers candidate | inspect Findings/Evidence and close only with current resolution authority | review/provenance + exact decision |
| PRJ-S09 | Change execution detail | `MATERIAL_REGION` / detail drawer | inspect subordinate WorkUnit/ActorRun facts | progressive platform detail, not separate owner |
| PRJ-S10 | Builder contextual Conexus assistant | `INLINE_COMPOSITION` | ask about selected authorized Builder/Project context / next safe action | `BLD-16` helper under `project.build`; distinct from Baseline-management `PRJ-24`; grants no new authority |
| PRJ-S11 | Data | `ROUTE_PAGE` with master-detail candidate | inspect declared Product/read-model resources, grain, freshness, coverage and provenance | never generic DB explorer |
| PRJ-S12 | Analytic Query interaction | `MATERIAL_REGION` / `APP_COMPOSED_SURFACE` | ask governed semantic analytical questions over exact Brain/dataset scope | placement remains block-level question |
| PRJ-S13 | Capabilities | `ROUTE_PAGE` with detail candidate | inspect authored/Release Queries/Actions without gaining invocation by inspection | capability identity differs from source/integration mechanics |
| PRJ-S14 | Integrations / Project bindings | `ROUTE_PAGE` | inspect/set/remove exact ProjectConnectionBinding | binding differs from Connection lifecycle ownership |
| PRJ-S15 | Project-scoped Connections | `MATERIAL_REGION` inside external-system work | browse/manage private Project-owned Connection lifecycle separately from bindings | preserves Connection != Integration without duplicate top-level backend-shaped domain |
| PRJ-S16 | Agents | `ROUTE_PAGE` with detail candidate | inspect Project-owned authored Agent identity/revisions/Release state | authoring remains Change/Build |
| PRJ-S17 | Agent triggers | `MATERIAL_REGION` | inspect/create/revise/enable/disable schedule triggers | exact TriggerRevision/current-state laws |
| PRJ-S18 | Agent runs | `MATERIAL_REGION` | inspect AgentRun list/detail | runtime Evidence; COMPLETED != every effect succeeded |
| PRJ-S19 | Project Brain binding | `ROUTE_PAGE` / focused resource page | inspect/set/clear exact Brain revision binding and health context | binding owner differs from Workspace Brain publication |
| PRJ-S20 | Releases | `ROUTE_PAGE` with Release detail | inspect immutable Release composition, conformance and serving state | AVAILABLE != Promotion != served verification |
| PRJ-S21 | Promotion | `MATERIAL_REGION` / focused action surface | inspect history/current state and promote exact Release/environment | consequential current-pointer decision |
| PRJ-S22 | Activity | `ROUTE_PAGE` | browse activity entries pointing to owner facts | chronological projection only |
| PRJ-S23 | Execution observation detail | `MATERIAL_REGION` / detail drawer | inspect one typed execution observation | technical Evidence detail |
| PRJ-S24 | Usage & cost | `MATERIAL_REGION` | inspect usage/cost with provenance | missing != zero |
| PRJ-S25 | Effect attempts | `MATERIAL_REGION` / detail surface | inspect external effect attempt/reconciliation | no Retry/MarkSucceeded; OUTCOME_UNKNOWN explicit |
| PRJ-S26 | Managed jobs | `MATERIAL_REGION` | inspect JobRuns and trigger admitted run-now occurrence | not universal scheduler |
| PRJ-S27 | Project audit | `MATERIAL_REGION` | inspect the Workspace-owned immutable Audit filtered to an exact contained Project | governance Evidence distinct from Activity; same `OBS-04/05` owner surface |
| PRJ-S28 | Exact ApprovalRequest | `MATERIAL_REGION` attached to exact AgentRun/context | list/inspect/decide only currently eligible exact subjects | no global Approval Center |
| PRJ-S29 | Project lifecycle management | `ROUTE_PAGE` / bounded management surface | archive or duplicate exact Project | no generic Project update; archive != unpublish/stop automations |
| PRJ-S30 | Published-App access administration | `MATERIAL_REGION` | list/set/revoke exact app access/role | app access independent from Workspace/Builder membership |

Project-scoped Connection lifecycle remains a distinct material surface inside Integrations work. If later operator walkthrough finds this harms findability, reopen only that terminology/placement decision.

---

## 4. Published Application candidate surface families

Published Applications do not inherit Control Plane navigation. Their exact business IA is Project-defined from the active Release and admitted app authority.

| Surface ID | Candidate surface | Kind | Human job / truth | Material boundary / reason |
| --- | --- | --- | --- | --- |
| PA-S01 | Published-App access/session frame | `INLINE_COMPOSITION` | establish current app access/role without Builder authority | independent app authorization |
| PA-S02 | Project-defined business / analytic surface | `APP_COMPOSED_SURFACE` | consume exact active-Release business capabilities | no generic execute UI |
| PA-S03 | Product Agent conversation | `APP_COMPOSED_SURFACE` | list/open/create Conversation and send turns to exact active Agent | exact Release/Agent pinning |
| PA-S04 | Agent run detail | `MATERIAL_REGION` | inspect exact AgentRun/receipts where admitted | runtime provenance differs from transcript |
| PA-S05 | Exact effect approval | `MATERIAL_REGION` attached to exact app/AgentRun context | decide exact sealed ApprovalRequest when route admits it | app role alone never confers approval eligibility |
| BUD-S01 | Budget Analyzer analysis dashboard | `ROUTE_PAGE` | run exact pending-budget analysis and understand truth state | no arbitrary metric/query builder |
| BUD-S02 | Pending budgets drilldown | `ROUTE_PAGE` or focused detail route | inspect exact pending-budget rows under response/page result coordinate | distinct row-level/paging truth |

---

## 5. Material state-variant obligations

| Surface family | Required material distinctions carried forward |
| --- | --- |
| Global/session | unauthenticated vs authenticated; denied vs absent/non-disclosable; session expiry/reauthentication |
| Project creation/Inception | NEW vs EXISTING_GIT source bootstrap; invalid/unavailable source fails without half-created Project; intent validation; exact Candidate A vs Candidate B refinement lineage vs approved Baseline; visual/chat review state never authority |
| Build | working vs blocked vs waiting-for-user vs completed; Hub truth vs model narration |
| Preview | last-good inspectable Preview vs next candidate building; ready vs verified vs live |
| Brain | inferred/proposed vs reviewed/published; UNVERIFIED/VALID/SUSPECT/INVALID/CHECK_ERROR |
| Connections | configured vs qualified vs bound vs healthy vs caller-authorized |
| People/access | member/Area presentation != authority; direct vs Area-derived access; effective access preserves all current sources; narrowing remains exact-current-state work |
| Audit | immutable historical snapshot presentation; server-side filter before pagination; loaded page != search universe; Audit != current owner state |
| Data/analytics/Budget | loading vs known-empty vs failed vs partial; SUPPORTED_CURRENT/STALE/PARTIAL/UNVERIFIED/UNSUPPORTED/DEPENDENCY_UNAVAILABLE |
| Releases | candidate verified vs AVAILABLE vs Promotion approved vs pointer switched vs SERVED_VERIFIED |
| Agent/effects | AgentRun completed vs effect success; pending/denied/stale/expired; OUTCOME_UNKNOWN without blind replay |
| Usage/cost | reported/inferred/missing; calculated/provider/reconciled distinctions where available |

These are later Screen Contract/wireframe obligations, not client-owned lifecycle state machines.

---

## 6. Material-block ledger for later 4C cycles

| Block | Candidate scope | Why grouped | Reference / hypothesis trigger |
| --- | --- | --- | --- |
| `GF-01` | global frame + Workspace/Project navigation | whole-product coherence checkpoint | now `LOCKED / H1-R2`; later blocks inherit it unless a material falsifier reopens it |
| `W-01` | Projects + source-complete create + Inception + candidate/approved Baseline | one continuous Journey-B entry/outcome | W-01 C1-R1 LOCKED; 4C-F02 + 4C-F03 remain its accepted bounded authority corrections |
| `W-02` | Workspace Brain + Connections | reusable enterprise context/resources | W-02A Brain LOCKED; W-02B Connections LOCKED; later P11 assembly only after remaining material blocks |
| `W-03` | People/access + audit | current authorization administration vs immutable investigation | LOCKED / OPERATOR APPROVED; F11/F12 GREEN; P8 blob `7434c561ef0cfbc43c81ab8dd1f72b13cf032135`; P9/P10 closed |
| `W-04` | Workspace Agent catalog | access-filtered browse of Project-owned Agents | LOCKED / OPERATOR APPROVED; revised P8 blob `65073eb5f532f2675f04ec307eb0d9b91fd1b69d`; P9/P10 closed |
| `P-01` | Build + Plan/Preview/Code/Diff/Findings/Evidence/assistant | primary Project workspace | NEXT / NOT OPEN; reference study / competing hypotheses triggered |
| `P-02` | Data + Capabilities + Integrations + Project Connections + Brain binding | inspectable Product resources | AnalyticQuery placement and Connection findability explicit questions |
| `P-03` | Agents + triggers + runs + exact approvals | Product Agent lifecycle/runtime human work | approval discovery/placement trust-critical |
| `P-04` | Releases + Promotions + Activity + effect/job/usage/audit evidence | operate/inspect work | avoid deployment-dashboard flattening |
| `P-05` | bounded Project lifecycle + Published-App access administration | exact management actions only | no generic Settings symmetry |
| `PA-01` | Published-App platform frame + Product Agent surfaces | independent app authority | platform-owned boundaries stay minimal |
| `BUD-01` | Budget Analyzer dashboard + drilldown | first vertical/proving instance | dashboard→drilldown structural hypothesis |

---

## 7. Concrete operation-to-surface coverage

The set below must equal the current frontend-reachable concrete operation set. Repeated mappings are allowed only for legitimate multi-ingress contexts.

| Candidate surface(s) | Concrete Product operation IDs |
| --- | --- |
| CP-S01 | `IAM-01`, `IAM-02`, `WS-02` |
| CP-S02 | `WS-01` |
| CP-S03 | `IAM-03` |
| WS-S01 | `PRJ-01` |
| WS-S02 | `PRJ-03` |
| WS-S03 | `PRJ-22` |
| WS-S04 | `BRN-01`, `BRN-02`, `BRN-03`, `BRN-10` |
| WS-S05 | `BRN-04`, `BRN-05`, `BRN-06`, `BRN-07`, `BRN-08`, `BRN-09` |
| WS-S06 / PRJ-S15 | `CON-01`, `CON-02`, `CON-03`, `CON-04`, `CON-09` |
| WS-S07 / PRJ-S15 | `CON-05`, `CON-06` |
| WS-S08 / PRJ-S15 | `CON-07` |
| WS-S09 / PRJ-S15 | `CON-08` |
| WS-S10A | `IAM-04`, `IAM-05`, `IAM-06`, `IAM-18`, `IAM-19` |
| WS-S10B | `IAM-09`, `IAM-10`, `IAM-11`, `IAM-12`, `IAM-20`, `WS-04`, `WS-05` |
| WS-S10C | `IAM-07`, `IAM-08` |
| WS-S11 / PRJ-S27 | `OBS-04`, `OBS-05` |
| PRJ-S00 | `PRJ-02` |
| PRJ-S01 | `PRJ-07` |
| PRJ-S02 | `PRJ-08`, `PRJ-09`, `PRJ-23`, `PRJ-24` |
| PRJ-S03 | `BLD-01`, `BLD-02`, `BLD-03`, `BLD-06` |
| PRJ-S04 | `BLD-04`, `BLD-05` |
| PRJ-S05 | `BLD-10` |
| PRJ-S06 | `BLD-08`, `BLD-09` |
| PRJ-S07 | `BLD-07` |
| PRJ-S08 | `BLD-11`, `BLD-12`, `BLD-13`, `BLD-14`, `BLD-15` |
| PRJ-S09 | `BLD-17` |
| PRJ-S10 | `BLD-16` |
| PRJ-S11 | `PRJ-18`, `PRJ-19` |
| PRJ-S12 / PA-S02 | `BRN-12` |
| PRJ-S13 | `PRJ-16`, `PRJ-17` |
| PRJ-S14 | `PRJ-13`, `PRJ-14`, `PRJ-15` |
| PRJ-S16 | `PRJ-20`, `PRJ-21` |
| PRJ-S17 | `PAR-11`, `PAR-12`, `PAR-13`, `PAR-14`, `PAR-15`, `PAR-16` |
| PRJ-S18 / PA-S04 | `PAR-06`, `PAR-07` |
| PRJ-S19 | `PRJ-10`, `PRJ-11`, `PRJ-12` |
| PRJ-S20 | `REL-01`, `REL-02`, `REL-07`, `REL-08` |
| PRJ-S21 | `REL-04`, `REL-05`, `REL-06` |
| PRJ-S22 | `OBS-01` |
| PRJ-S23 | `OBS-02` |
| PRJ-S24 | `OBS-03` |
| PRJ-S25 | `GW-01`, `GW-02` |
| PRJ-S26 | `MAR-01`, `MAR-02`, `MAR-03` |
| PRJ-S28 / PA-S05 | `PAR-08`, `PAR-09`, `PAR-10` |
| PRJ-S29 | `PRJ-05`, `PRJ-06` |
| PRJ-S30 | `IAM-14`, `IAM-15`, `IAM-17` |
| PA-S01 | `IAM-13` |
| PA-S03 | `PAR-01`, `PAR-02`, `PAR-03`, `PAR-04` |
| BUD-S01 | `BUD-01` |
| BUD-S02 | `BUD-02` |

---

## 8. Explicit no-screen / no-domain dispositions

```text
PAR-05 RunProductAgentHeadless
→ HEADLESS Product ingress
→ no direct browser UI consumer

universal Approval Center
→ REJECTED
→ exact ApprovalRequest surfaces remain contextual

universal workflow center / scheduler
→ REJECTED

generic People/RBAC dashboard owner
→ REJECTED
→ W-03A composes exact I&A/Workspace/Project summary truth only

generic Audit search/event owner
→ REJECTED
→ OBS-04 remains the one bounded Audit collection read

screen-shaped Product operations = 0
parallel frontend Product DTO authority = 0
generic execute UI = 0
raw DB explorer = 0
global file manager = 0
provider/runtime console as Product authority = 0
```

A browser control that is navigation, projection, local view state or modal presentation does not gain a Product operation.

---

## 9. Findings / questions carried into block work

The original 4C-5 inventory exposed no upstream gap. W-01 later exposed `4C-F02` and `4C-F03`. W-03 then exposed `4C-F11` and `4C-F12`; all four are operator-accepted and bounded to their proven owners. Structural questions remain bounded:

| ID | Candidate question | Next proving block |
| --- | --- | --- |
| `4C-S01` | exact global-frame navigation placement/order | `GF-01` — resolved by H1-R2 lock unless materially falsified |
| `4C-S02` | Project-scoped Connection lifecycle placement | `P-02` |
| `4C-S03` | Control Plane AnalyticQuery placement: Data-led vs Brain-led | `P-02` |
| `4C-S04` | exact ApprovalRequest host | `P-03` / `PA-01` |
| `4C-S05` | Budget drilldown route vs master-detail | `BUD-01` |
| `4C-S06` | discover pending exact ApprovalRequest without universal Approval Center or invented aggregate authority | `P-03`, cross-check `P-04` / `PA-01` |
| `4C-S07` | W-03A People-first vs Area-first vs matrix-root interaction structure | resolved by W-03 subject-first operator lock |
| `4C-S08` | W-03B chronological audit + filter/detail density | resolved by W-03 filtered immutable Audit operator lock |

`4C-A02` relative frequency/urgency remains open only where it materially affects ordering/density.

---

## 10. Candidate closure result after W-04 lock

```text
fixed Product operations                        = 116
fixed browser-reachable operations              = 115
Budget browser-reachable operations             = 2
frontend-reachable concrete operations expected = 117
frontend-reachable concrete operations mapped   = mechanically checked by repository test
PAR-05 browser surface                          = 0
invented user needs                             = 0
screen-shaped Product operations                = 0
parallel Product DTO authority                  = 0
4D selections                                   = 0
Product implementation                          = 0
```

This remains a **candidate inventory**, not a global structural lock. `GF-01`, `W-01`, `W-02A Brain`, `W-02B Connections`, `W-03 People/access + Audit` and `W-04 Workspace Agent catalog` are individually operator-locked where their exact block Evidence applies. W-04 exact revised P8 is pinned by its Screen Contract. `P-01` is the next material block and remains `NEXT / NOT OPEN`.