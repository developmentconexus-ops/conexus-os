# 7R-2 runtime waterfall evidence

This task is superseded as an execution and acceptance gate.
[The roadmap](../roadmap.md) owns its current REPLAN disposition.
[The operational delivery program](builder-first-app.md) owns the successor sequence.
The original measurement contract is retained at commit
`ed658c65152db27390dc1c5c88ff6d1b5cfa406e` and its parent history.

## Retained subject

The delivered package is
`qualification/7r2/builder-runtime-waterfall/` at
`ed658c65152db27390dc1c5c88ff6d1b5cfa406e`.
Its artifact identifies the measured base HEAD and working-tree fingerprint.
Do not rewrite those identities to the current HEAD.

P1, corrected P2, and Product-composed P3 have retained passing observations.
The corrected P2 provides storage-backed native Thread mechanics.
The earlier no-storage Thread error did not falsify C-020.
These controls are not full end-to-end acceptance of the Product.

## Review disposition

The complete baseline was not accepted. The operator approved changing the
program priority, not converting incomplete proof into PASS.

Retain these limitations:

- the reproduction command and retained gate HEAD need reconciliation before reuse;
- dominant BUILD time is not sufficiently separated to attribute cost to its owners;
- Code timing ends at a list/partial-read condition, not a proven complete file view;
- the PLAN compiler-not-invoked field is inferred from result state, not a call count;
- Diff is inconclusive, and Preview launch/application readiness is not composed in that harness.

Compiler calibration is a separate experiment. Do not subtract its durations
from unrelated BUILD samples. Do not infer invocation counts from source alone.

## Use of the package

Preserve `baseline.json` and `pre-baseline-probe.json` unchanged.
The existing README owns the recorded reproduction procedure and its limitations.
A caller that needs a new benchmark must identify the deciding question and
repair only the required measurement path before collecting fresh evidence.

Use the real Mastra runtime's native tracing for model and tool diagnosis.
Use browser/network observations or existing Product boundaries for work outside
Mastra. Do not create a PerformanceService, replay store, or second coding composition.

## Work no longer granted by this task

Do not rerun S1-S6 as a universal delivery gate, enlarge `measure.mjs`, optimize
Git/source, rebase Preview, or start former 7R-3 merely from this historical task.
The current actionable task is named only by the roadmap.
