# 0002. The Conexus Builder runs on its own harness, off the Mastra Factory

**Date**: 2026-09-28 (revised the same day after the Codex cross check and its poteto triage)
**Status**: Accepted

## Summary

The Builder stops running inside the Mastra Factory. We build it directly on Mastra's engine
(`AgentController` and `createCodingAgent`), with a system prompt, two modes (Planejar and Construir)
and a tool set that are ours. We copy only the code we need, we import the subscription sign-ins from `@mastra/code-sdk`, and we
keep the Hub code that is not Factory code and already works (Preview, the run lock, error messages,
the E2B protections). Each Project's source moves from GitHub into a Git repository on the Hub's disk,
whose `main` branch is the approved version, and model accounts move into Conexus tables. The new
Builder must match or beat the old one on the Builder eval, on the branch, before it merges and before
the pilot (E-1) runs on it.

## Rationale

Reasoning, options and evidence: see [rationale.md](rationale.md). The cross check and its triage:
`0002-builder-own-harness-crosscheck.md` and
`0002-builder-own-harness-triage.md`, both in the operator's study notes.

## Requirements

**User stories**:
- As a person at a company, I describe an app in Portuguese, approve a plan, and see the app working
  in the Preview, without knowing anything about code or Git.
- As the same person, I can switch between Planejar and Construir myself whenever the Builder is idle.
- As an installation administrator, I connect model accounts (API key, ChatGPT or Claude subscription,
  Google AI Pro), share one with everyone, and set the default models.
- As Leandro, I can read the exact input the model receives, and everything we author in it speaks
  about Conexus, not about a terminal coding tool.

**Acceptance criteria** (the contract; each is checked on its own):

Harness and prompt
- **AC-1**: The text Conexus authors for the model (the Conexus prompt, the mode prompts, the
  connector brief) is kept in the repo and contains no "Mastra Code" identity and no guidance about git
  remotes, pull requests, commits, `gh`, or installing packages. Sections that Mastra adds on its own
  (workspace description, skill list) are allowed. A script prints the model's real input for a given
  Project, thread, mode, model and revision.
- **AC-2**: The Builder has exactly two modes, `plan` (shown as Planejar) and `build` (shown as
  Construir). The mode lives in the Mastra thread settings and nowhere else. A new conversation starts
  in Planejar.
- **AC-3**: In Planejar, the Builder cannot run a command in the sandbox and can write only under
  `.conexus/plans/`, which is never committed. It ends a planning turn with the native `submit_plan`
  tool, pointing at its plan file.
- **AC-4**: When the person approves the plan, the same run continues in Construir with the plan in
  context (`transitionsTo: 'build'`). When the person rejects it with feedback, the Builder stays in
  Planejar and revises. A run settles by what it changed, not by the mode it started in.
- **AC-5**: The person can switch the mode by hand through the native mode route whenever the Project
  has no active run. A switch during an active run is refused with a clear message.
- **AC-6**: The tools each mode exposes are exactly the lists in *Tool contract*. No mode exposes any
  git remote, GitHub, source control, subagent or agent connection tool. A test asserts both lists by
  name.

Project knowledge
- **AC-7**: Every new Project starts with a short `AGENTS.md` at the repository root, from the
  starter text `apps/hub/src/builder/starter/AGENTS.md`.
- **AC-8**: At the start of every run, the Hub reads `AGENTS.md` from `main` in the Conexus Git (not
  from the sandbox) and places it after the Conexus prompt, marked as project knowledge below the
  platform rules. It must be a UTF-8 file of at most 8 KB; a longer file is cut at a character
  boundary and followed by the note "AGENTS.md truncated at 8 KB; shorten it."
- **AC-9**: The Construir prompt tells the Builder to update `AGENTS.md` before it finishes, with only
  facts confirmed in this run (structure, data sources, decisions and why), under 8 KB. The Hub
  refuses a candidate whose `AGENTS.md` is missing, not UTF-8, or over 8 KB, with a reason the next
  turn can act on.
- **AC-10**: The `conexus-server` skill and later platform skills load as agent level skills from the
  Hub folder `builder-skills/` (today's `factory-skills/`), versioned with the Hub and never copied
  into an app.

Tools, web and data
- **AC-11**: In both modes the Builder can search the web and read a page. Neither can send a form or
  a request body. The prompt forbids putting company data (names, codes, values, anything read through
  `connector_fetch`) in a search query, a URL or a shell command that reaches the network. Search
  works on every model the pilot uses: native provider search where it exists, one common search tool
  where it does not.
- **AC-12**: `connector_fetch` keeps the Q-5 behavior (per run scope revoked on every exit, the brief
  of the Project's bindings). The Builder refuses only when a request needs a company system the
  Project has no binding for, says which system, and asks for a binding; a request that needs no
  company system is built normally. The eval refusal case passes.

Source and runs
- **AC-13**: Creating a Project makes sure its repository exists under the Conexus Git root with the
  starter committed on `main` (idempotent: a missing repository is created, an empty one gets the
  starter). No GitHub call happens anywhere in Project creation, a run, or the source views.
- **AC-14**: A run seeds a fresh E2B sandbox from `main`. At the end of Construir the Hub, not the
  agent, commits every change in the checkout (respecting `.gitignore`, excluding `.conexus/plans/`)
  with the author `Conexus Builder` and the run's base commit as parent, and pulls that one commit
  back as a bundle with object checking on. With no change, the run ends `RESPONSE_ONLY`. When
  `conexus/check.sh` passes, `main` is fast forwarded to the candidate; that is the moment of
  admission. A build failure after admission leaves the Preview unavailable and the admitted source
  repairable (C-020 amendment of 2026-09-22).
- **AC-15**: The sandbox never holds a model credential, a Git write credential, or any Hub secret,
  and it cannot write to the Conexus Git; only the Hub moves commits.
- **AC-16**: Only one run is active per Project, held by the database lock taken before the base
  commit is read. A run waiting for a plan approval or an answer is still active. A message while the
  run waits on the person ends the question and continues the same run; a message while the run works
  gets the busy answer (spec 0011).
- **AC-17**: If the sandbox dies, the model fails, or the Hub restarts during a run, the run ends as
  failed with a readable reason and the next run starts from `main`. If `main` had already advanced
  to the run's candidate, the run is recorded as admitted instead. The existing failure vocabulary and
  the note that failed edits were discarded are kept.

Conversations and memory
- **AC-18**: A Project holds several conversations, all visible to every member of the Project
  (`SHARED`). Each conversation is a Mastra thread stored in Postgres and survives a Hub restart. The
  list shows the title (or the first message) and last activity, newest first.
- **AC-19**: Long conversations use Mastra observational memory with Mastra Code's settings, scoped to
  the thread, running on the installation's memory model.

Model accounts
- **AC-20**: A person can add an API key for a provider, sign in with a ChatGPT subscription, sign in
  with a Claude subscription, and connect Google AI Pro, from the Modelos de IA screen.
- **AC-21**: A model account belongs to one person and is shared at one of two levels, just me or
  everyone in the installation. Only an installation administrator can set everyone. One account per
  person per provider, and at most one shared account per provider, as today.
- **AC-22**: Secrets are encrypted by Conexus before they are stored, are never returned to the
  browser, and never enter the sandbox. The Builder's model calls run in the Hub process. A refreshed
  OAuth token is written back before any temporary copy is deleted.
- **AC-23**: The installation has three default models: Planejar, Construir and memory. The list of
  providers and models comes from Mastra's model router. A person can pick another model for a
  conversation among the accounts they may use. A run with no usable account fails with the same
  "connect a model" message as today.

Removal
- **AC-24**: `@mastra/factory` is gone from the Hub's dependencies, and `@mastra/code-sdk` stays as a
  pinned library (amendment of 2026-10-01). The `factory` Postgres schema and the `hub_factory` role
  are dropped. The GitHub App routes, settings screen, provisioning code and the five
  `CONEXUS_FACTORY_GITHUB_*` variables are deleted. Model packs and the `fast` model role are gone.
- **AC-25**: Every file the Hub still copies carries the Apache 2.0 notice and names its source file
  and package version (see *Copy list*). What it uses from `@mastra/code-sdk` is imported.
- **AC-26**: Decision C-032 is recorded in `docs/decisions/index.md`. It supersedes C-022 and C-025
  and amends C-027 (Google AI Pro stays, its credential moves to a Conexus table).

Proof (all on the branch, deployed on the local Hub, before the merge)
- **AC-27**: The Builder eval passes three fixed cases on the new Builder: `todo-reload` (an app that
  keeps its data across a reload), `erp/sankhya-not-connected` (the refusal) and
  `erp/sales-dashboard` against the pilot's Sankhya. One run each; a failed case gets one rerun; the
  gate passes when all three pass. The eval driver approves plans automatically. There is no baseline
  on the old Builder (Leandro, 2026-09-28: the comparison would not change the decision, and a small
  sample is noise).
- **AC-28**: Driving Chromium as a person: create a Project, ask for an app, approve the plan, and see
  the app working in the Preview.
- **AC-29**: An app built by the new Builder reads the pilot's Sankhya through the application path
  and shows the data in the Preview (values masked in any evidence).
- **AC-30**: Leandro reads the model input printed by the AC-1 script for both modes and says yes;
  his yes is recorded in the PR.
- **AC-31**: A backup of the Conexus Git folder together with the database dump exists, and one
  restore was tested, before the switch.

## Decision

**Chosen option**: Option 4: our own Builder on Mastra's engine, with copied code.

The Builder runs on `@mastra/core`'s `AgentController` and `createCodingAgent`, with a Conexus prompt,
Conexus modes and a Conexus tool contract; Project source lives in a Conexus Git on the Hub whose
`main` is the admitted version; model accounts live in Conexus tables; the Factory and Mastra Code
leave the Hub; the Hub's own run, Preview and E2B code stays.

**Implementation skills**: `mastra` (repository skill, `.agents/skills/mastra/`) · `conexus-development`
(`developmentconexus-ops/conexus-os`, `.agents/skills/conexus-development/`) · `conexus-frontend`
(`developmentconexus-ops/conexus-os`, `.agents/skills/conexus-frontend/`) for the model account screen
and the mode switch.

## Design

### Shape of the harness

```
Hub process
  BuilderController = new AgentController({
    agent: createCodingAgent({ id: 'conexus-builder', instructions: conexusInstructions,
                               tools: { connector_fetch, web_search, web_fetch },
                               skills: builder-skills/ (agent level), memory: observational memory,
                               workspace: undefined }),
    workspace: one E2B workspace per run, seeded from main,
    modes: [plan, build],
    storage: PostgresStore (schema mastra),
  })
  registered on the Hub's Mastra instance; the browser reaches it through the native session routes
  under /api/builder, behind the Hub's allowlist (now including the mode switch route).
```

- `conexusInstructions` returns, in order: the Conexus prompt (`apps/hub/src/builder/prompt/conexus.md`),
  the mode prompt for the thread's current mode (`plan.md` or `build.md`), the Project's `AGENTS.md`
  from `main` under a "project knowledge" heading, and the connector brief. The mode prompt lives in
  these agent instructions, not in the modes' own `instructions`, because only agent instructions are
  resolved again when a suspended run resumes (proven in the slice 0 and 1 blast radius). Mastra adds
  the workspace and skill sections by itself.
- The prompt is written by us. Short passages from Mastra Code's base prompt may be reused where they
  are general good practice (explore before editing, read before editing, small edits), rewritten for
  this product. It says who the Builder serves (people who do not code), what the Preview is, how
  Connections work, that `conexus/check.sh` must pass, and that it replies in Brazilian Portuguese.

### What stays from the Hub (not Factory code, working today)

The artifact and Preview pipeline (`application-build.ts`, `application-artifact-runtime.ts`,
`preview.ts`), the one run per Project lock and run store (`store.ts`, `service.ts`, minus GitHub
columns), the failure vocabulary (`failure-vocabulary.ts`) and the discarded edits diagnostic, the
source view shapes and limits (`factory-source.ts` becomes `source.ts` reading Git), the E2B subclass
keepalive and ingress protections (`factory.ts` minus the GitHub seeding), the tripwire watcher and
the observation teardown (`runtime.ts`, `factory-runtime.ts`).

### Tool contract

| Tool (final name) | Planejar | Construir | Source |
|---|---|---|---|
| read file, list files, search content, file stat | yes | yes | core workspace tools |
| write file, edit file, make folder | only under `.conexus/plans/` | yes | core workspace tools |
| delete file | no | yes | core workspace tools |
| run command, read process output, stop process | no | yes | core workspace sandbox tools |
| task list tools | yes | yes | core `TaskSignalProvider` |
| `skill`, `skill_read`, `skill_search` | yes | yes | core agent skills |
| `submit_plan` | yes | no | core `submitPlanTool`, `transitionsTo: 'build'` |
| `ask_user` | yes | yes | core `askUserTool` |
| `connector_fetch` | yes | yes | Conexus (Q-5) |
| `web_search` | yes | yes | core `webSearchTool`, or the common search tool for models without native search |
| `web_fetch` | yes | yes | core `webFetchTool` |

Each mode also sets `availableTools`, but that list is lost when a suspended run resumes (proven:
after a plan approval or an `ask_user` answer the model saw tools outside its mode). So one mode
guard, in the tools' own hook, reads the thread's current mode on every call and refuses any tool
outside the table above, including writes outside `.conexus/plans/` in Planejar. The guard is the
enforcement; `availableTools` only trims what the model is shown. The LSP and AST edit tools are left out until an eval shows they are needed.

### Data model

| Entity | Fields | Notes |
|---|---|---|
| `builder.project_repository` | `project_id` (PK, FK project), `created_at` | Replaces `builder.factory_binding`. Path derived: `<CONEXUS_GIT_ROOT>/<project_id>.git`. The admitted revision is `main` in that repository, not a column. |
| `builder.builder_run` | existing columns; `base_revision`, `candidate_revision` (Conexus Git commit ids), outcome | The duplicate "admitted source" state and the GitHub shaped columns and functions of migrations 0011, 0013, 0015, 0018 are removed. The lock and the failure outcomes stay. |
| `model.model_account` | `id` (uuid PK), `owner_account_id` (FK account, not null), `provider` (text, not null), `kind` (`api_key`, `oauth`, `google_ai_pro`), `secret` (text, Conexus envelope, not null), `sharing` (`just_me`, `everyone`), `created_at`, `updated_at` | Unique (`owner_account_id`, `provider`); unique (`provider`) where `sharing = 'everyone'`. |
| `model.installation_default` | `role` (`plan`, `build`, `memory`, PK), `model_id` (text), `updated_by` (FK account), `updated_at` | Replaces Factory model packs and memory settings. Empty until an administrator sets it. |
| Mastra storage (schema `mastra`) | threads, messages, observational memory, observability spans | Native `PostgresStore`. A conversation is a thread with `resourceId = project:<projectId>`, metadata `{ createdBy }`, and its mode and model selections in thread settings. |

### State transitions

- Mode (thread setting): `plan` to `build` by an approved `submit_plan` or a manual switch when the
  Project is idle; `build` to `plan` by a manual switch when idle.
- Run: `running` (includes waiting for a plan approval or an answer) to `RESPONSE_ONLY` (no change),
  `admitted` (`main` fast forwarded) or `failed` (existing vocabulary). Recovery after a restart reads
  `main`: if it equals the run's candidate, the run is `admitted`, otherwise `failed`.

### API surface

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/control/projects/:projectId/builder-session`, `/messages`, `/runs/:id/cancel` | GET, POST | as today, without a mode field | as today | Project member | 409 busy, 422 no model |
| `/api/control/projects/:projectId/conversations` | GET, POST | title | threads (title or first message, last activity, newest first) | Project member | 403 |
| `/api/control/projects/:projectId/source-tree`, `/source/file`, `/source/compare` | GET | commit id, path | today's shapes, read from the Conexus Git | Project member | 404, 422 invalid commit |
| `/api/builder/agent-controller/conexus-builder/...` | native | native | native session routes (models, modes, mode switch, stream, threads, messages, abort, model, tool approval, tool suspension, state) | Hub session, allowlist | 403 outside allowlist, 409 switch during a run |
| `/api/control/model-accounts` | GET, PUT, DELETE | provider, kind, key or OAuth handoff, sharing | accounts without secrets | signed in; `everyone` needs installation administrator | 403, 409 second shared, 422 |
| `/api/control/model-accounts/:provider/oauth/start`, `/complete`, `/poll` | POST, GET | provider | handoff state (owner bound, expiring) | signed in | 409, 422 |
| `/api/control/model-accounts/models` | GET | none | providers and models from Mastra's model router, marked usable for the caller | signed in | none |
| `/api/control/model-defaults` | GET, PUT | role, model_id | the three defaults | read: signed in; write: installation administrator | 403, 422 unusable model |

Removed: `/api/control/installation/github`, `/api/control/installation/github/connect`,
`/api/control/projects/:projectId/repository`, the forwarded `/web/config/*` routes, the proxied
`/web/github/projects/:id/sessions`, and the `/api/mastra-factory` mount.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Start a run | the mode | the thread's mode setting |
| Start a run | the model | the thread's model selection for the mode, else `model.installation_default` for that role |
| Start a run | the credential | the caller's own `model_account` for the model's provider, else the one shared with `everyone`; none means the 422 "connect a model" answer; the chosen account id is recorded on the run |
| Start a run | the base commit | `main` in `<CONEXUS_GIT_ROOT>/<project_id>.git`, read after the Project lock is taken |
| Start a run | `AGENTS.md` text | the base commit, read by the Hub with `git show` |
| Start a run | the connector brief | the Project's bindings (C-030), as Q-5 builds it |
| Memory | the observer and reflector model | `model.installation_default` role `memory`, with the same credential rule |
| End of Construir | the candidate commit | the Hub's commit in the sandbox (fixed author, parent = base), pulled as a bundle |
| Admission | the admitted revision | `main`, fast forwarded to the candidate after `conexus/check.sh` passes |
| Source views | tree, file, diff | `git ls-tree`, `git show`, `git diff` on the Project repository, with today's shapes and limits |
| Conversation list | title, last activity | Mastra thread title (else the first user message) and last message time |

### Key invariants

- `main` in the Conexus Git is the admitted revision and there is no second copy. It moves only by
  fast forward, only by the Hub, only from the run's own base.
- The mode has one home: the thread setting.
- The sandbox holds no secret. Model calls, Git writes and connector calls happen in the Hub.
- One active run per Project, including a run waiting on the person, which waits inside the run on the live session (spec 0011).
- A secret is written only as a Conexus envelope and never leaves the Hub.

### Security model

- Who may use a Project's Builder, conversations and source views is unchanged: the Account to Project
  authorization the Hub checks today. Every conversation is visible to every Project member for now.
- Model accounts: a person manages their own; only an installation administrator sets `everyone`
  (C-026 role check, reused).
- Web access is read only. Fetched content is data, never instructions. Keeping company data out of
  queries, URLs and network commands is a prompt rule for the pilot, checked by the E-4 leak scan,
  which also tries shell commands.
- `connector_fetch` keeps the Q-5 scope, expiry, budget and C-029 record.
- The secret envelope is copied byte for byte, keeping the prefix `mastra:factory-secret:v1:`, the AES
  scheme and the key file. Five database checks (migrations 0024, 0026, 0029) require that prefix, and
  the copied code hardcodes its length; a new prefix would break sign in, application access and new
  Connections (proven in the blast radius). Only the code's home becomes Conexus's.

### Copy list

From `@mastra/factory` 0.17.2: `dist/secret-encryption.js` (the envelope, used by every Conexus
secret today), the sharing rules of `dist/routes/provider-credentials.js`. From `@mastra/code-sdk`
1.8.3: the title and body split of `dist/utils/plans.js`, and the observational memory settings of
`dist/agents/memory.js`. Since the amendment of 2026-10-01, the subscription sign-ins and providers,
the sandbox filesystem and the error classification come from `@mastra/code-sdk` as a library and
are not copied. Each copied file keeps its license notice and records source and version;
anything that ends up unused is deleted before the switch.

### Configuration required

- `CONEXUS_GIT_ROOT`: a new persistent folder on the Hub host (not inside E2B), owned by the Hub user,
  default `/var/lib/conexus/git`. The Hub host needs the `git` executable. The folder is part of the
  backup (AC-31).
- Removed: the five `CONEXUS_FACTORY_GITHUB_*` variables and `CONEXUS_DB_FACTORY_PASSWORD_FILE`
  (replaced by the password file of the role that owns schema `mastra`).
- Kept: the E2B key, the secret key file, the Google AI Pro CLIProxyAPI settings.

### Critical test scenarios

- Happy path: new Project, Planejar request, `submit_plan`, approve, same run continues in Construir,
  check passes, `main` advances, Preview shows the app. Verifies **AC-2**, **AC-4**, **AC-13**,
  **AC-14**, **AC-28**.
- Mode guard: Planejar lists no command or delete tool and cannot write outside `.conexus/plans/`; a
  manual switch during a run is refused. Verifies **AC-3**, **AC-5**, **AC-6**.
- Prompt: the AC-1 script's output shows none of the forbidden terms in our sections. Verifies
  **AC-1**, **AC-30**.
- AGENTS.md: a candidate with a 9 KB `AGENTS.md` is refused; the next run still reads the previous one
  from `main`. Verifies **AC-8**, **AC-9**.
- Restart after admission: kill the Hub right after `main` advances; on boot the run is `admitted`.
  Kill it before; the run is `failed` and `main` is unchanged. Verifies **AC-17**.
- Secrets: no model key, OAuth token or Git credential appears in the sandbox environment, files, or
  the stored thread. Verifies **AC-15**, **AC-22**.
- Sharing: a non administrator setting `everyone` gets 403; a second shared account for a provider
  gets 409. Verifies **AC-21**.
- A todo app request with no Connection is built; a sales report request with no Sankhya binding is
  refused naming Sankhya. Verifies **AC-12**.

## Build plan

A tracer bullet: one thin run end to end first, then thicker slices, each closing with its fast tests
and one small app built on the isolated branch Hub, all on one branch while the old
Builder keeps running from `main`. Q-5 (#372) is merged, so `connector_fetch` is ported, not
rewritten. Subtraction comes first inside each slice: the Factory adapter a slice replaces is deleted
in that slice.

1. Thin thread. The Conexus Git module (ensure repository, seed a sandbox, Hub commit and bundle pull,
   fast forward `main`, tree, file and diff reads) with the `builder.project_repository` migration;
   `model.model_account` with the `google_ai_pro` kind (the pilot has no API key accounts; the Hub's
   Google AI Pro router is already Conexus code, only its credential moves) and the copied secret
   envelope; `BuilderController` with
   `createCodingAgent`, a first Conexus prompt, Construir and the workspace tools on E2B, reusing the
   kept Hub code; Project creation, deletion and `create_builder_run` moved off `factory_binding`
   together with the other functions the blast radius lists (a plain CASCADE drop leaves them failing
   only when called); the native routes under `/api/builder`; the web client repointed. Proof, on the
   isolated branch Hub: a Google AI Pro account builds a small app that shows in the Preview.
   Satisfies **AC-13**, **AC-14**, **AC-15**, **AC-22** (Google AI Pro part).
2. Modes. Planejar, the plan folder limit, `submit_plan` with `transitionsTo`, `ask_user`, task tools,
   the native mode switch with its idle guard, the mode guard in the tools' hook with a test that
   resumes after a plan approval and after an `ask_user` answer, settlement by change (the candidate
   functions stop requiring `mode = 'BUILD'`). Satisfies
   **AC-2** to **AC-6**.
3. Prompt and project knowledge. The full Conexus and mode prompts, the AC-1 script, the starter
   `AGENTS.md`, the reader from `main` with the 8 KB rule, the candidate refusal, agent level skills
   from `builder-skills/`. Satisfies **AC-1**, **AC-7** to **AC-10**.
4. Conversations, memory and recovery. `PostgresStore` in schema `mastra`, observational memory,
   several shared threads per Project, the run lock including waiting runs, restart recovery by
   reading `main`. Satisfies **AC-16** to **AC-19**.
5. Model accounts, whole. API keys, ChatGPT and Claude subscription sign in and refresh (imported from `@mastra/code-sdk`; Leandro
   signs in to ChatGPT himself when the proof needs it), Google AI Pro write back, sharing rules, the model router catalog, the three
   defaults, the Modelos de IA screen repointed. Satisfies **AC-20** to **AC-23**.
6. Connectors and web. Port `connector_fetch` and its brief with the refusal rule, add web search and
   page reading, check native search per pilot model and add the common search tool where missing.
   Satisfies **AC-11**, **AC-12**.
7. Removal. Delete `@mastra/factory` (`@mastra/code-sdk` stays pinned), the Factory composition, the GitHub App
   code, routes, screen and variables, model packs and the `fast` role, the `factory` schema and role;
   reshape migrations 0011, 0012, 0013, 0015, 0016 and 0018; update or delete the Factory tests; finish
   the copy list notices; record C-032 and update the docs that state C-022 as current. Satisfies
   **AC-24** to **AC-26**.
8. Proof on the branch, deployed on the local Hub: backup and restore test, the three case eval gate,
   the browser run, the Sankhya app, Leandro's reading of the model input. Satisfies **AC-27** to
   **AC-31**.

## Migration plan

**Strategy**: one switch after a branch built by slices. There are no customer users yet, and Leandro
chose to start the data from zero, so nothing is migrated.
**Phases**:
1. Slices 1 to 7 on a branch; the old Builder keeps running from `main`. The branch Hub runs isolated
   from the pilot: its own Postgres container (a second database in the pilot's cluster is not enough,
   role passwords are cluster wide), its own ports (4443, 4444, 4445), env file, runner socket, state
   folder, connector folder, `CONEXUS_GIT_ROOT` and `XDG_STATE_HOME` (a shared one lets its boot stop
   the pilot's Google AI Pro proxies), a second Keycloak redirect URI, and its own Chromium profile.
   The E2B key and template are shared.
2. Dump the Hub database and the current Project sources, and ask Leandro before any data is dropped.
3. Deploy the branch on the local Hub and run slice 8. Nothing merges until all proofs pass.
4. Merge, restart the Hub with no run active, and run a short smoke check.
**Rollback**: redeploy the previous `main` and restore the phase 2 dump.
**Risks**: the switch drops every test Project and conversation; subscription sign in depends on
unofficial flows the providers may change, which reach Conexus as `@mastra/code-sdk` upgrades; native web search may be missing for a pilot model path.

## Consequences

**Positive**:
- The prompt, modes and tools say what Conexus is. Our rules stop being the lowest priority text.
- Source custody needs no GitHub; the approved version is simply `main`.
- Fewer moving parts: no Factory schema, no GitHub App, no forwarded routes, no model packs, one home
  for the mode, one home for the admitted revision.
- The 17 unguarded `source_control_*` tools disappear with the Factory.

**Negative / tradeoffs**:
- We own and maintain the prompt, the mode logic and the Git store. Mastra fixes to those parts no
  longer arrive by upgrade. The sign-ins stay in `@mastra/code-sdk`, so their fixes do.
- `AgentController` and `createCodingAgent` are beta; a Mastra upgrade can break us.
- The Q4 pilot waits for this work.
- Losing the Git folder loses Project source; the backup is now critical.
- Conversations are visible to every Project member until private conversations come back.
- No PR, CI or history view on GitHub until the personal GitHub mirror exists.

**Neutral**:
- The Dev Factory (`<home>/dev-factory`, our development team) is a different system and does not change.
- Factory cards about Factory model accounts (#333) lose their reason; #329 and #330 change backend.

## Follow-up

- [ ] Personal GitHub mirror: a person connects their own GitHub account and a Project's Conexus Git
  is pushed there (CI, PR, history). Its own spec, after the pilot proof.
- [ ] Private conversations (`PER_USER`) with per thread authorization on every read, when a company
  needs them.
- [ ] Until the switch merges, the old Builder still exposes the Factory's 17 `source_control_*`
  tools with a real installation token. Decide whether to deny them now in `deniedTools()`.
- [x] Anthropic: the operator decided on 2026-09-29 to offer both the API key and the Claude
  subscription sign in, as the Factory and Mastra Code do.
- [ ] Close or rewrite Factory cards #333 (obsolete) and check #329, #330, #346 against the new
  backend.
- [ ] Prompt variants (Leandro, 2026-09-28): the prompt loader takes a variant id (`prompt/<variant>/`), an eval arm names the variant beside the model, the run records it, and the best variant by the fixed eval cases becomes the default. The loader shape lands in slice 3; comparing variants comes after the switch.
- [ ] Sandbox network limits (egress) if the E-4 leak scan shows data leaving through commands.

## Amendment, 2026-09-29: a conversation owns its sandbox and its branch

**Status**: decided by the operator on 2026-09-29. Units B1 to B8 below carry it. B1 and B2 are
built and merged on `feat/builder-own-harness` as `1851797c` (B2 adds migration `0039`). B3 is
built and merged there as `6009a5a5` (migration `0040`), and it ran live in a replay on
2026-09-29, where the second turn resumed the same E2B sandbox. B4 to B8 are not built. The
[Builder own harness task](../../stage2-builder-own-harness-qualification.md#10-direction-the-ordered-work)
tracks their state.

Today every failure before admission loses all of the run's file work: a model error, a storage
timeout, a dead sandbox, a Hub restart, a refused check and a stop. The work lives only in a
sandbox the run destroys at its end (study 23, question 3). Study 23 compares two fixes and
recommends design B, which matches Mitra, Claude Code and Codex cloud. Study 24 shows that the
right stop falls out of the same design. The studies are
[23](../../../research/builder/23-durable-agent-and-sandbox-reuse.md) and
[24](../../../research/builder/24-stop-button-and-sandbox-lifecycle.md) in the Builder research.

### Decisions

1. **The conversation owns the sandbox and the branch.** Each conversation keeps one E2B sandbox,
   `conexus-conv-<conversationId>` with `onTimeout: 'pause'`, and one branch. The Hub mirrors the
   checkout into `refs/conexus/conversations/<conversationId>` in the Conexus Git at every turn end
   and after edits. The sandbox still holds no Git credential (study 23, lines 314-356 and 425).
2. **A turn whose check passes becomes a version on `main` by itself**, as Mitra does. The person
   does not press a button (study 23, lines 426-427).
3. **The Builder resolves a conflict with another conversation itself.** When a version finds
   `main` moved, the same turn brings `main` in, merges, reruns the check and tries again. A Git
   conflict is an ordinary coding task. The Builder asks the person only when the two requests
   contradict each other. Kept small until two conversations really collide: no contradiction
   detector and no dedicated eval case (study 23, lines 451-465).
4. **The Preview shows `main` only.** A draft Preview of the conversation branch is unit B7, later
   (study 23, lines 467-469).
5. **A paused idle sandbox is deleted after 7 days** by default. The branch mirror keeps the files,
   so the value decides speed, never loss (study 23, lines 470-471). Checked when B3 was built: E2B
   keeps a paused sandbox until someone kills it, and sandbox storage is free on every plan
   ([persistence](https://e2b.dev/docs/sandbox/persistence), [pricing](https://e2b.dev/pricing)).
   So 7 days holds, and the B6 sweeper is the only thing that deletes one.
6. **Stop interrupts the agent and nothing else.** The files stay in the conversation's sandbox and
   branch, and they go into the next version with the next request once its check passes. No stop
   discards work, and there is no undo button now. The person asks the Builder to undo (study 24,
   lines 346-353).

### Criteria this amendment changes

| Criterion | Now | Amended |
| --- | --- | --- |
| AC-14 | A run seeds a fresh sandbox from `main`. The end of Construir is admission | A turn runs in the conversation's sandbox. The sandbox resumes, or is rebuilt from the mirror or from `main`, and brings in `main` at turn start when `main` moved. Every turn end, stop included, mirrors the checkout. A version is its own act: the platform check on the branch tip, then a fast forward of `main`, or a clean merge commit when `main` moved. A failed check leaves the work in the branch |
| AC-16 | One active run per Project | One active turn per conversation. A turn that waits on the person stays active in `WAITING` (spec 0011): the run holds the conversation's live Mastra session and lets the VM go, and the question ends with the run, by an answer, a message, the configured wait, Stop or a Hub restart. Two conversations of one Project work at once and meet only at the compare-and-swap on `main` |
| AC-17 | A failed run ends failed, the next run starts from `main`, and the note says the edits were discarded | A failed or interrupted turn keeps its files in the mirror. The next turn resumes the sandbox or rebuilds it from the mirror. A version already on `main` is recorded as admitted. The note says the files are kept |
| Cancel, API surface (line 248) | As today: the run ends interrupted and its edits are discarded | Stop ends the turn as stopped, not failed. It keeps the sandbox and the files and makes no version |
| Scenario "Restart after admission" (lines 331-332) | Kill the Hub after `main` advances: admitted. Kill it before: failed, `main` unchanged | Kill the Hub between the swap on `main` and the Preview: boot records "admitted, Preview not built". Kill it mid-turn: the next turn finds the files the killed turn wrote |

Unchanged: AC-15 (the sandbox holds no secret, and only Hub-made bundles move Git), the tool
contract, the connector scope per turn, and spec 0003's rule that admission never executes a file
from the candidate.

### Units

Each unit ends with a test that kills the work at the unit's point and asserts what the next turn
sees (study 23, lines 383-400).

| Unit | What | Criterion |
| --- | --- | --- |
| B1 | Mirror ref per conversation at every turn end, stop included, and after edits | AC-14 |
| B2 | Start from the mirror, then bring in `main` | AC-17 |
| B3 | Conversation-owned sandbox and session, paused when idle, never destroyed at turn end | AC-14 |
| B4 | The version act: check, compare-and-swap on `main`, Preview | AC-14, AC-17 |
| B5 | Lock per conversation | AC-16 |
| B6 | Sweeper for the 7-day limit, and a kill of the agent's processes at every turn end | none |
| B7, later | Draft Preview of the conversation branch | a new criterion |
| B8, later | Mastra's durable agent continues an interrupted turn after a Hub restart | none, needs B3 |

B0, the retry of a transient storage or network failure within the same turn, needed no amendment
and is built on `feat/builder-own-harness` (`0ecb20a4`).

## Amendment, 2026-10-01: `@mastra/code-sdk` stays as a library

**Status**: decided by the operator on 2026-10-01. C-032 records it.

The Mastra Code product (its agent, its TUI and its own modes) leaves the Hub, as C-032 says.
`@mastra/code-sdk` stays as a library dependency, pinned to an exact version and covered by tests.
The Builder uses it for:

- the Claude subscription: sign-in, refresh and model;
- the ChatGPT subscription: device-code sign-in, refresh and model;
- the sandbox filesystem (`SandboxFilesystem`);
- error classification (`parseError`);
- the eval's Claude login.

Conexus does not copy that code. Mastra maintains these unofficial subscription flows for its own
product, so a provider's change reaches Conexus as an upgrade. Credentials stay in Conexus's sealed
`model.model_account` table, and the Hub keeps its own refresh coordinator. Reopen when
`@mastra/code-sdk` moves or removes an import Conexus uses, or when its upgrade path breaks.

### Criteria this amendment changes

| Criterion | Before | Amended |
| --- | --- | --- |
| AC-24 | `@mastra/factory` and `@mastra/code-sdk` are gone from the Hub's dependencies | Only `@mastra/factory` is gone. `@mastra/code-sdk` stays, pinned to an exact version |
| AC-25 | Every copied file, the sign-in code included, carries the notice | Only the files the Hub still copies carry it. What the Hub uses from `@mastra/code-sdk` is imported |
| Copy list | `dist/auth/*`, the subscription providers, `dist/agents/credential-resolver.js` and the subscription parts of `dist/agents/model.js` are copied | They are imported from `@mastra/code-sdk`. Still copied: the secret envelope, the sharing rules, the plan file's title and body split, and the observational memory settings |
