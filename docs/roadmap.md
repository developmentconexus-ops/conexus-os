# Conexus OS roadmap

This file owns mutable status, current grant and the exact next action.

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
| **Q3 Application identity** | Can an employee use an application without gaining Control Plane authority? | **ACCEPT_WITH_BOUNDARY** on 2026-09-24. An app-only employee signed in on the application's own host and wrote a note under their own name; every Q3.6 negative case was refused. Until Q5 the application host serves the last good Preview ([task](tasks/stage2-q3-application-identity-qualification.md), [evidence](evidence/stage2-q3/README.md)) |
| **Q4 Sankhya Connector** | Can Connector Definition -> Workspace Connection -> Project Grant expose one real read-only Sankhya capability without leaking credentials or generic provider authority? | **NEXT**, task to prepare |
| **Q5 Release + Publish** | Can the verified application become a stable URL through an explicit immutable Release/Publish transition without building a deployment platform? | WAITING FOR Q4 |

Do not create implementation tasks for Q2-Q5 before the preceding verdict. Their current question, candidates and evidence requirements live in the Stage 2 reference so they are not lost.

The sequence is a commitment order, not a dependency chain. Q3 does not depend on Q2, the Sankhya business input for Q4 needs no code, and Q5 depends on Q1's manifest rather than on Q3 or Q4. Exploration may therefore run ahead of the current gate, under two rules:

- a spike that settles a gate's hypothesis runs on its own branch and worktree, is never merged, and ends in a report the gate's task cites;
- only the current gate's task changes `main`.

Alongside Q1:

- the runner arena (`spike/q1-runner-arena`) is done: both isolation mechanisms passed its 24-case suite, and the Q1 task records the selection;
- a rerunnable Builder eval (`scripts/builder-eval/`), the measuring tool every Builder proof in Stage 2 reuses, is delivered as its own pull request;
- the Sankhya business input for Q4: gateway, read-only credential, the open-purchase-order read and its fields, owned by the operator.

## Technology qualification rule

Research does not select a dependency.

A dependency or framework enters the Stage 2 stack only when:

```text
current consumer
+ named limitation/problem
+ exact API/version examined
+ falsifiable probe
+ evidence against credible alternative
→ decision
```

Existing repository dependencies are preferred when they are sufficient.

Current baseline/challenger state:

- Fastify, Node, Zod/Ajv and pg: baseline mechanisms for Q1 where applicable;
- SQL/`pg`: the data programming model, accepted by Q2;
- Kysely: not qualified; Q1 and Q2 named no repeated SQL failure;
- Prisma, Drizzle, Hono, oRPC: deferred without a current falsifier;
- Nango/Pipedream/Composio: deferred until a real SaaS/OAuth or agent-tool Connector requires them;
- Airbyte/Debezium: deferred until a real replication/CDC requirement;
- pg-boss/Mastra Workflows/Inngest/Trigger.dev/Temporal: deferred until background/durable work is a current requirement;
- Novu/Knock: deferred until a real notification requirement;
- Cloud Run/Fly/Kubernetes/per-Project OCI deployment: future standalone/deployment profile, not Stage 2 prerequisite.

## Builder is part of every application-architecture proof

Hand-written examples can prove a platform mechanism but cannot close an application architecture gate.

Where a gate concerns the generated application programming model, deciding proof includes:

1. a real Project;
2. a normal product-language request to the Builder;
3. current real model path;
4. Builder discovery of the paved-road guidance;
5. Builder-generated or materially Builder-modified source;
6. its own Project check;
7. Conexus build/Preview;
8. browser interaction;
9. the gate's negative proof.

Record repair iterations and failures. The goal is not only to make the platform capable; the Builder must be able to use it reliably without the operator dictating filenames or implementation.

## Stage 2 lie detector

The preferred end-to-end application is a small Metal Nobre **purchasing follow-up notebook**.

By Stage 2 completion it should:

- read a bounded set of open purchase orders from Sankhya;
- keep Conexus-owned follow-up notes/status separately;
- authenticate an employee who does not administer the Project;
- use one authorized Connector capability;
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
operator agreed this order on 2026-09-23 as a plan, not a grant. Each step becomes a task only
after the step before it has a verdict, and each technology enters only under the
[technology qualification rule](#technology-qualification-rule), with its own consumer.

"Code harness" here means the paved road of ready pieces the Builder assembles inside the managed
profile. The general software-development harness of the
[Stage 2 reference](reference/stage2-managed-application-platform.md#1-why-this-exists), a second
application profile with a backend per Project, is a different thing and stays future.

| Order | Step | Candidates from the [technology queue](reference/stage2-managed-application-platform.md#7-technology-qualification-queue) | Enters when |
| --- | --- | --- | --- |
| Alongside Q3 | Builder tracing and evals on `main`: every Builder run recorded and comparable | Mastra AI tracing, scorers and datasets. An OpenTelemetry backend stays deferred | A study of what Mastra already ships decides the exact scope |
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

**Prepare the Stage 2 Q4 task: one real read-only Sankhya capability through Connector Definition, Workspace Connection and Project Grant.**

Protected question:

> Can Connector Definition -> Workspace Connection -> Project Grant expose one real read-only
> Sankhya capability without leaking credentials or generic provider authority?

Q1 closed with ACCEPT_WITH_BOUNDARY ([evidence and verdict](evidence/stage2-q1/README.md#verdict)).
Q2 closed with ACCEPT: parameterized SQL through `pg` is the data programming model
([evidence and verdict](evidence/stage2-q2/README.md#q21-attempt-2)). Q3 closed with
ACCEPT_WITH_BOUNDARY: an application has its own host, an app-only Account reaches it through a
one-use handoff from the Hub sign-in, and handlers receive the caller
([evidence and verdict](evidence/stage2-q3/README.md)). The Q4 task starts from the notebook
application Q3 left, whose handlers already know who is calling.

Q3 left one pending item by operator choice: the no-access page names the wrong reason when
Keycloak reports an unverified email ([finding 1](evidence/stage2-q3/README.md#findings)).

## What the operator still owes

- Confirmation that the Sankhya gateway credential is read-only, before Q4 calls it.

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

A pull request is ready only when CI `verify` is green on its exact head SHA and the coordinator has read the diff.

For a material runtime/database trust-boundary slice, independent review is required by the Engineering Method after the candidate is frozen.

Never treat the existence of a plan, artifact or Preview grant as Product acceptance.
