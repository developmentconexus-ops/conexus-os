# R3 third-review stop and root-cause adjudication

> **Status:** HOLD / REPLAN REQUIRED
> **Decision date:** 2026-09-10
> **Scope:** R3 implementation, review, qualification and readiness routing
> **Authority:** Operator-directed stop, Lead adjudication; GPT-6 Astra is advisory only

## Decision

R3 remains paused. Do not resume implementation, run another material review,
or run another qualification until the R3-IMP-P1 owner, dependency and proof
envelope is reconciled and a new bounded increment is explicitly admitted.

The operator-reported seven review cycles are treated as a process warning.
They are not seven complete independent closure reviews: some were correction
rounds, some lanes were incomplete, and v7 was interrupted before a verdict.
That distinction changes the count, not the decision. Repeated discovery of
material isolation, state, semantic and proof-provenance gaps on the same
subject demonstrates that the current planning/review loop did not converge.

The implementation batch is preserved as an unaccepted candidate. It is not
discarded, promoted to current proof, or accepted in full. No Product or
architecture decision is silently changed by this record.

## Evidence consulted

- [`docs/roadmap.md`](../../roadmap.md), including the prior next action;
- [`docs/tasks/r3.md`](../../tasks/r3.md), including the P1 envelope and package graph;
- [`docs/development/engineering-method.md`](../../development/engineering-method.md);
- [review and delegation routing](../../../.agents/skills/conexus-development/references/review-and-delegation.md);
- [`4f-r3-p4-a-implementation-review-adjudication.md`](4f-r3-p4-a-implementation-review-adjudication.md);
- GPT-6 Astra advisory session `01a08bad-f73e-7953-a2c6-6f4521ca1a01`, requested with `max` effort for this already-started consultation. No subsequent Astra call is authorized by this record; future advisor calls use `medium` effort.

The v7 review process was interrupted and produces no review verdict or
closure Evidence.

## Systemic root cause

| Category | Finding | Consequence |
| --- | --- | --- |
| Planning | State transitions, completion conditions and the minimum deciding proof were not closed before implementation. | Each correction exposed another reachable variation of the same protected-property failure. |
| Ownership / contract | Runtime credential adoption, semantic acceptance, empty-source meaning and MAR settlement were routed as open dependencies after adjacent work had already consumed their boundary. | “Routed” was treated as progress where an accepted owner contract was required. |
| Proof architecture | Adapter, capability, fixture, runtime and aggregate receipt were not designed as one provenance graph from the beginning. | A passing local subject could not support the broader P2/P3 or Product-runtime claim; the aggregate receipt became historical projection. |
| Implementation | Early controls were placed on a wrapper or adapter instead of every path capable of reaching the protected state. | Public execution, cross-database role identity, stale degradation and timezone paths survived successive local fixes. |
| Review governance | The Lead continued the correction/review loop instead of applying the method’s proportionality reset when the same subject exceeded a convergent cycle. | Reviewer output became a serial discovery mechanism and planning substitute. |

The primary failure is therefore governance of the delivery/proof loop, with
planning and ownership/proof design as its upstream causes. It is not evidence
that the accepted Conexus architecture should be discarded wholesale.

## Batch and proof disposition

Keep the post-v6 correction batch in place as candidate work, but split its
meaning:

- SQL capability-level duplicate rejection, the date representation fix and
  the state/ACL corrections remain candidate implementation facts;
- transient adopter roles prove only the controlled qualification boundary,
  not Product runtime credential provisioning or production adoption;
- semantic-only drift rejection is a fail-closed falsifier, not acceptance of
  a new semantic meaning;
- rejection of an empty `COMPLETE` payload does not define the producer’s
  legitimate-empty contract;
- the historical P2/P3 aggregate receipt remains historical and cannot support
  current proof merely because freeze or manifest fields match;
- the interrupted v7 run contributes no verdict;
- the current controlled qualification is retained as scoped Evidence, not as
  P4-A acceptance or R3 closure.

No generic recovery record, workflow engine, cross-owner transaction, scheduler
or other speculative mechanism is justified by this analysis.

## Reconciled dependency order

The next plan must remove the current circularity before any new execution:

```text
P1 owner/dependency/proof reconciliation
  → P2/P3 contract and fundamental-proof reconciliation
  → P4-A Project facts
  + P4-B only after MAR owner contract
  → P5 composed fixtures
  → P6 one reproducible aggregate receipt
  → P7 closure or smallest-owner route
```

The proof owner must participate at P1/P2/P3, not only at P6. P6 may assemble
the candidate only after its inputs have reproducible producers and exact
subject bindings. Project + Identity & Access must own the Product runtime
credential-adoption contract before any Product-runtime claim consumes it.

## Minimum gate before `READY`

`READY` may be restored only for one named next increment, not for R3 as a
whole, after the replan records:

1. one protected claim and one bounded subject;
2. one semantic owner and one integrator, with disjoint write envelope;
3. accepted dependencies with no required contract merely “routed” to a later
   package;
4. a producer-bound receipt plan, including the command, subject bytes,
   coverage and falsifiers;
5. disposition of every existing finding as correction, owner reopening or
   safe deferral with revisit trigger;
6. explicit non-goals preserving the no-live/no-deployment boundary.

The minimum falsifiers remain unauthorized access, advancement from incomplete
truth, improper drift acceptance and incompatible proof provenance. A green
command or a new “no finding” alone cannot restore readiness.

## Third-review stop rule

For a single frozen subject, both independent lanes count as one review round.
An incomplete lane counts as operational cost and incomplete Evidence, not as a
successful review. After the third review/correction round, or earlier when a
material stop finding persists, the Lead must:

1. stop further review and implementation;
2. restate the protected claim and root cause;
3. compare whether the issue is planning, owner/contract, proof architecture,
   implementation or review governance;
4. reopen the smallest falsified owner or split the package;
5. define one bounded correction/replan and its falsifiers before resuming.

A fourth call is permitted only after that reset creates a materially new,
explicitly approved subject or completes a previously missing lane; it is not
an automatic rerun. This is an R3 operating guard applying the existing
Engineering Method proportionality-reset and no-recursive-review rules; it is
not a new Product semantic decision.

## Prohibited while this hold is active

Do not start v7/v8 or another serial correction review, expand the Project
slice, invent semantic or MAR meaning, promote historical receipts, treat the
qualification fixture as Product runtime proof, discard or reset dirty work,
run live JobRun/Sankhya/provider/model execution, deploy, publish, commit,
push, open a PR or merge.

## Reopen triggers

Resume planning only when the owner map and dependency graph are coherent, the
next subject has a reproducible deciding-proof route, and the operator admits
that bounded increment. Reopen this decision if accepted Product meaning,
ownership, topology, source/tuple/DDL assumptions or proof reliability changes.
