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
- Models through Mastra Code. [C-022](decisions/index.md) moved model authentication,
  credentials, provider connection and selection to the Factory. The Builder uses
  Mastra Code's own credential store, and the Conexus model connection subsystem is
  deleted.
- Roles by capability. The Hub connects to PostgreSQL as roles named for what they
  may do. `docs/reference/hub-database-roles.md` is the register.
- One database baseline. `apps/hub/migrations/0001_baseline.sql` plus its forward
  migrations is the whole schema history. A role change costs one migration.
- The pilot is adopted and clean. It holds one account, one Workspace, 22 Projects
  and 23 BuilderRuns.

Project Inception, the Project Baseline, the Brain, connection bindings, Sankhya,
the capability gateway, the Managed Application Runtime and the R3 program were
removed from the product on 2026-09-19. They are not paused. They return only as
future features on this base, with their own plan, if they are ever wanted.

Trunk is `analysis/internal-mvp-2026-09-12`, not `main`.

## In flight

**Next: adopt the Factory for real.** [The Factory adoption task](tasks/factory-adoption.md) is the
next structural work. Conversations and native model authentication are done, but the Factory itself
is not installed, and Project source is still under Conexus's own Git custody. C-022 already chose
the Factory and a forge. That task closes the gap between the decision and the runtime, with Project
source in private GitHub repositories, admission kept by Conexus, and the host Git path deleted. The
frontend redesign waits for it.

**Several conversations per Project**, the first cut of Factory-centered development in the
product. [Its task](tasks/project-conversations-first-increment.md) owns the scope and
[its evidence](evidence/project-conversations/README.md) owns what was run. The Builder's agent,
its tools, its model credentials and its model selection are Mastra Code's now, mounted on the
Hub's own Mastra; a Project's conversations are that session's own threads; and the Conexus model
subsystem lost its last caller.

**The Conexus model subsystem is deleted.** `apps/hub/src/model-connection/`,
`apps/hub/src/model-connection-account/`, `apps/hub/src/platform/credential-backend.ts`, the
`/api/control/me/model-connections` operations and their contract, and the Settings tab are gone.
Settings shows the Account's details only. `apps/hub/migrations/0009_remove_model_connections.sql`
drops the `model_connection` schema, `iam.account_is_active`, the `connection.share` action, and
the `hub_model_connection` and `model_connection_owner` roles. The Hub refuses to boot while
`CONEXUS_DB_MODEL_CONNECTION_PASSWORD_FILE`, `CONEXUS_CONNECTION_CREDENTIAL_ROOT`,
`CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE` or `CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION` is set,
with `RETIRED_CONFIG_<name>`. The Workspace's enterprise Connections are a different subject and
are untouched.

**The Sessions and Work qualification is closed**, and its pull request is what carries it.
It authorized no migration and performed none. The evidence is in
[`docs/evidence/sessions-work-qualification/`](evidence/sessions-work-qualification/README.md)
and the verdict is section 14 of
[the report](evidence/sessions-work-qualification/report.md#14-the-integrated-run-and-the-verdict).

The integrated run used the real Factory, the real GitHub integration, a GitHub App on a
disposable private repository, and a real model paid by the operator's ChatGPT subscription
through the Factory's own login. It cloned the repository, edited it through its own
session, held two conversations, started Work, moved it through its own lifecycle, opened a
pull request and recorded a review. Nothing merged and nothing deployed.

The operator selected Factory-centered development on that evidence, with the custody
consequence it carries, and added one correction: model authentication, credentials,
provider connection and selection become the Factory's, with no adapter onto the Conexus
model subsystem. [C-022](decisions/index.md) registers both, and section 15 of the report
names what the adoption work removes.

M-02, the ChatGPT account sign-in through a Conexus model connection, was proven live on
2026-09-20: a BuilderRun paid for by a ChatGPT account succeeded, editing source and reaching a
Preview. That path left the product with the model connection subsystem. Git history holds what it
proved.

The pilot evaluation of 2026-09-21 found that a generated app's `<form>` did nothing in the Preview;
the Preview policy now allows forms. It also found that the agent cannot compile what it writes, which
the adoption task owns. Most of that day's slowness was the host's C: SSD, and moving the WSL disk
to D: removed it.

## The Builder sequence

This is the order. Each step is one unit of work that ends in something a person
can see. `docs/tasks/builder-repair-program.md` holds the file boundaries, the
build steps and the evidence each one owes.

1. **Prove the Builder live on the pilot.** Done on 2026-09-19. A real request in a pilot Project
   reached a working Preview, with the model, the Thread and the native trace from that same run.
   The same sitting proved the ChatGPT sign-in against OpenAI. It also found that no run could use that
   connection yet: the deployment model catalog required Mastra's provider key `openai`, while
   `model_connection.admit_for_project` matched the connection's `provider_id` `openai-codex`
   literally, and nothing mapped one to the other. The catalog went, and admission then compared the
   connection's own provider id on both sides. Both left with the model connection subsystem.
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
   provider registry. Conexus kept credential custody for a time. C-022 withdrew that
   half, and the Builder now takes its credentials and its model choice from Mastra Code.

P-02 through P-06 of the repair program are merged. Merged is not the same as proven,
and the table below separates the two. "Isolated" means a test proved it against a fake
or a fixture. "Pilot" means a real run on the pilot proved it end to end.

| Unit | Merged | Isolated | Pilot | Standing |
| --- | --- | --- | --- | --- |
| P-02 | yes | yes | yes | A failed request stays on screen with a named reason and no internal code reaches the browser. |
| P-03 | yes | yes | yes | The Preview states a grant and then a frame that navigated, never that the application loaded. |
| P-04 | yes | yes | no | Run selection, idempotency-key retention and the collapsed diagnostic are proven by browser and hub tests. No pilot run exercised them. |
| P-05 | n/a | n/a | n/a | Overtaken rather than executed. The deployment model catalog and the pinned constants had already gone with Mastra-native model choice; what remained, naming the connection that pays, shipped with P-04. |
| P-06 | yes | yes | yes | The compile answers whether the artifact boots. It needed three corrections after the unit merged; see below. |

**P-06 needed three corrections and now works.** The unit merged in a state where the
smoke could not run at all. The script is written to a `.mjs` path and used a top-level
`return`, which is a syntax error in a module, so every source-changing BUILD that
reached it settled as a build failure. A second defect discarded the script's verdict,
because the sandbox raises a non-zero exit as an error the caller did not read. A third
drove the browser endpoint instead of the page target, which answers the handshake and
then refuses `Runtime.enable`.

Twelve tests covered the smoke and passed against a script that could not parse, because
they faked the sandbox and never the script itself. The lesson is specific and worth
keeping: a generated program tested only through its caller is not tested.

All three corrections are merged. On the pilot at `9c0c62cb`, a healthy BUILD succeeds,
and an application with a throw at module evaluation fails with
`APPLICATION_SMOKE_NO_ROOT_CHILD` while its source and the previous Preview are kept.

Alongside those units the run pipeline was reduced from six out-of-process boundaries to
three. The source bundle is exported while the sandbox is created, one E2B template
carries both the agent and the compiler, and the agent's own sandbox compiles what it
wrote. A measured BUILD on the pilot fell from about 153 seconds to 69 at its best, on a
host whose container starts vary by a factor of ten, so treat that as an order of
magnitude rather than a benchmark. The shape is described in
[the C-020 reference](reference/builder-c020-mastra-native.md).

## Exact next action

**Put the deletion on the pilot and close Several conversations per Project.** The deletion
rewrites the pilot's role register, baseline and catalog snapshot, and each of those is verified
against a live database rather than by reading. On the pilot:

1. Remove the four retired variables from the Hub environment, or the Hub refuses to boot.
2. Apply `0009_remove_model_connections.sql` with `scripts/run-hub-migrations.mjs`, which refuses a
   catalog that differs from `contracts/technical/hub-catalog-snapshot.json`.
3. Run `npm run db:roles:census` and confirm every role in
   [the register](reference/hub-database-roles.md) is `ok`, and that `hub_model_connection` and
   `model_connection_owner` are gone from the cluster.
4. Send one real request in a conversation and see it reach a Preview on Mastra Code's credential.

The product proof of 2026-09-21 already met
[How it ends](tasks/project-conversations-first-increment.md#how-it-ends) on the pilot database
with `0008` applied. The deletion on the pilot is what remains, and the task closes after it. No increment after it is planned; the operator chooses the next one
from the later layers below.

What the qualification did not settle is listed in
[section 11 of the report](evidence/sessions-work-qualification/report.md#11-what-has-no-evidence-yet).
None of it blocks this increment.

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
