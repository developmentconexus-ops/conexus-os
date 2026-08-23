# 4C — Frontend Foundation and Coverage

> **Status:** CANDIDATE EVIDENCE / 4C-0 → 4C-3 / `4C-F02` + `4C-F03` RECOMPILED
> **Authority:** evidence derived from current accepted Product/architecture authority; this document does not create Product meaning, operations, DTOs, routes, screens, authorization or implementation authority.
> **Method:** `docs/development/frontend-product-experience-planning-method.md` v2.1 through the Conexus-specific 4C contract.

This record owns the pre-IA human-flow and frontend-reachability foundation. It was originally closed before 4C-4 and was later mechanically recompiled after the operator-accepted W-01 corrections. `4C-F02` added `PRJ-23 GetProjectBaselineCandidate` because the already-accepted Journey-B human checkpoint needs durable exact candidate review/re-entry. `4C-F03` then added `PRJ-24 AskConexusAboutBaselineCandidate` and enriched `PRJ-07` because that same reviewer needs exact-candidate contextual explanation and explicit candidate-bound refinement without acquiring Builder authority.

```text
4C-0 bounded authority recovery
→ 4C-1 actors / needs / assumptions
→ 4C-2 end-to-end human flows
→ 4C-3 frontend coverage + operation consumer/disposition census
```

No P8 layout, 4D Paved Road/runtime choice or Product implementation is performed by this foundation.

---

## 1. 4C-0 — Bounded authority recovery

The foundation uses the smallest current pack needed for the question:

| Source | Role | Authority posture |
| --- | --- | --- |
| `docs/phases/4c-frontend-interaction-and-authority-realization.md` | Conexus 4C laws, working order and proof boundary | current 4C contract |
| `docs/development/frontend-product-experience-planning-method.md` | reusable authority-to-UX planning method | methodology, not Product authority |
| `docs/product/contract.md` | accepted human actors, Product journeys and truth laws | accepted Product authority |
| `docs/product/operation-ledger.md` | exact operation census, principals, ingress, owners and authority matrix | current 4A authority after `4B-F01`, `4C-F01`, `4C-F02`, `4C-F03` |
| `docs/reference/frontend-and-product-surfaces.md` | accepted semantic frontend surfaces and projection laws | architecture/reference authority |

Exact 4B request/response/path schema is loaded when a concrete interaction reaches authority feasibility or Screen Contract work; the foundation does not infer wire shape from operation names.

Current recovered facts:

```text
fixed Conexus platform Product operations = 113
first Budget Analyzer Project operations  = 2
ordinary Permissions                       = 25
Technical Ingress                          = protocol-only / Product-count impact 0
frontend/cache                             = projection only
Workspace/Project semantic surfaces        = current; exact labels/order/components are 4C decisions
```

Historical count chronology remains explicit:

```text
4B-F01 114 → 111 by subtracting three ungrounded generic mutations
4C-F02 111 → 112 by adding one real Journey-B candidate-Baseline read
4C-F03 112 → 113 by adding one exact candidate-bound Baseline contextual read
```

Counts are derivation results, never planning targets.

---

## 2. 4C-1 — Accepted human actor contexts and outcome needs

4C recovers seven accepted actor contexts without converting access roles into speculative personas.

| Accepted actor context | Outcome-oriented need preserved from current Product authority |
| --- | --- |
| Workspace owner / platform operator | Establish/administer a Workspace, create/authorize source-complete Projects, manage Workspace resources and oversee software being built/served without administrative authority implying business access to every Published Application. |
| Project administrator / Builder operator | Create/evolve a Project, establish/review/refine Inception/Baseline, manage Changes/bindings/access and drive candidate verification/Release through current gates. |
| Project contributor / reviewer | Participate in Project evolution and inspect/review Plan, Change, Preview and Evidence while taking only currently authorized actions. |
| Published Application user | Use a business application/capability delivered by an exact active Project Release without acquiring Builder/source authority. |
| Product Agent user | Interact with an exact active Project-owned Product Agent through its admitted Product surface and current app/runtime authority. |
| Approver / decision maker | Inspect one exact owner-specific decision subject and decide it only while currently eligible; surface visibility does not confer decision authority. |
| Auditor / technical investigator | Inspect history, Evidence, provenance, Findings, run/effect observations, cost and receipts without telemetry becoming current owner truth. |

### 2.1 Evidence / assumption register

| ID | Assumption / evidence gap | Evidence level | Influences | Probe / resolution | Status |
| --- | --- | --- | --- | --- |
| `4C-A01` | Phase-3 Workspace/Project semantic groupings are seeds, not automatic final navigation. | semantic architecture accepted; findability required 4C proof | global frame / IA | GF-01 competing hypotheses + operator walkthrough | VALIDATED for locked GF-01 baseline; later block terminology may still reopen locally |
| `4C-A02` | Relative task frequency/urgency and resulting navigation/layout priority are not established by Product authority. | no direct frequency analytics | later density/order hypotheses | use bounded operator/user/reference evidence only where material | OPEN |

No assumption authorizes a Product operation or backend behavior.

---

## 3. 4C-2 — Accepted end-to-end Product flow inventory

The Product contract owns fifteen whole-product journeys. 4C preserves them rather than inventing page-shaped flows.

| Journey | Accepted flow intent 4C must keep operable | Material truth to preserve |
| --- | --- | --- |
| A — first access / Workspace | Trusted provisioning/authentication establishes current Workspace context for an admitted human. | No F1 public signup; shared Account identity does not create cross-Workspace authority. |
| B — Project Inception / Baseline | Create/import a source-complete Project, run Inception from human intent + admitted source/context, inspect and ask about the exact candidate Baseline, explicitly refine that candidate when needed, approve the exact reviewed candidate and reach the current incremental Baseline. | Inception is not a fake Change; candidate and approved Baseline truths stay distinct; visual/chat state is not authority; refinement produces a new immutable candidate rather than mutating the reviewed one. |
| C — Plan / build / verify / publish | User intent becomes a bounded Change, proportional planning/execution, inspectable progress/Preview/diff/Evidence, verification and governed Release/Promotion. | Model narration is not Hub progress; Preview ready, VERIFIED, Release AVAILABLE and live serving remain distinct. |
| D — Brain assisted Discovery | Governed read-only source discovery/profiling produces candidate semantic mappings with provenance for human resolution. | Proposed/inferred knowledge is not confirmed authority. |
| E — Brain publish / bind / feedback | Reviewed Brain knowledge becomes immutable revision and a Project binds an exact revision. | No memory self-publish or mutable live inheritance. |
| F — Connection / Integration | A scoped Connection is configured through trusted write-only credential handling, qualified against the real environment and explicitly bound for Project use. | Credential material does not move into browser/chat/Project Git; scope/binding remain explicit. |
| G — Data / static Query / AnalyticQuery | Project uses the smallest admitted read path: registered Query and/or governed semantic AnalyticQuery. | No universal LIVE/MIRROR/HYBRID switch, arbitrary runtime SQL or unconstrained join topology. |
| H — publish/use business application | Verified output becomes an exact Release, passes current conformance/Promotion/serving proof and is consumed as a Published Application. | Control Plane/Builder and Published-App authority remain independent. |
| I — create/evolve Product Agent | Product-Agent authoring converges on the same governed Change/candidate/diff/proof/Release path. | No second Agent-definition authority or provider/runtime shortcut. |
| J — use Product Agent | Admitted user interacts with exact active Project-owned Agent; interactive and headless remain distinct surfaces. | No automatic repo/shell/browser/raw-network/raw-DB/raw-secret/Builder authority. |
| K — exact effect approval | Exact sealed proposal is exposed to a currently eligible approver, decided and revalidated before effect admission. | Changed proposal requires new authority; ambiguous outcome is not blind replay. |
| L — managed sync/job | Admitted `job/v1` in active Release produces governed occurrences/JobRuns through MAR. | Queue/scheduler/redelivery mechanics do not become a generic scheduler Product. |
| M — duplicate Project | Duplicate source/config/declarations into destination while preserving explicit authority boundaries. | Default no data; credentials/bindings are not cloned. |
| N — first vertical Budget Analyzer | Metal Nobre Workspace + Brain + Sankhya Connection/binding/read model support exact Budget Analyzer Queries and Published-App result. | Read-only vertical; truth/freshness/coverage/coordinates stay honest. |
| O — maintenance/reusable learning | New request, bug, source change, Finding or Brain update returns through governed Change against current context/proof. | Reusable learning stays in correct owners rather than hidden mutable agent memory. |

---

## 4. 4C-3 — Frontend reachability and consumer/disposition census

### 4.1 Derivation law

```text
fixed operation has HUMAN browser ingress CP or PA
→ frontend-reachable concrete operation

fixed operation has no CP or PA browser route
→ no browser consumer is invented
→ explicit disposition required
```

Multi-route operations count once in the fixed Product census.

### 4.2 Fixed-platform family census after 4C-F03

| Family | Fixed operations | Frontend-reachable now | No-direct-browser disposition |
| --- | ---: | ---: | ---: |
| Identity & Access | 16 | 16 | 0 |
| Workspace | 4 | 4 | 0 |
| Project | 23 | 23 | 0 |
| Builder | 17 | 17 | 0 |
| Brain | 11 | 11 | 0 |
| Connections | 9 | 9 | 0 |
| Release / Promotion / serving | 7 | 7 | 0 |
| Product Agent Runtime | 16 | 15 | 1 |
| Gateway inspection | 2 | 2 | 0 |
| Managed Application Runtime | 3 | 3 | 0 |
| Observability & Audit | 5 | 5 | 0 |
| **Fixed total** | **113** | **112** | **1** |

The sole fixed operation without a current browser-human route remains:

```text
PAR-05 RunProductAgentHeadless
principal / ingress = HUMAN_ACCOUNT_SESSION / HEADLESS
4C disposition      = NOT-HUMAN-FACING for direct browser UX
```

`PRJ-23 GetProjectBaselineCandidate` and `PRJ-24 AskConexusAboutBaselineCandidate` are browser-reachable because their real consumer is the same Journey-B/W-01 exact candidate review/refinement job. The added operation does not justify another screen or another Permission.

### 4.3 First Budget Analyzer

```text
BUD-01 AnalyzePendingBudgets = PUBLISHED_APP_HUMAN / PA
BUD-02 ListPendingBudgets    = PUBLISHED_APP_HUMAN / PA
```

So:

```text
Budget concrete operations      = 2
Budget frontend-reachable       = 2
Budget non-browser disposition  = 0
```

### 4.4 Semantic consumer contexts — not routes/screens

Current operations may be grouped only by accepted semantic consumer context:

```text
Control Plane shell / session context
Workspace administration and access
Project lifecycle / source bootstrap / Inception / exact candidate visual review+contextual explanation+refinement / approved Baseline / bindings / inspectability
Builder / review / Preview / source / Evidence
Brain discovery / review / publication / analytic use
Connections / qualification
Release / Promotion / serving state
Published Application business use
Published-App Product-Agent conversation
owner-specific approval context
Product-Agent trigger administration
Gateway effect evidence
managed job inspection/run-now
Project activity / usage / audit investigation
Budget Analyzer Published Application
```

This grouping does not freeze final route composition or visual layout.

---

## 5. Foundation falsifiers and recompile finding

The foundation fails if any accepted human journey requires fabricated Product authority, if the fixed matrix cannot classify every operation, if PAR-05 needs fake browser UX, or if frontend coverage requires a screen-shaped/BFF operation or parallel Product DTO authority.

`4C-F02` and `4C-F03` were valid downstream falsifiers from the same W-01 human journey. The accepted corrections remain Project-owner local: F02 made the candidate durable/re-readable; F03 made exact-candidate refinement and contextual explanation caller-expressible. The foundation recompiles those accepted operations rather than pretending an earlier census remains current.

No other material upstream contradiction is exposed by this recompile.

---

## 6. Exact closure assertions

```text
human_actor_contexts = 7
accepted_human_product_flows = 15
fixed_platform_operations = 113
fixed_frontend_reachable = 112
fixed_not_human_facing = 1 (PAR-05 RunProductAgentHeadless)
budget_frontend_reachable = 2
total_frontend_reachable_concrete_operations = 114
invented_frontend_product_operations = 0
invented_user_needs = 0
screen_shaped_product_authority = 0
parallel_frontend_product_dto_authority = 0
```

The foundation remains Evidence, not Product implementation authority.