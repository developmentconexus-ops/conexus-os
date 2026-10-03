---
name: conexus-development
description: This skill should be used for any development session in the Conexus OS repository, when resuming, investigating, fixing, building, redesigning, verifying, reviewing, delegating or handing off work. Triggers include "pick up issue #N", "build this", "fix this bug", "why is this slow", "review this PR", "open a PR", "hand this off", "spawn a subagent", and any work in a conexus-os worktree.
---

# Conexus development

This skill routes Conexus OS work to the right flow and says what good code looks like here. It owns
no delivery rule: [`delivery.md`](../../../docs/development/delivery.md) owns lanes, gates, labels,
proof and merge, and wins any disagreement. The roadmap and GitHub own status.

## Start from zero

1. Read the root `AGENTS.md`. Chat, handoffs and memory are orientation, never authority.
2. Work in a WSL worktree per [`references/wsl-environment.md`](references/wsl-environment.md), then
   run `npm run conexus:preflight`.
3. Read [`docs/roadmap.md`](../../../docs/roadmap.md) for the current work, and `delivery.md` to
   pick the lane ([`references/work-routes.md`](references/work-routes.md)).
4. Load Poteto Mode if the session has it, and the [`mastra`](../mastra/SKILL.md) skill before any
   claim about Mastra.

## Pick the flow

Open the flow's checklist in [`references/flows.md`](references/flows.md) and copy it into your
notes. Each step names what to do and the skill that does it when the session has one.

| The work | Flow |
| --- | --- |
| A question: how does X work, why is it built this way, where is the time going | Investigate |
| Wrong behavior someone saw | Fix |
| New behavior with a decided design | Build |
| A shape that keeps breaking, or a roadmap wave | Redesign |
| A pull request to judge | Review |
| Any web, Builder or Preview screen | Frontend, on top of the flow above |

A Fix becomes a Redesign when the premise under the bug already had two fixes. `check-patch-churn`
in CI flags a file with three or more fixes in 30 days.

## Before writing code

1. Name the data shape and the one place that owns it.
2. Read how Mastra's own products (Factory, Mastra Code) do the same thing, not only the API.
3. Read the whole lifecycle you touch, not the lines around the symptom.
4. Check the decided shapes in [`references/shapes.md`](references/shapes.md) and the
   [decision register](../../../docs/decisions/index.md).
5. Say what the change deletes. Code stays because it is needed, never because it exists.

Find the facts with [`references/evidence.md`](references/evidence.md): telemetry, Mastra's spans,
the logs, the verify harness and the reference code. Measure before you guess.

## Stop and report when

- You need new state to remember something Mastra, E2B or the database already holds.
- You cannot name the data shape or its owner.
- A fix adds far more product lines than it deletes.
- You are changing a test so an old shape keeps passing.
- The change contradicts a decided shape or decision.
- You are unsure what is native: read the reference first, then ask.

Stop means: no more code, a comment on the issue with the evidence, and the question for the
operator. The [stop conditions](../../../docs/development/delivery.md#stop-then-escalate) in
`delivery.md` also apply.

## Ship

- Before every push, run `npm run verify:quick` and the checks the change touches. CI runs the full
  `verify` at the head SHA; do not run it locally.
- Never reset, clean, stash or force-push. Remove worktrees only with `npm run worktree:reap`.
- Conventional commits and a pull request against `main` that links its issue. Merge only when `delivery.md` names you as the one who merges.

## Delegate

Code subagents run on Sonnet 5.5; Opus 5.5 only for design across modules, concurrency, a subtle algorithm
or security, with the reason in the prompt. The operator's `~/.claude/pstack-models.md` overrides
this. The root session reads every delegate's diff and writes its own summary from it. A delegate
prompt loads Poteto Mode and the [`mastra`](../mastra/SKILL.md) skill, points at files, names its worktree and its disjoint file set, forbids merge, reset, clean,
stash, force-push and `git worktree prune`, and says to stop on a material fork.

## Keep state out of this skill

Status, SHAs, dates and next actions live in `docs/roadmap.md` and GitHub. A handoff names the
repository, branch, expected head and issue, and a fresh session still starts from zero.
