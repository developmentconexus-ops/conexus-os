# PA-01 — Published-App Product Agent Screen Contract

> **Status:** `P12 FAMILY 3 RE-LOCKED / P12 FAMILY 4 APPROVAL-RUN DELTA RE-LOCKED / OPERATOR APPROVED`
> **Method:** Frontend Product Experience Planning Method v2.3
> **P9:** `P9 EXACT TRACE CLOSED`
> **P10:** `P10 CONSOLIDATED`
> **P11:** `P11 LATER ASSEMBLED PRODUCT`
> **Final operator-approved P8:** `docs/evidence/4c/pa01-published-app-product-agent-functional-wireframe.html`
> **Exact artifact identity:** `approved final P8 artifact blob = 87551c6bc24f335a088c976cbfd560d102f63cf7`
> **P12 Family 3 re-locked identity:** `approved IAM-13 ingress P8 delta blob = 612ec41d91104e01b3942f7d90f35c37ad89c9f0 / OPERATOR APPROVED 2026-08-28`
> **P12 Family 4 approved identity:** `approved approval-run-egress P8 delta blob = ffba5935d8fccd0fc5d7ad4d275fe38b09294674 / OPERATOR APPROVED 2026-08-28`
> **Accepted bounded upstream corrections:** `4C-F37..F38`
> **Product implementation authority:** none; `Product implementation = BLOCKED`.

---

## 1. Locked human experience

PA-01 locks an application-composable Product-Agent experience inside a Project-designed Published Application:

```text
MINIMAL CONEXUS APP FRAME
├── current Account/session recognition + Conexus sign-out
└── app-scoped Needs your decision affordance when an exact eligible item exists

PROJECT-DESIGNED PUBLISHED APPLICATION
├── business IA and context from the exact active Release
└── Product Agent host selected by the Project/job
    ├── dedicated full page when Agent work is primary
    ├── contextual panel when business context is primary
    └── inline task/decision region when the work is local
```

The three host compositions project one Conexus-owned Conversation, AgentRun and ApprovalRequest truth. They are not three Agent systems, and the P8 comparison controls are review Evidence rather than mandatory final-app controls.

Locked truth laws:

```text
Published Application != Control Plane
Project-designed business IA != universal Conexus app shell
host composition != Product authority
Conversation clarification != effect approval
question-producing AgentRun settles; exact reply starts a new AgentRun
stream connected/disconnected != AgentRun owner state
AgentRun COMPLETED != every external effect succeeded
app role != approval eligibility
ALLOW_ONCE != standing Agent authority
Keycloak authentication != Conexus Account/session/app authorization
```

The operator-approved HTML remains low-fidelity Evidence. Its in-artifact `P8 CANDIDATE / NOT LOCKED` marker is historical; current LOCK authority lives here and in `docs/roadmap.md`, pinned to the exact blob above.

---

## 2. P9 — surfaces and information roles

| Surface | Primary information role | Secondary role |
| --- | --- | --- |
| Minimal app frame | recognize the application, current Conexus Account and app-scoped attention | end the exact Conexus session |
| Project business surface | complete the Project-defined business job under the active Release | provide typed context to an admitted Agent host |
| Agent entry/host | recognize the exact Agent and preserve the current business context | choose the Project-authored full-page, panel or inline composition |
| Conversation rail | resume recognizable newest-active work and find pending human response | create a new exact Conversation |
| Transcript + composer | understand durable text/questions and send one exact turn or clarification reply | attach bounded typed app-context references |
| Exact run region | distinguish admission from owner settlement and inspect safe outcome/problem truth | retain exact Release/run provenance |
| Needs-your-decision region | discover and inspect one currently eligible exact sealed proposal | record `ALLOW_ONCE | DENY` after current revalidation |

Placement law:

```text
business navigation and exact Agent placement = active Project Release composition
full page / contextual panel / inline task       = Project-selected presentation
Conversation / AgentRun / ApprovalRequest        = Conexus Product owner truth
review mode/scenario controls                    = P8 proof chrome only
```

PA-01 creates no universal chat bubble, cross-Project inbox, Control Plane rail or fixed final route. A production Project may use one or more locked host compositions according to the admitted human job.

---

## 3. Account, app access and session trace

| Contract axis | Locked trace |
| --- | --- |
| Current app context | I&A / `IAM-13 GetPublishedAppAccessContext` |
| Recognition | canonical `AccountSummary` + exact `projectId` + `activeReleaseId` + `admin|member` app role |
| Session exit | I&A / `IAM-02 EndSession` through the shared `/api/session` Product path |
| Exit consequence | end only the exact current opaque Conexus session |
| Material failures | unauthenticated/session-expired, denied and non-disclosable/absent remain distinct |
| Forbidden | Keycloak token/profile as Product presentation owner; provider roles/groups/Organizations as app authority; claim of global Keycloak SSO logout |

The app role supports current Published-App access consequences only. It grants neither Control Plane access nor `agent.effect.approve`.

---

## 4. Conversation and clarification trace

| Control / truth | Owner operation | Binding and success law |
| --- | --- | --- |
| Recognizable Conversation list | `PAR-01 ListConversations` | exact Project/Agent/app disclosure; `lastActivityAt DESC`, then stable `conversationId DESC`; preview and attention are owner truth |
| Exact transcript | `PAR-02 GetConversation` | durable typed `TEXT | QUESTION` messages under current app/Agent authority; provider thread/session identity stays private |
| New Conversation | `PAR-03 CreateConversation` | exact active Release + Agent + current app access + Idempotency-Key; caller cannot configure model/runtime/memory |
| Ordinary turn | `PAR-04 SendProductAgentTurn` | exact Conversation/app/Agent/Release + text + optional typed context refs; returns exact admitted AgentRun/Release identity |
| Clarification reply | `PAR-04 SendProductAgentTurn` | exact still-open `replyToQuestionMessageId` + optional bounded `selectedOptionId`; stale/already-answered question is rejected; a new AgentRun is admitted |

Conversation attention is `NONE | NEEDS_YOUR_RESPONSE`. It is durable owner truth, not a local unread badge or inference from the last text. Clarification completes the prior run and begins a new run; it never borrows ApprovalRequest or ordinary-run suspension semantics.

Material list, detail, creation and dependency failures remain explicit:

```text
loading != known-empty != denied != dependency failure
question open != question stale/already answered
turn admitted != turn completed
```

---

## 5. AgentRun and live-projection trace

| Contract axis | Locked trace |
| --- | --- |
| Run collection | `PAR-06 ListAgentRuns` filtered to exact in-scope Project/Agent/Conversation and ordered by owner admission time |
| Exact run | `PAR-07 GetAgentRun` |
| Owner truth | exact `agentRunId`, `releaseId`, `runState`, `admittedAt`, optional `settledAt`, output, safe problem and Evidence references where returned |
| Technical projection | optional live stream/reconnect may project an already-admitted run |
| Recovery | refresh/reconnect re-reads PAR Conversation/AgentRun owner truth rather than inferring from stream state |
| Forbidden | browser/Mastra run or thread identifiers as Product identity; stream end as completion; retry/resume command invented from inspection |

`PAR-05 RunProductAgentHeadless` and trigger administration remain non-human-facing in PA-01. Headless admission can produce owner facts later visible only when an independently admitted Published-App surface and current disclosure exist.

---

## 6. Exact approval trace

| Control / truth | Owner operation | Binding and success law |
| --- | --- | --- |
| App-scoped attention | `PAR-08 ListApprovalRequests` | current eligible approver only; exact Project/app access/Release plus `agent.effect.approve` and owner eligibility |
| Exact decision subject | `PAR-09 GetApprovalRequest` | request-time Agent/action/time recognition plus current exact sealed proposal and digest |
| Allow once / deny | `PAR-10 DecideApprovalRequest` | exact `ALLOW_ONCE | DENY` + `expectedSubjectDigest`; recheck current eligibility, revocation, Release and sealed subject |

`409/412` stale or changed state refuses the decision and requires refresh. `403` denial grants nothing. A changed proposal requires a new request; the frontend may not silently approve the replacement. Mechanical Mastra continuation and Gateway effect admission remain subordinate mechanisms after the PAR owner decision.

The small `Needs your decision` affordance is app-scoped discovery, not a universal Approval Center. Its absence does not prove that no historical request exists; it means no currently eligible actionable item was returned for that app context.

---

## 7. State ownership, authorization and structural obligations

```text
SERVER
→ Account/session/app access, active Release, Agent identity/composition,
  Conversation/message chronology and attention, AgentRun state/provenance,
  ApprovalRequest eligibility/sealed subject and every command outcome

PROJECT_RELEASE_COMPOSITION
→ business navigation, typed business context and admitted Agent host placement

TECHNICAL_PROJECTION
→ optional incremental rendering/reconnect for one already-admitted AgentRun

EPHEMERAL_UI
→ selected Conversation, open/closed host or drawer, selected offered answer,
  unsent composer text, local focus and review-only scenario controls
```

The frontend never owns app authorization, Agent execution state, question-open state, approval eligibility or a normalized parallel Product DTO registry.

Locked accessibility/responsive obligations:

- semantic navigation, regions, conversation targets, message articles, labeled composer and decision dialog;
- keyboard-operable offered answers and material actions;
- Escape closes the top overlay and focus returns to its trigger;
- attention, run state and decision status do not depend on color alone;
- the contextual panel remains in document flow at narrower widths so review/app controls stay reachable;
- Conversation rail and host columns stack/scroll without removing durable history or exact decision facts;
- reduced-motion preference is preserved;
- session-expired, access-denied, known-empty, dependency-failure, stale-question and stale-approval states remain independently inspectable.

---

## 8. Backend sufficiency and retained reopen seams

P9 found no contradiction invalidating the locked P8. `IAM-02/13` and `PAR-01..04/06..10` are sufficient after F37/F38 without a new operation, Permission, owner, principal, trust boundary or durable record class.

Explicit deferred seams remain:

1. concrete Agent Experience SDK/headless React bindings/accessible primitives — comparative 4D/F29 decision;
2. exact live-stream and reconnect transport over admitted AgentRun truth — 4D mechanism;
3. proactive cross-channel delivery/notification and arbitrary recipient selection;
4. public/embed audiences, custom app roles and cross-Project inboxes;
5. Working/Observational/Semantic Recall memory presentation and active-run recovery;
6. final brand, exact routes, visual design, breakpoints and production components.

These do not block the lock because PA-01 honestly represents current F1 owner truth and prepares the future composable seam without selecting its implementation.

Reopen only if a named consumer proves a material need for a single still-running AgentRun to await ordinary clarification, collaborative multi-human answers, proactive delivery, a universal cross-Project decision surface, public/embed access, or a different session topology.

---

## 9. P10 — pattern consolidation

Patterns reused because their protected semantics repeat:

```text
GF-01/P-05 minimal current-Account/session recognition without client authorization
P-03 responsive whole-Agent recognition and owner-paged Conversation/Run collections
P-03 exact request-time Agent/action/time recognition + sealed approval subject
exact current-state refusal + explicit stale recovery
app/business context preserved while focused Agent work opens
Escape/focus return + semantic dialog/controls
loading != empty != denied != dependency failure
owner completion != subordinate external-effect success
```

Patterns newly observed but deliberately not generalized before repetition:

```text
one Product-Agent truth composable as full page / contextual panel / inline task
app-scoped non-numeric Needs-your-decision affordance
structured clarification options attached to durable Conversation QUESTION truth
```

Patterns deliberately rejected:

```text
universal chat bubble or mandatory shell
Control Plane navigation inside Published Applications
generic notification/approval center
frontend-derived question attention or approval eligibility
session-wide/standing Agent effect authorization
browser-direct Mastra/Keycloak authority
production SDK/component API selected from low-fi fixture code
```

---

## 10. Lock disposition

```text
PA-01 P8 = LOCKED / OPERATOR APPROVED
PA-01 P9 = EXACT TRACE CLOSED
PA-01 P10 = CONSOLIDATED
P11 = NOT ASSEMBLED
BUD-01 / P11 / 4D / Product implementation / merge = NOT AUTHORIZED
```

Only a named material falsifier may reopen the smallest affected PA-01 or upstream owner. This lock does not authorize BUD-01, P11, merge or Product implementation.
