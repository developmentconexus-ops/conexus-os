# Conexus slice lifecycle

Use this reference when planning, executing, reviewing, or correcting a Conexus implementation slice.

## Core rule

One actionable slice has one current task owner.

```text
program direction
→ slice task
→ explicit roadmap grant
→ execution
→ verification
→ commit + push + STOP
→ independent review
→ accept or correct
→ next slice planning
```

The task is the execution/review contract. It is not a Product or architecture authority.

## Criticality law

Protect the Product objective and accepted semantic authority, not the current implementation shape.

- Existing code, tests, docs, prior plans, and green runs are Evidence. They are not correct merely because they exist or were previously accepted.
- Before adding a custom mechanism around an adopted framework, inspect the exact installed primitives/source and relevant first-party examples or surfaces. For Mastra-sensitive work, this includes the exact adopted package first and representative Mastra Code/Studio patterns when they answer the current question.
- Prefer the framework or platform primitive when it satisfies the invariant. A custom layer must name the real missing primitive, current consumer, and boundary it owns.
- If several patches preserve the same awkward premise, attack the premise before adding another patch.
- If new Evidence falsifies the task or an accepted owner, stop and reopen the smallest owning authority. Do not patch around the contradiction.
- Delete compatibility or abstraction that has no current consumer or invariant.

The objective is the smallest correct and maintainable Product, not fidelity to yesterday's realization.

## Roles

### Planner / verifier

Owns investigation, design closure, task preparation, and independent review when assigned.

May update repository documentation and current owners when that work is the authorized objective. Does not implement Product code when the operator has assigned a separate executor.

Before execution, make the task precise enough that the executor does not need to choose architecture.

### Executor

Implements only the current authorized task.

May make local mechanical choices that do not change the task's protected result, owner boundary, data model, trust boundary, or non-goals. If a material ambiguity appears, stop with evidence instead of inventing a new architecture.

After verification, commit and push when authorized, then stop. Do not start the next slice.

### Reviewer

Reads the task and current owners first, then reviews the actual remote diff and proof.

Does not edit Product implementation during review unless the operator explicitly authorizes a correction. If the candidate fails, identify the smallest violated invariant and route the finding back into the same slice task.

## Task contract

Before the first Product implementation edit, the current task should contain the fields below when they apply.

1. **Status and authority route.** Current grant owner, semantic/technical owners, predecessor gate.
2. **Protected result.** The observable or structural result that must become true.
3. **Why this slice exists.** Evidence and root cause only when they affect implementation.
4. **Preserve.** Decisions and invariants that must not regress.
5. **Code census.** KEEP, CHANGE, DELETE, and MEASURE where relevant.
6. **Target shape.** Data/control flow and ownership boundary, not speculative implementation detail.
7. **Implementation checklist.** Ordered work that the executor can perform without architectural invention.
8. **Non-goals.** Adjacent work that must not enter the slice.
9. **Falsifiers.** Concrete observations that would prove the target wrong or incomplete.
10. **Proof.** Targeted and broader checks required before completion.
11. **Owner reconciliation.** Current docs/contracts/decisions that must change if the result is accepted.
12. **STOP law.** Material conditions that return control to planning/review.

Do not add fields merely for ceremony.

## Authority placement

Use one owner per meaning.

| Surface | Owns |
| --- | --- |
| `docs/roadmap.md` | mutable status, grant, exact next action |
| current `docs/tasks/*.md` | bounded slice execution and review contract |
| `docs/decisions/index.md` | accepted decision disposition and reopen route |
| Product/architecture/contracts/references | durable current meaning |
| Evidence/qualification/tests/Git | proof and provenance |
| handoff/chat | orientation only |

After a slice passes, move surviving durable meaning into the smallest semantic or technical owner. Do not keep architecture only in the roadmap or task.

## Handoff shape

If the repository contains the complete task, the executor handoff is deliberately short:

```text
Repository: <owner/repo>
Branch: <branch>
Expected HEAD: <sha>

Authority:
repository current authority > roadmap > current task > handoff/chat

Cold start:
AGENTS.md
→ roadmap
→ current task
→ owners named by the task

Execute only the current task.
Preserve unowned state.
STOP on the task's material stop conditions.
Verify → commit → push → STOP.
```

Do not paste the task into the handoff.

## Review shape

A review answers four questions.

1. Did the candidate produce the protected result?
2. Did it preserve every named invariant and non-goal?
3. Did it add complexity or authority that the task did not justify?
4. Does the repository now tell one coherent story from roadmap to task to durable owners?

Possible dispositions are `PASS`, `CORRECTION REQUIRED`, or `REPLAN`. A command being green is never enough by itself.

## Common mistakes

| Mistake | Correction |
| --- | --- |
| Long handoff repeats the plan | Put the plan in the task and hand off the path |
| Roadmap contains architecture | Move durable meaning to its semantic/technical owner |
| Macro plan contains every implementation detail | Keep program sequencing there; move current execution detail to the slice task |
| Executor chooses a material design fork | Stop and return the fork to planning |
| Reviewer fixes code while reviewing | Report the failed invariant first; correction needs its own authorization |
| New task created for every small correction | Keep corrections inside the same slice task until the slice is accepted |
| Placeholder tasks created far ahead | Create a task only when predecessor evidence is sufficient to plan it |

## PSTACK / Poteto use

When PSTACK/Poteto is available, use it for nontrivial planning and review. Let the selected playbook and leaf principles shape the task and verdict. Do not copy principle names into a task as ceremony. The repository contract above remains the authority boundary even when a different reasoning toolkit is used.
