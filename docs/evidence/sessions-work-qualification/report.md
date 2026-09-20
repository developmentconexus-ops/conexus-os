# Sessions and Work qualification, corrected report

This replaces an earlier report that claimed more than its evidence carried. It is not a
closure: the task stays open, and the section on what has no evidence says why.

Everything below is labelled by where it comes from. `[probe]` was observed by running
something, and the run is recorded in [output.md](output.md). `[package]` was read in an
installed or downloaded package, with the path. `[docs]` is Mastra's published
documentation, which describes a hosted product as well as an installable package.
`[not established]` means exactly that.

## 1. Conversations, property by property

The earlier report treated these as one claim. They are not, so each was asserted on its
own. Nothing below is inferred from another line.

| Property | Verdict | How it was established |
| --- | --- | --- |
| A session holds more than one conversation in one Project | holds | `[probe]` two threads created through `session.thread.create()` |
| Binding to a thread | holds | `[probe]` `session.thread.switch()` followed by `session.thread.getId()`, not by reading a message |
| Controller recreation inside one process | holds | `[probe]` a second `AgentController` over the same store lists the same conversations |
| Process termination and restart | holds | `[probe]` a writer process exits, and a reader process that never saw it lists the same conversations |
| Persistence of ids and metadata | holds | `[probe]` ids, the thread title, and a per-thread setting written by the dead process all read back |
| Persistence and recovery of messages | holds | `[probe]` messages written straight into the store with `memory.saveMessages()` are recovered per thread after the restart, and do not cross between threads |
| Concurrent execution | **only for thread creation** | `[probe]` eight concurrent `thread.create()` calls produce eight distinct ids that all survive the restart. Concurrent agent runs were not exercised, and nothing here claims them |
| Privacy between Projects | holds, conditionally | `[probe]` a session on another Project does not list this Project's conversations |
| Authorization on a named conversation | holds, conditionally | `[probe]` reading or binding a foreign Project's thread by id from a session of another Project is refused with `Thread not found` |

The condition on the last two is the important part, and it is ours, not the framework's.
Isolation is by `resourceId`. The framework refuses a cross-resource read because the
session carries a different `resourceId`, so whatever decides that a request may act under
a Project's `resourceId` is the real authorization boundary, and that decision stays in
Conexus. The refusal is not an entitlement check and must not be described as one.

No model was called anywhere in this section. Messages were written through the memory API,
which is why this is persistence evidence and not generation evidence.

## 2. The Factory exists, and what it actually is

The earlier report said "there is no Factory". That was wrong in the only way that matters:
it is not in the product's dependencies, which says nothing about whether it exists.

`[package]` `@mastra/factory` publishes 0.15.0 (2026-09-15), with 0.16.0-alpha.9 on the
alpha channel (2026-09-20). Its `package.json` pins `@mastra/core` to exactly `1.67.0` as a
dependency, not as a peer dependency and not as a range. `[upstream main]` the
`mastracode/factory` path in `mastra-ai/mastra` tracks the alpha channel and is ahead of the
published stable release; no file-level diff between main and 0.15.0 was taken, so nothing
here rests on upstream main.

`[probe]` installing `@mastra/factory@0.15.0` beside `@mastra/core@1.67.0` and
`@mastra/libsql@1.23.0` in a scratch directory resolves with **one** copy of `@mastra/core`,
at 1.67.0. That is the version the product already runs. Compatibility at the resolution
level is therefore observed, not assumed. It was not tested inside the product's own tree,
and the product's dependencies were not touched.

`[probe]` the Factory boots self-hosted with `auth: null`, a `LibSQLFactoryStorage`, no
integrations and no sandbox. `prepare()` returns `new Mastra(...)` arguments carrying
`agentControllers`, `server`, `storage` and `workers`; the controller it mounts is named
`code`, and it declares 79 API routes. No Mastra platform account was used and nothing was
paid for.

`[package]` the Factory composes with the same primitive this qualification proved:
`dist/session/factory-session.d.ts` defines `FactorySession` as the return type of
`AgentController<MastraCodeState>['createSession']`. It is not a separate runtime.

`[package]` `MastraFactoryConfig.storage` is required, and its docstring in
`dist/factory.d.ts` says one backend powers "BOTH agent storage (threads, messages, memory,
OM ...) and the app tables (projects/source-control/audit/intake)". So the Factory owns a
conversation store. That is the sharpest point of contact with C-020.

## 3. The Work mapping, corrected

The earlier report mapped Work onto Background Tasks, Goals and tool approval. That mapping
was wrong and is withdrawn.

| Earlier claim | Why it does not hold | What the evidence actually supports |
| --- | --- | --- |
| Background Tasks are the delegable unit of Work | `[package]` they are an execution primitive: a tool call that does not block the loop. They carry no work item, no stage, no reviewer and no actor | They remain a way to run something without blocking, nothing more |
| Goals prove a reviewed, validated candidate | `[package]` a goal is a judge model scoring an objective across iterations. It does not produce an identified artifact that a reviewer accepted | They remain an in-loop stopping condition, and they are beta with breaking changes announced |
| Tool approval proves the Project's current authorization | `[package]` it pauses a tool call and resumes it. It says nothing about who holds a right on a Project at the moment of the call | It remains the transport for asking, not the decision |

What the Factory actually has, all `[package]` unless marked:

- **Work item.** `WorkItemRow` in `dist/storage/domains/work-items/base.d.ts`, with `orgId`,
  its own `factoryProjectId`, `board`, exclusive `stages`, a `stageHistory`, a `sessions`
  map, `revision`, and `createdBy`.
- **Identity of the actor.** `WorkItemStageEntry.by` and `.exitedBy`, plus `isAgentActor()`,
  which deliberately distinguishes an agent binding (`agent:*`) from a human and from a
  poller. `[probe]` a stage history came back naming the human who created the item and the
  agent binding that moved it.
- **Review and re-review.** `reviewBoard` and `ReviewBoardPhase` in `dist/boards/`, with the
  re-review behaviour carried by a bundled skill (`factory-skills/factory-rereview/SKILL.md`),
  which is prose the agent reads, not a typed API.
- **Boards and rules.** `defineBoard()`, `BoardDefinition`, `BoardTransitionPolicy`,
  `createBoardRegistry`. `[probe]` the shipped boards are `work` and `review`.
- **Transition with concurrency control.** `commitTransition()` takes `expectedRevision`,
  an `actorId`, an ingress identity and an explicit accepted-or-rejected evaluation.
  `[probe]` a replay against the stale revision left the item with a single `execute`
  stage entry rather than moving it twice.
- **A queue with leases.** `claimDeferredDecisions()`, `claimPendingStarts()`,
  `prepareRunStart()` returning a `replayed` flag, and stale-binding revocation.
- **Tenancy.** `[probe]` reading the same work item id under a different `orgId` returns
  nothing.
- **Candidate.** There is **no** candidate concept. A proposed change is a pull request.
  `capabilities/version-control.d.ts` is a forge-shaped contract:
  `createPullRequest`, `submitReview`, `mergePullRequest`, review comments, requested
  reviewers. `[docs]` factory.mastra.ai/using/reviews says the merge decision is made
  through the repository's normal human review process.

Against the five properties the task names:

| Property the task requires | Verdict | On what |
| --- | --- | --- |
| Work is bounded and delegable | holds | `[package]` a `WorkItemRow` carries its own stages, history and `sessions` map, so it outlives the conversation that raised it. `[probe]` one was created and moved with no conversation in play at all |
| It produces a reviewed, validated candidate | **partly, and not as a candidate** | `[package]` there is a review board and a verdict-bearing transition, but no candidate type. The reviewed artifact is a pull request on a forge |
| Applying it is explicit | holds for the Factory's own shape | `[docs]` the merge decision is made through the repository's normal human review process, and `[package]` the Factory exposes `mergePullRequest` rather than merging on completion. Whether this maps onto Conexus applying to a Project's source is `[not established]` |
| It never publishes | `[not established]` | Nothing observed shows a production effect on completion, and nothing observed rules one out. The sandbox and integrations were both off in the probe |
| It carries authorization | holds for the actor, not for the right | `[package]` `actorId`, an ingress identity and `isAgentActor()` travel with every transition, and `[probe]` a stage history named the human and the agent binding separately. Whether that actor may act on a Conexus Project is still our decision |

So the Factory does have the SDLC the earlier report went looking for in the wrong place.
It also has a shape for applying a result that Conexus does not share: Conexus applies to a
Project's source under its own custody and never publishes, while the Factory's application
path is a pull request on a forge. `VersionControl` is an interface, so a Conexus
implementation is possible in principle, but its method list is the forge's, and nothing
here establishes that our admission model fits behind it. `[not established]`

## 4. Conexus responsibilities that could be removed, as candidates

Each row names the current consumer, the property it protects, the substitute and its
version, the evidence, and what would have to be true first. A row is a candidate, not a
decision.

| Current consumer | Property it protects | Native substitute | Evidence | Condition before removal |
| --- | --- | --- | --- | --- |
| `threadIdForProject()`, [`apps/hub/src/builder/module.ts:33`](../../../apps/hub/src/builder/module.ts) | A Project's conversation can be found again, by deriving one id from the Project id | `session.thread.create/switch/list`, `@mastra/core` 1.67.0 | `[probe]` section 1 | Conexus keeps deciding which `resourceId` a request may act under, and existing derived thread ids stay reachable after the change |
| The same derivation used for restart recovery, [`module.ts:217`](../../../apps/hub/src/builder/module.ts) | A conversation survives a Hub restart | The controller's own store | `[probe]` the two-process run | The per-Project store file stays durable and per-Project, as `builder-session.db` is today |
| Per-thread UI state, were Conexus to add its own | The chosen model or mode of a conversation is remembered | `session.thread.getSetting/setSetting` | `[probe]` `currentModelId` survived the restart | Only applies to state that is genuinely per conversation. The Builder's model identity is per run, stored on the run row, and is **not** covered |

Explicitly **not** candidates, because an API with a similar name is not evidence:

- `createBuilderRun({ idempotencyKey })`, `claimBuilderRun()`,
  `recoverAndListQueuedBuilderRuns()`, `requestBuilderRunCancellation()`,
  `interruptBuilderRun()` and `settleBuilderRun()` in
  [`apps/hub/src/builder/store.ts`](../../../apps/hub/src/builder/store.ts). The Factory has
  a queue with leases and a revision-checked transition, and the probe shows they behave
  sanely, but they are keyed on the Factory's own `orgId`/`factoryProjectId` and its own
  run bindings. Nothing observed here shows they carry a Conexus run's idempotency,
  cancellation, recovery after a Hub restart, or its failure vocabulary.
- Conexus source admission and the refusal to publish. The Factory's application path is a
  pull request, which is not what Conexus does.

## 5. The two compositions

The alternatives are the ones the task names. A parallel Conexus engine is outside the
approved direction and is not compared here.

| | **A. Factory for interaction and Work** | **B. Native controller for interaction, Factory for Work** |
| --- | --- | --- |
| Integration point | `new MastraFactory(config)`, `prepare()` feeding the `new Mastra(...)` literal, `finalize()` `[package]` | `WorkItemsStorage` registered on a `FactoryStorage`, used directly `[probe]` |
| What it brings whether wanted or not | Its own controller `code`, 79 API routes, workers, boards, auth default, and a storage that owns threads and messages `[probe]` | The Work domain only. The interaction path stays the controller this qualification proved |
| Project conversations | The Factory's session is the same `AgentController` session, so the primitive is identical; ownership of the store is not | Unchanged, and already proven end to end `[probe]` |
| Fit with Work | Complete, including boards, review, transitions, queue and actor identity | Same domain, but without the server, dispatcher and skills that drive it. What drives transitions in this shape is `[not established]` |
| Identity and privacy | Factory tenancy is `orgId` plus `factoryProjectId`; Conexus's account and Project would have to map onto both, and its auth default proxies the Mastra platform unless replaced | Conexus keeps its own boundary, and only the Work rows carry Factory tenancy |
| Source and application | A pull request through `VersionControl`, with the merge decision outside `[docs]` | Conexus keeps its own custody and admission; a Factory-driven apply would still need a `VersionControl` implementation `[not established]` |
| Conversation store | Two stores, or ours replaced by the Factory's. C-020 forbids a second conversation store | One conversation store, ours, unchanged |
| Compatibility | Resolves on `@mastra/core` 1.67.0 with one copy `[probe]`; boots self-hosted `[probe]` | Same resolution evidence; the Work domain also works with no Factory server at all `[probe]` |
| Conexus-owned logic still required | Mapping account and Project onto org and Factory project, an auth provider, and an application path that does not publish | Whatever advances a work item, plus the same application path question |

**Recommendation: B**, and it is a recommendation about direction, not a licence to start.
B is the only one of the two that does not put a second owner on the conversation store, and
the interaction half it depends on is the half that now has evidence. A's decisive cost is
not the Factory's quality, which looks high; it is that adopting it for interaction means
adopting its server, its controller, its tenancy and its store in one move, against a
product whose Project, custody and publication rules are already decided.

**A is not disqualified, and one thing that would change this answer is cheap to find out.**
If the Factory's `orgId`/`factoryProjectId` can carry a Conexus account and Project without
a second conversation store, A becomes the shorter path to a real SDLC. That was not
established here, and it is the next thing worth qualifying rather than something to assume
either way.

## 6. What has no evidence yet

- Concurrent agent runs on one Project, as opposed to concurrent thread creation.
- Whether anything drives Factory work items without the Factory server, which is what
  composition B needs. The probe moved an item by calling storage directly, which is not
  the same as a board rule doing it.
- Whether a Conexus `VersionControl` implementation over our own custody is coherent, given
  a contract written around pull requests, reviews and merges.
- How Conexus identity maps onto Factory tenancy, and what the Factory's auth default costs
  when replaced by ours.
- Any claim about upstream main beyond its release cadence.

## 7. First increment, unchanged and still not started

Several conversations per Project in the Builder, with listing, switching and resuming. No
Work, no Goals, and no Conexus-owned conversation store. Its technical realization is
deliberately left open, because both compositions reach it through the same
`AgentController` session and the comparison above is not closed.
