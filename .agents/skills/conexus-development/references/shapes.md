# Shapes

The shapes Conexus is built on, each with its owner, and the shapes that must not appear. A wave
that settles a new shape adds its line here when it merges. When code and a shape disagree, the
owner document decides, and the disagreement is a finding.

## Decided

| Shape | Owner |
| --- | --- |
| A Project is a Mastra thread per conversation, Conexus-owned working state and a Git source; the Builder is our own Mastra agent controller, off the Factory | C-020, C-032 in the [decision register](../../../../docs/decisions/index.md), [Builder reference](../../../../docs/reference/builder-c020-mastra-native.md) |
| A conversation owns one E2B sandbox and one branch mirror, kept across its turns | [spec 0002 amendment](../../../../docs/tasks/specs/0002-builder-own-harness/index.md#amendment-2026-09-29-a-conversation-owns-its-sandbox-and-its-branch) |
| A run's states, phases and results come from one generated vocabulary that the Hub, the web app and SQL import | [`builder-run-vocabulary`](../../../../apps/hub/src/generated/builder-run-vocabulary.ts) |
| The agent's "done" is one checked verdict on the candidate; a red check goes back to the agent in the same run | [`candidate-gate.ts`](../../../../apps/hub/src/builder/candidate-gate.ts) |
| An external system is one integrator; a Project reads it through its own bindings and one executor, and every call is recorded | C-029, C-030 |
| Generated apps use the app stack v2 | C-033 |
| Conexus designs its screens; `@mastra/playground-ui` supplies parts | C-031 |
| Every concept has one owner, Conexus or Factory | [single-owner map](../../../../docs/reference/single-owner-map.md) |

## Not here

Each case happened in this repository and cost a redesign.

- **State beside Mastra's.** A map that remembers what a Mastra session, its suspensions or its
  storage already hold (parked runs kept in a Hub map next to `pendingSuspensions`). Read the
  session; Mastra Factory does.
- **A long-lived resource made and dropped per run.** A session or sandbox handle created at each
  run and deleted at its end, then patched so the next run finds it again.
- **A patch on a patched premise.** Eight fixes kept "an answer to a question is a new run" alive.
  Two fixes on one premise call for a Redesign.
- **A flag bag.** Booleans such as `parked`, `answered`, `parking` that encode a state machine.
  Model the states as a union with one owner.
- **A hidden side channel.** A module-level `WeakMap` or global that wires one call to another.
- **A guard for a failure never seen.** No speculative retry, timeout or fallback; prove the
  failure first, then guard what was measured.
- **A retry or button for our own bug.** A Conexus platform failure is fixed in Conexus code, not
  offered to the person or the agent as "try again".
- **Code kept because it exists,** or a test changed so an old shape keeps passing.
- **A second way.** Two mechanisms for one need, such as a native `title` tooltip beside the design
  system's tooltip.
