# Mastra boundary

Conexus uses the Mastra Factory, Mastra Code, Mastra core and Mastra memory as they ship. Mastra owns
what Mastra owns. Conexus never forks, patches or reaches into Mastra internals, and it never writes
Mastra tables or replaces a method on a Mastra object. This page records, for each place where the Hub
crossed that line, what the installed Mastra offers and what Conexus does instead.

Each item ends in one decision.

- **A.** A public Mastra API exists. Conexus uses it.
- **B.** No public API exists. The item becomes an upstream proposal for `mastra-ai/mastra`. Conexus
  keeps the smallest honest seam, with a comment that names the proposal, or drops the feature.

The installed versions are `@mastra/factory` 0.15.0, `@mastra/code-sdk` 1.7.2, `@mastra/core` 1.67.0
and `@mastra/memory` 1.30.0. Mastra paths below are relative to `node_modules/@mastra/`. Conexus paths
are relative to the repository root, at trunk `29e0f747`.

`@mastra/factory` exports every file under `dist/` through its `./*` export, so an import path alone
does not make something public. Here a surface counts as public when Mastra documents it for hosts: a
type in a declared contract, a method whose doc comment invites hosts to call or override it, or an
embedded doc page.

## Summary

| # | Item | Decision | Status |
| --- | --- | --- | --- |
| 1 | Moving repositories to a new GitHub App installation | A | Implemented |
| 2 | Keeping GitHub tokens out of the sandbox | A | Implemented |
| 3 | Serving the Factory's credential routes | A, after a decision amendment | Planned, needs the operator |
| 4 | Creating a conversation | A for creation, B for visibility | Planned, needs item 3 and a visibility decision |
| 5 | Conversation titles in Portuguese | B for the title Mastra writes, A for the one Conexus shows | Implemented |
| 6a | Classifying model errors | A, plus B for one message | Implemented |
| 6b | Writing run diagnostics into a conversation | A, experimental API | Planned |

## 1. Moving repositories to a new GitHub App installation

**Current code.** `apps/hub/src/builder/factory-provisioning.ts:43-54` defines `reattachRepository`.
It writes the Factory tables `source_control_repositories`, `factory_project_repositories` and
`factory_project_source_control_connections` directly, in its own transaction.
`connectFactoryInstallation` calls it at line 192, and `boundRepository` calls it on every provision
at line 262.

**Why Conexus needs it.** The operator can uninstall and reinstall the GitHub App on the same
organization. GitHub then gives the organization a new installation id. `connectFactoryInstallation`
records the new installation and removes the old one, and every repository row of the old
installation must move to the new one, because the Project's binding names the repository row by id.
The need is real. The two extra cases `reattachRepository` handles are not.

- A repository row whose installation is already gone. Only the Factory's `GET /web/github/repos`
  route prunes an installation (`factory/dist/integrations/github/routes.js:377`), and the Hub does not
  mount it. In Conexus only `connectFactoryInstallation` removes an installation, so it can move the
  rows first.
- A second row for the same GitHub repository under the new installation. No Conexus path writes one:
  a Project is provisioned only while exactly one installation is recorded.

**What Mastra offers.** `SourceControlStorageHandle.repositories.migrateInstallation({ orgId, id,
newInstallationId })` (`factory/dist/storage/domains/source-control/base.d.ts:183`). Its contract
reads "Used when a GitHub App is reinstalled with a new installation ID on the same account." It moves
the repository row and the connections of the old installation
(`factory/dist/storage/domains/source-control/base.js:421`). The Factory's own Platform integration
calls it for the same event (`factory/dist/integrations/platform/github/integration.js:285`). The Hub
reaches the handle through `GithubIntegration.sourceControlStorage`.

**Decision.** A.

**Plan.** `connectFactoryInstallation` calls `migrateInstallation` for each repository of a gone
installation before it removes that installation. When the target already holds a row for the same
repository, `PgFactoryStorage` rejects the move with its unique-constraint error, so `connect` stops
and the old installation and its rows stay. `reattachRepository` and its table writes are deleted,
and provisioning no longer moves rows. A repository row whose installation was removed outside
`connect` is unreachable through the Factory's storage API, and provisioning refuses it with
`FACTORY_REPOSITORY_MISSING`.

## 2. Keeping GitHub tokens out of the sandbox

**Current code.** `apps/hub/src/builder/factory.ts:250-254` assigns a new function to
`integration.versionControl.getRepositoryAccess` on a live `GithubIntegration`. The replacement answers
with the credential `conexus-no-credential`, so the Factory hands the sandbox a credential that opens
nothing on GitHub. The Hub's root git fetches with its own App token and gives the agent a bundle
(`factory.ts:61-105`).

**What Mastra offers.** `GithubIntegration` documents subclassing as its extension point: a custom
integration "can subclass this and override individual methods"
(`factory/dist/integrations/github/integration.d.ts:22`). Its `getRepositoryAccess` gets its token from
`this.mintInstallationToken(installationId)` (`factory/dist/integrations/github/integration.js:195`),
a public method (`integration.d.ts:161`). No other Factory code calls `mintInstallationToken`. Every
Factory reader of a repository credential (the sandbox start, `GH_TOKEN`, token refresh, the commit
helper) goes through `getRepositoryAccess`. The Factory's own GitHub API calls use
`getInstallationOctokit`, which does not call `mintInstallationToken`. The Hub starts no Factory
worker and mounts no Factory GitHub route, so it makes none of those calls.

**Decision.** A.

**Plan.** `ConexusGithubIntegration extends GithubIntegration` and overrides `mintInstallationToken`
to answer `conexus-no-credential`. The assignment to `versionControl.getRepositoryAccess` is deleted.
The behavior the sandbox sees does not change.

**Upgrade check.** The override relies on `mintInstallationToken` having `getRepositoryAccess` as its
only caller. On each Factory upgrade, search the new `dist/` for `mintInstallationToken(` before
bumping. Proposal U4 would replace this check with a named option.

## 3. Serving the Factory's credential routes

**Current code.** `apps/hub/src/builder/model-accounts.ts:49-61` declares a slice of Hono's `Context`.
Lines 112-120 construct the Factory's `ConfigRoutes` and `OAuthRoutes`, find handlers by method and
path, and cast each with `as unknown as FactoryHandler`. Lines 148-165 build a fake context per
request. `apps/hub/src/builder/factory.ts:273` registers the Factory's tenant credential resolver by
hand.

**What Mastra offers.** Two public pieces, which together replace the fake context.

- `MastraFactoryConfig.auth` takes any `IMastraAuthProvider`
  (`factory/dist/factory.d.ts:49`). With a provider, every Factory route resolves the caller through
  `ensureFactoryAuthUser` (`factory/dist/auth.js:260`), which calls the provider's
  `authenticateToken` with the raw request. So routes work without the Factory's Hono auth gate, which
  a Fastify host cannot run (`server/dist/server/server-adapter/index.d.ts:353`). The Factory then
  registers its tenant credential resolver itself (`factory/dist/factory.js:270`). Administration
  checks go to the provider's organizations capability.
- `prepare()` returns every Factory route as Mastra `apiRoutes` (`factory/dist/factory.js:496`). The
  Hub already runs `MastraServer` from `@mastra/fastify`, whose `registerCustomApiRoutes()`
  (`fastify/dist/index.d.ts:38`) registers them as Fastify routes. A scope `preHandler` can allow only
  the credential routes, the way `mastra-session-routes.ts` allows only its browser routes.

**Decision.** A, but it amends a recorded decision. The single-owner map states that the Factory runs
with `auth: null` behind the Hub. A Hub-session provider is not a second sign-in door. It validates
the existing Hub session and has no login, callback or credential capability. It still changes the
recorded shape, so the operator amends the identity row before any code changes.

**Plan, after the amendment.**

1. Write a `HubSessionAuthProvider` implementing `IMastraAuthProvider`. `authenticateToken` resolves
   the Hub session from the request and answers `{ id: accountId, organizationId: orgId }`. The
   organizations capability answers administrator from `isInstallationAdministrator`.
2. Pass it as `MastraFactory({ auth })`. Delete the manual `registerTenantCredentialResolver` call,
   `NO_TENANT`, and the `local` custom-provider organization, which becomes the installation's
   organization id.
3. Mount the Factory's credential routes through `server.registerCustomApiRoutes()` in the guarded
   Fastify scope, allowing only the `/web/config/providers*` and `/web/config/models` routes. Delete
   the fake context, the handler lookup and the casts. The Conexus-only routes (sharing, Google AI Pro,
   model defaults, memory model) stay as Hub routes.
4. Verify on the pilot. A person connects a provider, the installation administrator shares it, and a
   run uses it.

## 4. Creating a conversation

**Current code.** `apps/hub/src/builder/factory-routes.ts:94-128` repeats the Factory's session route.
It carries its own DTO, branch name (`conexus/<id>`), idempotency on a client-chosen id, and storage
write. It writes `visibility: 'org'` at line 124.

**What Mastra offers.** The Factory's `POST /web/github/projects/:id/sessions`
(`factory/dist/integrations/github/routes.js:897`) accepts `sessionId`, `title`, `branch` and
`baseBranch`. It normalizes the title and handles a retried id. It needs a signed-in Factory tenant,
which the Hub can provide only after item 3. It writes `visibility: "org"` itself (`routes.js:948`) and
accepts no visibility. The storage handle's `sessions.create` does accept one
(`factory/dist/storage/domains/source-control/base.d.ts:132`), and the Slack integration sets it
(`factory/dist/integrations/slack/slack.js:213`).

**Decision.** A for creation, after item 3. B for visibility (proposal U3). Conversation visibility is
a Conexus Project policy whose default is still open in the decision register. No value derived from a
decided policy exists yet, so no code change can make the field follow the single-owner map today.

**Plan.**

1. The operator decides the visibility default and its transitions.
2. After item 3, the Hub creates a conversation by calling the Factory's session route with the
   conversation id, the Conexus branch and the title. The Hub's DTO, idempotency code and storage write
   are deleted.
3. Until U3 lands, the Factory decides visibility. Conexus enforces Project authority on every read, as
   it does today. When U3 lands, the Hub passes the value its policy derives.

## 5. Conversation titles in Portuguese

**Current code.** The conversation list shows the Factory session row's title
(`apps/hub/src/builder/factory-routes.ts`). #176 renamed the thread from the first request before the
run's first turn.

**What happened on the pilot.** On 2026-09-22 the request "Troque o texto em destaque no topo da
página para LIVE-MUCS7P6I" produced the title "Page text update". The thread's metadata holds
`mastra.om.threadTitle = "Page text update"`, and the thread and session row were both written at
14:43:15, five seconds after the run's last message and two minutes after the request. That is
Mastra Code's observer, not first-turn title generation.

**What Mastra does.** Mastra Code turns on the observer's thread titles unconditionally
(`code-sdk/dist/agents/memory.js:150`, `threadTitle: true`). The observer's title guidance is
English noun phrases with English examples and no language rule
(`memory/dist/src-Dt8oPiQN.js:23420`). Its prior-title hint reads only its own metadata, not the
thread's title (`memory/dist/src-Dt8oPiQN.js:19244`), so its first observation always proposes a
title. It then overwrites the thread title whenever its suggestion differs
(`memory/dist/src-Dt8oPiQN.js:24598-24624`). The Factory copies that onto the session row
(`factory/dist/session/thread-title-mirror.js:40`). An explicit `Session.thread.rename`, as #176 did,
is overwritten at the first observation.

**What Mastra offers.** No public option turns the observer's titles off or gives them instructions.
Mastra Code builds its own `Memory`, and neither `generateTitle.instructions` nor
`observation.threadTitle` is reachable from the host. The first request itself is public: the
controller's `queryThreadMessages` reads a thread's messages without starting a session or sandbox
(`core/dist/agent-controller/agent-controller.d.ts:269`).

**Decision.** B for the title Mastra writes (proposal U2). The thread title and the session row title
belong to Mastra, and Conexus stops reading them. A for the fact Conexus shows: the title is derived
from the first request, which the message store already owns, so Conexus stores no second copy.

**Plan, implemented.** The conversation list and the create route read each conversation's first
user-authored message through `controller.queryThreadMessages` and answer its first line, whitespace
collapsed, cut to 60 characters on a word. A conversation with no request yet has no title. The
rename before the first turn is deleted, and the create route no longer takes a title.

## 6a. Classifying model errors

**Current code.** `apps/hub/src/builder/runtime.ts:44-60` classifies errors by message text: a regular
expression for rate limits, and another for Mastra Code's missing-credential message.

**What Mastra offers.** Mastra Code names the error hosts match on:
`ProviderAuthRequiredError`, whose `name` is documented as wire-stable so "hosts match on this"
(`code-sdk/dist/auth/provider-auth-error.d.ts:1`). Its `parseError` returns a typed `ErrorType` of
`rate_limit`, `auth` and others (`code-sdk/dist/utils/errors.d.ts:22`), and treats that name as `auth`
(`code-sdk/dist/utils/errors.js:56`). The missing-credential failure, though, throws a plain `Error`
(`code-sdk/dist/agents/model.js:86`), so no typed signal carries it.

**Decision.** A for classification through `parseError`. B for the missing-credential throw
(proposal U1).

**Plan.** `runtime.ts` maps `parseError(error).type` to the Builder's codes: `rate_limit` to
`BUILDER_MODEL_RATE_LIMITED`, `auth` to `BUILDER_MODEL_AUTH_FAILED`, anything else to
`BUILDER_MODEL_STREAM_FAILED`. The missing-credential message check stays as the one text seam, with a
comment that names U1, until Mastra Code throws `ProviderAuthRequiredError` there.

## 6b. Writing run diagnostics into a conversation

**Current code.** `apps/hub/src/builder/module.ts:108-119` builds a message by hand (`format: 2`, role
`assistant`, a hashed id) and saves it with the memory storage domain's `saveMessages`, bypassing the
agent controller and its event stream.

**What Mastra offers.** Core documents signals as the way to add system context to a thread: "Use
`sendSignal()` for lower-level system context, such as background task notifications"
(`core/dist/docs/references/docs-harness-signals.md:13`). `Session.sendSignalToThread` persists a
signal to a named thread without switching the session's thread
(`core/dist/agent-controller/session.d.ts:1279`). The next turn's model reads it as context, and live
subscribers receive it as an event. Signals are marked experimental
(`core/dist/agent/signals.d.ts:4`).

**Decision.** A.

**Plan.** In its own change, because it changes what the person sees and needs a pilot check. The run
that produced the note sends it with `sendSignalToThread` as a `notification` signal, persisted
without waking the agent. The web conversation renders notification signals as run notes. The hand-built
message and the storage write are deleted. Retries rely on the signal id. Until then, the storage write
stays.

## Upstream proposals

These are drafts for issues on `mastra-ai/mastra`. Each names the installed version it was checked
against.

### U1. Throw `ProviderAuthRequiredError` when no credential is configured

**Package.** `@mastra/code-sdk` 1.7.2, `dist/agents/model.js:86`.

When a signed-in Factory account has no usable credential for the selected model's provider,
`resolveModel` throws a plain `Error` with the message "No usable <provider> credential is configured
for this signed-in Factory account". Mastra Code already defines `ProviderAuthRequiredError` for a
missing or unusable provider credential and documents its `name` as the wire-stable value hosts match
on. `parseError` maps that name to `auth`. The plain `Error` falls through to `unknown`, so a host can
only recognize this failure by its message text.

Proposal: throw `ProviderAuthRequiredError` at this site, with the same message. Hosts and `parseError`
then classify it as `auth` with no text matching.

### U2. Let hosts give title instructions, and name the language by default

**Packages.** `@mastra/core` 1.67.0 and `@mastra/code-sdk` 1.7.2.

Core's default title instructions (`resolveTitleInstructions`) do not say which language to use, so a
conversation in Portuguese often gets an English title. Mastra Code builds its `Memory` internally with
`generateTitle: { model }` and turns on `observationalMemory.observation.threadTitle`, and it exposes
neither `generateTitle.instructions` nor an observer title instruction. A host serving non-English
users cannot fix the language without replacing Mastra Code's memory.

Proposal, two parts.

1. Core and memory: add "write the title in the language of the user's messages" to the default title
   instructions, and to the observer's `thread-title` guidance.
2. Mastra Code: accept title instructions from the host, for example a `titleInstructions` option or a
   setting that Mastra Code passes to both `generateTitle.instructions` and the observer, and let the
   host turn `observation.threadTitle` off.
3. Memory: the observer overwrites a title the host set with `Session.thread.rename`, because its
   prior-title hint reads only its own metadata (`memory` 1.30.0, `dist/src-Dt8oPiQN.js:19244`) and it
   replaces any differing title (`dist/src-Dt8oPiQN.js:24598`). Seed the hint from the thread's title,
   and leave a title set by an explicit rename alone.

### U3. Accept `visibility` when a host creates a Factory session

**Package.** `@mastra/factory` 0.15.0.

`POST /web/github/projects/:id/sessions` (`dist/integrations/github/routes.js:897`) and
`ensureFactorySourceSession` (`dist/session/factory-session.js:135`) always write `visibility: "org"`.
The storage contract accepts `'org' | 'private'`, and the Slack integration already chooses per thread.
A host that owns its own visibility policy must either accept `org` for every session or write the
session row itself, which duplicates the route.

Proposal: accept an optional `visibility` of `'org' | 'private'` in the route's body, defaulting to
`org`. Include it in the id-conflict comparison, so a retry that asks for a different visibility is
answered with 409.

### U4. A named option for the sandbox repository credential

**Package.** `@mastra/factory` 0.15.0.

A host that keeps GitHub tokens out of the agent's sandbox (and fetches source with its own
credential) must override `GithubIntegration.mintInstallationToken`. The override is correct today only
because `getRepositoryAccess` is that method's only caller, and a future caller that needs a real
installation token would silently receive the host's placeholder.

Proposal: a `GithubIntegrationConfig` option, for example `repositoryAccess?: (input: { orgId;
repositoryId; defaultAccess }) => Promise<RepositoryAccess>`, which the integration's
`getRepositoryAccess` calls when it is set. `mintInstallationToken` then keeps meaning "a real
installation token".
