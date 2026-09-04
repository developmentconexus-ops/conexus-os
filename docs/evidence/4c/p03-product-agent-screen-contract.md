# P-03 — Product Agent work Screen Contract

> **Status:** `LOCKED BASELINE / PRE11-F05 DELTA LOCKED / P12 FAMILY 4 IDENTITY DELTA RE-LOCKED / OPERATOR APPROVED`
> **Method:** Frontend Product Experience Planning Method v2.3
> **P9:** `P9 EXACT TRACE CLOSED`
> **P10:** `P10 CONSOLIDATED`
> **P11:** `P11 LATER ASSEMBLED PRODUCT`
> **Final operator-approved P8:** `docs/evidence/4c/p03-product-agent-functional-wireframe.html`
> **Exact artifact identity:** `approved final P8 artifact blob = dfc661a19aa43ad541e728e22849de5daf47fb47`
> **Exact PRE11-F05 delta identity:** `approved reference-presentation P8 artifact blob = b462c3bb536e0562d28ffb85ef9f6d44fb52df3a`
> **P12 Family 4 approved identity:** `approved Agent/ApprovalRun-egress P8 delta blob = 17d31534fac0e57a74f70202567b23d8a63cd3c0 / OPERATOR APPROVED 2026-08-28`
> **Accepted bounded upstream corrections:** `4C-F24..F30`
> **Product implementation authority:** none; `Product implementation = BLOCKED`.

---

## 1. Locked human experience

P-03 locks one Project-owned Agent workbench:

```text
Project → Agents
→ discover exact Project Agents as human-recognizable cards
→ discover exact effect decisions currently actionable by this human
→ open one exact Agent
   → Overview: identity + authored/Release posture
   → Definition: complete exact authored agent/v1
   → Automations: admitted SCHEDULE trigger administration
   → Runs: inspect exact AgentRun owner truth + Evidence
→ Edit Agent / New Agent
   → same P-01 Agent Studio + Builder Change path
```

The locked vocabulary and boundaries are:

```text
Agent definition != active Release != runtime health
Product Agent tool binding != provider/Mastra tool identity
Automations = admitted Agent SCHEDULE triggers only
Runs = Product AgentRun owner truth
Needs your decision = current eligible PAR effect approvals only
Allow once = one exact sealed subject, never “approve Agent”
Agent authoring = Builder Change/diff/proof/Release, never direct CRUD
Conversation/use = future PA-01 Published Application surface, not P-03
```

The operator-approved HTML remains low-fidelity Evidence. Its in-artifact `CANDIDATE / NOT LOCKED` markers are historical proof chrome; current LOCK authority lives in this Screen Contract and `docs/roadmap.md`. The prior P-03 identity remains the baseline historical blob; the PRE11-F05 reference-presentation delta is pinned to the exact approved blob above.

---

## 2. P9 — shell, route and information roles

P-03 inherits the locked GF-01 Project shell and does not create another application frame.

| Surface | Primary information role | Secondary role |
| --- | --- | --- |
| Agents landing | recognize Project-owned Product Agents | discover exact eligible effect decisions |
| Agent Overview | identity, purpose and authored/Release posture | distinguish definition from runtime health |
| Definition | inspect the complete exact authored `agent/v1` | inspect a separately governed capability contract when disclosed |
| Automations | administer exact current SCHEDULE trigger revisions | expose archive/narrowing laws |
| Runs | investigate owner-issued execution truth and Evidence | continue effect investigation to Project Activity |
| Exact approval | review one sealed proposal and current actionability | preserve Agent/run recognition context |
| Agent Studio handoff | enter the one governed authoring path | preserve exact Project/Agent/origin coordinates |

Route/navigation laws:

```text
Project rail → Agents                         = URL_NAVIGATION
Agents collection → exact Agent              = in-route master/detail state
Overview / Definition / Automations / Runs   = local tabs over independent owner reads
Edit Agent / New Agent → P-01 Agent Studio   = URL_NAVIGATION with coordinates only
Continue to Activity                         = P-04 boundary; no P-03 Gateway mutation
```

---

## 3. Agents landing trace

### 3.1 Agent collection

| Contract axis | Locked trace |
| --- | --- |
| Owner/read | Project / `PRJ-20 ListProjectProductAgents` |
| Identity source | exact Project containment + server-disclosed `agentId` |
| Human recognition | authored `definition.name` + `definition.purpose` summary projection |
| Release posture | `authoredRevisionId`, `releaseRefs[]`, `activeReleaseId`; presence never implies health |
| Client state | local search over only the disclosed loaded collection |
| Failures | loading, known-empty, denied/non-disclosable and dependency failure remain distinct |
| Success | whole-card target opens the exact Agent workspace |
| Forbidden | Workspace/fleet owner, direct Agent CRUD, runtime-health derivation, search beyond disclosed results |

### 3.2 New Agent

```text
New Agent
→ P-01 Agent Studio
→ BLD-03 exact Change intent
→ BLD-19 origin=NEW + Idempotency-Key
→ server-issued candidate Agent identity
→ same typed draft/diff/proof/Release path
```

The browser may carry `origin=NEW`; it cannot issue a live Agent identity or create a second Agent store.

### 3.3 Needs your decision

| Contract axis | Locked trace |
| --- | --- |
| Owner/read | PAR / `PAR-08 ListApprovalRequests` |
| Disclosure | exact currently eligible human under `agent.effect.approve` |
| Recognition | immutable request-time Agent snapshot, action summary, requested/expiry time and Release |
| Pagination | loaded-page count only; load-more follows owner `nextPageToken` when present |
| Empty | no currently actionable requests on the loaded owner truth |
| Forbidden | universal Approval Center, frontend eligibility calculation, cross-owner inbox |

---

## 4. Exact Agent Overview and Definition trace

### 4.1 Overview

| Contract axis | Locked trace |
| --- | --- |
| Owner/read | Project / `PRJ-21 GetProjectProductAgent` when source detail is disclosed; F24 summary otherwise |
| Identity | `agentId` + exact Project containment |
| Authored truth | `authoredRevisionId` + `releaseRefs[]` + `activeReleaseId` |
| Client state | selected Agent/tab only |
| Failure | inaccessible definition does not erase independently authorized Runs/Automations |
| Forbidden | infer health, readiness, execution or served verification from active Release presence |

### 4.2 Complete Definition

The locked Definition renders every accepted closed field from one exact `ProjectProductAgentDetail`:

```text
schemaVersion = agent/v1
name + purpose + instructions
modelPolicy.policyRef + optional sampling
tools[] = capabilityId + authored binding purpose
brainContext.mode = PROJECT_BOUND + contextRefs[]
memory.mode
interactions[]
policyRefs[]
approvalPolicyRefs[]
budgetPolicyRefs[]
verificationRefs[]
knownLimitations[]
```

Optional sampling absence is presented as “use policy default”; the frontend does not synthesize provider values.

### 4.3 Capability disclosure

| Layer | Owner/read | Presentation law |
| --- | --- | --- |
| Agent binding | PRJ-21 / Product Agent definition | exact `capabilityId` + why this Agent may use it |
| Capability contract | PRJ-17 / Project Capability | human name/purpose, regime, operation identity and logical inputs/outputs |

The second layer is progressive, separately governed inspection truth. It does not widen the Agent binding, grant invocation or turn a Project capability into a provider/Mastra tool identifier.

Framework-specific system prompt, skill, workflow and tool representations remain mechanisms, not Product fields. Working/observational/semantic memory, EVENT triggers, subagents/networks, MCP/A2A and browser/source/workspace authority remain deferred.

### 4.4 PRE11-F05 reference-presentation delta

The operator-approved delta enriches only the existing read-only Definition region. Each owner remains independently disclosed; P-03 does not join or normalize owner truth into a new reference authority.

| Definition region | Owner/read truth | Presentation and material states | Forbidden frontend authority |
| --- | --- | --- | --- |
| Model policy | `PRJ-29` `ListProjectModelPolicies` | disclose exact `policyRef` with human label/purpose, server `isDefault` and bounded sampling limits when available; preserve exact ref when detail is withheld/unresolved; only owner `422` is invalid | provider/model identity, credentials, runtime override or client-selected default |
| Capability binding | PRJ-21 exact `capabilityId` + authored binding purpose; progressive `PRJ-16/17` contract detail | show human capability name/purpose/regime and logical contract only when separately disclosed; exact binding/purpose remain visible when detail is withheld | invocation, business-data access, or Mastra/provider tool identity |
| Project Brain context | `BRN-14` purpose-bound Project Brain context | show exact server-issued `authoringRef`, label/summary/content classes; `detailDisclosed=false` renders “Details withheld by current authority” and suppresses sections/provenance; `conceptRef` is not the authoring identity | Workspace Brain browse/publication, runtime effective slice or browser-composed context |
| Unowned optional references | exact arrays from PRJ-21 `ProductAgentDefinition` | show `policyRefs`, `approvalPolicyRefs`, `budgetPolicyRefs` and `verificationRefs` as protected exact IDs only; no semantic label is inferred | free-text editing, invented policy catalog or cross-owner reference join |

The bounded owner state vocabulary remains `LOADING`, `KNOWN_EMPTY`, `DENIED`, `NON_DISCLOSABLE`, `DEPENDENCY_FAILURE` and `READY`. Per-reference presentation distinguishes `DISCLOSED`, `DETAIL_WITHHELD`, `EXACT_UNRESOLVED` and `SERVER_INVALID`; absence from a current list is not invalidity. Existing Definition, Automations, Runs, approval, paging, permission-composition and coordinate-only P-01 handoff traces remain unchanged.

---

## 5. Edit Agent handoff trace

```text
P-03 Edit Agent
→ URL carries agent-studio=1 + origin=EXISTING + agentId
→ P-01 re-resolves exact ProductAgentDetail
→ URL name/purpose/revision/Release values are not trusted
→ BLD-03 + BLD-19 establish the exact Change draft
→ BLD-18 reloads current server draft
→ BLD-20 revises only expectedDraftRevision
→ BLD-07 exposes complete candidate diff
```

Permission law:

```text
project.source.read != project.read != agent.trigger.manage != project.build
```

Definition, Runs, Automations and authoring controls therefore remain independently disclosed/disabled. Visible Agent identity never grants another permission.

---

## 6. Automations trace

| Control/region | Owner operation | Identity/concurrency | Success/failure law |
| --- | --- | --- | --- |
| List | `PAR-11 ListAgentTriggers` | exact Project + Agent; owner paging | SCHEDULE only; loaded page never claims whole result set |
| Detail | `PAR-12 GetAgentTrigger` | `triggerId` + `triggerRevisionId` | current cron/time zone/state only |
| Create disabled | `PAR-13 CreateScheduleTrigger` | Idempotency-Key | created disabled for explicit review |
| Save new revision | `PAR-14 ReviseScheduleTrigger` | ETag / If-Match | stale revision fails closed |
| Enable | `PAR-15 EnableAgentTrigger` | `expectedTriggerRevisionId` | exact current revision only |
| Disable | `PAR-16 DisableAgentTrigger` | owner-current narrowing | remains admitted for archived Project |

Archive does not stop already-enabled automations. Archived Project blocks create/revise/enable but preserves explicit disable as narrowing. Enabled does not mean healthy or running.

---

## 7. Runs trace

| Contract axis | Locked trace |
| --- | --- |
| Owner reads | PAR / `PAR-06 ListAgentRuns`, `PAR-07 GetAgentRun` |
| Ordering | `admittedAt DESC`, then `agentRunId DESC` |
| Identity | `agentRunId`, exact Agent, exact `releaseId` |
| Origin | `INTERACTIVE`, `HEADLESS` or `SCHEDULE`; conversation/trigger coordinate only when owner provides it |
| Detail | current state, admitted/settled time, safe structured output, safe problem/remediation, `evidenceRefs[]` |
| Paging/filter | owner page first; local state filter is explicitly current-results-only |
| Continuation | `Activity → Effects` with exact untrusted `originatingRun.kind + originatingRun.ref`; Gateway `GW-01` filters server-side before pagination and P-04 revalidates `audit.read` |

The continuation carries no PAR detail authority into P-04. It never filters only a loaded browser page, never infers effect success from AgentRun completion and never admits retry/replay/reconciliation controls.
| Forbidden | retry, resume, mark succeeded, framework run/thread/tool-call identity, terminal-state derivation |

`COMPLETED` never means every external effect succeeded. Output/Evidence presentation never becomes runtime terminal authority.

---

## 8. Exact approval trace

| Control/region | Owner operation | Binding law |
| --- | --- | --- |
| Open request | `PAR-09 GetApprovalRequest` | exact `approvalRequestId`; approver and investigator routes remain distinct |
| Sealed subject | PAR proposal ref/digest + exact proposal | changed subject requires a new request |
| Allow once | `PAR-10 DecideApprovalRequest` | `decision=ALLOW_ONCE` + `expectedSubjectDigest` |
| Deny | `PAR-10 DecideApprovalRequest` | `decision=DENY` + `expectedSubjectDigest` |

STALE, EXPIRED or eligibility-revoked requests preserve the reviewed context and remove actions. The browser never selects eligibility or transforms an ineligible request back into ACTIONABLE.

The accepted UI shows the owner-provided originating `agentRunId`. Richer safe run context for an approver without `project.read` remains a narrow upstream reopen question; the frontend may not unauthorizedly join PAR-07.

---

## 9. Client-state and accessibility contract

```text
SERVER
→ Agent summaries/detail, trigger revisions, AgentRuns, ApprovalRequests, decisions

URL_NAVIGATION
→ Project/Agent/origin coordinates only

EPHEMERAL_UI
→ selected Agent/tab, search text, loaded-results filter, open disclosure/drawer, unsaved form values
```

Locked accessibility/responsive obligations:

- whole-card Agent targets are keyboard reachable;
- tabs use tab/tabpanel semantics and remain horizontally reachable at compact widths;
- drawers are modal, trap focus, close with Escape and return focus;
- actionable/non-actionable state is not color-only;
- mobile stacks cards, records and decision actions without hiding the reviewed subject;
- reduced-motion preference is preserved;
- loading, empty, denied and failed states remain semantically distinct.

---

## 10. Backend sufficiency and retained reopen seams

P9 found no contradiction invalidating the locked P8. Current PRJ-20/21, BLD-18..20 and PAR-06..16 are sufficient for the locked fixture-level structure.

Two future consumers remain explicit reopen seams rather than hidden frontend assumptions:

1. human-recognizable capability/policy/reference discovery for a creator possessing `project.build` without the separate read permissions;
2. richer approval-owned originating-run context for an eligible approver lacking `project.read`.

Neither seam blocks this lock because the approved P8 truthfully presents current disclosure boundaries and does not fabricate the missing joins.

`4C-PRE11-F05` proved the first seam material and the operator locked only the bounded reference-presentation/handoff delta. Capability details use purpose-bound PRJ-16/17; Brain selections use BRN-14 `authoringRef`; model-policy recognition uses PRJ-29. Unowned optional refs remain exact but non-editable until an owner exists. Overview/Definition/Automations/Runs, approval semantics and the P-01 handoff structure otherwise remain locked.

The approved PRE11-F05 delta is the same canonical P-03 HTML, pinned to `b462c3bb536e0562d28ffb85ef9f6d44fb52df3a`; the prior P-03 baseline identity remains preserved above as historical Evidence. The delta has no new operation, Permission, owner, catalog, editor, durable record or runtime authority.

---

## 11. P10 — pattern consolidation

Patterns reused because their protected semantics repeat:

```text
GF-01 single Project shell
W-04/P-02 whole-card recognition + progressive technical disclosure
P-01 one Builder Change/diff/proof/Release authoring path
P-02 inspect-first owner detail
owner paging + honest loaded-result wording
exact revision/digest concurrency + explicit stale state
focused drawer + focus return
loading != empty != denied != failed
```

Patterns deliberately not generalized:

```text
universal resource detail
universal workflow/automation domain
universal Approval Center
generic Agent configuration framework
frontend-composed authorization/health/effective runtime state
```

PRE11-F05 P10 reconciliation:

```text
owner-backed human recognition + exact technical refs → existing progressive-disclosure grammar
withheld/unresolved owner detail                         → existing honest state vocabulary
protected optional arrays                                → existing read-only exact-reference presentation
P10 new graduated shared patterns                        = 0
```

The reference delta does not graduate a generic resource/reference component, cross-owner catalog, editor or authorization abstraction.

---

## 12. Lock disposition

```text
P-03 P8 = LOCKED / OPERATOR APPROVED
P-03 P9 = EXACT TRACE CLOSED
P-03 P10 = CONSOLIDATED
P-01 Agent Studio delta = RE-LOCKED / OPERATOR APPROVED
P-03 PRE11-F05 reference-presentation delta = LOCKED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED / blob b462c3bb536e0562d28ffb85ef9f6d44fb52df3a
P-01 PRE11-F05 Agent Studio reference delta = LOCKED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED / blob 8ff34e12ab35ee69f8ffaff1bdd0a8274ac62cec
P11 = NOT ASSEMBLED
P-04 / P11 / 4D / Product implementation = NOT AUTHORIZED
```

Only a named material falsifier may reopen the smallest affected P-03/P-01 owner. This lock does not authorize merge or implementation.
