# 4C W-01 — Fable Adversarial Review Result

> **Status:** TEMPORARY REVIEW EVIDENCE / REVIEW BRANCH ONLY / NEVER MERGE
> **Reviewer:** independent Fable challenger (fresh session, no authoring involvement in 4C-F03 / C1-R1).
> **Reviewed candidate HEAD:** `89baef196b7ac9f567e645207b857de9adfb495a` (review branch base verified: only `w01-fable-review-request.md` differs, `git diff --stat 89baef1..eaee715` = 1 file).
> **Independent proof reproduction:** full repository suite re-executed by this reviewer on a Linux-filesystem WSL2 clone of the review branch: **54 tests / 54 pass / 0 fail**, consistent with the claimed Verify #525 SUCCESS. A first run on the Windows NTFS worktree produced 2 environment-artifact failures (see MIN-03); they do not implicate the candidate.

## VERDICT

```text
VERDICT = SURVIVES
```

No material finding. The candidate direction — exact immutable candidate → deterministic human review projection → candidate-local selection context → candidate-bound contextual explanation → local non-authoritative refinement queue → explicit Apply via `PRJ-07` refinement → new immutable candidate → exact-digest approval — is the smallest coherent Global-Maximum solution among the compared options, and no attacked protected property fell.

## MATERIAL FINDINGS

None. Every attack route below terminated in either a preserved invariant with concrete repository evidence, or a bounded minor/watch item that requires no correction before operator adjudication.

### R1 — Platform law, not frontend authority — HELD

Attacked: every client-side state in `w01-projects-inception-wireframe.html` and every untrusted input in the wire.

- `BaselineReviewContext.projectionAnchor` / `selectedText` are schema-described as untrusted and server-revalidated against the exact candidate (`project-paths.yaml:948-955`); they are context inputs to a read (`PRJ-24`), never identity.
- The only authority-bearing client-held value is `candidateBaselineDigest` as `URL_NAVIGATION` (`history.replaceState` at wireframe lines 336/376), which resolves through `PRJ-23` server truth — the accepted carrier pattern.
- The fixture's optimistic approve/refine transitions are explicitly labeled fixture-only and contradicted-in-text by the artifact itself ("Approval and refinement are never optimistic Product truth", wireframe line 192). No `PRODUCT_COMMAND` is simulated as client truth without that disclaimer.
- The refinement queue is `data-refinement-queue="local-draft"`; nothing crosses the authority boundary except explicit `PRJ-07` with typed `priorCandidateBaselineDigest + reviewFeedback` (`dependentRequired` both directions, `project-paths.yaml:230-232`), so candidate identity cannot hide in prose.

### R2 — Baseline semantics remain Project-owned — HELD

- No second Baseline owner: `PRJ-07/08/09/23/24` all Project-owned (`operation-ledger.md:205-222`); no review-session/comment/thread CRUD exists anywhere in the wire; structural test `4c-w01-structural-wireframe.test.mjs:86-88` mechanically forbids `data-product-review-session`/comment/thread/edit-baseline attributes.
- Candidate mutability: no mutation operation exists on a candidate; refinement produces a new digest; `PRJ-09` approves an exact digest under `EXPLICIT_REVISION` with 412, so no stale-candidate approval race.
- No improperly avoided Permission: `PRJ-24` is genuinely part of the Baseline-management job (asking about the artifact one is authorized to review and approve). A new `baseline.chat`-class Permission would split one human job across two grants for zero trust gain — the permission contract's anti-proliferation reasoning (`permission-contract.md:243`) is correct.
- Capability/consumer pairing: `PRJ-23` consumer = refresh/re-entry; `PRJ-24` consumer = the reviewing human. No orphan capability found. (Digest recoverability across lost URLs is MIN-01, a deferred-consumer question, not an orphan capability.)

### R3 — `project.manage` vs `project.build` — SEPARATION SURVIVES

Falsification attempt: claim both assistants are "the same semantic job." They are not. `BLD-16` explains current authorized Project context to a person doing Builder/Change work; `PRJ-24` explains one exact immutable pre-approval candidate to the person deciding whether to adopt it as Baseline. Subjects differ (Project context vs exact candidate digest), jobs differ (building vs adjudicating), and the permissions intentionally do not imply each other (`permission-contract.md:83`). Merging them would force Baseline reviewers to hold `project.build` or convert `BLD-16` into a universal assistant authority — exactly the over-broad outcome the correction rejects. Repository test `4c-w01-baseline-review-loop.test.mjs:67-75` mechanically enforces that the candidate-bound question is manage-usable without build. Watch item only: a third `Ask*` operation in a future owner would trigger the second-consumer rule for a shared contextual-explanation pattern (see WATCH-01); two instances do not.

### R4 — Lavish disposition — ADAPT SURVIVES

- ADOPT rejected correctly: Lavish's file-path identity, local CLI/server, polling and session mechanics contradict multi-user, server-authoritative, digest-pinned Conexus operation; adopting would import a browser/file authority channel the platform law forbids. Replacement cost of an adopted-then-removed mechanism exceeds the cost of adapting five properties.
- The adapted property set (portable rich HTML projection, precise selected context, conversation beside artifact, feedback queue before action, re-projection after canonical change) each has a named consumer in the accepted human job (`w01-reference-and-structural-hypotheses.md:96-104`).
- Bounded direct-reuse role probe: the only viable niche found is operator-local wireframe inspection during Phase 4 — an Evidence-workflow convenience, not Product architecture; premature rejection did not occur because nothing in the Product needed direct reuse.

### R5 — Mastra boundary — HELD

- The wire carries zero Mastra surface: `PRJ-24` request/response has no thread, session, memory or run identity; `provenanceRefs` are server-derived strings; the structural test forbids `data-mastra-*`/thread/memory claims in the P8 artifact (`4c-w01-structural-wireframe.test.mjs:89-91`).
- The binding law (`RequestContext -X-> authority`, thread -X-> Baseline truth, model output -X-> accepted refinement) is stated in the preflight and consistent with the Blueprint Harness Context-Compiler law (`blueprint-harness-design.md §6`).
- Residual realization risk (not a current defect): if 4D later adds conversation continuity, a thread identity must not enter the Product wire as a deciding field. Recorded as WATCH-02.

### R6 — Methodology alignment — HELD

- Clean falsifier discipline: Verify #502 EXPECTED RED with exactly the two F03 failures, operator acceptance, then GREEN #518/#525 — the RED tests are real executable falsifiers, not narrative. This reviewer independently re-ran them (54/54 on Linux fs).
- No ritual overreach detected: the correction added one operation and enriched one, with zero new Permissions/owners/record classes; the P8 artifact is bounded HTML/CSS/vanilla-JS with tests forbidding framework/runtime claims.
- Hidden-assumption sweep produced only MIN-02/MIN-03 (bounded, below).

### R7 — Baseline review vs Plan visualization — ANTI-GENERALIZATION HELD

Attacked hardest, as instructed. Findings:

- Nothing in the wire, tests or evidence admits a reusable rendering primitive. `BaselineReviewContext` is Baseline-named, not `ReviewContext`; anchors are candidate-local and Baseline-specific; the wireframe's Objective/Users/Core-needs/Constraints sections are fixture content, and the hypotheses doc claims only "human-readable visual sections" generically.
- A reusable `Review Projection` primitive **cannot** currently be proved from Baseline alone: the one protected property that would justify it (one deterministic projection contract serving two real consumers) has exactly one consumer today. Plan differs materially in truth dynamics — Baseline reviews a static immutable candidate; Plan projects live Hub-validated checklist state (`builder-and-harness.md §8.2`) with high-frequency server-side transitions. Choosing a shared architecture now would either over-fit Plan to static-candidate assumptions or bloat Baseline with liveness machinery. Repetition-first is the correct disposition; Plan grammar stays deferred to `P-01`/4D.

### R8 — Future Plan interaction premise — SOUND

The proposed common law (Hub-owned exact revision → projection of exact truth → human selects context → contextual explanation may help → conversation/proposals never mutate → explicit admitted operation crosses the boundary → reprojection) is not a rendering claim; it is the platform authority law already ratified for checklists (`plan.item.* proposed → Hub validates → Hub writes facts`, `builder-and-harness.md §8.2`) restated for visual review. Baseline and Plan differ in mutation cadence and truth liveness, but the law is cadence-independent. Sound as a future premise; it constrains nothing prematurely because it selects no grammar, operation shape or mechanism.

### R9 — Global Maximum / YAGNI comparison

```text
A. direct Lavish mechanism        = FAILS (authority channel via files/DOM/local server; multi-user misfit; removal cost)
B. Conexus-native adaptation      = SURVIVES as property source
C. custom generic review framework = FAILS (one consumer; invents domain; violates second-consumer rule)
D. Baseline-specific minimum       = SURVIVES as scope boundary
```

What survives adversarial comparison is exactly the candidate: **B-properties inside D-scope** — Baseline-specific minimum realized by adapting Lavish's collaboration properties, generalizing only after a second real consumer (Plan) is actually worked.

## MINOR FINDINGS

### MIN-01 — Unapproved-candidate digest recoverability depends entirely on client-held URL

- Attacked property: `PRJ-23` "durable re-entry."
- Evidence: `ProjectRepresentation` (`project-paths.yaml:866+`) exposes no candidate digest; no admitted read lists or discloses unapproved candidates; the digest exists client-side only via the `PRJ-07` response and the URL fragment.
- Failure mode: a reviewer who loses the URL (new device, cleared history, handoff to a second `project.manage` human) cannot reach an existing immutable candidate and must re-run `PRJ-07` (cost, new digest) — no authority violation, no data loss, no wrong approval possible (approval remains exact-digest).
- Disposition: NOT material — the accepted Journey-B human job is continuous, and the same class of question (`4C-S06` ApprovalRequest discoverability) is already an explicitly unopened carry-forward. Smallest owner if a real consumer materializes: Project (disclose current candidate digest(s) via `PRJ-02` or one bounded list read). No correction now.

### MIN-02 — `PRJ-24` revalidation-failure behavior and projection-version identity unspecified

- Attacked property: "deterministic projection" (`w01-baseline-review-global-maximum-preflight.md §5` names `candidateBaselineDigest + deterministic projection version + generated structural anchor`), yet `BaselineReviewContext` carries no projection-version field and the wire does not state what happens when `projectionAnchor`/`selectedText` fail to re-resolve (422 vs best-effort-ignore).
- Failure mode: bounded — worst case is an explanation about mis-resolved context; `PRJ-24` is read-only, so no authority transition can result.
- Disposition: NOT material at P8. The projection version can remain server-derived (digest + current server projection is already deterministic without a client-supplied version), and mismatch behavior is a 4D realization contract. Smallest owner: 4D `PRJ-24` realization contract must pin (a) server-side projection versioning and (b) explicit mismatch semantics. No wire change required now.

### MIN-03 — Repository proof is environment-sensitive on non-Linux checkouts

- Evidence: on the Windows NTFS worktree, 2/54 tests fail as pure environment artifacts: (a) `4c-gf01-locked-screen-contract.test.mjs:30` — `core.autocrlf=true` rewrites the GF-01 HTML to CRLF, breaking the pinned blob sha `2d899d00…` (`.gitattributes` pins `eol=lf` for md/ts/json/yml/yaml/sh but **not** `*.html` or `*.mjs`); (b) `scripts/check-current-state.mjs` reports `superseded canonical path remains: docs/INDEX.md / docs/ROADMAP.md` because NTFS case-insensitivity makes the superseded-path existence check match `docs/index.md`/`docs/roadmap.md`.
- Disposition: NOT material — AGENTS.md already mandates a WSL2 Linux-filesystem worktree, and the Linux run is 54/54. Bounded hardening available to the Lead at zero Product cost: add `*.html text eol=lf` and `*.mjs text eol=lf` to `.gitattributes`, and make the superseded-path check case-exact. Smallest owner: repository engineering rules / verification kit, not 4C.

## GLOBAL-MAXIMUM DISPOSITION

```text
Lavish            = ADAPT properties only (ADOPT and BUILD-full-editor correctly rejected)
Review primitive  = Baseline-specific now; reusable primitive DEFERRED until second real consumer (Plan, P-01)
Plan visualization= timing correct — grammar undecided, deferral explicit, no shared rendering architecture implied
Mastra            = cognition/mechanics only; zero wire surface; boundary law present and test-enforced
```

## METHODOLOGY CHECK

```text
adversarial independence = REAL (fresh session; exact-HEAD review branch; single-file delta verified; proof independently re-executed)
falsifiability           = REAL (clean 2-test RED → operator gate → GREEN; 54/54 reproduced by reviewer on Linux fs)
YAGNI                    = HELD (1 new operation, 0 new Permissions/owners/record classes; rejected-substitute list explicit)
smallest-owner reopen    = HELD (nothing in this review justifies reopening 4A/4B/GF-01; minor items route to 4D/engineering rules)
operator gate            = INTACT (W-01 remains NOT LOCKED; only operator visual adjudication may lock; this review creates no requirement by taste)
```

## WATCH ITEMS (non-findings, for Lead awareness only)

- **WATCH-01:** a third `Ask*` contextual-explanation operation in any owner triggers the second-consumer rule for a shared explanation pattern; two instances (`BLD-16`, `PRJ-24`) do not.
- **WATCH-02:** 4D realization of `PRJ-24` conversation continuity must keep any Mastra thread identity out of the Product wire as a deciding field.
- **WATCH-03:** flattening queued per-anchor refinements into one `reviewFeedback` string is consistent with anchors-never-authority; if refinement quality later suffers from lost section structure, the fix is richer *input context*, never anchor-as-identity.

## FINAL RECOMMENDATION

```text
LOCK candidate
```

Proceed to the already-routed operator visual/interactive adjudication of the W-01 C1-R1 Baseline HTML candidate. No bounded correction is required before that gate. MIN-01/MIN-02/MIN-03 and the watch items are Lead-discretionary hygiene/deferral records, none blocking.
