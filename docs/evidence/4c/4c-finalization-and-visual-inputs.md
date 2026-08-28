# 4C-13 — closure and visual-design handoff

> **Status:** `4C-13 CLOSED / 4C-14 PENDING / OPERATOR 4C RATIFICATION PENDING`
> **P12:** `CLOSED / MATERIAL UX-ARCHITECTURE FINDINGS = 0`
> **Current assembled Product:** `P11 45172fd437b0c3b0236b641bcb803c20f165959f / OPERATOR APPROVED`
> **Implementation authority:** none

## 1. Closure result

The accepted frontend model is logically complete for the 4C scope:

```text
accepted human goals / flows              = complete
frontend-reachable Product operations     = 127 / 127
PAR-05 direct browser surface             = explicitly excluded
material blocks                           = operator-locked
P9 Screen Contracts                       = complete
P10 semantic patterns                     = reconciled
P11 assembled Product                     = operator-locked
P12 material UX/architecture findings     = 0
invented Product operations               = 0
screen-shaped Product APIs                = 0
parallel Product DTO authority            = 0
Budget Analyzer application UI            = 0 / FUTURE_PRODUCT_APP
```

This does not claim final visual design, production frontend architecture or
implementation readiness across the full Conexus program.

## 2. Generated consumption boundary

Production realization must preserve:

```text
accepted 4A meaning
→ canonical 4B OpenAPI/wire
→ generated transport/type projection
→ feature consumer
```

Forbidden:

- handwritten parallel Product DTO/schema registries;
- screen-specific BFF authority;
- copied Problem/state enums that widen or narrow the wire;
- editable generated output becoming Product authority;
- treating the current Kubb viability probe as the selected 4D generator.

The repository executable projection proof remains Evidence that generated
consumption is viable. Generator, SDK and integration APIs remain 4D decisions.

## 3. Client-state custody

| State class | Owner in the accepted experience | Examples | Forbidden drift |
| --- | --- | --- | --- |
| `SERVER` | Product owner/read or command result | Account, Project, Baseline, Change, Brain publication/binding, Connection qualification/use, Release/serving, grants, Conversation, runs, approvals, Effects | independent browser truth or normalized cross-owner business store |
| `URL_NAVIGATION` | exact route and owner-issued coordinates | Workspace/Project/Agent/Release/revision/run boundaries | coordinate treated as authorization or success |
| `FORM_DRAFT` | current human input before admitted write | names, intent, filters, decision confirmation, authored draft edits | durable Product claim before owner success |
| `EPHEMERAL_UI` | local presentation only | selected tab, open drawer, local filter, guide note, responsive menu | lifecycle/eligibility/currentness inference |

No fifth class is currently justified. Optimistic presentation must never
fabricate consequential success, authorization or owner currentness.

## 4. Authentication and authorization boundary

```text
Keycloak / configured OIDC
→ authentication protocol
→ Conexus Account + opaque session
→ current Conexus authorization/disclosure
```

The frontend may represent unauthenticated, expired, denied, non-disclosable,
revoked and stale states. Visibility, disabled controls, Keycloak roles/groups
and app-role labels never authorize Product operations. Control Plane access,
Published-App access and exact effect-decision eligibility remain independent.

## 5. Framework-neutral feature topology

The proved ownership seams are semantic inputs for 4D, not selected packages:

```text
Global frame / session / scope navigation
Workspace Projects + Inception
Workspace Brain governance
Workspace Connections lifecycle
Workspace People/access + Audit
Workspace Agent discovery
Project Build + Agent Studio
Project Product resources
Project Agent work
Project Releases + Activity
Project Manage
Published-App frame + composable Product Agent experience
```

Allowed dependency direction:

```text
feature interaction
→ generated Product transport
→ canonical 4B contract
```

Shared mechanisms may support routing, presentation, focus, forms or generated
transport without owning Product meaning. Forbidden dependencies include a
universal business store, browser-direct Mastra authority, a second Agent editor,
cross-owner fixture joins, generic RBAC UI authority and a universal chat bubble.

## 6. P13 visual-design handoff inputs

The handoff consists of:

- locked IA and terminology from the current surface inventory;
- all exact operator-locked P8 blocks and Screen Contracts;
- current assembled P11 behavioral artifact;
- terminal semantic pattern vocabulary;
- material success/failure/message intent;
- responsive transformations and accessibility structure;
- Product/Permission/wire owners and forbidden frontend authority;
- Budget Analyzer disposition as `FUTURE_PRODUCT_APP`, not a platform screen.

Visual design may change aesthetics. It must not silently change:

```text
reading order
region priority
primary/secondary action placement
interaction model
density class
navigation meaning
material information visibility
responsive behavior
```

Any such change reopens the smallest affected locked block. Carry two
non-blocking conformance checks forward: careful visual treatment of the
contextual `Ask Conexus` seam and a complete `prefers-reduced-motion` audit.

## 7. P14 and 4D boundary

Conexus does not claim P14 from 4C alone. P14 is distributed across 4D–4G:

```text
4D Paved Roads/runtime realization
→ 4E whole-system golden/negative flows
→ 4F implementation graph
→ 4G adversarial implementation-readiness closure
→ separate explicit Product implementation grant
```

This handoff selects no design system, component package, frontend framework,
router, state library, SDK, code generator, runtime, database or deployment mechanism.

## 8. Findings and assumptions

- `P12-F01` behavioral proof gap: `CORRECTED`.
- `P12-F02` synthetic Journey-K identity/filter truth: `CORRECTED`.
- material Product/plan findings: `0`.
- material Method findings: `0`.
- material UX/architecture assumptions still open: `0`.
- `4C-A02`: `REJECTED AS MATERIAL CLOSURE DEPENDENCY`; no frequency truth is claimed, and optional P13/post-operational measurement has a bounded reopen trigger.
- `P12-F03` immutable repository checkpoint: `OPERATOR AUTHORIZED / THIS CHECKPOINT REVISION`.

P12-F03 is repository custody, not a Product/UX finding. The operator authorized
one coherent local checkpoint excluding `.wireframe-preview/` and root `PRODUCT.md`;
push, PR and merge remain unauthorized.

## 9. Remaining closure sequence

```text
this revision creates the immutable coherent checkpoint
→ 4C-14 fresh independent Fable review against exact SHA
→ Lead adjudication
→ operator RATIFY 4C | REVISE
→ only then present a separate 4D opening gate
```

Push, PR, merge, 4D and Product implementation remain unauthorized.
