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
| Isolation between Projects | holds, conditionally | `[probe]` a session on another Project does not list this Project's conversations, and reading or binding a foreign Project's thread by id is refused with `Thread not found` |
| Privacy between two people on the same Project | **does not hold, and is not offered** | `[probe]` a second session on the same Project lists the first person's conversations, because threads are scoped by `resourceId` and nothing narrower |

Those last two rows are different questions and the earlier report ran them together.
Isolation between Projects is real. Privacy between two people inside one Project is not
provided by `resourceId` scoping, and whoever wants it has to add it above.

The condition on isolation is ours, not the framework's. The framework refuses a
cross-resource read because the session carries a different `resourceId`, so whatever
decides that a request may act under a Project's `resourceId` is the real authorization
boundary, and that decision stays in Conexus. The refusal is not an entitlement check and
must not be described as one.

Every assertion above comes from a run that exits non-zero on failure and ends with a
negative control whose claim is false on purpose. The earlier probes could not fail in
places, which is why these were rewritten.

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

`[probe]` the Factory runs its whole boot lifecycle self-hosted with `auth: null`, a
`LibSQLFactoryStorage`, no integrations and no sandbox. `prepare()` returns `new Mastra(...)`
arguments carrying `agentControllers`, `server`, `storage` and `workers`; the controller it
mounts is named `code` and it declares 79 API routes; `finalize()`, which is what starts the
background workers, completes after the Mastra instance exists; `shutdown()` stops them and
the process then exits on its own in about two seconds, which is the probe's assertion that
nothing was left running. No Mastra platform account was used and nothing was paid for.

An earlier version of this report said the Factory "boots" on the strength of `prepare()`
alone. `prepare()` only assembles constructor arguments, so that claim was larger than its
evidence and has been replaced by the lifecycle above.

`[package]` the Factory composes with the same primitive this qualification proved:
`dist/session/factory-session.d.ts` defines `FactorySession` as the return type of
`AgentController<MastraCodeState>['createSession']`. It is not a separate runtime.

`[package]` `MastraFactoryConfig.storage` is required, and its docstring in
`dist/factory.d.ts` says one backend powers "BOTH agent storage (threads, messages, memory,
OM ...) and the app tables (projects/source-control/audit/intake)". So the Factory owns a
conversation store.

That is not by itself a C-020 problem, and an earlier version of this report treated it as
one. C-020 forbids two concurrent authorities over conversations. Moving our conversations
into a native store is a migration, and a migration is allowed.

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
  poller. `[probe]` a stage history came back naming who left each stage and who entered the
  next one.
- **Review and re-review.** `reviewBoard` and `ReviewBoardPhase` in `dist/boards/`, with the
  re-review behaviour carried by a bundled skill (`factory-skills/factory-rereview/SKILL.md`),
  which is prose the agent reads, not a typed API.
- **Boards and rules.** `defineBoard()`, `BoardDefinition`, `BoardTransitionPolicy`,
  `createBoardRegistry`. `[probe]` the shipped boards are `work` and `review`.
- **An engine that evaluates the move.** `FactoryTransitionService.transition()` in
  `dist/rules/transition-service.d.ts` reads the installed board's `transitionPolicy` and
  produces the verdict itself; the caller asks for a stage and never supplies the outcome.
  `[probe]` it accepted `intake` to `triage`, reported the revision it committed, and
  carried its own decisions; it rejected a stage the board does not define with
  `invalid_transition`, rejected an item under the wrong board, and rejected a stale
  revision with `stale`. Every rejection left the row's revision and stage untouched.
- **Idempotency keyed on the ingress identity.** `[probe]` a second request carrying an
  identity the engine has already seen, for the same organization and project, is answered
  with the first request's result and moves nothing. The earlier report missed this and
  read three replays as three decisions.
- **The engine is not in the public barrel.** `dist/index.d.ts` exports `MastraFactory`,
  the boards and the storage domains, but neither `FactoryTransitionService` nor
  `FactoryDecisionDispatcher`. `[probe]` they are reachable through the package's `./*`
  subpath export, which is how the probe imports them.
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
| It produces a reviewed, validated candidate | holds, through a pull request | `[package]` there is a review board and an engine that judges each move. `[probe]` the engine accepted a legal move and rejected three illegal ones on its own. The candidate is a pull request rather than a type named candidate, which the task does not require |
| Applying it is explicit | holds for the Factory's own shape | `[docs]` the merge decision is made through the repository's normal human review process, and `[package]` the Factory exposes `mergePullRequest` rather than merging on completion. Whether this maps onto Conexus applying to a Project's source is `[not established]` |
| It never publishes | holds for the package | `[package]` nothing in the Factory merges, deploys or publishes on completion. `mergePullRequest` exists on the `VersionControl` interface and is called by no automatic path; opening and merging are both explicit calls |
| It carries authorization | holds for the actor, not for the right | `[package]` an actor, an ingress identity and `isAgentActor()` travel with every transition, and `[probe]` a stage history named who left a stage and who entered the next. Whether that actor may act on a Conexus Project is still our decision |

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

The alternatives are the ones the task names, and neither is a parallel Conexus engine.
**A** adopts the Factory as the single authority for interaction and Work. **B** keeps a
native `AgentController` as the conversation authority and integrates the Factory's Work
engine to drive Work. An earlier version of this report compared B against a strawman, in
which B meant calling `WorkItemsStorage` by hand. That is not B, and that comparison is
withdrawn along with the recommendation it produced.

It also withdrew a bad argument. Replacing our conversation store with a native one is a
migration, not a second authority, and C-020 forbids two concurrent authorities rather than
forbidding change. Preferring B in order to keep the current design was reasoning backwards.

### What the Factory requires for each half

Conversations are cheap. `[probe]` the Factory's own controller opens two conversations for
a project that has no repository and no sandbox, the session has no workspace and does not
fail for the lack of one, and the `resourceId` is a string the host chooses, so a Conexus
Project identity is what the session is keyed on. `[package]` `FactoryProjectsStorage.create`
makes a project with no repository field, so a Factory project is not a repository.

Work is where it stops. `[package]` the only path that binds a work item to a run is
`FactoryStartCoordinator.prepare` in `dist/rules/start-coordinator.js`, which throws
`Factory source control storage is unavailable` at line 53 without a source-control handle,
and `Factory session not found` at line 16 unless the session already has a row in the
GitHub sessions table whose connection carries the same `factoryProjectId`. `[probe]`
running it with no source control produces exactly that refusal.

And the handle is GitHub by name, not by capability. `[package]` `dist/factory.js:300`
finds the integration with `integration.id === "github"` and passes that instance into
`createWorkspaceFactory({ github })`; `dist/workspace.d.ts` types the slot as the
`GithubIntegration` class, and `dist/workspace.js` calls `github.sourceControlStorage`,
`github.integrationStorage` and `github.versionControl.getRepositoryAccess`, alongside
direct imports of `integrations/github/pat.js` and `integrations/github/sandbox.js`.
`dist/factory.js:193` injects a platform GitHub integration whenever platform credentials
exist and nothing with that id is registered. `dist/workspace.js:202` throws
`GitHub and a sandbox callback are required to create a Factory session workspace`.

So `VersionControl` is a capability interface on paper, and the run path is GitHub by
literal id and concrete class. That is the decisive fact this report was missing.

### The comparison

| | **A. Factory for interaction and Work** | **B. Native controller for interaction, Factory's Work engine driving Work** |
| --- | --- | --- |
| Integration point | `new MastraFactory(config)`, `prepare()` into the `new Mastra(...)` literal, `finalize()`, `shutdown()` `[probe]` | `FactoryTransitionService` and `FactoryDecisionDispatcher`, plus the board registry and `WorkItemsStorage`, over a `FactoryStorage` `[probe]` for the first, `[package]` for the dispatcher |
| Conversations for a Project | Work natively. The session is keyed on a `resourceId` the host chooses `[probe]` | Work natively, and already proven across a process restart `[probe]` |
| Driving Work | The full engine, with boards, review, dispatch, sessions and recovery, provided Work starts through the coordinator | The same engine. `[package]` `FactoryDecisionDispatcher` takes `Pick<AgentController, 'getSessionByResource' \| 'listActiveThreadRuns'>`, which a Conexus controller satisfies, and calls only core session methods |
| What blocks it | **Starting Work requires a GitHub-shaped integration registered under the id `github`, with installation, repository, connection and session rows, and a sandbox callback** `[package]` `[probe]` | Nothing observed blocks it. The engine classes are not in the public barrel and are reached through the package's `./*` subpath, which pins us to internal paths across versions `[probe]` |
| Conexus-owned logic | An auth provider, the Account and Project mapping, and a GitHub-shaped shim over our own custody so the coordinator will start Work at all | An auth provider, the Account and Project mapping, and a replacement for `FactoryStartCoordinator`, which is the binding step: create the session, call `WorkItemsStorage.prepareRunStart`, hand the binding to the dispatcher |
| Application of the result | A pull request through `VersionControl`. `[package]` nothing merges, deploys or publishes by itself | The same, and equally unproven against Conexus custody |
| Compatibility | One copy of `@mastra/core` at 1.67.0, boots and shuts down self-hosted `[probe]` | Same resolution, and no Factory server or second controller is required `[package]` |

### Recommendation: B, on the blocker, not on conservatism

A is blocked by something specific rather than risky in general. To start Work under A,
Conexus must register an integration whose id is literally `github` and which behaves like
the `GithubIntegration` class, backed by installation, repository, connection and session
rows describing a repository that does not exist, plus a sandbox callback that clones from
a `cloneUrl`. That is not binding our identity to the Factory. It is telling the Factory
that our source lives somewhere it does not, and `dist/factory.js:193` will contest it
whenever platform credentials are present. If Conexus keeps custody of a Project's source,
A reduces to using the Factory for conversations, which is precisely what B already has.

B costs one component we would own: the binding step that `FactoryStartCoordinator`
performs today, which creates the session and calls `prepareRunStart`. It is small, and it
is the seam where Conexus authorization belongs anyway. B does not ask us to reimplement
the dispatcher, the phase advance, review or recovery, and this report is not licence to
write any of them.

This recommendation rests on the published 0.15.0. A host-pluggable source control would
overturn it, and nothing in this report treats the future as settled.

## 6. What has no evidence yet

- Concurrent agent runs on one Project, as opposed to concurrent thread creation.
- The dispatcher driving a real run end to end. `[package]` `FactoryDecisionDispatcher`
  takes a controller narrowed to `getSessionByResource` and `listActiveThreadRuns` and calls
  only core session methods on what it gets back, which is why a Conexus controller should
  satisfy it, but no probe has run a work item through it.
- What a Conexus binding step costs in practice, in place of `FactoryStartCoordinator`.
- Whether a Conexus application path can deliver a candidate through `VersionControl`
  without a forge, and what a review then means. `[package]` the interface is written around
  pull requests, reviews and merges.
- How Conexus accounts map onto the Factory's `orgId` and `userId` through a custom
  `IMastraAuthProvider`, which `[package]` reads as `user.workosId ?? user.id` and
  `user.organizationId`.
- Whether Factory work items need per-person privacy in Conexus. `[probe]` neither the
  Factory nor the core controller provides it inside one Project.
- Anything about upstream main beyond its release cadence, and anything about 0.16 alpha.

## 7. First increment, scoped and not started

Several conversations per Project in the Builder. It is the smallest thing a person would
notice, and it exercises the primitive everything else depends on.

**In scope.** Creating a conversation in a Project, listing the Project's conversations,
switching between them, resuming one after a Hub restart, and renaming one. Messages stay
where the framework puts them.

**Out of scope, deliberately.** Work, work items, boards, the dispatcher, Goals, the
Factory itself, per-person privacy inside a Project, and any change to how a Project's
source is admitted or published.

**What it must preserve, and how that is checked.** The acting account's access to the
Project, the Project's current source, and the last good Preview, each unchanged by
switching conversations. Isolation between Projects stays refused by `resourceId`, with
Conexus still deciding which `resourceId` a request may act under.

**Its shape follows the recommendation in section 5**, which is B. The conversation
authority is a native `AgentController`, the Factory is not installed, and the increment
adds no Conexus-owned conversation store. The migration from today's one derived thread per
Project is part of the increment and is what replaces
[`threadIdForProject()`](../../../apps/hub/src/builder/module.ts).

**Done means.** A person opens two conversations in one Project, switches between them,
restarts the Hub, and finds both with their messages. No Work exists in the product.
