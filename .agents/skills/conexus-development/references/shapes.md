# Shapes

The shapes Conexus is built on, each with its owner, and the shapes that must not appear. A wave
that settles a new shape adds its line here when it merges. When code and a shape disagree, the
owner document decides, and the disagreement is a finding.

## Decided

| Shape | Owner |
| --- | --- |
| A Project is a Mastra thread per conversation, Conexus-owned working state and a Git source; the Builder is our own Mastra agent controller, off the Factory | C-020, C-032 in the [decision register](../../../../docs/decisions/index.md), [Builder reference](../../../../docs/reference/builder-c020-mastra-native.md) |
| A conversation owns one E2B sandbox and one branch mirror, kept across its turns | [spec 0002 amendment](../../../../docs/tasks/specs/0002-builder-own-harness/index.md#amendment-2026-09-29-a-conversation-owns-its-sandbox-and-its-branch) |
| A run's states, phases and results come from one generated vocabulary that the Hub, the web app and SQL import | [roadmap, phase 1 guards](../../../../docs/roadmap.md#order-of-work-to-q5); generated as `builder-run-vocabulary.ts` |
| The agent's "done" is one checked verdict on the candidate; a red check goes back to the agent in the same run | [roadmap, phase 1 fixes](../../../../docs/roadmap.md#order-of-work-to-q5); built in `candidate-gate.ts` |
| An external system is one integrator; a Project reads it through its own bindings and one executor, and every call is recorded | C-029, C-030 |
| Generated apps use the app stack v2 | C-033 |
| The application check is typed files bundled when the Hub is built and delivered to each VM by sha256 | [spec 0012](../../../../docs/tasks/specs/0012-app-check-typed-files/index.md) |
| Conexus designs its screens; `@mastra/playground-ui` supplies parts | C-031 |
| A failure is a row of `failures.json`; one `Failure` type; one exit logs it | [spec 0009](../../../../docs/tasks/specs/0009-one-failure-table/index.md) |
| Every concept has one owner, Conexus or Factory | [single-owner map](../../../../docs/reference/single-owner-map.md) |
| Periodic work is a `Job` run by the one executor; whatever expires is removed by `iam.reap_expired` | [spec 0013](../../../../docs/tasks/specs/0013-one-job-executor-one-reaper/index.md) |
| A module is a function returning a frozen object with private state; a class only extends `Error`, `Failure` or a library base class | [spec 0013](../../../../docs/tasks/specs/0013-one-job-executor-one-reaper/index.md) |

## Never

Each item happened in this repository. A `lint` item fails `npm run verify:quick`. A `review` item
is judged in review.

- **Never keep state beside what Mastra, E2B or PostgreSQL already holds.** Before S2 (spec 0011), a Hub map
  kept parked runs next to Mastra's `pendingSuspensions`. Instead read the Mastra session, the way Mastra
  Factory does. `review`, principle 4.
- **Never create and delete a long-lived resource on every run.** #380 paused the sandbox after
  each run, against the idle window in spec 0002, and later fixes patched the next run to find it
  again. Instead let the conversation own one sandbox and one session. `review`, principle 1.
- **Never fix one premise a third time.** Eight pull requests kept "an answer to a question is a
  new run" alive before the redesign. Instead stop after the second fix and report that the
  premise needs a redesign. `review`, principle 12.
- **Never encode a lifecycle in booleans.** Before S2 (spec 0011), `parked`, `answered` and
  `parking` together encoded the parked-run state machine. Instead write a union of states with one owner. `review`,
  principle 2.
- **Never connect two calls through a module-level variable.** #380 added `fedMirrors`, a module
  `WeakMap` from a workspace to its turn mirror, and tests later kept it alive. Instead pass the
  value, or give it an owner. `review`, principle 5.
- **Never add a retry, timeout or fallback for a failure nobody has seen.** #486 deleted the
  `setBuilderRunPhase` guard, which nothing triggered. Instead reproduce the failure, then guard
  what you measured. `review`, principle 11.
- **Never offer "try again" for a Conexus failure.** #481 deleted the "Tentar de novo" button and
  its `retry-publish` route, which ran a second run lifecycle beside the normal one. Instead fix
  the failure in Conexus code. `review`, principle 7.
- **Never edit a test so an old shape keeps passing.** Tests that asserted the old premise kept
  `holdSession`, `owners` and `fedMirrors` alive through a redesign. Instead change the shape, fix
  each test of real behavior, and delete each test whose subject is gone. `review`, principle 9.
- **Never assert on production source text.** #486 and #493 replaced source-text tests with a GET
  per SPA path and a real double click. Instead call the code as its user does and compare with a
  literal value. `review`, principle 9.
- **Never keep code because it exists.** #486 deleted 24 package scripts and 21 failure codes
  that nothing produced. Instead say what the change deletes. If a fix adds far more product
  lines than it deletes, stop and report. `review`, principle 11.
- **Never ship a second way for one need.** A native `title` tooltip appeared beside the design
  system's `Tooltip`. Instead use the existing way, or replace the old way everywhere in the same
  change. `review`, principle 6.
- **Never let one function run a whole lifecycle.** Functions over 80 lines still sit under a
  `debt: owning wave` suppression. Instead split by subject, and never grow a function under a
  size `biome-ignore`. `lint` (`noExcessiveLinesPerFunction`), principle 5.
- **Never cast data that came from outside.** #493 removed the casts that `noUnsafeTypeAssertion`
  found, such as the connector broker input, which is now `unknown`. Instead parse it once at the
  edge with a schema. `lint` (`noUnsafeTypeAssertion`), principle 3.
- **Never write a rule in a second place.** `shapes.md`, `AGENTS.md` and the conexus-development
  skill each kept a never-list, and their fix counts drifted apart. Instead link the rule's one
  home, or make the rule a check. `review`, principle 12.
