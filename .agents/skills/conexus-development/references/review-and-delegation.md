# Delegation and independent review

## Delegation

Use only Luna subagents, with high or xhigh reasoning, per the operator's
2026-09-12 instruction. Use high for bounded inspection and xhigh for difficult
implementation or critical review. The root session remains the integrator.

Delegate only an independently executable task with known scope, inputs,
expected result and forbidden effects. Give writers isolated workspaces or
output directories and disjoint files. The integrator inspects and applies
their changes, resolves overlap and runs whole-change verification.
Delegates do not commit, publish or expand the task.

## Risk-triggered review

Follow the local amendment in
[Engineering Method](../../../../docs/development/engineering-method.md).
A named stage ending does not trigger review. Ordinary code, naming and
mechanical changes use targeted checks and integrator review.

Independent review is warranted by an authority/trust change, a structural
runtime/database/service change, an external or hard-to-reverse effect, or a
material contradiction that local proof cannot settle. For a triggered
checkpoint, use two fresh isolated Luna reviewers over the same candidate
and protected claims. Reduced model diversity must be stated, not disguised
by calling Luna under different role names.

Collaborative writers and design challengers are not independent closure
reviewers. Do not send one reviewer's findings to the other before both finish.
The integrator adjudicates findings against the current task and its real proof.
Reviewer output does not create Product requirements or execution authority.

Rerun review only when a correction materially changes the reviewed property
or the reliability of its proof. Otherwise apply the valid correction, verify
it and continue. A timeout or missing report is incomplete review, not a pass.

The existing `conexus:review` wrapper retains historical Fable/Gemini
reproduction support. It is not the default delegation route and must not be
executed under the current Luna-only instruction. No review call grants live
Product-model, E2B, Sankhya, production, publication or merge effects.
