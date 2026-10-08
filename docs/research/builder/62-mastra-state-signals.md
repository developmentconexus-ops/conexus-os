# 62. Mastra state signals, and how Factory keeps its agent on its phase

Input to the S2 census and the screen QA. Read from `@mastra/core` (`agent/state-signals.ts`,
`ProcessorStateSignal` in `observability/types/tracing.ts`) and Mastra Factory
(`mastracode/factory/src/rules/processor.ts`, `FactoryPhaseStateProcessor`).

## What a state signal is

A processor owns one named lane of state on a thread (its `stateId`). On every model input step
Mastra calls the processor's `computeStateSignal()`, and the processor returns the lane's current
state as a block of context the model reads, wrapped in a tag (`tagName`).

| Mode | When |
| --- | --- |
| `snapshot` | The lane's first emission, or the context window no longer holds a snapshot (`contextWindow.hasSnapshot === false`, for example after compaction) |
| `delta` | A snapshot is still in context and only part of the state changed |

A `cacheKey` per emission makes an unchanged state free: when it matches the last one, the
processor returns nothing and Mastra sends nothing. Mastra records each lane's version and last
snapshot in the thread's metadata (`mastra.stateSignals`).

Lanes Mastra ships: `tasks` (`<current-task-list>`), `goal` (`<current-objective>`) and `browser`
(the open page). The Factory UI hides the `tasks` and `goal` snapshots in the transcript and shows
the `browser` one.

## How Factory uses it

`FactoryPhaseStateProcessor` owns the lane `factory-phase`. Its snapshot tells the agent which
work item it serves and how to move it:

- the board (work or review), the stage and its label;
- the work item's title and id, the binding's role, the item's revision, the config version;
- on the review board, the runtime (model and reasoning setting);
- linked items;
- "Use `factory_transition_work_item` with expectedRevision N to request a phase change."

The state is read from the database (the work item and its run binding) on every step, never kept
in the agent's memory. When the binding is no longer active, one last snapshot clears the lane.

## What it means for Conexus

- **S2.** The run's state the agent needs (the approved plan, the open question, the run's phase)
  can be a lane computed from the run's record, as Factory does with the work item, instead of a
  Hub mechanism or text repeated in prompts. The `tasks` and `goal` lanes may carry the approved
  plan through a run.
- **Screen QA.** The `browser` lane already gives the agent the page it checks
  (`@mastra/agent-browser`).
- **Shape.** Durable state lives in the database; the agent sees it through a lane; the agent moves
  it only through a tool that checks the revision. This is the shape to compare against in the S2
  census.
