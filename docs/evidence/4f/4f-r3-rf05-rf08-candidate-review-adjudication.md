# R3 — RF-05 / RF-08 candidate review adjudication

> **Status:** CORRECTIONS RECORDED / FRESH REVIEW REQUIRED
> **Authority:** Lead adjudication under the Engineering and Repository Methods
> **Scope:** findings in [`candidate-review-result.md`](4f-r3-rf05-rf08-candidate-review-result.md)

The first Opus and Gemini lanes identified material gaps. The Lead adjudicates
each against the smallest owner without reopening accepted upstream meaning.

| Finding | Adjudication | Evidence / owner route |
| --- | --- | --- |
| Opus F1: narrowed census | **CORRECTED** | Freeze and brief now carry the complete seven-row `R3-P1..P7` census, including the five omitted obligations. R3/Project/MAR remain the named proof owners; R7 remains the live-proof owner. |
| Opus F2 + Gemini F1: `atlas.sum` inert | **CORRECTED** | Native runner SHA-256 ledger and ordered census are the sole selected integrity authority. `atlas.sum` is explicitly historical Evidence only and excluded from the deciding path. |
| Opus F3: mutable shared candidate | **CORRECTED** | Freeze now binds the exact base, disjoint listed envelope, per-path hashes and an aggregate manifest digest. BLD-10 paths outside the R3 implementation envelope remain visible. |
| Opus F4: no census leaf | **CORRECTED** | `scripts/check-r3-candidate-freeze.mjs` verifies every custody digest, aggregate manifest and the 001–023 migration corpus; `repository:r3-candidate-freeze` is in the verification graph with a positive and forged-digest test. |
| Opus F5: ambiguous `subjectDigest` | **CORRECTED** | The gate is qualified as `BLD10_PREVIEW_SUBJECT_DIGEST`, exact `BuildPreview.subjectDigest` / `builder.read_preview_subject` identity. Builder Evidence and Brain/Gateway derivations are explicitly excluded. |
| Gemini F2: Package-D tuple drift | **RETAINED AS BOUNDARY** | The tuple remains isolated custody and is not transferred. Any changed tuple requires re-pin or requalification before deciding proof. No dependency is installed at this checkpoint. |
| Gemini F3: missing physical MAR objects | **ROUTED PREREQUISITE** | Current 001–023 has no `mar` schema or `mar.job_run`; R3 implementation must add the next ordered Project migration and exact pg-boss vendor DDL before physical MAR proof. |
| Gemini F4: Keycloak state closure | **NO FINDING** | Existing inventory boundary remains accepted and unchanged. |

The corrections are documentation and repository-proof work inside the
accepted freeze/review grant. They do not install dependencies, execute a real
JobRun, read a live source, create a serving Release, publish Git, or admit R3
implementation.

## Decision

The corrected candidate must receive a fresh independent Opus and Gemini review
against its final bytes. Until that review is complete and free of unresolved
material findings, R3 remains `PREPARATION ONLY / NOT ADMITTED`. A clean review
would support a later implementation-checkpoint decision; it would not itself
authorize runtime, live-source, Release or Git effects.
