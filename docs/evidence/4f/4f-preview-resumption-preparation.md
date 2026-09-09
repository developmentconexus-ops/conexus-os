# BLD-10 Preview resumption preparation

This packet is the smallest input for a fresh session to prepare the next
Product grant. Current status, grant and next action live only in
[`docs/roadmap.md`](../../roadmap.md). It does not accept the unresolved
serving/browser boundary or authorize Product implementation.

Product meaning remains in the accepted
[`BLD-10` owner](../../product/operation-ledger.md) and
[`Preview` laws](../../product/contract.md); ordered R3+ realization remains in
[`realization-planning.md`](../../phases/realization-planning.md).

## Proposed target and accepted constraints

Subject to admission of the unresolved serving/browser boundary, the next
candidate vertical is the existing `BLD-10 GetBuildPreview` projection:

```text
exact Project + project.build + optional changeId
-> server resolves CURRENT_PROJECT or exact CHANGE_CANDIDATE subject
-> [UNRESOLVED] authenticated, isolated serving resolution from previewId
-> browser shows the exact ready subject without creating live/verified truth
```

Preserve the accepted laws in the Product owners:

- current and candidate are two subjects in one Preview vertical, not two
  concurrent Product increments;
- the server selects current Project source and re-resolves any Change inside
  the Project; caller possession of an ID creates no source, review or runtime
  authority;
- `ready != verified != AVAILABLE != live`, and `BLD-10` remains `live=false`;
- a new candidate does not destroy the last-good inspectable Preview;
- Preview, Control Plane and Published Application authority remain separate;
- the closed response schema is not widened with a URL, new operation, new
  owner or generic app-serving contract by convenience.

## Admission questions and falsifiers

The preparation step must resolve, in existing owners, only what implementation
needs to become mechanical:

1. how opaque `previewId` resolves to authenticated serving without becoming
   authority by possession;
2. artifact identity, custody and lifecycle for current/candidate subjects;
3. separate browser origin/session behavior and credential, network and egress
   isolation for untrusted application bytes;
4. expiry, revocation and authorization recheck behavior;
5. last-good preservation and stale/CAS behavior while a replacement builds;
6. bounded resource/failure behavior and the exact meaning of `ready`.

The boundary is not admissible if a guessed/stale ID serves bytes, revoked
authority continues to serve, candidate bytes gain Hub credentials or authority,
cross-origin state collapses Preview into Control Plane/Published App, a late
candidate replaces a newer subject, failure destroys last-good, or a readiness
projection masquerades as verification/live truth.

If an answer requires new Product meaning, operation, owner, trust boundary or
durable record class, stop and reopen the smallest accepted owner. Unknowns
remain unknown; this packet selects no transport or runtime mechanism.

## Execution map after admission

```text
accepted operating-model correction
-> deliberate Preview serving/browser admission
-> freeze owner/interface/file envelopes and proof
-> two disjoint Luna/xhigh mechanical lanes
   - Hub: subject/auth/serving resolution and isolated runtime boundary
   - Web: typed current/candidate Preview projection and honest states
-> Sol/medium integrator: shared module/routes/config, composed tests and proof
-> reconcile remaining RB obligations against accepted scope; close or retain
   each explicit deferral without assuming every deferred BLD operation gates R3
-> R3 read-model/sync
-> R4 queries/result -> R5 Published App -> R6 Release/serving -> R7 real sync/oracle
```

The two writer lanes begin only after the boundary is accepted and implementation
is explicitly granted. They must receive disjoint file envelopes; the integrator
owns shared files, whole-diff review and deciding verification. Canonical model,
advisor, delegation and independent-review routing lives only in
[`review-and-delegation.md`](../../../.agents/skills/conexus-development/references/review-and-delegation.md).

R3 formally depends on RB; this packet does not invent Preview as a new formal
R3 prerequisite. R3 authors and verifies migration/sync/cursor/merge semantics,
but no real JobRun occurs before R6 supplies exact non-production Release/serving
authority and R7 admits the real sync and independent oracle.

## Completion of preparation

Preparation is complete only when the six questions above have owner-backed
answers, the falsifiers have a proportional proof route, file envelopes are
disjoint, shared integration ownership is explicit, and the roadmap grants the
bounded implementation. No provider/model/E2B/Sankhya execution, deployment,
Release, R3+ work or Product code belongs to this preparation step.
