# Stage 2 managed application platform

**Status:** ACCEPTED DIRECTION / IMPLEMENTATION UNDER QUALIFICATION  
**Owner:** Product direction comes from C-021 and C-028. This file owns the technical target and the qualification map for the generated-application architecture.  
**Execution status:** only the task explicitly granted by `docs/roadmap.md` may be implemented.

## 1. Why this exists

Stage 1 proved the Factory-centered Builder. Stage 2 must prove that the same Builder can create a useful internal business application that owns persistent data, runs privileged server logic without exposing platform secrets, can use an authorized enterprise integration, and can be published for employees who never enter the Project development surface.

The first realization is deliberately a **managed application platform**. A generated application is not initially an independently hosted full-stack service. Conexus supplies the server-side paved road.

The later goal of using Conexus as a more general software-development harness remains valid. It does not justify building per-Project containers, cloud deployment abstractions or a second application profile before the managed profile works.

## 2. Accepted boundary

```text
Mastra Factory / Code
        |
        v
Project Git repository
        |
        +-- app/                     browser application
        +-- conexus/handlers/        server-side business handlers
        +-- conexus/migrations/      Project data migrations
        +-- conexus/manifest.json    generated application contract
        +-- conexus.json             Project check/runtime profile
        |
        v
Conexus build + verification
        |
        +-- Preview
        |
        v
explicit Publish
        |
        v
stable application URL
        |
        +-- static frontend
        +-- same-origin Conexus app API
                |
                +-- handler runner
                +-- Project application data
                +-- Connector broker
```

Mastra remains the Builder/coding-harness owner. Conexus owns the application profile, application runtime boundary, Project data allocation, application access, enterprise Connector grants, Release identity and Publish.

## 3. Generated Project shape

The source of application behavior remains ordinary versioned code in the Project repository. Business logic must not exist only as opaque platform metadata.

The initial profile is one supported Conexus application shape:

```text
app/
  src/
  ...

conexus/
  handlers/
    <business-operation>.ts
  migrations/
    <forward-migration>.sql
  manifest.json

conexus.json
```

The exact file names and schemas are qualified by the current task before they become durable contract. The important invariant is that frontend source, server business logic, data schema evolution and the manifest needed to reproduce the application are all source-controlled.

A future standalone-software profile may use different build/deploy mechanics. It must not require replacing the Factory, Project source ownership or current application source.

## 4. Builder interaction

The Builder must be able to produce the application through the same ordinary conversation used today.

The target interaction is:

```text
person asks for a business application/change
        |
        v
Builder reads the Project and the managed-app guidance
        |
        v
Builder edits app/ + allowed conexus/ source
        |
        v
Builder runs the Project check in its Factory Workspace
        |
        v
Conexus builds and validates the exact source
        |
        +-- failed -> diagnostic -> Builder repairs
        |
        v
Preview
```

Rules:

- Keep host/runtime machinery out of the prompt when a Skill, type, generated contract or check can teach/enforce it.
- The Builder never receives Hub, Connector or production credentials.
- The Builder may create and change business handlers and Project migrations only inside the admitted application profile.
- Platform bootstrap, secret custody, database role provisioning, ingress and Connector execution are not generated Project code.
- The Project check must fail on invalid application contracts before Preview admission when practical.
- A green compile/check is evidence, not proof that the application is useful. Each qualification includes browser interaction and negative proof.

## 5. Qualification program

Only one qualification task is actionable at a time. Later rows are roadmap gates, not placeholder implementation tasks.

| Gate | Question | Baseline / candidate | Deciding evidence |
| --- | --- | --- | --- |
| Q1 Handler runtime + persistent Preview data | Can Builder-generated server code run outside the Hub with Project-scoped data authority and no privileged platform authority? | Existing Node 24 + Fastify 5 + Zod 4 + pg 8; shared runner is the smallest hypothesis; stronger isolation if the adversarial probe falsifies it | Builder creates a real server-backed Preview; data survives runner restart; cross-Project, secret and forbidden-network probes fail |
| Q2 Data programming model | What is the smallest data API the Builder needs to produce reliable apps? | Start SQL-first with parameterized `pg`; qualify Kysely or a typed Data API only against measured Q1 pain | Same application built/changed by the Builder; compare successful iterations, errors, generated code, duplication and platform complexity |
| Q3 Application identity | Can an employee use an app without receiving Control Plane authority? | Existing Keycloak identity boundary + Conexus app-scoped session/grants | App-only user can use the app; cannot create Workspace, read Project, open Builder or gain authority by identifiers |
| Q4 First Connector | Does Connector Definition -> Workspace Connection -> Project Grant work against a real enterprise system? | Direct narrow Sankhya read-only adapter first | Builder uses the authorized operation from the app; real Sankhya result; revoked grant fails; no credential or arbitrary URL reaches browser/handler |
| Q5 Release + Publish | Can the verified application become a stable employee-facing product without introducing a deployment platform? | Existing artifact registry + immutable manifest + published pointer + stable app ingress | Fresh browser opens stable URL, auth/data/Connector work, broken later build does not change Published, retrying Publish converges |

After Q5, Stage 2 is evaluated as a whole before any later capability is authorized.

## 6. Q1 baseline technology

Q1 does not run a framework beauty contest.

The repository already ships:

- Node.js 24.20.0;
- Fastify 5.12.1;
- Zod 4.5.2;
- pg 8.23.0.

They are the smallest baseline because the generated application need not depend directly on Fastify and because adding another server framework before a limitation is measured would add a second mechanism without a consumer.

The intended separation is:

```text
Fastify/platform host
        |
        v
typed handler adapter
        |
        v
generated business handler
        |
        +-- scoped Project data
        +-- later: authorized Connector operations
```

The public Project programming model must remain smaller than the hosting framework.

### Q1 result

Proposed verdict ACCEPT_WITH_BOUNDARY. Two independent reviews rejected the first candidate
(`8ad7d5bf`); the fixes and the re-review are recorded in the evidence. The evidence and its
conditions live in [`docs/evidence/stage2-q1/README.md`](../evidence/stage2-q1/README.md). What Q1
showed on the pilot:

- **Source shape.** Without hints, the Builder wrote the server half in the places its guide names:
  `conexus/manifest.json`, one handler under `conexus/handlers/` and forward SQL under
  `conexus/migrations/`, beside its `app/` changes. It needed no `conexus.json`. The guide is
  `conexus/SERVER.md`, which every BUILD run writes into the checkout, and `conexus/check.sh` runs
  the same server build the Conexus build runs. These names and the handler contract are
  qualification-only. Q2 owns the durable programming model.
- **Runtime.** One application runner outside the Hub owns the application database. It runs each
  migration and each invocation in a fresh rootless bubblewrap worker with an empty network
  namespace, no host files, no credential and wall-clock, memory, input and output bounds. The worker
  reaches only its own Project's role on the application database, through a per-invocation relay
  that authenticates upstream itself.
- **Data.** Each Project has its own Preview schema, a migration role and a runtime role, all derived
  from the Project id. Preview data survives a runner restart. Project roles have no usable password
  and the cluster admits them only with the runner's client certificate, only to the application
  database. Migrations cannot create functions, procedures, triggers or `DO` blocks, and Project
  sessions cannot lift their temporary-file bound.
- **Programming model signal for Q2.** Four Builder runs wrote parameterized SQL through `pg`. Every
  invocation the runner logged during the live proof answered 200, or 429 at its concurrency cap.
  One run's manifest was refused by the check and repaired by the Builder in the same run. Q1
  names no SQL ergonomics problem.

## 7. Technology qualification queue

These technologies were researched but are **not selected by research alone**.

| Candidate | Current disposition | Reopen trigger |
| --- | --- | --- |
| Fastify | Q1 platform-host baseline | Proven host limitation |
| Zod | Q1 schema-boundary baseline | Proven contract/tooling limitation |
| pg | Q1/Q2 SQL-first baseline | Repeated Builder type/query errors or unsafe repetition |
| Kysely | Q2 challenger, only if Q1 produces a concrete SQL ergonomics/type problem | Q1 evidence names the problem |
| Prisma | Deferred | Real need for its schema/migration/client model that smaller SQL tooling does not meet |
| Drizzle | Deferred | Same; do not qualify merely because it is typed |
| Hono | Deferred | Fastify becomes a real portability/host problem |
| oRPC | Deferred | Procedures need end-to-end RPC typing that the smaller manifest/handler adapter cannot provide |
| Nango | Deferred | A real OAuth SaaS Connector makes token lifecycle/provider quirks a current problem |
| Pipedream / Composio | Deferred | Agent/tool-catalog use becomes a current product requirement |
| Airbyte / Debezium | Deferred | A real application needs synchronized/CDC external data |
| pg-boss | Deferred | First durable background-job requirement |
| Inngest / Trigger.dev / Temporal | Deferred | A current durable workflow exceeds the smaller job/workflow mechanisms |
| Novu / Knock | Deferred | First multichannel/preference notification requirement |
| OpenTelemetry backend rollout | Deferred | Operational evidence from real Published apps requires it |
| Cloud Run / Fly / OCI per Project | Future standalone/deployment profile | Managed application platform is proven insufficient for a named application |

A candidate may enter a qualification only with a named consumer, limitation and falsifiable comparison.

## 8. Standard qualification contract

Every qualification answers:

1. **Question.** One material unknown.
2. **Hypothesis.** Smallest realization believed sufficient.
3. **Alternatives.** Credible challengers only.
4. **Falsifiers.** Observations that reject the hypothesis.
5. **Probe.** Smallest real application behavior that exercises the claim.
6. **Builder proof.** The Builder must create or materially modify the behavior unless the claim is purely platform infrastructure.
7. **Positive proof.** Required success behavior.
8. **Negative proof.** Forbidden behavior shown to fail.
9. **Measurements.** Only values that can change the decision.
10. **Verdict.** ACCEPT, ACCEPT_WITH_BOUNDARY, REJECT or INSUFFICIENT_EVIDENCE.
11. **Owner reconciliation.** Durable docs/code contracts that change if accepted.
12. **Reopen trigger.** New evidence that would justify revisiting the decision.

## 9. Evidence ladder

Evidence is claim-relative.

```text
unit/fixture
!=
real integration
!=
Builder-generated Preview
!=
pilot employee interaction
!=
Published application
```

A mock proves adapter behavior, not the provider. A hand-written example proves runtime feasibility, not Builder usability. A Preview grant proves neither app behavior nor publication. A gate closes only at the evidence level named by its task.

## 10. Stage 2 lie detector

The preferred first end-to-end application is a **purchasing follow-up notebook** for Metal Nobre:

- read a bounded set of open purchase orders from Sankhya;
- store Conexus-owned follow-up notes/status separately;
- identify the employee using the app;
- do not modify Sankhya in the first version;
- publish to a stable employee URL.

It is deliberately small but crosses the boundaries Stage 2 claims to provide: Builder source, server handler, Project data, app identity, Connector and Publish.

The exact Sankhya operation/fields remain business input for Q4; they are not invented in advance.

## 11. Stage 2 completion

Stage 2 closes only when the pilot proves, with one real application:

```text
natural-language request
-> Builder-generated/modified source
-> persistent Project data
-> privileged handler execution
-> employee app authentication
-> one real authorized Sankhya read
-> explicit Publish
-> stable URL used outside the Project development surface
```

The employee must not need Project, GitHub, Factory or Builder access to use the application.

## 12. Explicitly deferred

Not Stage 2 prerequisites:

- standalone backend/container per Project;
- generic cloud deployment framework;
- Kubernetes;
- Oracle/second Connector facet;
- external-data replication/CDC;
- jobs, notifications and Automations;
- Brain and Agent Studio;
- generic workflow engine;
- generic Connector marketplace;
- universal business-entity model;
- full observability/audit platform.

They return only through their own real consumer and qualification.
