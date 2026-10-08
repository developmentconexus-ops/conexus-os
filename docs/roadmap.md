# Conexus OS roadmap

This file owns the status of the stage gates, the work in progress and the next action. History stays
in Git: each finished item below is one line with its pull request. Workstreams (frentes) are issues
in this repository. This file names waves, specs and issues; their execution contracts live in the
specs and issues.

## What Conexus is

Conexus is the platform a company uses to build, administer and evolve internal software connected to
its own data and systems. A person describes the app they need, the Builder builds it in an isolated
sandbox, and the app runs on the platform behind the company's sign-in. The
[product contract](product/contract.md) says what the product is, and the
[architecture guide](reference/architecture.md) names the owner of each concept.

## Where we are

Stage 1 and Stage 2 gates Q1 to Q4 are closed. The structural waves that make a sound base are
finished except S1 (checked boundaries, in progress). The authorization model, error model wave 1
and company model accounts advance through the new flow in parallel. The remaining code base sweeps
come before Q5. The Builder block, the screen check and the Q5 preparation that Q5 does not need come after its verdict.
`main` is the trunk; batch pull requests target their wave branch, and wave pull requests target `main`.

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

The planning session advances three waves in parallel through the [wave flow](development/delivery.md#waves),
within its stage and work-in-progress gates:

- **Hub authorization model, spec 0018**, [#543](https://github.com/developmentconexus-ops/conexus-os/issues/543),
  `lane:qualification`. This closes S1. One check family, copied and adapted from Documenso, is
  required by type on reads and writes. Row security leaves, and every refusal originates in one
  place. S1's spec 0015 parts 0 (#509), 3 (#510), 7 (#511), 0b (#512), 2 (#513), 1 (#514),
  5 (#532), 4 (#533) and 6 (#546, after #539, #541 and #545) are merged. Part 6 fixed the no-access
  page. After the authorization wave comes the local reset, the test as a person and the S1 proof.
  At S1 closure, one migration baseline replaces the old chain.
- **Error model, wave 1, spec 0019**, [#553](https://github.com/developmentconexus-ops/conexus-os/issues/553),
  `lane:qualification`. One failure model for every process, one result type for a refusal, one
  sender and one reader. It absorbs [#549](https://github.com/developmentconexus-ops/conexus-os/issues/549),
  the code base's one failure sender item, and the known sandbox-start defect that ends as
  `INTERNAL_UNEXPECTED`. That expected platform failure needs its own failure-table row and
  person-facing text, with the verification recipe updated alongside it.
- **Company model accounts, spec 0017.** Its first part is already built. A company account held by
  the installation sits beside each person's own; the person's account comes first in the screen
  and in runs.

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
Parallel planning does not bypass a spec's approval or the build and proof gates.

1. **Advance the three current waves.** Authorization (spec 0018, #543) finishes S1, followed by
   the local reset, the test as a person and the proof. Error model wave 1 (spec 0019, #553) and
   company model accounts (spec 0017, first part built) advance beside it through the new flow.
2. **Error model, wave 2**, [#554](https://github.com/developmentconexus-ops/conexus-os/issues/554),
   `lane:shaped`, after wave 1. Sweep the `catch` blocks and `INTERNAL_UNEXPECTED` cases and clean
   the failure table by codemod, using the established model.
3. **The rest of the code base wave, as sweeps.** Each follows the `conexus-spec`
   [sweep standard](../.agents/skills/conexus-spec/SKILL.md):
   - arrow declarations to `function` declarations;
   - branded ids in the web and Hub ports;
   - one `isRecord`, one Project page shell and one web API helper;
   - pagination, [#547](https://github.com/developmentconexus-ops/conexus-os/issues/547), with one
     keyset contract, an opaque token, a server-set page size and shared Hub and web helpers;
   - `connectors/scope.ts` as a state machine,
     [#548](https://github.com/developmentconexus-ops/conexus-os/issues/548);
   - the CI check against exports kept only for tests.

   The approved sweep specs name their census targets and the code base done line.

   **Spec 0017 foundation status:** [spec 0017](specs/0017-company-model-accounts/index.md).
   The core personal owner, row custody and current refresh release are implemented on the batch
   branch; the next action is to close the independent review findings, integrate CI and publish the batch. Main landing still needs
   its separately authorized real Builder qualification. Company commands, fallback and default
   writers remain the later 0020 scope, with their own approval.
4. **Q5, Release and Publish.** Its spec is written meanwhile. It is built when the code base
   done line holds.
5. **After the Q5 verdict:**
   - the Builder block: the move out of the Hub process together with Hub composition (the
     composition root as a list of modules, the configuration as one schema), the Builder screen
     with one record of the conversation, the screen check, and the sandbox allowlist;
   - specs 0005 to 0008, the Q5 preparation, with 0006 carrying the study of choosing an app's users;
   - Web style, with #363;
   - pagination of the remaining lists.

Every wave follows [delivery](development/delivery.md#waves).

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

Builder MCP/Context7 documentation tools are deferred pending a separate design and reference study.

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

Advance authorization (spec 0018, #543), error model wave 1 (spec 0019, #553) and company model
accounts (spec 0017) in parallel through the new flow. Close S1 with the local reset, the test as a
person and the proof. Then run error model wave 2 (#554) and the remaining code base sweeps.
Write the Q5 spec meanwhile; build Q5 when the code base done line holds.

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
