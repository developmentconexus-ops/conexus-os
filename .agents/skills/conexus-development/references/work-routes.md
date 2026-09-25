# Work routes

Each route walks one lane from [the delivery rules](../../../../docs/development/delivery.md#pick-the-lane-by-risk). That file owns the entry conditions and the gates. This file says how to walk them and repeats neither.

## Fast lane

1. Start from the issue. It carries `lane:fast` and the template fields: Objective, Context, Constraints, Done when.
2. The dev Factory triages the issue and writes a plan. A plan routed to "Await approval" waits for the operator.
3. Build on a branch from `origin/main` in one WSL worktree. The change fits one pull request and appetite P.
4. Open the pull request against `main`. Put "Closes #n" in the body and the lane label on it.
5. Meet the fast-lane gates in the delivery rules. [Review by lane](review-and-delegation.md#review-by-lane) says how to triage Codex comments.

## Shaped lane

1. The bet lives in the private `conexus-hq` repository. It names the appetite, "done when" and the sub-issues. The public repository never names a bet.
2. Each sub-issue here carries `lane:shaped` and walks the fast route.
3. Before the last sub-issue closes, check the bet's "done when" on the real artifact: the running Hub, a Preview, or the pilot. A mock does not count.
4. When the bet passes its appetite, stop and say so on the issue. The manager records what was learned and reshapes the bet.

## Qualification lane

Work enters this lane through any Q trigger in the delivery rules. A program gate (Q-a) is the one the roadmap names under "Exact next action". Do not write a task for a later gate before the earlier verdict. A bet that trips Q-b, Q-c or Q-d gets its own task once the operator takes the bet.

The task in `docs/tasks` is the execution and review contract. It is not product or architecture authority. Before the first product edit, the task holds these fields where they apply:

1. **Authority route.** The semantic and technical owners, and the predecessor gate.
2. **Protected result.** The observable or structural result that must become true.
3. **Why.** Evidence and root cause, only where they change the implementation.
4. **Preserve.** Decisions and invariants that must not regress.
5. **Code census.** KEEP, CHANGE, DELETE, and MEASURE where relevant, plus the native census from [Mastra native](../../../../docs/development/review/mastra-native.md#proof-required).
6. **Target shape.** Data and control flow and the owner boundary, not speculative detail.
7. **Implementation checklist.** Ordered work an implementer can do without inventing architecture.
8. **Non-goals.** Adjacent work that stays out.
9. **Falsifiers.** Observations that would prove the target wrong or incomplete.
10. **Proof.** The targeted and broader checks, and the deciding proof route.
11. **Owner reconciliation.** Documents, contracts and decisions that change if the result is accepted.
12. **Stop law.** Material conditions that return control to planning.

Add no field for ceremony.

### Roles

When the operator assigns separate roles, keep them separate:

- The **planner** investigates, closes decisions, and writes the task.
- The **implementer** builds only the task, verifies, commits, pushes, and stops. A local choice that changes no protected result, owner, data model, trust boundary or non-goal is the implementer's. A material ambiguity is not: stop with evidence.
- The **reviewer** reads the task and the owners first, then the pushed diff and the proof. The reviewer answers four questions: did the candidate produce the protected result, did it keep every invariant and non-goal, did it add complexity or authority the task did not justify, and does the repository now tell one story from roadmap to task to owners.

Independent review and the operator verdict follow [the delivery rules](../../../../docs/development/delivery.md#proof-and-verification). A corrected finding stays inside the same task until the gate closes.

### After the verdict

Move each surviving durable meaning into its smallest owner: a decision, the product contract, or a technical reference. Do not leave it only in the task or the roadmap. Update the gate row in the roadmap.

## Frontend work

Before changing a web, Builder or Preview surface:

1. Load [`conexus-frontend`](../../conexus-frontend/SKILL.md).
2. Read [`frontend-and-product-surfaces.md`](../../../../docs/reference/frontend-and-product-surfaces.md). Its section 33.6 owns the Build surface's functional contract.
3. Keep the app-first composition, the contextual Conexus interaction, and the read-only Code and Diff lenses, unless current product authority changes them.

That contract governs interaction, not styling. If product authority conflicts with a request, stop at the smallest owner. Do not invent a replacement UI in code.
