# R3 — RF-05 / RF-08 candidate independent review result

> **Status:** REVIEW COMPLETE / R3 NOT ADMITTED
> **Review mode:** fresh read-only Opus + Gemini lanes
> **Candidate:** [`4f-r3-rf05-rf08-candidate-freeze.md`](4f-r3-rf05-rf08-candidate-freeze.md)
> **Brief:** [`4f-r3-rf05-rf08-candidate-review-brief.md`](4f-r3-rf05-rf08-candidate-review-brief.md)

This file preserves the first independent review as Evidence. Its findings
were material and the candidate was corrected before a fresh review. It does
not replace the owner decision or admit R3.

## Lane receipts

| Lane | Tool/version | Session | Raw verdict |
| --- | --- | --- | --- |
| Opus | Claude 2.1.257 / canonical `claude-opus-5` | `70de7f30-e6c8-408f-8246-a30350e85269` | `R3 ADMISSION NOT SUPPORTED ON THE CURRENT FROZEN CANDIDATE` |
| Gemini | AGY 1.1.28 / `gemini-3.1-pro-high` | `37cada33-171c-49c3-9090-d4e1ca443436` | `REJECT: Candidate freeze base ...` |

The machine receipt is retained at
`/tmp/conexus-r3-rf05-rf08-review/conexus-review-result.json` in the current
workspace. The lanes were independent, read-only, and did not install,
execute a provider, run a JobRun, or publish Git.

## Opus findings

1. **PRODUCT / PLAN GAP — incomplete R3 census.** The freeze omitted five
   roadmap-assigned obligations (atomic cursor/merge, single-flight/coalescing,
   quiescence, missing-observation honesty and coverage/drift) and dropped the
   B02/B03 routing. Admission could therefore certify an incomplete subject.
2. **PRODUCT / PLAN GAP — inert `atlas.sum`.** The artifact covered 19 files,
   while the corpus had 23, and no runtime or repository check enforced it.
   The native runner was the actual integrity authority.
3. **LOCAL EXECUTION GAP — mutable shared candidate.** The candidate used
   unpublished worktree bytes overlapping the open BLD-10 slice and had no
   aggregate candidate digest proving both lanes saw one subject.
4. **METHOD FINDING — no census leaf.** No verification leaf bound the declared
   claim/integrity census to its actual corpus.
5. **PRODUCT / PLAN GAP — ambiguous `subjectDigest`.** The bare name covered
   the BLD-10 `BuildPreview.subjectDigest`, Builder Evidence, and unrelated
   Brain/Gateway canonical derivations, so the non-consumption gate was not
   falsifiable.

Opus found the selected `pg 8.23.0` root, native runner, isolated Package-D
tuple and owner boundary unfalsified. It also identified the missing physical
`mar` schema/job-run objects as an R3 implementation prerequisite.

## Gemini findings

1. **LOCAL EXECUTION GAP — duplicate/inert checksum description.** The runner
   used hardcoded digests and ignored the named `atlas.sum` artifact.
2. **PRODUCT / PLAN GAP — Package-D tuple drift.** The proof tuple
   PostgreSQL 17.10 + `pg 8.22.0` + Node 24.18.0 did not transfer to the root
   `pg 8.23.0` + Node 24.20.0 tuple.
3. **PRODUCT / PLAN GAP — missing MAR schema authority.** The current 001–023
   corpus did not create `mar` or `mar.job_run`.
4. **NO FINDING — Keycloak provider state remains outside Conexus inventory.**

## Initial adjudication state

The raw verdicts keep R3 at preparation-only. The accepted `A/A` decision,
native-runner selection, Package-D isolation, BLD-10 approved-Baseline meaning
and 4C-F15 disposition remain unfalsified and are not reopened. Corrections
and their owner routing are recorded in the companion
[`candidate-review-adjudication.md`](4f-r3-rf05-rf08-candidate-review-adjudication.md).
