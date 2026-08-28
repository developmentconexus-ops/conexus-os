# 4C P-03 — Product Agent Work Authority Feasibility + Structural Hypotheses

> **Status:** `P-03 LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED`
> **Block:** `P-03 — Agents + triggers + runs + exact approvals`
> **Leading hypothesis:** `A — Project Agent workbench with owner-specific decisions`
> **Methods:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.3.
> **Product implementation authority:** none.

## 1. Decision question

What is the smallest coherent Project experience in which a human can recognize one Product Agent, understand its authored/Release posture, administer admitted schedules, investigate runtime runs and decide an exact eligible effect proposal without turning the frontend into Agent, authorization, runtime, scheduler, audit or effect authority?

P-03 tests current Product/backend authority as a falsifiable baseline. It does not begin P8 while a material human job depends on opaque IDs, missing temporal truth or frontend-composed authority.

## 2. P0 — bounded authority pack

### 2.1 Semantic owners

```text
Project / authored agent/v1
→ Product Agent human identity, purpose, authored revision and Release references

Builder / Change
→ create or evolve Agent source through the normal Build/diff/proof/Release path

PAR
→ Conversation, AgentRun, ApprovalRequest and AgentTrigger owner truth

Gateway
→ external effect admission, idempotency, attempt and reconciliation truth

I&A
→ current human eligibility and Permission truth
```

### 2.2 Human-facing operations in this Control Plane block

```text
PRJ-20 ListProjectProductAgents
PRJ-21 GetProjectProductAgent

PAR-06 ListAgentRuns
PAR-07 GetAgentRun

PAR-08 ListApprovalRequests
PAR-09 GetApprovalRequest
PAR-10 DecideApprovalRequest

PAR-11 ListAgentTriggers
PAR-12 GetAgentTrigger
PAR-13 CreateScheduleTrigger
PAR-14 ReviseScheduleTrigger
PAR-15 EnableAgentTrigger
PAR-16 DisableAgentTrigger
```

Explicit dispositions:

```text
PAR-01..04 Conversation/use = PA-01 Published Application, not P-03
PAR-05 RunProductAgentHeadless = NOT-HUMAN-FACING for direct browser UX
Agent create/evolve = P-01 Build handoff, not direct Agent CRUD
Gateway attempts / Project Activity / usage = P-04 owner surfaces
```

### 2.3 Permission boundaries

```text
PRJ-20/21 authored Agent inspection → project.source.read
PAR-06/07 Control Plane run inspection → project.read
PAR-08/09/10 approver route → agent.effect.approve + exact current eligibility
PAR-09 investigator route → audit.read / read-only only
PAR-11..16 trigger administration → agent.trigger.manage
```

Binding negative laws:

```text
project.read -X-> project.source.read
agent.trigger.manage -X-> project.source.read
agent.effect.approve -X-> project.read / project.source.read
surface visibility -X-> decision eligibility
AgentRun COMPLETED -X-> every effect succeeded
activeReleaseId -X-> Agent healthy / running / ready
run output / Evidence -X-> runtime terminal authority
```

### 2.4 State and concurrency laws

```text
Trigger create → Idempotency-Key
Trigger revise → exact same-target ETag / If-Match
Trigger enable → exact expected TriggerRevision
Trigger disable → OWNER_CURRENT narrowing; remains allowed for archived Project

Approval decision → expectedSubjectDigest
changed sealed proposal → new authority
ALLOW_ONCE → current eligibility/Release/policy/budget recheck before Gateway admission
STALE / EXPIRED → owner outcome, never caller-selected decision
```

## 3. P1 — actors, jobs and needs

### J1 — understand one exact Project Agent

When I enter Agents from a Project or the Workspace Agent catalog, I need to recognize the exact Agent, its purpose, authored revision and Release presence so that I know what I am operating and where a source change must occur.

### J2 — administer a schedule safely

When an Agent should run on a recurring schedule, I need to understand the current schedule/time zone and enabled state, then create, revise, enable or disable the exact current revision so that automation changes do not silently race or widen archived-Project behavior.

### J3 — investigate a run

When an Agent has run or appears stuck/failed, I need to find the relevant run by human Agent context and time, understand origin/current state/Release, inspect safe output/problem/Evidence and distinguish runtime completion from effect outcome so that I can choose the next owner-specific investigation.

### J4 — make an exact eligible decision

When an Agent waits on a governed effect, I need to discover the requests currently actionable by me, recognize the Agent/action/consequence, inspect the exact sealed subject and allow it once or deny it so that the decision is informed and bound to what I actually reviewed.

Relative frequency and urgency remain an explicit assumption: run inspection is expected to be more frequent than schedule revision; an actionable approval is less frequent but more urgent and consequential. A real consumer may falsify ordering/density at P8.

## 4. P2 — end-to-end flows

### F1 — Agent entry and authoring handoff

```text
Project → Agents OR W-04 Open Agent
→ re-resolve exact Project + Agent authority
→ recognize name/purpose/revision/Release presence
→ inspect permitted operational work
→ Change with Conexus
→ explicit P-01 Build boundary with exact Agent context
```

No direct Agent metadata editor is created.

### F2 — schedule administration

```text
exact Agent → Automations
→ understand current schedules + time zones + enabled state
→ create disabled schedule OR open exact trigger
→ revise exact ETag-bound schedule
→ explicitly enable exact TriggerRevision
OR disable current trigger as narrowing
→ server response becomes current truth
```

Material branches: archived Project blocks create/revise/enable but must continue to admit disable; stale revision does not silently overwrite; invalid cron/time zone remains a validation failure.

### F3 — run investigation

```text
exact Agent → Runs
→ scan owner-ordered run summaries
→ identify origin + time + Release + state
→ open exact AgentRun
→ inspect output/problem/Evidence
→ if an effect is implicated, continue to the P-04 Gateway/evidence boundary
```

Unknown effect outcome remains unknown. No Retry/Mark succeeded/Resume shortcut is invented.

### F4 — exact approval

```text
Project Agents → Needs your decision
→ PAR-08 current eligible queue only
→ recognize human Agent/action/time/current state
→ open exact PAR-09 sealed subject + originating run context
→ ALLOW ONCE or DENY with expectedSubjectDigest
→ current PAR result
→ runtime/Gateway continuation remains server-owned
```

Conflict/stale/expired/eligibility-revoked response keeps the previously reviewed subject visible but non-actionable and requires a fresh owner read. It never becomes a generic retry.

## 5. P3 — bounded frontend coverage

| Human need | Owner | Reads | Writes | Access/security | Candidate context | Status |
| --- | --- | --- | --- | --- | --- | --- |
| recognize exact authored Agent | Project | `PRJ-20/21` | none; authoring hands off to P-01 | `project.source.read` | Agents collection + exact Agent overview | PRESENT-IN-AUTHORITY for source readers; F24 for trigger-only actors |
| administer schedules | PAR | `PAR-11/12` | `PAR-13..16` | `agent.trigger.manage`; current revision rules | exact Agent → Automations | F24 UPSTREAM FINDING |
| inspect runs | PAR | `PAR-06/07` | none | Control Plane `project.read` | exact Agent → Runs + run detail | F26 UPSTREAM FINDING |
| discover eligible approvals | PAR | `PAR-08` | none | exact current approver eligibility | Project-scoped owner-specific queue | F25 UPSTREAM FINDING |
| inspect/decide exact approval | PAR | `PAR-09` | `PAR-10` | approver vs investigator separation | exact approval + originating run context | exact sealed subject is present; F25 affects recognition/discovery |
| direct browser headless invocation | PAR | none | none | HEADLESS only | no browser surface | NOT-HUMAN-FACING |
| interactive Conversation/use | PAR | `PAR-01/02` | `PAR-03/04` | exact Published-App access | PA-01 only | DEFERRED TO PA-01 |
| inspect exact effect attempt | Gateway | `GW-01/02` | none | `audit.read` | P-04 continuation | DEFERRED TO P-04 |

## 6. P4/P5 — candidate IA and material surfaces

```text
Project
└── Agents
    ├── Needs your decision       Project-scoped PAR approval work, only when disclosed
    ├── Agent collection          exact Project-owned authored Agents
    └── Exact Agent workspace
        ├── Overview              identity / purpose / authored revision / Release presence
        ├── Automations           admitted SCHEDULE triggers only
        └── Runs                  owner run history + exact run detail
```

Material surfaces:

| Surface | Kind | Truth / decision |
| --- | --- | --- |
| Project Agents landing | route/page | collection, source-aware create/evolve handoff and owner-specific actionable-decision region |
| Exact Agent workspace | route/page | human identity and operational context; not an editor or runtime console |
| Automations | material region | list/detail/create/revise/enable/disable exact SCHEDULE triggers |
| Runs | material region + contextual detail | inspect AgentRun owner truth while preserving Agent context |
| Needs your decision | Project-level material region | discover only exact currently eligible PAR approvals; not a universal Approval Center |
| Exact ApprovalRequest | focused panel/dialog | inspect sealed subject, run context and decide once/deny |

Terminology:

```text
Automations = human label for admitted Agent SCHEDULE triggers only
Runs = Product AgentRun owner facts
Needs your decision = currently eligible PAR effect approvals only
Allow once = exact one-subject decision; never “approve Agent”
Change with Conexus = handoff to normal Builder/Change authoring
```

## 7. P6 — reference evidence and capability dispositions

References are task-pattern Evidence only.

### GitHub deployment review

[GitHub Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments) attaches review to the exact waiting workflow/deployment context, shows a review notification and rechecks reviewer constraints. Useful observation: consequential decisions remain discoverable while retaining their originating run context.

Disposition:

```text
exact waiting-run context + current reviewer check → PRESENT-IN-AUTHORITY
universal deployment/approval semantics → IRRELEVANT / REJECTED for Conexus
bulk “start all waiting jobs” bypass → REJECTED; no Conexus authority
```

### LangChain human-in-the-loop frontend

[LangChain Human-in-the-Loop](https://docs.langchain.com/oss/python/langchain/frontend/human-in-the-loop) presents the pending action and resumes only after an explicit decision.

Disposition:

```text
show exact pending action before decision → PRESENT-IN-AUTHORITY
approve/reject vocabulary → maps only to ALLOW_ONCE/DENY
edit action before approval → REJECTED; changed Conexus proposal requires new authority
framework interrupt/thread identity → REJECTED as Product authority
```

### Microsoft human review

[Microsoft Copilot Studio advanced approvals](https://learn.microsoft.com/en-us/microsoft-copilot-studio/flows-advanced-approvals) exposes approvals through several human channels while the originating flow waits.

Disposition:

```text
decision may be reached through more than one admitted surface → PRESENT-IN-AUTHORITY (CP or PA)
same owner subject across surfaces → PRESENT-IN-AUTHORITY
generic multistage approval workflow / AI deciding approval → REJECTED; not current Conexus Product authority
```

Additional references stopped changing the decision space. Conexus still requires owner-specific, exact-subject decisions and current eligibility revalidation.

## 8. P7 — credible structural hypotheses

### A — Project Agent workbench with owner-specific decisions

**OPERATOR APPROVED FOR FUNCTIONAL P8 EXPLORATION.**

- Agents landing establishes Project scope, collection recognition and urgent owner-specific decisions.
- Exact Agent workspace preserves context across Overview, Automations and Runs.
- Run detail and approval detail are contextual panels/focused dialogs, not navigation roots.
- Agent authoring crosses explicitly to P-01 Build.
- Effect/Activity/usage investigation crosses explicitly to P-04.

This best preserves human context, owner boundaries, scanability and responsive viability without exposing backend modules as the IA.

### B — four sibling routes: Agents / Triggers / Runs / Approvals

**REJECTED — backend-shaped UX.** It makes PAR nouns primary navigation, repeats Agent selection, weakens context and turns a bounded Product Agent job into an operations console.

### C — Agent detail with every concern in one long page

**REJECTED — local maximum.** It avoids navigation but creates poor scanability, hides urgent decisions among routine facts and does not scale structurally across schedules/runs.

### D — global Approval Center

**REJECTED — duplicate/false authority.** Conexus decisions remain owner-specific; current Product explicitly rejects a universal Approval Center. P-03 may host only PAR effect approvals for one exact Project/current eligible human.

## 9. Upstream findings blocking P8

### 4C-F24 — trigger administration lacks independently authorized human Agent discovery

Evidence:

```text
agent.trigger.manage authorizes PAR-11..16
PRJ-20/21 human Agent name/purpose require separate project.source.read
AgentTrigger carries agentId only
W-04 navigation/local cache is not durable authority
```

A human may therefore be allowed to administer triggers yet be unable to discover or recognize the Agent without opaque IDs or an unrelated source-read grant.

Global-Maximum candidate:

```text
preserve PRJ-20 operation + Project Agent owner
→ admit exact-Project purpose-bound human Agent summary disclosure under agent.trigger.manage
→ name + purpose + exact release/revision coordinates already present
→ no source content, Agent mutation, new operation, Permission or owner
```

Rejected alternatives: grant `project.source.read` by convenience; rely on W-04 browser state; duplicate Agent labels in frontend; create a Trigger-owned Agent directory.

### 4C-F25 — eligible approval discovery is machine-recognizable, not decision-recognizable

Evidence:

```text
ApprovalRequestSummary
→ approvalRequestId + agentRunId + proposalRef + proposalDigest + approvalState
-X-> human Agent identity
-X-> safe action/consequence summary
-X-> requested/expiry temporal context
```

`PAR-09` exposes the exact safe sealed proposal only after selection, but the queue cannot support informed recognition or urgency without opaque IDs and repeated blind detail opening. The approver may possess neither `project.read` nor `project.source.read`.

Global-Maximum candidate:

```text
preserve PAR-08/09/10 + ApprovalRequest owner
→ ApprovalRequestSummary carries PAR-issued safe human decision context:
   exact Agent presentation reference
   nonblank action/consequence summary
   requestedAt and expiresAt? when expiry is defined
   existing exact run/request/proposal identities + current state
→ exact sealed proposal remains PAR-09 truth before decision
→ no generic approval domain or frontend join
```

Rejected alternatives: universal Approval Center; frontend joins through unauthorized Agent reads; digest/ID-first queue; exposing raw tool/provider payload.

### 4C-F26 — AgentRun history lacks the temporal and failure truth needed for investigation

Evidence:

```text
AgentRun
→ IDs + Release + origin + runState + optional output/evidenceRefs
-X-> admitted/started/settled time
-X-> owner ordering contract
-X-> safe human problem/diagnostic/remediation
```

A paginated run history cannot truthfully answer “which run just happened?” or distinguish an empty output from a failed/waiting execution. Browser arrival time, array order, Evidence parsing or OBS joins would create false/parallel truth.

Global-Maximum candidate:

```text
preserve PAR-06/07 + AgentRun owner
→ owner-issued admittedAt + optional settledAt/current transition time
→ deterministic newest-admitted-first list order
→ optional safe problem { summary, detail?, remediation? }
→ preserve runState as PAR owner truth and evidenceRefs as provenance only
→ no UI-invented lifecycle enum, retry operation or observability owner merge
```

Rejected alternatives: client receipt timestamps; infer failure from missing output; parse `evidenceRefs`; use Activity as mutable/current PAR truth.

## 10. Operator decision and selected realization

The operator accepted F24, F25 and F26 on 2026-08-25. The selected realization is deliberately bounded:

```text
4C-F24 = OPERATOR ACCEPTED
→ PRJ-20 remains the one Project Agent collection read
→ exact-Project agent.trigger.manage gains purpose-bound existing summary disclosure
→ PRJ-21/project.source.read/source/mutation remain unchanged

4C-F25 = OPERATOR ACCEPTED
→ PAR-08/09 preserve immutable request-time { Agent, Release, action, requested/expiry time }
→ PAR-09 sealed proposal + digest remain decision truth
→ no frontend join, raw Mastra payload or generic Approval Center

4C-F26 = OPERATOR ACCEPTED
→ AgentRun gains admittedAt, optional settledAt and optional safe human problem
→ PAR-06 orders admittedAt DESC then agentRunId DESC before pagination
→ no UI lifecycle invention, retry/resume or OBS/Evidence inference

SELECTED REALIZATION
→ no new operation, Permission, owner, principal, trust boundary or durable record class
→ N_platform remains 122; Project remains 27; PAR remains 16
→ selected-realization RED 0/4 → GREEN 4/4
→ OpenAPI bundle + Project/PAR bounded checkers GREEN
→ P8 BLOCKED pending separate operator review of the P7 structural hypothesis
```

Mastra's native approval suspension/resumption remains subordinate runtime mechanics. Conexus PAR continues to own `ApprovalRequest`, eligibility, sealed-subject digest and Gateway effect admission.

## 11. Feasibility and interaction obligations after adjudication

If F24–F26 are ratified into the owning Product/wire authority, hypothesis A can proceed to P8 with:

```text
keyboard-reachable tabs/regions and focused detail panels
focus return after close/decision
non-color-only current states
mobile: Agent context remains fixed; regions stack; tables become structured lists
approval subject remains readable before actions
Allow once and Deny remain visually/semantically distinct
stale/expired/revoked decision state preserves reviewed context but removes actionability
trigger create/revise/enable remain distinct steps
archive warning states plainly that archive does not stop existing automations
loading != empty != denied/non-disclosable != failed
```

P8 fixtures may simulate only accepted server truth after the findings close. They may not fabricate timestamps, human summaries or Agent labels while authority remains unresolved.

## 12. Decision and exact next gate

```text
P0–P7 = COMPLETE
Hypothesis A = OPERATOR APPROVED FOR P8
4C-F24 = OPERATOR ACCEPTED / SELECTED REALIZATION
4C-F25 = OPERATOR ACCEPTED / SELECTED REALIZATION
4C-F26 = OPERATOR ACCEPTED / SELECTED REALIZATION
bounded 4A/4B recompile = GREEN
P8 = FUNCTIONAL CANDIDATE GREEN / OPERATOR WALKTHROUGH REQUIRED / NOT LOCKED
P-03 = NOT LOCKED
```

Exact next gate:

```text
operator operates the functional low-fidelity P8 candidate
→ operator REVISES or explicitly LOCKS it
```

The operator approved hypothesis A after the bounded RED→GREEN recompile. This authorizes only the disposable fixture-driven P8 candidate and its walkthrough/iteration. P-04, P9 before P8 LOCK, P11, 4D, merge and Product implementation remain unauthorized.

## 13. P8 functional candidate and walkthrough Evidence

Canonical candidate:

```text
docs/evidence/4c/p03-product-agent-functional-wireframe.html
candidate blob = 1b9e678267f2616fc16b6f987e7f5a93138b39be
P-03 P8 FUNCTIONAL LOW-FI CANDIDATE
fixture-only / self-contained / NOT LOCKED
```

RED→GREEN:

```text
initial functional contract = RED 0/6 (HTML absent)
functional candidate = GREEN 6/6
inline script parse guard added = GREEN 7/7
```

Browser-operated paths:

```text
Agents landing → exact Agent → Automations
existing automation → revise exact schedule → new revision → disable
empty Agent automation list → create disabled → inspect → explicitly enable
archived Project → create disabled in UI; explicit disable remains admitted
Runs → FAILED filter → exact run → problem + remediation → P-04 boundary
Needs your decision → exact proposal → Allow once → ALLOWED_ONCE + actions removed
review scenario → STALE → reviewed subject preserved + both actions disabled
Agent collection scenario → FAILED → explicit recoverable dependency state
focused panel close → initiating control regains focus
```

Walkthrough findings corrected in the same candidate:

```text
1. Review controls obscured the state under review
   → harness now collapses immediately after scenario selection

2. successful Allow once disabled actions but left ACTIONABLE presentation visible
   → result badge now changes immediately to ALLOWED_ONCE or DENIED
```

Responsive inspection at the available compact browser viewport confirmed stacked records, scrollable tabs, full-width focused panels, readable decision subject and 44px mobile controls. The Impeccable detector's Arial/single-font warnings are deliberately not applied: this is low-fidelity Evidence inheriting the existing GF-01/P-02 wireframe grammar, and final typography is explicitly deferred to P13. Its numeric-marker advisory is a false positive over real operation/revision identifiers, not decorative section numbering.

Current disposition:

```text
operator walkthrough = REVISE
4C-F27 = ACCEPTED / PA-01 conversation + decision-continuity obligation
4C-F28 = ACCEPTED / bounded P-01 Agent Studio reopen + P-03 handoff revision
4C-F29 = ACCEPTED / future 4D Agent Experience Paved-Road study
P7 hypothesis A + F24–F26 = PRESERVED
current P8 candidate = retained as revision baseline / not a lock candidate
P8 = REVISE / NOT LOCKED
P9/P10 = BLOCKED UNTIL EXPLICIT P8 LOCK
```

## 14. Operator walkthrough REVISE — F27–F29

The operator preserved hypothesis A and the accepted F24–F26 owner corrections, but rejected the current candidate as a lock candidate because two cross-surface continuities remained invisible and one future Paved-Road obligation needed a durable handoff.

### 4C-F27 — Published-App Agent interaction and decision continuity

Current Product authority already assigns `PAR-01..04` Conversation/use and `PA-S03..05` Conversation, admitted AgentRun detail and exact eligible approval to PA-01. F27 therefore creates no Product/API reopen. It binds a future PA-01 frontend obligation to test at least full-page, contextual-side-panel and inline task/decision compositions without forcing a universal chat bubble or Control Plane IA.

An eligible decision may appear both inline at the interrupted Conversation/AgentRun and through a small app-scoped `Needs your decision` affordance. Both project the same PAR `ApprovalRequest`; neither creates another inbox owner, durable state or approval authority.

### 4C-F28 — Agent authoring inspectability and handoff

The current P-03 candidate exposes Agent identity/purpose/revision/Release posture plus a generic `Change with Conexus` handoff. It does not make the admitted `agent/v1` facets inspectable or tell the creator where/how structured authoring occurs. The smallest reopen is the Agent-specific authoring entry/lens inside locked P-01, not the whole Build workspace.

Leading structure after authority closure:

```text
P-03 exact Agent workspace
→ rich Definition inspection
→ explicit Edit Agent
→ exact Project + Agent + authored revision/Release context preserved

P-01 bounded Agent Studio lens
→ structured/manual edit OR Conexus edit
→ same Change / candidate agent/v1 / diff / proof / Release
```

No direct Agent CRUD, frontend-owned definition, second Agent DB or Mastra Stored Agent authority is admitted. Provider sampling controls, Mastra workflows or third-party `skills` become Product fields only if the exact `agent/v1` owner later admits their meaning.

### 4C-F29 — future Published-App Agent Experience Paved Road

The operator accepted a future reusable Agent experience capability but explicitly rejected selecting its concrete API, package topology or implementation during 4C.

4D must evaluate the smallest realization covering proven PA-01 consumers across a framework-neutral Product client, React headless bindings and optional accessible/themable primitives. It must cover Conversation history, durable reconnect, typed app-context references, safe typed rich parts, exact approval interaction, application-owned renderers, honest lifecycle states, test fixtures and contract/version discipline.

The future mechanism must not create/mutate Agents in Published-App runtime, publish raw Mastra/provider protocol, execute governed business tools directly in the browser, persist owner truth independently, force a visual shell, accept arbitrary model-authored component code or duplicate the generated Product client/DTO authority.

Before selection, 4D must refresh official documentation and relevant repositories for Mastra client/`@mastra/ai-sdk`, Vercel AI SDK UI, assistant-ui, CopilotKit and credible current alternatives. Compare authority separation, composition freedom, React/framework boundaries, history/reconnect, typed rich UI, HITL fidelity, accessibility/theming, disclosure safety, generated contracts, testability, versioning/migration, runtime cost, license, maintenance and lock-in. Research is Evidence only.

## 15. 4C-F30 — Agent Studio has no truthful structured authoring wire

The bounded F28 authority recovery proved a category-7 upstream finding.

Current reads:

```text
PRJ-20 / PRJ-21
→ agentId / name / purpose / authoredRevisionId / Release references
-X-> complete authored agent/v1 definition

BLD-08 / BLD-09
→ read-only source tree/file under project.source.read
-X-> structured Product Agent authoring projection
```

Current writes/interactions:

```text
BLD-03 CreateChange
→ request = { intent: nonblank string }

BLD-16 AskConexusAboutContext
→ read-only contextual question/answer
-X-> Change mutation

Code / Diff
→ read-only
```

No browser-reachable Product operation can submit an exact structured Agent edit to the same Change candidate. A functional Agent Studio would otherwise have to serialize fields into prompt prose, mutate source directly, invent a Builder command or store a parallel frontend draft.

Alternatives:

```text
A form → BLD-03.intent prose                    = REJECTED / untyped convention
editable Code under project.source.read         = REJECTED / read becomes mutation
direct Product Agent CRUD outside Builder       = REJECTED / second authority
Project definition read + Builder Change draft = SELECTED / OPERATOR APPROVED
```

Leading Global-Maximum candidate:

```text
Project owner
→ complete safe authored agent/v1 definition/projection
→ exact Agent + authored revision coordinates

Builder owner
→ typed Product Agent authoring draft under exact Change context
→ create/evolve + repeated intentional revision with current-state protection
→ same candidate agent/v1
→ same Plan/diff/proof/immutable revision/Release path
```

Binding laws:

```text
authoring projection != raw Project source
structured draft != live Agent mutation
form draft before submit = EPHEMERAL_UI
accepted Builder draft/candidate = SERVER
Agent identity/revision = server revalidated
typed structured edit + Conexus edit → same Change candidate
project.build -X-> generic project.source.read
Mastra Stored Agent/Editor -X-> Product authority
frontend cache -X-> Agent definition owner
```

The operator approved the leading candidate. The bounded 4A/4B recompile selected one enriched Project detail read plus three Builder interactions because inspection/reload, idempotent establishment and current-revision-safe revision protect distinct properties:

```text
PRJ-21 GetProjectProductAgent
→ complete safe ProductAgentDefinition (`agent/v1`)
→ exact immutable authoredRevisionId + Release coordinates

BLD-18 GetChangeProductAgentDraft
→ exact current typed draft inside one Change

BLD-19 CreateChangeProductAgentDraft
→ origin = NEW | EXISTING
→ NEW: server issues Agent identity inside the candidate
→ EXISTING: exact agentId + expectedAuthoredRevisionId
→ Idempotency-Key

BLD-20 ReviseChangeProductAgentDraft
→ expectedDraftRevision
→ stale revision fails closed
→ same candidateSubjectDigest / diff / proof / Release path
```

The schema is framework-neutral and closed. Product instructions—not a provider-specific system-prompt store—own authored behavior. Tools are exact governed `capabilityId` bindings; Brain is Project-bound; memory is limited to currently admitted modes; interactions are currently `CONVERSATION | SCHEDULE`; model policy exposes only bounded authored policy/sampling. Policy, approval, budget and verification references remain owner-governed. No raw provider configuration, credential, arbitrary extension object, Mastra/Stored-Agent identity, direct source write, live Agent mutation or second Agent database is admitted.

Alternatives rejected during the bounded realization:

```text
enrich BLD-03 intent payload = mixed prose/typed creation semantics
single generic upsert         = hides NEW/EXISTING identity + concurrent revision law
editable source              = project.source.read becomes mutation
direct Project Agent CRUD    = bypasses Change/diff/proof/Release
Mastra Studio/Stored Agent   = framework mechanism becomes Product authority
```

```text
F30 = OPERATOR APPROVED / 4A/4B GREEN
P-01 bounded Agent Studio functional lens = CANDIDATE GREEN / NOT RE-LOCKED
P-03 complete Definition inspection + exact Edit Agent handoff = CANDIDATE GREEN / NOT LOCKED
next = operator walkthrough → revise or explicit P-01 re-LOCK + P-03 LOCK
4D/Product implementation = NOT AUTHORIZED
```

## 16. Fresh P8 truth audit and bounded revision

The operator required one fresh-agent review before continuing. The independent audit and the primary audit converged on the same falsifier:

```text
accepted PRJ-21 = complete exact ProjectProductAgentDetail
prior P-03 fixture = summary identity + mostly hardcoded generic definition
prior P-01 handoff = selected name/purpose + Sales Follow-up technical defaults

therefore
visible “complete definition” != exact selected Agent definition
```

This is primarily a downstream P8 truth/projection defect. It does not justify redesigning `agent/v1`, admitting Mastra Stored Agent authority or promoting framework workflow/skill/system-prompt representations into Product fields.

The bounded revision remains in the same two canonical HTML artifacts and now proves:

```text
one complete ProjectProductAgentDetail fixture per Agent
→ catalog name/purpose projected from definition
→ exact distinct Definition inspection
→ capabilityId + authored binding purpose
→ separate progressive PRJ-17 capability contract disclosure
→ exact Brain/memory/interactions/governance/verification/limitation refs

P-03 Edit Agent
→ URL carries origin + agentId coordinates only
→ P-01 re-resolves the complete exact Agent fixture
→ optional sampling remains optional
→ capability binding purpose round-trips
→ complete ProductAgentDefinition diff
→ NEW and EXISTING converge on the same BLD-19/20 Change draft path

AgentRun detail
→ structured-safe output
→ exact run/origin coordinates when present
→ Evidence references

permission walkthrough
→ source inspection != run inspection != trigger administration != authoring
```

Two narrow upstream questions remain visible rather than being patched around:

1. `project.build` does not imply `project.read`; a build-only creator still lacks an accepted human-recognizable discovery source for capabilities and other governed references.
2. PAR approval promises originating-run context, but an eligible approver may lack `project.read`; the owner must either define the smallest safe approval-owned run context or narrow the frontend promise.

Current disposition:

```text
fresh truth audit = COMPLETE
P8 bounded revision = OPERATOR APPROVED / LOCKED
P-01 Agent Studio delta = RE-LOCKED
P-03 = LOCKED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED
4D/Product implementation = NOT AUTHORIZED
```

## 17. Operator LOCK closure

The operator explicitly approved the fresh-truth-revised functional experience after operating the P-03/P-01 handoff.

```text
P-03 approved artifact blob = dfc661a19aa43ad541e728e22849de5daf47fb47
P-01 re-locked artifact blob = b679504046b7ef9956ede6757b1e9ebd9030770f
```

The canonical post-lock trace is [P-03 Product Agent work Screen Contract](p03-product-agent-screen-contract.md). The same existing [P-01 Build Screen Contract](p01-build-workspace-screen-contract.md) owns the bounded Agent Studio re-lock. No parallel decision or artifact owner is created.

The HTML proof chrome retains its historical candidate wording because artifact identity is pinned to the exact operator-used bytes. Current lock authority lives in the roadmap and Screen Contracts.

```text
P-03 P8 = LOCKED / OPERATOR APPROVED
P-03 P9 = EXACT TRACE CLOSED
P-03 P10 = CONSOLIDATED
P-01 Agent Studio delta = RE-LOCKED / OPERATOR APPROVED
P-04 / P11 / 4D / Product implementation / merge = NOT AUTHORIZED
```
