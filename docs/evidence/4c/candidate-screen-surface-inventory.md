# 4C — Candidate Screen / Material-Surface Inventory

> **Status:** CANDIDATE / 4C-5 / TERMINAL PRE-P11 COVERAGE RECOMPILED THROUGH `4C-F40`
> **Authority posture:** derived from the operator-accepted-for-progression 4C-4 candidate IA, the current 4C-0→4C-3 foundation and accepted Product authority. This document does not create Product operations, DTOs, authorization, runtime behavior, implementation authority or final visual structure.
> **Method:** `docs/development/frontend-product-experience-planning-method.md` v2.3 profiled by the Conexus 4C contract.

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

P-01 subsequently proved the Project Build workspace. `4C-F14` preserves authored Change intent and optional exact Change context for `BLD-16`. Operator walkthrough then converged from shell coherence and density corrections to an app-first Build root: the current Project application is immediately visible, Conexus occupies the right sidebar, and an exact Change emerges only from a Build instruction. P9 exposed `4C-F15`, recompiling existing `BLD-10` as `GetBuildPreview(changeId?)`: omitted `changeId` returns `CURRENT_PROJECT`; an exact optional `changeId` returns `CHANGE_CANDIDATE`. P-01 is now locked without changing the 116-operation census.

P-02 subsequently proved four focused Project Product lenses. `4C-F16..F23` close human presentation, purpose-bound selection, governed analytic discovery, physical read-only Data exploration and server-resolved Project Brain Context without merging owners. The operator-approved Integrations correction makes Project use and the contained Project-private Connection lifecycle operable while preserving independent Connection Permissions and exact revision/binding truth. P-02 is now locked; its exact P8 blob and P9/P10 closure are pinned by the P-02 Screen Contract.

The terminal pre-P11 coverage pass adds only the accepted later operations that were missing from the historical 4C-5 table: `PRJ-25..28`, `BRN-13`, `BRN-14` and `BLD-18..20`. Later F31–F40 enrich existing operations or presentation truth without adding another platform operation. `PAR-05` remains the sole fixed operation with no direct browser surface. Budget Analyzer operations remain Product/API proving-instance truth outside the current platform frontend block set.

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
| PRJ-S03 | Build workspace | `ROUTE_PAGE` | open the current Project application immediately, build through the right-side Conexus composer, and let exact Change work emerge behind the interaction | app-first/root Product result stays central; Change/Hub truth never collapses into chat narration |
| PRJ-S04 | Plan + checkpoint review | `MATERIAL_REGION` | inspect exact durable Change Plan revision and make an eligible checkpoint decision only after Change work exists | decision/current-subject semantics; conversational Plan mode before Change is not BLD-04 truth |
| PRJ-S05 | Preview lens | `ALTERNATE_VIEW` | inspect server-resolved current Project source Preview or exact Change candidate Preview honestly | `BLD-10 changeId?`; `CURRENT_PROJECT != CHANGE_CANDIDATE`; ready != verified/live |
| PRJ-S06 | Code/source lens | `ALTERNATE_VIEW` | inspect exact source tree/file revision | source read authority differs from Build mutation |
| PRJ-S07 | Diff lens | `ALTERNATE_VIEW` | inspect exact candidate/result lineage | immutable/source lineage truth |
| PRJ-S08 | Findings + Evidence | `MATERIAL_REGION` / drawers candidate | inspect Findings/Evidence and close only with current resolution authority | review/provenance + exact decision; on demand only |
| PRJ-S09 | Change execution detail | `MATERIAL_REGION` / detail drawer | inspect subordinate WorkUnit/ActorRun facts | progressive platform detail, not separate owner |
| PRJ-S10 | Builder contextual Conexus assistant | `INLINE_COMPOSITION` | converse in the right-side Build sidebar over current Project context and, after exact Change creation, optionally exact Change context | `BLD-16` under `project.build`; distinct from Baseline-management `PRJ-24`; no durable Builder thread owner or new authority |
| PRJ-S10A | Agent Studio specialized Build lens | `ALTERNATE_VIEW` inside P-01 | inspect one exact authored `agent/v1`, start a NEW/EXISTING typed draft, revise it structurally or with Conexus and review the same Change candidate diff | `PRJ-21` + `BLD-18..20`; draft is server-owned Change candidate state, never live Agent/source/Mastra authority |
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

Accepted `4C-F27` binds the later PA-01 block to test full-page, contextual-side-panel and inline Product Agent compositions over the same Conversation/AgentRun truth. An eligible exact `ApprovalRequest` may be projected inline and through an app-scoped `Needs your decision` affordance, but Published Applications do not inherit a universal chat bubble, Control Plane IA or a second approval owner.

---

## 5. Material state-variant obligations

| Surface family | Required material distinctions carried forward |
| --- | --- |
| Global/session | unauthenticated vs authenticated; denied vs absent/non-disclosable; session expiry/reauthentication |
| Project creation/Inception | NEW vs EXISTING_GIT source bootstrap; invalid/unavailable source fails without half-created Project; intent validation; exact Candidate A vs Candidate B refinement lineage vs approved Baseline; visual/chat review state never authority |
| Build | no active Change vs exact active Change; working vs blocked vs waiting-for-user vs completed; Hub truth vs model narration; chat remains interaction rather than work truth |
| Preview | current Project source Preview vs exact Change candidate Preview; last-good inspectable Preview vs next candidate building; ready vs verified vs live |
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
| `T-01` | trusted first setup + later internal Account provisioning | explicit pre-Account → normal-session authority transition | P12 Family 1 identity delta RE-LOCKED / OPERATOR APPROVED / `4da586d8...` |
| `GF-01` | global frame + Workspace/Project navigation | whole-product coherence checkpoint | P12 Family 1 ingress/egress delta RE-LOCKED / OPERATOR APPROVED / `603b47cc...` |
| `W-01` | Projects + source-complete create + Inception + candidate/approved Baseline | one continuous Journey-B entry/outcome | P12 Family 1 Workspace/Project delta RE-LOCKED / OPERATOR APPROVED / `d466d66a...` |
| `W-02` | Workspace Brain + Connections | reusable enterprise context/resources | P12 Family 2 deltas RE-LOCKED / OPERATOR APPROVED: W-02A `f0a69027...`, W-02B `f8a4be72...` |
| `W-03` | People/access + audit | current authorization administration vs immutable investigation | P11-W03-F01 shell RE-LOCKED / OPERATOR APPROVED / blob `e9d630622d853d6e352737f46202f2765526fd6a`; inner interactions and P9/P10 preserved/closed |
| `W-04` | Workspace Agent catalog | access-filtered browse of Project-owned Agents | P12 Family 4 Agent-egress `71e03432...` / RE-LOCKED / OPERATOR APPROVED |
| `P-01` | Build + Plan/Preview/Agent Studio/Code/Diff/Findings/Evidence/assistant | primary Project workspace | Family 1 preserved; P12 Family 4 Agent-ingress `25e50771...` / RE-LOCKED / OPERATOR APPROVED |
| `P-02` | Data + Capabilities + Integrations + Project Connections + Brain binding | inspectable Product resources | P12 Family 2 governed-adoption delta RE-LOCKED / OPERATOR APPROVED / `fd23303a...` |
| `P-03` | Agents + definition inspection + Agent Studio handoff + triggers + runs + exact approvals | Product Agent lifecycle/runtime human work | F05 preserved; P12 Family 4 Agent/ApprovalRun `17d31534...` / RE-LOCKED / OPERATOR APPROVED |
| `P-04` | Releases + Promotions + Activity + effect/job/usage/audit evidence | operate/inspect work | Family 3 preserved; P12 Family 4 originatingRun `e036684e...` / RE-LOCKED / OPERATOR APPROVED |
| `P-05` | bounded Project lifecycle + Published-App access administration | Project Management route with App access + Lifecycle task lenses | approved baseline `c8d18c94...`; P12 Family 3 access delta `d00b2126...` / RE-LOCKED / OPERATOR APPROVED |
| `PA-01` | Published-App platform frame + Product Agent surfaces | independent app authority | Family 3 preserved; P12 Family 4 ApprovalRun `ffba5935...` / RE-LOCKED / OPERATOR APPROVED |

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
| PRJ-S10A | `BLD-18`, `BLD-19`, `BLD-20`, `PRJ-29` |
| PRJ-S11 | `PRJ-18`, `PRJ-19`, `PRJ-25`, `PRJ-26`, `PRJ-27`, `PRJ-28` |
| PRJ-S12 | `BRN-12`, `BRN-13` |
| PA-S02 | `BRN-12` |
| PRJ-S13 | `PRJ-16`, `PRJ-17` |
| PRJ-S14 | `PRJ-13`, `PRJ-14`, `PRJ-15` |
| PRJ-S16 | `PRJ-20`, `PRJ-21` |
| PRJ-S17 | `PAR-11`, `PAR-12`, `PAR-13`, `PAR-14`, `PAR-15`, `PAR-16` |
| PRJ-S18 / PA-S04 | `PAR-06`, `PAR-07` |
| PRJ-S19 | `PRJ-10`, `PRJ-11`, `PRJ-12`, `BRN-14` |
| PRJ-S20 | `REL-01`, `REL-02`, `REL-07`, `REL-08` |
| PRJ-S21 | `REL-04`, `REL-05`, `REL-06` |
| PRJ-S22 | `OBS-01` |
| PRJ-S23 | `OBS-02` |
| PRJ-S24 | `OBS-03` |
| PRJ-S25 | `GW-01`, `GW-02` |
| PRJ-S26 | `MAR-01`, `MAR-02`, `MAR-03`, `MAR-04` |
| PRJ-S28 / PA-S05 | `PAR-08`, `PAR-09`, `PAR-10` |
| PRJ-S29 | `PRJ-05`, `PRJ-06` |
| PRJ-S30 | `IAM-14`, `IAM-15`, `IAM-17`, `IAM-21` |
| PA-S01 | `IAM-13` |
| PA-S03 | `PAR-01`, `PAR-02`, `PAR-03`, `PAR-04` |

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

The original 4C-5 inventory exposed no upstream gap. W-01 later exposed `4C-F02` and `4C-F03`; W-03 exposed `4C-F11` and `4C-F12`; P-01 exposed `4C-F14` and `4C-F15`. All are operator-accepted and bounded to their proven owners. Structural questions remain bounded:

| ID | Candidate question | Next proving block |
| --- | --- | --- |
| `4C-S01` | exact global-frame navigation placement/order | `GF-01` — resolved by H1-R2 lock unless materially falsified |
| `4C-S02` | Project-scoped Connection lifecycle placement | resolved by P-02: secondary contained lifecycle inside Integrations, reusing W-02B grammar |
| `4C-S03` | Control Plane AnalyticQuery placement: Data-led vs Brain-led | resolved by P-02: Data-led Analyze interaction over Brain-owned `BRN-13/12` authority |
| `4C-S04` | exact ApprovalRequest host | resolved by P-03 + PA-01: exact context-attached subject with app-scoped discovery where admitted |
| `4C-S06` | discover pending exact ApprovalRequest without universal Approval Center or invented aggregate authority | resolved by P-03/P-04/PA-01 owner-scoped queues, context links and the non-numeric app-scoped affordance |
| `4C-S07` | W-03A People-first vs Area-first vs matrix-root interaction structure | resolved by W-03 subject-first operator lock |
| `4C-S08` | W-03B chronological audit + filter/detail density | resolved by W-03 filtered immutable Audit operator lock |

`4C-A02` is rejected as a current material closure dependency: no frequency is inferred, and current ordering/density was accepted through authority-backed tasks plus operator P11/P12 walkthrough. Optional P13/post-operational measurement reopens only the smallest affected ordering/density decision when material.

---

## 10. Historical candidate closure result after P-01 lock

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

Current terminal pre-P11 coverage projection:

```text
fixed platform Product operations                = 128
fixed direct-browser operations                  = 127
explicit direct-browser disposition              = PAR-05 only
frontend-reachable concrete operations mapped    = 127 / 127
Budget Analyzer application wireframe            = 0 / FUTURE_PRODUCT_APP
invented Product operations                      = 0
screen-shaped Product operations                 = 0
parallel frontend Product DTO authority          = 0
```

This remains a historical **candidate inventory**, not a global structural lock. Every material platform block and bounded pre-P11 delta is operator-locked where its exact Evidence applies, with prior baseline identities preserved historically. P12 Families 1-4 and the current transport-only P11 at `45172fd...` are operator-locked; P12 and 4C are closed and operator-ratified where required. Product-specific app wireframes, including Budget Analyzer, are not platform blocks. 4D remains `NOT STARTED` and Product implementation stays blocked.
