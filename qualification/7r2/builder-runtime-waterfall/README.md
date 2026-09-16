# Retained 7R-2 runtime waterfall package

This is partial measurement evidence, not a complete accepted baseline or the
current Builder delivery gate. The current disposition is owned by
`docs/roadmap.md`; interpretation limits are in
`docs/tasks/builder-7r-2-runtime-waterfall.md`.

## Recorded files and subject

`baseline.json` and `pre-baseline-probe.json` retain their original subjects.
The delivered package is commit `ed658c65152db27390dc1c5c88ff6d1b5cfa406e`.
The JSON also records the measured parent HEAD and working-tree fingerprint.
Do not edit those identities to make the gate pass on a later commit.

`measure.mjs` is the original measurement lever. It still has the known
reproduction/gate and partial-observation limitations described by the task.
Its retained numbers are not new measurements of the current implementation.

## Reproduction limitation

The old command is not a supported fresh-checkout reproduction procedure.
It requires a matching retained pre-baseline gate, and the gate predates the
publication commit. The parser recognizes `--output=path`, not `--output path`.
Existing output must not be overwritten merely to rerun the command.

A future measurement consumer must state its question, reconcile the exact
subject and gate, and repair only the needed measurement path before running it.
The complete original procedure remains in this README's publication history.
Do not rerun the whole benchmark as a prerequisite for the operational delivery.

## Interpretation

The corrected direct P2 and real Product P3 are distinct controls.
Compiler calibration is not the compiler time of an unrelated composed BUILD.
Code reads are partial, Diff is inconclusive, and this harness does not prove
real authorized Preview launch/application readiness. Counts inferred from result
state must not be reported as observed calls.

Use native Mastra traces for new agent diagnosis and claim-specific Product
measurements for external work. Never store credentials or raw provider/tool
payloads in committed evidence.
