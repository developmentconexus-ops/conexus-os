# 0015. Child: the operation declared once in Zod

Part of [spec 0015](index.md). Covers the operation declaration, how the Hub registers and checks it,
the web caller, the emitted OpenAPI and its checks, the branded ids, and the contract package build.
Satisfies AC-1 to AC-4 and AC-12 of the umbrella.

## Summary

Each HTTP operation of the Hub is written once, in Zod, in a small shared package. The Hub registers
it through the S3 definer, so the handler's input and return types come from that one declaration and
Fastify checks the input with the same schema. The web calls the Hub through one function that parses
every answer with the same declaration. The OpenAPI file is emitted from the declarations and
committed; CI fails when it drifts. The YAML, its four generators and every generated contract file go.

## 1. The package

`packages/contract/` imports only `zod`. Layout:

| File | Holds |
| --- | --- |
| `src/ids.ts` | the branded id schemas and their types (section 6) |
| `src/operation.ts` | `Operation`, `operation()`, `Input<O>`, `Reply<O>`, `Result<O>`, `Binary`, `NoContent` |
| `src/problem.ts` | the `problem+json` schema (`z.looseObject`, RFC 9457 allows extra members) |
| `src/failures.generated.ts` | `FailureCode` and the status of each code, projected from `contracts/technical/failures.json` by `scripts/generate-failures.mjs` |
| `src/<owner>.ts` | one file per owner: `workspace`, `project`, `identity-access`, `connectors`, `builder`, `model-account`, `installation` |
| `src/index.ts` | re exports, and `OPERATIONS`, the one table of every operation |
| `dist/` | the build output (`.js` and `.d.ts`), committed |

**How the apps import it (spike 4, option A).** The package builds alone with
`tsc -p packages/contract` into `dist/`, and `dist/` is committed. The Hub, the web, the scripts and
the `.mjs` tests import `packages/contract/dist/index.js` by relative path, the shape
`packages/canonical-json` already has. The Hub keeps `rootDir: "src"` and its build layout; no build
script changes. `contract:build` runs inside `npm run generate`, so the existing clean tree check fails
a pull request whose `dist/` is stale. `.gitignore` gains `!packages/contract/dist/`, and
`.gitattributes` marks `packages/contract/dist/** linguist-generated` so review diffs fold it.
`scripts/check-import-law.mjs` gains the rows that let both apps and `scripts/` import
`packages/contract/dist` and nothing else under `packages/contract`.

Rejected: changing the Hub `rootDir` (TS6059 forced it, and it moves the emit layout about 20 scripts
and harnesses assume); project references with `tsc -b` (the build hash covers only `apps/hub/src`, so
a stale package build is served silently); an npm workspace package (six scripts and the lockfile
change, unproven).

`scripts/generate-failures.mjs` writes `packages/contract/src/failures.generated.ts` and stops writing
`apps/web/src/generated/failures.ts`; the web imports `FailureCode` from the package. The Hub keeps
`platform/failures.generated.ts` only for what the package does not carry (log text).

## 2. The declaration

```ts
type Operation<Id, Access, Params, Query, Headers, Body, Success, Failures> = {
  readonly id: Id                          // 'WS-01', the operation ledger id
  readonly access: Access                  // an S3 access kind (spec 0014, section 1)
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly path: string                    // Fastify form, '/api/control/workspaces/:workspaceId'
  readonly params: Params | null           // z.object, or null when the path has none
  readonly query: Query | null
  readonly headers: Headers | null         // z.looseObject, so the cookie and other headers stay
  readonly body: Body | null
  readonly success: Success                // one or more statuses, see below
  readonly effects: readonly Effect[]       // the cookie effects a handler may ask for, usually []
  readonly failures: readonly FailureCode[] // beyond the common ones every session route can answer
  readonly malformed: { readonly [K in keyof z.output<Params>]: FailureCode } | null  // per path param
}
type Success =                                               // at least one status, by construction
  | { readonly 200: z.ZodType; readonly 201?: z.ZodType }
  | { readonly 201: z.ZodType; readonly 200?: z.ZodType }
  | { readonly 204: null }
  | { readonly 200: Binary }                                   // the thumbnail: media type, byte limit
type Effect = 'clear-session-cookie' | 'clear-bootstrap-cookie'  // the writers of http/cookies.ts
type Binary = { readonly mediaType: 'image/png'; readonly maxBytes: number }   // checked before send and in call
type AnyOperation = Operation<string, AccessKind, ...>          // AccessKind is spec 0014's closed table
type JsonOperation = AnyOperation & { readonly success: Exclude<Success, { readonly 200: Binary }> }
type BinaryOperation = AnyOperation & { readonly success: { readonly 200: Binary } }
type Out<P> = P extends z.ZodType ? z.output<P> : undefined     // a null part is undefined in Input
type EffectsOf<E extends readonly Effect[]> = { readonly [K in E[number]]: () => void }
// GrantOf<K> is spec 0014's grant type for access kind K (http/access.ts), unchanged
export const operation = <const O extends Operation<...>>(o: O): O => Object.freeze(o)
```

Absent parts are `null`, never optional. Each operation is a frozen literal (`operation<const O>`), so
`O['id']` and `O['access']` are literal types. Example, in `src/workspace.ts`:

```ts
export const WS01 = operation({
  id: 'WS-01', access: 'session', method: 'POST', path: '/api/control/workspaces',
  params: null, query: null,
  headers: z.looseObject({ 'idempotency-key': IdempotencyKey }),
  body: z.object({ name: WorkspaceName }),
  success: { 201: WorkspaceCreated },
  effects: [],
  failures: ['IDEMPOTENCY_CONFLICT'],
  malformed: null,
})
```

**Shared schemas** carry `.meta({ id: 'WorkspaceSummary' })`, so the emitter turns them into named
`components.schemas`. Do not convert operations separately with `reused: 'ref'`; that produced
colliding `__schema0` names (spike 1).

**One type per side of the wire, both from the schema's output.** A brand exists only in `z.output`
(zod adds it to the output type), and a `z.coerce` schema's `z.input` is `unknown` (checked on zod
4.6.5). So every type the code sees is `z.output`:

```ts
type Input<O>  = { params: Out<O['params']>; query: Out<O['query']>; headers: Out<O['headers']>; body: Out<O['body']> }
type Reply<O>  = single status ? z.output<that body> : { [S in statuses]: { status: S; body: z.output<O['success'][S]> } }[statuses]
type Result<O> = Reply<O>   // what call returns
```

The handler receives `Input<O>`, the values Fastify's validator parsed, with brands. The web passes
`Input<O>` too, so a `WorkspaceId` where a `ProjectId` is due fails `tsc` on both sides; the web gets
its ids from parsed answers, and a route param from the URL is parsed with its brand schema by the
router helper (`apps/web/src/app/route-params.ts`) before it reaches a call. An operation with one
success status replies with the body; one with two (connector create and BLD create answer 201 or 200,
`connectors/routes.ts`, `builder/routes.ts`) replies with `{ status, body }`. `z.toJSONSchema` throws on
a transform by default, which the emitter keeps, so the only transform the contract allows is the
query coercion below. Because the caller's type is the output too, the contract allows no `.default()`
either: a default would make the wire accept a field the caller's type then requires. An omissible
field is `.optional()`, and the handler applies its fallback where it uses it. The emitter fails on a
default, and the negative fixtures include an empty `success`.

**Query scalars.** A numeric query param is `z.coerce.number().int()`, a boolean is
`z.enum(['true', 'false'])`. The coerce schema emits `{ type: 'integer' }` for both `io` modes, the
right OpenAPI parameter; `call` serializes the number, the Hub's validator coerces it back. Nothing
coerces globally.

**Effects.** A handler that clears a cookie (sign out, IAM-02; finishing the bootstrap, IAM-03,
`identity-access/routes.ts`) declares it in `effects`; the handler gets an `effects` argument with
exactly those functions, implemented by `http/cookies.ts`, the cookie owner of spec 0014. No handler
reaches the Fastify reply.

**The malformed path id rule.** A path param that does not parse answers its `malformed` code,
which every operation declares per path param as that id's owner's `*_NOT_FOUND` (404), so
`/workspaces/:workspaceId/projects/:projectId` names both. A malformed id and an absent id answer the same, so the answer does not tell an outsider which
ids exist. This keeps today's rule (`workspace/routes.ts:9-12` and three other `22P02` catches) and
deletes those four catches. A query, header or body that does not parse answers
`REQUEST_VALIDATION_FAILED` (400), as today, with one exception kept from today: a missing or empty
`idempotency-key` header answers `IDEMPOTENCY_KEY_REQUIRED` (the shared `IdempotencyKey` schema carries
that code, and the definer maps it). `operation()` refuses, at type level, an operation whose path has
a `:param` and whose `malformed` is `null`.

## 3. The Hub side

**Registration.** The S3 definer gains one method, `routes(app).operation(op, handler)`
(`apps/hub/src/http/access.ts`, beside `routes(app)[kind]`). It registers `method`, `path`,
`config: { access: op.access, operation: op.id }` and calls the same `grantOf`, so the S3 enforcer,
the boot refusal and `foreignRoutes` do not change. `routes(app)[kind]` stays for the routes that are
not product operations (pages, OIDC, health). The handler is

```ts
type Handler<O> = (request: Input<O>, grant: GrantOf<O['access']>, effects: EffectsOf<O['effects']>) => Promise<Reply<O>>
```

so a wrong return shape or a misspelled header fails `tsc` (spike 1).

**Boot refusal.** The access check at boot (`access.ts`, the loop over registered routes) also refuses
`ROUTE_OPERATION_UNDECLARED` for a route under `/api/control` or `/api/builder` that the Hub owns and
that has no `config.operation`. Until each part lands, a list in `access.ts` names the routes still
owed; it only shrinks, and part 6 deletes it.

**Input.** `operation()` sets Fastify's per route `validatorCompiler` to the part's Zod
`safeParse`, returning `{ value }` or `{ error }`. Fastify puts the parsed value, brands included, in
`request.params`, `request.query`, `request.headers` and `request.body`, and wraps an error as
`FST_ERR_VALIDATION`, which `http/app.ts` already maps to `REQUEST_VALIDATION_FAILED`. A params error
maps to that param's `malformed` code instead. Headers are `z.looseObject`: a strict object would replace
`request.headers` and drop the cookie the access hook reads. The global Ajv compiler in `http/app.ts`
stays only while an unported owner still registers a YAML route, and goes in part 6 with its
`x-conexus-schema-source` keyword. Rejected: the emitted JSON Schema on Ajv (the handler would see a
plain `string` and need a cast to the brand), and `fastify-type-provider-zod` (a dependency for what a
dozen lines do).

**Output.** The method picks the declared status (the only one, or `reply.status`) and sends that
status's schema `.parse(body)`. TypeScript lets an object carry extra
properties into a wider type, so a row with an extra column (a digest, a credential id) type checks as
the reply and would reach the wire; `parse` strips it (spike 1). A parse failure logs one
`INTERNAL_UNEXPECTED` and answers the 500 problem; the error path does not parse its own answer again.
`schema.response` is never set on Fastify (it would compile the schema for serialization). A `Binary`
success checks the media type and the byte limit before it sends. Problems are built by the one error
handler from the failure table, so their status always equals the table's status for the code.

## 4. The web side

`apps/web/src/app/http.ts` holds the only function that fetches the Hub:

```ts
export function call<O extends JsonOperation>(op: O, input: Input<NoInfer<O>>, options?: { signal?: AbortSignal }): Promise<Result<O>>
export const query = <O extends JsonOperation>(op: O, input: Input<O>) =>
  ({ queryKey: [op.id, input] as const, queryFn: ({ signal }) => call(op, input, { signal }) })
export const href = <O extends BinaryOperation>(op: O, input: Input<O>): string
```

`call` builds the URL from `path` and `params`, sends same origin credentials and the JSON body, and
then decides by status and media type:

| Answer | Result |
| --- | --- |
| a declared success status, JSON | that status's schema `.parse(json)`, returned (as `{ status, body }` when two are declared) |
| `204` declared | `undefined` |
| `application/problem+json` | parsed with `Problem`; on 401 the authority cache is cleared (as `query-client.tsx` does today); throws `HubFailure(code, status, traceId)` |
| network error | `HubFailure('HUB_UNREACHABLE')` |
| anything else, or a body that does not parse | `HubFailure('HUB_RESPONSE_UNREADABLE', status)` |
| abort | the abort error, unchanged |

`call` is one typed signature over an implementation typed `Promise<unknown>`, so no cast is left;
the route walk (section 5) proves the promise. Zod runs without `eval` under the web's
`zod-jitless.ts` (spike 1). `hubCall`, `hubFetch` and the generated `*-client.ts` files are deleted.
React Query keys become `[op.id, input]`, so hand named keys such as `projectListQueryKey` go. A
mutation is `mutationFn: (input) => call(OP, input)`. A command that carries an idempotency key keeps
the same key across retries of one attempt, as today. The thumbnail is a `Binary` operation and the
screen uses `href`. `features/settings/installation-api.ts` takes the shared declaration.

**The Builder Mastra mount.** The nine routes stay under `foreignRoutes(..., 'session', ...)` and the
web keeps `@mastra/client-js` for transport. `@mastra/client-js` ships types, not parsers, so the web
parses what Conexus reads at the point it reads it: `parseForeign(schema, value)` in
`apps/web/src/app/foreign.ts` for a result, and the same function for each decoded stream event before
a reducer reads it. The schemas live in `packages/contract/src/builder.ts` and name only the fields
Conexus consumes (`z.looseObject`), with fixtures recorded from the pinned SDK version. They cover the
session state's `run`, a tool suspension's answer, the model list and the `data-*` parts. A known event
kind with invalid fields is `HUB_RESPONSE_UNREADABLE`; an unknown kind is ignored. The browser does not
import `@mastra/server`.

## 5. The emitted OpenAPI and its checks

**Emission.** `scripts/emit-openapi.mjs` walks `OPERATIONS` from `dist/` and writes
`contracts/api/product/openapi.json`. While some owners are still in YAML (parts 0 to 6), it also
bundles the remaining `*-paths.yaml` (the existing Redocly bundle) into the same document and fails if
one operation id is in both sources, so the document always has every operation exactly once and the
bijection stays green; part 6 deletes the YAML branch. Per operation: the path in OpenAPI form (`:x` to `{x}`),
`operationId` (the id), parameters from `params`, `query` and `headers` with `io: 'input'`, the
request body with `io: 'input'`, the success body with `io: 'output'`, and one
`application/problem+json` response per status among the declared and common failures, its `code` an
enum of those codes. Brands emit as `format: uuid` and no brand. `npm run contract:check` emits to a
temporary file and fails on any difference with the committed one; it runs in `verify:quick`.

**Redocly.** `wire:lint` points at `openapi.json`. The root `openapi.yaml` and the
`*-paths.yaml` files go as their owners land; the technical contract
(`contracts/api/technical/openapi.yaml`) is not part of this spec and stays.

**Bijection.** `scripts/check-wire-bijection.mjs` keeps its job (the table in
`docs/product/operation-ledger.md` against the wire, both directions) and reads `openapi.json`. Its
`x-conexus-contract-state` filter goes, since a Zod operation is closed by construction.

**No `x-conexus-*` key is emitted.** Of the seven keys today, two have readers: `contract-state`
(the filter above) and `schema-source` (the Ajv keyword), and both go. The access kind is a typed field
the walk reads from `OPERATIONS`.

**Route ledger.** Each `/api` row of `tests/implementation/access/route-ledger.mjs` gains
`operation: 'WS-01'`. The walk test asserts by table: every entry of `OPERATIONS` has exactly one row,
and the row's kind equals `operation.access`; signed in, the sample answer parses with the success
schema or is a `Problem` whose code is declared or common; every list read, called as an outsider with
a seeded second tenant, returns an empty list or the 404 (umbrella AC-9).

## 6. Branded ids

`src/ids.ts` defines each brand once as a Zod schema: `export const ProjectId = z.uuid().brand<'ProjectId'>()`
and `export type ProjectId = z.output<typeof ProjectId>`. A brand is earned when two kinds can be passed
in each other's place. The kinds:

| Brand | Census names that map to it |
| --- | --- |
| `AccountId` | `accountId`, `creatorAccountId`, `currentAccountId` |
| `WorkspaceId` | `workspaceId` |
| `ProjectId` | `projectId`, `candidateProjectId` |
| `ProjectRevision` | `projectRevision` |
| `SourceRevision` | source revisions |
| `ConversationId` | `conversationId`, and `threadId` where the Builder thread is the conversation |
| `BuilderRunId` | `builderRunId` (never the Mastra `runId`) |
| `ArtifactRevisionId` | `artifactRevisionId` |
| `ExecutionId` | `executionId` |
| `InvitationId` | `invitationId` |
| `GrantId` | `grantId` |
| `ConnectionId` | `connectionId` |
| `BindingId` | `bindingId` |
| `ModelAccountId` | `modelAccountId` |
| `ModelLoginId` | `loginId` (its own grammar, as generated today) |

Rules. A brand comes only from a parse: a row schema (`workspace_id: WorkspaceId`), a request schema,
a response schema in `call`, or the brand's own `parse` where the Hub mints an id. No `as WorkspaceId`
anywhere; the five Hub brands made by cast today (`identity-access/current-session.ts`,
`connectors/model.ts`) and the `accountId()` cast go. `entryId` in the roster becomes a union whose
variant carries `AccountId`, `InvitationId` or `GrantId`. Opaque ids from an SDK or a provider
(`toolCallId`, Mastra `runId`, sandbox ids, `traceId`, `spanId`) stay `string` or get a brand with
their real grammar, never a uuid check by assumption. Local React keys stay `string`.
`HubSession.account.accountId` is parsed into `AccountId` by the session store in part 0.

## 7. Value sourcing

| Action | Value | Source |
| --- | --- | --- |
| any operation | the access kind | `op.access` |
| any operation | the 404 for a malformed path id | `op.malformed[param]` |
| any handler | the cookie it clears | `op.effects`, written by `http/cookies.ts` |
| any problem | status, title | the failure table row of the code (`failures.json`) |
| any problem | `traceId` | the request's trace context, as today |
| emitted OpenAPI | each status and code | the keys of `op.success`, `op.failures` plus the common set, status from the failure table |
| `call` | the URL | `op.path` with `input.params`, `input.query` |
| `query` | the cache key | `[op.id, input]` |
| WS-01 | `creatorAccountId` | the session grant's parsed `AccountId` |
| WS-01 | `workspaceId` | minted by the Hub through `WorkspaceId.parse(randomUUID())` |
