---
name: conexus-development
description: This skill should be used for any development session in the Conexus OS repository, when resuming, investigating, fixing, building, redesigning, verifying, reviewing, delegating or handing off work. Triggers include "pick up issue #N", "build this", "fix this bug", "why is this slow", "review this PR", "open a PR", "hand this off", "spawn a subagent", any work in a conexus-os worktree, and any change to a screen, `apps/web`, `packages/brand` or `apps/keycloak-theme`: "nova tela", "tela de login", "Keycloak theme", "redesign", "layout", "cor", "ícone", "texto da interface", "dark mode", "responsivo", "acessibilidade", "Construir".
---

# Conexus development

This skill routes Conexus OS work: which flow, which guides, when to stop. It holds no rule. The
nine guides hold the rules, one subject each, and [delivery](../../../docs/development/delivery.md#waves)
names the Conexus skill that owns each stage of a wave. The roadmap and GitHub own status.

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
notes. Each step names what to do and the skill that does it.

| The work | Flow |
| --- | --- |
| A question: how does X work, why is it built this way, where is the time going; or the study of a wave | Investigate, with [`conexus-study`](../conexus-study/SKILL.md) |
| Wrong behavior someone saw | Fix |
| A roadmap wave, a redesign, or new behavior across modules | Wave: [`conexus-spec`](../conexus-spec/SKILL.md), [`conexus-build`](../conexus-build/SKILL.md), [`conexus-prove`](../conexus-prove/SKILL.md) |
| A small change inside accepted meaning, with no spec | Small change |
| A pull request to judge | Review |
| Any web, Builder or Preview screen | Frontend, on top of the flow above |

## Read the guides

C, the [codebase principles](../../../docs/development/codebase-principles.md), always. P, the
[product contract](../../../docs/product/contract.md), whenever the promise to the person is in
play. Then by task and state:

| Task | Spec | Build | Proof |
| --- | --- | --- | --- |
| Database | A, D, S, T, L | D, S, T | A, D, S, T, L |
| Hub API | A, H, S, T, L | H, S, T | A, H, S, T, L |
| Screen | P, V, A, T, L | P, V, T | P, V, A, T, L |
| Agent or Mastra | A, S, T, L | A, S, T | A, S, T, L |
| Infra | A, S, T, L | A, S, T | A, S, T, L |
| Docs only | the subject's guide, and L if it changes process | the subject's guide | every guide touched, and L |

A mixed task reads the union; a screen that changes a request adds H, an API change that changes
persistence adds D, and the Agent row loads the `mastra` skill. Merge reads L and every guide the
diff touched. The guides: [A](../../../docs/reference/architecture.md),
[D](../../../docs/reference/database.md), [S](../../../docs/reference/security-and-authority.md),
[H](../../../docs/product/wire-contract.md), [V](../../../DESIGN.md),
[T](../../../docs/development/testing.md), [L](../../../docs/development/delivery.md).
[`areas.json`](../../../docs/development/review/areas.json) maps each path to its guides.

## Before writing code

1. Name the data shape and the one place that owns it.
2. Read how Mastra's own products (Factory, Mastra Code) do the same thing, not only the API.
3. Read the whole lifecycle you touch, not the lines around the symptom.
4. Check the [decision register](../../../docs/decisions/index.md).
5. Say what the change deletes. Code stays because it is needed, never because it exists.

Find the facts with [`references/evidence.md`](references/evidence.md): telemetry, Mastra's spans,
the logs, the verify harness and the reference code. Measure before you guess.

## Stop and report when

A **must not** rule of the [code guide](../../../docs/development/codebase-principles.md) would break, or a
[stop condition](../../../docs/development/delivery.md#stop-then-escalate) holds. Stop means: no
more code, a comment on the issue with the evidence, and the question for the operator.

## Delegate

The planning session delegates each wave stage to a fresh session, and each unit to one builder
that builds from its unit card with [`conexus-build`](../conexus-build/SKILL.md). It reads every
delegate's diff. A delegate prompt names the stage's Conexus skill, loads Poteto Mode if the session
has it and the [`mastra`](../mastra/SKILL.md) skill, points at files and at the guides the table
names, names its worktree and its disjoint file set, forbids merge, reset, clean, stash, force-push
and `git worktree prune`, and says to stop on a material fork. A builder does not delegate code.
Remove worktrees only with `npm run worktree:reap`.
