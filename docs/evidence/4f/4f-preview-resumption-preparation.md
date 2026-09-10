# BLD-10 Preview resumption preparation

This packet is the smallest input for a fresh session to prepare and realize
the bounded `BLD-10` Product grant. Current status, grant and next action live
only in [`docs/roadmap.md`](../../roadmap.md). The operator accepted the
serving/browser boundary on 2026-09-08; this packet authorizes only the bounded
BLD-10 implementation envelope described below.

Product meaning remains in the accepted
[`BLD-10` owner](../../product/operation-ledger.md) and
[`Preview` laws](../../product/contract.md); ordered R3+ realization remains in
[`realization-planning.md`](../../phases/realization-planning.md).

## Proposed target and accepted constraints

The admitted projection checkpoint is the existing `BLD-10 GetBuildPreview`
vertical:

```text
exact Project + project.build + optional changeId
-> server resolves the approved Baseline CURRENT_PROJECT or exact CHANGE_CANDIDATE subject
-> honest non-ready projection until an immutable application artifact exists
-> [OPEN R5 PREREQUISITE] authenticated, isolated serving resolution from previewId
-> browser shows the exact ready subject only after that prerequisite
```

Preserve the accepted laws in the Product owners:

- current and candidate are two subjects in one Preview vertical, not two
  concurrent Product increments;
- the server selects the approved Project Baseline and re-resolves any Change
  inside the Project; caller possession of an ID creates no source, review or runtime
  authority;
- `ready != verified != AVAILABLE != live`, and `BLD-10` remains `live=false`;
- a new candidate does not destroy the last-good inspectable Preview;
- Preview, Control Plane and Published Application authority remain separate;
- the closed response schema is not widened with a URL, new operation, new
  owner or generic app-serving contract by convenience.

## Accepted serving/browser boundary

The following bounded boundary is assembled from the existing owners and was
accepted by the operator on 2026-09-08. It does not create a new Product
operation, URL contract, owner, trust boundary or durable record class. Exact
transport and resource numbers remain implementation mechanics under these
invariants and must be proven.

### Existing-owner composition

```text
BLD-10 / Builder
  owns the exact CURRENT_PROJECT or CHANGE_CANDIDATE Preview projection,
  project.build eligibility, and subjectDigest binding.

Identity & Access
  owns the current human session and Project grant recheck.

Artifact Registry + Blob/CAS
  own immutable ArtifactRevision identity, digest, payload and availability;
  storage paths and digests never authorize access by possession.

MAR
  owns serving mechanics and the existing serving_route record class;
  it does not become a second Preview Product owner.

Security / browser boundary
  keeps Control Plane, Preview and Published Application contexts separate;
  candidate bytes receive no Hub credential or authority.
```

### Proposed contract

1. A future serving route will use a stable opaque server-owned reference for
   the exact Project, subject kind, subjectDigest and immutable ArtifactRevision
   selected by BLD-10; it is never a bearer permission. The current projection's
   per-response `previewId` is correlation-only and is not that route reference.
   Every serving request must resolve the route server-side and recheck current
   session, `project.build`, Project/Change containment, route state and subject
   identity before returning bytes.
2. A serving route may point only at an immutable, digest-bound artifact. The
   route's `ready` projection means that this exact artifact is available and
   has passed the bounded serving readiness checks. It does not assert
   `VERIFIED`, Release `AVAILABLE`, `SERVED_VERIFIED` or `live`.
3. Preview bytes are served in an origin/session boundary separate from the
   Control Plane and Published Application. Control Plane cookies, bearer
   credentials, browser storage and Hub authority are not sent to or exposed
   to candidate bytes. Browser network access remains subject to the existing
   browser and guest egress laws; no arbitrary cross-origin capability is
   admitted here.
4. A route becomes unusable when its server-owned expiry, revocation,
   subject/artifact invalidation or current authorization check fails. An
   opaque ID never keeps access alive after the owning authority narrows.
   The implementation must choose and prove a finite lifetime and explicit
   invalidation triggers; they are not inferred from the identifier.
5. Candidate replacement uses an expected route generation and exact
   subjectDigest. A stale or late candidate is refused without mutating the
   currently inspectable last-good route. A ready replacement becomes the
   selected Preview subject only after the conditional swap succeeds; building or
   failing a replacement never destroys last-good.
6. Serving is bounded by owner-selected resource, concurrency, request and
   lifetime limits. Exhaustion, missing bytes, failed readiness, stale CAS or
   revoked authority returns an explicit non-ready/failure projection and does
   not promote the route. No numeric limit, URL shape or status vocabulary is
   selected by this packet.

### Proportional proof route

After acceptance, the boundary must have targeted proof for anonymous/guessed
ID refusal, revoked-session refusal, cross-origin credential absence,
candidate-to-Hub isolation, stale/CAS refusal, last-good preservation after
candidate failure, bounded resource failure and the distinction between
`ready`, `VERIFIED`, `AVAILABLE` and `live`. A browser fixture may prove the
browser contract; it cannot substitute for a real serving composition claim.
No provider, model, E2B, Sankhya, deployment or production call is part of
this preparation.

### Implementation stop

The implementation stops if the chosen mechanics require a new Product
operation, owner, trust boundary or durable record class, or if they cannot
prove current-session recheck, browser isolation, stale/CAS refusal,
last-good preservation, bounded failure or honest readiness state. Reopen the
smallest owner instead of silently widening BLD-10.

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
-> BLD-10 subject projection and proof
-> R3 read-model/sync when its exact 4D-C mechanism selection is admitted
-> R4 queries/result -> R5 Published App -> R6 Release/serving -> R7 real sync/oracle

Ready Preview serving is a separate R5/R6 owner decision. Its source-to-
application-artifact producer is not inferred by the projection or by R3.
```

The admitted BLD-10 implementation runs under the single autonomous Goal grant
recorded by the roadmap. If a future multi-writer round is explicitly admitted,
its lanes must receive disjoint file envelopes; the integrator owns shared
files, whole-diff review and deciding verification. Canonical model, advisor,
delegation and independent-review routing lives only in
[`review-and-delegation.md`](../../../.agents/skills/conexus-development/references/review-and-delegation.md).

R3 formally depends on RB; this packet does not invent Preview as a new formal
R3 prerequisite. R3 authors and verifies migration/sync/cursor/merge semantics,
but no real JobRun occurs before R6 supplies exact non-production Release/serving
authority and R7 admits the real sync and independent oracle.

## Completion of preparation

Preparation is complete for the bounded projection: the six questions have
owner-backed boundary constraints and a proportional falsifier route, and the
operator granted the implementation. The artifact-production answer is an
explicit open R5 prerequisite; the stage packet does not hide it as serving
plumbing. No provider/model/E2B/Sankhya execution, deployment, Release, R3+
work or unrelated Product code belongs to this slice.
