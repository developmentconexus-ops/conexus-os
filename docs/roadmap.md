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
finished except S1 (checked boundaries, in progress). One bounded code base wave comes before Q5. The
Builder block, the screen check and the Q5 preparation that Q5 does not need come after its verdict.
`main` is the trunk and every pull request targets it.

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
| Nine guides | Nine guides own the Conexus rules; the old-era documentation is gone | #518 to #531 |
| S1 part 4, registry | The registry owner behind the split wall | #533 |
| S1 part 5, model accounts | The model account owner behind the split wall | #532 |
| S1 part 6, identity and access | Identity, sessions, invitations and application access in TypeScript on the split wall; no setup page | #546 |
| Operation names | Operations are named by verb and noun, not by numbered codes | #539 |
| Contract package | The contract is imported as a package, and failure codes are typed at the boundary | #541 |
| Hosting rename | The hosting module is named `hosting`, not `mar` | #545 |

Q4 boundary: the Sankhya administrator has not confirmed that the integration user can only read, and
the negative cases are proved in CI, not on the pilot. Q3 left one pending item, the no-access page
naming the wrong reason when Keycloak reports an unverified email. S1 part 6 fixes it.

## Work in progress

**S1, spec 0015, checked boundaries.** The contract is in Zod, every row is parsed by one data module,
and every command needs a typed proof made by an admission function. One database login role switches
to a reader or a command role per transaction. Merged so far: parts 0 (#509), 3 (#510), 7 (#511), 0b
(#512), 2 (#513), 1 (#514), 5 (#532), 4 (#533) and 6, identity and access (#546, with #539, #541 and
#545 before it). Part 6 also fixes the no-access page. Open: #543 (outsiders get a 404), then the S1
verification on a reset local database. When S1 ends, one migration baseline replaces the old chain.

**Known defect.** When the Builder cannot open its sandbox, the turn ends as `INTERNAL_UNEXPECTED`
and the person reads that Conexus failed in an unexpected way. A sandbox that cannot start is an
expected platform failure and needs its own row in the failure table, with person-facing text. The
verify skill's Construir recipe changes with it. It is a fast-lane issue.

**Known gap.** No screen sets the installation's default Builder model (`model.installation_default`).
On a fresh installation every turn ends as `BUILDER_MODEL_NOT_SELECTED` until the value is written by
hand. The settings work takes it.

## Stage 2 gates

| Gate | Protected question | Status |
| --- | --- | --- |
| Q1 to Q4 | Server handlers and data, data model, application identity, first Connector | Closed, see Finished |
| **Q5 Release + Publish** | Can the verified application become a stable URL through an explicit immutable Release/Publish transition without building a deployment platform? | **Next**, after S1 and the code base wave |

The first Stage 2 profile is a managed application platform: Builder, Project Git source, Preview,
explicit Publish, a managed employee-facing app. It does not require one backend or container per
Project. A general software-development harness stays a future profile.

The end-to-end proof for Stage 2 is a small purchasing follow-up notebook: it reads a bounded set of
open purchase orders from Sankhya, keeps its own notes and status, authenticates an employee who does
not administer the Project, reads through one Connection bound to its Project, and is published at a
stable employee URL.

The proof's employee account is created by hand in Keycloak, and access is granted by account. The
verdict names both as a boundary. Choosing an app's users among the people an administrator created
comes with spec 0006, after the verdict.

## Order of work to Q5

This order changes no gate status. Work follows the
[limits on work in progress](development/delivery.md#size-work-by-appetite-and-limit-work-in-progress).
Features built now copy the code beside them, so a bounded code base wave runs before Q5.

1. **Finish S1.** #543, then the local reset and the verification of S1.
2. **The code base wave, before Q5.** It covers only what Q5 copies or touches:
   - the arrow-to-function codemod, one module at a time, as the [code guide](development/codebase-principles.md)
     already states;
   - branded ids in the web and in the Hub ports;
   - one failure sender, one `isRecord`, one Project page shell and one web API helper;
   - pagination: one paged shape in the contract (keyset, with an opaque token and a server-set
     page size), a Hub helper and a web helper with a "Carregar mais" button, applied first to
     Projects, the Workspace roster and application access, so that Q5's lists are born paged;
   - spec 0016, the Project lifecycle;
   - CI checks that let the census numbers only fall.

   Its done line is measured by the code census and stated in its spec. Mechanical items run as
   small fast-lane issues, at most three in flight, each released only when no open wave touches
   its files.
3. **In parallel, spec 0017, company model accounts.** A company account, held by the
   installation, beside each person's own, the person's first in the screen and in runs.
4. **Q5, Release and Publish.** Its spec is written while the code base wave runs. It is built once
   the done line of the wave holds.
5. **After the Q5 verdict:**
   - the Builder block: the move out of the Hub process together with Hub composition (the
     composition root as a list of modules, the configuration as one schema), the Builder screen
     with one record of the conversation, the screen check, and the sandbox allowlist;
   - specs 0005 to 0008, the Q5 preparation, with 0006 carrying the study of choosing an app's users;
   - Web style, with #363;
   - pagination of the remaining lists.

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

Every application-architecture gate follows the [Builder proof rule](development/testing.md#9-builder-proof).

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

**#543, then the local reset and the verification of S1. Then the code
base wave, with spec 0017 beside it and the Q5 spec written meanwhile, then the Q5 task.**

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
- Hub security, and storage bounded per Project in the Applications cluster.
- A migration runner login with the least privilege it needs.
- The application runner on its own OS user. Generated code already runs in a per-invocation worker
  confined by unprivileged namespaces, with no view of host files, processes or network.

The merge gate lives in [delivery rules](development/delivery.md#merge-gate).
