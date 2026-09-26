# Stage 2 Q4 — Sankhya connector qualification

**Status:** PREPARED on 2026-09-24. Not started. No Sankhya call before gate G0 of section 7.\
**Type:** enterprise-credential and trust-boundary qualification (Q-a: the roadmap names it as a
gate; Q-b: it creates a new runtime authority over an enterprise credential; Q-c: the real read and
the pilot proof outlive the pull request)\
**Execution owner:** executor named by the operator\
**Review:** one independent review of the frozen candidate before merge, per
`docs/development/delivery.md`\
**Aprovo:** required. The change adds custody of a company credential and a new grant.

## 1. Authority route

```text
C-021 enterprise connections live in the Workspace and reach a Project as authorized capabilities
+ C-022 model credentials are the Factory's; enterprise connections stay Conexus's
+ C-028 managed-application direction
+ docs/product/contract.md section 12.6
+ docs/product/permission-contract.md (Connector grants row)
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

The installation administrator creates the Connection in the Hub's **Integrações** screen, which is
today a "coming soon" item in `apps/web/src/app/shell.tsx`. Q4 turns on its first version: list the
Workspace's Connections, add a Sankhya Connection (client id, client secret and X-Token as
write-only fields that are never shown back), test it, and grant an operation to a Project. The test
button calls `POST /authenticate` only, and only after G0. **Check:** a browser test
creates a Connection and a Grant through the screen, reloads, and finds no credential value in the
page, the network responses or the Hub logs.

### Q4.3 — Project Grant

A Workspace Owner grants and revokes one operation of a Connection to one Project and environment.
Only the Preview environment exists before Q5. **Check:** tests prove P7 and P8 against real
PostgreSQL, and `npm run wire:bijection` passes.

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

### Q4.6 — First real read

After G0, the executor reads purchase order 22790 once through the broker on the pilot, using the
Connection the operator loaded. **Check:** the broker returns the order; the evidence records the
fields returned, the call count, the duration and a response digest. The evidence shows field names,
counts and digests, never order 22790's business values (section 11, point 5).

### Q4.7 — Builder end to end (the main case)

The Owner grants the operation to the Q3 Project. With `scripts/builder-eval/run.mjs`, the operator
asks the Builder in product language:

> Quero acompanhar os pedidos de compra. Para o pedido 22790, mostre os dados do pedido que estão no
> Sankhya e deixe a equipe registrar notas de acompanhamento.

The Builder, taught by the Sankhya Skill and the typed operations the Project may use, writes a
handler that calls the operation through the runner relay and the broker. The notes stay in Project
data. Budget: two Builder runs, one of them a repair. **Check:** the Preview shows real Sankhya data
for 22790 beside its notes after reload; the handler calls the operation, not a hard-coded value or a
browser request; the Builder's diff and transcript hold no credential, host or Sankhya service name.

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
  outside the broker, even once. Stop, tell the operator so they can rotate it, and write no value
  in the report;
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

## 12. Evidence layout

```text
docs/evidence/stage2-q4/
  README.md            verdict, G0 confirmation and date, falsifiers, findings, review
  census.md            Q4.0 native census with versions, files and dated URLs
  design.md            Q4.1 frozen types, design-only consumers, property map
  q4.6-real-read/      fields, call count, duration, digest
  q4.7-run1/           Builder run, grade, diff summary, redacted (run2/ if used)
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
