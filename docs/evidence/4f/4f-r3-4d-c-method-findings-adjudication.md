# R3 / 4D-C — review findings adjudication

> **Class:** Lead adjudication / post-review Evidence
> **Date:** 2026-09-09
> **Consumer:** Lead preparing the next 4D-C selection/review checkpoint

This bounded record adjudicates the Opus findings and records the smallest
corrections. It is outside the reviewed candidate, does not retroactively alter
the review, grant execution, or declare R3 admitted. Current status, allowed work
and next action remain solely in [the roadmap](../../roadmap.md).

## Source and authority

The source is the Opus report at
`/tmp/conexus-r3-4d-c-review-opus/conexus-review-result.json`, SHA-256
`12fc086c71e83d11a7822ddfe094e026f38d21dba367d6d56176eaa7f4ffdb02`, session
`4fec686d-9b9a-4e2a-90c5-e4b1ccfeefbd`. It names the
[selection manifest](4f-r3-4d-c-selection-candidate-result.md), reviewed SHA-256
`52a359cf41b4edccd8d640230f08857126459ee927167f2d75b95a07deb2980b`, and
[brief](4f-r3-4d-c-selection-review-brief.md), reviewed SHA-256
`0523f1aafbf2cf6c3e16d82cc764379f74d521dd9706514037a88d4c496b3059`.
These identify the historical review, not a new freeze of the current tree.

The applicable owners are [Blueprint Harness sections 10.1–10.4](../../development/blueprint-harness-design.md),
[Repository Method sections 4–7](../../development/repository-method.md), and
the [Engineering Method's delivery, convergence and assurance laws](../../development/engineering-method.md).
The Lead inspected the Opus report and the changed surfaces below. No new
independent review was started; the current direction is to resolve the findings
with bounded implementation and targeted proof, then keep R3 unadmitted until a
future exact-candidate closure checkpoint.

## F1/F2/F3/F8 — repository-proof corrections accepted

These are **LOCAL EXECUTION GAP** findings owned by the repository proof lane.
They are corrected without reopening Product or architecture meaning:

- `scripts/check-doc-index.mjs` and `scripts/check-repository-hygiene.mjs`
  accept an explicit candidate root and use `fileURLToPath` safely;
- the two census negative controls create a minimal temporary Git repository,
  so `git ls-files --others --exclude-standard` observes the fixture without
  mutating the real Evidence tree;
- the hygiene assertion binds to the exact transient fixture path; and
- `repository:candidate-census` runs those two controls as an explicit
  candidate-graph leaf, with its manifest test updated accordingly.

The targeted census suite passed both controls, including through the
verification router with `npm run conexus:verify -- --scope
repository:candidate-census`; documentation, hygiene and diff checks also
passed. The full candidate graph and a publication/CI run remain unclaimed.

F8's unsafe percent-encoded-root path was corrected by the `fileURLToPath`
change. The remaining dependence on Git's configured `--exclude-standard`
policy is retained as a low environmental assumption and must be made explicit
or re-evaluated at the next closure checkpoint; it is not a current false-pass
observation.

## F4/F5 — planning corrections accepted

These are **PRODUCT / PLAN GAP** findings owned by the roadmap and R3 packet.
The roadmap and [R3 preparation packet](4f-r3-admission-preparation.md) now:

- stop any slice that consumes, compares, derives or validates `subjectDigest`
  until the separately admitted R1/Builder source-custody requalification is
  complete, while allowing an explicit proof of non-consumption;
- retain the accepted Baseline and 4C-F15 disposition without reopening either;
- assign controlled quiescence, missing-observation honesty, coverage/drift,
  `3N-V18` and `3N-V19` contract proofs to R3; and
- reserve the real JobRun, served Release, live Sankhya coordinate and
  independent `3O-P1..P7` reconciliation for R7.

R3 remains `PREPARATION ONLY / NOT ADMITTED` and the Goal remains paused.

## F6 — preserve the limitation; correct the next review setup

The report identifies a shared dirty worktree, a peer output present in the
Evidence directory, no candidate commit distinct from the integrated base,
and executable untracked paths omitted from the manifest. The reviewer states
that it did not read the peer output. Availability alone does not establish
actual contamination; complete custody and structural isolation were not
demonstrated by this setup.

**Adjudicated disposition:** retain this as a historical method limitation. It
cannot be corrected retroactively by editing the manifest, deleting peer
output, or claiming that later checks prove earlier lane independence.

**Owner and trigger:** Lead/integrator, before the next independent closure
review. Use an exact candidate HEAD and fresh isolated lanes under section
10.1. Bind all executable files and proof inputs used by the reviewed guards,
including any generated/untracked inputs; distinguish unrelated preserved
state from execution inputs. Route the deciding command/environment/results
receipt and complete the section 10.4 handoff. Keep each lane's outputs outside
the other lane's readable review workspace; neither lane reads peer results
before both finish. Validate candidate identity and isolation before launch.
Creating the candidate commit remains subject to the separate Git grant.

Planning may continue. Do not represent this record as restoring exact-HEAD
custody or independence for the completed round. A new review requires its
own admitted checkpoint and material justification; F6 does not reopen BLD-10
closure or accepted Product decisions.

## F7 — reduce the next packet and remove duplicate mutable projections

**Adjudicated disposition:** perform the proportionality reset while preparing
the next meaningful packet. The Lead should retain one current selection
packet containing the protected claims, unresolved decisions/dependencies,
proof route and blocker census; route accepted owners and durable Evidence
instead of copying review chronology or status into it. One brief and one
candidate binding should serve that review checkpoint.

**Owners and trigger:** Lead for packet scope; roadmap owner for the next
authorized roadmap update. State the current execution status and exact next
action once in the roadmap and route other surfaces there. Keep historical
phase results separate from current execution instructions; a reopen-trigger
cell should name a falsifier, not repeat a competing next action. Do not add
generic status machinery merely to enforce a preferred prose format.

The current roadmap now has one concise status for 4D, 4F and Product
implementation, and its `## Exact next action` is the sole current next-action
surface. Preserve current Evidence and its proof/provenance consumers. Reduce
required reading and duplicate mutable prose; do not delete retained Evidence
to meet a file-count target. Validate that the next packet routes every
surviving blocker and has one unambiguous status/next-action owner. F7 permits
planning to continue and supplies no new Product requirement or execution
authority.
