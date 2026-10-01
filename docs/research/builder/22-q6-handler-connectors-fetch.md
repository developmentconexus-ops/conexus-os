# 22. Q-6: handler `connectors.fetch`, and the Connection's destination

Read-only design, 2026-09-29. Worktree `<worktree>`, branch `feat/q4-handler-connectors-fetch`, at
`origin/main` `eb564cfe`. No `node_modules` exists in the worktree or in the main checkout, so nothing here
was run. Every code reference is a repo path and line on `eb564cfe`. Branch references read
`feat/builder-own-harness-int` at `5a5672c9` with `git show`, without checking it out.

Labels used on every choice:

- **[Leandro]** decided by Leandro, with the record named.
- **[Task]** decided by the Q4 task (`docs/tasks/stage2-q4-sankhya-connector-qualification.md`) or by
  C-029 / C-030.
- **[Rec]** my recommendation. Nothing more.
- **[Open]** a product question only Leandro can answer. Section 8 lists them.

## 0. What is decided, and where it is recorded

| Decision | Label | Record |
| --- | --- | --- |
| Handlers call `connectors.fetch({ connection: 'erp', ...nativeRequest })` through the one Hub executor | [Task] | Task amendment, "Shape" (`docs/tasks/...:49-69`); C-030 (`docs/decisions/index.md:26`) |
| The consumer never names a host, scheme, header or token; the Hub derives Project, environment and consumer from context | [Task] | Task amendment, "Shape" and P3, P6 |
| The browser receives only the handler's return value; enforced by the rule plus the E-4 scan | [Leandro] 2026-09-28 | `decisions.tsv:100` |
| Runner cap 256 KiB per response | [Leandro] 2026-09-28 | `decisions.tsv:100` |
| At most 8 calls per invocation ("keep 8 calls") | [Leandro] 2026-09-28 | `decisions.tsv:100` |
| The per-operation path is deleted only after the pilot's Q3 notebook app calls `connectors.fetch` | [Task] | Closure item 2 (`docs/tasks/...:115-118`); census 21, item 2e |
| A company may register two Sankhya Connections, production and sandbox, and choose which to bind | [Leandro] 2026-09-29 | Coordinator message of 2026-09-29 (section 5 here) |
| The choice is production or sandbox, each mapped to one pinned origin, no free-text URL | [Leandro] 2026-09-29 | Same message |

I could not find a written definition of "E-4 scan". `PLANO-FINAL.md:108` calls E-4 the generic-seam
proof. I read Leandro's line as "the Q4 no-leak scan applied to Preview responses", which the task's
no-leak evidence already asks for (`docs/tasks/...:161-162`). Section 6, unit Q6-4, names what it
checks. **[Open]** if E-4 meant something else.

## 1. Data shape

### 1.1 What a handler sees

The handler gets the executor's own request and result types. There is no second shape. The request is
`NativeRequest` (`apps/hub/src/connectors/native.ts:7-15`), parsed by `nativeRequestSchema`
(`native.ts:51-58`). The result is the executor's `FetchResult` (`native.ts:17-32`), minus one field.

```ts
// Handler context, third field. Frozen, like `db` and `caller` (worker.ts:132-139).
type Connectors = Readonly<{
  /** Never throws. */
  fetch(request: FetchRequest): Promise<HandlerFetchResult>
  /** Legacy, removed in 2e. Present only while the Q3 notebook app still calls it. */
  call(operationId: string, input?: unknown): Promise<CallResult>
}>

type FetchRequest = Readonly<{
  connection: string                         // Project-local binding name, e.g. 'erp'. 1..40 chars.
  method: string                             // the integrator's read rule decides which methods read
  path: string                               // relative to the Connection's pinned origin
  query?: Readonly<Record<string, string>>   // at most 32 keys
  body?: unknown                             // JSON, at most 64 KiB serialized
}>

type HandlerFetchResult =
  | Readonly<{ ok: true; status: number; bytes: number; body: unknown }>   // the vendor's JSON, bearer redacted
  | Readonly<{
      ok: false
      code: HandlerFetchCode
      issues?: readonly string[]   // INPUT_REFUSED only: schema paths, never caller text
      status?: number              // the vendor's HTTP status, when it answered
      vendorStatus?: string        // a vendor error inside a 2xx (Sankhya's envelope status)
    }>
```

In Hub code the handler result is derived, not hand-written, so it cannot drift from the executor:

```ts
// apps/hub/src/connectors/handler-port.ts
type FetchRefusal = Extract<FetchResult, { ok: false }>
export type HandlerFetchResult = Extract<FetchResult, { ok: true }> | Readonly<Omit<FetchRefusal, 'body'>>
const forHandler = (result: FetchResult): HandlerFetchResult => {
  if (result.ok) return result
  const { body: _vendorErrorBody, ...refusal } = result
  return Object.freeze(refusal)
}
```

Choices in this shape:

- Same request and result as `connector_fetch`, so the model writes the handler with the request it
  already tested in the tool. **[Rec]**, following C-030's "one executor for every consumer" **[Task]**.
- The vendor error body is dropped for handlers. `FetchResult` carries it for a vendor error inside a
  2xx (`native.ts:29-31`, `native.ts:171`). The Builder's model needs it to fix a request. A handler has
  no use for it, and P9 says no vendor body reaches the browser in an error (`docs/tasks/...:84`). A
  handler that returns its whole failure would otherwise carry it there. Dropping it makes P9 hold for
  errors by construction. `vendorStatus` stays. **[Rec]**
- `call` stays in the context until 2e. **[Task]**

### 1.2 The wire, runner to Hub

One route per consumer verb on the invocation's socket. The port gains a route table instead of a
second `if` on `request.url` (principle-model-the-domain).

| Route | Body (strict JSON, at most 64 KiB) | Answer (always HTTP 200, JSON) | Executor call |
| --- | --- | --- | --- |
| `POST /v1/fetch` (new) | the `FetchRequest` exactly | `HandlerFetchResult` | `broker.fetch(consumer, body)` (`broker.ts:292`) |
| `POST /v1/call` (legacy, until 2e) | `{ operation, input }` (`handler-port.ts:32`) | `BrokerResult` | `broker.call(consumer, operation, input)` (`broker.ts:309`) |
| anything else | | 404, no body | none |

The port does not re-validate the fetch body. It only JSON-parses it. `broker.fetch` parses it with
`nativeRequestSchema`, which is strict, and that parse is the boundary (principle-boundary-discipline).
A body that is not JSON, or is over 64 KiB, answers `INPUT_REFUSED` from the port, as `/v1/call` does
today (`handler-port.ts:94-100`).

After the executor answers, the port serializes `forHandler(result)`. If the serialized answer is over
256 KiB it answers `{ ok: false, code: 'RESPONSE_TOO_LARGE' }` instead, with no vendor byte.

### 1.3 How the invocation's scope reaches the executor

Nothing on the wire names a Project, an environment, a Connection id or a caller. The chain is Hub code
end to end:

1. The Preview API route builds `source` from the signed-in Preview binding
   (`apps/hub/src/mar/preview-routes.ts:236-241`). The application host builds it from the application
   session's authority (`apps/hub/src/mar/application-host-routes.ts:153-160`). The request body is only
   `input`.
2. The invoker opens one port per invocation for that `source`, before the runner is called, and closes
   it in `finally` (`apps/hub/src/mar/application-invoker.ts:155-161`).
3. `openConnectorPort` (`apps/hub/src/server.ts:157`) calls `ports.open(scopeFromArtifactSource(source))`
   (`apps/hub/src/connectors/module.ts:122`). The scope holds `projectId` and environment `preview`,
   and is registered in a module-private `WeakMap` (`apps/hub/src/connectors/scope.ts:16-24`), so a
   look-alike object is refused by `isMintedScope` (`scope.ts:27-30`).
4. `open` mints the invocation id and closes over the scope (`handler-port.ts:74-75`). Every request on
   that socket becomes `{ kind: 'handler', invocationId, scope }` (`handler-port.ts:102`, and the same
   for `/v1/fetch`).
5. The socket path is random, mode 0600 (`handler-port.ts:77`, `:130`), and bound into that
   invocation's sandbox only (`apps/hub/src/app-runner/sandbox.ts:138`).

**Caller.** The caller (`source.accountId`, `binding.caller`) does not reach the executor. Authority is
the Project's binding and nothing else (P6 **[Task]**, C-030 "the binding is the whole grant"
**[Task]**). The C-029 record already holds the consumer kind and the Project (`broker.ts:294-299`).
**[Rec]** keep it so. **[Open]** only if Leandro wants each app user's Sankhya reads attributed to the
person in the record. That is an audit wish, not an authority need, and it would add the account id to
the span.

### 1.4 Budget and caps, and where each is enforced

| Limit | Value | Enforced in | Label |
| --- | --- | --- | --- |
| Calls per invocation | 8, shared by `/v1/call` and `/v1/fetch` | the port counter (`handler-port.ts:79`, `:87-91`, limit at `:18`). Counted before parsing, so malformed requests spend it too. | 8: [Leandro]. Shared counter and place: [Rec] |
| Concurrent calls per invocation | 2 | the port (`handler-port.ts:18`, `:87`) | unchanged, [Task] (Q4.4) |
| Request body on the socket | 64 KiB | the port (`handler-port.ts:18`, `:94`); the worker checks first (`worker.ts:28`, `:46`) | unchanged |
| Vendor body, raw | 256 KiB | the executor (`native.ts:36`, `:107-126`, `:160`) | unchanged; same number as the Builder tool |
| Answer the handler receives, serialized | 256 KiB | the Hub port, after `forHandler`; the worker reads at most 256 KiB and maps overflow to `RESPONSE_TOO_LARGE` | 256 KiB: [Leandro]. Placement: [Rec] |
| One vendor request | 10 s | the executor (`native.ts:36`) | unchanged |
| The whole invocation | 5 s | the runner (`apps/hub/src/app-runner/supervisor.ts:30`) | unchanged, Q2 contract kept per task section 4 |
| Handler answer to the browser | 1 MiB, and the manifest output schema | the runner (`supervisor.ts:33`, `:279-281`) | unchanged |

Why the handler budget stays in the port and not in the scope. `scopeFromArtifactSource` mints a scope
with `calls: null` (`scope.ts:50-51`), so `spendCall` is a no-op for handlers (`scope.ts:32-39`) and the
two budgets never double-count. The port already owns the per-invocation lifetime. Moving the count into
the scope would add a second mechanism for the same limit. **[Rec]**

Why the serialized answer can pass 256 KiB although the raw body did not. The executor measures raw
bytes, then parses and redacts (`native.ts:164`). `JSON.stringify` of the parsed value can be longer
than the raw text. A raw `1e20` is 4 bytes and serializes as 21. So the port measures what it sends.

What "runner cap" means. The worker today reads a port answer of up to 2 MiB (`worker.ts:29`). I read
Leandro's "runner cap 256 KiB per response" as that number, lowered to 256 KiB for every connector
answer. **[Open]** if he meant the handler's answer to the browser (1 MiB today). Lowering that would
change the Q2 handler contract, which the task says Q4 must not do (`docs/tasks/...:287-288`).

Known limit, not fixed. The invocation ends at 5 s but a vendor request may run to 10 s. When the
invocation ends, the port closes and the answer is dropped. The Hub still holds that vendor request
until the executor's deadline, at most 2 per invocation. No leak, only wasted work. Real Sankhya reads
answered within the 4 s broker deadline in Q4.7 run 2 (`docs/tasks/...:194-195`). Measure on the pilot
before adding an abort. **[Rec]**, per "validate first".

### 1.5 Refusal codes

All codes are from the closed list `BROKER_ERROR_CODES` (`apps/hub/src/connectors/errors.ts:2-16`). No
new code.

| Code | When, for `connectors.fetch` | Who answers | Network? |
| --- | --- | --- | --- |
| `INPUT_REFUSED` | request not an object, unknown key (a header, a URL, a `projectId`), bad field size, too many query keys, body over 64 KiB, not serializable; a path that is absolute or resolves off the pinned origin (`/path`); query or body outside the read rule's shape | worker (not serializable, over 64 KiB), port (not JSON), executor (`native.ts:68-79`, `:88-94`; `broker.ts:249`, `:264-265`) | no |
| `NOT_GRANTED` | no open binding with that name in the scope's Project, including another Project's name, a removed binding, a disabled Connection, an archived Project; a scope that is not minted | executor (`broker.ts:252-260`; SQL filter at `migrations/0031_project_binding.sql:177-188`) | no |
| `CONNECTOR_UNCONFIGURED` | binding to an integrator with no registered adapter (after section 5: no adapter for the Connection's destination); no socket bound; port unreachable | executor (`broker.ts:261-263`), worker (`worker.ts:33`, `:38`) | no |
| `SERVICE_REFUSED` | a write or unknown service, a mismatched body `serviceName`, a method or path the read rule refuses | executor, Sankhya rule (`sankhya/gateway.ts:170-181`) | no |
| `CALL_LIMIT` | the 9th call, or a 3rd concurrent one, in the invocation | port (`handler-port.ts:87-89`) | no |
| `CREDENTIAL_REFUSED` | authentication refused, or a fresh token refused again | executor (`errors.ts:58-69`, `broker.ts:238-243`) | yes |
| `PROVIDER_TIMEOUT` | the 10 s deadline | executor | yes |
| `PROVIDER_UNAVAILABLE` | transport failure, 5xx, 429, store failure | executor (`native.ts:157`), port catch-all (`handler-port.ts:109`) | yes or no |
| `PROVIDER_ERROR` | another 4xx or a redirect (with `status`); a vendor error inside a 2xx (with `status` and `vendorStatus`, no body for handlers) | executor (`native.ts:151-172`) | yes |
| `RESPONSE_REFUSED` | a 2xx that is not JSON or not readable by the integrator's envelope rule | executor (`native.ts:163-172`) | yes |
| `RESPONSE_TOO_LARGE` | raw vendor body over 256 KiB (with `status`), or serialized answer over 256 KiB (without) | executor (`native.ts:160`), port (new) | yes |

`OPERATION_UNKNOWN` and `EFFECT_REFUSED` belong to `call` only. They leave with 2e.

### 1.6 The Hub-side authority check, in order

`broker.fetch` (`broker.ts:292-308`) runs `admitFetch` (`broker.ts:247-269`) and then spends and sends.
The order matters, because every refusal before step 7 makes no network call and spends no executor
budget.

1. Parse the request strictly (`native.ts:68-79`). Refuse `INPUT_REFUSED`.
2. The consumer's scope must be minted, not revoked, not expired (`broker.ts:251-252`). Refuse `NOT_GRANTED`.
3. Read the scope's Project bindings for its environment (`broker.ts:255`). Refuse `PROVIDER_UNAVAILABLE` on a store failure.
4. Find the binding by name among those only (`broker.ts:259`). Refuse `NOT_GRANTED`.
5. Find the integrator and its adapter (`broker.ts:261-263`). Refuse `CONNECTOR_UNCONFIGURED`.
6. Resolve the path against the adapter's pinned origin and compare origins (`broker.ts:264`, `native.ts:88-94`). Run the integrator's read rule (`broker.ts:266`). Refuse `INPUT_REFUSED` or `SERVICE_REFUSED`.
7. Spend the scope's budget (`broker.ts:277`; a no-op for handlers).
8. Authenticate or reuse the token, send with the Hub's own headers, read within the cap (`broker.ts:206-244`, `native.ts:136-173`).

The port's own checks (route, body size and JSON, invocation budget) run before step 1.

## 2. The one fact it is safe because of

> **A handler's `connectors.fetch` can reach only a binding of the Project whose Preview or application
> session started the invocation, and the credential and the vendor token never leave the Hub.** The
> handler's only way out is a socket the Hub opened for that one invocation and closed over a scope the
> Hub minted from the session. The executor looks the name up among that scope's bindings only, and
> nothing the handler sends can name a Project, an origin, a header or a token. The one step that holds
> a secret, adding the bearer, runs in the Hub.

**How sure.** Step 3 of the blast-radius ladder. I pointed at the lines and walked each failure. It is
not at step 4 for the new route: the route is not built, and no `node_modules` exists here to run
anything. The same fact for the old route is at step 4 in CI on `main`
(`tests/implementation/application-runner-sandbox.test.mjs:465-507`, and
`tests/implementation/connector-fetch.test.mjs:161` for a handler consumer on another Project). I did
not rerun them.

**The walk.**

- *Name another Project's binding.* The request has no Project field, and the strict schema refuses any
  extra key (`native.ts:51-58`). The lookup runs over `listBindings({ projectId: scope.projectId })`
  (`broker.ts:255`), and the SQL filters by that Project, the environment, open bindings, enabled
  Connections and a live Project (`0031_project_binding.sql:181-186`). Another Project's name is simply
  absent. `NOT_GRANTED`.
- *Use another invocation's socket.* Each socket has a random name, mode 0600, and the runner binds only
  this invocation's socket into this sandbox (`sandbox.ts:138`). The runner refuses a socket path outside
  its directory, a symlink or a plain file (`application-runner-sandbox.test.mjs:510-516`). The port
  closes when the invocation ends (`application-invoker.ts:158-160`).
- *Forge a scope.* Scopes live in a module-private `WeakMap` (`scope.ts:16`). JSON cannot produce one,
  and `isMintedScope` refuses anything not registered (`scope.ts:27-30`).
- *Reach another host.* The path is resolved against the pinned origin and the resolved origin must
  equal it; an absolute URL, userinfo, a query in the path or a fragment is refused (`native.ts:88-94`).
  Redirects are never followed (`native.ts:147`), and a non-2xx body is never read (`native.ts:153-158`).
- *Get the credential or the token.* The worker's job holds no credential (`worker.ts:17-18`). The
  sandbox clears the environment and has no network (`sandbox.ts:62-63`). The credential envelope is
  opened only in `authenticate` (`broker.ts:135-152`). The bearer is added as a header in the Hub
  (`native.ts:143`) and redacted from the parsed vendor body at every depth, keys included
  (`native.ts:99-104`, `:164`). A handler receives `status`, `bytes`, `body`, `code`, `issues`,
  `vendorStatus`, and none of them is a header.
- *Leak through the browser.* The runner validates the handler's value against the manifest's output
  schema, whose objects must set `additionalProperties: false`, before the Preview answers
  (`supervisor.ts:279-281`, `server-manifest.ts:126`). An undeclared vendor field is refused. A handler
  can still stringify the body into a declared string. That case is Leandro's "rule + scan"
  **[Leandro]**, not a type guard.

**The test that proves it by running.** Add to `tests/implementation/application-runner-sandbox.test.mjs`,
beside the existing connector test, one handler module and one test. It runs a real worker in bubblewrap
against a real executor, a fake gateway and two ports, one per Project. Section 6, unit Q6-2, gives the
literal expectations. The core three:

```js
assert.deepEqual(await run('fetchOrder', {}, portA.socketPath), { ok: true, status: 200, bytes: <n>, body: EXPECTED_NATIVE_ORDER })
assert.deepEqual(await run('fetchOrder', {}, portB.socketPath), { ok: false, code: 'NOT_GRANTED' })
assert.equal(fake.requests.length, 2, 'the other Project reached no gateway')
// and the probe: context keys ['caller','connectors','db'], connector keys ['call','fetch'],
// no FAKE_CREDENTIAL value and no 'fake-token-' anywhere in what the handler could see.
```

**Risks, confirmed.**

| Risk | How it breaks | Where | Likelihood, cost | Check |
| --- | --- | --- | --- | --- |
| A handler returns the vendor body inside a string | The body reaches the browser | the handler; the schema cannot stop a string | medium; a business-value leak on the pilot | the rule in both skills plus the E-4 scan (unit Q6-4) [Leandro] |
| Invocation 5 s vs vendor 10 s | Slow Sankhya shows `HANDLER_TIMEOUT` | `supervisor.ts:30`, `native.ts:36` | medium on real data; user-visible only | record durations in the pilot run; skill tells the model to read once |
| Serialized answer over 256 KiB although raw under | Handler gets a refusal it did not expect | port | low; the model narrows the read | port test with a small injected cap |
| `-int` edits the same skill and prompt | Merge conflict or stale `connectors.call` text on the branch | section 4 | certain; cheap | the exact paragraphs in section 4 |
| Migration number for section 5 | `0032` collides with PR #373 and `-int`'s `0032` to `0038` | `apps/hub/migrations/` | certain | Leandro's merge order, section 8 |

**Cleared.** Changing the Project through the input or extra keys (strict schema, and the existing port
test "P6: another Project in the input or in extra body keys never changes the resolved binding",
`tests/implementation/connector-handler-port.test.mjs:106`). A header from the handler (no header key
exists). Token reuse across Connections (the token cache is keyed by Connection id,
`broker.ts:186-187`, `:214-215`). The call budget spent twice (`calls: null` for handler scopes).

## 3. Reuse, and what happens to `connectors.call`

**One executor.** The handler path calls `broker.fetch`, the same function `connector_fetch` calls
(`apps/hub/src/connectors/builder-tool.ts:231`). It reuses the parse, the binding lookup, the origin
pin, the read rule, the token cache, the caps, the redaction and the C-029 span. The only handler-specific
code is in the port (route table, `forHandler`, answer cap) and in the worker (the client). **[Task]**
(C-030 "one executor"), [Rec] for the placement.

**Mastra first.** `@mastra/core` is 1.71.0 in `package-lock.json:4740-4742` (the task text says 1.67.0;
`main` has moved). No Mastra primitive fits a sandboxed handler's call to its host: Mastra tools run in
the agent's process, and the handler runs in bubblewrap with no network. The port is ours since Q4.4.
The record uses Mastra observability spans, already in place (`broker.ts:294`, `record.ts`). NOT FIT for
the transport, USE for the record, both unchanged by Q-6.

**Coexistence in this PR.** Both routes coexist. **[Task]** (2e waits for the Q3 app).

What stays, only for the pilot's Q3 notebook app:

- `connectors.call` in the worker (`worker.ts:37-77`), `/v1/call` in the port (`handler-port.ts:83-102`),
  `broker.call` and its `execute` (`broker.ts:154-203`, `:309-324`), the `sankhya.purchase-order.read`
  operation (`sankhya/definition.ts:16`, `sankhya/purchase-order.ts`), `operationBinding`
  (`broker.ts:59-62`), and the `connector.project_grant` rows.
- Remaining callers after this PR: the Q3 notebook app on the pilot (Project
  `<pilot notebook Project id>`), and the tests that exercise `call`
  (`application-runner-sandbox.test.mjs:393-399`, `connector-handler-port.test.mjs`,
  `connector-broker-postgres.test.mjs:29`, `connector-broker.test.mjs`).

What leaves in this PR: every **Builder-facing** mention of `connectors.call`. The brief stops listing
operations, and both skills teach `fetch`. A Builder change to the Q3 app then writes `fetch`, which is
one way to do 2e. **[Rec]**, per principle-migrate-callers-then-delete-legacy-apis: the Builder is a
caller and migrates now; the runtime path goes when its last caller does.

**2e, later, in one wave.** After E-1 and after the Q3 app calls `fetch`: delete the items listed above,
`Operation` and `ConnectorDefinition.operations` (`operation.ts:13-20`, `:61`), `OPERATION_UNKNOWN` and
`EFFECT_REFUSED`, the `connector.call` span, the grant rows by migration, and the `call` fixtures. The
probe assertion becomes `connectorKeys: ['fetch']`. Who changes the Q3 app, the Builder in a pilot
conversation or a hand edit, touches the pilot. **[Open]**

## 4. Builder-facing guidance, paragraph by paragraph

### 4.1 `factory-skills/conexus-server/SKILL.md` on `main`

On `-int` this file is renamed to `builder-skills/conexus-server/SKILL.md` (75% similar), and `-int`
edits only the section "Calling an operation from the browser" (`main` lines 92-112). Q-6 edits only
the "Handlers" section (lines 38-73). Git's rename detection carries the Q-6 edit onto the renamed file,
and the hunks do not overlap.

- **Lines 60-65, replace the `connectors` bullet** with:

  > - `connectors` is a third context field when this Project has a Conexão bound.
  >   `await connectors.fetch({ connection, method, path, query, body })` sends one read to a company
  >   system, in that system's own request format, through the Conexão bound to this Project under the
  >   name `connection`, and never throws. `connection` is one of the names this run's instructions
  >   list, and `path` is relative to the system's own address. It answers `{ ok: true, status, bytes, body }`
  >   with the system's JSON in `body`, or `{ ok: false, code }` with a code from a closed list; handle
  >   both. One invocation makes at most 8 calls, and each answer is at most 256 KiB. The browser
  >   receives only what the handler returns: return the fields the screen needs, never `body` or the
  >   whole answer. The integrator's guide in this run's instructions says how to write the request and
  >   read the answer. No Conexão listed there means none exists to read, whatever the request asks for.

- **Lines 68-70, one clause.** "There are no npm packages, no network, ..." becomes "There are no npm
  packages, no network (`connectors.fetch` is the only way to a company system), ...". The rest stays.
- **Lines 40-42, the type block.** Add one line after `type Caller`:
  `type Connectors = { fetch(request: { connection: string; method: string; path: string; query?: Record<string, string>; body?: unknown }): Promise<{ ok: true; status: number; bytes: number; body: any } | { ok: false; code: string; issues?: string[]; status?: number; vendorStatus?: string }> }`.
  The examples below it stay; they do not read a Conexão.

### 4.2 The Sankhya skill, `apps/hub/src/connectors/sankhya/skill.ts`

Paragraphs are array items joined by blank lines. Items 1 to 5 (lines 8-28) stay: the tool
investigation, parameters, the response format and the purchase-order fields. Items 11 and 12
(lines 38-49: several orders per number, notes in Project data, decimals as text) stay.

- **Item 6 (lines 29-33), `connector_fetch` codes.** Stays. It is about the Builder run.
- **Item 7 (lines 34-37), "No aplicativo".** Replace. The operation's output list (status "pending",
  "in-progress" and so on) no longer exists, because the handler now maps the native rows itself.

  > No aplicativo. O handler do servidor lê o Sankhya com `connectors.fetch(requisição)`, com a mesma
  > requisição nativa que você testou no `connector_fetch` e o mesmo nome local da Conexão. A resposta é
  > `{ ok: true, status, bytes, body }`, com o JSON do Sankhya em `body`, ou `{ ok: false, code }`. O
  > handler decodifica `body.responseBody.entities` como descrito acima: os nomes em
  > `metadata.fields.field`, os valores em `f0`, `f1`, ..., `entity` como objeto ou lista, e `total: '0'`
  > como nenhuma linha. Depois devolve só os campos que a tela mostra. O navegador recebe apenas o que o
  > handler devolve: nunca devolva `body` nem a resposta inteira. Cada execução do handler faz no máximo
  > 8 chamadas e termina em 5 segundos, então peça numa leitura só os campos e as linhas de que a tela
  > precisa. Se `hasMoreResult` vier `'true'`, há mais páginas; leia a próxima com `offsetPage` só se a
  > tela precisar dela.

- **Items 13 to 21 (lines 50-68), the handler's codes.** Replace the lead and the list:

  > A chamada `connectors.fetch` nunca lança exceção. Mostre uma mensagem adequada para cada código, e
  > nunca repita a chamada automaticamente sem que a pessoa peça de novo:
  > - `INPUT_REFUSED` ou `SERVICE_REFUSED`: a requisição do handler está errada (`issues` diz onde); é um
  >   erro no código do aplicativo, não algo que quem o usa possa corrigir.
  > - `NOT_GRANTED`: este Project não tem mais essa Conexão; avise que alguém que administra o Workspace
  >   precisa vinculá-la de novo, sem sugerir que o aplicativo está quebrado.
  > - `CONNECTOR_UNCONFIGURED`: a integração não está configurada nesta instalação; avise que isso não
  >   depende deste Project.
  > - `CREDENTIAL_REFUSED`: a integração foi recusada do outro lado; ela precisa de atenção de quem a
  >   administra.
  > - `PROVIDER_TIMEOUT` ou `PROVIDER_UNAVAILABLE`: o Sankhya não respondeu a tempo; convide a pessoa a
  >   tentar de novo em instantes.
  > - `PROVIDER_ERROR` (com `vendorStatus` quando o erro é do próprio Sankhya) ou `RESPONSE_REFUSED`: avise
  >   que a leitura não pôde ser concluída agora.
  > - `RESPONSE_TOO_LARGE`: a resposta passou de 256 KiB; o código deve pedir menos campos ou menos linhas.
  > - `CALL_LIMIT`: o handler passou de 8 chamadas numa execução; junte as leituras.

- **Header comment (lines 1-6).** "and purchase-order operation already send" becomes "already sends";
  the attribution stays.

### 4.3 The brief, `apps/hub/src/connectors/builder-brief.ts`

- `CONNECTOR_BRIEF_UNAVAILABLE` (lines 38-40): `connectors.call` becomes `connectors.fetch`.
- `bindingSection` (lines 48-55): add one sentence after the first: "In the app, a server handler reads
  the same Connection with `connectors.fetch`, sending the same request; the conexus-server skill and the
  integrator's guide below say how."
- Delete `operationSection` (lines 19-35), the `reached` filter and the "Connector operations granted"
  block (lines 83-88). The `Operation` and `z` imports go with them. `operationBinding` stays exported
  from `broker.ts` for `broker.call` until 2e.

### 4.4 Branch-only text, for whoever merges `main` into `-int`

These files exist only on `-int`, so the Q-6 PR cannot edit them. The merge must.

- `apps/hub/src/builder/harness/prompt/v2/conexus.md:62-64`: "a server handler reads it with
  `connectors.call`" becomes "`connectors.fetch`"; "lists this Project's Conexões (called Connections
  there), their operations and each integrator's guide" drops "their operations and".
- `apps/hub/src/builder/harness/prompt/v2/build.md:46`: "data flows from `connectors.call`" becomes
  "`connectors.fetch`".
- Optional follow-up on the branch, not this PR: `apps/hub/compiler-template/generate-client.mjs`
  could export `Connectors` and `HandlerFetchResult` in `types.gen.ts`, so the branch's type check
  catches a malformed handler read. [Rec], after Q-6 lands.

## 5. The Connection's destination: production or sandbox

Leandro's requirement of 2026-09-29. **[Leandro]** for the requirement and the two values. Everything
else in this section is **[Rec]** unless marked.

### 5.1 Today

One origin per Hub. `CONEXUS_SANKHYA_GATEWAY_ORIGIN` is read at `apps/hub/src/platform/config.ts:258`,
shape-checked at `:263`, and tied to the Mastra storage at `:349`. `pinnedGatewayOrigin` admits only the
two published origins (`sankhya/gateway.ts:13`, `:47-50`). `module.ts:83` builds one adapter with that
origin, and `module.ts:98` answers `CONNECTOR_UNCONFIGURED` without it. Several Connections per
integrator are already allowed: `0031_project_binding.sql:45` dropped `connection_open_key`. So two
Sankhya Connections can exist today, but both reach the same origin.

### 5.2 Data

The destination is a property of the Connection, fixed at creation, like its label and credential.
Switching means a new Connection and a new binding, as disable is terminal today.

Name: `destination`, not `environment`. `environment` already means the Project environment
(`preview`) on the binding (`0031_project_binding.sql:29`) and on the scope (`scope.ts:10`). C-030's
term table says a Connection holds "its pinned destination" (`docs/decisions/index.md:43`).

```ts
// apps/hub/src/connectors/model.ts
export const DESTINATIONS = ['production', 'sandbox'] as const
export type Destination = typeof DESTINATIONS[number]
// Connection, ProjectBinding, BindableConnection and BoundConnection each gain `destination: Destination`.
```

Migration `apps/hub/migrations/00NN_connection_destination.sql`. The number is the next free one on
`main` when it lands, `0032` today, which collides with PR #373 and with `-int`'s `0032` to `0038`.
**[Open]** merge order.

```sql
ALTER TABLE connector.connection ADD COLUMN destination text;
UPDATE connector.connection SET destination = 'production';   -- existing rows; see section 8
ALTER TABLE connector.connection
  ALTER COLUMN destination SET NOT NULL,
  ADD CONSTRAINT connection_destination_check CHECK (destination IN ('production', 'sandbox'));
```

- `connector.create_connection` gains `p_destination text` (drop the 7-argument signature, create the
  8-argument one, same owner, revoke and grant). A retry with the same id and a different destination is
  `CONNECTOR_CONNECTION_CONFLICT`, like a different label (`0029_connector.sql:204-206`).
- `connector.list_connections`, `list_project_bindings`, `bind_connection` and `list_bound_connections`
  return `destination`. Their `RETURNS TABLE` changes, so each is dropped and created, with its owner and
  grants restated.
- The store parses the column into `Destination` at the row mapping (`store.ts:16-22`, `:31-44`,
  `:77-82`). A value outside the two throws, which the broker already maps to `PROVIDER_UNAVAILABLE`.
  The CHECK makes it unreachable.

### 5.3 How the admin picks it

CON-02 `CreateWorkspaceConnection` gains a required `destination`, `enum: [production, sandbox]`. No URL
field exists anywhere. The Hub maps the name to the origin.

Contract edits in `contracts/api/product/connector-paths.yaml`:

- a `ConnectorDestination` schema, `type: string, enum: [production, sandbox]`;
- required `destination` in `CreateWorkspaceConnectionRequest`, `ConnectorConnection`, `ConnectionBinding`
  and `BindableConnection`.

Then regenerate `apps/hub/src/generated/connector-routes.ts` and `apps/web/src/generated/connector-client.ts`
with `node scripts/generate-r1-connector-contracts.mjs`, and add "and its destination, production or
sandbox" to CON-02's row in `docs/product/operation-ledger.md:110` (P13 **[Task]**).

The Integrações screen, fields only, no new route:

- CON-02 request: `destination`. In the create form (`apps/web/src/features/connector/components/integrations-screen.tsx:136-190`),
  one required select "Ambiente do Sankhya" with "Produção" and "Sandbox (testes)", no default, so the
  administrator chooses on purpose.
- CON-01 response entries: `destination`. The Connection row shows it beside the label (`:106`).
- CON-08 response entries, both kinds: `destination`. The Owner's binding list and bind picker show it
  beside the label (`:264`, `:311`), so the Owner sees which one is sandbox before binding.
- CON-09 bind response: `destination`.

### 5.4 How the executor resolves the origin per call

The adapter already carries its origin (`operation.ts:36-37`), and the origin check reads
`adapter.origin` (`broker.ts:264`). So the registry holds one adapter per enabled destination, and the
executor picks by the binding's destination. No second path.

```ts
// apps/hub/src/connectors/broker.ts
export type RegisteredConnector = Readonly<{ definition: AnyDefinition; adapters: Readonly<Partial<Record<Destination, AnyAdapter>>> }>

// admitFetch, broker.ts:262
const adapter = connector?.adapters[binding.destination]
// execute (legacy call), broker.ts:167
const adapter = connector.adapters[binding.destination]
// checkCredential gains the destination: checkCredential(connectorId, connectionId, destination)
```

```ts
// apps/hub/src/connectors/sankhya/gateway.ts: replaces SANKHYA_GATEWAY_ORIGINS and pinnedGatewayOrigin
export const SANKHYA_DESTINATION_ORIGINS = Object.freeze({
  production: 'https://api.sankhya.com.br',
  sandbox: 'https://api.sandbox.sankhya.com.br',
}) satisfies Readonly<Record<Destination, string>>

// apps/hub/src/connectors/module.ts:83
{ definition: sankhyaDefinition, adapters: Object.fromEntries(sankhyaDestinations.map((destination) =>
    [destination, createSankhyaGateway({ origin: SANKHYA_DESTINATION_ORIGINS[destination] })])) }
```

`module.ts:98` (`if (!gatewayOrigin) return 'CONNECTOR_UNCONFIGURED'`) goes. The broker already answers
`CONNECTOR_UNCONFIGURED` when the adapter is absent (`broker.ts:332-333`), and `checkConnection` maps it
(`module.ts:49`). The token cache is keyed by Connection id, so a sandbox token never rides a production
request.

This also fits Q5 without change. The binding row has an `environment`. When Q5 adds a published
environment, a Project can bind the sandbox Connection for Preview and the production one for published.

### 5.5 The environment variable: keep it as an allowlist of names

Recommendation: replace `CONEXUS_SANKHYA_GATEWAY_ORIGIN` with `CONEXUS_SANKHYA_DESTINATIONS`, a comma
list of `production` and `sandbox`. Absent means none: every Sankhya call and check answers
`CONNECTOR_UNCONFIGURED` with no network, as today. The old variable is refused at startup with
`RETIRED_CONFIG_CONEXUS_SANKHYA_GATEWAY_ORIGIN`, the pattern of `config.ts:167-168`, so a deploy that
still sets it fails loud instead of silently disabling Sankhya.

| Option | For | Against |
| --- | --- | --- |
| Delete the variable; both origins always enabled | one less setting | every Hub, including CI, dev and branch Hubs, can reach real Sankhya once an admin types a credential; drops the startup rule that no gateway runs without the Mastra storage that records it (`config.ts:349`, C-029); weakens security section 3's "destination pinned by server configuration" (task section 4, `docs/tasks/...:293-294`) |
| **Keep it as an allowlist of names** (recommended) | keeps the installation's off switch and the G0 "no Sankhya call before it is enabled" posture; keeps the C-029 startup rule; the operator decides per installation whether sandbox, production or both are reachable | one rename in the pilot's and the branch Hub's env files at their next deploy |

Config parsing, `config.ts:257-265`: each entry must be `production` or `sandbox`, no duplicates, no
empty entry, else `INVALID_CONFIG_CONEXUS_SANKHYA_DESTINATIONS`. `HubConfig['connectors']` becomes
`{ sankhyaDestinations: readonly Destination[]; socketDirectory: string | undefined }`. The rule at
`config.ts:349` becomes `sankhyaDestinations.length > 0 && !config.factory`.

A Connection whose destination the installation does not enable can still be created. Its **Testar**
(CON-03) answers `CONNECTOR_UNCONFIGURED` at once, which tells the administrator. No create-time refusal
is needed. [Rec]

### 5.6 Same PR as Q-6, or before it

Neither. Its own PR, built in parallel with Q-6, landing after it. [Rec]

- The two touch different files. Q-6 touches the port, the worker, the brief and the skills. The
  destination unit touches the broker's registry, the gateway, the module, config, store, model, routes,
  a migration, the contract, the generated files and the web form. They share only test fixtures that
  build `createBroker({ connectors: [{ definition, adapter }] })`, which becomes `adapters: { production: ... }`.
  The second PR to land renames those, including the first PR's new tests. Mechanical.
- Q-6 unblocks `sales-dashboard` and AC-29. The destination unit has two open questions (the backfill of
  the pilot's row, the migration number against #373 and `-int`). Holding Q-6 for them costs time for
  nothing.
- The branch Hub can already reach sandbox today by setting the old variable to the sandbox origin, so
  nothing waits on this unit.
- If Leandro wants it in before E-1, the pilot deploy must set `CONEXUS_SANKHYA_DESTINATIONS` at the
  same time. Either order works.

## 6. Build plan

Two PRs, both qualification lane, both `needs:aprovo` **[Task]** (a new runtime authority over a company
credential). Q-6 is one PR of four units. The destination is one PR of one unit. Each unit ends green
before the next starts (principle-sequence-verifiable-units). Delegates run on Sonnet; the design
crosses the runner and Hub boundary, which this document already settled.

Tests import the built Hub through `tests/implementation/hub-build.mjs`. Install dependencies in the
worktree with `npm ci` there only, never in a shared tree.

### Q6-1. The Hub port serves `/v1/fetch`

Files: `apps/hub/src/connectors/handler-port.ts`; new `tests/implementation/connector-handler-fetch.test.mjs`.

Shape: a route table `{ '/v1/call': ..., '/v1/fetch': ... }` of async functions from parsed JSON to an
answer, one shared counter and concurrency gate before it, `forHandler`, and `answerBytes: 256 * 1024`
in `HandlerPortLimits` with the serialized-size refusal. The 404 path spends nothing, as today.

Tests, real executor, fake gateway, in-memory store, one port per test (same harness as
`connector-handler-port.test.mjs:1-57`):

1. Control. `POST /v1/fetch` with the native order read answers
   `{ ok: true, status: 200, bytes: <byteLength of the body>, body: EXPECTED_NATIVE_ORDER }`. The fake saw
   paths `['/authenticate', '/gateway/v1/mge/service.sbr']`, and every request's `origin` equals `fake.origin`.
2. The socket decides the Project. A port opened for `OTHER_PROJECT`, same body:
   `{ ok: false, code: 'NOT_GRANTED' }`, and `fake.requests.length` unchanged. The same body plus
   `projectId: PROJECT` on the right port: `{ ok: false, code: 'INPUT_REFUSED', issues: ['/<unrecognized>'] }`,
   no request.
3. Budget. Eight admitted fetches answer `ok: true`; the 9th `/v1/fetch` and then a `/v1/call` each
   answer `{ ok: false, code: 'CALL_LIMIT' }`; the fake counts exactly 8 service requests.
4. Vendor error body. Fake mode `envelope-error`: the answer deep-equals
   `{ ok: false, code: 'PROVIDER_ERROR', status: 200, vendorStatus: '0' }`, and its text holds no
   `SECRET_MARKER`.
5. Caps. Fake mode `oversized`: `{ ok: false, code: 'RESPONSE_TOO_LARGE', status: 200 }`. A port with
   `limits.answerBytes: 1024` and the control read: `{ ok: false, code: 'RESPONSE_TOO_LARGE' }`, while
   the fake counts the one service request.
6. Transport. Not JSON: `{ ok: false, code: 'INPUT_REFUSED' }`. A body over 64 KiB: the same. `POST /v1/other`: status 404.
7. Bearer. Fake mode `echo-bearer`: the answer text holds no `fake-token-`.

Proof: `node --test tests/implementation/connector-handler-fetch.test.mjs tests/implementation/connector-handler-port.test.mjs`.

Evidence for Q4: the negative list's "exhausted budget" and "consumer header" through a handler; the
size cap for handlers.

### Q6-2. The worker's `connectors.fetch`

Files: `apps/hub/src/app-runner/worker.ts`; `tests/implementation/application-runner-sandbox.test.mjs`.

Shape: one `post(path, payload)` helper over the bound socket, shared by `call` and `fetch`, reading at
most 256 KiB (replaces `worker.ts:29`'s 2 MiB) and mapping overflow to `RESPONSE_TOO_LARGE`.
`connectors = Object.freeze({ call, fetch })`. `fetch` refuses locally only what it cannot send: no
socket (`CONNECTOR_UNCONFIGURED`), not serializable or over 64 KiB (`INPUT_REFUSED`). It passes the
Hub's answer through.

Tests, real bubblewrap worker (the existing `connectorSetup`, `application-runner-sandbox.test.mjs:433-459`),
new exports in the handler module:

- `fetchOrder` returns `{ text: JSON.stringify(await connectors.fetch(NATIVE_READ)) }`. On port A:
  `{ ok: true, status: 200, bytes: <n>, body: EXPECTED_NATIVE_ORDER }`. On port B:
  `{ ok: false, code: 'NOT_GRANTED' }`, and `fake.requests.length` stays 2.
- `fetchShapes` returns four answers, deep-equal to
  `[{ ok: false, code: 'INPUT_REFUSED', issues: ['/'] }, { ok: false, code: 'INPUT_REFUSED', issues: ['/path'] }, { ok: false, code: 'INPUT_REFUSED', issues: ['/<unrecognized>'] }, { ok: false, code: 'SERVICE_REFUSED' }]`
  for: `fetch(42)`; a path `//127.0.0.1:<fake port>/authenticate`; the read plus
  `headers: { authorization: 'x' }`; the read with `CRUDServiceProvider.saveRecord` in query and body.
  The fake counts no new request.
- `leakBody` with output schema `text` only, returning `{ text: 'x', extra: read.body }`: the invoke answers
  status 502 with `body.error.code === 'HANDLER_OUTPUT_REFUSED'`.
- The probe's expected object changes one line: `connectorKeys: ['call', 'fetch']`. `noSecretIn` stays.
- Without a bound socket, `fetchOrder` answers `{ ok: false, code: 'CONNECTOR_UNCONFIGURED' }`.

Proof: `node --test tests/implementation/application-runner-sandbox.test.mjs` (needs user namespaces and
`/usr/bin/bwrap`; CI runs it).

Evidence for Q4: "the application's handler reads through the binding" on the fake; "another Project"
through a handler; P12 kept with `fetch` in the context.

### Q6-3. Builder guidance

Files: `apps/hub/src/connectors/builder-brief.ts`, `apps/hub/src/connectors/sankhya/skill.ts`,
`factory-skills/conexus-server/SKILL.md`; `tests/implementation/connector-builder-brief.test.mjs`.

Edits: exactly section 4.1 to 4.3.

Tests:

- A Project bound as `erp`: the brief contains `connectors.fetch` and `connector_fetch`, and contains
  neither `connectors.call` nor `sankhya.purchase-order.read`.
- `CONNECTOR_BRIEF_UNAVAILABLE` contains `connectors.fetch` and not `connectors.call`.
- A repository test reads `factory-skills/conexus-server/SKILL.md` and `SANKHYA_BUILDER_SKILL` and finds
  no `connectors.call`. This keeps the legacy name off the Builder path until 2e deletes it
  (principle-encode-lessons-in-structure).

Proof: `node --test tests/implementation/connector-builder-brief.test.mjs`.

Evidence for Q4: the Builder guidance a later live run depends on. The behavioral proof is the live run
(closure items 4 and 5, AC-29 `sales-dashboard`), not these tests.

### Q6-4. Evidence and the Preview scan

Files: `docs/evidence/stage2-q4/design.md` (one section: the handler `fetch` shape, the port route
table, the caps, and a P3 to P9 map for the handler consumer, pointing at the Q6-1 and Q6-2 tests);
the scan script the Q4 no-leak evidence asks for, if E-4 is what I think (section 0).

The scan, as far as Q-6 needs it: for every Preview API response captured in the live run, count the
vendor envelope keys (`responseBody`, `entities`, `metadata`, `serviceName`, `transactionId`,
`hasMoreResult`) and, on the fake, the planted marker. Every count must be zero. It prints counts only.
[Rec]

Proof: `npm run repository:check` for the docs; the scan runs in the live proof, not in this PR's CI.

### D-1. The Connection's destination (its own PR)

Files: `apps/hub/migrations/00NN_connection_destination.sql`; `apps/hub/src/connectors/{model,store,broker,module,routes}.ts`;
`apps/hub/src/connectors/sankhya/gateway.ts`; `apps/hub/src/platform/config.ts`;
`contracts/api/product/connector-paths.yaml`; the two generated files;
`apps/web/src/features/connector/components/integrations-screen.tsx`, `apps/web/src/features/connector/connector-api.ts`;
`docs/product/operation-ledger.md`; `contracts/technical/hub-catalog-snapshot.json` (regenerated);
the connector tests that build a broker.

Tests:

- Config, `connector-broker.test.mjs:555-576` rewritten: absent gives
  `{ sankhyaDestinations: [], socketDirectory: undefined }`; `'sandbox'` without the Factory runtime throws
  `CONNECTOR_GATEWAY_FACTORY_RUNTIME_REQUIRED`; `'staging'`, `'https://api.sankhya.com.br'`,
  `'production,production'` and `'production,'` each throw `INVALID_CONFIG_CONEXUS_SANKHYA_DESTINATIONS`;
  `CONEXUS_SANKHYA_GATEWAY_ORIGIN` set to either published origin throws
  `RETIRED_CONFIG_CONEXUS_SANKHYA_GATEWAY_ORIGIN`.
- The pin: `SANKHYA_DESTINATION_ORIGINS` deep-equals
  `{ production: 'https://api.sankhya.com.br', sandbox: 'https://api.sandbox.sankhya.com.br' }`.
- Per-call origin, `connector-fetch.test.mjs`: two fakes with token prefixes `prod-` and `sbx-`; `erp`
  bound to a production Connection, `erp-teste` to a sandbox one. A read on `erp` adds 2 requests to the
  production fake and 0 to the sandbox fake; a read on `erp-teste` the reverse. Every request's `origin`
  is its own fake's. The production fake never sees a `sbx-` bearer. A registry with only `production`
  answers `{ ok: false, code: 'CONNECTOR_UNCONFIGURED' }` for `erp-teste`, both fakes unchanged.
  `checkCredential` of the sandbox Connection hits only the sandbox fake's `/authenticate`.
- Postgres, `connector-postgres.test.mjs`: create with `sandbox`, list shows `destination: 'sandbox'`;
  the same id with `production` raises `CONNECTOR_CONNECTION_CONFLICT`; `list_bound_connections` returns
  the destination. A row created at `0031`, then migrated, reads `production`.
- Routes, `connector-routes.test.mjs`: CON-02 without `destination` is 400; with `'sandbox'` it is 201
  and the body has `destination: 'sandbox'`; CON-01 and CON-08 entries carry it.
- Browser, `connector-integrations-browser.test.mjs`: the administrator creates a Connection choosing
  "Sandbox (testes)"; after reload the row shows it; the Owner's list shows it.

Proof: `node scripts/generate-r1-connector-contracts.mjs --check`, `npm run wire:bijection`,
`npm run db:catalog:check`, `npm run db:roles:check`, `npm run r1:a0:web:typecheck`, and
`node --test` over the connector suites above.

Evidence for Q4: the generic seam gains a second axis (two Connections of one integrator reaching two
origins by the Connection's own data), and P7 and P3 hold per destination.

### Throughput checkpoint

- **Blocking first steps.** `npm ci` in the building worktree. Q6-1 before Q6-2, because the worker test
  needs the route.
- **Independent workstreams.** The Q-6 PR and D-1 are disjoint in product files and can run in two
  worktrees at once. Q6-3 is disjoint from Q6-1 and Q6-2 and can run beside them in the same PR's
  worktree if one owner holds it.
- **Shared mutable state.** The test fixtures that build a broker (D-1 renames `adapter` to `adapters`).
  Split by landing order, not a lock: the second PR renames.
- **Smallest safe decomposition.** One Sonnet owner for the Q-6 PR, one for D-1. Q-6's units are
  sequential inside one PR because each test builds on the previous route.

### What the live proof needs from Q-6, after merge and E-1

Positive: a real Sankhya read through a handler in Preview, recorded as field names, counts, duration and
a digest; the Q3 app user sees the result, masked (`docs/tasks/...:135-142`). Negative on the pilot:
another Project and a removed binding refused through a handler (`docs/tasks/...:151`). No leak: the
Preview responses carry only handler fields, by the scan (`docs/tasks/...:161-162`).

## 7. Open questions for Leandro

1. **"Runner cap 256 KiB."** I read it as the cap on each `connectors.fetch` answer the handler
   receives. If it meant the handler's answer to the browser (1 MiB today), say so; that changes the Q2
   handler contract. Recommendation: the reading above.
2. **The pilot's existing Sankhya Connection.** The migration marks every existing Connection
   `production`. Is the pilot's Connection a production credential? If it is sandbox, the backfill must
   say `sandbox`. I cannot read the pilot's env file. Recommendation: confirm before D-1 merges.
3. **Merge order for migration numbers.** D-1 needs the next free number on `main`. PR #373 wants `0032`,
   and `-int` holds `0032` to `0038`. Recommendation: hold #373 until `-int` lands, as study 21 already
   asks, and give D-1 the number after `-int`'s last.
4. **Who moves the Q3 notebook app to `connectors.fetch` (2e).** A Builder conversation on the pilot, or
   a hand edit. Both touch the pilot. Recommendation: the Builder, since it also exercises closure item 5.
5. **Per-person attribution of app reads.** Should the C-029 record name the app user behind each
   handler read? Recommendation: no for Q4.
6. **What "E-4 scan" names.** Section 0. Recommendation: the Preview response scan in Q6-4.

## Principles applied

- **Model the Domain.** The port's two verbs become a route table under one budget, not a second branch
  on `request.url`, and the Connection's destination becomes a keyed adapter record the executor indexes,
  not a conditional on the origin.
- **Boundary Discipline.** The port only JSON-parses the fetch body; the executor's strict parse is the
  one boundary. The destination is parsed once at the store's row mapping.
- **Type System Discipline.** `HandlerFetchResult` is derived from `FetchResult` with `Omit`, so the
  handler type cannot drift from the executor, and `Destination` is a closed union shared by the DB
  CHECK, the contract enum and the adapter record.
- **Migrate Callers Then Delete Legacy APIs.** The Builder stops learning `connectors.call` in this PR;
  the runtime path waits for its one remaining caller, then goes in one wave (2e).
- **Encode Lessons in Structure.** A repository test keeps `connectors.call` out of the Builder's
  guidance, instead of a sentence asking reviewers to watch for it.
- **Laziness Protocol.** The handler budget stays in the existing port counter rather than a second
  budget in the scope, and D-1 adds no create-time refusal because CON-03 already reports it.
