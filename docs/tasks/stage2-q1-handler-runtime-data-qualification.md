# Stage 2 Q1 — Handler runtime + persistent Preview data qualification

**Status:** AUTHORIZED NEXT QUALIFICATION after this documentation rebaseline is accepted  
**Type:** material runtime/trust-boundary qualification  
**Execution owner:** executor named by the operator  
**Review:** independent review is required because this slice creates a runtime/database trust boundary

## 1. Authority route

```text
C-021 product destination
+ C-028 managed-application direction
+ docs/reference/stage2-managed-application-platform.md
        ↓
this qualification
        ↓
evidence + verdict
        ↓
owner reconciliation or replan
```

Repository current authority beats this task when they conflict. Evidence that falsifies C-028 or the reference returns to planning; do not patch around it.

## 2. Protected result

Prove or falsify this statement:

> The existing Builder can create a Preview whose frontend calls Builder-generated server logic running outside the Hub, with persistent Preview data scoped to exactly one Project, while that generated logic cannot acquire Hub/model/Connector credentials, another Project's data, or unauthorized network authority.

The result is not "a Fastify server starts". It is one Builder-generated application behavior and its negative boundaries on the pilot-equivalent runtime.

## 3. Why this is first

Publish is small if an application artifact is already trustworthy. The largest Stage 2 unknown is whether generated privileged code can execute with a sustainable boundary and data authority.

No work on application users, Sankhya or Publish may build on Q1 until this claim has a verdict.

## 4. Preserve

Do not regress:

- Factory-centered Builder and Mastra ownership from C-022;
- one owner per shared concept;
- Project source in its private Git repository;
- source admission and stale-base protection;
- current Hub IAM and database roles;
- Builder E2B isolation;
- current application frontend build unless Q1 requires the smallest compatible extension;
- no credentials returned to browser or written to Project source;
- one Conexus installation serves one company.

Preview continuity is not a protected result. A failed candidate may make Preview unavailable while the Builder repairs it. Published stability is outside Q1.

## 5. Fixed hypothesis

Test the smallest current hypothesis first:

```text
browser Preview
      |
      | same-origin /__conexus/api/<static operation>
      v
trusted Preview/app ingress
      |
      | invocation identity fixed by platform
      v
application runner process OUTSIDE Hub
      |
      +-- generated handler code
      |
      +-- Preview-only Project DB role
              |
              v
dedicated application database
Project × PREVIEW schema
```

Initial platform baseline:

- Node 24.20.0;
- Fastify 5.12.1 as hosting mechanism;
- Ajv/Zod only where platform validation needs them; do not expose a framework merely to justify its presence;
- pg 8.23.0;
- parameterized SQL for the probe;
- one runner outside the Hub: a supervisor that executes each invocation in its own isolated worker, never several Projects' generated code in one process.

"A separate process" is not by itself a boundary. On the pilot the Hub's secrets are files readable by the operator's OS user (`~/.config/conexus/secrets/`, the Hub environment file), so a worker running as that user fails falsifier 4 by construction, and Projects sharing one process share memory and fail falsifier 2.

The throwaway runner arena (branch `spike/q1-runner-arena`, `spike/q1-runner/REPORT.md`, never merged) ran one 24-case adversarial suite, including migration attacks, against two isolation mechanisms on the pilot host. Both blocked every case.

- **Selected. Rootless bubblewrap worker per invocation.** Unprivileged user, pid, net, ipc and uts namespaces; an allowlist root filesystem that never binds the operator's home; an empty network namespace, with the Project database reached only through a bound-in unix socket; a heap cap and a supervisor wall-clock kill. No root, no dedicated OS user, no firewall rule. Handler p50 49 ms, p95 60 ms.
- **Fallback. Per-Project hardened container** (`--cap-drop ALL`, no-new-privileges, read-only root, internal network reaching only Postgres). Also passed, at about twice the latency (p50 91 ms). It is a long-lived container per Project, which C-028 does not grant, so selecting it requires amending C-028 first.

The bubblewrap realization carries two durable conditions. The runner asserts at startup that unprivileged user namespaces are enabled and refuses to serve otherwise. The Project database credential reaches the worker through a pipe or a bound file, never through process arguments, because `bwrap --setenv` places it in `/proc/<pid>/cmdline` on the host.

The migration role must stay unprivileged and confined to its own Project schema. The arena observed that an owning migration role can still create a `SECURITY DEFINER` function and grant `USAGE` on its schema to another Project's role; both were inert only because the role holds nothing more. Cross-Project grants belong to the platform, never to generated SQL.

Q1.0 adds one fact to verify: how the application database's unix socket reaches the worker on the pilot, where Postgres runs in a container.

The generated handler contract in Q1 is **qualification-only**. Keep it deliberately small. Q2 owns the durable programming-model decision.

If the selected realization fails a falsifier on the real Builder path, STOP with evidence and return to planning. Do not silently escalate to per-Project containers inside this task.

## 6. Application used by the probe

Use the smallest useful fragment of the purchasing follow-up application.

The Builder receives a natural-language request equivalent to:

> Add follow-up notes to a purchase order. I can enter an order number, write a note, save it and see the saved notes after reloading. Keep the interface simple.

For Q1 the purchase order may be a typed/string identifier. Sankhya is not involved yet.

The Project owns only the follow-up note data.

Minimum business data:

```text
FollowUpNote
- id
- purchaseOrderId
- note
- createdAt
```

Do not add workflow/status/responsible person unless required to prove Q1.

## 7. Source shape exercised by Q1

The Builder must materially create or edit both browser and server-owned Project source.

Qualification shape:

```text
app/
  ...

conexus/
  handlers/
    <follow-up handler source>
  migrations/
    <initial follow-up schema>
  manifest.json

conexus.json
```

The executor may choose mechanically safe exact filenames. Do not create a generic SDK or framework API in Q1.

The manifest must at minimum bind a finite static operation id/path to an exact handler module and exact input/output constraints. Caller-selected module paths, SQL, URLs or operation names are forbidden.

## 8. Code census before the first Product edit

Read and record KEEP / CHANGE / NEW / DELETE / MEASURE for at least:

- `apps/hub/src/builder/application-starter.ts`;
- `apps/hub/src/builder/application-artifact-runtime.ts`;
- `apps/hub/compiler-template/**`;
- `apps/hub/src/mar/module.ts`;
- `apps/hub/src/mar/preview-routes.ts`;
- artifact registry/storage paths that retain application bytes;
- current Postgres provisioning/migration helpers and role register;
- `scripts/check-import-law.mjs`;
- Builder tests that prove compile/smoke/Preview;
- exact E2B template/runtime assumptions.

Do not widen the edit surface merely because a file was inspected.

## 9. Qualification steps

### Q1.0 — Exact dependency/API verification

Before implementation:

1. read the exact installed Fastify, pg, validation and Node APIs that the proposed runner needs;
2. inspect whether Node's current runtime supplies any useful defense-in-depth control, but do not treat language/runtime permissions as the process boundary;
3. verify the current Postgres cluster/provisioning path can create a dedicated application database and restricted Preview role without giving generated code Hub DB authority;
4. record any material limitation before writing the runner.

No package is added unless this step demonstrates a concrete missing primitive.

### Q1.1 — Data isolation substrate

Create the smallest Preview data allocation that proves:

- dedicated application data is outside Hub-owned schemas;
- Project A Preview role can DML only its Preview schema;
- Project B uses a different authority;
- schema owner/migration authority is separate from runtime DML authority;
- public/default grants do not defeat the boundary.

Project migrations are Builder-generated SQL executed with the Project's migration authority, so they are generated privileged code too. For Q1:

- migrations apply to the Project's Preview schema after a successful build and before that build is offered as a Preview;
- a failed migration means no Preview for that candidate, and the Builder receives the diagnostic;
- Preview data is disposable: it must survive a runner restart, but Conexus may reset the Preview schema when a migration cannot apply cleanly, and says so;
- the migration role owns only its Project's Preview schema and holds no role, database, extension or superuser authority.

Add focused negative database tests first or alongside the implementation.

### Q1.2 — Runner boundary

Create a runtime entrypoint outside the Hub process.

It receives only platform-issued invocation context and the exact admitted handler bundle/operation. Generated code may not choose Project, environment, DB role, handler path, or connection credentials.

Provide bounded:

- execution time;
- request/input size;
- response size;
- concurrency sufficient for the probe;
- error projection.

Do not implement jobs, queues or retry orchestration.

### Q1.3 — Same-origin Preview API

Extend Preview only enough for the generated frontend to call its own static application API.

The Preview CSP may change from `connect-src 'none'` only to the smallest same-origin rule required by the app API.

The existing smoke must not begin depending on arbitrary external hosts. Give it an explicit local API fixture/route sufficient for the app to mount.

### Q1.4 — Builder paved-road guidance

Teach the Builder the Q1 application shape through the smallest durable mechanism.

Prefer, in order:

1. source-owned starter/check contract;
2. types/schema/compiler feedback;
3. a focused Builder Skill/reference loaded only when the application needs server/data behavior;
4. short host instruction only for an invariant that cannot live elsewhere.

Do not add a long system prompt containing runtime documentation.

The Builder must run the Project check and repair its own source if the check reports an error.

### Q1.5 — Real Builder generation

Start from a Project that does not already contain the follow-up implementation.

Use a real Builder conversation and the current real model path.

Ask for the follow-up-note behavior in product language. Do not tell the model which files to edit or hand it the final implementation.

Record:

- source revision before/after;
- files the Builder created/changed;
- whether it found the paved-road guidance by itself;
- number of model turns/repair iterations to a green Preview;
- check/build failures and whether the Builder repaired them;
- resulting Preview operation.

A hand-written fixture may prepare lower-level tests, but it cannot close Q1.

### Q1.6 — Restart persistence

After creating a note:

1. terminate/restart the application runner;
2. reopen the Preview/API path;
3. prove the note remains.

The runner filesystem must not be the durable owner.

### Q1.7 — Adversarial boundary probe

Run generated/probe handler attempts for each forbidden capability:

- read another Project's application data;
- read Hub database data;
- obtain Hub/model/GitHub/Connector credentials from environment/files/process state, including the pilot's real secret paths and the supervisor's `/proc` entries (report readable or not and size only, never contents);
- choose or override a foreign Project/environment identity;
- invoke an arbitrary network destination not admitted by the Q1 boundary, including the Hub's own ports and the container daemon socket;
- escape the admitted handler/module root or spawn a child process;
- exhaust execution past the configured time, memory or response bound;
- crash its worker, after which the supervisor still serves the next request;
- through a generated migration: `CREATE EXTENSION`, a `SECURITY DEFINER` function, `COPY ... PROGRAM`, `ALTER ROLE`, a grant to another Project's role, a schema outside its own, or a foreign-data/dblink connection.

Each protected path must visibly refuse or terminate.

If the boundary cannot credibly prevent one of these with the proposed shared runner, Q1 verdict is REJECT/REPLAN. Do not hide it behind lint or Builder instructions.

## 10. Measurements

Collect only decision-relevant measurements:

- time from Builder request to usable Preview;
- number of Builder repair iterations;
- generated server-source size;
- runner cold/start-to-first-handler latency;
- handler p50/p95 for the local note flow over a bounded sample;
- Postgres connections used by one Preview;
- every adversarial falsifier result.

Do not establish performance SLOs in Q1. Measurements decide whether the baseline is usable and whether a later warm/container strategy needs qualification.

## 11. Falsifiers

Q1 fails or returns to planning if any of these is observed:

1. generated handler executes inside the Hub process;
2. one Project reads/writes another Project's application data;
3. runtime DML authority can alter schema/roles or Hub data;
4. generated code can obtain a privileged platform/model/Connector credential;
5. generated code can select arbitrary handler paths, Project identity or DB authority;
6. open network access remains necessary with no bounded reason;
7. runner failure can take down the Hub;
8. persistence depends on runner-local filesystem;
9. Builder can reach a green build only when given implementation/file instructions that an ordinary user would never provide;
10. the source needed to reproduce server behavior exists only in platform metadata and not Project Git;
11. a generated migration gains authority beyond its own Project's Preview schema.

A falsifier is a result, not a request to patch indefinitely.

## 12. Positive completion proof

Q1 can receive an ACCEPT verdict only when the pilot-equivalent path demonstrates:

```text
natural-language Builder request
-> Builder edits browser + server/data Project source
-> Project check
-> Conexus build
-> Preview opens
-> browser creates note through same-origin app API
-> reload reads persisted note
-> runner restart still reads it
-> second Project cannot read it
-> adversarial handler cannot acquire forbidden authority
```

Capture source revision, exact build/artifact identity, runner version/config used, database role/schema identities, browser evidence and negative-probe output.

## 13. Non-goals

Do not implement in Q1:

- Published app URL or Release/Publish operations;
- application-user Keycloak flow;
- Sankhya or any enterprise Connector;
- Oracle;
- jobs/background work;
- Notifications;
- Automations;
- Brain/Agent Studio;
- ORM;
- Data service/generic entities;
- Kysely/Prisma/Drizzle bake-off;
- OpenTelemetry rollout;
- per-Project production containers;
- Cloud Run/Fly/Kubernetes;
- standalone software profile.

## 14. Expected verdict

Return one:

- **ACCEPT** — shared runner + scoped Preview data satisfy every protected claim;
- **ACCEPT_WITH_BOUNDARY** — claim holds but an explicit narrow boundary/operational condition must become durable;
- **REJECT** — baseline is structurally insufficient; report the falsifier and smallest credible successor;
- **INSUFFICIENT_EVIDENCE** — a named external/pilot prerequisite prevented the deciding proof.

Do not call a green unit suite ACCEPT.

## 15. Owner reconciliation after verdict

If accepted, reconcile only meaning Q1 actually proved:

- `docs/reference/stage2-managed-application-platform.md`;
- application/data/security technical references as needed;
- Builder application-profile guidance;
- `docs/roadmap.md` status and exact next action;
- C-028 only if evidence changes its boundary.

Create the Q2 task only after Q1 evidence is accepted.

## 16. STOP law

STOP and return to planner on:

- any falsifier above;
- a need to execute generated code inside the Hub;
- a need for a new privileged credential in generated Project code;
- a material database topology/authority choice not covered here;
- a requirement for a new package whose role changes the programming model rather than mechanically supporting this probe;
- evidence that the Builder cannot use the proposed source shape without a different application programming model;
- any production/external effect not explicitly authorized by this task.

After verification, commit, push and STOP. Do not begin Q2.
