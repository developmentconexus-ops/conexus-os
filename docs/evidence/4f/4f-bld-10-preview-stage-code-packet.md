# BLD-10 — bounded Preview stage code packet

Current stage, grant and next action remain owned only by
[`docs/roadmap.md`](../../roadmap.md). This packet freezes the implementation
slice granted on 2026-09-08 and records the artifact-production prerequisite
found during the Astra design check.

## 1. Observable outcome and protected invariant

For an authenticated account with current `project.build` authority, the
existing Build surface can request the exact current Project Preview or an
exact Change candidate. The server resolves the subject inside the requested
Project and returns the closed `BuildPreview` projection:

```text
Project + optional untrusted changeId
-> approved Project Baseline OR contained Change candidate
-> exact subject identity
-> previewId owned by the server
-> ready=false until an admitted immutable application artifact exists
```

The protected invariant is:

> `BLD-10` never lets an identifier choose source or authority, never exposes
> a foreign Project or Change, and never represents source bytes as a ready
> application. `ready`, `verified` and `live` remain independent; `live` is
> always `false`.

This slice does not claim that a browser can execute a ready application. The
repository currently has no supported source-to-frontend-artifact producer;
that prerequisite belongs to the smallest R5 owner and must be admitted before
the ready/browser claim can close.

## 2. Frozen operation and owner census

Only the already accepted operation is reachable:

```text
BLD-10 GetBuildPreview
GET /api/control/projects/{projectId}/preview
optional query changeId
```

Builder owns subject selection and the projection. Identity & Access rechecks
the current session. Project/Builder persistence resolves the approved current
source and exact contained Change candidate. Registry and MAR remain the
future owners of immutable application artifacts and serving routes; this
packet does not invent their tables, operations, or a second Preview owner.

The core implementation envelope is:

```text
apps/hub/migrations/023_rb_builder_preview_subject.sql
apps/hub/src/builder/{preview.ts,routes.ts,store.ts,module.ts}
apps/hub/src/server.ts
apps/web/src/features/builder/{api.ts,components/project-build.tsx}
tests/implementation/{bld-10-preview.test.mjs,rb-builder-first-vertical.test.mjs}
scripts/run-hub-migrations.mjs
docs/evidence/4f/4f-bld-10-preview-stage-code-packet.md
docs/roadmap.md
```

The same admitted slice also requires these shared verification, browser and
authority-routing files; they carry no new Product owner or runtime effect:

```text
apps/web/src/features/builder/components/project-build.tsx
docs/decisions/index.md
docs/index.md
docs/evidence/4f/4f-preview-resumption-preparation.md
docs/evidence/4f/4f-r3-admission-preparation.md
docs/evidence/4f/4f-bld-10-preview-verification-receipt.md
docs/evidence/4f/4f-bld-10-4c-f15-owner-requalification-preparation.md
docs/evidence/4f/4f-bld-10-4c-f15-owner-disposition.md
package.json
scripts/conexus-verify.mjs
tests/implementation/rb-builder-browser.test.mjs
tests/repository/conexus-verify.test.mjs
```

If honest subject resolution requires a new migration, Registry/MAR table,
artifact format, serving URL, or cross-owner authority, stop and reopen the
smallest owner. No provider, model, E2B, Sankhya, deployment, Release or R3+
effect is admitted.

## 3. Intended functions and failure behavior

The Hub projection must:

1. recheck the current human session and `project.build` on every request;
2. resolve no `changeId` to the server-owned approved Project Baseline;
3. resolve a supplied `changeId` only when it belongs to the exact Project and
   has an exact candidate subject available;
4. derive `subjectKind` and `subjectDigest` from owner-provided immutable
   subject facts, never from caller-selected source revisions;
5. mint a server-owned per-response `previewId` and return `ready=false` when
   no admitted immutable application artifact is available. In this
   projection-only part the id is correlation identity only: it is not stable,
   resolvable, a byte bearer or a serving route. A future MAR serving slice
   must define its own stable route identity and artifact owner before using
   this field for lookup;
6. return `verified=false` unless the existing Builder verification fact is
   bound to the same subject; always return `live=false`.

Anonymous requests return `401`. A foreign Project, foreign Change, missing
candidate or revoked build grant returns the existing safe `403`/`404`
projection. This projection re-resolves the current approved source on every
request; it does not define a separate stale-subject state. A missing,
unavailable, or unproven artifact never becomes `ready=true`; no last-good
route is created or destroyed by this projection-only part.

The Web surface may display the exact subject and an honest non-ready state.
It must not create an iframe, fetch a guessed byte path, or present source or
Git output as an application Preview.

## 4. RED falsifiers and targeted proof

The slice stops on any of these falsifiers:

1. a guessed `projectId`, `changeId`, source revision, or `previewId` discloses
   another Project's subject or bytes;
2. a revoked session or `project.build` grant still returns a projection or
   bytes that were previously unavailable;
3. caller input selects a source revision, Release, artifact, URL, or runtime;
4. current Project and Change candidate subjects are conflated or relabelled;
5. `ready=true` appears without a digest-bound immutable application artifact;
6. `verified=true` is inferred from `ready`, or `live=true` appears;
7. the Web surface treats source inspection or a synthetic HTML page as a
   ready application;
8. implementing the route requires an unadmitted owner, operation, record,
   trust boundary, or external effect.

The deciding proof for this packet is a production Hub module/route test with
injected owner ports plus the real Web component contract. A contract fixture
may prove DTO and failure mapping, but it cannot claim a ready browser journey.
The test must cover current versus candidate selection, foreign/unknown
identifiers, revoked authority, honest non-readiness, and the independent
`verified`/`live` fields. No live provider or browser-serving claim is made.

## 5. Completion and explicit non-goals

This packet's current projection checkpoint is complete when the closed BLD-10
route and Web projection are wired without broadening the Product contract,
focused falsifier tests pass, the current verification checks remain green,
and the roadmap records the remaining artifact producer prerequisite. The
approved Baseline subject decision is recorded in the owner packet; a fresh
closure review remains the final checkpoint before this slice is marked closed.
The ready-serving/browser part stays open until that prerequisite is admitted.

It deliberately does not close:

- immutable application artifact production/admission;
- `mar.serving_route` persistence, expiry, revocation, CAS promotion or
  last-good replacement;
- authenticated Preview byte serving or browser origin/session isolation;
- `ready=true`, Published App, Release, R3+, or any provider/model/E2B call;
- commit, push, PR, merge, or deployment.

## 6. Current proof record

The projection checkpoint was exercised in the pinned WSL toolchain
(`node 24.20.0`, `npm 12.0.2`):

- Hub and Web TypeScript checks passed;
- Biome passed over the changed Hub/Web, migration, test and runner paths;
- `node --test tests/implementation/bld-10-preview.test.mjs` passed both
  independent-state/non-readiness tests;
- the Playwright Builder browser tests passed with current and candidate
  Preview responses stubbed and the honest non-ready state asserted;
- the composed Builder HTTP test passed the current/candidate route, malformed
  Change reference, null-subject and store-failure mappings, injected owner
  arguments, and closed `live=false`/non-ready assertions;
- the PostgreSQL migration test directly proved that a well-formed Change from
  another Project is contained and that revoking `can_build` removes the
  current-subject projection; both checks passed against PostgreSQL 17;
- the candidate verification graph now has a dedicated BLD-10 projection leaf
  and includes its test in the shared Biome leaf;
- `npm run wire:bundle && npm run wire:builder` passed the canonical 20-route
  Builder contract check;
- the PostgreSQL 17 migration proof passed with the explicit local verification
  container, including current-subject, missing-candidate, verified-candidate,
  unauthorized-subject and function-security checks;
- `git diff --check` passed.

The verification-tool regression leaf passed after its expected candidate
scope census was aligned with the dedicated BLD-10 leaf. Every leaf before
`web-build` passed in the candidate run; `web-build` and every remaining
repository/wire leaf were then rerun with the deterministic local Vite binary,
`CONEXUS_ALLOW_DIRTY_WORKTREE=1` and the PostgreSQL 17 container, and all
passed. The earlier `web-build` failure was only the runner's missing
`node_modules/.bin` PATH; no Product assertion failed. No provider, model,
E2B, Sankhya or deployment execution was performed. The ready-serving/browser
claim remains open pending the R5 artifact producer.

## 7. Independent challenge and adjudication

The first independent dual review on the dirty candidate returned:

- AGY/Gemini: `PROCEED`, with no finding against the current projection claims;
- Fable: no stop for the projection, plus one future ready-serving Product/Plan
  gap and local execution findings about browser proof coverage, UUID input
  validation, per-response `previewId` semantics, stale-subject wording,
  roadmap alignment and candidate freezing.

The Lead adjudicated those findings against current owners. The ready-serving
artifact producer remains an explicit R5/R6 owner decision and is outside this
projection checkpoint. The local findings were corrected by adding browser
Preview fixtures and candidate-graph coverage, tightening UUID validation,
stating that the current `previewId` is correlation-only, removing the stale
subject overclaim, aligning the 4D roadmap row, and adding DB-level foreign-
Change and revoked-grant assertions. A clean independent review was then run
with a brief that excluded this historical adjudication text. Gemini/AGY found
no protected-claim violation; the Claude independent lane (Opus fallback after
the Fable executor failed) found no projection-security stop but identified a
material Product/Plan ambiguity over whether `CURRENT_PROJECT` means the
approved Baseline or the Project Git head. That question is routed to
the accepted [current-subject owner decision packet](4f-bld-10-current-subject-owner-decision-packet.md),
which records the approved Baseline decision. The artifact-producer owner gap
and the review-envelope/template items remain safely deferred to the
serving/next-slice owner, while closure remains pending the fresh review
findings. R3+ remains paused until the smallest next admission packet supplies
its exact owner, dependency, contract and proof route.
