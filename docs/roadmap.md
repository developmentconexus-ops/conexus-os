# Conexus OS roadmap

This file owns current status and the next action. Read it before anything else.

## What Conexus is

Conexus is the platform the people at this company log in to. They sign in, open a
Workspace, open a Project, and talk to the Builder. The Builder writes the code for
a small business application and serves it back as a Preview they can use.

The first base is the Builder running on the Mastra Agent Controller. It has to work.
Everything after it arrives one planned step at a time. The legacy base tried to do
everything at once and is being removed for that reason.

On 2026-09-20 the operator approved where this is going: a Project is one publishable
product, it offers several persistent conversations rather than one Builder chat, and
source admission, artifact health and publication become three separate gates.
[Section 12 of the product contract](product/contract.md#12-approved-destination) owns
that destination and [C-021](decisions/index.md) registers it. None of it is built.
Integrations, Brain, automations and publication are named there as direction, not as
work in progress.

## What exists and works today

The foundation closed on 2026-09-19.

- Multiple accounts. A second person can be invited, sign in through Keycloak and
  join a Workspace. The Hub reads `email_verified` from the validated ID token and
  accepts only the boolean `true`.
- Model connections that are provider-neutral. A connection carries a provider id
  and a credential kind. Both an account sign-in and a pasted API key are accepted
  credential kinds. Model selection stays Mastra-native; Conexus adds credential
  custody and sign-in, not a model abstraction of its own.
- Roles by capability. The Hub connects to PostgreSQL as roles named for what they
  may do. `docs/reference/hub-database-roles.md` is the register.
- One database baseline. `apps/hub/migrations/0001_baseline.sql` is the whole
  schema history. A role change costs one migration.
- The pilot is adopted and clean. It holds one account, one Workspace, 22 Projects
  and 23 BuilderRuns.

Project Inception, the Project Baseline, the Brain, connection bindings, Sankhya,
the capability gateway, the Managed Application Runtime and the R3 program were
removed from the product on 2026-09-19. They are not paused. They return only as
future features on this base, with their own plan, if they are ever wanted.

Trunk is `analysis/internal-mvp-2026-09-12`, not `main`.

## In flight

**Documentary consolidation of the approved product amendment.** Open for review, not
merged. It carries C-021 into the owners that hold each rule, reconciles the Builder
reference with the pipeline the code actually runs, and prepares the next task without
executing it. It changes no code, no migration, no contract schema and no check.

M-02, the ChatGPT account sign-in, was proven live on 2026-09-20: OpenAI accepted the
loopback redirect from a request the Hub originated, the token exchange, Conexus's own
`originator`, and a request without the `OpenAI-Beta` header, and a BuilderRun paid for by a ChatGPT
account succeeded, editing source and reaching a Preview. The backend publishes what an account may
run at `/backend-api/codex/models`, and that catalog is what the Builder offers for a ChatGPT
connection, under the backend's own names; a short list on the `openai-codex` row of
`apps/hub/src/model-connection/oauth-provider-registry.ts` stands in only when the catalog cannot be
read. Both the catalog and the models are gated on the version the client declares: with no
`version` header the catalog's own `gpt-5.6-sol` and `gpt-5.6-luna` were refused as "not supported
when using Codex with a ChatGPT account" while `gpt-5.6-terra` answered, and with one all five
listed models answered. Ids outside the catalog, `gpt-5.3-codex` included, are refused. A refusal is
written to the Hub log as `OPENAI_CODEX_REFUSED`. Unproven still: one real refresh-token rotation, and whether the 8 MiB
response cap survives a long reasoning stream. This remains undocumented and unendorsed by OpenAI: a
refusal ends it and is not worked around.

Two corrections to the Builder are open as pull requests and are not part of this
consolidation. They do not advance the trunk this branch is based on.

## The Builder sequence

This is the order. Each step is one unit of work that ends in something a person
can see. `docs/tasks/builder-repair-program.md` holds the file boundaries, the
build steps and the evidence each one owes.

1. **Prove the Builder live on the pilot.** Done on 2026-09-19. A real request in a pilot Project
   reached a working Preview, with the model, the Thread and the native trace from that same run.
   The same sitting proved the ChatGPT sign-in against OpenAI. It also found that no run can use that
   connection yet: the deployment model catalog required Mastra's provider key `openai`, while
   `model_connection.admit_for_project` matches the connection's `provider_id` `openai-codex`
   literally, and nothing mapped one to the other. The catalog is gone: the Builder offers the
   models each connected credential actually pays for, and admission compares the connection's own
   provider id on both sides.
2. **Keep a failed request visible and named.** Today a run that fails before the
   agent starts loses the operator's own words, because the request text lives only
   in a Mastra message written after the failure point, and the optimistic bubble is
   gated on the run being active. Persist the request on the run, render it when no
   Mastra message exists, and map the internal failure codes onto a small public set
   that reads distinctly. This is P-02 in the repair program.
3. **Move the Builder conversation to Mastra-native.** Done. The Hub mounts Mastra's own Agent
   Controller session routes under `/api/mastra` through `@mastra/fastify`, behind the Hub session,
   CSRF and `project.build`. The browser follows a run's session with `@mastra/client-js` and renders
   native message parts with the `@mastra/playground-ui` chat components: text that grows as it
   arrives, reasoning, and every tool call with its arguments, output and edit diff. The Conexus live
   projection, its SSE route and the hand-written parser are deleted. The run still owns the turn,
   because a sandbox must exist before the agent acts, so the browser cannot create a session or send
   the opening message through Mastra's routes.
4. **Let Mastra own model choice.** Done. The deployment model catalog file, its two environment
   variables and the boot-time sentinel model are deleted. Providers and models come from Mastra's
   provider registry. What stays Conexus's is custody and who may use which connection, plus one
   table that says which registry provider a credential pays for: an API key pays for the provider
   it was filed under, a Claude account pays for `anthropic`, a ChatGPT account pays for the `openai`
   ids its backend answers for. The Builder offers only the models of connections the account may
   use in that Project, and Settings lists every provider a key can be filed under beside the two
   account sign-ins. Settings is a tabbed page built with the same Mastra components as the chat.
   Mastra's model gateways were considered for custody and do not fit: `resolveAuth` receives no
   account, and the Hub serves many.

P-02 through P-06 of the repair program are delivered and merged. A failed request
stays on screen with a named reason and an internal code never reaches the browser
(P-02). The Preview states only what the browser observed, a grant and then a frame that
navigated, and never that the application loaded (P-03). A past run is selectable and
drives Details, Diff and the trace, a send whose outcome is unknown keeps its
idempotency key, and a retried diagnostic collapses onto one message (P-04). P-05 was
overtaken: the deployment model catalog and its pinned constants had already gone with
Mastra-native model choice, and what remained of it, naming the connection that pays for
the next request, shipped with P-04. The compile now serves the built artifact inside
the agent's sandbox and drives headless Chromium at it, so an application that compiles
and then throws on boot fails the build instead of reaching the Preview as a blank frame
(P-06).

Alongside them the run pipeline was reduced from six out-of-process boundaries to three.
The source bundle is exported while the sandbox is created, one E2B template carries both
the agent and the compiler, and the agent's own sandbox compiles what it wrote, so the
second sandbox and two of the four git container starts are gone. A measured BUILD on the
pilot fell from about 153 seconds to 69 at its best. That work is described where it
belongs, in [the C-020 reference](reference/builder-c020-mastra-native.md); its plan file
was never committed and is not being revived.

## Exact next action

**Qualify the native composition for Project conversations and delegated Work.**
[`docs/tasks/sessions-work-qualification.md`](tasks/sessions-work-qualification.md) owns
it. It is prepared and not started. It answers which native composition serves several
persistent conversations in one Project and allows delegated Work with the least Conexus
logic, while preserving authorization and the product's effects. It is a qualification:
it ends in evidence and a recommendation, and it does not authorize a migration.

It starts once this consolidation is merged. Nothing before it is blocking.

## Later layers

[Section 12 of the product contract](product/contract.md#12-approved-destination) owns
what each of these means and what it may not become. None has a plan and none is
started, and none may be built ahead of the increment that delivers it.

- A data and SDK layer so a generated application can own business data.
- Publication of a built application, with a Release and an explicit authorized act.
- External integrations reaching a Project as authorized capabilities, which is where
  Sankhya arrives.
- Automations as persistent Project resources.
- Brain as governed Workspace and Project knowledge.

## What the operator still owes

Two things, and nothing else.

1. A Hub sign-in on the pilot, for every live lane. The session idles out after
   thirty minutes without a request.
2. A second Keycloak user with a verified email address, to prove multi-account
   end to end outside CI. Nothing is emailed, and an unverified address is refused.

## The merge gate

A pull request is ready to merge when CI's `verify` check is green on its exact head
SHA and the coordinator has read the diff. There is no independent verifier agent per
pull request. A unit that changes behaviour ships the test that would fail without it.

Never run `npm run verify` locally. Run the focused checks your change touches, push,
and let CI be the full run. Confirm the run's head SHA equals yours; GitHub skips the
workflow without saying so when a pull request conflicts with its base.

## Acceptance

Acceptance requires real application interaction, with the source, model, Thread and
native trace evidence from that same execution. A green unit suite, a model label, an
issued Preview grant or a generated artifact is not sufficient on its own. Do not mark
the product accepted while a deciding live path is blocked.
