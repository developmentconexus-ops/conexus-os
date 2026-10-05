# Architecture

How Conexus is composed: the parts, who owns each concept, which way dependencies point and where
code may run. Owners next door: [product](../product/contract.md) for what the parts are for,
[database](database.md) for how PostgreSQL enforces what this file assigns,
[security](security-and-authority.md) for who may act, [API](../product/wire-contract.md) for the
wire, [code](../development/codebase-principles.md) for how a module is written. Mastra evidence is
in [the Mastra reference](mastra/index.md); reasons are in the [decision register](../decisions/index.md).

## System map

| Plane | Part | Job |
| --- | --- | --- |
| Control | Hub (`apps/hub`, Fastify) | Every product API, the Builder, admission, the job executor and the reaper |
| Control | Web app (`apps/web`) | The screens; calls the Hub through `apps/web/src/app/http.ts` only |
| Control | Hub PostgreSQL | Conexus schemas and Mastra storage, in one cluster |
| Control | Conexus Git | One repository per Project on the Hub; its `main` is the admitted revision |
| Control | Keycloak | The only sign-in door; it authenticates and grants nothing |
| Control | E2B | One sandbox per Builder conversation, where the agent edits and checks |
| Data | Application runner and workers | Run generated handlers and Project migrations |
| Data | Applications PostgreSQL | `conexus_apps`, one schema per Project and environment, bounded storage |

The two PostgreSQL clusters are independent; exhausting the Applications cluster never takes down
the control plane. No database, server or container exists per Project.

## One owner per concept

Each concept has one owner. The other side holds a link to the owner's record, never a copy.
Enforced by review.

| Concept | Owner | Others hold |
| --- | --- | --- |
| Sign-in | Keycloak (C-015) | An `iam.account` keyed by issuer and subject |
| Account, Workspace, membership, installation administrator | Conexus IAM (C-026) | The account id |
| Conversation and its messages | A Mastra thread; one Mastra resource per person in a Project (C-036) | Nothing: no Conexus conversation store |
| The live turn | The Mastra session stream, served by Mastra's session routes under `/api/mastra` behind Conexus access | No Conexus live projection |
| A Builder run | Conexus: one state machine with a generated vocabulary (spec 0011) | Mastra holds the agent's steps |
| Current source | `main` in Conexus Git, moved only by the Hub's fast forward from the run's base (C-032) | Runs and sandboxes hold a branch mirror |
| Usable artifact and Preview | The Project's working state and the registry (C-020) | Publish alone selects what employees receive (C-028) |
| Model accounts | Conexus, one per person and provider, sealed, shared with "just me" or everyone (C-032) | Model calls run in the Hub; the sandbox holds no secret |
| Generated application profile | Conexus (C-028, app stack v2 in C-033); source bytes in Project Git | The Builder edits only the admitted profile |
| Project application data | Conexus allocates it; the Project repository owns its migrations | The runner holds a per-Project role |
| Integrators, Connections, bindings | Conexus (C-029, C-030); every call recorded | Handlers and the Builder reach a Connection only through the Hub executor |
| Periodic work and expiry | One job executor; `iam.reap_expired` (spec 0013) | No other timer |
| Diagnostic traces | Mastra observability | Never source, settlement or Preview authority |

## Native first

Mastra, PostgreSQL, Keycloak and E2B do what they already do. A Conexus mechanism (a table, SQL
function, module, cookie, provider setting or exported helper) enters only with a named requirement,
the native API and version read at the head, the limitation proven, and a smaller configuration or
composition rejected for a stated reason. A gap never authorizes a fork or a parallel engine; it
goes back to the spec. Owning a business rule does not oblige Conexus to own the engine that runs it.

- Binding to a native id is allowed. Mirroring a framework's messages, states or lifecycles, or a
  wrapper whose purpose is to hide it, is not. No state beside state Mastra already holds.
- Conexus never forks, patches or reaches into Mastra internals, writes Mastra tables or replaces a
  method on a Mastra object; the extension point is a documented subclass or option. The one
  exception is `apps/hub/src/builder/mastra-leftovers.ts`, until mastra-ai/mastra#25903; every
  crossing has its evidence and removal trigger in [the Mastra boundary](mastra/boundary.md).
- Identity that reaches Mastra code travels in the `RequestContext` keys the server sets, never in
  agent or tool input. A provider setting that forces compensating code (locks, retries, polling)
  names the requirement it serves, or both go. One model per concept: session, handoff, invitation,
  caller, Origin check, opaque token.

Enforced by: the native census the reviewer redoes at the head, one row per mechanism with its
source and KEEP, REPLACE or SIMPLIFY; `mastraInternalsOutsideLeftovers` at 0 in
`scripts/census-builder-run.mjs`; review.

## Layers

Platform code (`apps/hub/src/platform`) imports no application layer, and the composition root
imports only what the import law allowlists. Enforced by `scripts/check-import-law.mjs`.

## Where code runs

Generated code never runs in the Hub process. The Builder's agent runs in its E2B sandbox; generated
handlers and Project migrations run in the application runner, each in a fresh rootless bubblewrap
worker with no network, no host files, no credential and bounded time, memory and output, reaching
only its own Project's role through a per-invocation relay. Each escape names the layer that blocks
it. The Builder never receives a Hub, Connector or production credential; bootstrap, secret custody,
role provisioning, ingress and Connector execution are platform code, never generated code.
Enforced by the runner sandbox tests and review.

## Generated applications

A generated application is ordinary source in its Project repository: the browser app under
`app/`, server handlers under `conexus/handlers/`, forward SQL under `conexus/migrations/` and the
contract `conexus/manifest.json`, on the fixed stack of C-033 pinned in
`apps/hub/compiler-template/package.json`. An app imports only that stack and calls its server
through the client generated from its manifest. Regeneration never overwrites source the app owns.
Enforced by the Hub's application check and `apps/hub/compiler-template/allowlist.mjs`.

## The Builder

The Builder is a Conexus harness on Mastra's engine: an `AgentController` over `createCodingAgent`
with a Conexus prompt, one `build` mode and planning skills (C-032, spec 0004). A conversation owns
one Mastra session, one E2B sandbox and one branch mirror across its turns; an idle sweep releases
them. The agent's "done" is one checked verdict on the candidate, and a red check goes back to the
agent in the same run. Admission runs the Hub's check bundle (spec 0012) and never executes a file
from the candidate. Cancelling records intent before it signals the run; a pending cancellation
prevents a later success, and a settled run is never rewritten. A reconnect reads the thread, the
run, the source and the Preview from their owners, so a missed live event is never lost state.
Enforced by the run's tests and review.

## The web app

The web app projects what the Hub says. It owns no business lifecycle, authorization decision,
parallel schema or mirror of business entities; its cache and preferences are never server truth.
A hard screen never justifies a screen-shaped endpoint, and a missing endpoint never justifies
dropping a need the person has: it goes to the owner as a finding. Review.

## Dependencies

A dependency or framework enters only with a current consumer, a named limitation, the exact API
and version examined, a falsifiable probe and evidence against a credible alternative; an existing
dependency wins when sufficient. A pinned dev-only check tool is exempt. The roadmap's
[technology baseline](../roadmap.md#technology-baseline) lists what is in and what waits.
Enforced by review.
