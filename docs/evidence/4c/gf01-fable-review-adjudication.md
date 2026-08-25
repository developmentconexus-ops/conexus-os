# 4C GF-01 — Fable Shell Review Adjudication

> **Status:** REVIEW ADJUDICATED / GF-01 CANDIDATE REVISION REQUIRED / NOT LOCKED
> **Scope:** only the `GF-01` Control Plane global frame and explicit carry-forward notes for later material blocks.
> **Authority posture:** reviewer findings are Evidence. They do not create Product operations, authorization, runtime behavior or implementation authority.

The operator supplied a seven-point Fable review after inspecting the first HTML lo-fi `GF-01` candidate. This adjudication separates frame decisions from later-screen work so useful feedback is preserved without collapsing P8, P9 and P11 into one pass.

The revised candidate remains **H1 — one adaptive navigation rail**. The review strengthens H1 rather than resurrecting the rejected dual-rail H2.

---

## FABLE-GF01-01 — ACCEPT — breadcrumb-switcher

The form-like pair of labeled Workspace/Project `<select>` controls is rejected as the leading frame treatment.

Revised structural law:

```text
Conexus / Workspace ▾ / Project ▾
```

Each human-readable context segment is an interactive breadcrumb switcher over only currently server-disclosable contexts. Search/filter inside the menu is `LOCAL_UI` over already disclosed items; it is **not** global Product search authority.

Why accepted:

- hierarchy reads as navigation rather than form entry;
- consumes less vertical noise in the top bar;
- matches the already accepted Workspace → Project mental model;
- preserves `Workspace.name` / `Project.name` from `4C-F01` without making names routing/auth authority.

Exact styling, iconography, search threshold and menu component remain downstream realization details.

---

## FABLE-GF01-02 — ACCEPT — Workspace menu shortcuts mitigate H1 cost

H1's admitted cost was that Workspace destinations are farther away while inside a Project. A permanent second rail is not required to mitigate that cost.

The Workspace breadcrumb menu may expose bounded navigation shortcuts to current Workspace destinations:

```text
Brain
Connections
People & access
```

These are navigation affordances only. They invoke no new Product operation, do not make Workspace resources Project-owned, and do not create a second persistent taxonomy.

The revised H1 therefore keeps one rail while recovering fast cross-scope access when the Workspace segment is opened.

---

## FABLE-GF01-03 — ACCEPT AS CANDIDATE FRAME SEAM — contextual Conexus panel

This is the one material frame-level point in the review.

Current accepted frontend authority already requires:

```text
Build
+ contextual Conexus / Platform Consultant panel
```

and current Product-surface authority states that `Ask Conexus about this` may pass selected authorized Project/resource context to the contextual assistant without granting new authority.

Existing Mitra research retained by Conexus classifies the host-layout cooperation for a contextual chat panel as `ADOPT`: push / overlay / full are distinct layout behaviors rather than a late cosmetic overlay. This is Evidence that retrofitting the host grid after inner screens are locked would be avoidable structural debt.

Therefore GF-01 now reserves a **collapsible contextual assistant panel seam** in the Project frame.

Boundaries:

```text
frame reserves cooperation seam
surface decides whether Ask Conexus is eligible/currently exposed
P-01/P-02 decide panel content and exact interaction contract
collapsed by default is allowed
no global assistant Product authority
no cross-Project access
no new operation
exact push/overlay/full thresholds NOT selected here
```

The revised HTML lets the operator inspect the seam open/closed, but it remains P8 structural Evidence rather than the P11 assistant prototype.

---

## FABLE-GF01-04 — CARRY FORWARD — Agents / Brain scope semantics

The reviewer is correct that identical short labels can hide materially different ownership:

```text
Workspace Agents = access-filtered catalog of Project-owned Agents
Project Agents   = exact Project-owned Agent authoring/runtime projection

Workspace Brain  = reusable Workspace Brain authority
Project Brain    = Project binding to an exact Brain revision
```

GF-01 keeps compact rail labels for now because the breadcrumb makes current scope explicit, but later surface headings/descriptors MUST clarify the ownership distinction.

Carry-forward:

- Workspace `Agents` receives explicit material block `W-04 — Workspace Agent catalog`; its first-screen heading/descriptor must state that Workspace is not Agent owner.
- Workspace Brain detail remains in `W-02`.
- Project Agents remain `P-03`.
- Project Brain binding remains `P-02`.

If later walkthrough shows the short rail labels still mislead users even with strong scope context, reopen only the terminology choice.

---

## FABLE-GF01-05 — ACCEPT FOR WALKTHROUGH — Project identity cue in rail

The revised candidate adds a lightweight Project-name cue at the top of the Project rail.

This is deliberately a walkthrough hypothesis, not separately locked authority. It may be removed if the breadcrumb-switcher already provides sufficient orientation and the cue proves redundant.

Decision criterion at operator walkthrough:

```text
extra orientation value > redundant vertical noise
```

Mobile continues to show explicit Workspace/Project context in the navigation drawer.

---

## FABLE-GF01-06 — CARRY FORWARD — Projects cards are fixture only

The two-column Project cards in GF-01 are explicitly **fixture content used only to exercise the frame**.

They do not decide the `WS-S01 Projects` collection representation.

`W-01` must treat at least the following as a genuine structural comparison when that block opens:

```text
cards / grid
vs
structured list / table
```

Decision evidence must include actual expected Project count, scan/comparison needs and useful metadata such as Release state / recent activity if admitted. A card is not justified merely because the fixture has two Projects.

GF-01 now labels this representation as deferred in the HTML itself.

---

## FABLE-GF01-07 — CARRY FORWARD AS 4C-S06 — pending approval discoverability

The universal Approval Center remains **REJECTED**.

However Journey K still requires a human to discover that an exact eligible `ApprovalRequest` needs attention. Contextual hosting alone does not prove discoverability.

New structural question:

`4C-S06 — How does an eligible human discover a pending exact ApprovalRequest without creating a universal Approval Center or screen-shaped aggregate authority?`

Primary proving block:

```text
P-03 — Agents + triggers + runs + exact approvals
```

Cross-check in:

```text
P-04 — Activity / operational evidence
PA-01 — Published-App platform frame when the app route admits approval
W-01 — Project collection only if existing accepted reads can support a truthful signal without a new aggregate API
```

Before any badge/count/notification is drawn, authority feasibility must prove the required current truth can be obtained from existing admitted operations. A visually convenient cross-Project approval count is not authority to invent an aggregate endpoint.

---

## Block-ledger carry-forward correction

The review exposed one scheduling omission in the earlier 4C-5 block ledger: `WS-S03 Workspace Agent catalog` had exact operation coverage (`PRJ-22`) but no explicit later material block assignment.

Current carry-forward addendum:

```text
W-04 — Workspace Agent catalog
scope: WS-S03 / PRJ-22
purpose: browse accessible Project-owned Agents across the Workspace without implying Workspace ownership
```

This does not open W-04. GF-01 remains the only active material block.

---

## Revised GF-01 lock question

The operator should now judge H1-R2 as one structural package:

```text
one adaptive rail
+ breadcrumb-switcher context hierarchy
+ Workspace context-menu shortcuts
+ lightweight Project rail context cue
+ reserved collapsible contextual Conexus panel seam
+ narrow navigation drawer
+ Projects representation explicitly fixture/deferred
```

Still not decided here:

```text
final visual design / brand
exact menu component
exact URLs/router
assistant content/thresholds/modes
Projects cards vs list/table
Agent/Brain final wording if later evidence requires change
approval signal/badge placement
```

No dependent material block may inherit GF-01 as baseline until the operator explicitly sets `LOCKED`.
