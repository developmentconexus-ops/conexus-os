# Factory adoption: a Project developed through the Mastra Factory

> **Status:** in flight. Unit 0 is done.
> **Authority:** [the roadmap](../roadmap.md) owns whether this runs. [C-022](../decisions/index.md)
> chose the Factory and a forge for Project source, and [C-024](../decisions/index.md) fixed how a
> Conexus installation connects to GitHub. This task carries both out.
> **Evidence it rests on:** [the Sessions and Work qualification](../evidence/sessions-work-qualification/report.md),
> sections 8 to 15, a read of `@mastra/factory` on 2026-09-21 (cited below), the pilot evaluation of
> 2026-09-21, and the independent review that followed it. Citations were read in 0.16.0-alpha.9. The
> unit pins 0.15.0, which uses Conexus's exact core and code-sdk versions and has the same files on
> this path.

A person opens a Project and asks for a change. The Mastra Factory runs the conversation. The agent
edits the Project's source in its private GitHub repository and checks that the application compiles
before it stops. The Preview then shows the revision the Project accepted. The person never sees a
branch or a pull request.

## Why this is next

The first increment gave a Project several conversations by mounting `@mastra/code-sdk` directly.
It did not install the Factory, and Project source stayed under Conexus's own Git custody: an OCI Git
container, source bundles and a bundle-based admission. That is the gap between C-022 and the
runtime. The independent review ruled that closing it comes before the frontend redesign, and that
there is no general stabilization phase of the current path first. Every further investment in the
host-owned Git path strengthens a state the decision already replaced.

## What Conexus is, for this task

One Conexus installation serves one company. It is not a multi-tenant service. The company connects
Conexus to its GitHub account once, and every Project becomes a private repository there. Workspaces
group Projects and people inside the company and have nothing to do with GitHub accounts. Another
company runs its own Conexus installation with its own GitHub App and connects its own account.

## What the Factory gives, as read from its source

- **Tenancy and GitHub connection.** A Factory organization owns GitHub installations
  (`storage/domains/source-control/base.js`, table `installations` keyed by `org_id`), and each
  installation owns repositories. Its connect flow ships as routes: `/auth/github/connect` sends the
  person to GitHub, and `/auth/github/callback` records the installations they authorized. The
  person's user token is used only to list those installations and is not stored
  (`integrations/github/routes.js:309-358`).
- **Sandbox.** `MastraFactoryConfig.sandbox` is a callback that returns any `MastraSandbox`
  (`factory.js:262-265`). Clone, checkout, commit and push run as shell commands inside it
  (`integrations/github/sandbox.js:222-260`, `:430-456`). The Conexus E2B template, which already
  carries the compiler, can be that sandbox.
- **Storage.** `FactoryStorage` is required, on Postgres (`PgFactoryStorage` from `@mastra/pg`) or
  LibSQL (`factory.js:167`). The Hub's single `new Mastra(...)` must be built from `prepare()`'s
  returned args (`factory.js:738-751`). Work-items storage is always registered (`factory.js:210`).
  The Work engine runs only when boards are configured.
- **Models.** The Factory uses the same `@mastra/code-sdk` credential store and thread-scoped
  selection as today (`factory.js:64`).
- **Routes.** `apiRoutes` is an array the host mounts selectively. The Hub keeps its session, CSRF
  and authorization guards and exposes only what the product uses.
- **What it does not do.** It never creates a repository (`integrations/github/integration.js:428`
  is a read). Its push is a plain non-force `git push`, and a moved base fails as a generic
  `push-failed` (`integrations/github/sandbox.js:360-364`). Neither is enough for the product.

## The composition

- **One Factory organization per installation.** Today the Hub passes the Project as the Mastra
  `organizationId` (`apps/hub/src/builder/runtime.ts:121`). That would make every Project connect
  GitHub separately. The organization becomes one fixed identity for the installation. Which Account
  may act on which Project stays Conexus's authorization, rechecked at every operation.
- **Connect GitHub once, to an organization.** An installation administrator uses the Factory's connect flow from
  the Hub's settings, and installs the company's own App on the company's GitHub organization with
  access to all repositories. No organization name is written in code. The connected account is read
  from the installation the Factory records (`storage/domains/source-control/base.js`). GitHub does
  not let an App create repositories in a personal account, so a personal account is refused with a
  message that asks for an organization. Until the settings screen exists, the pilot connects once by
  configuration.
- **Each company has its own App.** A company creates its own private GitHub App and gives its Hub the
  App's values, as the pilot did. A shared App is refused, because one key would reach every company's
  code. Creating the App from inside Conexus through GitHub's manifest flow is a later convenience.
- **Repository per Project, bound by its GitHub id.** Creating a Project creates its private
  repository in the connected organization, and the App reaches it at once. A Project can also start
  from an existing repository the installation already sees, and that path replaces today's Git import
  catalog. The Project records the repository's GitHub id, which never changes, and not the
  installation. The Factory's chain from a session to its repository runs through the installation,
  and it prunes an installation GitHub no longer knows (`integrations/github/routes.js:376-381`). So a
  disconnect and reconnect would otherwise orphan every Project.
- **Reconnect and an unreachable repository.** After a reconnect, Conexus finds each Project's
  repository again by its GitHub id and rebinds it. A Project whose repository cannot be reached shows
  that state, refuses new requests and keeps its last good Preview. Conexus never creates a
  replacement repository on its own.
- **Session branch.** Each conversation works on its own branch, reset at the start of each run to
  the head of the repository's default branch.
- **Admission stays Conexus's.** When a run is created, Conexus reads the default branch's head and
  adopts it as the Project's working revision and the run's base, so a commit that reached the
  default branch outside Conexus is where the next request starts. After the agent commits, the
  branch is pushed. The application is compiled and smoke-tested in the same sandbox. Conexus then
  advances the default branch with a compare-and-swap ref update (`force: false`) from the run's
  base revision to the result. If the default branch moved since the run began, the result is not
  admitted. The run settles with a named stale-base outcome that the person sees, and nothing later
  is overwritten.
- **Preview.** Its meaning is unchanged. It is built from the admitted revision, and a build or boot
  failure keeps the last good Preview.
- **The agent checks its own work.** The application starter carries the manifest and a check
  command bound to the compiler already in the template. The agent's instructions require that check
  before finishing. Conexus still verifies the artifact before promoting a Preview, and the agent's
  word never replaces that.

## Carried from the pilot evaluation and the review

- **Preview forms.** Done in unit 0. The Preview policy allows forms and keeps `form-action 'none'`.
- **Models.** Discovery and the remembered choice improve through the native mechanism only. Conexus
  builds no catalog, credential layer or adapter. A default choice must be a preference someone
  authorized, never a silent pick that spends money.
- **Stop.** This task measures stopping on the new path in three parts: when the request was
  accepted, when generation and tools stopped, and when cleanup ended. It also checks that a late
  result is not admitted. It adds no new cancellation mechanism.
- **Live coverage.** `tests/implementation/builder-mastra-e2b-live.test.mjs` is skipped and still
  describes the removed composition. It is rebuilt on the new path, not revived. The failing
  `rb:first:check` is traced to its exact cause.

## Carried from the single-owner decisions of 2026-09-22

The [single-owner map](../reference/single-owner-map.md) names the owner of each concept this task
touches. Three of its consequences land in these units:

- **Installation administrator.** Connecting GitHub needs the new installation administrator role in
  Conexus IAM, as amended C-024 says. The role does not exist yet, and unit 4 depends on it.
- **Model credentials.** Nobody connects a model account until the Hub configures the Factory's
  `secretEncryption`, because the Factory stores credentials in plaintext without it. The per-person
  credential path is also qualified end to end with `auth: null`, which skips the Factory's
  per-person credential resolver. C-025 keeps credential sharing with the Factory.
- **Tool policy.** The browser answers a pending call with approve or decline only. An answer that
  changes effective policy for the session is refused.

## What leaves Conexus in this cut

- `apps/hub/src/platform/oci-git.ts`.
- `apps/hub/src/project/git-execution.ts`.
- The bundle and admission halves of `apps/hub/src/builder/source.ts`.
- The Git import catalog and its admission.
- The Git OCI image and its warm-up.
- The Project storage directories.
- The LibSQL session store.

The replacement lands and the old path's callers move in the same wave. The two never run side by
side as sources of truth.

## Out of scope

- Work items, boards and the dispatcher in the product.
- Publish.
- The frontend redesign.
- The Factory's own UI.
- A forge other than GitHub.
- Creating the GitHub App from inside Conexus. The pilot already has App 5015512. The GitHub App
  manifest flow, which lets a new installation create its own App in two confirmations, is the first
  thing to add when a second installation exists.

## Units, each ending in a live check on the pilot

The Factory gives a session a workspace only when the session is bound to a GitHub repository. It
throws `GitHub and a sandbox callback are required to create a Factory session workspace`
otherwise, and its config takes no host workspace (`workspace.js`, the `getBySessionId` branch). So
no unit can run the Factory over today's source path. The first unit is a vertical slice on a
repository the App already reaches.

0. **Preview forms.** Done (#144).
1. **One Project end to end through the Factory.** The Hub builds its Mastra from
   `MastraFactory.prepare()` with `PgFactoryStorage` on the pilot Postgres, one organization identity
   for the installation, the GitHub integration on App 5015512, and the sandbox callback on the E2B
   template. One new pilot Project is bound to a repository the App already reaches. Every other
   Project keeps today's path until unit 3, and no Project is ever on both. Check: in that Project, a
   request changes the repository through the agent, the agent runs the application check, the
   compare-and-swap admits the result, and the Preview shows a text only that run could have written.
   After a commit pushed to the default branch outside Conexus, the next request starts from it and
   is admitted. Unit 1 has no settings screen. The pilot's organization is connected once by configuration.
2. **A repository per Project (2a).** Project creation makes a private repository in the connected
   organization, or binds an existing one, and records its GitHub id. A personal-account installation
   is refused. Check: a new Project gets its repository with no step on GitHub.
3. **Move the pilot over, and remove the host Git path.** The pilot's existing Projects get
   repositories with their full history, and their conversations move into the Factory's storage. The
   two Mastra instances become one. The files listed above are deleted in the same release. Check: each
   repository's default head equals the Project's admitted revision, every existing conversation opens
   with its messages, the Hub boots without the Git image, and the acceptance list below still passes.
4. **Connect GitHub in the Hub (2b).** The Factory's connect routes are mounted behind the Hub session,
   in the settings, for installation administrators. A reconnect rebinds every Project by its
   repository's GitHub id, and an unreachable repository shows its state. Check: an installation
   administrator disconnects and reconnects the
   organization in the Hub, and every Project keeps working.

## How it ends

The following holds on the pilot, through the product, and is recorded in this task's evidence:

- A request edits source in the Project's repository. The Preview shows a text only that run could
  have written.
- The agent ran the application check inside the sandbox before finishing, and it shows in the tool
  calls.
- A request that breaks the build keeps the last good Preview and names the failure.
- With two conversations, one advances the source. The other, started on the older revision, does not
  overwrite it and says so.
- A commit made outside Conexus is the base of the next request, and the Preview keeps the last good
  build until a run's build of that source succeeds.
- A run whose edits were not admitted leaves a note in its conversation, and the next turn does not
  claim those edits.
- No branch or pull request is shown to the person.
- The conversations that existed before the cut still open with their messages.
- Stopping is measured in its three parts, and a late result is not admitted.
- The host Git path is deleted.

## Known gaps

- The observational memory model is the organization's row in the Factory `memory-settings`
  domain. `scripts/hub-factory.mjs memory --model openai/gpt-5.6-luna` writes it once, and every run
  applies it. Without that row a run uses the Factory default, `google/gemini-3.5-flash`. Choosing
  the memory model in the product belongs to the frontend refactor.
