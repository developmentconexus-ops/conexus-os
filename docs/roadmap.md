# Conexus OS roadmap

This file owns the status of the stage gates, the work in progress and the next action. History stays
in Git: each finished item below is one line with its pull request. Workstreams (frentes) live in a
private repository, and this file never names them.

## What Conexus is

Conexus is the platform a company uses to build, administer and evolve internal software connected to
its own data and systems. A person describes the app they need, the Builder builds it in an isolated
sandbox, and the app runs on the platform behind the company's sign-in. The
[product contract](product/contract.md) says what the product is, and the
[architecture guide](reference/architecture.md) names the owner of each concept.

## Where we are

Stage 1 and Stage 2 gates Q1 to Q4 are closed. The structural waves that make a sound base are
finished except S1 (checked boundaries, in progress), the screen check and a few follow-ups. Q5 comes
after them and after its preparation. `main` is the trunk and every pull request targets it.

## Finished

| Item | What it delivered | PR |
| --- | --- | --- |
| Stage 1, foundation | Sign-in and IAM, Accounts and Workspaces, Projects on private repositories, model accounts, persistent Project conversations, real-model Builder runs in E2B, source admission with stale-base refusal, compile, smoke and Preview | pilot evidence |
| Builder on its own harness | The Builder runs on Conexus's own harness over Mastra, in one mode; the Mastra Factory left the Hub | #380 and earlier |
| Q1, handler runtime and persistent Preview data | ACCEPT_WITH_BOUNDARY: server handlers run outside the Hub with Project-scoped data and no platform authority | #196 |
| Q2, data programming model | ACCEPT: parameterized SQL through `pg` is enough; no Kysely or Data API | 2026-09-23 |
| Q3, application identity | ACCEPT_WITH_BOUNDARY: an app-only employee signs in on the application's own host with no Control Plane authority | #210 |
| Q4, first Connector | ACCEPT_WITH_BOUNDARY: a Project reads the company's Sankhya through a bound Connection, in the Builder and in handlers | frozen in #482 |
| Phase 1 closure | Run exits, one settle, supervisor, daily backup, memory guards, a done that waits for the check | #468 to #481 |
| Subtract | Deleted what had no consumer or the wrong shape | #486 |
| Ratchets | CI enforces the codebase principles with Biome rules and types | #489, #493 |
| CI checks, spec 0010 | Short CI, tests run by file name | #497 |
| Failure table, spec 0009 | One code, one row, one exit for every failure | #499 |
| S2, spec 0011 | The run as one state machine; a question waits inside the run | #501 |
| Typed check, spec 0012 | The application check as typed files the Hub bundles and delivers by hash | #503 |
| S4, spec 0013 | One job executor and one reaper for what expires | #505 |
| S3, spec 0014 | One access rule for every route, applied in one place | #507 |
| CI speed | Eight verify groups side by side, one model retry after 100 ms | #515 |
| Done gate | A red check reaches the page as a stored notification | #516 |

Q4 boundary: the Sankhya administrator has not confirmed that the integration user can only read, and
the negative cases are proved in CI, not on the pilot. Q3 left one pending item: the no-access page
names the wrong reason when Keycloak reports an unverified email.

## Work in progress

**S1, spec 0015, checked boundaries.** The contract is in Zod, every row is parsed by one data module,
and every command needs a typed proof made by an admission function. One database login role switches
to a reader or a command role per transaction. Merged so far: part 0 (#509), part 3 project (#510),
part 7 other JSON input (#511), part 0b the split wall (#512), part 2 connectors (#513), part 1 builder
(#514). Open: part 4 registry, part 5 model accounts, part 6 identity and access (last). When S1
ends, local databases are reset and one migration baseline replaces the old chain. Spec 0016, the
project lifecycle, starts after part 6.

**Documentation.** Pull request #518 makes nine guides the owners of the Conexus rules.

**Known defect.** When the Builder cannot open its sandbox, the turn ends as `INTERNAL_UNEXPECTED`
and the person reads that Conexus failed in an unexpected way. A sandbox that cannot start is an
expected platform failure and needs its own row in the failure table, with person-facing text. The
verify skill's Construir recipe changes with it. Fix it before the screen check.

## Stage 2 gates

| Gate | Protected question | Status |
| --- | --- | --- |
| Q1 to Q4 | Server handlers and data, data model, application identity, first Connector | Closed, see Finished |
| **Q5 Release + Publish** | Can the verified application become a stable URL through an explicit immutable Release/Publish transition without building a deployment platform? | **Next**, after the order of work below |

The first Stage 2 profile is a managed application platform: Builder, Project Git source, Preview,
explicit Publish, a managed employee-facing app. It does not require one backend or container per
Project. A general software-development harness stays a future profile.

The end-to-end proof for Stage 2 is a small purchasing follow-up notebook: it reads a bounded set of
open purchase orders from Sankhya, keeps its own notes and status, authenticates an employee who does
not administer the Project, reads through one Connection bound to its Project, and is published at a
stable employee URL.

## Order of work to Q5

This order changes no gate status. Work follows the
[limits on work in progress](development/delivery.md#size-work-by-appetite-and-limit-work-in-progress).

1. **Finish S1** (above), then the structural follow-ups, each when its area is touched: S5 (the
   Builder screen holds one record of the conversation; browser tests against a real Hub), one
   idempotent command and one transaction helper in the Hub, typed tests after a design pass. Two more
   waves follow S1: the Hub base (the configuration as one schema, the composition root as a list of
   modules, model accounts and the Mastra instance in the core, one sign-in per model provider, and
   storage bounded per Project) and the Project lifecycle (the `archived` state that nothing produces
   leaves). The
   Builder then moves out of the Hub process, as the runner already is; its design depends on how
   the sandbox and the session belong to each conversation.
2. **The screen check.** The Builder checks the screens it built as a person would, in a browser
   inside its sandbox, with sample data in each operation's output shape. The data proves the screen
   shows what it receives, never that a number matches the source. The Q4 proof showed why: the
   Builder tested its operations with real reads but did not see the screen it built.
3. **Prepare Q5**, in this order: spec 0008 slice 1 (one session lifetime from one source); spec
   0006 (people and sign-in); experiment E1 of spec 0005, then its slices 3 to 6 as one release; spec
   0007 slices 2 to 4 with spec 0008 slice 4 (telemetry slice 1 is merged, #389); the sandbox
   allowlist. These are not the Q5 task. Q5's proof needs an employee who is not a developer and signs
   in with their own access.
4. **Q5.** Verdict: a published application used by an employee who is not a developer.

Every wave is built the same way: a census of what exists and of what the installed `@mastra`
packages offer; a redesign from first principles; its blast radius; a spec that names what it deletes;
approval of the spec; one pull request, failing tests first; review, then a diagnosis-only check that
the code got smaller.

## Technology baseline

A dependency enters only under the [dependency rule](reference/architecture.md#dependencies). The
pinned app stack of generated applications is in
[the compiler template](../apps/hub/compiler-template/package.json). A generated app imports only
that list, and the Builder cannot install a package.

| Accepted | Reason |
| --- | --- |
| Fastify, Node, Zod, `pg` | Hub baseline; parameterized SQL is the data model (Q2) |
| React, Vite, Tailwind 4, shadcn components on Base UI | The app stack. Base UI is used because Radix injects a `<style>` element, which the Preview's CSP refuses |
| TanStack Router, Query and Table | Code routes, data loading and tables for generated apps |
| Recharts through a CSP-safe `chart.tsx` | Charts. Revisit when a dashboard needs a chart it lacks |
| react-hook-form with zod, date-fns, `react-day-picker`, lucide | Forms, pt-BR dates, icons |
| `@mastra/code-sdk` 1.8.3 | Pinned library for model sign-in, the sandbox filesystem and error classification. Copying it into the Hub would mean a hand port of every provider change |
| `@mastra/mcp` 2.1.0 | The Builder's Context7 documentation tools through one Hub-owned adapter that allows one host; the verdict is recorded in #431 |

Deferred until a real consumer needs them: Kysely, Prisma, Drizzle, Hono, oRPC; Nango, Pipedream,
Composio; Airbyte, Debezium; pg-boss, Mastra Workflows, Inngest, Trigger.dev, Temporal; Novu, Knock;
Cloud Run, Fly, Kubernetes and per-Project deployment.

Every application-architecture gate follows the [Builder proof rule](development/testing.md#builder-proof).

## Explicitly deferred until after Stage 2 evidence

Oracle and a second Connector facet, external-data sync, Jobs, Notifications, Automations, Brain,
Agent Studio, a template marketplace, standalone deployment per Project, cloud-provider abstraction.
They return only through a named real consumer and their own qualification.

## After Stage 2: planned order

A plan, not a commitment. Each step becomes a task only after the one before it has a verdict, and
each technology enters under the dependency rule with its own consumer.

1. The code harness: events, UI library, auth, roles and users, audit, telemetry, an implementation
   guide, global Conexus skills. Auth, roles and telemetry are already moved ahead as Q5 preparation.
2. Application templates built from the harness.
3. Server installation and operation: backups, published operation.
4. More integrations, each with the first Connector that needs it.
5. Jobs and automations, then notifications, Agent Studio, Brain.
6. Problem reports that become Factory issues; self-registration in chosen applications.

Proof that an application's numbers are right (a second computation, a control number the person
knows, the business rules in the plan) waits for the redesign of the Builder's planning flow. It must
work for every Connector, not one vendor.

## Exact next action

**Finish S1 (parts 4, 5 and 6), fix the sandbox-start failure row, then run the screen check, then the
Q5 preparation in its order, then the Q5 task.**

## What the operator still owes

- Confirmation from the Sankhya administrator that the integration user can only read. It does not
  block the work. Without it, Q4 stays ACCEPT_WITH_BOUNDARY.

## Before a production installation

The pilot runs the Hub as one OS user with secrets in files only that user can read. That suits a
pilot and does not block Stage 2. Before Conexus runs anywhere else:

- A dedicated OS user for the Hub, so nothing else on the host can read the platform's keys.
- Secrets delivered by the service manager or a secret store, not files in a home directory.
- The secret key that encrypts model credentials held apart from the database it encrypts.
- Storage for the Applications PostgreSQL separate from the Hub's.
- The application runner on its own OS user. Generated code already runs in a per-invocation worker
  confined by unprivileged namespaces, with no view of host files, processes or network.

The merge gate lives in [delivery rules](development/delivery.md#merge-gate).
