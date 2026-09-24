# Delegation and review

The model policy is in the skill's "Delegate" section. When `~/.claude/pstack-models.md` exists, read it: its role lines win. Spawn a subagent only when the work is independent and its output would crowd the root context.

## Delegate

Delegate only a task with known scope, inputs, expected result and forbidden effects. The root session stays the integrator: it reads each delegate's diff, resolves overlap, and runs the checks for the whole change. Its summary comes from that diff, not from the delegate's report.

Every delegate prompt:

- loads Poteto Mode and [`.agents/skills/mastra/SKILL.md`](../../mastra/SKILL.md);
- points at files instead of pasting their content;
- names a separate worktree or output directory, and a file set disjoint from every other writer;
- says whether the delegate commits and pushes, and forbids merge, reset, clean, stash, force-push and `git worktree prune`;
- repeats the WSL rule from [`wsl-environment.md`](wsl-environment.md#call-wsl-from-windows): run only `.sh` files.

A delegate does not widen its task. If it finds a material fork, it stops and reports.

## Review by lane

The [review checklist](../../../../docs/development/review-checklist.md) applies to every pull request.

**Fast and shaped lanes.** No independent review. The gates are the fast-lane gates in [the delivery rules](../../../../docs/development/delivery.md#pick-the-lane-by-risk). Codex comments on the pull request. Triage each comment on its merits: fix it, dismiss it with a concrete reason, or ask on the thread.

**Qualification lane.** Independent review follows [Proof and verification](../../../../docs/development/delivery.md#proof-and-verification), which holds the reviewer count, the model rule and the Codex command. Codex is the challenger on another model. The other challenger is a fresh subagent that has seen no draft of the work. Also:

- A collaborative writer or design challenger is not an independent reviewer.
- A reviewer finding is evidence, not a product requirement and not execution authority. The lead classifies it against current owners.
- A timeout or a missing report is an incomplete review, not a pass.
