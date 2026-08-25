# P-02 F23 — Project Brain Context decision

> **Status:** OPERATOR APPROVED FOR BOUNDED 4A/4B RECOMPILE / CANDIDATE AUTHORITY
> **Scope:** P-02 `Project → Brain`; no runtime/Product implementation authority.
> **Methods:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.3.

## Evidence

The P-02 walkthrough proved that `Project → Brain` must answer the human question:

> What enterprise meaning has this exact Project adopted and has available in its Project Brain context?

Current authority is insufficient:

- `PRJ-10 GetProjectBrainBinding` exposes binding/revision/validation/update state only;
- `BRN-03 GetBrainRevision` exposes the whole exact Workspace Brain revision, not Project-resolved context;
- `BRN-13 GetProjectAnalyticQueryCatalog` exposes only the Project-admitted analytic semantic inputs for `BRN-12`;
- `effectiveBrainSliceDigest` is runtime-trace identity after bounded final context composition and is not one static Project-wide browse truth.

## Root cause

The accepted architecture distinguishes Workspace Brain publication, Project binding/local realization and runtime-specific final context composition, but 4A has no human Product read for the Project-resolved Brain knowledge context. A browser composition of `PRJ-10 + BRN-03` would have to infer applicability and would become parallel Brain authority.

## Target invariant

```text
exact Project
+ exact current ProjectBrainBinding
+ exact immutable Brain revision
+ accepted Project-local realization/refinement
→ server-resolved Project Brain Context
→ human-inspectable adopted/available knowledge
```

And always:

```text
Project Brain Context != Workspace Brain publication authority
Project Brain Context != runtime effectiveBrainSlice
frontend != applicability/semantic owner
brain.bind != brain.read
```

## Constraints

- one canonical Workspace Brain remains the published meaning authority;
- Project remains owner of binding/local realization intent;
- no new generic Resource/Context owner;
- no new durable record class;
- no runtime ToolProjection, memory, RAG/vector or effective-slice surface;
- no publication/review/proposal mutation through the Project route;
- no browser-derived filtering of the whole Workspace Brain;
- exact Project grant and current binding are revalidated server-side.

## Alternatives

### A — one Project-scoped Brain read — SELECTED

Add one bounded Brain-owned Project-context projection, `BRN-14 GetProjectBrainContext`. It returns binding identity/state plus server-resolved Project-context knowledge browse.

**Why:** closes the proven human job without widening `PRJ-10`, duplicating Workspace Brain governance or making the frontend infer applicability.

### B — widen PRJ-10 with knowledge content — REJECTED

Mixes binding administration and semantic knowledge inspection, creates an oversized Project DTO and pressures binding authority to absorb Brain meaning.

### C — compose PRJ-10 + BRN-03 in browser — REJECTED

The browser cannot truthfully decide which Workspace Brain knowledge is admitted/realized for the exact Project. This creates duplicate semantic authority.

## Global Maximum / complexity result

**RESTRUCTURE NOW — bounded upstream F23.**

The smallest sustainable correction is one current read projection. No new Permission, owner, principal, durable record, orchestration framework or runtime slice is justified.

Expected authority result:

```text
BRN-14 GetProjectBrainContext
N_platform 121 → 122
Brain 12 → 13
Project remains 27
ordinary Permissions remain 25
new semantic owners = 0
new principal classes = 0
new trust boundaries = 0
new durable records = 0
```

## Authority / disclosure

Candidate Control-Plane route:

```text
brain.read
+ project.read
+ exact Project grant
+ exact current Project Brain binding
→ BRN-14 Project Brain Context read
```

`brain.bind` remains binding authority only and does not become generic knowledge inspection authority. Binding writes remain `PRJ-11/12` under their existing rules.

## Product projection

Minimum semantic roles:

```text
projectId
brainRevisionId
brainDigest
projectBindingDigest
validationState
updateAvailable

domains[]
  project-context-scoped domain coordinate
  human label
  concepts[]
    project-context-scoped concept coordinate
    human label
    summary
    contentClasses: SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC
    bounded human sections
    provenanceRefs[]
```

Project-context coordinates support rendering/navigation only. They are not canonical Brain semantic IDs, source identity, decision subjects or runtime ToolProjection coordinates.

## Explicit non-authority

BRN-14 must not expose or imply:

```text
whole-Workspace publication merely because a Project is bound
Workspace Brain authoring/review/proposal/publication authority
effectiveBrainSliceDigest as Project-wide truth
healthSnapshotDigest as one timeless Project context
Product-Agent/Builder runtime ToolProjection
memory / RAG / vector index authority
permissions / grants
candidateSourceRevision or publication commands
foreign Project/Workspace Brain context
```

## Proof strategy before realization

RED is the executable `wire:brain` F23 checker requiring the missing BRN-14 path and schema before authority changes.

Required GREEN proof:

1. 4A ledger admits exactly one BRN-14 read and derives 122 fixed operations.
2. Permission contract maps BRN-14 to existing `brain.read + project.read`; ordinary Permissions remain 25.
3. 4B exposes one schema-closed Control-Plane GET with no request body or non-HTTP ingress.
4. F23 focused checker proves closed projection shape and fires negative controls against runtime-slice, Workspace-publication and tool-authority widening.
5. 4A↔OAS is 122↔122 with zero missing/extra/duplicate operations.
6. generated projections and whole-4B proof remain green.
7. P8 remains blocked until bounded frontend rebaseline is recorded and a new P7 candidate has no unresolved upstream finding.

## Reopen triggers

Reopen F23 if evidence proves any of:

- Project-local refinements cannot be represented truthfully without a distinct durable semantic owner;
- Project-context browse requires a new authority distinction beyond `brain.read + project.read`;
- response scale requires list/detail/search pagination rather than one bounded context read;
- a real user needs exact runtime effective-slice inspection at Project scope;
- exact cross-links from Data/Capabilities/Integrations to Brain concepts become a proven current user job;
- realization requires a new L7 orchestration flow or creates an owner dependency cycle.
