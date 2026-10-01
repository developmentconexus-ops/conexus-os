# Stage 2 Q4 — Connector qualification, with Sankhya as the first integrator

**Status:** PREPARED on 2026-09-24. **Amended on 2026-09-28:** the question is connector-generic
(next section). Part 1 (Q4.0 to Q4.5) is on `main` since #246. Part 2 stopped after Q4.7 run 2.\
**Type:** enterprise-credential and trust-boundary qualification (Q-a: the roadmap names it as a
gate; Q-b: it creates a new runtime authority over an enterprise credential; Q-c: the real read and
the pilot proof outlive the pull request)\
**Execution owner:** executor named by the operator\
**Review:** one independent review of the frozen candidate before merge, per
`docs/development/delivery.md`\
**Aprovo:** required. The change adds custody of a company credential and a Project binding.

## Amendment, 2026-09-28: the question is connector-generic

The operator decided the connector direction on 2026-09-28. [C-030](../decisions/index.md#decided-on-2026-09-28-one-integrator-per-external-system-c-030)
records it with its reasons and reopen triggers. Each external system has one integrator, and all
integrators follow one platform pattern. A company may hold several Connections of one integrator.
A Workspace owner binds a Connection to a Project under a Project-local name. Consumers send the
vendor's native request through one executor in the Hub. Sankhya is the first integrator.

The protected question of section 2 would reject that direction. It forbids a consumer from naming
a Sankhya service, entity or payload, and a native request names them on purpose. This amendment
therefore replaces the question, the closure set and the evidence. It keeps the evidence that still
proves custody and transport.

This amendment changes:

- section 2, whose question and statement it replaces;
- section 3, where C-030 supersedes decisions 4, 6 and 7 and narrows decision 11;
- section 6, whose shape and properties it restates;
- sections 7 and 8, whose steps and falsifiers it replaces with the closure set and the evidence
  below;
- sections 9 and 10, which gain the non-goals and the STOP rule below.

Sections 4, 5 and 11 to 15 apply unchanged, except where the text below names them.

### Protected question

> Can a Project read a real enterprise system through a Connection bound to it, with Sankhya as
> the first integrator, by sending the vendor's own request format through one Hub executor, from
> the Builder while it investigates and from the application's handlers at runtime, while the
> credential and the vendor token stay in the Hub, no write reaches the vendor, a Project reads only
> through its own bindings, and the Builder builds and changes a useful application without a new
> platform operation?

This question does not require a second production integrator. The synthetic REST adapter below is
a test fixture.

### Shape

```text
integrator = ConnectorDefinition + adapter (native request format, auth, pagination, read rule)
        |
Connection (Workspace; one configured account; credential sealed with @mastra/factory/secret-encryption;
            pinned origin; access level `read`; read-only confirmation)
        |
Project binding (Project, environment, Project-local name such as `erp`)
        |
executor (Hub) --- token cache --- adapter --- the Connection's pinned origin
   ^                  ^                      ^
   | runner relay     | Builder tool         | Builder script (relay, outside the closure set)
handler connectors.fetch({ connection: 'erp', ...nativeRequest })
```

The consumer names the Project-local name, the method, a path relative to the pinned origin, query
values and a vendor body. The Hub derives the Project, the environment and the consumer from the
call's context, never from the request. A sync job that writes vendor data into Project data is a
later consumer of the same executor. Section 3 point 11 and section 6.1 call it "the integrator";
C-030 gives that word to the per-system type, so this amendment calls it a sync job.

### Properties

These rows of section 6.2 stand as written: P1, P2, P10, P12 and P13. P13 applies to the binding
operations. These rows change:

| # | Restated property | Why it changed |
| --- | --- | --- |
| P3 | A consumer names a bound Connection and a native request. It cannot name a host, a scheme, a header or a token. The executor resolves the path against the Connection's pinned origin, and sends the request only when the resolved URL's origin equals the pinned origin. A check of the raw path string is not enough, because URL resolution reads a leading backslash as a slash, and it drops leading spaces and tabs. So `\\host`, `/\host`, `\/host`, and `//host` after a leading space, all resolve to another host. | A native request names vendor services and entities on purpose. |
| P4 | The executor sends only the integrator's qualified read services and refuses every other service and a mismatched Sankhya `serviceName` before the network. It never follows a redirect. It is a tripwire. The read-only guarantee is the vendor-side principal. | C-030 moves the read boundary to the vendor. A fixed field list no longer exists. |
| P5 | The executor bounds the response size, the call time and the calls per Builder run, and marks a truncated body. | The vendor's body passes through. No output contract drops fields. |
| P6 | Authority is resolved per call from the consumer's context and the Project's bindings. Nothing in the request changes the Project, the environment or the Connection. | Bindings replace operation grants. |
| P7 | A binding can only reference a Connection of its Project's own Workspace. | Bindings replace grants. |
| P8 | Removing a binding refuses the next call. Disabling a Connection ends its bindings and refuses the next call of every Project. | Bindings replace grants. |
| P9 | A failure returns a closed Conexus code, with the vendor status where one exists. A vendor error inside an HTTP 200 is a failure, never an empty success. The token and the provider's headers never reach a consumer. No vendor body reaches the browser in an error. | The vendor body reaches the calling consumer on success. |
| P11 | The Builder sees the Project-local names of its Project's bindings and the integrator's skill. It never sees the credential, the origin or a Connection its Project is not bound to. | Operations no longer exist. |
| P14 | The Builder's model receives the vendor body. The browser and the conversation history receive only a projection, as the next section defines. | The native result must reach the model to investigate, and must not reach the browser. |

### Where a vendor body may go

The executor returns the vendor body to the consumer that asked for it. Past that point, four
destinations exist, and each gets a fixed form:

| Destination | What it receives |
| --- | --- |
| The Builder's model, during the turn | The vendor body, bounded by P5. `connector_fetch` passes it through `toModelOutput`. |
| The browser stream of the running turn | A projection of every `connector_fetch` payload: the input, the input deltas, the output and the error. The input projection is the integrator, the service name and the names of the request's fields. The output projection is the status, byte count, the truncated flag, and the body's field names and counts. Neither carries a value, because the model builds later requests from values it read. `connector_fetch` sets the Mastra `transform` for the `display` target on each of those phases. Mastra suppresses input deltas that have no safe transform. |
| The conversation history, as the browser reads it | The same projections. `connector_fetch` sets `transform` for the `transcript` target. The Hub's thread messages route and stream route also apply the projections to the arguments and the result of every `connector_fetch` call they serve. Both routes serve Mastra's messages unmodified today (`apps/hub/src/builder/mastra-session-routes.ts`), and the web renders the tool arguments and `toolInvocation.result` verbatim (`apps/web/src/features/builder/components/builder-conversation.tsx`). |
| An application handler's caller | Only what the handler returns. The handler parses the vendor body and returns the fields the application needs. |

`toModelOutput` and `transform` are `createTool` options in the installed `@mastra/core` 1.67.0
(`dist/docs/references/docs-agents-tools.md`, "Transform tool payloads for UI and transcripts").
In that version the transformed payload is kept in message metadata
(`dist/tools/payload-transform.d.ts`, `getTransformedToolPayload`). Whether the stored message
also keeps the raw result is measured, not assumed. The route-level projection holds either way.
The evidence also records what a later turn of the same conversation receives, the body or the
projection.

### Closure set

Q4 closes on this set and nothing smaller:

1. **One reconciled contract.** C-030, this amendment, the product contract, the permission
   contract and the single-owner map tell one story.
2. **The executor on `main`.** The Connection with several accounts per integrator, the migration
   from `connector.project_grant` to Project bindings, `connectors.fetch` for handlers and the
   `connector_fetch` Builder tool land as pull requests built from `main`. Spike branches never
   merge. The per-operation path (`connectors.call`, `/v1/call` and `sankhya.purchase-order.read`)
   is deleted in the same wave, once the Q3 notebook application calls `connectors.fetch`.
3. **The pilot on `main`.** The pilot Hub and runner run the merged head.
4. **One autonomous investigation.** In a real Factory session, the Builder reads the vendor's
   documentation and makes two materially different reads through the tool before it builds
   anything.
5. **One useful application and one later change.** The Builder builds an application whose
   handler reads through the binding, and changes it in a second conversation. The operator names
   the application before the run. The [Builder proof rule](../development/delivery.md#builder-proof-rule)
   applies.
6. **One frozen verdict.** The exact SHAs, template and schema, every repair, every open limit, the
   Factory review and CI at the exact head.

The Builder script path through the sandbox relay is not in the closure set. The tool and the
handler prove the claim, and the relay's only consumer is exploratory scripts.

The Builder that runs items 4 and 5 is qualified by the
[Builder own harness qualification](stage2-builder-own-harness-qualification.md): the Builder off
the Mastra Factory, on the app stack v2, if the operator accepts C-032 and C-033.

### Evidence the verdict needs

- **Positive.** A real Sankhya read through the tool and through a handler, recorded as field names,
  counts, duration and a digest. The investigation proof shows that the model received the vendor
  body, not only the projection. Field names and counts are in the projection too, so they prove
  nothing here. The proof is a value. The model's next read uses a value that only the body held,
  such as a key from a returned row as a filter. The record shows the match as equal digests of the
  value in the body and in the next request, never the value. The application's handler reads
  through the binding in Preview, and the Q3 app user sees the result, with every business value
  masked.
- **Negative.** Each case is refused before the network, and the fake vendor counts zero requests:
  a write service, a mismatched `serviceName`, an absolute URL, a path that starts with `//host`,
  `\\host`, `/\host` or `\/host`, the same prefixes after a leading space or tab, a consumer header,
  another Project, a missing or removed binding, a disabled Connection, an expired run scope and an
  exhausted budget. The executor does not follow a vendor redirect, and it cuts a response over the
  size limit and marks it truncated. Each refusal has a successful control in the same run. The
  origin cases have their own control: a relative path that resolves inside the pinned origin is
  sent. The proof asserts the resolved origin of every sent request, not the raw path, and a fake
  host outside the pinned origin counts zero requests. On the pilot, another Project and a removed binding are refused.
- **Read-only.** The tripwire tests, and the vendor-side confirmation recorded on the Connection:
  who confirmed that the integration user can only read, and when. Without that confirmation, the
  verdict is at most ACCEPT_WITH_BOUNDARY and names the boundary.
- **No leak.** The Q4.11 scan, extended to the Builder sandbox's files and process arguments. The
  business-value scan over every file bound for the repository. One end-to-end run of the
  investigation plants a marker value in the fake vendor's body, and the model's second read
  filters by that marker. The run shows the marker in the model's input and in the second request
  the fake vendor received, and nowhere in the browser. It is absent from the stream, from the
  thread messages route after a reload, and from the rendered page. That covers the tool's
  arguments as well as its results. The Preview's responses carry only the fields the
  application's handler returns, never a raw vendor body. The check does not pass by dropping the
  positive read.
- **Generic seam.** A registered synthetic REST adapter and two Connections of it, bound under two
  Project-local names, read through the same executor. Each binding reaches only its own
  Connection's account, and a Project bound to one cannot read the other. A refusal of an
  unregistered integrator is not this proof.

### Retired, and why

- **Section 2**, the question and its statement. They name one operation grant and forbid native
  requests.
- **Section 3, decisions 4, 6 and 7.** C-030 supersedes them. The G0 allow-list stays as the
  tripwire of P4. Decision 11 still keeps writes, other production integrators and Publish out of
  scope. The synthetic REST adapter is a test fixture, not a second integrator.
- **Section 6.1**, the `Operation`, `ProjectGrant` and per-operation `BrokerCall` types. The shape
  above replaces them.
- **Steps Q4.3, Q4.5 and Q4.9** as written, which grant, teach and wrap one operation. The closure
  set replaces them. Q4.7 run 3 is no longer the closing run.
- **Q4.10 case 2**, "generic provider authority", which fails when a consumer names a service or an
  entity. The negative list above replaces it. Cases 1, 3, 4 and 5 stand, restated for bindings.
- **Falsifiers 2 and 6 of section 8**, restated: the design cannot hold a restated property of
  this amendment, or a sync job or inbound events cannot use the executor without a change to its
  shape. Falsifiers 1, 3, 4 and 5 stand.

### Kept evidence

Earlier runs still prove custody and transport. They do not prove the amended question.

- **G0.** The operator approved the allow-list on 2026-09-25. The approval is recorded on
  [#282](https://github.com/developmentconexus-ops/conexus-os/pull/282).
- **Connection custody and the token cache.** The part 1 tests on `main` (Q4.2 and Q4.4 in the
  [evidence](../evidence/stage2-q4/README.md#part-1-proof)).
- **Q4.6 and Q4.7 run 2.** The first real call, `POST /authenticate`, answered `OK` on 2026-09-26.
  Run 2's handler read order 22790 through the broker three times, and two reads answered `OK`.
  Both are recorded on #282. Q4.7 run 1 does not count, because it ran before the grant existed.

The Q4 spike branches document mechanisms, not a qualification. No spike run counts as gate proof,
because none was declared as proof before it ran.

### Non-goals and STOP law added

- No operation catalog, request DSL, per-operation grant or department grant.
- No allowlisted SQL expression grammar as the read boundary.
- No write to any vendor, even on a Connection whose vendor principal could write.
- STOP and return to planning if the Sankhya integration user cannot be limited to reading. The
  read boundary then needs its own decision.

## 1. Authority route

```text
C-021 enterprise connections live in the Workspace and reach a Project as authorized capabilities
+ C-022 model credentials are the Factory's; enterprise connections stay Conexus's
+ C-030 one integrator per external system, Connections bound to Projects, one native executor
+ C-028 managed-application direction
+ docs/product/contract.md section 12.6
+ docs/product/permission-contract.md (Project Connection bindings row)
+ docs/reference/stage2-managed-application-platform.md (section 5, Q4 row)
+ Q3 verdict ACCEPT_WITH_BOUNDARY (docs/evidence/stage2-q3/README.md)
+ the operator decisions of section 3
+ docs/research/stage2/connectors-build-or-adopt.md (the build-or-adopt study, as research)
        ↓
this qualification
        ↓
evidence + verdict
        ↓
owner reconciliation
```

Repository authority beats this task when they conflict. Evidence that falsifies contract section
12.6 or C-028 returns to planning; do not patch around it.

## 2. Protected question

Replaced by the [2026-09-28 amendment](#amendment-2026-09-28-the-question-is-connector-generic). The original question stays here as the record.

Can Connector Definition -> Workspace Connection -> Project Grant expose one real read-only Sankhya
capability without leaking credentials or generic provider authority?

Prove or falsify this statement:

> A Workspace holds one Sankhya Connection. An Owner grants one Project one read-only operation of
> it. Asked in product language, the Builder builds the purchase-order follow-up app: a handler reads
> order 22790 from Sankhya through that grant, and the notes live in Project data. The app runs in
> Preview with real Sankhya data and the Q3 app user sees it. An agent tool calls the same operation
> through the same grant. The credential never reaches the handler, the worker, the browser, the
> Builder, the agent, a log or the evidence. No consumer can name a Sankhya service, entity, query,
> URL or header. Another Project, another Workspace or a revoked grant reads nothing.

## 3. Operator decisions, 2026-09-24

These bind Q4 and are not reopened by the executor.

1. **Gateway only.** The Connector uses only the Sankhya gateway API: client id, client secret and
   X-Token. The MGE user and password stay out of Conexus, the design and the evidence.
2. **Where the credential comes from.** The credential lives in the operator's credentials file.
   No path, host or value of it appears in this repository, an issue, a pull request, the evidence
   or the generated application. The executor never reads that file; the operator moves the
   credential into the Workspace Connection (section 11, point 3).
3. **Sample.** The sample purchase order is document number 22790.
4. **Read authority.** The design never relies on the scope of the gateway credential. The broker
   calls only the read services on its allow-list, plus the token call `POST /authenticate`, and
   refuses any other before it reaches Sankhya. The operator recorded this decision on 2026-09-24,
   admitted the token call on 2026-09-26 and watches the first real calls. This is gate G0.
5. **No leak.** The credential never appears in logs, issues, evidence or the generated application.
   The generated application never sees it.
6. **Build the authority layer.** Conexus builds the Connection, the per-operation Project Grant,
   the broker in the Hub and the Sankhya adapter. No integration platform is adopted now. The
   [build-or-adopt study](../research/stage2/connectors-build-or-adopt.md) records why.
7. **An operation is a plain function.** It has its own Zod input and output contract, effect
   metadata (`read` or `write`) and a fixed destination. `createTool` wraps it for agents. "One
   package and one `createTool` per system" is not a rule before the second Connector.
8. **The grant check lives in the broker.** `MCPServer` stays a later surface for external agents.
   Mastra FGA is not used: it is an Enterprise feature in production.
9. **Token cache.** Sankhya authentication is OAuth 2.0 client credentials plus X-Token. The access
   token lasts about one hour and Sankhya asks callers to reuse it. The broker caches it.
10. **Mastra first.** Where an installed Mastra package ships a mechanism this task needs (tools,
    workflows, credential encryption, trace redaction), the design uses it or records, with the
    installed version and file, why it does not fit.
11. **Out of scope.** Writing to Sankhya, any other ERP or Connector, and Publish (Q5). The
    integrator (a scheduled sync into Project data) and inbound events are design only.

## 4. Preserve

- The Q1 runtime boundary. The worker keeps its empty network namespace, no host files and no
  credential. Its only ways out stay unix sockets the runner binds into it.
- The Q2 handler contract and the Q3 caller. Q4 adds one capability to the handler context and
  changes nothing else in it.
- The Q3 application session, grant and host. The app user still has no Control Plane authority.
- C-015. No Keycloak role, group or claim grants a Connector operation.
- C-022 and C-025. The Factory keeps model credentials. A Sankhya credential is not a model
  credential and never enters the Factory's credential rows or the Builder's sandbox.
- Security 3 (egress): each privileged adapter has a named owner, its own credential and a
  destination pinned by server configuration. There is no universal `fetch(url, secret)`.
- One Conexus installation serves one company (C-024).

## 5. What exists

- **No Connector code.** `apps/` and `packages/` hold no Connector Definition, Workspace Connection
  or Project Grant. `apps/hub/src/platform/config.ts` refuses the retired Sankhya gateway variables.
- **A removed first attempt.** F-06 (`4997162a`, #98) deleted `apps/hub/src/connections/` (a
  `sankhya-om` Connector Definition with a `{ clientId, clientSecret, xToken }` credential schema, a
  response admission and a transport) and `apps/hub/src/gateway/`. Read them from Git history for
  the gateway's shape. Do not restore them: they served a product surface that no longer exists.
- **Research.** `docs/research/stage2/connectors-and-notifications.md` (R09, R10) separates a
  Connection from an authorized operation and names `privilegedFetch(url, method, body)` as the
  anti-example. [Connectors: build or adopt](../research/stage2/connectors-build-or-adopt.md)
  compares the integration platforms and records the operator's resolution. Neither is execution
  authority.
- **The application.** The Q3 purchasing notebook, Project `2b9d2bbb-6336-4957-bb55-78e5fdd228cd`.
  Its handlers receive `{ db, caller }` (`apps/hub/src/app-runner/worker.ts`). The database path is a
  per-invocation relay that authenticates upstream itself (`apps/hub/src/app-runner/pg-relay.ts`).
- **Credential encryption the Hub already uses.** `apps/hub/src/platform/secrets.ts` wraps
  `@mastra/factory/secret-encryption` (0.15.0) with the installation key.
- **Installed Mastra, from `package-lock.json`.** `@mastra/core` 1.67.0, `@mastra/mcp` 1.18.0
  (transitive, through `@mastra/code-sdk`), `@mastra/observability` 1.17.8, `@mastra/factory`
  0.15.0. Their embedded documentation is under `node_modules/@mastra/*/dist/docs/`.

## 6. Design

The [2026-09-28 amendment](#amendment-2026-09-28-the-question-is-connector-generic) restates the shape and properties P3 to P9 and P11, and adds P14.

### 6.1 Shape

The shape is fixed: a broker in the Hub, reached by handlers through a runner relay and by agents
through a tool. The executor refines names and error codes with `/pstack:architect`, not the shape.

```text
Workspace Connection (Hub, credential encrypted with @mastra/factory/secret-encryption)
        |
Project Grant (Project, environment, operation)          checked by the broker on every call
        |
broker (Hub) --- token cache --- Sankhya adapter --- fixed gateway destination
   ^                       ^
   | runner relay          | createTool wrapper
handler { db, caller, + one field }      agent tool (session's Project)
```

The types below fix the structure. Names are the executor's to refine.

```ts
type Effect = 'read' | 'write'

// An operation is a plain function with its own contract. createTool wraps it; it does not define it.
type Operation<I, O> = Readonly<{
  id: OperationId                 // e.g. 'sankhya.purchase-order.read'
  effect: Effect
  destination: DestinationId      // pinned by server configuration, never by a consumer
  input: z.ZodType<I>
  output: z.ZodType<O>
  run(input: I, session: ProviderSession): Promise<O>
}>

type ConnectorDefinition = Readonly<{ id: ConnectorId; operations: readonly Operation<unknown, unknown>[] }>
type WorkspaceConnection = Readonly<{ id: ConnectionId; workspaceId: WorkspaceId; connectorId: ConnectorId; disabledAt: Date | null }>
type ProjectGrant = Readonly<{ projectId: ProjectId; environment: 'preview'; connectionId: ConnectionId; operationId: OperationId; revokedAt: Date | null }>

// Who asks. The broker derives Project and environment from this, never from the input.
type Consumer =
  | Readonly<{ kind: 'handler'; invocationId: InvocationId }>      // built in Q4
  | Readonly<{ kind: 'agent'; sessionId: SessionId }>              // built in Q4
  | Readonly<{ kind: 'integrator'; jobId: JobId }>                 // design only

type BrokerCall = Readonly<{ consumer: Consumer; operationId: OperationId; input: unknown }>
type BrokerResult<O> = Readonly<{ ok: true; value: O }> | Readonly<{ ok: false; code: BrokerErrorCode }>
```

**Design only, not built.** The design shows, with these types, that two later consumers fit
without changing the structure:

- **Integrator.** A scheduled Mastra workflow is a `Consumer` of kind `integrator`. It calls `read`
  operations through the same broker under its own Project Grant and writes into Project data.
  Mirror for reads, source for commands.
- **Inbound events.** An event is a second kind of Connector capability, received by a Hub route
  bound to one Connection and delivered only to Projects holding a grant for it. The grant row keys
  on a capability id rather than an operation id, or gains a sibling row. The design names which.

### 6.2 Properties

Each row is a falsifier. The design names how it holds each row and which test or case of Q4.10
proves it.

| # | Property |
| --- | --- |
| P1 | The credential is encrypted at rest and decrypted only inside the broker's process. It is never sent to a browser, and it never enters the worker, the handler, the runner's invocation input, the Builder's sandbox, an agent's context, a Factory credential row or the Project repository. |
| P2 | No log line, trace span, error body, issue or evidence file carries the credential or the gateway access token. Mastra tracing redacts them, or the broker's spans never receive them. |
| P3 | A consumer names one admitted operation and its typed input. It cannot name a Sankhya service, entity, SQL text, URL, host, header or token. |
| P4 | The operation calls one fixed gateway service with a fixed field list. The broker refuses every operation whose effect is `write`, and every service outside the adapter's list, before the network. |
| P5 | The output is parsed by the operation's Zod output contract. Fields outside it are dropped. The response size and the call time are bounded. |
| P6 | Authority is resolved per call from the `Consumer`: Project, environment and operation. Nothing in the input, headers or arguments changes it. |
| P7 | A Grant can only reference a Connection of its Project's own Workspace. A cross-Workspace grant is unrepresentable in the schema or refused at write. |
| P8 | Revoking a grant refuses the next call. Disabling the Connection refuses the next call of every Project. |
| P9 | A gateway failure returns a closed Conexus error code. The provider's body, headers and token never reach the consumer. |
| P10 | The broker reuses the access token until shortly before it expires and refreshes it once under concurrent calls. A refused token is dropped and fetched again at most once per call. |
| P11 | The Builder sees only the operations granted to its Project: their ids, input and output contracts and the Sankhya Skill. It never sees the credential, a URL or an ungranted operation. |
| P12 | The Q1 worker boundary holds: empty network namespace, no credential, bounded invocation. |
| P13 | Grant, Connection and Definition changes are contract changes: their operations and `docs/product/operation-ledger.md` change in the same commit, and `npm run wire:bijection` passes. |

## 7. Steps

The [2026-09-28 amendment](#amendment-2026-09-28-the-question-is-connector-generic) replaces these steps with its closure set and evidence. G0, Q4.0 to Q4.2, Q4.4 and
Q4.6 are done or kept as its kept evidence names them.

Each step ends in a check that passes before the next starts.

### G0 — Read allow-list (STOP gate)

The operator decided on 2026-09-24 that Q4 proceeds without relying on the scope of the gateway
credential. The barrier is the broker: it holds an allow-list of the Sankhya read services the
operations use plus the token call `POST /authenticate`, and it refuses any other service or path
before a request leaves the Hub.

No Sankhya call of any kind, including a test call, an authentication or a call from a spike,
happens before all of these hold:

- the allow-list names only read services, each citing the Sankhya documentation that shows it
  reads, plus `POST /authenticate`, the token call, which is the one admitted non-read call. The
  operator decided this on 2026-09-26;
- a test proves that the broker refuses a service outside the allow-list without any network call;
- the adapter's source has no write-capable service name;
- the evidence records the decision and its date, never the credential.

Every real Sankhya call during Q4 is logged in the evidence with the service name, time and status,
never a value. The operator watches the first real call. **Check:** the four items are in
`docs/evidence/stage2-q4/README.md` before Q4.6.

Steps Q4.0 to Q4.5 make no Sankhya call and may run before G0.

### Q4.0 (S0) — Native census

Before the first product edit, load the `mastra` skill and read the installed `@mastra/*` packages.
For each mechanism this task touches, record the native offer, its exact source (the installed
`.d.ts` or `dist/docs` file and the package version, or a dated URL) and USE, KEEP or NOT FIT with
the reason.

Rows to USE, verified at the installed versions:

- Zod for each operation's input and output contract;
- `createTool` (`@mastra/core`) as the agent wrapper, and request context for the session's Project;
- `@mastra/factory/secret-encryption` for the Connection's credential;
- the `SensitiveDataFilter` of `@mastra/observability`, or the reason the broker's spans never
  receive the credential;
- Mastra workflows as the future integrator (design only);
- [`sankhya-skills`](https://github.com/andressaolivi/sankhya-skills) (MIT) as a source for the
  Sankhya Skill, checked table by table against the company's Sankhya version before any line
  enters the Skill. Record attribution.

Rows NOT FIT, with the source the study found:

- **Activepieces as a runtime.** Its common HTTP client sets
  `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` for the whole process
  ([`packages/pieces/common/src/lib/http/core/fetch-http-client.ts`, line 30 on 2026-09-24](https://github.com/activepieces/activepieces/blob/main/packages/pieces/common/src/lib/http/core/fetch-http-client.ts)),
  and its `custom_api_call` action is the `privilegedFetch` R09 forbids. Its MIT pieces stay a
  source to port from, with attribution.
- **Nango, free self-host.** It covers auth and proxy only; functions, syncs and webhooks need
  Enterprise or Cloud ([self-hosting](https://nango.dev/docs/guides/platform/self-hosting)).
- **Vendor-custody tool providers.** Composio, Arcade, Merge and Mastra `toolProviders` keep the
  credential with the vendor.
- **n8n and Pipedream.** Their licenses restrict this use
  ([n8n](https://github.com/n8n-io/n8n/blob/master/LICENSE.md),
  [Pipedream](https://github.com/PipedreamHQ/pipedream/blob/master/LICENSE)).
- **Mastra FGA.** Enterprise in production; the grant check lives in the broker.
- **`MCPServer` for Q4.** A later surface for external agents, not the Q4 path.

**Check:** `docs/evidence/stage2-q4/census.md` exists and every row cites a file and version or a
dated URL.

### Q4.1 — Design freeze

Run `/pstack:architect` on the shape of 6.1: final names, the handler-facing field, error codes, the
manifest's declaration of operations if any, the token cache and the design-only integrator and
event types. **Check:** `docs/evidence/stage2-q4/design.md` holds the frozen types and maps P1 to
P13 to a test or a Q4.10 case.

### Q4.2 — Connector Definition and Workspace Connection

Add the Sankhya Connector Definition with its one `read` operation, and the Workspace Connection with
encrypted custody of client id, client secret and X-Token. The Connection stores no MGE user or
password and its schema has no field for one. **Check:** unit tests show a stored Connection holds
only ciphertext, and no Hub operation returns a credential field.

The **Integrações** screen at `/projects/$projectId/integrations` (replacing the "Em breve"
item in `apps/web/src/app/shell.tsx`) serves both roles: it lists the Workspace's Connections,
lets an installation administrator add one (client id, client secret and X-Token as write-only
fields that are never shown back), check it (`POST /authenticate` only, and only after G0), and
disable it; and lets a Workspace Owner grant and revoke the operation for this Project (Q4.3).
**Check:** a browser test creates a Connection through the screen as an installation administrator,
verifies that an Owner grants and revokes an operation, reloads, and finds no credential value
in the page, the network responses or the Hub logs.

### Q4.3 — Project Grant

A Workspace Owner grants and revokes one operation of a Connection to one Project and environment
on the **Integrações** screen. Only the Preview environment exists before Q5. **Check:** tests prove
P7 and P8 against real PostgreSQL, and `npm run wire:bijection` passes.

### Q4.4 — Broker, token cache and handler relay

Build the broker, the token cache and the handler path through the runner relay against a local fake
gateway that records every request and issues short-lived tokens. **Check:** the handler reads a fake
order through the grant; the fake gateway saw exactly one fixed service with the fixed fields; ten
concurrent calls cause one token request; an expired token is refreshed once; the worker's
environment, files and memory hold no credential; P3 to P6, P9 and P10 pass as tests.

### Q4.5 — What the Builder learns

Write the Sankhya Skill from the checked census sources, and expose to the Builder the typed contracts
of the operations granted to its Project, and only those. **Check:** a Project with no grant sees no
Sankhya operation; a Project with the grant sees its id and contracts; the Builder's sandbox holds no
credential or gateway URL (P11).

### Q4.6 — First real call and the grant

After G0, the Workspace Owner grants `sankhya.purchase-order.read` to the Q3 Project in the
Integrações screen. The installation administrator then presses **Testar** on the Connection the
operator loaded. That check is the first real Sankhya call, and it calls `POST /authenticate` only.
The operator watches it. The first data read happens in Q4.7 (section 11, point 7). **Check:** the
grant is open; **Testar** answers `OK`; the evidence logs the call as G0 requires.

### Q4.7 — Builder end to end (the main case)

The Q3 Project holds the grant from Q4.6. With `scripts/builder-eval/run.mjs`, the operator asks the
Builder in product language:

> Quero acompanhar os pedidos de compra. Para o pedido 22790, mostre os dados do pedido que estão no
> Sankhya e deixe a equipe registrar notas de acompanhamento.

The Builder, taught by the Sankhya Skill and the typed operations the Project may use, writes a
handler that calls the operation through the runner relay and the broker. The notes stay in Project
data. The handler's first call is Q4's first data read. Budget: two Builder runs, one of them a
repair.

If the first read fails, the executor diagnoses it from the broker's `connector.call` audit line and
the Builder's diff before any fix. Only a demonstrated Hub defect, such as a wrong field mapping in
`sankhya/purchase-order.ts`, is fixed in the Hub. A reload of the same Preview retests that fix
without spending a Builder run. A credential, configuration or Sankhya data problem goes to the
operator. An external outage waits, and the same Preview is retried. A fault in the handler counts
against the Builder's budget as before.

**Check:** the Preview shows real Sankhya data for 22790 beside its notes after reload; the handler
calls the operation, not a hard-coded value or a browser request; the Builder's diff and transcript
hold no credential, host or Sankhya service name; the evidence records the first read's fields
returned, call count, duration and response digest. The evidence shows field names, counts and
digests, never order 22790's business values (section 11, point 5).

### Q4.8 — App user on the pilot

As the Q3 app user (`funcionario-teste@gmail.com`, app-only), in a fresh browser: open the
application, sign in, and see order 22790 with its notes. **Check:** the evidence holds a screenshot
with every business value masked and the handler's response reduced to field names, types, counts and
a digest, as section 11 allows. No raw response is committed.

### Q4.9 — Second consumer: an agent tool

Wrap the same operation with `createTool`. Its `execute` calls the broker as a `Consumer` of kind
`agent`, with the Project resolved from the session, never with the credential. **Check:** an agent in
the Q3 Project reads 22790 through the tool; the same agent in a Project without the grant is
refused; after revocation the next tool call is refused.

### Q4.10 — Negative proof

A script sends each request as a real consumer and records the request, the answer and whether the
refusal held. The committed record keeps status codes, error codes, field names and digests only; a
successful control records counts and a digest, never the order's values. Where a refusal could hide a broken fixture, the same run records a live control that
succeeds. Each of these must fail:

1. **Credential leak.** A handler or the agent tool returns, logs or throws its whole context,
   `process.env`, the files it can read or the connector field's internals, and the credential or an
   access token appears. A gateway error is forced (unknown order, timeout, refused token) and the
   provider's body or token reaches the consumer, the browser or a log. The Builder is asked in
   product language to "use the Sankhya key directly", and any credential reaches its sandbox or
   diff.
2. **Generic provider authority.** A consumer passes a Sankhya service name, an entity, SQL text, a
   URL, a host, a header or a token, and the broker forwards it. A consumer asks for a field outside
   the output contract and receives it. The worker opens any network connection. The Builder sees
   an operation its Project was not granted.
3. **Cross-Project or cross-Workspace grant.** Another Project of the same Workspace, with no grant,
   calls the operation. A Project of another Workspace calls it. An Owner of another Workspace
   grants this Workspace's Connection to their own Project. A consumer changes a Project,
   environment, Workspace, Connection or grant identifier in its input and the resolved grant
   changes.
4. **Revoked grant.** After the Owner revokes the grant, the next handler or tool call succeeds.
   After the Connection is disabled, the next call of any Project succeeds.
5. **Write attempt.** A consumer asks for any Sankhya write service or an operation with effect
   `write`, and a request leaves the broker. The fake gateway of Q4.4 counts zero such requests and
   the pilot run sends none.

The app user reading or changing the Connection or a grant is recorded as a sixth case.
**Check:** every case held, recorded in `docs/evidence/stage2-q4/q4.10-proof.json`.

### Q4.11 — Leak scan

The scan never holds the plaintext credential: P1 holds without exception. The broker, inside its
own process, supplies what the scan compares against, for example a non-reversible fingerprint of
each credential value and access token or a count per location that it computes itself, and the
implementer designs how. Nothing the broker supplies lets the credential be recovered. The scan
searches the Hub, runner and Factory logs of the run window, the Mastra traces, the Builder and
agent transcripts, the Project repository at every commit Q4 made, the built Preview artifact and
`docs/evidence/stage2-q4/`. It prints only a count per location. **Check:** every count is zero,
and a test shows the scan's process never receives a plaintext credential value.

The same script also collects order 22790's business values from every live read the run made, held
in its own memory (supplier, dates, status, prices, quantities, totals, item descriptions, notes), and
searches every text file bound for the repository (`docs/evidence/stage2-q4/`, the Builder and agent
transcripts, the Project repository at every commit Q4 made, and every commit of this branch that
touches `docs/evidence/stage2-q4/`) for each value in each representation the
fields can take (a number with and without thousands and decimal separators, a date in ISO and in
dd/mm/yyyy). For short or common values, such as a status word or a one-digit quantity, count the
whole value when it appears next to its field name **or** without a label in the same logical record
(line, table row, JSON object or transcript turn) as an explicit reference to order 22790. Count it
without a label or repeated order number in a bounded context explicitly scoped to order 22790:
the answer to a prompt about that order in the same transcript exchange, or rows under that order's
heading. The scope ends at the next unrelated exchange, order or section; it must not extend to
unrelated turns or rows. Also count unlabelled values in a text evidence file explicitly dedicated
to that order by its path or metadata. A generic word or digit elsewhere in a Q4 evidence file is
not a match merely because the file is in the evidence directory. For example, `PENDING` in an
answer to "What is the status of order 22790?" counts even without a field label or order number
in the answer; `PENDING` outside that order's context does not. It prints only a count per file.
Before a screenshot is committed, the operator looks at it and confirms every business value is
masked. **Check:** every count is zero and the operator's confirmation is in the evidence README.

## 8. Falsifiers

The [2026-09-28 amendment](#amendment-2026-09-28-the-question-is-connector-generic) restates falsifiers 2 and 6.

Any one rejects the hypothesis:

1. any case of Q4.10 succeeds, or any count of Q4.11 is not zero;
2. the design cannot hold a property of 6.2 on the installed mechanisms;
3. authority for a call is read from the input, a Keycloak claim or a Factory credential;
4. the Builder cannot build the Q4.7 app within its budget, with the repeated failure named;
5. the real read of 22790 cannot be done with the gateway credential alone;
6. the integrator or inbound events cannot be expressed with the 6.1 types without changing the
   structure.

## 9. Non-goals

- no write to Sankhya, not even behind a flag;
- no other ERP, no second Connector, no Oracle or database facet;
- no integration platform: no Nango, Activepieces, n8n, Pipedream, Composio, Arcade or Merge;
- no `MCPServer` surface and no Mastra FGA;
- no integrator and no inbound events beyond their types;
- no rule that each system is one package with one `createTool`;
- no Release, Publish or published pointer (Q5);
- no Connector marketplace, discovery or generic query surface;
- no MGE user or password anywhere.

## 10. STOP law

STOP and return to the planner on:

- **any Sankhya call, including a test call, before G0, or to a service outside the G0
  allow-list, whose one non-read entry is `POST /authenticate`.**
  This rule comes first and has no exception;
- a need for the MGE user or password, or for a second credential;
- the credential, an access token or a value from the operator's credentials file seen anywhere
  outside the broker, even once. The one authorized path is the installation administrator typing
  client id, client secret and X-Token into the write-only fields of Q4.2, which the browser sends
  once in the request that creates the Connection. A value in any response, page state after that
  request, log, worker, agent, the Builder or the repository is a leak. Stop, tell the operator so
  they can rotate it, and write no value in the report;
- a need to reopen contract section 12.6, C-022 or C-028, or the Q1 worker boundary;
- a property of 6.2 that the design cannot keep;
- a need for a new dependency, including `@mastra/mcp` as a direct one (the technology rule applies
  first);
- a product question section 3 or section 11 does not answer;
- a pilot fault: the Hub, Keycloak or the runner not serving. Check the runner socket before
  blaming the Builder. Never touch the pilot beyond what a step names.

## 11. Points reserved for the operator

1. **G0.** Decided on 2026-09-24: proceed on the broker's read allow-list (section 7). The operator
   watches the first real call.
2. **Operation and fields.** Decided on 2026-09-24: document number 22790. The app shows the
   order's number, date, supplier, status, total and items.
3. **Loading the credential.** Decided on 2026-09-24: the operator types client id, client secret
   and X-Token into the Integrações screen (Q4.2). The executor never handles them.
4. **Who administers.** Decided on 2026-09-24: the installation administrator creates the
   Connection. The Grant stays with the Workspace Owner.
5. **Business values.** Decided on 2026-09-24, revised the same day when the repository became public:
   every public artifact from Q4.6 to Q4.11 (evidence, screenshots, logs, transcripts) shows only
   field names, types, counts, status codes, digests and the call metadata this task asks for: the
   allow-listed service name, time, duration and call count. It never shows the order's supplier, dates,
   status, prices, quantities, totals, items or notes, and never a raw Sankhya or handler response.
   The document number 22790 is the one exception: it is an identifier the task already names.
6. **The verdict.**
7. **First data read.** Decided on 2026-09-26 (decision 16A): the first read of order 22790 is the
   first handler read of Q4.7, not a separate read in Q4.6. Before Q4.9, a handler is the only
   consumer that reaches the broker. A one-off script would run a second broker outside the Hub,
   and section 6.1 fixes the broker in the Hub.

## 12. Evidence layout

```text
docs/evidence/stage2-q4/
  README.md            verdict, G0 confirmation and date, falsifiers, findings, review
  census.md            Q4.0 native census with versions, files and dated URLs
  design.md            Q4.1 frozen types, design-only consumers, property map
  q4.7-run1/           Builder run, grade, diff summary, redacted (run2/ if used); the first read's
                       fields, call count, duration and digest
  q4.8-app-user.png    the app user's view, redacted per section 11 point 5
  q4.9-agent-tool/     the agent tool's calls and refusals, as sanitized summaries
  q4.10-proof.json     every case with a sanitized request and answer summary and its verdict
  q4.11-leak-scan.txt  counts per location
```

No file in it holds a credential, an access token, a host of the gateway or a path of the operator's
credentials file. Every file follows section 11, point 5: no business value of the order and no raw
Sankhya, handler or agent response.

## 13. Verdict

Return ACCEPT, ACCEPT_WITH_BOUNDARY, REJECT or INSUFFICIENT_EVIDENCE in
`docs/evidence/stage2-q4/README.md`, with the census, the design, the positive proof, every case of
Q4.10, the leak scan and the independent review's findings and how each was resolved.

## 14. Owner reconciliation

After the verdict, reconcile only what Q4 proved:

- `docs/product/contract.md` section 12.6: the first Connector's shape;
- `docs/product/permission-contract.md`: the Connector grant row, from direction to delivered;
- `docs/reference/security-and-authority.md`: section 3 gains the Sankhya adapter; section 5 gains
  enterprise credential custody;
- `docs/reference/stage2-managed-application-platform.md`: the Q4 row, the handler contract and the
  technology queue rows for Nango and Activepieces;
- `docs/roadmap.md`: the Q4 status and the exact next action.

## 15. Reopen triggers

- **Activepieces:** a piece host in an isolated process, with fixed egress, without
  `custom_api_call`, and a test that proves the process keeps TLS verification on; or Activepieces
  removes the TLS override.
- **Nango:** the second and third Connectors each cost more than Nango in the edition they need,
  with its cost and features confirmed.
- a real need to write to Sankhya;
- a conversation or external agent that needs the operation through `MCPServer`;
- a real consumer for the integrator or inbound events;
- Q5 needing a Published grant model different from this one;
- a Sankhya gateway change to its authentication or services.
