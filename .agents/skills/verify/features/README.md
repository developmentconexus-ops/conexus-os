# Conexus verification map

This directory is the maintained source for verifying what a person sees in Conexus. Read this index before driving, then use the matching feature file as the recipe. Commands below abbreviate `node .agents/skills/verify/scripts/control.mjs` as `$C`.

## Baseline preconditions

- One run launched from this worktree with `$C launch`, and `$C doctor` reporting `"ok": true`.
- The run's person is `verify-operator` (display name `Verify Operator`). `$C sign-in` signs them in and creates their account on the first sign-in, which makes them the installation administrator.
- Nothing else is seeded. A fresh run has no Workspace, no Project and no model account.
- Never drive an instance this run did not start.

## Driving conventions

- Start each recipe from the state its preconditions name, building it through the UI with the recipes it depends on.
- Prefer `--role` with `--name`, then `--label`. Names are pt-BR and case-sensitive.
- Take a `browser snapshot` before acting on an unfamiliar screen. It shows the real roles and names.
- Wait on a visible end state (`browser wait`), not on a fixed sleep, except to let a stream settle before a screenshot.
- Read every side effect back with `$C db ... --save <name>`.

## Proof and skip reporting

- UI proof is a screenshot plus an ARIA snapshot of the end state. Name both after the feature and sub-feature IDs.
- Mutation proof is the saved DB rows that the action created or changed.
- State the replaced boundaries: the fake model proxy and the closed E2B. A claim about a real provider or a real sandbox can't be proven by this skill.
- Report a sub-feature this harness can't reach with the unmet precondition named in its file. Never report it as verified through another path.

## Feature entry contract

Each feature file starts with an H1 and one paragraph on the user-visible behavior, then four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control.mjs` (starting with `Preconditions:`), and `Gotchas`. Keep implementation detail out; name user paths, stable handles, required state, commands and observable proof.

## Features

- [Sign-in and first account](./sign-in.md) covers Keycloak sign-in, the first account created in the sign-in callback, the entry redirect and sign-out.
- [Workspaces and Projects](./projects.md) covers creating a Workspace, starting a Project from the composer or the form, the Projects list, and the Workspace's people.
- [Construir](./construir.md) covers the conversation screen: send a message, the turn's outcome, reasoning, question and plan cards, and the model and reasoning picker.
- [Settings and model accounts](./settings-models.md) covers Settings: `Minha conta`, `Administradores`, and connecting Google AI Pro through the fake proxy.
- [Project settings and integrations](./project-settings.md) covers `Sobre o Projeto`, deleting a Project, and Sankhya connections bound to a Project.
- [Built app and app runner](./app-host.md) covers who may use the app and inviting them. Opening a built app is not reachable yet.
