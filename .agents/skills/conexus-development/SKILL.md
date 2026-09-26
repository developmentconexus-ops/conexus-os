---
name: conexus-development
description: This skill should be used for any development session in the Conexus OS repository, when resuming, planning, building, verifying, reviewing, delegating or handing off work. Triggers include "pick up issue #N", "build this", "fix this bug", "review this PR", "prepare the gate task", "open a PR", "hand this off", "spawn a subagent", and any work in a conexus-os worktree.
---

# Conexus development

This skill routes Conexus OS work. It owns no rule. [`delivery.md`](../../../docs/development/delivery.md) owns lanes, gates, labels, proof and merge. The roadmap and GitHub own status. If this skill and `delivery.md` disagree, `delivery.md` wins and this skill has the bug.

## Start from zero

1. Read the root `AGENTS.md`. Chat, handoffs and memory are orientation, never authority.
2. Read [`references/wsl-environment.md`](references/wsl-environment.md). Work in a WSL Ubuntu worktree, source NVM, and confirm the Node and npm pins.
3. Run `npm run conexus:preflight`.
4. Read [`docs/roadmap.md`](../../../docs/roadmap.md) for the current gate. Use [`docs/index.md`](../../../docs/index.md) only to find the smallest owner of a question.
5. Read `delivery.md` and pick the lane before any other decision.
6. Load the Poteto Mode skill installed in the session, the playbook that matches the work, and the leaf of every principle applied. Name the principles that changed a decision. If Poteto Mode is not installed, say so. Keep it cheap: one targeted read beats a panel of subagents.
7. For Mastra-sensitive work, read [`.agents/skills/mastra/SKILL.md`](../mastra/SKILL.md) before any version-specific claim. For frontend work, load [`.agents/skills/conexus-frontend/SKILL.md`](../conexus-frontend/SKILL.md).

## Pick the route by lane

The lane decides where the work starts. Its gates are in the [lane table](../../../docs/development/delivery.md#pick-the-lane-by-risk). [`references/work-routes.md`](references/work-routes.md) holds each route in full.

| Lane | Starts from | Work is tracked in |
| --- | --- | --- |
| `lane:fast` | an issue in this repository | the issue |
| `lane:shaped` | a bet in the private `conexus-hq`, split into sub-issues here | each sub-issue |
| `lane:qualification` | any Q trigger: the gate the roadmap names, or a bet that trips Q-b, Q-c or Q-d | one task in `docs/tasks` |

Only the qualification lane writes a task in `docs/tasks`. A fast or shaped unit never waits for a task and never creates one.

If a higher-lane trigger appears mid-work, stop, comment on the issue, and change the lane label. The manager reshapes the bet.

## Build a change

- Confirm that the issue or task names the observable result, the non-goals and "done when". If a material item is missing, ask on the issue. Do not invent product meaning in code.
- Before adding a mechanism, take the native census in [Mastra native](../../../docs/development/review/mastra-native.md#proof-required).
- Stop on the conditions in [Stop, then escalate](../../../docs/development/delivery.md#stop-then-escalate).
- Add `needs:aprovo` when the change is one of the [three kinds that need it](../../../docs/development/delivery.md#ask-for-aprovo-on-three-kinds-of-change).
- Run the checks the change touches. Do not run `npm run verify` locally. CI runs the whole graph at the head SHA.
- Preserve every path this session did not create. Never reset, clean, stash or force-push, and remove worktrees only with `npm run worktree:reap`.
- Use conventional commits. Push, open the pull request against `main`, link the issue, and confirm that `verify` ran at the exact head SHA. Never merge.

## Review a change

Review the pushed head against its issue or task and the current owners, not against the author's summary. Load the pages the [review checklist](../../../docs/development/review-checklist.md#load-the-pages) names from `origin/main`, and give its verdict table. Report the smallest failed item. A review does not fix the code it reviews unless the operator asks.

## Delegate

Code subagents run on Sonnet. Escalate one to Opus only for design across modules, concurrency or a subtle algorithm, and state the reason in the prompt and in the report. Rule text, skill text and review adjudication run on Opus. The operator's `~/.claude/pstack-models.md` overrides these defaults. Read [`references/review-and-delegation.md`](references/review-and-delegation.md) before spawning a subagent or an independent review.

## Keep state out of this skill

Status, SHAs, dates and next actions live in `docs/roadmap.md` and GitHub. A handoff is a pointer: repository, branch, expected head, the issue or task, and "stop on its stop conditions". A fresh session still starts from zero.

## References

- [`references/work-routes.md`](references/work-routes.md): each lane's route, the qualification task contract, roles, and frontend work.
- [`references/review-and-delegation.md`](references/review-and-delegation.md): what a delegate prompt carries, and review by lane.
- [`references/wsl-environment.md`](references/wsl-environment.md): WSL entry, worktrees, disk, calling WSL from Windows, and the pilot.
