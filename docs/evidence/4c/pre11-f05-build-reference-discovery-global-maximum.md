# 4C-PRE11-F05 — build-safe authoring-reference discovery Global Maximum

> **Status:** `OPERATOR RATIFIED / SELECTED REALIZATION / 4A-4B GREEN / P-01-P-03 P8 LOCKED / P9-P10 CLOSED`
> **Accepted principle:** `project.build` includes safe purpose-bound construction-contract discovery
> **Implementation:** blocked

## Root cause

`ProductAgentDefinition` requires or admits seven reference families, currently encoded only as exact string references:

```text
modelPolicy.policyRef
tools[].capabilityId
brainContext.contextRefs[]
policyRefs[]
approvalPolicyRefs[]
budgetPolicyRefs[]
verificationRefs[]
```

P-01/P-03 use fixture catalogs or free-text/CSV fields. That is valid disposable P8 data, but it does not prove that a `project.build` human can discover or safely recognize the real governed subjects.

## Per-family result

| Family | Current owner/read truth | Pre-P11 disposition |
| --- | --- | --- |
| Capability bindings | Project `PRJ-16/17`, currently `project.read` | purpose-bound alternate disclosure under `project.build`; reuse owner, no operation/Permission increase |
| Project Brain context refs | Brain/Project `BRN-14`, currently `brain.read + project.read` | bounded selectable-reference projection under `project.build`; never whole Workspace Brain or runtime slice |
| Model policy ref | described as Project/Release-governed but no human read/catalog operation exists | material prerequisite for NEW because `policyRef` is required |
| General policy refs | no current semantic owner/read | Product decision required; optional arrays may remain empty but must not be free-text authority |
| Approval policy refs | PAR owns requests/decisions, not reusable policy definitions | Product decision required; request/eligibility truth must not become a policy catalog |
| Budget policy refs | no current semantic owner/read; Gateway effect-budget mechanics are not a general model-spend policy owner | Product decision required |
| Verification refs | Brain `EVIDENCE_SPEC` and Builder verification/Evidence have distinct meanings | Product decision required to identify which reference class, if any, Agent definitions may author |

## Global-Maximum structure

Use a hybrid of owner reuse and honest absence:

```text
BLD-18/19/20 exact draft truth
+ purpose-bound reads from existing semantic owners
+ owner hydration of already-selected refs where authorized
- no frontend registry
- no free-form ref treated as valid
- no universal ProjectAuthoringReferenceCatalog
```

### Existing Agent

`BLD-18` preserves every exact already-selected reference. A missing discovery permission must not delete or rewrite it. Human labels/details are hydrated only through an admitted owner disclosure; otherwise the UI preserves the exact ref and states that its current human detail is unavailable.

### New Agent

A NEW definition may choose only owner-disclosed eligible references. No hardcoded default, guessed ID or frontend label is Product truth.

## Rejected alternatives

1. widen `project.build` into generic `project.read`, `brain.read`, data/source/runtime/admin authority;
2. create a frontend/fixture registry;
3. accept arbitrary typed IDs as valid discovery;
4. create one generic cross-owner policy/reference domain merely to populate Agent Studio;
5. return all choices inside the draft response as screen-shaped convenience without an owning semantic source.

## Decisions already derivable

### Capabilities

Reuse `PRJ-16/17` through an exact Project + purpose-bound `project.build` route. Safe disclosure is limited to capability human contract truth:

```text
capabilityId
name
purpose
regime
operationId
logical inputs/outputs when detail is requested
```

This grants no invocation or business-data access.

### Brain context

Reuse Project-resolved Brain context, but expose only the exact selectable Project-bound references and human recognition required for authoring. It must not grant Workspace Brain browse/publication, binding administration or runtime effective-context authority.

The exact response should be derived from BRN-14's current owner truth or a smallest owner-preserving refinement, not from browser joins.

## Operator-approved F1 posture

On 2026-08-27 the operator approved Alternative C, the minimal F1 posture for model/general/approval/budget/verification references:

### Alternative A — build full policy/reference owners now

Rejected as the default. It introduces multiple policy domains before concrete non-Agent consumers or lifecycle requirements are proven.

### Alternative B — keep every field freely editable as an opaque ref

Rejected. It is not human-operable and turns validation/identity into guesswork.

### Alternative C — minimal F1 owned defaults + optional seams — OPERATOR APPROVED

Leading Global Maximum:

```text
model policy
→ one server/Project-owned admitted default or bounded choice with human label/purpose/limits

general/approval/budget/verification refs
→ empty by default for NEW
→ preserve exact existing refs on EXISTING
→ not addable through free text until a real owner/read is accepted
```

This preserves the schema seams without constructing unused policy platforms. If the operator later requires NEW Agents to select any optional family in F1, that exact family becomes a named Product owner/read finding and is solved independently.

## Exact realization candidate after focused fusion review

The operator ratified the smallest owner-correct realization and its fixed-operation census change:

```text
PRJ-16/17
→ add purpose-bound project.build authority route
→ existing safe capability schemas unchanged

BRN-14
→ add purpose-bound project.build route
→ expose distinct server-issued authoringRef per selectable concept
→ detailDisclosed distinguishes withheld detail from known-empty content

PRJ-29 ListProjectModelPolicies
→ one new Project-owned read
→ project.read OR purpose-bound project.build
→ policyRef + authored label/purpose + server-issued default + bounded sampling limits

BLD-18/19/20
→ canonical definition/draft structures preserved
→ NEW requires optional unowned ref arrays empty
→ EXISTING and revise preserve those arrays exactly
→ invalid policy/capability/context refs fail 422
```

Impact:

```text
N_platform 127 → 128
Project operations 27 → 28
Builder operations remain 20
Brain operations remain 13
ordinary Permissions remain 25
new semantic owner/principal/trust boundary/durable record class = 0
```

A Builder-owned `BLD-21` defaults/catalog read is rejected because Builder owns the Change draft, not Project model-policy semantics. Silent BLD-19 defaults without a read are rejected because the human would see only an opaque policyRef and could not exercise the approved small governed choice.

The targeted 4A/4B recompile is GREEN:

- `PRJ-16/17` admit ordinary `project.read` or purpose-bound `project.build` with schemas unchanged;
- `BRN-14` admits purpose-bound `project.build`, adds distinct `authoringRef` and explicit `detailDisclosed` withholding truth;
- `PRJ-29 ListProjectModelPolicies` is Project-owned and returns `policyRef`, human label/purpose, server default and optional sampling limits;
- `BLD-19` constrains NEW optional unowned ref arrays to empty;
- `BLD-19/20` describe owner validation and exact preservation of protected EXISTING refs;
- the platform census is `128↔128`, Project=28, Builder=20, Brain=13 and Permissions=25.

The selected F05 frontend realization is closed: the P-01 Agent Studio and P-03 Definition regions use accepted owner reads, preserve complete EXISTING refs, keep protected optional families non-editable and are operator re-locked in their canonical HTMLs.

## Proof requirements

```text
project.build-only creator can recognize allowed capabilities and Brain refs
project.build cannot inspect business data, secrets, generic source or Workspace Brain
NEW receives no frontend-hardcoded reference
EXISTING round-trips every exact ref without loss
unknown/undisclosed ref != invalid/deleted ref
optional unowned families cannot be added as free text
model policy is human-recognizable and server-validated
stale draftRevision fails closed
reference possession grants no invocation or authorization
```

The F05 gate no longer blocks P11. Faithful assembly remains governed by the exact locked blobs and `p11-faithful-assembly-contract.md`.
