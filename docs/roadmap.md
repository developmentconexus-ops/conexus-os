# Conexus OS roadmap

This file owns the status of the stage gates and names the current gate. Workstreams (frentes) live in the private
`conexus-hq` repository, and this file never names them.

## What Conexus is

Conexus is the platform a company uses to build, administer and evolve internal software connected to its own data and systems.

Under C-032 the development plane is the Builder on Conexus's own harness, built on Mastra's engine:

```text
Account / Workspace / Project
        ↓
persistent Project conversations
        ↓
Builder: AgentController over createCodingAgent (Mastra), one mode
        ↓
E2B sandbox, seeded by the Hub; it holds no secret
        ↓
Conexus Git on the Hub: main is the admitted revision
        ↓
platform check (conexus_check and admission)
        ↓
Conexus build / Preview
```

Conexus owns Account, Workspace, Project authorization, Project source, model accounts, the
Builder's prompt, mode and tools, source admission, application runtime policy, enterprise
capabilities, Release and Publish. The Mastra Factory and Mastra Code leave the Hub. Spec 0004
replaces the two modes of C-032 with one. The
[Builder own harness task](tasks/stage2-builder-own-harness-qualification.md) qualifies this plane.
`main` runs it, and the Factory-centered Builder of Stage 1 is gone.

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

C-032 supersedes the former Factory-centered boundary in C-022. The single-owner map owns every concept shared by Conexus and Factory.

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
| **Q4 First Connector** | Can a Project read a real enterprise system through a Connection bound to it, with Sankhya as the first integrator, by sending the vendor's own request format through one Hub executor, from the Builder while it investigates and from the application's handlers at runtime, while the credential and the vendor token stay in the Hub, no write reaches the vendor, a Project reads only through its own bindings, and the Builder builds and changes a useful application without a new platform operation? | **ACCEPT_WITH_BOUNDARY** on 2026-10-02, frozen for the operator's decision. On `main` at `f7967b81`, the Builder investigated the company's Sankhya with 20 native reads through the Project's binding, built a sales dashboard whose handler reads through it, and changed it in a second conversation. The Sankhya administrator has not confirmed that the integration user only reads, and the negative cases are proved in CI, not on the pilot ([task](tasks/stage2-q4-sankhya-connector-qualification.md), [evidence](evidence/stage2-q4/README.md#verdict)) |
| **Q5 Release + Publish** | Can the verified application become a stable URL through an explicit immutable Release/Publish transition without building a deployment platform? | **NEXT**, after the Q5 preparation in the [order of work](#order-of-work-to-q5) |

Do not create implementation tasks for Q2-Q5 before the preceding verdict. Their current question, candidates and evidence requirements live in the Stage 2 reference so they are not lost.

The sequence is a commitment order, not a dependency chain. Q5 depends on Q1's manifest rather than on Q3 or Q4. Exploration may therefore run ahead of the current gate. A spike that settles a gate's hypothesis runs on its own branch and worktree, is never merged, and ends in a report the gate's task cites. Work outside the gates follows the [lanes and work-in-progress limits](development/delivery.md#size-work-by-appetite-and-limit-work-in-progress).

Specs 0005 to 0008 build people, access, configuration and telemetry before the Q5 task exists.
They prepare Q5, whose proof needs an employee who is not a developer and signs in with their own
access. They are not the Q5 task, which starts once that preparation is done.

## Order of work to Q5

The operator approved this order on 2026-10-02. It changes no gate status. It says what runs beside
the current gate and in what order, inside the
[work-in-progress limits](development/delivery.md#size-work-by-appetite-and-limit-work-in-progress):
one qualification workstream and two shaped workstreams at once. The decisions taken with it are in
the [decision register](decisions/index.md#decided-on-2026-10-02-the-order-of-work-to-q5).

| Phase | Work | Ends when |
| --- | --- | --- |
| 0. Finish open work | The open CI pull requests, a `verify` median of 5 minutes or less, the verdicts of the open Context7, telemetry and configuration qualifications, a rule that a pull request is up to date with `main` before it merges, and one pull request that corrects the authority documents that describe code `main` no longer has | No work started before 2026-10-02 is still open |
| 1. Close Q4 | Inside the Q4 workstream: first the fixes where a person or data is at risk, then the guards, then the rest of the closure set | The Q4 verdict |
| 2. A sound base | The structural waves below, one at a time, before any feature is built on the current shapes. Amended by the operator on 2026-10-03 ([details](decisions/index.md#decided-on-2026-10-03-a-sound-base-before-the-screen-check-and-q5)) | Each wave's own check |
| 3. The screen check | The Builder checks the screens it built, below | The screen check's own list |
| 4. Prepare Q5, then Q5 | In this order, which the specs set: spec 0008 slice 1 (one session lifetime from one source, which may start during phase 1); spec 0006 (people and sign-in); experiment E1 of spec 0005, then 0005 slices 3 to 6 as one release; spec 0007 slices 2 to 4 with spec 0008 slice 4; the sandbox allowlist of C-023. Then the Q5 task | The Q5 verdict: a published application used by an employee who is not a developer |

Phase 1 fixes, each with its own behavior test:

- A run waiting on a question has an exit (an answer, a message, the configured wait, Stop or a Hub restart, spec 0011), and the answer is checked before the run changes state.
- One idempotent settle ends every run, and a failed settle write is retried and logged.
- Every error that reaches a person leaves a log line with a code.
- The Hub refuses a source bundle above a size cap.
- Deleting a Project kills its E2B machines.
- A failed poll no longer replaces a screen that has data with the error page, and each error
  message names the real cause.
- A supervisor restarts the Hub and the runner and sends a crash alert, and the Hub checks its
  schema version at boot.
- A daily backup runs with a restore check and a copy off the machine.
- A new run is refused above a Hub memory threshold. A turn has no time limit. The decisions of
  2026-10-02 say what guards it instead.
- A run cannot end as done while its app fails the check: the failure goes back to the agent in
  the same turn, up to three times, and a failure Conexus caused is retried without the agent.

Phase 1 guards land before any structural wave: a browser test harness against a real Hub, with
the Builder flows a person uses; a list of flows per review area that CI requires for every change
to that area; and the run states from one source that the Hub, the web app and SQL import.

Phase 3, the screen check, comes before the specs of phase 4:

- The Builder checks the screens it built as a person would, in a browser inside its sandbox, with
  sample data it writes in each operation's output shape. The sample data proves the screen shows
  what it receives, never that a number matches the source.

Phase 2 waves, in this order. The code quality diagnosis of 2026-10-02 set the waves. On
2026-10-03 the operator moved them ahead of the screen check and Q5, and S2 ahead of S3 and S4,
because S2 decides who owns the session, the sandbox and an open question, and the reaper of S4
only knows what expires once that is settled. The same day an audit of the whole codebase against
the [codebase principles](development/codebase-principles.md) added the ratchets, the failure table
and the sandbox tools, and widened S1; the operator approved that order.

1. **Subtract.** Delete what has no consumer or has the wrong shape: unused package scripts, proofs
   of closed gates, failure codes nothing produces, web routes with no screen, retired
   configuration, compatibility with old shapes, tests that read source text, second names for
   the same command.
2. **Ratchets.** CI fails when a file gains `as` casts, long functions or lines, when a test reads
   production source, or when a rule promises a check that does not exist. Each count may only
   fall.
3. **One failure table.** Every failure code, its category, HTTP status and person-facing text
   come from one table that the Hub, SQL, the web app and the starter template are generated
   from. A platform failure never tells the person to try again. It comes before S2, which adds
   end reasons.
4. **S2.** The run as one state machine. One Mastra session and one sandbox per conversation; a
   question is a wait inside the run, answered on the live session; the browser and the agent share
   that session; one SQL builder for the run summary; a candidate checked once. A question whose
   session ended (a Hub restart, a long idle) ends with it, and the person's next message carries
   the answer, as in Claude Code. The run file is split by subject first, and an idle session
   retires, so memory does not grow with every conversation.
5. **The check as typed files** (spec 0012). The application check and the server build become one
   typed program, compiled and tested with the Hub, bundled into one file when the Hub is built and
   delivered to each VM by its hash, instead of two programs inside strings. The template image does
   not change. The egress recorder is not part of this: scope item 26, phase 2, replaces it with E2B's
   native egress control.
6. **S4.** One runner for every periodic job, and one reaper for everything that expires, on the
   lifetimes S2 sets.
7. **S3.** One owner for each security and policy rule: the Origin, CSRF and session checks, and
   the session lifetimes.
8. **S1.** One generated contract between the web app and the Hub for every route the web app
   calls, parsed at the edge into domain types, with branded ids.
9. **S5.** The Builder screen holds one record of the conversation; browser tests run against a
   real Hub.
10. **CI under five minutes.** The Hub builds once, independent checks run together, and the verify
    steps come from the test files instead of a hand-kept list. No test is removed.

Beside the waves, each when its area is touched: one idempotent command and one transaction helper
in the Hub, with a project started by one command; typed tests, after a design pass; and one
migration baseline after S2.

Every wave is built the same way:

1. A census of what exists and of what the installed `@mastra` packages already offer, compared
   with Mastra Code, Claude Code, Codex and Mitra.
2. A redesign from first principles, as if the requirement had been there from the start.
3. Its blast radius, with the fact its safety depends on proved by running code.
4. A spec with the design, what it deletes, and what stays and why. Nothing stays only because it
   exists.
5. The operator approves the spec.
6. One pull request from HQ: the failing tests first, then the code.
7. The Factory reviews it, the operator tests it on the local Conexus, and a diagnosis-only review
   checks that the code got smaller.

After S2, the Builder moves out of the Hub process, as the runner already is. Its design is part of
phase 2, right after S2, because it depends on how the sandbox and the session belong to each
conversation. Building it may come after Q5.

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

### Accepted under C-033

The operator accepted this app stack under C-033 on 2026-09-29. The compiler template installs it,
and a generated app imports only these packages. React 19.2.8, Vite 8.2.2 and TypeScript 6.0.2 stay as the V1 compiler template pins them.

The pinned list is the *App stack* section of [spec 0003](tasks/specs/0003-app-stack-v2/index.md).
The alternatives come from [study 17](research/builder/17-app-stack-decision.md), section 2.2. The
CSP and size measurements come from its section 2.3, taken on a probe app outside this repository.
In the table, S17 2.2 and S17 2.3 name those two sections.

| Packages and versions | What a generated app uses it for | Named limitation | Evidence | Alternative, and why not |
| --- | --- | --- | --- | --- |
| `@vitejs/plugin-react` 6.1.1, `@tailwindcss/vite` 4.3.3 | The compiler's Vite build | The Tailwind classes and the `@theme` token sheet need a compile step. The Hub web app builds with the same two plugins | [S17 2.2](research/builder/17-app-stack-decision.md#22-the-picks) | None named in study 17 |
| `@tanstack/react-router` 1.170.32 | Code routes in one file | V1 has no router, so an app has one screen or hand-written routing | [S17 2.2](research/builder/17-app-stack-decision.md#22-the-picks) | File-based routes need a plugin and a generated route tree before `tsc`. One explicit file is easier for the model to read. Revisit past about 10 screens |
| `@tanstack/react-query` 5.102.8 | Every screen that loads data through the generated client | V1 screens use plain `useEffect` fetches with no cache, loading, error or invalidation state | [S17 2.2](research/builder/17-app-stack-decision.md#22-the-picks) | Plain `useEffect` fetches, which is V1 |
| `@base-ui/react` 1.8.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0 | The curated shadcn components copied into the starter | The Preview's CSP is `style-src 'self'`, which blocks a library that injects a `<style>` element | [S17 2.3](research/builder/17-app-stack-decision.md#23-what-the-probe-showed): one CSP violation per Radix dialog open, none for Base UI | shadcn on Radix (`radix-ui` 1.6.7). Models know it better, but it breaks the CSP. Relaxing the CSP to `'unsafe-inline'` styles would be a security decision of its own |
| `tailwindcss` 4.3.3 | The Conexus tokens in `@theme` | shadcn source assumes Tailwind. The look must come from tokens only | [S17 2.2](research/builder/17-app-stack-decision.md#22-the-picks) | Plain CSS, which shadcn source does not use |
| `recharts` 3.10.1 | Charts, through a CSP-safe `chart.tsx` | V1 apps draw charts in hand-written SVG. shadcn's own `chart.tsx` writes an inline `<style>`, which the CSP refuses | [S17 2.3](research/builder/17-app-stack-decision.md#23-what-the-probe-showed) | ECharts: more chart types and a larger bundle, with no shadcn wrapper. Revisit when a dashboard needs a chart Recharts lacks |
| `@tanstack/react-table` 9.2.4 | Tables | V1 tables are written by hand | [S17 2.2](research/builder/17-app-stack-decision.md#22-the-picks) | v8.21.3, which models know better. shadcn's data table is already on v9 |
| `react-hook-form` 7.89.0, `@hookform/resolvers` 5.9.1, `zod` 4.6.5 | Forms, with each form's schema from the generated client | The generated client needs a schema library, and a form must check the limits the runner enforces | [S17 2.2](research/builder/17-app-stack-decision.md#22-the-picks) | TanStack Form 1.33.5: same family as Router and Query, but younger and less familiar to models |
| `date-fns` 4.4.0, `react-day-picker` 9.x | pt-BR dates, and the date picker. `react-day-picker` is the 9.x version that the pinned shadcn `calendar.tsx` requires | V1 has no date formatting or date picker | [S17 2.2](research/builder/17-app-stack-decision.md#22-the-picks) | `Intl` only, with no date picker |
| `lucide-react` 1.47.0 | The icons of the starter components | The shadcn components import their icons from it | [S17 2.2](research/builder/17-app-stack-decision.md#22-the-picks) | None. The Hub web app uses the same package |

### Accepted under C-032, amended on 2026-10-01

The operator decided the model path on 2026-10-01. Under C-032 as amended, the Mastra Code product
and `@mastra/factory` have left the Hub, and `@mastra/code-sdk` 1.8.3 stays as a pinned library that
the Builder uses.

| Package and exact version | Consumer | Named limitation | Evidence | Alternative, and why not |
| --- | --- | --- | --- | --- |
| `@mastra/code-sdk` 1.8.3 | The Claude subscription and the ChatGPT subscription (sign-in, refresh and model), the sandbox filesystem (`SandboxFilesystem`), error classification (`parseError`) and the eval's Claude login | The subscription flows are unofficial, and Mastra maintains them for its own product. A provider's change must reach the Hub | [C-032](decisions/index.md#in-force) and the [spec 0002 amendment](tasks/specs/0002-builder-own-harness/index.md#amendment-2026-10-01-mastracode-sdk-stays-as-a-library) | Copy the code into the Hub, as C-032 first planned. A provider's change would then need a port by hand instead of an upgrade |

### Accepted under the Builder documentation tools, pending the operator's verdict

| Package and exact version | Consumer | Named limitation | Evidence | Alternative, and why not |
| --- | --- | --- | --- | --- |
| `@mastra/mcp` 2.1.0 | The Builder's two Context7 documentation tools, through one Hub-owned adapter that allows one host | The model's memory of a library is stale. The adapter needs the internet, and no real Context7 call ran in the proof | [Task](tasks/builder-context7-qualification.md) | Hand-written HTTP to Context7 copies the MCP protocol that Mastra already maintains |

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

On 2026-10-02 the operator deferred the proof that an application's numbers are right (a second
computation of the same number, a control number the person knows, the business rules stated in
the plan) to the redesign of the Builder's planning flow. It must work for every Connector, not one
vendor.

On 2026-10-02 the operator moved part of step 1 ahead of the Stage 2 close: auth, roles and users,
and telemetry are built as Q5 preparation under specs 0005 to 0008. The rest of step 1 still
enters when Stage 2 closes.

## Exact next action

**Build a sound base in the [order of work](#order-of-work-to-q5): the phase 2 waves, Subtract,
the ratchets, the failure table and S2 first. Then the screen check, then the Q5 specs in their order, then the Q5 task.**

The waves come first, so the screen check and Q5 are not built on shapes the waves replace. The
screen check comes next. The Builder checks the screens it built in a browser inside its
sandbox, with sample data in each operation's output shape. The Q4 proof showed why. The Builder
tested its operations with real reads but did not see the screen it built.

Protected question of Q5:

> Can the verified application become a stable URL through an explicit immutable Release/Publish
> transition without building a deployment platform?

Q1 closed with ACCEPT_WITH_BOUNDARY ([evidence and verdict](evidence/stage2-q1/README.md#verdict)).
Q2 closed with ACCEPT: parameterized SQL through `pg` is the data programming model
([evidence and verdict](evidence/stage2-q2/README.md#q21-attempt-2)). Q3 closed with
ACCEPT_WITH_BOUNDARY in #210 (`7f3dc0b7`): an application has its own host, an app-only Account reaches it through a
one-use handoff from the Hub sign-in, and handlers receive the caller
([evidence and verdict](evidence/stage2-q3/README.md)). Q4 closed with ACCEPT_WITH_BOUNDARY on
`main` at `f7967b81`: a Project reads the company's Sankhya through a Connection bound to it, the
Builder investigates with native reads, and an application's handler reads through the binding
([evidence and verdict](evidence/stage2-q4/README.md#verdict)). Its boundary is the read-only
confirmation the operator still owes, and the negative cases proved in CI but not on the pilot.

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
