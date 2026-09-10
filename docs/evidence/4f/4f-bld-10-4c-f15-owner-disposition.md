# 4C-F15 BLD-10 owner disposition

> **Status:** ACCEPTED / OPERATOR RATIFIED 2026-09-09 / R1 CUSTODY PRESERVED
> **Scope:** BLD-10 Preview projection; no wire-byte edit, serving or R3+

This disposition closes the owner ambiguity identified by the independent
review. It is the current semantic route for the frozen 4C-F15 Product owner;
it does not rewrite the historical R1 source or generated receipts.

## Accepted omitted-`changeId` meaning

For `BLD-10 GetBuildPreview`, omitted `changeId` means:

```text
server resolves the exact approved Project Baseline
→ returns CURRENT_PROJECT Preview
→ subjectDigest binds the approved Baseline digest/source revision
```

The frozen Product phrase “current canonical Project source” is interpreted
with that meaning. A divergent `project.source_revision` is unapproved
authoring/candidate state and cannot change the omitted-`changeId` subject.
The exact Change branch remains `CHANGE_CANDIDATE` and is revalidated inside
the current Project.

## R1 custody disposition

The current `docs/product/operation-ledger.md` bytes remain preserved at
SHA-256 `92faa951f7bc01bd9baf364094e4d17b59eb3f42946fa8f994b8022c5231eb2c`.
The R1 input-set, generated operation projection and historical receipts remain
bound to that digest. No generated receipt is hand-edited and no historical
Evidence is rewritten.

Explicit Baseline wording in the canonical Product wire or operation ledger is
deferred to a future, separately admitted R1/Builder contract requalification.
That future route must update source custody, aggregate wire digest, generated
projections, manifests and receipts together before any new wire claim is
accepted.

## Proof and boundaries

The current BLD-10 resolver and PostgreSQL negative control already implement
this disposition. Closure may proceed only after a fresh candidate review reads
this disposition, the verification receipt and the exact current manifest.
`ready`, `verified` and `live` remain independent; `ready=false` and `live=false`
remain artifact-gated. No artifact producer, serving route, R3 mechanism, live
provider/model/E2B/Sankhya execution, deployment or Git publication is admitted.

Reopen this disposition only if the approved Baseline/head meaning changes,
the 4C-F15 owner rejects the interpretation, or a separately admitted R1/Wire
requalification changes the frozen wording and digest custody.
