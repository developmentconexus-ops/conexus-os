# Conexus OS roadmap

This file owns the status of the stage gates and names the current gate. Workstreams (frentes) live in the private
`conexus-hq` repository, and this file never names them.

## What Conexus is

Conexus is the platform a company uses to build, administer and evolve internal software connected to its own data and systems.

The development plane is Factory-centered:

```text
Account / Workspace / Project
        ↓
persistent Project conversation
        ↓
Mastra Factory / Code
        ↓
private Git repository
        ↓
Builder edits + checks
        ↓
Conexus build / Preview
```

Conexus owns Product authority that the Factory must not own: Account, Workspace, Project authorization, source admission, application runtime policy, enterprise capabilities, Release and Publish.

## Current trunk

Trunk is `main`.

The former `analysis/internal-mvp-2026-09-12` branch is historical. Pull requests target `main`.

## Stage 1 — closed foundation

The Factory-centered development foundation is delivered and has pilot evidence.

Current delivered base includes:

- Keycloak sign-in and Conexus IAM;
- multiple Accounts and Workspace membership;
- installation administration;
- Projects backed by private GitHub repositories;
- Mastra Factory/Code model authentication, model accounts and selection;
- persistent Project conversations;
- real-model Builder execution in E2B;
- source admission and stale-base refusal;
- fixed React/Vite application starter;
- compile, smoke and Preview;
- source/code/change inspection surfaces.

C-022 owns the Factory-centered boundary. The single-owner map owns every concept shared by Conexus and Factory.

Historical tasks and evidence remain records. They are not current execution paths.

## Stage 2 — managed application platform

The operator accepted the Stage 2 direction after an architecture review and an independent GPT-6 Astra challenge.

C-028 records the decision. The technical target and qualification program live in:

[Stage 2 managed application platform](reference/stage2-managed-application-platform.md)

The initial realization is deliberately a managed application platform:

```text
Builder
  ↓
Project Git source
  ├── browser app
  ├── server handlers
  ├── Project migrations
  └── application manifest
  ↓
Preview
  ↓
explicit Publish
  ↓
employee-facing managed app
```

The first Stage 2 profile does **not** require one backend/container/cloud deployment per Project. The later goal of a more general software-development harness remains a future application profile and must not enlarge the first one before evidence demands it.

## Stage 2 qualification gates

The gates below are sequential. Only the gate named under **Exact next action** has an actionable task.

| Gate | Protected question | Status |
| --- | --- | --- |
| **Q1 Handler runtime + persistent Preview data** | Can the Builder create server-backed app behavior whose generated code runs outside the Hub with Project-scoped persistent data and no privileged platform authority? | **ACCEPT_WITH_BOUNDARY** on the amended task, accepted 2026-09-23 after three review rounds and merged as `b90c54f7` (#196). Its boundaries and reopen triggers are in the [evidence](evidence/stage2-q1/README.md#verdict) |
| **Q2 Data programming model** | Is parameterized SQL sufficient for the Builder, or does measured evidence justify Kysely or a typed Data API? | **ACCEPT** on 2026-09-23. The Builder built the app and changed it three times with parameterized SQL in six runs; no failure repeated. The first sequence was voided by a pilot fault ([task §14](tasks/stage2-q2-data-programming-model-qualification.md#14-amendment-2026-09-23--pilot-fault-rerun), [evidence](evidence/stage2-q2/README.md#q21-attempt-2)) |
| **Q3 Application identity** | Can an employee use an application without gaining Control Plane authority? | **ACCEPT_WITH_BOUNDARY** on 2026-09-24, merged as `7f3dc0b7` (#210). An app-only employee signed in on the application's own host and wrote a note under their own name; every Q3.6 negative case was refused. Until Q5 the application host serves the last good Preview ([task](tasks/stage2-q3-application-identity-qualification.md), [evidence](evidence/stage2-q3/README.md)) |
| **Q4 First Connector** | Can a Project read a real enterprise system through a Connection bound to it, with Sankhya as the first integrator, by sending the vendor's own request format through one Hub executor, from the Builder while it investigates and from the application's handlers at runtime, while the credential and the vendor token stay in the Hub, no write reaches the vendor, a Project reads only through its own bindings, and the Builder builds and changes a useful application without a new platform operation? | **CURRENT GATE**. The task was amended on 2026-09-28 for C-030, which makes the question connector-generic. Part 1 is on `main` (#246); its custody and transport evidence is kept ([task](tasks/stage2-q4-sankhya-connector-qualification.md#amendment-2026-09-28-the-question-is-connector-generic)) |
| **Q5 Release + Publish** | Can the verified application become a stable URL through an explicit immutable Release/Publish transition without building a deployment platform? | WAITING FOR Q4 |

Do not create implementation tasks for Q2-Q5 before the preceding verdict. Their current question, candidates and evidence requirements live in the Stage 2 reference so they are not lost.

The sequence is a commitment order, not a dependency chain. Q5 depends on Q1's manifest rather than on Q3 or Q4. Exploration may therefore run ahead of the current gate. A spike that settles a gate's hypothesis runs on its own branch and worktree, is never merged, and ends in a report the gate's task cites. Work outside the gates follows the [lanes and work-in-progress limits](development/delivery.md#size-work-by-appetite-and-limit-work-in-progress).

## Technology baseline

A dependency enters only under the [technology rule](development/delivery.md#technology-rule).
Current baseline and challenger state:

- Fastify, Node, Zod/Ajv and pg: baseline mechanisms for Q1 where applicable;
- SQL/`pg`: the data programming model, accepted by Q2;
- Kysely: not qualified; Q1 and Q2 named no repeated SQL failure;
- Prisma, Drizzle, Hono, oRPC: deferred without a current falsifier;
- Nango/Pipedream/Composio: deferred until a real SaaS/OAuth or agent-tool Connector requires them;
- Airbyte/Debezium: deferred until a real replication/CDC requirement;
- pg-boss/Mastra Workflows/Inngest/Trigger.dev/Temporal: deferred until background/durable work is a current requirement;
- Novu/Knock: deferred until a real notification requirement;
- Cloud Run/Fly/Kubernetes/per-Project OCI deployment: future standalone/deployment profile, not Stage 2 prerequisite.

### Pending: the app stack v2 and the ChatGPT model path

These dependencies enter on the branch `feat/builder-own-harness`. They join the baseline when the
operator accepts [C-033](decisions/index.md#proposed-pending-the-operator) (the app stack) and C-032
(the ChatGPT model path), after the
[Builder own harness qualification](tasks/stage2-builder-own-harness-qualification.md). The sources
are study 17 (the app stack decision and its probe app, in the operator's study notes) and spec 0003
(`App stack`). Each row's alternative comes from study 17, section 2.2 (lines 87-100), and its CSP
and size measurements from section 2.3 (lines 114-125). Probes are tests in `tests/implementation/`,
cited by file and line at `40d9671d`. React 19.2.8, Vite 8.2.2 and TypeScript 6.0.2 stay as they
are in V1.

The compiler template pins the app stack in `apps/hub/compiler-template/package.json`. Its consumer
is every app the Builder builds, through the starter in `apps/hub/starter-template/files/app/`. An app
imports only these packages.

| Packages and exact versions | Consumer | Named limitation | Probe | Alternative, and why not |
| --- | --- | --- | --- | --- |
| `@vitejs/plugin-react` 6.1.1, `@tailwindcss/vite` 4.3.3 | `apps/hub/compiler-template/vite.config.mjs` | The Tailwind classes and the `@theme` token sheet need a compile step. The Hub web app builds with the same two plugins | `builder-app-starter-v2.test.mjs:147` | None named in study 17 |
| `@tanstack/react-router` 1.170.32 | `app/src/router.tsx`, code routes in one file | V1 has no router, so an app has one screen or hand-written routing | `builder-application-check.test.mjs:274` | File-based routes need a plugin and a generated route tree before `tsc`. One explicit file is easier for the model to read. Revisit past about 10 screens |
| `@tanstack/react-query` 5.102.8 | `app/src/main.tsx` and every screen that loads data through `api.gen.ts` | V1 screens use plain `useEffect` fetches with no cache, loading, error or invalidation state | `builder-application-check.test.mjs:129` | Plain `useEffect` fetches, which is V1 |
| `@base-ui/react` 1.8.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0 | The curated shadcn components in `app/src/components/ui/` | The Preview's CSP is `style-src 'self'` (`apps/hub/src/platform/application-csp.ts:4`), which blocks a library that injects a `<style>` element | Study 17 measured one CSP violation per Radix dialog open and zero for Base UI. `builder-app-starter-v2.test.mjs:171` | shadcn on Radix (`radix-ui` 1.6.7). Models know it better, but it breaks the CSP. Relaxing the CSP to `'unsafe-inline'` styles would be a security decision of its own |
| `tailwindcss` 4.3.3 | `app/src/styles.css`, the Conexus tokens in `@theme` | shadcn source assumes Tailwind. The look must come from tokens only | `builder-app-starter-v2.test.mjs:229` | Plain CSS, which shadcn source does not use |
| `recharts` 3.10.1 | The CSP-safe `app/src/components/ui/chart.tsx` | V1 apps draw charts in hand-written SVG. shadcn's own `chart.tsx` writes an inline `<style>`, which the CSP refuses | `builder-app-starter-v2.test.mjs:171` | ECharts: more chart types and a larger bundle, with no shadcn wrapper. Revisit when a dashboard needs a chart Recharts lacks |
| `@tanstack/react-table` 9.2.4 | Tables in apps, taught by the `conexus-app-code` skill | V1 tables are written by hand | `builder-skill-examples.test.mjs:69` | v8.21.3, which models know better. shadcn's data table is already on v9, so the skill carries a worked v9 example |
| `react-hook-form` 7.89.0, `@hookform/resolvers` 5.9.1, `zod` 4.6.5 | Forms, and the schemas in the generated `api.gen.ts` | The generated client needs a schema library, and a form must check the limits the runner enforces | `builder-client-generator.test.mjs:171` | TanStack Form 1.33.5: same family as Router and Query, but younger and less familiar to models |
| `date-fns` 4.4.0, `react-day-picker` 9.14.0 | pt-BR dates, and the starter's `calendar.tsx` | V1 has no date formatting or date picker. `react-day-picker` is the version the pinned shadcn `calendar.tsx` requires | `builder-app-starter-v2.test.mjs:171` | `Intl` only, with no date picker |
| `lucide-react` 1.47.0 | The starter components, generated with lucide icons | The shadcn components import their icons from it | `builder-app-starter-v2.test.mjs:147` | None. The Hub web app uses the same package |
| `@types/node` 24.19.0 | `tsconfig.server.json`, which type checks the handlers under `conexus/` | `typecheck` covers the handlers, and handlers import `node:` modules. It is never linked into the app's view, so screens cannot import `node:` | `builder-compiler-allowlist.test.mjs:81`, `builder-application-check.test.mjs:122` | No type check of the handlers, which is V1. Issue #342 asks to refuse `node:fs` in handlers, which this record contradicts |

The Hub itself gains two direct dependencies for the ChatGPT subscription path:

| Packages and exact versions | Consumer | Named limitation | Probe | Alternative, and why not |
| --- | --- | --- | --- | --- |
| `ai` 6.0.286, `@ai-sdk/openai` 3.0.114 | `apps/hub/src/builder/openai-codex/model.ts:12-13`, which calls an `openai/*` model on the Codex endpoint with the person's ChatGPT bearer | `@mastra/code-sdk` 1.8.3 resolved these versions, and C-032 removes it. `@mastra/core` 1.71.0 declares neither | `builder-openai-codex.test.mjs:219` | Keep `@mastra/code-sdk`, which keeps the Factory's model stack that C-032 removes |

Every application-architecture gate follows the
[Builder proof rule](development/delivery.md#builder-proof-rule).

## Stage 2 lie detector

The preferred end-to-end application is a small Metal Nobre **purchasing follow-up notebook**.

By Stage 2 completion it should:

- read a bounded set of open purchase orders from Sankhya;
- keep Conexus-owned follow-up notes/status separately;
- authenticate an employee who does not administer the Project;
- read through one Connection bound to its Project;
- be published at a stable employee URL.

The first gate does not need Sankhya or employee app identity. It proves only the server/data foundation using follow-up notes keyed by a purchase-order identifier.

## Explicitly deferred until after Stage 2 evidence

- Oracle and a second Connector facet;
- external-data sync/CDC;
- Jobs and background processing;
- Notifications;
- Automations;
- Brain;
- Agent Studio;
- generic template marketplace;
- standalone full-stack deployment per Project;
- cloud-provider abstraction.

These return only through a named real consumer and their own qualification.

## After Stage 2: planned order

Q1 to Q5 prove one thin journey end to end. They do not make Conexus a finished platform. The
operator agreed this order on 2026-09-23 as a plan, not a commitment. Each step becomes a task only
after the step before it has a verdict, and each technology enters only under the
[technology rule](development/delivery.md#technology-rule), with its own consumer.

"Code harness" here means the paved road of ready pieces the Builder assembles inside the managed
profile. The general software-development harness of the
[Stage 2 reference](reference/stage2-managed-application-platform.md#1-why-this-exists), a second
application profile with a backend per Project, is a different thing and stays future.

| Order | Step | Candidates from the [technology queue](reference/stage2-managed-application-platform.md#7-technology-qualification-queue) | Enters when |
| --- | --- | --- | --- |
| 1 | Code harness: events, React UI library, auth, roles and users, audit, telemetry, an implementation guide, and a set of global Conexus skills (server, identity, connectors, frontend) | Fastify, Zod and `pg` already selected. oRPC if handlers need end-to-end typed procedures. Drizzle or Prisma only if SQL-first fails | Stage 2 closes |
| 2 | Application templates built from the harness | None new | The harness has its first pieces |
| 3 | Server installation and operation: backups, Published operation, `conexus.fun` | Cloud Run or Fly only for the future second profile | The laptop pilot validates the journey |
| 4 | More integrations | Nango (OAuth SaaS), Pipedream or Composio (agent tool catalog), Airbyte or Debezium (sync, CDC) | The first Connector that needs each |
| 5 | Jobs and automations | pg-boss first, then Mastra Workflows, Inngest, Trigger.dev or Temporal | The first durable background job |
| 6 | Notifications | Novu or Knock | The first multichannel notification |
| 7 | Agent Studio: agents per Workspace or Project, copilot or active | Mastra agents and memory | A named agent consumer |
| 8 | Brain: the company's own knowledge, started fresh | Mastra memory and retrieval | A named knowledge consumer |
| 9 | Problem reports that become Factory issues, triaged and reviewed through the Factory skills | Mastra Factory work items and skills | A reporting flow is requested |
| 10 | Self-registration in chosen applications, for example a partners' app | Conexus-owned sign-up policy over Keycloak | A named external audience |

Steps 4 to 10 may reorder by real demand. Step 1 comes first because it shapes how everything after
it is built.

## Exact next action

**Execute the amended Stage 2 Q4 task: a Project reads a real enterprise system through a Connection bound to it, with Sankhya as the first integrator.**

[Stage 2 Q4 — Connector qualification, with Sankhya as the first integrator](tasks/stage2-q4-sankhya-connector-qualification.md#amendment-2026-09-28-the-question-is-connector-generic)

Protected question:

> Can a Project read a real enterprise system through a Connection bound to it, with Sankhya as
> the first integrator, by sending the vendor's own request format through one Hub executor, from
> the Builder while it investigates and from the application's handlers at runtime, while the
> credential and the vendor token stay in the Hub, no write reaches the vendor, a Project reads only
> through its own bindings, and the Builder builds and changes a useful application without a new
> platform operation?

The amendment's closure set says what closes Q4. The Connection, the Project binding and the
executor land on `main` as pull requests built from `main`, and the pilot then runs `main` for the
real proof. Spike branches never merge.

Q1 closed with ACCEPT_WITH_BOUNDARY ([evidence and verdict](evidence/stage2-q1/README.md#verdict)).
Q2 closed with ACCEPT: parameterized SQL through `pg` is the data programming model
([evidence and verdict](evidence/stage2-q2/README.md#q21-attempt-2)). Q3 closed with
ACCEPT_WITH_BOUNDARY in #210 (`7f3dc0b7`): an application has its own host, an app-only Account reaches it through a
one-use handoff from the Hub sign-in, and handlers receive the caller
([evidence and verdict](evidence/stage2-q3/README.md)). The Q4 task starts from the notebook
application Q3 left, whose handlers already know who is calling.

Q3 left one pending item by operator choice: the no-access page names the wrong reason when
Keycloak reports an unverified email ([finding 1](evidence/stage2-q3/README.md#findings)).

## What the operator still owes

- Confirmation from the Sankhya administrator that the integration user can only read. It does not
  block the work. Without it, Q4 closes at most ACCEPT_WITH_BOUNDARY.

## Before a production installation

The pilot runs the Hub on the operator's laptop as the operator's own OS user, with its secrets in
files only that user can read (mode `600`). That is sound for a pilot, where only the operator and
the Hub run as that user. It is not the shape of a production installation, and none of this blocks
Stage 2. Before Conexus runs anywhere other than the pilot:

- **A dedicated OS user for the Hub.** Anything else the operator runs, such as a script or a
  compromised `npm` package, must not hold the company's GitHub App key, the Factory secret key or
  the E2B key.
- **Secrets delivered by the service manager or a secret store,** not files in a home directory.
- **The Factory secret key held apart from the database it encrypts,** so one host compromise does
  not yield both. Encrypting model credentials today protects a leaked database dump, not a
  compromised host.
- **Storage for the Applications PostgreSQL separate from the Hub's,** as a separate volume or disk
  or a managed plan, sized independently.

The Stage 2 application runner is a separate question. Generated code never runs in the Hub or in
the runner process. It runs in a per-invocation worker under the runner's OS user, confined by
unprivileged namespaces: no view of the host's files, processes or network, and no credential (see
the Q1 evidence). On the pilot the runner shares the operator's user with the Hub. A production
installation also gives the runner its own OS user, apart from the Hub's secrets.

## Merge gate

The [merge gate](development/delivery.md#merge-gate) and the lanes that add to it live in the
delivery rules.
