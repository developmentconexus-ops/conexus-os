# 4F — BLD-10 Preview projection independent review brief

> **Status:** REVIEW BRIEF / NO VERDICT
> **Review target:** current BLD-10 subject-projection implementation
> **Candidate:** local dirty worktree over `HEAD e9ff12e4394c855e5a15656b0d74e26bc5f46a02`
> **Implementation authority:** bounded BLD-10 grant recorded in `docs/roadmap.md`

## 1. Review question

Does the current BLD-10 projection preserve the accepted Preview boundary while
providing a real authenticated current/candidate subject projection, or does it
contain a false-ready path, authority leak, duplicate owner, or proof gap that
must stop the checkpoint?

## 2. Bootstrap and subject

Start independently from:

```text
AGENTS.md
→ docs/roadmap.md
→ docs/index.md
→ docs/development/engineering-method.md
→ docs/development/repository-method.md
→ docs/evidence/4f/4f-bld-10-preview-stage-code-packet.md
→ docs/evidence/4f/4f-preview-resumption-preparation.md
```

Inspect the changed BLD-10 files and their direct owner contracts only:

```text
apps/hub/migrations/023_rb_builder_preview_subject.sql
apps/hub/src/builder/{preview.ts,routes.ts,store.ts}
apps/web/src/features/builder/{api.ts,components/project-build.tsx}
tests/implementation/{bld-10-preview.test.mjs,rb-builder-first-vertical.test.mjs}
scripts/run-hub-migrations.mjs
```

Do not edit files, install dependencies, call Product providers, execute live
model/E2B/Sankhya paths, deploy, publish or merge. The review is read-only.

## 3. Protected claims and falsifiers

The reviewers must attack these claims independently:

1. Every request rechecks the current session and `project.build` authority.
2. The server resolves the current Project subject or an exact contained Change
   candidate; caller identifiers cannot select source, revision, Release,
   artifact or runtime.
3. A foreign/unknown Project or Change cannot disclose a subject or bytes.
4. `ready`, `verified` and `live` are independent; this slice always returns
   honest `ready=false` and `live=false` without an admitted immutable app
   artifact.
5. The Web projection never treats source/Git output or synthetic HTML as a
   ready application and does not create a byte-serving/browser route.
6. The migration and route preserve owner isolation, stale/missing-candidate
   behavior and the existing operation/wire boundary.

Report every concrete finding as `METHOD FINDING`, `PRODUCT / PLAN GAP`,
`LOCAL EXECUTION GAP` or `NO FINDING`, with evidence, failure mode, materiality,
smallest owner, protected claim, stop condition and required re-evaluation.
Do not claim stage closure or convergence; reviewer output is Evidence only.
