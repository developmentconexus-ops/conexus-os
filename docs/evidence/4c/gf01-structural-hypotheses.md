# 4C GF-01 — Structural Hypotheses

> **Status:** `LOCKED / OPERATOR APPROVED` / 4C-8 CLOSED
> **Block:** `GF-01` — global frame + Workspace/Project navigation
> **Locked hypothesis:** `H1-R2` — single adaptive rail + breadcrumb-switcher + contextual assistant seam
> **Prerequisite:** `4C-F01` RESOLVED / authority-feasibility GREEN.
> **Approved rendered artifact:** `gf01-global-frame-wireframe.html` @ Git blob `2d899d00484c41c927829bd9f529d3a870159db3`.

GF-01 began with one real ambiguity: whether Workspace and Project navigation should coexist as persistent navigation landmarks or one contextual navigation landmark should adapt to current scope. The first H1 render exposed useful review findings, adjudicated in [GF-01 Fable Shell Review Adjudication](gf01-fable-review-adjudication.md). H1-R2 incorporated those findings and the operator explicitly approved the rendered structure on 2026-08-22.

The approved HTML is preserved as the exact reviewed P8 artifact. Its render-time candidate label is intentionally not rewritten after the lock; this record is the operator-only lock authority.

The earlier 4C-4 reference study remains sufficient. Additional broad research is not required for this block.

## 1. Constraints

The locked frame preserves:

```text
Account/session visibility
human-readable Workspace + Project context
Workspace → Project hierarchy
Projects as primary Workspace destination
Build as primary/default Project destination
Control Plane != Published Application
server-owned authorization
no global Product search authority
no generic Workspace Settings
one usable narrow responsive transformation
keyboard/focus/read-order plausibility
Preview-dominant Build width
contextual Conexus seam without global assistant authority
```

## 2. H1-R2 — Single adaptive rail + breadcrumb-switcher — LOCKED

Structure:

```text
TOP BAR
Conexus / Workspace ▾ / Project ▾                         Account
          └ Workspace menu can switch Workspace
            + bounded Workspace shortcuts

LEFT RAIL — Workspace context
Projects
Agents
Brain
Connections
People & access
Audit

LEFT RAIL — Project context
Project identity cue
← Back to Projects
Build
PRODUCT
  Data
  Capabilities
  Integrations
  Agents
  Brain
OPERATE / INSPECT
  Releases
  Activity
MANAGE
  Settings

STAGE
current route/surface
+ optional contextual assistant panel seam
```

### Breadcrumb-switcher

Context identity is navigation, not form entry:

```text
Conexus / Metal Nobre ▾ / Budget Analyzer ▾
```

Each segment exposes only currently server-disclosed context choices. Local filtering inside the menu is `LOCAL_UI`, not a Product-wide search operation.

### Workspace cross-scope mitigation

H1's original cost was one extra step to Workspace resources while inside a Project. The locked Workspace breadcrumb menu mitigates that without a permanent second rail by exposing bounded navigation shortcuts:

```text
Brain
Connections
People & access
```

This retains one active primary rail and does not move ownership into Project scope.

### Contextual Conexus frame seam

The frame reserves a collapsible right-side cooperation seam for contextual Conexus assistance. The current material surface decides whether the `Ask Conexus` affordance exists; GF-01 does not make the assistant global.

Structural support carried forward:

```text
wide:    content can cooperate with a pushed panel
medium:  panel can overlay
narrow:  panel can occupy the available viewport
```

The seam is locked; exact thresholds, panel width and mode-selection algorithm are not. Those belong to later assistant/surface work and cannot silently change the locked global hierarchy.

### Locked strengths

- one primary navigation landmark at a time;
- breadcrumb expresses Workspace → Project hierarchy with low top-bar noise;
- Workspace menu shortcuts remove most practical advantage of permanent dual rails;
- maximum default width for Preview-dominant Build;
- direct mobile transformation to one semantic navigation drawer;
- Project navigation scales vertically;
- contextual assistant can cooperate with frame layout without becoming global authority.

### Carry-forward risks / probes

- Workspace shortcuts inside a context menu must remain discoverable in assembled walkthroughs;
- Project-name cue in rail may later prove redundant, but changing it after lock requires the smallest GF-01 reopen if material;
- actual assistant eligibility/content must remain surface-owned;
- relative ordering among non-primary items is not frequency-backed by `4C-A02` and remains an assumption probe rather than permission to reorder during implementation.

## 3. H2 — Persistent Workspace rail + nested Project rail — REJECTED

Structure:

```text
TOP BAR
context

WORKSPACE RAIL      PROJECT RAIL
Projects            Build
Agents              Data
Brain               Capabilities
Connections         Integrations
People & access     Agents
Audit               Brain
                    Releases
                    Activity
                    Settings

CONTENT
```

Why rejected:

- two navigation landmarks compete for attention and keyboard traversal;
- permanent horizontal cost reduces Build/Preview space;
- denser responsive logic;
- visually suggests two adjacent Product taxonomies rather than a scope transition;
- no evidence that constant cross-scope switching justifies the cost;
- H1-R2 Workspace-menu shortcuts mitigate H2's only clear advantage.

## 4. Final decision matrix

| Criterion | H1-R2 adaptive rail | H2 dual rail |
| --- | --- | --- |
| Human scope clarity | **strong breadcrumb hierarchy** | strong but heavier |
| Build/Preview width | **best** | materially reduced |
| Cross-scope Workspace access | bounded context-menu action | always visible |
| Keyboard landmarks | **one primary rail** | two persistent rails |
| Mobile transformation | **one drawer** | requires rail merging/cascading |
| Contextual assistant retrofit risk | **seam reserved now** | still needs third-column policy |
| Evidence for permanent dual navigation | no need | no need |
| YAGNI | **lower structural cost** | higher permanent cost |

Operator decision: **H1-R2 LOCKED**.

## 5. Review carry-forwards that are not GF-01 decisions

```text
Workspace Agents ownership wording
→ W-04 Workspace Agent catalog

Workspace Brain vs Project Brain semantics
→ W-02 / P-02 headings/descriptors

Projects cards vs list/table
→ W-01 competing hypothesis; GF-01 cards are fixture only

pending ApprovalRequest discoverability
→ 4C-S06, primarily P-03 with P-04 / PA-01 cross-check
```

A universal Approval Center remains rejected.

## 6. Responsive baseline

For narrow layouts, the locked semantic transformation is:

```text
TOP BAR
menu | Workspace / Project breadcrumb segments | Account

NAVIGATION DRAWER
current Workspace + Project identity
scope-appropriate adaptive rail
explicit Back to Projects

ASSISTANT
contextual seam may overlay/full rather than consume a permanent second column

CONTENT
single-column current surface
```

The drawer is the same semantic navigation as desktop, not a separate Product IA. Exact pixel breakpoints are not locked authority.

## 7. Approved rendered evidence

The operator reviewed and approved:

[GF-01 Global Frame Low-Fidelity HTML Wireframe](gf01-global-frame-wireframe.html)

Exact Git blob:

```text
2d899d00484c41c927829bd9f529d3a870159db3
```

The artifact is HTML/CSS lo-fi with bounded vanilla JavaScript only to inspect context menus, scope transitions, rail behavior, assistant seam and narrow-layout transformation. It is P8 Evidence, not production frontend or backend/runtime proof.

## 8. Operator adjudication and downstream closure

```text
H1-R2 = LOCKED / OPERATOR APPROVED
4C-8 = CLOSED for GF-01
```

The exact post-lock vertical trace, state ownership, authorization boundary, P10 consolidation and P11 trigger disposition are in [GF-01 Locked Screen Contract](gf01-screen-contract.md).

Reopen GF-01 only when material later evidence falsifies the locked hierarchy, accessibility/responsive viability, Preview-width requirement, server-derived context truth, or contextual-assistant frame cooperation. Do not reopen for visual preference or implementation convenience.
