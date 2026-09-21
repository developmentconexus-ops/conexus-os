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

That is a statement about the framework, not about the product. `SHARED` and `PER_USER` are
approved product requirements in
[contract section 12.3](../../product/contract.md#123-conversations); what stays open is
which is the default and how either is implemented. The framework's silence here is a cost
to price, not a reason to reopen the requirement. Worth noting for that pricing:
`[package]` the Factory's own source-control sessions already carry
`visibility: 'org' | 'private'` (`dist/storage/domains/source-control/base.d.ts:104`) and
its workspace resolver refuses a private session to another user
(`dist/workspace.js:201`), so the shape exists there even though threads themselves are not
scoped per person.

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
  through the repository's normal human review process. Merging there integrates a reviewed
  change into a branch. It is not the product's Publish, which stays a separate, explicitly
  authorized act, and nothing in this report treats the two as the same event.

Against the five properties the task names:

| Property the task requires | Verdict | On what |
| --- | --- | --- |
| Work is bounded and delegable | holds | `[package]` a `WorkItemRow` carries its own stages, history and `sessions` map, so it outlives the conversation that raised it. `[probe]` one was created and moved with no conversation in play at all |
| It produces a reviewed, validated candidate | holds, through a pull request | `[package]` there is a review board and an engine that judges each move. `[probe]` the engine accepted a legal move and rejected three illegal ones on its own. The candidate is a pull request rather than a type named candidate, which the task does not require |
| Applying it is explicit | holds for the Factory's own shape | `[docs]` the merge decision is made through the repository's normal human review process, and `[package]` the Factory exposes `mergePullRequest` rather than merging on completion. That merge integrates a reviewed change; it is not the product's Publish. Whether it maps onto Conexus applying to a Project's source is `[not established]` |
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

### Where this stood before the interactive coding path was traced

The paragraphs below were written when the only Factory path anyone had run was starting
Work. They are kept because the blocker they describe is real, and corrected by section 8,
which traces the different path: a Factory session running its own code tools over a
Project's source. A refusal to start Work does not by itself say what an interactive
session can do.

Starting Work under A is blocked by something specific rather than risky in general. To do it,
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

That reasoning covers starting Work and nothing else. It is not a decision about the first
increment, and section 8 is what settles which composition that increment should use.

## 8. The three paths, traced separately

Section 5 answered one question, starting Work, and let its refusal stand for everything
else. That was wrong. A session doing interactive coding is a different path with different
requirements, and it had never been run. These are the three, each traced to the operation
that touches files.

### Path 1, create and resume a conversation

Works, under both compositions, and costs nothing. `[probe]` the Factory's own controller
opens two conversations for a project with no repository and no sandbox, on a `resourceId`
the host chooses, and the session has no workspace without failing for the lack of one.
`[probe]` on plain `@mastra/core` the same holds across a process restart, with messages and
metadata recovered per conversation.

### Path 2, run code tools on the Project's source

This is the path the product needs, and it splits in two.

**Under the Factory's own wrapper it is blocked, for a reason that is not about Work.**
`[package]` `dist/factory.js:380` fixes the controller's workspace resolver to
`createWorkspaceFactory({ sandbox, sandboxStart, github, projects, workItems })`, and
`MastraFactoryConfig` has no workspace, filesystem or project-path field. Inside that
resolver, `dist/workspace.js:196-197` looks the session up in the GitHub source-control
sessions table and returns `undefined` when there is no row, which leaves the session with
no workspace at all and its tools raising `WorkspaceNotAvailableError`. With a row but no
sandbox callback, `dist/workspace.js:202` throws `GitHub and a sandbox callback are required
to create a Factory session workspace`. On the success path the first operation that touches
files is a `git clone` from `github.com` using a minted installation token
(`dist/workspace.js:415-435`, `dist/integrations/github/sandbox.js:176-186`). A local
sandbox returned from the `sandbox` callback only changes where that clone lands
(`dist/sandbox/workdir.js:26-32`); it does not remove the GitHub rows or the clone.

**Under the composition the Factory itself mounts, it works.** That composition is one
piece of the Factory and not the Factory: `MastraFactory` wraps this mount with its own
storage, auth, routes, workers, boards and GitHub-bound workspace resolver, and everything
proven in this subsection is about the mount alone. `dist/factory.js:64` imports
`prepareAgentControllerMount` from `@mastra/code-sdk`, and that package's
`MastraCodeConfig.workspace` is a documented option,
"Override the workspace. Default: local filesystem + local sandbox based on detected
project". `[probe]` mounting it directly with a host-supplied `Workspace` and storage yields
a controller, a conversation on a host-chosen `resourceId`, and a session that resolves the
host's workspace, with no forge and no source-control row anywhere.

**And the full turn runs through that mount.** `[probe]` with a local stub provider
answering the model calls, a session on the mounted controller sends a message, the model
calls `mastra_workspace_write_file`, the call stops for approval, and `app/counter.js`
changes on disk. Two model calls appear in the stub's own request log.

**The same turn runs on the plain core composition too.** `[probe]` a session sends a message,
the model calls `mastra_workspace_write_file`, the call stops for approval, the approval is
granted, and `app/counter.js` changes on disk from `counter = 0` to `counter = 1`. The
Project's own git sees it as `M app/counter.js` against the revision it started from. The
conversation keeps the turn, a second conversation in the same Project starts empty, and
switching back finds the first one's messages again.

Both runs answer the model calls locally, one with a fixture object and one with a stub HTTP
server, so they are integration proofs of the tool path and say nothing about how a real
model behaves. Both grant the tool approval unconditionally, where the product would have a
person or a policy decide. Nothing here was paid for and nothing left this machine.

### Path 3, start a Work item through the coordinator

Refused, as section 5 established, and for the same GitHub-shaped reason rather than a
different one. `[probe]` `FactoryStartCoordinator.prepare` answers `Factory source control
storage is unavailable`.

### What this changes

The limitation is one thing in one place, not three. Every path that needs the Project's
files goes through the Factory's GitHub-bound source control, and the Factory offers no
supported seam to point that at source the host holds. Nothing about conversations, tools,
boards, transitions or approvals is the obstacle, and none of that has to be rebuilt.

## 9. The minimal integration, and what could disappear

**What the first increment needs, and nothing more.** A controller mounted over the
product's own storage; a workspace resolver over the Project's source, which the Builder
already has as `resolveBuilderWorkspace` in
[`apps/hub/src/builder/runtime.ts`](../../../apps/hub/src/builder/runtime.ts); conversations
created and switched through `SessionThread`; and Conexus deciding which `resourceId` a
request may act under, which is where its authorization already belongs. Tool approval is
native and already emits `tool_approval_required` before a tool touches anything.

**What could disappear, as candidates with a condition.** `threadIdForProject()` in
[`apps/hub/src/builder/module.ts`](../../../apps/hub/src/builder/module.ts), which derives
one conversation per Project, is replaced by real conversations, and the condition is that
existing derived ids stay reachable. If the product later adopts the `@mastra/code-sdk`
mount for the coding surface, its tools, modes and approval flow would replace the Builder's
hand-built agent wiring, and the condition there is a model path that mount accepts, which
is the open question below. Nothing about queueing, cancellation, idempotency or recovery is
a candidate on this evidence.

**The model path through that mount is now proven, with one wart.** Driving a turn needs a
model the mount's own resolver accepts (`dist/agents/model.js:122`, then `resolveModel` at
`:39`), which reaches a provider gateway rather than any model object given in
configuration. `[probe]` a full turn runs once a custom provider is registered: a local HTTP
server answering the OpenAI Chat Completions streaming API takes the two model calls, the
session's tool call stops for approval, and `app/counter.js` changes on disk. The stub's own
log shows both calls, so the model path is observed rather than assumed.

The wart is worth writing down, because it is the kind of thing that costs a day later.
`MastraCodeConfig.settingsPath` is documented as the way to point at a custom settings file,
but it does not reach model resolution: `resolveModel` calls `loadSettings()` with no
argument (`dist/agents/model.js:42`), so `customProviders` always comes from the real global
settings file. `[probe]` registering through `setCustomProvidersSource`, exported from
`dist/agents/custom-provider-source.js` and reachable through the package's `./*` subpath, is
what works. That is a subpath rather than the public barrel, and a host depending on it is
depending on an internal path across versions.

One more thing the probe found. Supplying your own `Workspace` bypasses the mount's own
workspace builder, which is the only place code-sdk renames the tools, so the model sees the
raw `@mastra/core` names such as `mastra_workspace_write_file` rather than `write_file`.
Harmless, and surprising if nobody wrote it down.

## 10. The decision the operator owns

The Factory's Work path is not blocked by a missing feature that a future version might add
by accident. It is blocked because the Factory treats a Project as a repository on a forge,
and Conexus treats a Project as source under its own custody. One of those has to give for
Work to run under the Factory.

- **Keep custody as it is.** Conexus stays the authority over Project source. The
  interactive coding experience is available now, as section 8 shows. The Factory's Work
  engine stays unavailable until it accepts a host source-control implementation, and no
  amount of Conexus code changes that, short of impersonating GitHub, which this
  qualification refuses to do.
- **Put Project source on a real forge.** Work, boards, review and the dispatcher become
  available as they are. That means an external service storing and versioning the Project's
  source, real repositories and installations to keep working, and a review surface that
  lives there. It is a custody and infrastructure decision with a cost, and it is not
  executed here.

An earlier version of this section said that choosing a forge moves publication to someone
else's merge button. That was wrong, and it collapsed four different things that stay
distinct whoever stores the bytes.

- **Storage and versioning** is where the source and its history physically live. A forge
  does that well and decides nothing about the product.
- **A review a Project accepts** is Conexus admitting an exact revision as the Project's
  source. A forge's merge can be the act that produces the revision, but the Project's
  acceptance of it is ours, and no merge grants it.
- **Preview** is whether the artifact built from a revision boots and serves. It is a health
  question, separate from admission, and it fails without touching either.
- **Publish** is making an application available to its audience. It is explicit, separately
  authorized, and nothing about storing source elsewhere delegates it.

So the forge option changes where source lives and where review is conducted. It does not
move admission, Preview or Publish, and the comparison must not be argued as if it did.

Nothing in this qualification requires that decision to be made before the first increment,
because the first increment needs neither Work nor a forge.

## 13. The integrated Factory test, and the one thing it waits on

Sections 8 to 10 tested the mount the Factory wraps. This section is about the whole
`MastraFactory` against a real private repository, which is what decides whether the Factory
can be a Project's development environment rather than a library it borrows from.

### What is already in place

A disposable private repository exists for exactly this,
`developmentconexus-ops/conexus-factory-integration-probe`, seeded with `app/counter.js`
holding `export const counter = 0`, with no workflows, no secrets and no deployment. Its
identity and what is deliberately absent are recorded in
[factory-integration-setup.md](factory-integration-setup.md).

`[probe]` the whole Factory boots with the real `GithubIntegration` class registered: it
refuses partial credentials with `missing required config field(s)`, it refuses to register
that integration without a stable state secret, and with both supplied it mounts its
controller, publishes 87 routes (eight more than without GitHub), starts its reconcile
worker, and shuts down cleanly.

The probe then asks the run path for a repository and is told `Version-control repository
not found`. That is a **local refusal from the Factory's own source-control storage**, which
holds no rows in a scratch database. It is not a GitHub authentication result, and nothing in
that probe reaches github.com. The requirement for a GitHub App rests on the two
configuration refusals above and on reading the package, which is where it should rest.

### The gate, stated exactly

`[package]` the published integration is a GitHub App and only that.
`dist/integrations/github/integration.js:44` lists `appId`, `privateKey`, `clientId`,
`clientSecret` and `slug` as required, and `:245` refuses anything less. The clone, push and
pull-request token is always minted from those through `mintInstallationToken` at `:347`,
against an installation id the App produces. `[package]` a personal access token does not
substitute: `dist/integrations/github/pat.js` feeds `GH_TOKEN` for the `gh` CLI, while
`dist/workspace.js:314` takes the repository token from the installation.

So the `gh` credential that created the probe repository cannot drive the Factory's own
integration, and building an object that merely satisfies the class's shape would test
nothing. This qualification does not do that.

Creating a GitHub App is a browser action. GitHub exposes no API that creates one outright,
and none that installs one. Everything after it is scriptable, including reading the
installation id back with an App JWT and writing the installation, repository, connection,
project-repository and session rows.

### What a person does once, and what happens next

Create a private GitHub App under `developmentconexus-ops`, which is a personal account and
not an organization, generate its private key and client secret, and install it on the
single repository `conexus-factory-integration-probe` with "Only select repositories".
Permissions: repository contents read and write, pull requests read and write, metadata
read, which is what the run path calls. Issues read and write plus the six webhook events
are only for intake, which this test does not need, and nothing needs access beyond that one
repository or any administration permission. The callback URL matters only for the browser
connect flow; `http://localhost:4111/auth/github/callback` is the default.

With those five values in the environment, the rest of the integrated test runs unattended:
the Factory project, the connection and repository rows, an interactive session over the
real repository, a bounded edit through its coding tools, a second conversation and back, a
work item through intake, triage and build, a pull request, a review and an explicit merge
inside that repository, with nothing deployed.

### The verdict for now

**Decision blocked, on one external prerequisite.** Not on a design question, not on a
missing capability, and not on anything Conexus would have to build. Until a GitHub App
exists and is installed on the probe repository, the integrated path cannot be exercised
honestly, and comparing it against the host-owned path would be comparing something measured
against something imagined.

What the gate already tells us, and what the comparison will have to price whichever way it
goes: choosing the Factory for Work means a GitHub App per deployment, repositories on a
forge, and an installation to keep working. That is an operational dependency, not a line of
code, and it is the kind of cost that belongs in the operator's decision in section 10
rather than in an engineer's preference.

## 14. The integrated run, and the verdict

The test in section 13 has now run. The composition was the real `MastraFactory` with the
real `GithubIntegration`, authenticated by a GitHub App on a disposable private repository.
The transcript is [integrated-output.md](integrated-output.md); the harness is
[integrated-factory.mjs](integrated-factory.mjs), which refuses and exits non-zero without
credentials and carries a negative control that must fail.

### What worked end to end

`[probe]` the App minted an installation token, and the Factory cloned the private
repository into a local sandbox at the revision it was created with. A session opened over
that checkout, a turn through the Factory's own session changed `app/counter.js` from
`counter = 0` to `counter = 1`, and git reported the change against the base revision. A
second conversation opened in the same session and stayed empty, and both were listed.
`FactoryStartCoordinator` started a work item bound to its own source session, the engine
accepted its moves through `intake`, `triage`, `planning`, `execute` and `review` on its own
board policy, the branch was pushed with the installation token, a pull request was opened
through the `VersionControl` capability, and a review was recorded on it. Nothing merged and
nothing deployed.

So the answer to the question this qualification was opened for is yes: the Factory can
serve as a Project's development environment, over a repository, with conversations, coding
tools and structured Work in one system.

### What did not work, and what was not tested

The model was a loopback stub, so nothing here speaks to a real model's behaviour or to an
agent driving the lifecycle unattended. The lifecycle moves were requested by the harness
and judged by the Factory; a fully autonomous run would have the dispatcher request them
from the bound agent. The Factory ran the tool without stopping for approval, which is its
default rather than a finding about what it can enforce. Four of the harness's own defects
had to be fixed along the way, each mine rather than the Factory's: a wrong checkout path, a
caller identity missing from the request context, a work session that did not exist, and a
work item created without an arrival stage.

### The operational dependencies the Factory requires

A GitHub App, with its private key and client credentials, created and installed by a human
once per deployment. A forge holding the repository. A storage backend the Factory owns,
carrying both agent state and its app tables. A sandbox provider per session, which was a
local one here. A model provider, which a real deployment must supply. Its own server
surface, 87 routes with the GitHub integration registered, and its background workers,
including a reconcile poller that starts with `finalize()`.

### What would stay Conexus's

Deciding whether an Account may act on a Project, which the Factory does not answer: it
scopes a session to a caller identity the host supplies, and `[probe]` refuses a session
whose caller is missing, but the entitlement behind that identity is ours. Admitting a
revision as a Project's source, which a forge merge does not do. Preview health. Publish,
which nothing in the Factory performs. And the mapping from a Conexus Account and Project
onto the Factory's `orgId` and `factoryProjectId`.

### Verdict

**Factory-centered path confirmed, with the custody decision still the operator's.** The
integrated path works and would let the product stop owning conversations, coding tools,
work items, boards, lifecycle transitions, run binding and the pull-request surface. What it
costs is a forge holding the Project's source and a GitHub App per deployment. That cost is
not a technical blocker, it is a product decision about custody, and section 10 states it
without deciding it.

If that custody decision is no, the host-owned path remains available and is already proven
for conversations and interactive coding; what it gives up is the Work half, which the
Factory only serves over a forge.

### The next increment

Unchanged in what the person sees, and now decidable in how it is built: several
conversations per Project, with no Work and no Goals. Both compositions reach it, and the
custody decision above is what picks between them. The task is
[Several conversations per Project](../../tasks/project-conversations-first-increment.md),
and it remains not started.

## 11. What has no evidence yet

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
- How a real model behaves in either composition. Every turn here was answered locally, by a
  fixture object or by a loopback stub, which is what kept this free.

The owning task also demands four things this report does not yet establish, and they belong
in this list rather than in a footnote.

- That a Project's current source and its last good Preview survive switching conversations.
  `[probe]` the probes never built a Preview, so this is untested in either composition.
- That a reviewed candidate can be identified as an exact revision under Conexus custody.
  `[package]` the Factory identifies one as a pull request on a forge; what plays that part
  when the source is ours is `[not established]`.
- That completing Work publishes nothing. `[package]` nothing in the Factory deploys or
  merges on completion, which is evidence about the package and not about a Conexus
  Publish boundary that does not exist yet.
- That authorization is rechecked at the operation against current membership. `[probe]`
  what travels with a transition is an actor id, and an actor id is not an entitlement. The
  recheck stays a Conexus responsibility in every composition compared here.
- Anything about upstream main beyond its release cadence, and anything about 0.16 alpha.

## 12. First increment, scoped and not started

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

**It waits on two things, and neither is technical.** The integrated Factory test in
section 13 has not run, and no composition has been chosen. That a native composition can
already deliver this increment is a fact about feasibility, not a decision, and shipping it
on that basis would choose the composition by default rather than on evidence.

So this section describes what the increment is, not what it will be built on. Whichever
composition wins, the increment is the same user result, and the parts that differ are named
where they differ: today's one derived conversation per Project,
[`threadIdForProject()`](../../../apps/hub/src/builder/module.ts), is migrated into real
conversations in either case, which is a migration and not a second authority.

**Done means.** A person opens two conversations in one Project, switches between them,
restarts the Hub, and finds both with their messages. No Work exists in the product.
