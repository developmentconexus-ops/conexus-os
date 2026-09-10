# 4F — BLD-10 approved-Baseline closure review brief

> **Status:** REVIEW BRIEF / NO VERDICT
> **Review target:** current BLD-10 candidate after the accepted `CURRENT_PROJECT` decision
> **Candidate base:** `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`

## Review question

Does the current BLD-10 implementation and its aligned contract/UI preserve the
accepted Preview boundary, resolve omitted `changeId` to the approved Project
Baseline, contain exact Change candidates, and provide an honest non-ready
projection without an authority leak, duplicate owner, false-ready path or
proof gap that stops BLD-10 closure?

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
docs/decisions/index.md (4F-BLD-10 current disposition)
docs/evidence/4f/4f-bld-10-4c-f15-owner-disposition.md
docs/evidence/4f/4f-bld-10-4c-f15-owner-requalification-preparation.md
docs/evidence/4f/4f-bld-10-preview-verification-receipt.md
contracts/api/product/openapi.yaml
contracts/api/product/builder-paths.yaml
scripts/check-wire-builder.mjs
docs/phases/realization-planning.md (R3–R6 owner rows)
```

Inspect the current implementation and proof paths:

```text
apps/hub/migrations/023_rb_builder_preview_subject.sql
apps/hub/src/builder/{preview.ts,routes.ts,store.ts}
apps/web/src/features/builder/{api.ts,components/project-build.tsx}
tests/implementation/{bld-10-preview.test.mjs,rb-builder-first-vertical.test.mjs,rb-builder-browser.test.mjs}
tests/repository/{4c-p01-f15-build-preview-subject.test.mjs,4c-p01-locked-screen-contract.test.mjs,conexus-verify.test.mjs}
scripts/conexus-verify.mjs
scripts/run-hub-migrations.mjs
```

The exact dirty-worktree candidate is frozen by
`docs/evidence/4f/4f-bld-10-preview-owner-decision-candidate-result.md`.
Read that current manifest and verify its tracked-diff and untracked-byte
digests before assessing the protected claims. Read the routed verification
receipt as execution Evidence, while independently checking that its commands
and scope match the candidate. Do not read another reviewer's
report, the prior review briefs, their candidate manifests, or the historical
owner-decision/stage packets that contain prior lane output. Do not use a
prior verdict as evidence. The current semantic disposition is the registered
`4F-BLD-10` row in `docs/decisions/index.md`; independently verify that code,
contract, UI and proof actually implement it.

Do not edit files, install dependencies, call Product providers, execute live
model/E2B/Sankhya paths, deploy, publish, push, create a PR, merge, or run
production effects. Read-only inspection and local bounded proof are allowed;
keep unexecuted claims as unknowns.

## Protected claims and falsifiers

Attack these claims independently:

1. Every request rechecks the current session and `project.build` authority.
2. Omitted `changeId` resolves `CURRENT_PROJECT` to the exact approved
   Project Baseline digest/source revision; a divergent Project Git head stays
   unapproved candidate state.
3. A supplied Change is revalidated inside the exact Project; foreign/unknown
   Project or Change references cannot disclose a subject or bytes.
4. Caller identifiers cannot select source, revision, Release, artifact or
   runtime, and no second Preview owner is introduced.
5. `ready`, `verified` and `live` remain independent; this slice returns
   honest `ready=false` and `live=false` without an admitted immutable
   application artifact.
6. The accepted owner decision is reflected in the frozen wire semantics and
   the explicit Web “Baseline aprovado” label; neither treats source/Git output
   or synthetic HTML as a ready application or creates a byte-serving/browser
   route. A wire-byte requalification is outside this BLD-10 grant.
7. The Web does not poll a static current-Baseline Preview indefinitely when
   the subject is absent or unavailable; its safe error state remains bounded
   and does not disclose whether absence reflects authority or custody state.

Classify every concrete finding as exactly `METHOD FINDING`, `PRODUCT / PLAN
GAP`, `LOCAL EXECUTION GAP` or `NO FINDING`. Include evidence, failure mode,
materiality, smallest owner, protected claim, stop condition and required
re-evaluation. Do not claim closure or convergence; reviewer output is
Evidence only. If a conclusion is included, emit only your own line as
`VERDICT = ...`.

## Explicit non-goals

This review does not admit or assess implementation of R3, an artifact
compiler, immutable application serving, a browser byte route, live provider /
model / E2B / Sankhya execution, deployment, Git publication or readiness
promotion. A missing artifact producer remains a separate R5/R6 owner item.
