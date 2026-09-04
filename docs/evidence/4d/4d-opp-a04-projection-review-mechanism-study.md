# 4D OPP-A04 — Projection Compiler / Review Mechanism Study

> **Status:** `PASS 1 COMPLETE / BOUNDED MECHANICS PROMOTED / UNIVERSAL REVIEW FRAMEWORK REJECTED`
> **Inputs:** locked Baseline, Brain and Build/Plan Screen Contracts; `FE-10`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

> Which human-review mechanics are genuinely repeated and safe to share, and
> which apparent similarities must remain owner-specific to avoid a universal
> Review domain, lifecycle, API or client store?

## 2. Current consumers

### Baseline candidate review

- immutable Project-owned candidate/source identity;
- exact candidate digest and re-entry;
- visual human review and contextual explanation;
- approval binds the exact candidate revision/digest;
- selected text/anchor/DOM is never decision identity;
- stale projection/anchor requires explicit mismatch/failure.

### Brain revision/proposal review

- Brain-owned exact source revision/proposal identity;
- deterministic `reviewText` presentation plus owner-specific
  `knowledgeBrowse` structure;
- proposal decision binds `proposalRevision`;
- publication separately binds `candidateSourceRevision`;
- frontend may not parse Markdown/DOM into Brain semantic hierarchy;
- review content is presentation, never canonical source or decision identity.

### Plan/progress inspection

- Builder/Hub-owned live Plan/checklist truth;
- mutable current item state and progress;
- worker/model proposals never settle state directly;
- materially different from immutable candidate/revision review.

### Other inspectable subjects

Agent definitions, Release composition, Findings/Evidence and source/diff views
repeat some safe rendering, provenance and exact-subject presentation properties,
but retain distinct owners and lifecycles.

## 3. What is actually shared

The repeated protected mechanism set is bounded:

1. safe rendering of owner-issued read-only presentation content;
2. exact projection source identity/digest/version where re-entry/context needs it;
3. deterministic derivation/reconstruction from canonical owner source;
4. provenance and current/stale/unsupported disclosure;
5. untrusted context/anchor revalidation against the exact projection;
6. accessibility, reading-order, focus and reduced-motion behavior;
7. typed unsupported/unknown fallback rather than invented structure;
8. application of owner-specific action controls outside the renderer.

Not shared:

```text
decision subject
approval/currentness rules
source identity
owner lifecycle
Permission/disclosure
mutation API
comment/session/thread semantics
semantic hierarchy
Plan/checklist state
```

## 4. Alternatives

### A — universal `ReviewProjection` Product domain/API

Rejected. It would merge Project, Brain, Builder, Release and other owners;
create generic status/decision semantics; and encourage screen-shaped DTOs.

### B — one universal renderer/store/hook owning review state

Rejected. A shared client store would normalize different owner currentness,
decision and lifecycle truth. Visual similarity is insufficient.

### C — owner-specific renderers with no shared safety mechanics

Safe locally but wasteful. Repeated sanitization, accessibility, source-version
and anchor-mismatch controls would be reinvented and could drift.

### D — bounded projection protocol + owner adapters + shared rendering kernel

Leading hypothesis:

```text
canonical owner source/state
→ owner-specific projection compiler/adapter
→ non-authoritative versioned rendering projection
→ shared safe rendering kernel
→ owner-specific controls/actions/currentness
```

The kernel owns only rendering mechanics. The owner adapter defines which
content/structure is disclosed and how source/version/anchor truth is resolved.

**Pass-1 disposition:** `PROMOTE_TO_4D_PROPERTY / LEADING STRUCTURAL HYPOTHESIS`.

## 5. Projection contract hypothesis

Conceptual mechanics, not frozen Product wire:

```text
projectionSourceRef + digest/version
content representation
optional derived anchor map
safe rendering profile
disclosure/provenance metadata already admitted by the owner
```

Rules:

- projection identity never replaces the owner's decision/source identity;
- derived anchors are scoped to one exact projection version;
- anchor mismatch returns explicit failure/no-match, never nearest-text authority;
- renderer never parses presentation text into Product semantic IDs;
- no renderer output enters mutation requests except as untrusted context that
  the server revalidates;
- unknown content kinds render safe unsupported fallback;
- owner-specific components may compose the kernel without sharing business
  state;
- generated projection/cache is reconstructible and never hand-owned authority;
- no new Product operation is admitted solely for the renderer.

## 6. Baseline/Brain/Plan disposition

| Consumer | Reuse |
| --- | --- |
| Baseline | use shared rendering/anchor safety; keep candidate lineage, refinement and approval entirely Project-owned |
| Brain | use shared safe content rendering where applicable; keep `knowledgeBrowse`, semantic hierarchy, proposal decision and publication Brain-owned |
| Plan | may reuse visual layout/accessibility building blocks; live Plan/checklist projection and transitions remain Builder/Hub-owned |
| Agent/Release/Evidence/source | evaluate only the safe renderer kernel per exact content type; no automatic enrollment in a generic Review family |

Plan is the falsifier against over-generalization: a mechanism that requires
immutable document/revision semantics for every subject cannot serve live Plan
truth and must remain a smaller document renderer rather than a universal review
framework.

## 7. Technology inquiry boundary

Potential implementation tools may later be evaluated for bounded roles:

- safe Markdown/structured-content parsing/rendering;
- sanitization and link policy;
- syntax/source/diff rendering;
- accessible disclosure/focus primitives;
- deterministic anchor generation;
- virtualized large-document presentation when a real size consumer exists.

Editors, collaborative-comment domains, rich-text source ownership, generic
document databases and browser-derived semantic outlines are not implied.

No rendering library is selected in this pass. Exact tools wait for 4D-C after
the projection representation and current consumers are fixed.

## 8. Required proof

1. Same owner source/version produces identical projection output.
2. Changed source invalidates old version/anchors.
3. Stale/forged anchor cannot mutate or decide anything.
4. Unsafe markup/script/link content is neutralized by the rendering profile.
5. Keyboard/focus/reading order/reduced-motion properties survive in all host
   compositions.
6. Brain `reviewText` cannot manufacture semantic hierarchy.
7. Baseline projection cannot manufacture candidate/approval identity.
8. Plan cannot be flattened into immutable document status.
9. Unknown content renders safe fallback and preserves source/provenance.
10. Shared kernel has zero Product operations, Permissions and durable record
    classes.

## 9. Pass-1 outcome

```text
OPP-A04 PASS 1 = COMPLETE
shared safe rendering kernel = PROMOTE_TO_4D PROPERTY
owner-specific projection adapters = PROMOTE_TO_4D PROPERTY
projection version / stale-anchor mismatch = REQUIRED 4D REALIZATION
universal ReviewProjection Product owner/API = REJECT
universal review store/hook/lifecycle = REJECT
Plan reuse = visual/accessibility mechanics only
exact rendering package selection = 0
Product implementation authority = 0
```
