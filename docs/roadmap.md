# Conexus OS roadmap

This file owns current status and the next action. Read it before anything else.

## What Conexus is

Conexus is the platform the people at this company log in to. They sign in, open a
Workspace, open a Project, and talk to the Builder. The Builder writes the code for
a small business application and serves it back as a Preview they can use.

Integrations are future work. One day somebody will connect Sankhya and build an
application on top of it. That is not what is being built now.

The first base is the Builder running on the Mastra Agent Controller. It has to work.
Everything after it arrives one planned step at a time. The legacy base tried to do
everything at once and is being removed for that reason.

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

Nothing. M-02, the ChatGPT account sign-in, was proven live on 2026-09-20: OpenAI accepted the
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

The repair program's P-03 through P-06 sit behind those four. P-03 stops the UI
claiming the Preview loaded when all it observed was a grant. P-04 makes a past run
selectable and a retry idempotent. P-05 settles which authorized connection and
model a run uses. P-06 makes the compile answer whether the artifact boots.

## Exact next action

**Stop claiming the Preview loaded (P-03).** Steps 2 and 3 are done. A failed request stays
on screen with a named reason, and the Builder run pipeline now crosses three out-of-process
boundaries instead of six, which `docs/tasks/builder-throughput-program.md` records.

## Later layers

One line each. None of these has a plan, and none is started.

- A data and SDK layer so a generated application can own business data.
- Local publication of a built application.
- External integrations, which is where Sankhya arrives.
- Managed automations and scheduled jobs.

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
