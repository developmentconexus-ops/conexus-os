# Conexus OS decision register

The decisions in force, and what would make each one reopen. Superseded decisions
and the review rounds behind them stay in Git history. This register does not
create product meaning; the owners it names do.

Reopen a decision only on material evidence. A changed requirement, a new real
consumer, a newly reachable failure mode, an external change, or implementation
evidence that invalidates an assumption.

## In force

| ID | Decision | Owner | Reopen trigger |
| --- | --- | --- | --- |
| C-015 | Human authentication delegates to Keycloak through a narrow OIDC boundary. Conexus stays sovereign over identity mapping, Workspace and Project grants, and its own opaque server-owned session. A verified `(issuer, subject)` pair is an attribute of an existing `iam.account`, never a record class of its own. Keycloak roles, groups and claims grant no Conexus authority. | [Security](../reference/security-and-authority.md), [Data](../reference/data-and-persistence.md) | Keycloak proves unfit on security, topology or recovery; a stable `(issuer, subject)` identity cannot be preserved; or a real SSO, SCIM, passkey or multi-IdP requirement changes the authentication contract |
| C-020 | The Builder's ordinary coding path is a Project, a Mastra Thread with its messages, Conexus-owned Project working state, a minimal `BuilderRun`, and a checked Preview of a successful application build. Mastra owns the harness mechanics. Conexus owns authorization, source, execution settlement and artifact identity. There is no ordinary Change, WorkUnit or ActorRun, and no second conversation store. **Amended on 2026-09-22:** Preview continuity is not an invariant; a failed candidate may leave Preview unavailable while its admitted source remains repairable. Published application stability is owned separately by explicit Publish. | [C-020 reference](../reference/builder-c020-mastra-native.md), [Stage 2 managed application platform](../reference/stage2-managed-application-platform.md) | Implementation evidence falsifies the boundary or one of its stated invariants |
| C-021 | Conexus is the platform where a company builds, administers and evolves products connected to its own context and systems. A Project is one publishable product and holds its development and operation. A Project offers several persistent conversations under a Project policy of `SHARED` or `PER_USER`, each general rather than a Builder chat, each answered by one principal agent. Source admission, artifact health and publication are three separate gates. Enterprise connections live in the Workspace and reach a Project as authorized capabilities. Brain is governed knowledge, Automations are persistent Project resources, and Work is bounded delegable work distinct from a Session. Everything named here is destination and limit, not delivered behaviour. **Amended on 2026-09-28 by C-030:** an enterprise Connection reaches a Project through a Project binding under a Project-local name, not as a grant per capability. | [Product contract](../product/contract.md), and the owner each rule names | The operator changes the product direction, or qualification evidence shows a rule cannot hold on the native mechanisms |
| C-023 | The Builder's E2B sandbox has open internet egress, and the agent is no longer told to avoid the network. Decided by the operator on 2026-09-21 to keep the Builder simple while its real needs are learned, with the intent to narrow egress to named hosts later. Until then the sandbox can reach any host, so an agent could fetch unreviewed code or send the Project's source outward. The application smoke still refuses every request the app makes outside itself, so a run's verdict never depends on a third-party host. **Amended on 2026-10-02 by the operator:** the Hub's `web_fetch` tool is the same hole, because it fetches any URL the model writes, and it stays open when the sandbox closes. In place: a guard on `web_fetch`, like the one on the Context7 tools, refusing a query string, a `#` part, credentials and long or data-shaped paths, over Mastra's own refusal of private addresses. Now: a log of the hosts each sandbox reaches. Before Q5: the sandbox reaches only package registries and documentation hosts, through E2B's `network.allowOut` over a `denyOut` of every other address. ([details](#decided-on-2026-10-02-the-order-of-work-to-q5)) | [Builder runtime](../../apps/hub/src/builder/runtime.ts) | A run is seen to fetch or send something it should not, the Builder's needed hosts are known well enough to list, or a Project holds data that must not leave the sandbox |
| C-024 | One Conexus installation serves one company and is not multi-tenant. An installation administrator connects it to that company's GitHub organization through the Factory's own connect flow, with the company's own private GitHub App installed on all repositories, and every Project becomes a private repository there. The connected account must be an organization, because GitHub does not let an App create repositories in a personal account; a personal account is refused. No organization name is written in code. A Project is bound to its repository's GitHub id, not to the installation, so a disconnect and reconnect rebinds it and never orphans it; an unreachable repository refuses new requests and Conexus never creates a replacement on its own. The repository's default branch is the Project's current source: a change that reaches it outside Conexus is current source and the next request starts from it. **Amended on 2026-09-22:** no Preview-availability guarantee is derived from repository reachability or a previous build; failed candidates stay repairable and Published remains a separate explicit gate. The installation is one Factory organization, and Workspaces are not bound to GitHub accounts. Another company runs its own installation and creates its own App by hand, so no App key ever reaches a second company's code. Decided by the operator on 2026-09-21. Amended on 2026-09-22: the connection is an installation-wide action, so it needs the installation administrator role, not Workspace ownership. **Partly superseded on 2026-09-29 by C-032:** a Project's source becomes a Git repository on the Hub, and only the Hub moves its `main`. The GitHub organization and its connect flow, the company GitHub App, the private repository per Project, the binding to a repository's GitHub id, the Factory organization, and a change that reaches the source from outside Conexus no longer apply. Still in force: one installation serves one company and is not multi-tenant, another company runs its own installation, failed candidates stay repairable, and Published remains a separate explicit gate. | [Factory adoption task](../tasks/factory-adoption.md), [Stage 2 managed application platform](../reference/stage2-managed-application-platform.md) | Conexus is asked to serve more than one company from one installation, a Workspace needs its own GitHub account, or GitHub lets an App create repositories in a personal account |
| C-026 | Installation-wide actions, such as connecting or replacing the company GitHub organization and sharing a model account with everyone in the installation, belong to an installation administrator, not to a Workspace owner. The role lives only in Conexus IAM: the Factory never holds a copy of the administrator list, and the Hub checks the role before it performs a Factory administration change. The operator sets the first administrator from the shell; after that an administrator grants and revokes, the last active administrator cannot be removed, and every grant and revocation records who acted and when. Being an administrator grants nothing inside any Workspace or Project. This amends C-024, whose connect flow a Workspace owner drove. Decided by the operator on 2026-09-22. **Amended on 2026-09-26 by the operator:** connecting a company system, for every integration, is an installation-wide action, so a human installation administrator creates its Connection, types its credentials, and tests or disables it; agents build only code and structure and never handle credentials. Outside this explicit Connection carve-out, being an administrator grants nothing inside any Workspace or Project: an installation administrator creates, lists, checks, and disables a Workspace's enterprise Connections (disabling revokes all open grants of that Connection), but granting or revoking an operation of a Connection for an individual Project remains strictly the authority of that Workspace's owner (`connector.admit_project_owner`). **Amended on 2026-09-28 by C-030:** the Workspace owner binds and unbinds a whole Connection for a Project, under a Project-local name. There is no grant per operation, and disabling a Connection ends its bindings. **Partly superseded on 2026-09-29 by C-032:** there is no GitHub organization to connect and no Factory to administer, so the clauses about them no longer apply. Still in force: the installation administrator role in Conexus IAM and its grant and revocation rules, sharing a model account with everyone in the installation (in a Conexus table under C-032), and the Connection carve-out as C-030 amends it. | [Permission contract](../product/permission-contract.md#11-installation-administration) | An installation needs more than one administrative tier, an administrator must also reach Project content, or the Factory has to decide administration on its own |
| C-027 | The Hub may host the sign-in and the endpoint of a Factory custom provider when the Factory cannot, and the Factory's credential row stays the only custody, so the Factory remains the single owner of model accounts under C-022 and C-025. Google AI Pro is the first case: the Factory's OAuth registry is closed. A person signs in to Google from Settings, and the Antigravity auth record that CLIProxyAPI writes becomes that person's Factory `api_key` row under `google-ai-pro`, shared with everyone only through the C-025 action. The installation's custom provider row holds no key. It points at a loopback router in the Hub, which starts, reuses and stops one CLIProxyAPI process per record, each with a throwaway copy of that record. No Google secret is stored in Conexus Postgres or `hub.env`. Decided by the owner, Leandro, who asked for this adapter on 2026-09-22. **Amended on 2026-09-29 by C-032:** Google AI Pro stays, and its credential moves from the Factory's row to a Conexus table. | [Google AI Pro adapter](../../apps/hub/src/builder/google-ai-pro/), [Factory adoption task](../tasks/factory-adoption.md#google-ai-pro-on-the-pilot) | The Factory lets a host add an OAuth provider or a per-person custom provider, CLIProxyAPI changes its auth record or management API, or Google starts rotating the refresh token so a stored record goes stale |
| C-028 | Stage 2 realizes the first generated-application profile as a **managed application platform**. Project Git remains the source of truth for browser source, server business handlers, Project migrations and the application manifest. Mastra Factory remains the development harness; Conexus owns the managed application profile, Project application data allocation, app access, enterprise Connector grants, Release identity and Publish. Generated privileged code runs outside the Hub and receives only Project/environment-scoped authority. A Project does not initially receive its own permanent backend/container/cloud deployment. The broader standalone software-factory profile is deferred until a named application proves the managed profile insufficient. Q1-Q5 in the Stage 2 reference qualify the realization one material boundary at a time. **Amended on 2026-09-29 by C-033:** new applications use REACT_VITE_V2; existing REACT_VITE_V1 artifacts stay readable. **Partly superseded on 2026-09-29 by C-032:** the development harness is the Builder on a Conexus harness over Mastra's engine, not the Mastra Factory, and Project Git becomes the Conexus Git on the Hub. Everything else stays in force. | [Stage 2 managed application platform](../reference/stage2-managed-application-platform.md), [Product contract](../product/contract.md) | Q1 cannot establish a safe generated-code boundary; a real application requires a long-lived/custom server process or deployment ownership that the managed profile cannot express; or the operator changes the product direction |
| C-029 | Every call a Connector makes to an external system is recorded by the platform, always, through Mastra's native observability. The record holds when each call and each provider request started and ended, the Project, the consumer, the operation, each provider request (service or endpoint name, step, attempt), the provider's HTTP status and envelope status, and the result. A provider's detailed error code comes only from the content capture below, never from the always-on record. Content (inputs, outputs, bodies, business data) is captured only when an installation administrator turns capture on for a limited time, and the capture records who turned it on and when. Credentials, tokens and keys are never recorded, not even under capture. Decided by the operator on 2026-09-26. Amended on 2026-09-27, before merge: the provider's error code moved from the always-on record to content capture, because two independent reviews showed that reading it from provider text can record an echoed credential. Consequence: the always-on record is built now, and content capture is built when a real diagnosis needs it. | [Integration logging research](../research/integration-logging.md), [Connector record](../../apps/hub/src/connectors/record.ts) | Mastra observability cannot hold a field the rule needs, or the cost or retention of the always-on record becomes material |
| C-030 | Each external system reaches Conexus through one **integrator**: Sankhya, Google, TOTVS, Mercado Livre and so on. Every integrator follows one platform pattern: a `ConnectorDefinition` and an adapter that owns the vendor's native request format, authentication, pagination and read rule. A **Connection** is one configured account of an integrator, and a company may hold several Connections of one integrator. An installation administrator creates a Connection. A Workspace owner **binds** it to a Project under a Project-local name, such as `erp`, and the binding is the whole grant. The Builder tool, Builder scripts and application handlers send requests in the vendor's native format through one executor in the Hub. Each Connection has one coarse access level: read now, and write only after Conexus validates writes with a real application. The vendor-side principal makes a Connection read-only, and the Connection records who confirmed it. The executor keeps a check of read and write services as a tripwire. There is no operation catalog, no request DSL and no per-operation grant. Decided by the operator on 2026-09-28. Amends C-021 and C-026, and supersedes decisions 4, 6 and 7 of the [Q4 task](../tasks/stage2-q4-sankhya-connector-qualification.md#3-operator-decisions-2026-09-24) ([details](#decided-on-2026-09-28-one-integrator-per-external-system-c-030)). | [Product contract, section 12.6](../product/contract.md#126-integrations), [Q4 task amendment](../tasks/stage2-q4-sankhya-connector-qualification.md#amendment-2026-09-28-the-question-is-connector-generic) | A vendor cannot give a read-only principal for an integrator the company needs; the Sankhya expression subquery gap is reviewed before the first external customer; a second integrator cannot follow the pattern without a change to the executor; or a real application needs to write |
| C-031 | Conexus designs its own screens, structure and page patterns; `@mastra/playground-ui` supplies only parts. Basic parts (`Button`, `Input`, `Select`, dialogs, menus and the rest) are preferred, repainted with Conexus tokens. Agent display parts (`Composer`, `MessageScroller`, `MarkdownRenderer`, the `ai/*` run display) are allowed, because they render a Mastra run. Structure blocks (`AppShell`, `MainSidebar`, `ChatShell`, `new/settings`) are frozen: existing uses stay, no new screen or section adopts one. The Mastra Factory's own screens are a feature reference, never a layout to match. `scripts/check-web-style.mjs` fails a `.tsx` class with a Conexus prefix (`cx-`, `cxs-`, `builder-`) that no CSS file defines. Decided by the operator on 2026-09-28. | [conexus-frontend skill](../../.agents/skills/conexus-frontend/SKILL.md) | The frontend phase after Q4 decides the frozen structure blocks, or a screen needs a Mastra structure block that has no reasonable Conexus equivalent |
| C-032 | **CURRENT (operator, 2026-09-29).** This is the accepted direction. `main` has run it since #380 merged on 2026-10-01. The Builder runs on a Conexus harness on Mastra's engine: an `AgentController` over `createCodingAgent` of `@mastra/core`, with a Conexus prompt, two modes (Planejar and Construir) and a Conexus tool contract. The Mastra Factory and Mastra Code leave the Hub. Each Project's source is a Git repository on the Hub whose `main` is the admitted revision. Only the Hub moves `main`, by fast forward from the run's own base. No GitHub App, forge or GitHub call remains in Project creation, a run or the source views. Model accounts belong to Conexus: one account per person per provider, sealed with the Conexus envelope, shared at one of two levels, just me or everyone in the installation. Only an installation administrator shares with everyone (C-026). Model calls run in the Hub, and the sandbox holds no secret. Supersedes C-022 and C-025. Amends C-027: Google AI Pro stays, and its credential moves from the Factory's row to a Conexus table ([details](#decided-on-2026-09-29-the-builder-off-the-factory-c-032-and-the-app-stack-v2-c-033)). **Amended by [spec 0004](../tasks/specs/0004-builder-prompt-skills-memory/index.md):** the Builder has one mode, `build`, in place of Planejar and Construir. It plans through the skills `conexus-plan-new` and `conexus-plan-change`, and the person approves the plan on the `submit_plan` card. **Amended on 2026-10-01 by the operator:** the Mastra Code product (its agent, its TUI and its own modes) leaves the Hub. `@mastra/code-sdk` stays as a library dependency, pinned to an exact version and covered by tests. The Builder pull requests use it for the Claude subscription (sign-in, refresh and model), the ChatGPT subscription (device-code sign-in, refresh and model), the sandbox filesystem (`SandboxFilesystem`), error classification (`parseError`) and the eval's Claude login. Conexus does not copy that code, because Mastra maintains these unofficial subscription flows for its own product, so a provider's change reaches Conexus as an upgrade. Credentials stay in Conexus's sealed `model.model_account` table, and the Hub keeps its own refresh coordinator. | [Builder own harness task](../tasks/stage2-builder-own-harness-qualification.md), [C-020 reference](../reference/builder-c020-mastra-native.md) | A Mastra upgrade breaks `AgentController` or `createCodingAgent`, which are beta; `@mastra/code-sdk` moves or removes an import Conexus uses, or its upgrade path breaks; a company needs Project source, history, pull requests or CI on a forge; or a company needs to share a model account with named people |
| C-033 | **CURRENT (operator, 2026-09-29).** This is the accepted direction. `main` has built new apps on REACT_VITE_V2 since #380 merged on 2026-10-01. The generated-application profile of C-028 moves from REACT_VITE_V1 to REACT_VITE_V2. A new app is built on a fixed stack, which the Builder pull requests must pin in `apps/hub/compiler-template/package.json`: React 19, TanStack Router, Query and Table, shadcn components on Base UI with Tailwind 4, Recharts, react-hook-form with zod, date-fns and lucide icons. An app imports only that list, and the Builder cannot install a package. Screens call the server through a client that the platform generates from `conexus/manifest.json`. One Hub-owned check, the bundle the Hub delivers to `/opt/conexus/check/<sha256>/main.mjs` (spec 0012), admits a revision with five steps: `generate`, `typecheck`, `build`, `server` and `boot`. The Builder runs the same check as the `conexus_check` tool, and admission never executes a file from the candidate. A type error blocks admission. A failed `boot` is reported and never blocks, so admitted source stays repairable (C-020 amendment). Apps take their look from one neutral set of Conexus tokens. Artifacts built on REACT_VITE_V1 stay readable. Amends C-028 ([details](#decided-on-2026-09-29-the-builder-off-the-factory-c-032-and-the-app-stack-v2-c-033)). | [Builder own harness task](../tasks/stage2-builder-own-harness-qualification.md), [spec 0003](../tasks/specs/0003-app-stack-v2/index.md), [roadmap Technology baseline](../roadmap.md#technology-baseline) | A dashboard needs a chart that Recharts lacks; the eval shows models failing repeatedly on Base UI or TanStack Table v9; the check or the sandbox start in E2B is too slow for a turn; something outside an app needs to call it; or a company style needs more than tokens |
| C-036 | A Builder conversation is private to the person who started it. Each person has one Mastra resource in a Project, in place of one resource per Project, so a person lists and opens only their own conversations. The person who started a conversation pays for every turn in it, a resumed turn included. It is built with specs 0005 and 0006, in the Q5 preparation. Until then every conversation stays visible to every Project member, as C-032 says, and a run waiting on a question ends after the configured wait (30 minutes, spec 0011), so the Project can build again. Decided by the operator on 2026-10-02. Amends C-032, whose consequence was that every conversation is visible to every Project member until private conversations return ([details](#decided-on-2026-10-02-the-order-of-work-to-q5)). | [Builder conversations](../../apps/hub/src/builder/conversations.ts), [spec 0002](../tasks/specs/0002-builder-own-harness/index.md) | Two people need to work in one conversation, or a Project member needs to see or stop another person's conversation |
| C-OS-001 | The public ecosystem domain is `conexus.fun`, with the route convention `/<product>`. This repository owns Conexus OS only. Ingress mechanics are deferred. | Operator mission, [Product contract](../product/contract.md) | Ecosystem naming changes, or deployment realization needs ingress selected |

## Decided on 2026-10-03: a sound base before the screen check and Q5

The operator moved the structural waves of the [order of work](../roadmap.md#order-of-work-to-q5)
ahead of the screen check and Q5, after the Q4 proof showed the Builder's run lifecycle patched
eight times around one premise: that an answer to a question is a new run.

| Decision | Consequence |
| --- | --- |
| The phase 2 waves (Subtract, S2, S4, S3, S1, S5, CI) come before the screen check and the Q5 preparation. | Neither is built on shapes the waves replace. Q5 starts later and is not built twice. |
| S2 moves ahead of S3 and S4. | S2 settles who owns the session, the sandbox and an open question; S4's reaper is designed on those lifetimes. |
| A question whose Mastra session ended ends with it, as in Claude Code. | The person's next message carries the answer, and the agent asks again if it still needs to. S2 (spec 0011) removed the resume of a question after its session is gone and replaced the 7-day limit of C-036 with the configured wait. |
| Every wave follows one method: census against Mastra and similar tools, redesign from first principles, a proved blast radius, a spec the operator approves, one pull request from HQ. | Nothing stays in a wave only because it exists. |
| The design of the Builder leaving the Hub process is part of phase 2, right after S2. | Building it may come after Q5. |

## Decided on 2026-10-02: the order of work to Q5

The operator approved the [order of work to Q5](../roadmap.md#order-of-work-to-q5) on 2026-10-02,
with C-036, the C-023 amendment and these decisions. They answer the open questions of a code audit
of `main` taken on 2026-10-01.

| Decision | Consequence |
| --- | --- |
| A Builder turn has no time limit for now. | Two guards stay: a turn ends after 10 minutes with no event from the agent (`TURN_SILENCE_MS` in `run/turn.ts`), and one model step ends after 5 minutes (`BUILDER_MODEL_STEP_TIMEOUT_MS` in `harness/controller.ts`). Telemetry measures how long turns run. If a turn is seen looping, the brake is a step limit, Mastra's `maxSteps` or `stopWhen`, not a time limit. |
| The paused E2B machine of an idle conversation is kept 7 days, then deleted. | Decision 5 of the [spec 0002 amendment](../tasks/specs/0002-builder-own-harness/index.md#amendment-2026-09-29-a-conversation-owns-its-sandbox-and-its-branch) stands. The branch mirror keeps the files, so the limit costs speed, never work. |
| The daily backup is copied off the pilot machine to a free cloud folder, for now. | A lost disk or WSL image no longer takes the database, the Project source and the keys with it. The copy holds the sealing keys with the data they seal, so it is encrypted before it leaves the machine. |
| Two risks are accepted for the pilot: another Project's table names are readable in the shared application database, and the prompts of a deleted Project stay up to 30 days in the traces. | The [security reference](../reference/security-and-authority.md#8-risks-accepted-for-the-pilot) records both and when they reopen. |
| A crash alert goes to the operator over Telegram. | The supervisor of the Hub and the runner, and spec 0008's `alerts.telegram.chat`, send there. The bot is set up later. |

## Decided on 2026-09-29: the Builder off the Factory (C-032) and the app stack v2 (C-033)

The [Builder own harness task](../tasks/stage2-builder-own-harness-qualification.md) records the
qualification status for both decisions on one branch. Its closure set holds the acceptance criteria, and its deciding proof is
the declared browser run and the three-case eval. The reasons below summarize the task's
[Why](../tasks/stage2-builder-own-harness-qualification.md#why), which cites the specs' rationale
and the tests line by line.

### Why C-032

- **The Factory's prompt speaks for another product.** The Builder's rendered prompt opens as
  "Mastra Code, an interactive CLI coding agent" and spends most of its length on git, pull requests
  and npm. Conexus's rules come last, at about 6 percent, below a repository's own `AGENTS.md`. No
  configuration of the Factory stack changes that identity.
- **The Factory brings tools and custody the product does not use.** 17 Factory `source_control_*`
  tools reach the Builder with a real installation token, outside its deny list. A GitHub App per
  installation and source on a forge are costs that people who do not code never asked for. The
  Factory's Work, boards and pull request surface have no consumer in the Hub.
- **Keeping Mastra Code as a library keeps the wrong identity.** Mastra Code never passes a product
  name to `buildBasePrompt`. Dropping only the Factory still means rebuilding the credential store,
  the GitHub path and the skills loader.
- **C-022 names this reopen trigger itself:** the custody decision that puts a Project's source on
  a forge is reversed.

### Why C-033

- **The product is dashboards and forms.** V1 has no component, chart, router or form library, so
  the Builder writes every table, chart and form by hand.
- **The V1 gate is the candidate's own file.** Admission runs `conexus/check.sh`, which the Builder
  can edit. It cuts the refusal reason at 400 characters, it never shows the model a screen error,
  and nothing type checks the code.
- **Base UI over Radix is a measured choice.** Under the Preview's `style-src 'self'`, a Radix
  dialog logs a CSP violation on every open. The Base UI set logs none.
- **The manifest already is the contract.** The generated client derives from it, so a renamed
  field fails `typecheck` before a person sees the app.

### Consequences

These hold once the Builder pull requests merge.

- Conexus maintains the prompt, the mode logic and the Git store. Mastra fixes to those parts no
  longer arrive by upgrade. The subscription sign-ins come from `@mastra/code-sdk` as a library, so
  their fixes do arrive by upgrade (operator, 2026-10-01). Each copied file keeps its Apache 2.0
  notice and names its source and version.
- Losing the Git folder loses Project source. The backup of that folder with the database dump is
  part of the switch.
- Every conversation is visible to every Project member until private conversations return.
- An app's first-load JavaScript grows from about 60 KB to about 280 KB gzip, and the E2B image grows
  by about 170 MB. Components are copied into each app, so a later fix does not reach old apps.
- The Dev Factory in `~/dev-factory` is a different system and does not change.

### What C-032 and C-033 replace

- C-022: the Factory as a Project's development environment, and the model credentials it holds.
- C-025: model accounts stay with the Factory, whole. The two sharing levels survive in Conexus
  tables.
- The clause of C-027 by which the Google AI Pro record becomes a Factory `api_key` row.
- In C-028: the REACT_VITE_V1 profile (`apps/hub/migrations/0014_agent_user_template.sql:42`), for new
  builds. The Builder pull requests must add a migration that pins REACT_VITE_V2. On the Builder
  branch it is `0037_application_stack_v2.sql`.

## Decided on 2026-09-28: one integrator per external system (C-030)

The operator took these decisions on 2026-09-28, after two independent plans reviewed the Q4
spike and the connector code on `main`. C-030 in the table above states the rule. This section
holds the reasons, the consequences and what C-030 replaces. The
[Q4 task amendment](../tasks/stage2-q4-sankhya-connector-qualification.md#amendment-2026-09-28-the-question-is-connector-generic)
turns it into the gate's question and evidence.

The terms map to records like this:

| Term | What it is |
| --- | --- |
| Integrator | The platform's support for one external system: a `ConnectorDefinition` and its adapter. Generic means one pattern and one executor for every integrator. It does not mean one integrator for every vendor. |
| Connection | One configured account of an integrator in a Workspace: its credential, its pinned destination, its access level and its read-only confirmation. |
| Project binding | A Workspace owner's choice that a Project reaches one Connection under a Project-local name, such as `erp`. |
| Executor | The one Hub path that sends a native request for a bound Connection, for every consumer. |

### Why

- **The name a handler calls is the contract of every generated application.** A handler written
  against an operation id such as `sankhya.purchase-order.read` must be migrated when the id
  changes. A handler that calls `connectors.fetch({ connection: 'erp', ... })` keeps working when
  the Workspace replaces the account behind `erp`. The change costs one migration now, before
  generated applications depend on the old name.
- **One Connection per integrator is too few.** Migration `0029_connector.sql` allows one open
  Connection per integrator per Workspace (`connection_open_key`). A company with two Sankhya
  databases or two Mercado Livre accounts cannot be represented.
- **A per-operation contract makes the platform the bottleneck.** Each new application question
  needs a new platform operation with its own input and output contract. The Builder must build and
  change an application without one.
- **A transport check cannot make a native query read-only.** In Sankhya,
  `CRUDServiceProvider.loadRecords` takes `criteria.expression`, a SQL fragment. The Q4 spike's
  native read check admits a subquery inside it. An allowlisted expression grammar would be a
  query compiler, which the native-format direction rejects. The boundary that works for every integrator is the
  vendor-side principal: a read-only ERP user, a read-only OAuth scope, or a read-only database role.

### Consequences

- A Project reaches a Connection only through a binding. Another Project, a removed binding or a
  disabled Connection reads nothing.
- The installation administrator keeps the Connection and its credential, as C-026 states. The
  credential and the vendor token never leave the Hub. The request path is relative to the
  Connection's pinned origin. There is still no universal privileged `fetch(url, secret)`, as
  [security section 3](../reference/security-and-authority.md#3-egress) requires.
- The per-operation path is deleted once its callers move to `connectors.fetch`:
  `connectors.call`, the handler port's `/v1/call` route, the `sankhya.purchase-order.read`
  operation and the per-operation rows of `connector.project_grant`.
- The Project binding is a new record, qualified by Q4. It does not restore the connection bindings
  removed on 2026-09-19.
- C-029 applies unchanged to every call through the executor.

### Known limit

The Sankhya subquery gap stays open. A subquery in `criteria.expression` can read any table the
integration user can read, including user and system tables that are not entities. The tripwire
does not close the gap. A Sankhya integration user limited to named tables closes it at the
vendor. The gap is reviewed before the first external customer.

### What C-030 replaces

- Decisions 4, 6 and 7 of the Q4 task, of 2026-09-24. Decision 4 put the read boundary in the
  broker's allow-list and never relied on the credential's scope. Decision 6 built a per-operation
  Project Grant. Decision 7 made an operation, with its own input and output contract, the thing a
  consumer calls. The allow-list stays as the tripwire.
- The clause of C-026's 2026-09-26 amendment by which a Workspace owner grants or revokes an
  operation of a Connection for a Project.
- The phrase of C-021 by which an enterprise connection reaches a Project "as authorized
  capabilities".
- The Project Grant of [contract section 12.6](../product/contract.md#126-integrations) that
  selects operations.

## Decided on 2026-09-23

The operator decided this on 2026-09-23, after the independent reviews of the first Stage 2 Q1
candidate. The [Stage 2 reference](../reference/stage2-managed-application-platform.md#database-topology)
records the topology, and the [Q1 task](../tasks/stage2-q1-handler-runtime-data-qualification.md)
qualifies it. C-028 is unchanged, because Conexus still allocates Project application data.

| Decision | Consequence |
| --- | --- |
| Application data lives in an Applications PostgreSQL cluster, independent of the Hub's. | The Hub and its cluster are the Control Plane. The generated application runtime and the Applications cluster are the Data Plane. The two clusters may share one host. |
| The Applications cluster has storage that is bounded and separate from the Hub's critical storage. | The bound covers PGDATA, `pg_wal`, the server logs and the temporary files. Two container volumes on one filesystem without a size limit do not qualify. |
| Inside the Applications cluster, one database `conexus_apps` holds one schema per Project × environment, each with a migration role and a runtime DML role. | No PostgreSQL server, database or container per Project. |
| Q1 proves containment, not resistance. | Exhaustion or total failure of the Applications PostgreSQL must stay in the Data Plane and must neither take down nor corrupt the Control Plane. If the separation does not protect the Hub, Q1 stops with the evidence. |
| In the first version, Q1.8 proves containment structurally. | The pilot shows separate clusters, no application data or Project role in the Hub cluster, a fixed-size preallocated filesystem for all of the Applications cluster's storage, an enforced memory limit, and the Hub serving while the Applications container is stopped. Active capacity and failure tests return on the first of: a second Project with real users, the first Publish, or evidence of a noisy neighbour. |
| A periodic per-Project quota does not replace the separation. | A quota does not protect the Hub from memory, WAL, I/O or bursts. It may return for fairness between Projects. |

Reopen fairness between Projects inside the Applications cluster on the first of: a second
Project with real users, a Project that consumes a material part of the cluster's storage, or
evidence of a noisy neighbour. Reopen the placement of Preview and Published data at the first
Publish.

## Decided on 2026-09-22

The operator decided these on 2026-09-22, after an independent review of the study on sign-in,
tenancy and model accounts. The [architecture guide](../reference/architecture.md#one-owner-per-concept) applies
them concept by concept.

| Decision | Consequence |
| --- | --- |
| Every concept that Conexus and the Mastra Factory both touch has exactly one owner. | The other side holds only an explicit link to the owner's record, never a parallel copy. The architecture guide names the owner of each concept. |
| Keycloak is the only sign-in door. | The Factory runs behind the Hub with an auth provider that only reads the existing Hub session, as the operator approved later on 2026-09-22 in place of `auth: null`. The provider signs nobody in, so it is not a second door. The Factory's own routes then name the caller themselves, and the Hub stops reimplementing their request context. Conexus links identity by issuer plus subject. Keycloak says who a person is, and Conexus IAM says what they may do, so no Keycloak role or group authorizes anything. The sign-in pages get a Conexus theme later, with Keycloakify. This keeps C-015. |
| One installation is one Factory organization. | Workspaces, membership, roles and invitations are Conexus IAM only. The Factory holds no roster. **Superseded by C-032 on 2026-09-29:** the Factory leaves the Hub. Workspaces, membership, roles and invitations stay Conexus IAM only. |
| Conexus IAM gains an installation administrator role, distinct from Workspace owner. | The role authorizes installation-wide actions, such as connecting the company's GitHub organization and sharing a model account with everyone. It does not grant access to every Project. This amends C-024, which said a Workspace owner connects GitHub. |
| Model accounts follow C-025. | The Factory owns them with its two native sharing levels. Conexus builds no grant list and no parallel resolver. **Superseded by C-032 on 2026-09-29:** model accounts belong to Conexus, shared at the same two levels. |
| The Hub is the single writer of tool policy. | The browser may only approve or decline a pending call. The agent runs with `yolo` inside the sandbox, with the GitHub tools denied. One honest line tells the person that the agent has internet access in its sandbox, as C-023 accepts. |
| Conversation visibility is a Conexus Project policy. | Its default is private, only the person who created it, as the operator decided later on 2026-09-22; its transitions are still to decide. Conexus enforces Project authority on every read. Any Factory visibility field is derived from the policy and never edited on its own. Conversations are created through the Factory's own session route, which writes `org` until [mastra-ai/mastra#24689](https://github.com/mastra-ai/mastra/issues/24689) lets the Hub pass `private`; `org` is the interim. **Amended by C-032 on 2026-09-29:** every conversation is visible to every Project member until private conversations return. |

These are known technical follow-ups, not decisions:

- Factory credentials must be encrypted, through the Factory's `secretEncryption`, before anyone
  connects a model account.
- The per-person credential path runs through the Factory's own resolver, which the Factory registers
  because the Hub-session auth provider is set. `builder-model-accounts.postgres.test.mjs` qualifies
  it with two accounts.

## Decided on 2026-09-25, from the single session qualification

These rows come from the [single session qualification](../tasks/single-session-qualification.md), whose verdict the
operator gave as ACCEPT on 2026-09-25 ([evidence](../evidence/single-session/README.md)). The operator accepted both
rows that day, in the chat with the manager.

| Decision | Consequence |
| --- | --- |
| **Accepted by the operator on 2026-09-25**, in the chat with the manager. A Keycloak disable or logout ends an existing Hub session, and the Previews it opened, within five minutes, through the same check the application session uses (operator decision 2 of the task). | Replaces the open question "whether a Keycloak disable or logout must end an existing Hub session". Reopen on a requirement to end sessions at the instant of a Keycloak logout (back-channel logout). |
| **Accepted by the operator on 2026-09-25**, in the chat with the manager. When a due Keycloak check cannot reach Keycloak, every Hub route answers 503 `identity-provider-unavailable`, the Factory's routes included, and the session is kept. | The operator accepted "the session is kept, the Hub answers 503, the Factory answers 401" (D4); the Factory's routes answer 503 instead, because the Hub's own check runs before Mastra's auth. |

## Amended on 2026-09-20

C-021 is an operator product amendment. It does not retire C-020, which still owns
authorization, source custody, execution settlement and artifact identity. It replaces
two of that decision's premises and leaves the rest standing.

One rule that sounds like a replaced premise is not one. **There is still no second
conversation store.** Several conversations per Project is a product requirement about
how many conversations a Project offers, not a licence to build a Conexus-owned message
lifecycle beside the framework's. Whatever composition the qualification recommends, the
conversation's messages stay in the framework's store.

| Premise of C-020 | What replaces it |
| --- | --- |
| One Mastra Thread per Project. | A Project offers several persistent conversations. How each one maps onto a Thread, a Session, a `resourceId`, a scope or an owner is deliberately unanswered and belongs to the [Sessions and Work qualification](../tasks/sessions-work-qualification.md). |
| The conversation is subordinate to a run: a run owns the turn and the conversation projects it. | A conversation is general, and can explain, investigate, develop, test and use authorized capabilities. Whether `BuilderRun` stays, narrows or disappears is open, and nothing may be removed from it before the qualification answers that. |

| Decision | Consequence |
| --- | --- |
| Factory is the preference to qualify for the SDLC, not an adopted mechanism. | Nothing installs or activates it on this evidence. Conexus does not reimplement triage, planning, coordination, review or re-review that the native mechanism already offers adequately. **Superseded by C-022 on 2026-09-20:** the qualification ran, and the Factory is adopted. The second sentence still holds. |
| Sessions and Work do not oblige two separate compositions. | The qualification compares reusing the Factory composition for both against a native Controller for interaction integrated with Factory for Work. Neither is chosen in advance. |
| Before proposing a Conexus-owned mechanism, the need must be concrete. | A named requirement, the examined API and version, the proven limitation, and a smaller configuration, composition or integration considered first. A gap does not authorize a fork or a parallel engine; it goes back to the planner. |
| Each increment ends in a usable, verified result. | Only the next increment is planned in detail. No layer is restructured wholesale ahead of a result that stands on its own. |

## Decided on 2026-09-20, after the integrated Factory run

| Decision | Consequence |
| --- | --- |
| Factory-centered is selected, not merely confirmed. | The next adoption work builds on the Factory rather than comparing it again. The custody consequence it carries, a Project's source on a forge with a GitHub App per deployment, is accepted with it. **Superseded by C-032 on 2026-09-29:** the Builder runs on a Conexus harness, and a Project's source is a Git repository on the Hub. |
| Model authentication is the Factory's, whole. | `[probe]` the Factory's own OAuth login for a ChatGPT subscription answered a real turn, so the native path is not a plan. Conexus builds no adapter onto it, and does not keep its own model credential custody because it already exists. **Superseded by C-032 on 2026-09-29:** model accounts belong to Conexus, and model calls run in the Hub. |
| The removal is subtractive, not additive. | The Conexus model subsystem is removed in the same work that wires the native path, never left running beside it. Nothing is removed in the qualification pull request, which would turn a qualification into a runtime migration. |
| Enterprise connections are a different subject. | Sankhya and the Workspace's enterprise integrations stay Conexus's, and reach a Project as authorized capabilities. C-022 is about model connections only, and says nothing about them. |

## Decided on 2026-09-19

| Decision | Consequence |
| --- | --- |
| Do not define what we will not use. | The Project Baseline concept left the product contract rather than being redefined. Project Inception, the Brain, connection bindings, Sankhya, the capability gateway, the Managed Application Runtime and the R3 program were removed with it. They return only as future features on this base, each with its own plan. |
| The `project.manage` Permission is retired. | Its Published-App access, archive and duplicate consumers were contract for surfaces never built. Its candidate-review, explanation and binding consumers left with Inception, the Baseline, the Brain and the bindings. Nothing wired remained, so the Permission is gone rather than waiting for a consumer to be invented. |
| A plain member may share their own model connection into a Workspace. | This is settled behaviour, not an open question. Sharing a connection is not an owner-only act. **Withdrawn by C-022 on 2026-09-20:** the model connection and its Workspace share were removed with the subsystem, and `connection.share` left `iam.action` in migration 0009. |
| Model selection stays Mastra-native. | Conexus adds credential custody and sign-in. It does not add a model abstraction of its own. **Amended by C-022 on 2026-09-20:** the custody and sign-in half is withdrawn, and model credentials move to the Factory with the rest of model authentication. **Amended by C-032 on 2026-09-29:** model credentials move from the Factory to Conexus tables. |
| No independent verifier agent per pull request. | The merge gate is CI `verify` green on the exact head SHA plus the coordinator reading the diff. A unit that changes behaviour ships the test that would fail without it. |
| Tests serve the product. | Never reshape a product or schema design because a test or fixture would break. Build the correct shape, fix every test that exercised real behaviour, and delete every test whose subject is gone. |
| Multi-account lands at the minimum that is correct. | Delivered. An invited person must already exist in the identity provider with that exact address, marked verified. |
| When a run's author loses access mid-run, `claim_*` refuses and `settle_*` still records work already done. | Work already performed is never silently discarded. |
