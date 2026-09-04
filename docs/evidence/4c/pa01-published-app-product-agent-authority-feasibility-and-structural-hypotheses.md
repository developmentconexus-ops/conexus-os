# 4C PA-01 — Published-App Product-Agent Authority Feasibility + Structural Hypotheses

> **Status:** `PA-01 LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED`
> **Block:** `PA-01 — Published-App platform frame + Product-Agent surfaces`
> **Leading realization:** `COMPOSABLE AGENT EXPERIENCE — full-page, contextual panel and inline task hosts over one owner truth`
> **Methods:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.3.
> **Product implementation authority:** none.

This is the single PA-01 decision/Evidence owner. It consolidates the bounded authority map, human jobs, flows, coverage, references, hypotheses, accepted upstream findings and operator-locked functional proof. It is not Product authority and does not select an SDK, package, framework, runtime protocol or production component.

## 1. Decision question and target invariant

How should a person use a Project-designed Product Agent inside a Published Application, resume understandable work and resolve the exact items requiring that person's response without inheriting Control Plane IA or forcing every application into one chat layout?

Target invariant:

```text
one exact active Project Release
→ Project-designed business IA
→ one or more admitted Agent hosts
→ Conexus-owned Conversation / AgentRun / ApprovalRequest truth
→ current Published-App and owner authorization on every protected operation

host layout != Product authority
browser visibility != authorization
Mastra/Keycloak identity != Conexus Product identity or authority
```

## 2. P0 — bounded authority recovery

Accepted authority already establishes:

- Published Applications do not inherit the locked Control Plane shell;
- `IAM-13` owns exact current Published-App access, role and active Release context;
- `PAR-01..04` own Conversation list/detail/create and interactive turn admission;
- `PAR-06/07` own exact AgentRun state, time, output, safe problem and Evidence truth;
- `PAR-08..10` own the exact currently eligible approval queue, sealed subject and `ALLOW_ONCE | DENY` decision;
- the app's exact business IA and Product-Agent placement are Project-defined from the active Release;
- app roles `{admin, member}` do not by themselves confer effect-approval eligibility;
- `PAR-05` headless invocation and `PAR-11..16` trigger administration have no direct Published-App browser surface;
- F27 requires PA-01 to test full-page, contextual-side-panel and inline task/decision compositions;
- F29 defers concrete Agent Experience SDK/package/API selection to 4D.

Material boundaries:

```text
Keycloak = human authentication provider
Conexus I&A = Account/session/app-access owner
PAR = Conversation/AgentRun/ApprovalRequest owner
active Release = exact Agent and Project business composition
application = presentation composition and business IA
frontend = navigation + ephemeral interaction state only
```

## 3. Evidence classification

### Known

- A Published-App user can list/open/create a Conversation and send a turn to an exact active Agent.
- Turn admission returns an exact `agentRunId` and `releaseId`; admission is not completion.
- Conversation history is durable user-visible text; provider thread/session identity stays private.
- AgentRun detail can truthfully show owner state, admission/settlement time, output, safe problem and Evidence references.
- An eligible effect decision can be found at Project/app scope and shown inline at its interrupted work.
- A technical live stream may project one already-admitted AgentRun without becoming a seventeenth PAR Product operation.
- Keycloak Authorization Code + PKCE is authentication mechanism; Conexus issues its own opaque session and owns Product authorization.

### Inferred and tested at P8

- Agent-primary work benefits from a dedicated page; business-primary work benefits from contextual and inline hosts.
- A small app-scoped `Needs your decision` affordance improves urgent discovery without a universal notification center.
- A responsive composition can move a side panel to a full-height sheet while preserving the same Conversation and exact decision subject.

### Unknown / deferred

- final app brand, navigation labels, breakpoints and component design;
- concrete generated client, React bindings, headless hooks or accessible primitives — 4D/F29;
- exact live-stream/reconnect transport — 4D mechanism over admitted AgentRun truth;
- public/embed audiences, custom roles, notifications, e-mail/mobile delivery and cross-Project inboxes;
- proactive Agent outreach from SCHEDULE/headless work to an arbitrary human;
- Working/Observational/Semantic Recall memory and DurableAgent active-run recovery.

## 4. P1 — actors, jobs and needs

### J1 — enter the exact application safely

When entering a Published Application, I need to recognize which Conexus Account/session and app access are active, recover from expired access and end my session, so that I do not confuse authentication with business authority.

### J2 — start or continue a useful Agent conversation

When my business task benefits from an Agent, I need to recognize the exact Agent, find or create the right Conversation, supply relevant app context and send a turn, so that the Agent works inside the application rather than forcing me into the developer Control Plane.

### J3 — understand execution truth

After sending a turn, I need to distinguish admitted, progressing, completed and failed owner truth, inspect the truthful response/output and recover after navigation or reconnect, so that a disconnected stream is not mistaken for a failed or completed run.

### J4 — answer an Agent clarification

When the Agent needs a human answer rather than effect authorization, I need the Conversation and its app host to show that it needs my response, preserve the question/options and let my reply start the next exact run, so that the question does not disappear inside transcript text.

### J5 — make one exact effect decision

When an Agent proposes a governed consequence, I need to discover that a decision is currently mine, recognize the Agent/action/time, inspect the exact sealed subject and allow it once or deny it, so that approval is neither a generic chat reply nor blanket Agent authority.

## 5. P2 — end-to-end flows

### F1 — app entry/session

```text
app URL
→ unauthenticated: Conexus login redirect → Keycloak → server callback
→ opaque Conexus session
→ IAM-13 exact Account/app role/active Release context
→ Project-designed application

expired/denied/absent/dependency failure remain distinct
sign out ends the Conexus session; it does not claim global Keycloak-session termination
```

### F2 — conversation/use

```text
Project-designed Agent entry
→ recognize Agent from the exact active-Release application composition
→ PAR-01 list recognizable Conversations OR PAR-03 create one
→ PAR-02 open durable history
→ compose text + optional typed app-context refs
→ PAR-04 admits exact AgentRun
→ optional live projection over that exact run
→ PAR-07 owner state/output/problem + PAR-02 durable history
→ next likely business or conversation task
```

### F3 — clarification

```text
Agent completes a turn with an owner-persisted structured Conversation question
→ Conversation summary says NEEDS_YOUR_RESPONSE
→ user opens exact Conversation/question
→ user selects an offered answer or writes a response
→ PAR-04 reply references the exact open question message
→ owner rejects stale/already-answered question
→ new exact AgentRun is admitted
```

Clarification completes the prior run and begins a new run. It does not borrow effect-approval suspension or hold a model process open.

### F4 — exact approval

```text
app-scoped Needs your decision affordance OR inline interrupted run
→ PAR-08 current eligible requests only
→ PAR-09 exact request + sealed proposal
→ ALLOW_ONCE or DENY with expectedSubjectDigest
→ PAR-10 rechecks current eligibility/Release/subject
→ owner result; mechanical runtime continuation remains subordinate
```

## 6. P3 — coverage and feasibility

| Need | Owner | Reads | Writes | Access | Candidate context | Status |
| --- | --- | --- | --- | --- | --- | --- |
| current app/session recognition | I&A | `IAM-13` | `IAM-02` | authenticated app human + exact app access | minimal app frame/account menu | **F38 ACCEPTED / GREEN** |
| list/open/create Conversation | PAR | `PAR-01/02` | `PAR-03` | exact app access + active Release/Agent | full page, panel or inline host | **F37 ACCEPTED / GREEN** |
| send turn with app context | PAR | `PAR-02` | `PAR-04` | exact Conversation/app/Agent/Release | composer in chosen host | PRESENT-IN-AUTHORITY |
| inspect admitted run/outcome | PAR | `PAR-06/07` | none | exact in-scope app access | response status/run detail | PRESENT-IN-AUTHORITY |
| answer Agent clarification | Conversation/PAR | `PAR-01/02` | `PAR-04` | exact open question + app authority | transcript + app-scoped attention | **F37 ACCEPTED / GREEN** |
| discover exact eligible approval | PAR | `PAR-08` | none | `agent.effect.approve` + exact eligibility + app access | non-numeric app affordance + inline | PRESENT-IN-AUTHORITY |
| inspect/decide exact approval | PAR | `PAR-09` | `PAR-10` | same + sealed subject/current recheck | focused decision region | PRESENT-IN-AUTHORITY |
| headless invocation/trigger administration | PAR | none in app | none in app | non-browser/control-plane authority | no Published-App control | NOT-HUMAN-FACING HERE |
| proactive cross-channel notification | no accepted owner | none | none | undefined recipient/delivery authority | none | DEFERRED |

## 7. P4/P5 — candidate IA and surfaces

The application owns business navigation. PA-01 adds no universal Product navigation.

```text
MINIMAL PLATFORM FRAME
├── authentication/session recovery
├── current Account menu + Sign out
└── app-scoped Needs your decision affordance when PAR-08 has an item

PROJECT-DESIGNED APPLICATION
├── business routes and content
├── full-page Agent host where Agent work is primary
├── contextual Agent panel where business context is primary
└── inline Agent/decision region where the task itself is local
```

Material surfaces remain `PA-S01..05`; PA-01 does not invent an Agent catalog, universal chat bubble, global approval center or Control Plane rail.

## 8. P6 — bounded reference study

### Mitra

**Source observations:** Mitra exposes an embeddable runtime SDK with session creation/reconnect, stream events and history; its tool approval is mechanically gated with visible tool input, while its structured `AskUserQuestion` historically relied on a weaker turn boundary. Its runtime browser channel requires a logged-in user and its tool payload/history protocol has documented integrity limitations. Sources: [Mitra full study](../../research/mitra/full-study.md) and [captured structured-question Evidence](../../research/mitra/evidence/agent-question.html).

**Disposition:** preserve continuous/reconnectable interaction, visible exact decision input and structured question presentation. Strengthen by keeping Conexus Conversation/AgentRun/ApprovalRequest identities typed and owner-held, by making clarification durable without pretending it is effect approval, and by retaining independent headless authority. Reject Mitra task/session identity as Product authority and reject one mandatory visual host.

### Current Mastra

**Source observations:** current Mastra exposes agent streaming, memory thread/resource mechanics, tool-call approval/suspension and trace/stream primitives. These can support incremental rendering and mechanical continuation. Current source: [Mastra `agent.stream` documentation](https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/reference/streaming/agents/stream.mdx).

**Disposition:** mechanisms are PRESENT as implementation evidence only. `threadId`, run IDs, tool-call approval and stream completion do not replace Conexus Conversation, AgentRun, ApprovalRequest, Release pins or authorization. Concrete use remains F29/4D.

### Current Keycloak

**Source observations:** current Keycloak supports confidential Authorization Code flow, PKCE, realm/client roles, groups, Organizations and Authorization Services. Provider roles/policies can centralize authorization when an application elects Keycloak as its policy owner. Current sources: [Authorization Code flow](https://github.com/keycloak/keycloak/blob/26.5.2/docs/documentation/server_admin/topics/sso-protocols/con-oidc-auth-flows.adoc) and [Authorization Services overview](https://github.com/keycloak/keycloak/blob/26.5.2/docs/documentation/authorization_services/topics/auth-services-overview.adoc).

**Disposition:** Conexus has already made the opposite bounded ownership decision: Keycloak authenticates the human; Conexus I&A owns Account/session/app access and all Product authorization. PA-01 may redirect through the configured login flow but may not read provider directory/role/group/Organization truth as app authority.

## 9. P7 — credible structural hypotheses

### A — dedicated Agent workspace

Best when Agent conversation is the primary job. Strong history, long-form output and run inspection; excessive when the user primarily operates a business screen.

### B — contextual side panel

Best when the user must preserve a selected business object while asking the Agent. Weak at narrow widths and for dense/long Agent work unless it transforms into a full-height sheet/page.

### C — inline task/decision region

Best for a local question, result or exact approval in the flow. Poor as the only home for longer conversation history or cross-task continuation.

### Global-Maximum decision

No single visual host is globally correct. The sustainable structure is one framework-neutral Product interaction truth that the Project can compose as A, B or C according to the human job. The PA-01 P8 candidate must make all three operable over the same fixture identities and show transitions without duplicating Conversation or ApprovalRequest state.

This prepares the F29 seam without selecting the 4D SDK. The future paved road may offer generated/headless bindings and optional accessible primitives, but it must not force a shell or become Product authority.

## 10. Accepted upstream finding F37 — recognizable Conversation + durable clarification attention

### Evidence / root cause

`ConversationSummary` currently contains only `conversationId`, `projectId` and `agentId`; `ConversationMessage` has only role/text. There is no owner time/order/preview and no durable distinction between ordinary Agent text and a question requiring the person's response. A frontend could only display opaque IDs, infer chronology from array order/browser time or invent a local pending flag.

### Alternatives

1. **Plain transcript only:** smallest patch, but questions remain undiscoverable and Conversation history is not human recognizable. Rejected as a local maximum.
2. **Suspend the same AgentRun for every question:** mechanically strong but conflates clarification with consequential approval, retains unnecessary runtime execution state and adds recovery complexity. Rejected for current F1.
3. **PAR-owned structured Conversation question, prior run settles, reply starts a new run:** preserves conversational meaning, restart safety and the existing operations. **Leading Global Maximum.**

### Operator-accepted smallest realization

```text
ConversationMessage
→ owner createdAt
→ kind = TEXT | QUESTION
→ QUESTION may carry bounded responseOptions[]
→ USER reply may reference exact question message + selected option

ConversationSummary
→ owner startedAt + lastActivityAt + lastMessagePreview
→ attention = NONE | NEEDS_YOUR_RESPONSE
→ pendingQuestionMessageId only when current

PAR-01
→ order by lastActivityAt DESC + stable conversationId DESC before pagination

PAR-04
→ optional replyToQuestionMessageId / selectedOptionId
→ owner rejects absent, stale or already-answered question
→ admits a new exact AgentRun
```

No new Product operation, ordinary Permission, owner, principal, trust boundary or durable record class is required. This enriches existing PAR Conversation/message owner truth.

### Reopen triggers

- a real consumer requires one still-running AgentRun to await a non-effect answer;
- multiple humans collaboratively answer one Conversation question;
- proactive notification/delivery becomes a named Product requirement;
- response options need business-domain schemas beyond bounded presentation choices.

## 11. Accepted upstream finding F38 — Published-App Account/session continuity

### Evidence / root cause

`IAM-13` exposes only `projectId`, `activeReleaseId` and app role. `IAM-02 EndSession` is semantically for the authenticated human's exact Conexus session but its current wire ingress is Control Plane only. A Published-App frame therefore cannot truthfully show the current human or offer an admitted sign-out without querying Keycloak/browser claims or calling a Control Plane route.

### Alternatives

1. **No Account recognition or sign-out in the app:** minimal frame but poor security comprehension and no explicit session exit. Rejected.
2. **Read Keycloak token/profile and perform provider logout directly:** duplicates I&A presentation and couples Product UX to provider mechanics. Rejected.
3. **Enrich IAM-13 with canonical `AccountSummary` and admit IAM-02 on an app-session ingress:** reuses the current owners and one session meaning. **Leading Global Maximum.**

### Operator-accepted smallest realization

```text
IAM-13 success
→ canonical AccountSummary + exact projectId + activeReleaseId + app role

IAM-02 EndSession
→ also admitted from the Published-App session boundary
→ ends the exact Conexus opaque session
→ does not claim global Keycloak SSO logout
```

No new Product operation, ordinary Permission, owner, principal, trust boundary or durable record class is required. The bounded 4B recompile selected the shared `/api/session` Product path for the same exact Conexus session meaning across Control Plane and Published App.

### Reopen triggers

- Product requires global IdP logout rather than ending only the Conexus session;
- separate Control Plane and Published-App sessions become a real security/topology requirement;
- public/embed pre-auth application access is admitted.

## 12. Accepted recompile and functional proof

```text
PA-01 P0–P7 = COMPLETE
F37 = OPERATOR ACCEPTED / PAR PRODUCT+WIRE GREEN
F38 = OPERATOR ACCEPTED / I&A PRODUCT+WIRE GREEN
selected-realization proof = RED 0/2 → GREEN 2/2
Product census = 127 → 127
wire census = 127 ↔ 127 / PAR=16 / IAM=20
P8 HTML = LOCKED / OPERATOR APPROVED
approved final P8 artifact blob = 87551c6bc24f335a088c976cbfd560d102f63cf7
P9 = EXACT TRACE CLOSED
P10 = CONSOLIDATED
BUD-01 / P11 / 4D / Product implementation / merge = NOT AUTHORIZED
```

The bounded recompile changed only the implicated Product/wire owners and their exact references. The operator-approved functional artifact is [`pa01-published-app-product-agent-functional-wireframe.html`](pa01-published-app-product-agent-functional-wireframe.html). Repository proof covers the selected realization and structural obligations; the browser walkthrough additionally exercised all three host compositions, exact clarification reply → new AgentRun, one exact sealed approval decision, console cleanliness and the narrow-layout composition. The narrow walkthrough exposed and corrected an inaccessible fixed-panel overlap before this record was advanced.

## 13. Operator LOCK closure

The operator operated the functional candidate, requested a simpler explanation of its role inside a Project-developed Published Application, and then approved the resulting experience on 2026-08-26. That approval locks the exact artifact identified above. The canonical bidirectional trace and P10 consolidation now live in [`PA-01 Screen Contract`](pa01-published-app-product-agent-screen-contract.md).

The lock establishes the interaction structure only. It does not select the future Agent Experience SDK, React bindings, Mastra integration mechanism, visual design or production components, and it does not authorize BUD-01, P11, 4D, merge or Product implementation.
