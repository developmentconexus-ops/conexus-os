# BLD-10 / 4C-F15 GPT-6 Astra advisor receipt

> **Status:** ADVISORY EVIDENCE / NOT AUTHORITY
> **Date:** 2026-09-09
> **Model:** GPT-6 Astra
> **Mode:** read-only repository advisory; no file edits, live providers or
> qualification mutations

The operator requested an Astra advisory check of the pending BLD-10 / 4C-F15
owner and R1 custody question. The advisor inspected the current decision
packet, roadmap, owner requalification preparation, Product operation ledger,
R1 input-set and generated custody references.

## Recommendation

1. Preserve the accepted Baseline implementation and the pinned Product ledger.
   The approved Baseline meaning is already an operator decision; changing the
   canonical ledger is a separate custody action.
2. Obtain the bounded 4C-F15 owner disposition identifying the exact ledger
   revision, accepted omitted-`changeId` wording and custody disposition.
3. If the ledger bytes change, admit a bounded R1 source requalification that
   updates the ledger source hash, aggregate `wireProjection.digest`, generated
   R1 projections and affected manifests/receipts. Do not hand-edit generated
   receipts or rewrite historical Evidence.
4. Continue current BLD-10 implementation and mechanical proof without changing
   the ledger, but do not claim closure while the owner contradiction remains.
5. After disposition, rerun affected F15/BLD-10 checks, the divergent-head
   PostgreSQL falsifier, the candidate graph and the applicable Linux floor,
   then freeze a new candidate and obtain a fresh isolated dual-lane review.

## Evidence checked

- `docs/product/operation-ledger.md` currently matches the pinned digest
  `92faa951f7bc01bd9baf364094e4d17b59eb3f42946fa8f994b8022c5231eb2c`;
- a read-only hypothetical one-phrase wording replacement would produce
  digest `3ad74e740fc3d5ccac6be43023ec211ced696758096600f1d54f25b6895a8950`,
  proving that the current pin would be invalidated;
- the current F15 repository test checks operation vocabulary and route shape,
  while the BLD-10 implementation and PostgreSQL falsifier establish the
  approved-Baseline behavior.

This advisory does not accept the Product owner wording, requalify R1, close
BLD-10, admit R3+, authorize serving/artifact production, or authorize Git
publication.

The operator approved this advisory route on 2026-09-09. That approval covers
the validation and preparation recorded here; it does not silently substitute
for the named 4C-F15 owner disposition or the separate R1 source-custody gate.
