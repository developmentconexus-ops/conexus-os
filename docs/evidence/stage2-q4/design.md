# Stage 2 Q4 — frozen design (Q4.1)

Frozen on 2026-09-24 by the executor after a `/pstack:architect` arena: three independent candidates
(Opus, Fable and Sonnet runners) on the same grounding, one cross-judge, then synthesis. Mastra claims
cite the installed packages: `@mastra/core` 1.67.0, `@mastra/factory` 0.15.0,
`@mastra/observability` 1.17.8, `zod` 4.5.2 ([census](census.md)).

The shape is the task's (section 6.1). This file fixes names, the handler-facing field, the error
codes, the storage, the runner-to-Hub path, the token cache, what the Builder learns and the
design-only consumers, and maps P1 to P13 to a mechanism and a test.

## 1. Usage

A handler the Builder writes:

```js
// conexus-server/orders.mjs
export async function orderFollowUp(input, { db, caller, connectors }) {
  const read = await connectors.call('sankhya.purchase-order.read', { documentNumber: input.documentNumber })
  const { rows: notes } = await db.query('SELECT id, body, author, created_at FROM notes WHERE document_number = $1 ORDER BY created_at', [input.documentNumber])
  if (!read.ok) return { order: null, unavailable: read.code, notes }
  return { order: read.value.orders[0] ?? null, matches: read.value.orders.length, notes }
}
```

`connectors.call(operationId, input)` never throws. It answers `{ ok: true, value }` or
`{ ok: false, code }` with a code from a closed list. Nothing in the call can name a Project, a
Connection, a Sankhya service, entity, expression, URL, header or token.

The agent tool (Q4.9, part 2) wraps the same operation with `createTool` and calls the same broker
with a scope the Hub minted for the session. The Hub composes one `createConnectorModule` in
`server.ts` from the `hub_iam_runtime` pool, the existing secret envelope, a socket directory and an
optional gateway destination.

## 2. Data

```ts
type ConnectorId = 'sankhya'
type OperationId = Brand<string, 'OperationId'>         // '<connector>.<subject>.<verb>'
type Environment = 'preview'                            // Q5 adds 'published'
type Effect = 'read' | 'write'
type Capability =
  | Readonly<{ kind: 'operation'; id: OperationId }>
  | Readonly<{ kind: 'event'; id: EventId }>            // design only; the table admits 'operation' in Q4

// Authority is a value only Hub code mints. The brand stops typed code from building one; a
// module-private WeakSet stops untyped code (JSON, a RequestContext filled from a request).
type ConsumerScope = Brand<Readonly<{ projectId: ProjectId; environment: Environment }>, 'ConsumerScope'>

type Consumer =
  | Readonly<{ kind: 'handler'; invocationId: InvocationId; scope: ConsumerScope }>   // built in Q4
  | Readonly<{ kind: 'agent'; sessionId: AgentSessionId; scope: ConsumerScope }>      // built in Q4.9
  | Readonly<{ kind: 'integrator'; jobId: IntegratorJobId; scope: ConsumerScope }>    // design only

type Operation<I, O, S> = Readonly<{
  id: OperationId
  effect: Effect
  summary: string                   // product language; no service, entity or field name
  input: z.ZodType<I>
  output: z.ZodType<O>
  run(input: I, session: S): Promise<O>
}>

type ConnectorDefinition<Cred, S> = Readonly<{
  id: ConnectorId
  credential: z.ZodType<Cred>       // strict: { clientId, clientSecret, xToken } and nothing else
  operations: readonly Operation<any, any, S>[]
  events: readonly ConnectorEvent<any>[]   // empty for Sankhya
  builderSkill: string
}>

type Adapter<Cred, S> = Readonly<{
  authenticate(credential: Cred, signal: AbortSignal): Promise<IssuedToken>
  open(token: AccessToken, signal: AbortSignal): S
}>

type BrokerResult<O> =
  | Readonly<{ ok: true; value: O }>
  | Readonly<{ ok: false; code: BrokerErrorCode; issues?: readonly string[] }>   // issues: input paths only

type Broker = Readonly<{
  call(consumer: Consumer, operationId: string, input: unknown): Promise<BrokerResult<unknown>>   // never throws
  granted(scope: ConsumerScope): Promise<readonly Operation<unknown, unknown, unknown>[]>
}>
```

`Consumer.kind` and its reference only label the audit line. The scope alone selects the grant, and
the input's Zod schema has no scope field, so no input can change the resolved grant (P6).

`AccessToken` is an opaque class. `toJSON`, `toString` and `util.inspect.custom` render
`[redacted]`, and only the gateway file calls `bearer()`. The decrypted credential object is wrapped
the same way. A stray log of either prints `[redacted]` (P2).

### Closed error codes

| Code | When |
| --- | --- |
| `OPERATION_UNKNOWN` | the id names no operation |
| `INPUT_REFUSED` | the operation's Zod input refused the value |
| `EFFECT_REFUSED` | the operation's effect is `write`; checked before the database and the network |
| `NOT_GRANTED` | no open grant, grant revoked, Connection disabled or Project archived; one code, so nothing is disclosed |
| `CONNECTOR_UNCONFIGURED` | no gateway destination is pinned by server configuration (part 1's state), or no connector socket is bound |
| `CREDENTIAL_REFUSED` | authentication refused, or a fresh token refused again |
| `PROVIDER_TIMEOUT` | the call deadline passed |
| `PROVIDER_UNAVAILABLE` | network failure or a 5xx |
| `PROVIDER_ERROR` | the gateway answered with an error envelope |
| `RESPONSE_REFUSED` | over the byte bound, or the Zod output refused it |
| `CALL_LIMIT` | the invocation's call or concurrency bound |
| `SERVICE_REFUSED` | an operation asked the adapter for a service outside the allow-list; before the network |

The adapter's internal failures map to these through one exhaustive `switch`. No provider body,
header, status text or token crosses the broker.

## 3. The broker

`call(consumer, operationId, input)`, in order:

1. Find the operation, or `OPERATION_UNKNOWN`.
2. `effect === 'write'` answers `EFFECT_REFUSED`, before the database and the network.
3. Parse the input, or `INPUT_REFUSED`.
4. `connector.resolve_grant(project, environment, 'operation', id)` runs on every call. It returns a
   row only when the grant is open, the Connection is enabled and the Project is not archived.
   Otherwise `NOT_GRANTED`. There is no grant cache.
5. No pinned destination answers `CONNECTOR_UNCONFIGURED`.
6. Under `AbortSignal.timeout(4000)`, `tokens.withToken(connectionId, issue, work)`: `issue` reads the
   sealed credential, opens it with the Hub envelope, parses it with the Definition's strict schema
   and authenticates; `work` runs the operation on a session opened with the token.
7. Parse the output with the operation's Zod output. Unknown keys are dropped; a failed parse is
   `RESPONSE_REFUSED`.
8. Write one audit line: consumer kind, Project, operation, the service names called (constants),
   result and milliseconds. No input, output, token or credential. This is the per-call record G0
   asks for.

The broker is not traced. The census explains why: `SensitiveDataFilter` would not redact `xToken` or
`access_token`, so P2 holds by the credential and the token never entering a span.

## 4. Token cache

One entry per `ConnectionId`, either `issuing` (a shared promise) or `live` (token and `refreshAt`).

- A live token is reused until `refreshAt = issuedAt + expires_in − max(60 s, 10 %)`.
- Concurrent misses await one `issue()` (single flight). A rejected `issue()` removes the entry.
- When the operation reports a refused token, the cache drops the entry only if it still holds that
  same token, issues once more and reruns the operation once. A second refusal is
  `CREDENTIAL_REFUSED`. "At most once per call" lives in this one function.
- A Connection is immutable: rotating a credential is disable plus create, so a cached token never
  outlives its credential. `forget(connectionId)` runs on disable.
- Process memory only. A Hub restart costs one authentication.

## 5. Runner to Hub path

### The reading of "runner relay"

Today the Hub reaches the runner and nothing reaches back. Two shapes were compared:

| | A. Hub-served socket, bound by the runner (chosen) | B. Runner relay with a ticket |
| --- | --- | --- |
| Transport | The Hub opens one unix socket per invocation, mode 0600, in `CONEXUS_CONNECTOR_SOCKET_DIR`. The runner binds only that socket into the sandbox. | The runner serves a per-invocation socket like the pg relay and forwards to one long-lived Hub socket. |
| Authority | The socket's server closes over the Hub-minted scope. Nothing on the wire names a Project. | A per-invocation ticket the runner attaches; the Hub keeps a ticket-to-Project registry with expiry. |
| Secrets between processes | None. | The ticket is a bearer secret held by the runner. |
| Connector code in the runner | None: a path check and one bind. | Parsing and forwarding. |
| Parse sites | One, in the Hub. | Two, in the runner and the Hub. |

The manager read "runner relay" in 6.1 as a function, not a transport, on 2026-09-24: the handler
reaches the broker only through what the runner mounts into its sandbox. Shape A satisfies that. B
stays the fallback; switching touches only `handler-port.ts` and the runner.

### The path

1. `createApplicationInvoker` mints `scopeFromArtifactSource(source)` (Preview and application host
   both serve the Preview environment until Q5) and opens the port before calling the runner. The
   port is a `node:http` server on a random socket name in the configured directory, mode 0600.
2. `invokeBody` gains `connectorSocket`, a platform fact beside `caller`, never inside `input`. The
   runner refuses a path that is not a socket directly inside its own configured copy of the
   directory. Migration jobs get no socket.
3. `runWorker` binds exactly that socket at `/run/conexus/connector/.s.connector`. The directory is
   never mounted.
4. The worker builds `connectors.call`, which sends `POST /v1/call { operation, input }` over the
   socket. With no socket bound it answers `CONNECTOR_UNCONFIGURED`.
5. The port parses a strict body of at most 64 KiB, allows 8 calls and 2 concurrent calls per
   invocation (`CALL_LIMIT`), and calls `broker.call({ kind: 'handler', invocationId, scope }, …)`.
6. The invoker closes the port in `finally`, after the runner's answer, its timeout or its failure.
   Closing stops accepting, destroys open connections and unlinks the file. At startup the Hub
   empties the directory.

The Q1 boundary is unchanged: `--unshare-net`, `--clearenv` and the empty environment stay, no
credential enters, and the worker gains one unix socket bound by the runner, which task section 4
names as the permitted way out.

### The manager's four conditions, each with a test

| # | Condition | Test |
| --- | --- | --- |
| M1 | The grant is checked in the broker on every call, not when the socket opens. A grant revoked during an invocation refuses the next call of that same invocation. | `connector-broker-postgres.test.mjs`: through one open port, call succeeds, revoke, the next call on the same port answers `NOT_GRANTED`. |
| M2 | The socket dies with the invocation (answer or timeout), and the Hub removes leftovers at startup. A restarted Hub leaves no orphan socket answering. | `connector-handler-port.test.mjs`: after `close()` the path is gone and a connect fails; a port whose invocation timed out is closed; the startup sweep removes a stale file in the directory. |
| M3 | The handler process inside the sandbox can connect to the 0600 socket. The test records the socket's owner uid and the uid bwrap runs the handler under. | `application-runner-sandbox.test.mjs`: the handler calls a granted operation and gets the fake's order; the probe records `stat` owner and `process.getuid()` inside the sandbox. No permission is loosened; if it ever needs to be, the executor asks first. |
| M4 | One invocation's handler cannot reach another invocation's socket or another Project's. Only that invocation's socket is mounted. | `application-runner-sandbox.test.mjs`: with two ports open, a handler lists `/run/conexus/connector` and tries every path of the Hub's directory; it sees only `.s.connector`, and connecting elsewhere fails. |

## 6. Sankhya adapter and the G0 allow-list

`apps/hub/src/connectors/sankhya/gateway.ts` is the only file that speaks the Sankhya wire.

- Authentication is the fixed `POST /authenticate` with the client credentials form and the `X-Token`
  header.
- `SANKHYA_SERVICES = ['CRUDServiceProvider.loadRecords']`. `callService(name)` refuses any other
  name with `SERVICE_REFUSED` before `fetch`. The census cites the documentation for both entries.
- An operation sees only `loadRecords(query)`. Its `rootEntity` is the typed union
  `'CabecalhoNota' | 'ItemNota'`, its expression is a constant in the operation file, and a
  consumer's value goes only into a typed parameter.
- The body is read through a 256 KiB cap. 401 and 403 are a refused token. An envelope status `'0'`
  is `PROVIDER_ERROR`. Positional fields are decoded through the response metadata. The provider's
  body and `statusMessage` never leave the adapter.
- The destination is the origin in `CONEXUS_SANKHYA_GATEWAY_ORIGIN`, accepted only when it is one of
  the gateway origins the Sankhya documentation publishes. Absent, every call answers
  `CONNECTOR_UNCONFIGURED` with no network. Part 1 leaves it absent. Tests inject a local fake's
  origin into the adapter factory directly, not through configuration.

`sankhya/purchase-order.ts` holds the one operation, `sankhya.purchase-order.read`, and the only
field mapping: the header on `CabecalhoNota` (`NUMNOTA = ?` and `TIPMOV = 'O'`, with `NUNOTA`,
`DTNEG`, `STATUSNOTA`, `VLRNOTA` and the supplier name through `Parceiro`), then the items on
`ItemNota` by `NUNOTA`. That is two `loadRecords` calls. Input `{ documentNumber }`. Output
`{ orders: PurchaseOrder[] }` with at most 10 orders and 200 items each, because a document number is
unique per company and series only; "not found" is `orders: []`. Money and quantities are decimal
strings, so no value passes through a binary float. The mapping is marked unverified until the first
real read (Q4.6).

## 7. Storage

Migration `0029_connector.sql`:

- A NOLOGIN owner role `connector_owner` and a schema `connector`. No new login role and no new pilot
  secret: the functions are executable by `hub_iam_runtime`, as Q3's application-access functions
  are.
- `project.project` gains `UNIQUE (project_id, workspace_id)`. `project_id` is already unique, so this
  adds no rule on data; it is the target of a composite key.
- `connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed,
  created_by, created_at, disabled_by, disabled_at)`. `connection_id` is chosen by the client, so a
  retried create answers the same row. `credential_sealed` has a CHECK on the envelope prefix, so
  plaintext cannot be stored, and there is no column for an MGE user or password. One open
  Connection per Workspace and connector (partial unique index).
- `connector.project_grant(grant_id, workspace_id, project_id, environment, connection_id,
  capability_kind, capability_id, granted_by, granted_at, revoked_by, revoked_at)`. Two composite
  foreign keys share `workspace_id`: `(project_id, workspace_id)` to `project.project` and
  `(connection_id, workspace_id)` to `connector.connection`. A grant whose Project and Connection sit
  in different Workspaces cannot be written (P7). `environment = 'preview'` and
  `capability_kind = 'operation'` are CHECKs that Q5 and events widen. One open grant per Project,
  environment and capability.
- Functions, all `SECURITY DEFINER` with a pinned `search_path`:
  - installation administrator: `list_connections`, `create_connection`, `disable_connection`;
  - Owner of the Project's Workspace, non-disclosing (`P0002` when not visible):
    `list_project_grants` (open grants and grantable pairs in one projection), `grant_capability`,
    `revoke_grant`;
  - broker: `resolve_grant`, `read_connection_credential`, `list_granted_capabilities`.

## 8. Product operations

A new ledger owner, Connector, in `contracts/api/product/connector-paths.yaml`. 24 to 31 operations.

| ID | Operation | Method and path | Authority |
| --- | --- | --- | --- |
| `CON-01` | `ListWorkspaceConnections` | `GET /api/control/workspaces/{workspaceId}/connections` | installation administrator |
| `CON-02` | `CreateWorkspaceConnection` | `POST /api/control/workspaces/{workspaceId}/connections` | installation administrator; the credential fields are `writeOnly` |
| `CON-03` | `CheckWorkspaceConnection` | `POST /api/control/workspaces/{workspaceId}/connections/{connectionId}/authentication-check` | installation administrator; runs only the allow-listed authentication, only after G0 |
| `CON-04` | `DisableWorkspaceConnection` | `DELETE /api/control/workspaces/{workspaceId}/connections/{connectionId}` | installation administrator; narrowing; the row stays as the record |
| `CON-05` | `ListProjectConnectorGrants` | `GET /api/control/projects/{projectId}/connector-grants` | Owner of the Project's Workspace |
| `CON-06` | `GrantProjectConnectorOperation` | `POST /api/control/projects/{projectId}/connector-grants` | Owner; the environment is fixed to `preview` by the server |
| `CON-07` | `RevokeProjectConnectorGrant` | `DELETE /api/control/projects/{projectId}/connector-grants/{grantId}` | Owner; narrowing |

No response schema has a credential field. An application session reaches no `/api/control` route,
so the app user cannot read or change a Connection or a grant (the sixth case of Q4.10).

The **Integrações** screen replaces the "Em breve" item at `/projects/$projectId/integrations`. It
lists the Workspace's Connections, lets an installation administrator add one (write-only fields,
never shown back), check it and disable it, and lets the Owner grant and revoke the operation for
this Project.

## 9. What the Builder learns

Per run, per Project, through the channel the Hub already owns: `factory-runtime.ts` sends
`session.configure({ instructions })` into the session's `pluginInstructions`. The run's
`factoryAgentInstructions` gains a brief built from `list_granted_capabilities`:

- empty for a Project with no open grant;
- otherwise, for each granted operation, its id, summary, input and output JSON Schema
  (`z.toJSONSchema`, zod 4.5.2), one handler snippet using `connectors.call`, and the granted
  Definition's Skill.

The Sankhya Skill lives in the Hub source beside the Definition, not in the global `factory-skills/`,
which every Project receives. It is written in product language from the checked `sankhya-skills`
sources, with attribution, and carries no service, entity, field, host or URL. A test fails if the
brief contains any of the gateway file's wire vocabulary. The global `conexus-server` skill gains
one generic paragraph: the operations a Project may call are listed in its run instructions, and none
listed means none. The E2B sandbox receives text only. There is no manifest declaration of the
operations a handler uses: the grant is the authority, checked per call, and a second list would
drift from it.

## 10. Design only

**Integrator.** A Mastra workflow (`createWorkflow`, `createStep`, `@mastra/core` 1.67.0
`dist/workflows/create.d.ts:45`) per `IntegratorJob { jobId, projectId, environment, schedule,
operationId, input, sink, createdBy }`. Its read step calls
`broker.call({ kind: 'integrator', jobId, scope: scopeFromIntegratorJob(job) }, …)` under the same
grant row. Its write step invokes the Project's own manifest operation `sink` through the runner with
the job creator's caller, so Project data is written by the Project's handler with its own `db`.
Mirror for reads, source for commands. No type above changes.

**Inbound events.** A `ConnectorEvent` in `definition.events`, present now and empty for Sankhya. It
arrives on a mechanics route bound to one Connection, like an OIDC callback, is verified with that
Connection's credential, and is delivered to each Project holding an open grant
`(capability_kind = 'event', capability_id)` on that Connection. The grant row keys on a capability
id with a kind; the schema change is one widened CHECK, and there is no sibling table.

## 11. Property map

| # | Mechanism | Test |
| --- | --- | --- |
| P1 | Sealed column with the prefix CHECK; `envelope.open` only in the broker's step 6; the worker gets a socket, never a value; only `CON-02` accepts the credential and nothing returns it. | `connector-postgres.test.mjs`: a stored row matches the envelope prefix and holds no fragment of the credential. `connector-routes.test.mjs`: no response carries a credential field. `application-runner-sandbox.test.mjs`: a handler dumps `process.env`, readable files and its context; none holds the credential or token. Q4.10 case 1, Q4.11. |
| P2 | Broker not traced; redacting `AccessToken` and credential; value-free audit line; the adapter forwards no body or header. | `connector-broker.test.mjs`: the fake answers 500, 401 and an error envelope carrying a secret marker; the marker, the fake's secret and its token appear in no result, audit line or port bytes. `connector-token-cache.test.mjs`: `JSON.stringify` and `inspect` print `[redacted]`. Q4.11. |
| P3 | `call(operationId, input)` is the whole surface; strict Zod input; the session exposes `loadRecords` with a typed entity union and constant expressions. | `connector-broker.test.mjs`: inputs carrying a service, entity, expression, URL, header or token answer `INPUT_REFUSED` with zero fake requests. Q4.10 case 2. |
| P4 | Step 2 before the database; `SANKHYA_SERVICES` checked before `fetch`. | `connector-broker.test.mjs`: a registered `write` operation answers `EFFECT_REFUSED`, and an operation asking for another service answers `SERVICE_REFUSED`, each with zero fake requests (G0). `connector-adapter-source.test.mjs`: the service literals in `sankhya/*.ts` are exactly `CRUDServiceProvider.loadRecords` (G0). Q4.10 case 5. |
| P5 | Zod output strips unknown keys; 256 KiB cap; 4 s deadline; at most 10 orders and 200 items. | `connector-broker.test.mjs`: an extra field is absent from the result; an oversized body answers `RESPONSE_REFUSED`; a stalled fake answers `PROVIDER_TIMEOUT`. |
| P6 | The scope is minted by Hub code and closed over by the port; the input has no scope field; the port's body is strict. | `connector-handler-port.test.mjs`: a call carrying another Project's id in the input or as extra body keys resolves the same grant or is refused. Q4.9 adds the agent case. Q4.10 case 3. |
| P7 | Composite foreign keys sharing `workspace_id`. | `connector-postgres.test.mjs`: a direct insert with mismatched Workspaces fails `23503`; an Owner of another Workspace granting this Connection gets `P0002`. Q4.10 case 3. |
| P8 | `resolve_grant` on every call; no grant cache. | `connector-broker-postgres.test.mjs`: revoke, the next call is `NOT_GRANTED` (M1); disable, the next call of two Projects is `NOT_GRANTED`. Q4.10 case 4. |
| P9 | Closed codes and one exhaustive mapping. | `connector-broker.test.mjs`: each fake failure mode maps to its literal code and the result equals the literal `{ ok: false, code }`. |
| P10 | `withToken`: refresh margin, single flight, same-token drop, one retry. | `connector-token-cache.test.mjs` and `connector-broker.test.mjs`: ten concurrent calls cause one authentication; a short-lived token is refreshed before it expires; a refused token is refetched once and the call succeeds; always refused ends in `CREDENTIAL_REFUSED` after two. |
| P11 | Per-run brief from open grants only; generic global skill; vocabulary scan. | `connector-builder-brief.test.mjs`: no grant gives an empty brief; a grant gives the id and both schemas; the brief holds no gateway vocabulary. Q4.7, Q4.10 case 2. |
| P12 | Sandbox flags unchanged; one socket bind; per-invocation limits in the port. | `application-runner-sandbox.test.mjs`: with the socket bound, a handler's TCP connect and `fetch` still fail; M3 and M4; existing timeout and size tests unchanged. |
| P13 | `connector-paths.yaml`, the ledger rows and the count line in one commit. | `npm run wire:bijection`. |

## 12. Synthesis

- **Base:** the Opus candidate. The cross-judge scored it 29 of 30, against 24 (Fable) and 16
  (Sonnet), and agreed on the base.
- **Grafted from Fable:** the immutable Connection (rotation is disable plus create), so the token
  cache keys on `ConnectionId` and the revision column is gone; one open Connection per Workspace
  and connector; money as decimal strings; the secret-marker leak test.
- **Rejected from Fable:** a per-Project `connectors.d.ts` in the Project repository (a stale file
  after revocation, and a second list beside the grant); a sibling event table.
- **Rejected from Sonnet:** a new login role `hub_connector_runtime` (a new pilot secret without a
  requirement); a Project id as a plain string in `RequestContext`, which a client can fill; a
  runner-asserted Project on a shared Hub socket.

## 13. Tradeoffs accepted

- One listening socket per invocation in the Hub, in exchange for authority that is structural and a
  runner with no connector code.
- `hub_iam_runtime` executes `read_connection_credential`, in exchange for no new login role. Only a
  sealed envelope leaves PostgreSQL; the key stays in the Hub.
- One grant query per call, in exchange for P8 on the very next call.
- Disable is terminal, in exchange for seven operations instead of nine.

## 14. Open risks for part 2

- The invocation timeout is 5 s and the broker deadline 4 s. A cold authentication plus two
  `loadRecords` calls on the pilot may not fit. Q4.6 measures before any bound changes.
- `NUMNOTA` with `TIPMOV = 'O'` as the key for "document number 22790", and the `STATUSNOTA` values,
  are unverified until Q4.6. The mapping is one file.
- Whether the gateway reports a refused token as HTTP 401 or in the envelope is unverified. The
  adapter's classification is one function.
- The shared socket directory assumes the Hub and the runner share an OS user, as the runner socket
  already does. A production split of users needs a group on that directory.
