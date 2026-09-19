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

M-02, ChatGPT account sign-in, on branch `feat/m02-chatgpt-sign-in`. It adds a second
account sign-in beside the Anthropic one, so a member can spend a ChatGPT subscription
on a BuilderRun without holding an API key. The sign-in had been written for one
provider and said so in thirteen places; those are now fields on a per-provider OAuth
descriptor, and Anthropic and `openai-codex` are two rows in a registry. Custody needed
no schema change: `provider_id` already accepts the name and `credential_kind` already
admits `OAUTH_TOKEN_SET`.

Two things in it are worth knowing. The registered redirect is a loopback port on the
user's own machine, which the Hub cannot listen on, so the user authorizes in the
browser, lands on a page that does not load, and pastes that URL back; the settings page
says so before it opens the tab. And OpenAI's refresh token rotates, which custody's
compare-and-swap alone does not handle, because it decides who won only after both
writers have already called the token endpoint. Refresh is therefore serialized per
connection on a Postgres advisory lock, held across the call, and a test drives two
refreshes concurrently against a token endpoint that refuses a reused refresh token.

What the study settled: the client id, both endpoints, the scope string, the PKCE and
authorize parameters, the form-encoded token bodies, the rotation, the `chatgpt_account_id`
claim, and the inference endpoint with its headers and required body fields. Conexus
sends its own `originator`, `conexus-os`, rather than borrowing the Codex CLI's, so a
refusal aimed at this caller is possible and would be the answer.

What remains unproven, because no ChatGPT credential is available and no live call was
made: whether the authorize endpoint accepts that loopback redirect from a request a
server originated, whether `OpenAI-Beta: responses=experimental` is required, whether the
`instructions` content is policed, which model ids the backend actually accepts, whether
the 8 MiB response cap survives a long reasoning stream, and whether OpenAI tolerates a
third-party `originator` on this client id. The pull request lists the operator steps that
would settle each. This remains undocumented and unendorsed by OpenAI: a refusal ends it
and is not worked around.

Model selection stays Mastra-native. The catalog names the model and the connection names
the credential, so a Codex entry is `providerKey: "openai"` with a model id Mastra's
registry lists, while the connection stays `provider_id: "openai-codex"` so an account can
hold a selected subscription and a selected API key at the same time.

Removal of the one-time baseline-adoption code, on branch `chore/remove-baseline-adoption`.
The pilot is adopted, so the adoption path has no remaining caller.

## The Builder sequence

This is the order. Each step is one unit of work that ends in something a person
can see. `docs/tasks/builder-repair-program.md` holds the file boundaries, the
build steps and the evidence each one owes.

1. **Prove the Builder live on the pilot.** Start the Hub against the pilot
   database, sign in, open a Project's Build surface, send a request, and watch a
   real run reach a working Preview. CI already proves the unit behaviour at every
   commit. What CI cannot reach is the operator's pilot database, a running Hub and
   a browser holding a real session. This needs the operator's Hub sign-in.
2. **Keep a failed request visible and named.** Today a run that fails before the
   agent starts loses the operator's own words, because the request text lives only
   in a Mastra message written after the failure point, and the optimistic bubble is
   gated on the run being active. Persist the request on the run, render it when no
   Mastra message exists, and map the internal failure codes onto a small public set
   that reads distinctly. This is P-02 in the repair program.
3. **Move the Builder front end to Mastra-native.** The server already reads live
   state from `Session.displayState` and publishes a safe projection. The browser
   still carries a hand-written SSE transport and parser in
   `apps/web/src/features/builder/observation.ts`, and the repository does not depend
   on `@mastra/client-js`. Adopting the native client removes that parallel
   transport. This step has no plan yet. Write one before the first edit.

The repair program's P-03 through P-06 sit behind those three. P-03 stops the UI
claiming the Preview loaded when all it observed was a grant. P-04 makes a past run
selectable and a retry idempotent. P-05 settles which authorized connection and
model a run uses. P-06 makes the compile answer whether the artifact boots.

## Exact next action

**Prove the Builder live on the pilot: start the Hub, sign in, send one request in a Project and watch it reach a working Preview.**

## Later layers

One line each. None of these has a plan, and none is started.

- A data and SDK layer so a generated application can own business data.
- Local publication of a built application.
- External integrations, which is where Sankhya arrives.
- Managed automations and scheduled jobs.

## What the operator still owes

Three things, and nothing else.

1. A Hub sign-in on the pilot, for every live lane. The session idles out after
   thirty minutes without a request.
2. A ChatGPT sign-in, to prove M-02 live.
3. A second Keycloak user with a verified email address, to prove multi-account
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
