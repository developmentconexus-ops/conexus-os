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
3. Read [`docs/roadmap.md`](../../../docs/roadmap.md) for the current work, and
   [delivery](../../../docs/development/delivery.md#pick-the-lane-by-risk) to pick the lane.
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
| A roadmap wave or a redesign, from its approved spec | Redesign |
| A pull request to judge | Review |
| Any web, Builder or Preview screen | Frontend, on top of the flow above |

## Before writing code

1. Name the data shape and the one place that owns it.
2. Read how Mastra's own products (Factory, Mastra Code) do the same thing, not only the API.
3. Read the whole lifecycle you touch, not the lines around the symptom.
4. Check the owners in [architecture](../../../docs/reference/architecture.md) and the
   [decision register](../../../docs/decisions/index.md).
5. Say what the change deletes. Code stays because it is needed, never because it exists.
6. Meet the [codebase principles](../../../docs/development/codebase-principles.md).

Find the facts with [`references/evidence.md`](references/evidence.md): telemetry, Mastra's spans,
the logs, the verify harness and the reference code. Measure before you guess.

## Stop and report when

A [never-list](../../../docs/development/codebase-principles.md#never) item would break, or a
[stop condition](../../../docs/development/delivery.md#stop-then-escalate) in `delivery.md` holds.

Stop means: no more code, a comment on the issue with the evidence, and the question for the
operator.

## Ship

- Before every push, run `npm run verify:quick` and the checks the change touches. CI runs the full
  `verify` at the head SHA; do not run it locally.
- Remove worktrees only with `npm run worktree:reap`.
- Conventional commits and a pull request against `main` that links its issue.

## Delegate

The session that plans the work picks who writes code and reads every delegate's diff. A delegate
prompt loads Poteto Mode and the [`mastra`](../mastra/SKILL.md) skill, points at files, names its
worktree and its disjoint file set, forbids merge, reset, clean, stash, force-push and
`git worktree prune`, and says to stop on a material fork.

## Keep state out of this skill

Status, SHAs, dates and next actions live in `docs/roadmap.md` and GitHub. A handoff names the
repository, branch, expected head and issue, and a fresh session still starts from zero.
