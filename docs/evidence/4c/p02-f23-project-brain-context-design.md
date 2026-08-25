# P-02 F23 — Project Brain Context decision

> **Status:** OPERATOR APPROVED / 4A+4B WIRE GREEN / FRONTEND REBASELINE REQUIRED / P8 NOT AUTHORIZED
> **Scope:** P-02 `Project → Brain`; no runtime/Product implementation authority.
> **Methods:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.3.

## Evidence

The P-02 walkthrough proved that `Project → Brain` must answer the human question:

> What enterprise meaning has this exact Project adopted and has available in its Project Brain context?

Pre-F23 authority was insufficient:

- `PRJ-10 GetProjectBrainBinding` exposed binding/revision/validation/update state only;
- `BRN-03 GetBrainRevision` exposed the whole exact Workspace Brain revision, not Project-resolved context;
- `BRN-13 GetProjectAnalyticQueryCatalog` exposed only the Project-admitted analytic semantic inputs for `BRN-12`;
- `effectiveBrainSliceDigest` is runtime-trace identity after bounded final context composition and is not one static Project-wide browse truth.

## Root cause

The accepted architecture distinguishes Workspace Brain publication, Project binding/local realization and runtime-specific final context composition, but 4A had no human Product read for the Project-resolved Brain knowledge context. A browser composition of `PRJ-10 + BRN-03` would have to infer applicability and would become parallel Brain authority.

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

Realized authority result:

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
new L7 flows = 0
```

## Authority / disclosure

Control-Plane route:

```text
brain.read
+ project.read
+ exact Project grant
+ exact current Project Brain binding
→ BRN-14 Project Brain Context read
```

`brain.bind` remains binding authority only and does not become generic knowledge inspection authority. Binding writes remain `PRJ-11/12` under their existing rules.

## Product projection

Realized semantic roles:

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

BRN-14 does not expose or imply:

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

## TDD / proof realization

Proof was defined before authority realization.

```text
RED commit = beb8b2b5601604e7fd008830e3b12940d64847ca
Verify #987 = EXPECTED FAILURE
exact failure = F23 missing GET Project Brain Context wire
```

The RED reached the new focused checker only after current-state, P8 JavaScript parsing and the existing 121-operation wire passed, proving the missing authority rather than an unrelated failure.

Final bounded recompile:

```text
4A canonical ledger = 122 fixed operations
Permission vocabulary = 25
4B BRN-14 = schema-closed Control-Plane GET
Brain closure = 13 Product operations
F23 negative controls = 3 / 3 firing
4A ↔ OAS = 122 ↔ 122 / 0 missing / 0 extra / 0 duplicate
wire carriers = 122 PASS
generated projection/Kubb = 122 deterministic Product entries PASS
wire topology = 12 reachable YAML fragments / 0 dead parallel
whole 4B adversarial = PASS / 122
whole 4B executable = PASS
Verify #993 = SUCCESS
```

Focused negative controls prove that BRN-14 cannot:

1. masquerade as a Project-wide runtime `effectiveBrainSlice`;
2. widen into a whole-Workspace publication projection;
3. expose runtime tool authority.

Independent review is not a mandatory floor for this correction because F23 creates no new Permission, principal, trust boundary or cross-repository binding and narrows disclosure to a server-resolved projection under two already-required read authorities. Reopen for independent challenge if later evidence shows the projection moves/widens an authority boundary rather than composing existing reads.

## Frontend consequence

The old P-02 P8 remains useful walkthrough Evidence but is **not lockable** after F23. The v2.3 bounded-rebaseline law now requires the affected P-02 human jobs/coverage/surface/P7 structure to project F22+F23 before a revised functional P8 may be executed.

## Reopen triggers

Reopen F23 if evidence proves any of:

- Project-local refinements cannot be represented truthfully without a distinct durable semantic owner;
- Project-context browse requires a new authority distinction beyond `brain.read + project.read`;
- response scale requires list/detail/search pagination rather than one bounded context read;
- a real user needs exact runtime effective-slice inspection at Project scope;
- exact cross-links from Data/Capabilities/Integrations to Brain concepts become a proven current user job;
- realization requires a new L7 orchestration flow or creates an owner dependency cycle.
