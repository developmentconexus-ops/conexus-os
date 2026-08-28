# 4C terminal P10 semantic pattern vocabulary

> **Status:** `TERMINAL P10 RECONCILED / CLOSED FOR P11 INPUT`
> **Purpose:** reconcile repeated protected interaction behavior before faithful P11 assembly
> **Implementation authority:** none

This vocabulary names semantic behavior only. It does not select components, hooks, stores, router APIs, design tokens, SDKs or a design system.

## 1. `adaptive current-scope shell`

Owner/proof source: GF-01 and every later Control Plane consumer.

```text
one current Workspace or Project rail
→ breadcrumb preserves Workspace → Project hierarchy
→ Project has explicit Back to Projects
→ narrow layout transforms the same rail into one drawer
→ Published Applications never inherit the Control Plane shell
```

Not a generic application shell component. PA-01 remains independently composed.

## 2. `human-first exact reference`

Repeated across Workspace/Project/Connection/Account/Area/Agent/Conversation/Release/capability/model-policy subjects.

```text
human name/purpose/summary first
→ exact owner-issued ID/revision/digest progressively available
→ presentation never becomes identity or authorization
```

This pattern forbids opaque-ID-first Product UX and frontend label registries. It does not require every owner to share one DTO.

## 3. `context-preserving exact-subject panel`

Graduated originally at W-03 from W-02B + W-03 and reused by later Project blocks.

```text
preserve useful collection/work context
→ open one exact server-owned subject
→ bounded detail/work remains owner-specific
→ consequential write uses exact operation/currentness
→ re-read owner truth after success
→ close restores collection/focus context
→ narrow layout may become full-width sheet without semantic change
```

Not a universal drawer/editor/details API.

## 4. `owner-paged honest collection`

Repeated across Audit, Agents, Runs, approvals, triggers, Releases, Promotions, Activity, effects and candidate discovery.

```text
server applies admitted query/filter before pagination
→ opaque nextPageToken continues the same query shape
→ loaded page is described as loaded/current results only
→ local filtering never claims whole-owner search
```

Empty, failure, denial and incomplete loaded results remain distinct.

## 5. `exact-current guarded action`

Repeated across Baseline approval/refinement, Connection revision, Brain proposal/publication/binding, Agent draft/trigger revision, ApprovalRequest, Promotion and app-access/lifecycle work.

```text
human reviews one exact current subject
→ request carries expected revision/digest/generation/state where required
→ stale/conflict refuses the action
→ client never silently rebases or overwrites
→ recovery re-resolves owner truth before another decision
```

This is not a universal status model or authorization wrapper.

## 6. `consequence-first exact decision`

Repeated for rare/consequential actions such as exact approval, Promotion, archive, duplicate and access narrowing.

```text
recognize exact subject
→ show decision-critical consequences/non-effects
→ require explicit human action
→ owner revalidates authority/currentness
→ success and subordinate effects remain distinct
```

It does not merge Product decision types into a generic Approval domain.

## 7. Cross-cutting structural invariants, not reusable patterns

The following remain universal proof obligations rather than proposed components:

```text
loading != known-empty != denied/non-disclosable != dependency failure
partial/unknown != zero/success/failure
visible/hidden/disabled != authorization
projection != owner current truth
focus enters top overlay and returns to exact trigger
Escape/non-pointer close remains available
meaning never depends on color alone
responsive transformation never changes Product semantics
```

## 8. Deliberately ungraduated

```text
P-01 app-first Build + right Conexus      = single Product composition
P-02 four Product lenses                 = single Product composition
PA-01 full-page/panel/inline Agent hosts = locked three-host evidence; not yet repeated
app-scoped Needs-your-decision affordance = single Published-App pattern
Agent Studio structured editor           = one bounded Builder specialization
```

No component/SDK abstraction follows from these occurrences.

## 9. Rejected abstractions

```text
GenericDrawer / GenericModal authority
universal ResourceHub/Details endpoint
universal status/state machine
generic Review/Approval Center
generic workflow/scheduler
shared cross-owner DTO/store/cache authority
frontend Permission evaluator
universal chat bubble
generic policy/reference catalog
```

## 10. Reconfirmation gate

T-01, the GF-01 Account-menu delta and the P-01/P-03 F05 deltas completed their bounded P10 passes after operator lock. They reinforce `human-first exact reference`, the existing state/accessibility invariants and owner-specific exact actions. T-01's explicit pre-Account → normal-session re-entry remains a single Product composition, not a reusable component. No new shared pattern, SDK, component or design-system abstraction graduates from these deltas.
