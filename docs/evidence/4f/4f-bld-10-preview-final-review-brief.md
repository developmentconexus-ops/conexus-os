# 4F — BLD-10 Preview final independent review brief

> **Status:** REVIEW BRIEF / NO VERDICT
> **Review target:** current BLD-10 subject-projection candidate
> **Candidate base:** `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`

## Review question

Does the current BLD-10 implementation preserve the accepted Preview boundary
and provide an authenticated current/candidate subject projection without a
false-ready path, authority leak, duplicate owner, or proof gap that stops this
projection checkpoint?

## Independent bootstrap

Reconstruct authority from these files only, in this order:

```text
AGENTS.md
docs/roadmap.md
docs/index.md
docs/development/engineering-method.md
docs/development/repository-method.md
docs/product/contract.md (Preview contract 23.3)
docs/product/operation-ledger.md (BLD-10 / 4C-F15 owner)
contracts/api/product/openapi.yaml
scripts/check-wire-builder.mjs
docs/phases/realization-planning.md (R3–R6 owner rows)
```

Inspect these implementation and proof paths:

```text
apps/hub/migrations/023_rb_builder_preview_subject.sql
apps/hub/src/builder/{preview.ts,routes.ts,store.ts}
apps/web/src/features/builder/{api.ts,components/project-build.tsx}
tests/implementation/{bld-10-preview.test.mjs,rb-builder-first-vertical.test.mjs,rb-builder-browser.test.mjs}
tests/repository/conexus-verify.test.mjs
scripts/conexus-verify.mjs
scripts/run-hub-migrations.mjs
```

Do not read any prior review output, review-history packet, candidate result
adjudication, or another reviewer's report. In particular, do not read
`docs/evidence/4f/4f-bld-10-preview-stage-code-packet.md` or
`docs/evidence/4f/4f-bld-10-preview-independent-review-brief.md`; they contain
historical review conclusions and are intentionally outside this independent
bootstrap. Do not use prior verdicts as evidence.

Do not edit files, install dependencies, call Product providers, execute live
model/E2B/Sankhya paths, deploy, publish, push, create a PR, merge, or run
production effects. Use read-only inspection and keep unexecuted claims as
unknowns.

## Protected claims and falsifiers

Attack these claims independently:

1. Every request rechecks the current session and `project.build` authority.
2. The server resolves the current Project subject or an exact contained Change
   candidate; caller identifiers cannot select source, revision, Release,
   artifact or runtime.
3. A foreign/unknown Project or Change cannot disclose a subject or bytes.
4. `ready`, `verified` and `live` are independent; this slice returns honest
   `ready=false` and `live=false` without an admitted immutable application
   artifact.
5. The Web projection never treats source/Git output or synthetic HTML as a
   ready application and does not create a byte-serving/browser route.
6. The migration and route preserve owner isolation, missing-subject behavior
   and the existing operation/wire boundary.

Classify every concrete finding as exactly `METHOD FINDING`, `PRODUCT / PLAN
GAP`, `LOCAL EXECUTION GAP` or `NO FINDING`. Include evidence, failure mode,
materiality, smallest owner, protected claim, stop condition and required
re-evaluation. Do not claim closure or convergence; reviewer output is Evidence
only. If a conclusion is included, emit only your own line as `VERDICT = ...`.
