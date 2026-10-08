# 0015. Child: part 7, the other JSON input

CI tooling update: historical builder count/debt ratchets and boundary inventories described below
are retired. `scripts/check-boundaries.mjs` owns direct AST prohibitions and named exceptions;
`scripts/check-builder-safety.mjs` retains exclusive safety ownership checks. No implementation
regenerates the deleted census registers. [Delivery](../../development/delivery.md#proof-and-verification)
owns routine and qualification coverage.


**Status**: Approved (by HQ on 2026-10-05, under the operator's delegation; revision 3.1)

Part of [spec 0015](index.md). Written from the code at the stacked part 3 head (head `68d324a7`, parts 0 and
3 built). The census reads 89 at this head. It decides inside the umbrella (index.md build plan item 7, AC-13,
section 4 rules 3 and 8). It changes nothing the part 0 surface froze.

## Decisions applied

HQ decisions on revisions 1 and 2 hold where a later one does not replace them. HQ wins where a review differed.

1. Rule 3 reaches zero in S1. This part also owns the 8 casts no part owns (section 1.2). Each is fixed with a
   schema or a guard in its owner's module, or it is a named exemption (section 4.2).
2. The worker imports the caller schema from `platform/caller.ts` (section 2.4).
3. The `RUNNER_REFUSED` defect is fixed here, with a test that fails on today's code (section 5, test 7).
4. Revision 2's table of 32 rules, its seeded sweep and its decision "the first manifest fault follows Zod's issue
   order" are dropped. The Sonnet findings B1 (bounded schema) and F1 (rule table) go with them, and so does F2, the
   one strict `serverFile` for the tree.
5. The decisions of revision 2 that stand: B2 for the eight sites, F3 (`boot-server.ts` has one owner), F4 (job
   bounds), F5 (staging layout), F6 (`wire.ts`), F7 and F8 (sandbox tests, `dependencyClosure`), F9 (census by source),
   the weak test and behavior statements, `connectorAnswer` as a union on `ok`.
6. HQ decisions on the Opus review of revision 2:
   1. The manifest keeps today's hand validator, first fault wins. Its 15 casts go by type guards, with no `as`. It is
      the one named exception to "JSON is parsed with Zod" (section 2.1). `boot-server.ts` reads through
      `admitManifest`. Texts are unchanged, so Opus finding F1 disappears. `__proto__` keeps today's behavior.
   2. B2. The supervisor writes the `HANDLER_EXPORT_MISSING` detail. `HANDLER_LOAD_FAILED` is filtered like
      `HANDLER_FAILED`. Section 7 says worker written detail is handler controlled text. `process.getBuiltinModule` and
      the import list are not this part (HQ reports it).
   3. F2 uses `isProviderDefinedTool` from `@mastra/core/tools`. F3 checks `specificationVersion === 'v3'`.
   4. F4. Every `noUnsafeTypeAssertion` suppression is `debt` or a recorded `exempt`. Anything else fails.
      `--write` never adds an exemption (section 4.2).
   5. Nits, all. Every row of the 60 left is mapped to the part that owns its file (section 4.1).

## Summary

Two kinds of JSON enter the Hub that are neither HTTP, a row nor Mastra output. The first is the application
manifest and the files around it. The second is what the Hub, the runner supervisor and the sandboxed worker send
each other. Today each is read with `JSON.parse` and an `as` cast, or with a hand written validator, under a
`noUnsafeTypeAssertion: debt` suppression.

After this part the runner pipe and the other readers go through a Zod schema and `safeParse`. The manifest does not.
It keeps its hand validator, because the manifest is untrusted, can be megabytes, and today's validator stops at the
first fault with bounded work (section 2.1 has the measurements). The validator loses its 15 casts to type guards.

29 suppressions leave the `debt` count: 21 on this part's own JSON (20 in `app-runner/`, 1 in
`builder/run-operation.ts`), 7 on the casts no part owned, and 1 that becomes a named exemption. The census item
`unsafeAssertionDebt` falls from 89 to 60 at this head.

Mastra check (skill `mastra`): Mastra has no primitive for a Project manifest or for a sandbox pipe. Zod is already
the Hub's parser (`callerSchema` at `apps/hub/src/platform/caller.ts:11`, `requests.ts`, `WORKER_RESULT` at
`sandbox.ts:9`), so nothing new is added. For the three `ToolsInput` casts, `@mastra/core/tools` exports
`isProviderDefinedTool` (`dist/tools/toolchecks.d.ts:32`), which is the guard Mastra itself uses for these tools.

## 1. Entry points in scope

### 1.1 This part's own JSON (21 suppressions)

Every row is a suppression counted by `unsafeAssertionDebt` at this head (census 89). By source, the 89 are web
`features` 32, hub `builder` 25, hub `app-runner` 20, `identity-access` 7, `connectors` 5.

| # | Where | Today | Producer | Owner after |
| --- | --- | --- | --- | --- |
| 1 | `app-runner/server-manifest.ts`, 15 suppressions in `admitManifest`, `admitServerTree`, `schemaViolation` | a hand validator over `unknown`, 15 casts back to `Record`, `ServerManifest` and `ServerTree` | the Builder (`conexus/manifest.json`, `generate.ts:61`, `server-bundle.ts:115`) and the build (`server-bundle.ts:94`, `run-operation.ts:185`); the runner reads it back in `supervisor.ts:201,232` | `server-manifest.ts` itself, as a hand validator with type guards (section 2.1) |
| 2 | `app-runner/worker.ts:111` | `JSON.parse(stdin) as WorkerJob` | the supervisor, `supervisor.ts:186` and `:249` (the `job` builders), written by `sandbox.ts:174` | `app-runner/wire.ts`: `workerJob` |
| 3 | `app-runner/worker.ts:57` | `JSON.parse(answer) as ConnectorAnswer`, then `typeof answer.ok === 'boolean'` | the Hub connector port (`connectors/handler-port.ts:49`), over the unix socket | `wire.ts`: `connectorAnswer` |
| 4 | `app-runner/module.ts:39` | `JSON.parse(body) as unknown` (redundant, `JSON.parse` already returns `any`) | the runner's Fastify replies | the cast is deleted, and the body stays `unknown` until a schema reads it (rows 5 and 7) |
| 5 | `app-runner/module.ts:56` | `reply.body as PrepareResult` | `supervisor.prepare` through `http.ts` | `requests.ts`: `prepareResult` |
| 6 | `app-runner/sandbox.ts:105` | `JSON.parse(package.json) as {dependencies?, optionalDependencies?}` | the `node_modules` of the Hub's own `pg` and `zod` closures, read when staging the worker | `sandbox.ts`: `packageDependencies` (its only reader) |
| 7 | `builder/run-operation.ts:104` | `body as {error?: {code?, detail?}}` on the runner's invoke reply | `supervisor.refusal` (`supervisor.ts:73`), which answers `failureProblem` with `code` and `detail` at the top level | `http/problem.ts`: `problemBody` |

Not changed, with the reason. `JSON.parse` calls that feed a validator already (`server-manifest.ts:220`,
`generate.ts:61`, `server-bundle.ts:115`, `run-operation.ts:185`) carry no cast: the next call is the validator. The
runner's three request bodies (`requests.ts`, including its own `serverFile`) and `WORKER_RESULT` are already Zod and
only move. `worker.ts:178` clones a value the handler gave (`JSON.parse(serialized)`) and asserts nothing.

**A defect found while reading row 7.** `runnerRefusal` reads `body.error.code`. The real runner answers
`{type, title, status, code, detail}` (`app-runner-http.test.mjs:34`), with no `error` key. Only the test fake
(`builder-run-operation.test.mjs:98,101`) wraps it in `error`. So in production every runner refusal reaches the
Builder as `RUNNER_REFUSED`, and the `DETAIL_SHOWN` table (`run-operation.ts:86-96`) never fires. The schema follows
the producer, and the fake changes to the real shape. This is fixed in this part. Fixing it opens a channel, which
section 2.7 closes in the same part.

### 1.2 The 8 casts no part owns (decision 1)

Suppression lines at this head. Each fix was applied to a scratch copy of `apps/hub` outside the worktree, and
`npx tsc --noEmit` passed with zero errors on the whole hub with the manifest, `boot-server.ts`, `controller.ts` and
`route.ts` fixes of this revision applied. The other fixes in this table were measured the same way in revision 2.

| Where | What it casts | Fix |
| --- | --- | --- |
| `builder/openai-codex/route.ts:32` | Mastra's Codex provider is typed `MastraModelConfig`, but builds an AI SDK model | a guard `isLanguageModel(model: object): model is LanguageModelV3` that checks `specificationVersion === 'v3'` and `typeof model.doStream === 'function'`. A model that fails it throws the existing `OPENAI_CODEX_MODEL_REFUSED`. `@ai-sdk/provider` types the interface by `specificationVersion: 'v3'` (`dist/index.d.ts:234`), so a `doStream` check alone would admit a V2 model. The real provider's model reports `v3` (measured). A guard parameter typed `MastraModelConfig` ran `tsc` out of memory on the model id union, so the parameter is `object` |
| `builder/harness/controller.ts:71,105,107` (three `as ToolsInput[string]`) | three provider tools: Google search, OpenAI and Anthropic web search | one function `providerTool(tool: object): ToolsInput[string]` that calls `isProviderDefinedTool` from `@mastra/core/tools`. It checks `type` is `provider` or `provider-defined` and `id` is a string, so `{id: 'x'}` is refused (measured). The three real tools pass (measured: `openai.web_search` and `anthropic.web_search_20250305` are `provider`, `google.google_search` is `provider-defined`). A tool that fails the guard throws `INTERNAL_UNEXPECTED` with `invariant: 'PROVIDER_TOOL_SHAPE_REFUSED'`. `tsc` accepts `ProviderTool` as a `ToolsInput` member. This is a typed fix, not an exemption |
| `identity-access/oidc.ts:106` (`as never`, then `as unknown as Promise<Response>`) | undici's `fetch` inside openid-client's `CustomFetch` | **exemption**. Both casts are needed, measured. Without `as never`, `tsc` refuses `body`: openid-client's `FetchBody` includes `undefined`, and undici's `RequestInit` under `exactOptionalPropertyTypes` does not. Without the second cast, undici's `Response` lacks `[Symbol.dispose]` on its header iterator, which the DOM `Response` has |
| `identity-access/installation-routes.ts:58` | `accountId as AccountId` after a local UUID regex | `AccountId.safeParse(request.params.accountId)` with the contract brand (part 0 made it the one brand). A failure throws `ACCOUNT_NOT_FOUND` as today. The local `ACCOUNT_ID` regex goes. The contract brand is `z.uuid()`, which differs from the local regex in two ways, both measured. It checks the version and variant digits, so a hex shaped id that is not an RFC UUID is refused as `ACCOUNT_NOT_FOUND`. It is case insensitive, so an uppercase id, refused today, now reaches `revoke` as sent, and Postgres reads it as the same `uuid`. Account ids come from `gen_random_uuid()`, which is lowercase. Test 12 pins both |
| `builder/google-ai-pro/pool.ts:169` | `parsed as { files?: readonly { unavailable?: unknown }[] } \| null` on the proxy's `auth-files` answer | `authFilesListing = z.looseObject({ files: z.array(z.looseObject({ unavailable: z.boolean().exactOptional() })) })`, local to `pool.ts`. An answer that does not match reads as "not available yet", as today |
| `connectors/sankhya/gateway.ts:86` | `JSON.parse(...) as unknown` | delete the cast. It is redundant: `JSON.parse` returns `any` and the function returns `unknown`. The `try` still catches a parse error as `RESPONSE_REFUSED` |

## 2. The shapes and who owns them

One module per shape. A shared shape is defined once and imported by both sides.

### 2.1 `apps/hub/src/app-runner/server-manifest.ts`: the one exception to "JSON is parsed with Zod"

**Why the manifest is not Zod.** Revision 2 turned the hand validator into Zod. That broke two things, and both come
from one premise, that a schema library is a safe parser for any JSON. The manifest is the case where it is not.
The input is untrusted. It can be 4 MiB in a tree file (`supervisor.ts:201,232`), and the source manifest has no cap at
all (`run-operation.ts:185`, `server-bundle.ts:115`). Today's validator stops at the first fault, with work bounded
by the bytes it has read, and answers the text the Builder reads. Zod collects every issue before it answers. To keep
today's behavior it needed a depth bound, a width bound and a 32 row text adapter, and it still changed texts and broke
`builder-skill-manifest-vocabulary.test.mjs`.

Measured. The numbers for today's validator and for the type guard version are from this revision, Node 24.20.0, on
scratch copies outside the repository. The Zod numbers marked "review" are the Opus review's, with zod 4.6.5. The
"scratch rebuild" is my own rebuild of revision 2's Zod design.

| Input | Size | Today | Type guard version | Zod, revision 2 |
| --- | --- | --- | --- | --- |
| server manifest, 64 x 64 x 64 properties, fault in the first leaf | 6.8 MB | 0.6 ms | 0.3 ms | review: `RangeError` after 300 ms. Scratch rebuild: 75 ms |
| the same, fault in the last leaf | 6.8 MB | 14 to 87 ms (cold run) | 14 ms | scratch rebuild: 67 ms |
| the same, no fault, admitted | 6.8 MB | 24 ms | 17 ms | scratch rebuild: 66 ms |
| source manifest, 200,000 properties | 5.7 MB | 28 to 32 ms | 29 ms | scratch rebuild: 198 ms |
| server manifest, 130,000 properties | 3.7 MB | 17 ms | 15 ms | review: `RangeError`. Scratch rebuild: 113 ms |
| source manifest, 150,000 properties | 4.2 MB | 18 ms | 17 ms | review: `RangeError`. Scratch rebuild: 137 ms |
| source manifest, 5000 levels | 125 KB | 0.2 to 0.3 ms | 0.05 ms | scratch rebuild: 0.2 ms |

The "scratch rebuild" cells were measured on inputs with one fault. With every leaf faulty, the same rebuild throws
`RangeError: Maximum call stack size exceeded`: server 130,000 properties in 227 ms, source 150,000 in 209 ms, server
64 x 64 x 64 in 372 ms, source 200,000 in 281 ms with 503 MB of heap (confirmation review, rerun on the rebuild). The
cause is the issue count, which Zod collects in full. A `RangeError` is not a
`MANIFEST_REFUSED`: `toFailure` answers it as a 500. The decision rests on that measurement and on the cost
ratio. The 6.8 MB inputs are above the 4 MiB tree file cap, which only makes the tree check stricter. The source
manifest has no cap.

**What stays.** The hand validator, first fault wins, with its texts. Every text of today is unchanged. Measured
against today's code on the type guard version: 86 hand written cases give the same text, 100,000 seeded random
mutations of a valid source and server manifest (one or two faults each) give 0 differences in verdict and 0 in text,
and 21 server tree cases give the same text. These runs are measurements, not tests kept in the repository.

**What changes (the 15 casts).** Narrowing and a typed signature make them unnecessary. They were needed because
`refuse` was an arrow function in a `const`, and TypeScript narrows after a call that returns `never` only when the
callee has an explicit type, as a function declaration does. So:

- `refuseManifest`, `isRecord`, `onlyKeys` and `bound` become module level function declarations. `isRecord` is a type
  guard `candidate is Record<string, unknown>`. None is exported.
- The `schema` closure becomes `assertSchema(candidate, where, depth): asserts candidate is ValueSchema`. It returns
  nothing and keeps its rules and its order. The cast on its return value and the `as Record` after `input` go.
- The body of `admitManifest` becomes `assertManifest(value, stage): asserts value is SourceManifest | ServerManifest`.
  `admitManifest` keeps its overloads and its thrown text, `MANIFEST_REFUSED: <where>: <why>`. It calls
  `assertManifest` and returns the same object it was given, as today.
- `parts[parts.length - 1] as string` in `admitServerTree` becomes `parts.at(-1)`, with `undefined` added to the first
  refusal. The two casts around the tree's manifest go: the overload already returns `ServerManifest`, and
  `refuseTree` returning `never` narrows `manifest`. The tree keeps its runtime array check and reads the files from
  `const entries: readonly ServerFile[] = files`, because narrowing `files` by `Array.isArray` turns each file into
  `any`.
- `schemaViolation` uses `isRecord(value)` instead of a `typeof` chain and a cast. It stays hand written. It checks a
  value against a schema that is data (the Project's own).
- The `noExcessiveLinesPerFunction` suppression on `admitManifest` goes, because no function is long any more. The
  census does not count it.
- `__proto__` keeps today's behavior. A property named `__proto__` is admitted, because it matches the identifier
  pattern. An operation id `__proto__` is refused with the id text. Measured on the type guard version.

Measured: with these edits, `tsc --noEmit` passes on the whole hub with zero errors. `server-manifest.ts` holds no `as`
assertion, and `biome lint` passes on it.

The cost of this approach is stated. `tsc` trusts an `asserts` clause. If a rule is deleted from the body, `tsc` does
not notice. The tests of section 5 (test 1, and the five existing tests that read the texts) and the census keep the
body honest.

### 2.2 The server tree

`admitServerTree` is unchanged except for the casts of section 2.1. Its texts, its order of checks and its limits are
today's. `requests.ts` keeps its own strict `serverFile`, which guards the HTTP body and is not part of this part.
Nothing new is refused, and nothing admitted today is refused.

### 2.3 `apps/hub/src/app-runner/wire.ts` (new)

It holds the three shapes the worker and the sandbox share: the job, the result and the connector answer. The
worker imports `workerJob` and `connectorAnswer` at run time, and `workerResult` only as a type, which is erased.
`sandbox.ts` reads `workerResult` at run time. It lives here because both sides use it and no one else does. Everything
else lives by its owner (F6).

- `workerJob`: `z.discriminatedUnion('kind', [invoke, migrate])`. `WorkerJob` is `z.infer`, and the `WorkerJob` type
  in `worker.ts:17-19` goes. The `pending` item type in `data-plane.ts:19` becomes `PlannedMigration`, exported from
  `wire.ts` as a type import, which is erased, so `data-plane.js` gains no run time import. Bounds are in section 2.4.
- `workerResult`: the schema now in `sandbox.ts:9-12`, loose as today (`z.object`, extra keys dropped). The
  `satisfies` line goes. `WorkerResult` is `z.infer`, and `worker.ts` and `sandbox.ts` import the type.
- `connectorAnswer`: `z.discriminatedUnion('ok', [looseObject({ok: true}), looseObject({ok: false, code: string})])`.
  It matches what the Hub sends. `FetchResult` (`connectors/native.ts:17`) has `ok: true` with `status, bytes, body`,
  and `ok: false` always with `code`. `handler-port.ts:49` sends a `HandlerFetchResult` of that shape. The answer
  passes through with every extra field, as today. The one new refusal is `{ok:false}` without a `code`, which the Hub
  never sends.

### 2.4 Where the other shapes live, and the job bounds

- `prepareResult` goes in `requests.ts`, beside the request schemas the Hub client already imports at run time.
  `module.ts` imports no run time value from `supervisor.ts`, and must not start.
  `discriminatedUnion('state', [READY {reset: boolean, applied: string[]}, MIGRATION_FAILED {detail},
  MIGRATION_HISTORY_DIVERGED {detail}])`, strict, `.readonly()`. `PrepareResult` in `supervisor.ts:57-60` becomes a
  re export of the `z.infer`.
- `problemBody` goes in `http/problem.ts`, beside `failureProblem`, which writes it:
  `z.looseObject({code: z.string().exactOptional(), detail: z.string().exactOptional()})`. Three readers use it:
  `module.ts` (the prepare refusal), `http.ts` (the invoke log line, which drops its `problemOf` helper at line 15)
  and `builder/run-operation.ts`. The Builder may not import `app-runner/` beyond the manifest contract, but `http/` is
  a technical layer anyone may import (`check-import-law.mjs`, `TECHNICAL_HUB_LAYERS`). A body whose `code` or `detail`
  is not a string reads as no code, where today only the bad member would be ignored.
- `packageDependencies` stays in `sandbox.ts`, its only reader:
  `z.looseObject({dependencies: z.record(z.string(), z.string()).exactOptional(), optionalDependencies: same})`.

**The worker job bounds (F4).** Both kinds are `z.strictObject`. The supervisor writes the job (`supervisor.ts:186`,
`:249`), so an extra key is a platform bug. The parse happens after the 8 MiB stdin limit (`worker.ts:25,108`).

| Field | Schema | Bound from |
| --- | --- | --- |
| `kind` | literal `invoke` or `migrate` | `supervisor.ts:186,249` |
| `login.host` | string, 1 to 107 | a unix socket path is capped at 107 bytes (`supervisor.ts:120`). The value is `/run/conexus/pg` in production (`sandbox.ts:44`) and a test path elsewhere, so no pattern |
| `login.user`, `login.database` | string, 1 to 63 | the Postgres identifier limit. The role is `app_<32 hex>_preview_rt` or `_mig` (`data-plane.ts` `PROJECT_ROLE_NAME`) |
| `module` (invoke) | string, 1 to 300 | the supervisor sends `/app/` plus an admitted module path. The longest path the `MODULE` pattern admits is 272, so 277 with the prefix. No pattern, because `app-runner-worker.test.mjs` passes a temp path |
| `export` (invoke) | string, 1 to 64 | the `EXPORT` pattern admits at most 64 characters |
| `input` (invoke) | `z.unknown()`. **The key is required** in Zod 4.6.5 (measured: `{}` fails with `invalid_type`, expected `nonoptional`) | the Hub already refuses a request without it, because `invokeBody` has the same `z.unknown()`. `JSON.stringify` drops an `undefined` input, so a job without the key is refused where today the handler would get `undefined`. The runner request cannot produce that case |
| `caller` (invoke) | `callerSchema`, imported, not copied | `platform/caller.ts:11` |
| `responseLimit` (invoke) | positive safe integer | `limits.responseBytes`, 1 MiB by default (`supervisor.ts:35`), configurable, so no upper bound beyond the type |
| `connector` (invoke) | boolean | `supervisor.ts:249` |
| `schema` (migrate) | string, 1 to 63 | `p_<32 hex>_preview`, 42 characters |
| `plan` (migrate) | list of at most 64 | the manifest's cap of 64 migrations (`server-manifest.ts`) |
| plan item | `{name: string 1 to 71, sha256: 64 hex, sql: string 1 to 262144, position: positive integer}` | the name pattern `^[0-9]{3,6}_[a-z0-9_]{1,60}\.sql$` is at most 71. `sql` is the manifest's 256 KiB bound. `position` is the ledger position |

### 2.5 `builder/check/steps/boot-server.ts`

It has a second manifest schema today (`serverManifestSchema`, lines 14 to 23, with a lazy `schemaSchema`) and a
fallback `catch { return {} }`. It now reads through the one owner. `declaredOperations` calls
`admitManifest(JSON.parse(...), 'server')`, and `stubValue` takes a `ValueSchema`. Both local types and the `z` import
go. Measured: `tsc --noEmit` passes on the whole hub with this change. The fallback stays as today, and is stated: a
manifest that cannot be read, is not JSON or is not admitted gives no declared operations, so every
`/__conexus/api/<op>` answers 404 `OPERATION_NOT_FOUND`. This is stricter than today's local schema, which read any
`operations` map with an optional `output`. A manifest of `version` 2, or with an unknown key, now answers 404 for every
operation (section 7). The import is allowed by `check-import-law.mjs:15`, and the build step before boot already
admits the same manifest.

### 2.6 Staging in the sandbox (F5)

The worker now imports `wire.js`, `zod` and `platform/caller.js` (which imports only `zod`). `stageWorkerRuntime`
keeps the folder layout, so `wire.ts` imports `../platform/caller.js` unchanged:

```
/runner/package.json                     {"type":"module"}
/runner/app-runner/worker.js  wire.js  data-plane.js
/runner/platform/caller.js
/runner/node_modules/pg ...   /runner/node_modules/zod
```

`sandbox.ts` declares two literals, `STAGED_FILES` (the four paths above) and `STAGED_PACKAGES` (`pg`, `zod`), and
stages each package's `dependencyClosure`. `zod` has no dependencies. The worker's path in `runWorker` changes from
`/runner/worker.js` to `/runner/app-runner/worker.js` (`sandbox.ts:147`). `--allow-fs-read=/runner/*` already covers
every path. `dependencyClosure` is exported with a second argument `from`, default `import.meta.dirname`, so a test can
point it at a temp tree.

**Measured on a scratch build** outside the repository (revision 2, unchanged by revision 3). The staged tree holds
the four files, `zod` and `pg`, and no `platform/failure.js`. `runWorker` under the real command
(`prlimit --as=1792 MiB`, bubblewrap, `--permission`, `--allow-fs-read=/runner/*`, `--max-old-space-size=128`)
answered a job for a missing module as `{"ok":false,"code":"HANDLER_LOAD_FAILED", ...}`, and a job with
`responseLimit:'big'` as `{"ok":false,"code":"WORKER_JOB_REFUSED"}`, in 97 to 102 ms each. Zod alone in the same
sandbox used 8 MB of heap and 61 MB resident, against limits of 128 MB and 1792 MB. The worker run outside the sandbox
answers `WORKER_JOB_REFUSED` for a bad `accountId`, a missing `module`, `responseLimit:'big'`, a missing `input` and an
extra key, and runs a valid job.

### 2.7 The runner refusal channel (B2)

The worker's result travels on fd 3, and the handler's own code can write to fd 3 too (the Opus review proved it with
`node --permission` and `writeSync(3, ...)`). The sandbox reads the first line (`sandbox.ts:186`), so a handler that
writes first controls the result. Before the `RUNNER_REFUSED` fix this did not matter, because the Builder never saw
a runner detail. After the fix, two worker codes carry a worker written detail of up to 300 characters to the Builder
model (`DETAIL_SHOWN`, `run-operation.ts:86-96`). That would let a handler send company data to the model. So:

- `HANDLER_EXPORT_MISSING`. The supervisor writes the detail from `operation.export`, which it read from the admitted
  manifest, at the line of `invoke` that answers `refusal(workerCodeOf(...), outcome.result.detail)`. The worker's own
  detail for that code is dropped. The worker writes `job.export` there too (`worker.ts:144`), so a real run shows the
  same text as today.
- `HANDLER_LOAD_FAILED`. `DETAIL_SHOWN` filters it like `HANDLER_FAILED`: only a database SQLSTATE survives. The import
  error text no longer reaches the Builder. This costs the Builder a diagnostic, and it is the price of closing the
  channel.
- `HANDLER_OUTPUT_REFUSED`. The supervisor writes it, but the text it writes can hold a handler chosen string: the
  handler picks the keys of its own answer, and an undeclared key that looks like a property name would be echoed to the
  model (`/Maria_Silva_CPF_12345678900: not declared`). `schemaViolation` takes `echoUndeclared`. The input path passes
  `true`, because the caller already holds its own keys, and the output path (`supervisor.ts`, the check of
  `operation.output`) passes `false`, so an undeclared output key reads `/(key): not declared`. Every other output text
  names only schema facts and array positions.
- Every other worker code is either not shown (`DETAIL_SHOWN` has no entry) or written by the supervisor
  (`INPUT_REFUSED`, `HANDLER_OUTPUT_REFUSED`, `HANDLER_CRASHED`). A worker line with another code becomes
  `HANDLER_FAILED` (`workerCodeOf`).

`process.getBuiltinModule` reaches built ins that `SUPPORTED_NODE_IMPORTS` (`server-bundle.ts:40`) does not list. That
is not this part. The sandbox is the boundary, and the import list is guidance for the Builder. HQ reports it.

## 3. On a parse failure

Existing codes from `contracts/technical/failures.json` first. No new row is added.

| Entry | Failure | Code and where it goes |
| --- | --- | --- |
| manifest, tree | refused, as today | `MANIFEST_REFUSED` (`:207`) and `SERVER_TREE_REFUSED` (`:211`), texts unchanged |
| `workerJob` in the worker | the worker writes `{ok:false, code:'WORKER_JOB_REFUSED'}` to fd 3 and exits 0, as it does for an oversized job (`worker.ts:106,108`). No detail. A stdin that is not JSON is still `WORKER_FAILED`, as today | `WORKER_JOB_REFUSED` (`:237`), 500 |
| `workerResult` in the sandbox | unchanged: `CRASHED` (`sandbox.ts:186`), which the supervisor answers `HANDLER_CRASHED` (`supervisor.ts:252`) | `HANDLER_CRASHED` (`:235`) |
| `connectorAnswer` | the handler gets `{ok:false, code:'CONNECTOR_UNCONFIGURED'}`, as for an unreadable answer today (`worker.ts:63`) | `CONNECTOR_UNCONFIGURED` (`:253`), 503 |
| `prepareResult` and a body that is not JSON | `Failure('APPLICATION_RUNNER_UNAVAILABLE', {cause})`, the code an unreadable body gets today (`module.ts:42`) | `APPLICATION_RUNNER_UNAVAILABLE` (`:123`), 503 |
| `problemBody` | not a failure: no match reads as no code, `RUNNER_REFUSED` as today (`module.ts:61`, `run-operation.ts:106`) | none |
| `packageDependencies` | `Failure('INTERNAL_UNEXPECTED', {details: {invariant: 'RUNNER_PACKAGE_JSON_INVALID', name}})`, in the style of `RUNNER_DEPENDENCY_MISSING` (`sandbox.ts:102`). It runs inside `stageWorkerRuntime`, which `main.ts:39` calls at runner start, so **the runner does not boot** on a package file of the wrong shape. A file that is not JSON still throws the raw `SyntaxError`, as today | `INTERNAL_UNEXPECTED` (`:13`) |
| a provider tool that fails `isProviderDefinedTool` (`controller.ts`) | `Failure('INTERNAL_UNEXPECTED', {details: {invariant: 'PROVIDER_TOOL_SHAPE_REFUSED'}})`, raised when the Builder builds that run's `web_search` | `INTERNAL_UNEXPECTED` |
| a Codex model that is not a `v3` language model | the existing `OPENAI_CODEX_MODEL_REFUSED` | as today |
| an invalid account id in `installation-routes.ts` | `ACCOUNT_NOT_FOUND`, as today | `ACCOUNT_NOT_FOUND` (`:77`) |

The two new `invariant` strings feed `telemetry/log-codes.generated.ts`, so the build reruns
`scripts/generate-log-codes.mjs`. `RUNNER_REFUSED` stays there, because the fallback keeps the literal.

## 4. Census

### 4.1 Rule 3 (`unsafeAssertionDebt`, `scripts/census-builder-run.mjs:127`, ceiling in `contracts/technical/census-builder-run.json:14`)

Measured with `node scripts/census-builder-run.mjs --list` at this head: 89.

| Row | Before | After |
| --- | --- | --- |
| `app-runner/` (`server-manifest.ts` 15, `worker.ts` 2, `module.ts` 2, `sandbox.ts` 1) | 20 | 0 |
| `builder/run-operation.ts` | 1 | 0 |
| `builder/openai-codex/route.ts` | 1 | 0 |
| `builder/harness/controller.ts` | 3 | 0 |
| `builder/google-ai-pro/pool.ts` | 1 | 0 |
| `connectors/sankhya/gateway.ts` | 1 | 0 |
| `identity-access/installation-routes.ts` | 1 | 0 |
| `identity-access/oidc.ts` | 1 | 0 (becomes an exemption, 4.2) |
| **`unsafeAssertionDebt`** | **89** | **60** |

The arithmetic. 89 minus 21 on this part's own JSON (15 manifest, 2 worker, 2 module, 1 sandbox, 1 run-operation),
minus 7 on the casts of section 1.2 (route 1, controller 3, pool 1, gateway 1, installation-routes 1), minus 1 for
`oidc.ts`, which becomes an exemption, is 60. Replacing Zod by type guards for the manifest does not change the count,
because the 15 suppressions go either way.

**The 60 left, by owning part.** The umbrella's build plan names some files. Where it does not, the row says so and
gives the part that owns the directory.

| Files (suppressions) | Part | Evidence |
| --- | --- | --- |
| web `builder/api.ts` 10, `builder/construir/pending-card.tsx` 4, `builder/mastra-session.ts` 2, `builder/transcript.ts` 3 (19) | 1, builder | all four named in build plan item 3 |
| hub `builder/mastra-session-routes.ts` (11) | 1, builder | named in item 3 |
| hub `builder/runtime.ts` (3) | 1, builder | by directory. `0015-data.md:109` names the file for its `error.message` read, not for these casts. **Not named** |
| hub `builder/trace-summary.ts` (2) | 1, builder | by directory. It casts Mastra span attributes, which item 3 parses. **Not named** |
| web `connector/connector-api.ts` (5) | 2, connectors | named in item 4 |
| hub `connectors/model.ts` (3) | 2, connectors | named in item 4 and in `0015-contract.md:280` |
| hub `connectors/scope.ts` (1) | 2, connectors | by directory. **Not named** |
| web `settings/model-accounts-api.ts` (1) | 5, model accounts | by directory. Item 6 declares the ten model account routes |
| hub `builder/google-ai-pro/credential.ts` (3, the `GoogleAiProKey` brand) | 5, model accounts | by feature. **Not named** |
| hub `identity-access/current-session.ts` (3) and `installation-administration.ts` (2) | 6, identity and access | named in `0015-contract.md:280` and item 8 |
| web `identity-access/api.ts` 2, `application-access-api.ts` 2, `membership-api.ts` 2, `settings/installation-api.ts` 1 (7) | 6, identity and access | by directory. `0015-contract.md:211` names `installation-api.ts` |

The rows sum to 19 + 11 + 3 + 2 + 5 + 3 + 1 + 1 + 3 + 5 + 7 = 60. By source that is web 32, hub `builder` 19,
`identity-access` 5, `connectors` 4. No row is owned by no part. Four files are named by no child spec or umbrella
line: `runtime.ts` 3, `trace-summary.ts` 2, `connectors/scope.ts` 1 and `google-ai-pro/credential.ts` 3, which is 9
suppressions. Their owner is a guess from the directory. If the owning child spec does not take them, rule 3 does not
reach zero. This is Open for HQ item 1.

Rule 3 reaches zero in S1 when every owning part has landed. If the base moved when this part merges, the ceiling is
that day's count minus 29, and the files named in section 1 hold zero `debt` lines.

### 4.2 Exemptions, and what the census refuses (F4)

A cast that cannot be removed carries `biome-ignore lint/nursery/noUnsafeTypeAssertion: exempt <reason>`, with a
non empty reason. Today every suppression of this rule in `apps/` is the exact line `debt: owning wave`, and there is
none of the `-all` or `-start` forms (measured). The census now reads every line under `apps/` that names
`noUnsafeTypeAssertion` and sorts it:

| Line | Meaning |
| --- | --- |
| `biome-ignore lint/nursery/noUnsafeTypeAssertion: debt...` | counted in `unsafeAssertionDebt`, as today |
| `biome-ignore lint/nursery/noUnsafeTypeAssertion: exempt <reason>` | an exemption, which must be in the record |
| anything else that names the rule, including any other suffix, `biome-ignore-all` and `biome-ignore-start` | the census fails and names the file and line |

The record gains `unsafeAssertionExemptions`, a list of `<file>:<line> <reason>`. The line is in the entry, because two
exemptions in one file with one reason must not look like one:

```
"unsafeAssertionExemptions": [
  "apps/hub/src/identity-access/oidc.ts:106 undici fetch and openid-client CustomFetch disagree on RequestInit and Response, proven by tsc"
]
```

The reason in the record equals the comment's `exempt <reason>` text verbatim. The census also walks `packages/*/src`
(`biome.json:89-91` applies the rule there), and it fails on any `biome-ignore`, `biome-ignore-all` or
`biome-ignore-start` whose rule path stops at `lint` or `lint/<group>` without naming a rule, because that silences
this rule without naming it. Test 9 has a fixture for each: a suppression under `packages/`, `lint/nursery: ...` and
`lint: ...`. It also reads `biome.json`: an `overrides` entry that turns `noUnsafeTypeAssertion` to anything but
`error`, or disables the linter, fails and names the entry. It walks `.mts` and `.cts` beside `.ts` and `.tsx`.

The census fails when a found exemption is not in the record, and when a recorded one is gone or has moved. A move
costs one hand edit of the record, and the failure message prints the entry to copy. `--write` records the counts. It
may remove an exemption that is gone. It never adds one. When it finds an exemption that is not in the record it exits
non zero, names it, and leaves the record unchanged. A new exemption is added by editing the record by hand, in the
same reviewed change as the suppression. The record's other items stay numbers.

### 4.3 Rule 8 by source (F9)

The umbrella's rule 8 counts these inside rule 3 "by source". The "54" does not reproduce at this head, so the census
prints the real split instead. After the `unsafeAssertionDebt` list, `--list` prints one line, for example
`by source: features 32, builder 25, app-runner 20, identity-access 7, connectors 5`. The label is the first directory
under `apps/<app>/src/`, and the order is by count. A fixture test (test 9) proves it. The study's 54 is not claimed.

## 5. Tests

Each runs the code the way a caller does and asserts a literal value. A test that still passes with the change removed
is not kept.

1. **Manifest bounds**, new `tests/implementation/server-manifest.test.mjs`. Each case builds its input in memory,
   parses it with `JSON.parse`, and times only the `admitManifest` call. The limit is 500 ms. Measured times are 0.05
   to 36 ms, so the limit guards against a regression to unbounded work. It is not a benchmark.
   - A server manifest with 64 x 64 x 64 properties and a fault in the last leaf answers
     `MANIFEST_REFUSED: operations.a.input.properties.p63.properties.p63.properties.p63: "type" must be one of string, integer, number, boolean, object, array`.
   - A source manifest with 200,000 properties answers `MANIFEST_REFUSED: operations.a.input: more than 64 properties`.
   - A server manifest with 64 x 64 x 64 properties and every leaf faulty answers
     `MANIFEST_REFUSED: operations.a.input.properties.p0.properties.p0.properties.p0: "type" must be one of string, integer, number, boolean, object, array`.
   - A source manifest with 200,000 properties, every leaf faulty, answers
     `MANIFEST_REFUSED: operations.a.input: more than 64 properties`.
   - Test 1 guards the exception (a move back to a validator that collects every issue fails the two every leaf
     faulty cases), not the cast removal, which tests 2 to 13 and the census cover.
   - A source manifest nested 5000 levels, built as a string, answers
     `MANIFEST_REFUSED: operations.a.input.properties.x.items.items.items.items.items.items: nested deeper than 6 levels`
     and does not throw `RangeError`.
   - A property named `__proto__` is admitted, and an operation id `__proto__` answers
     `MANIFEST_REFUSED: operations.__proto__: an operation id is camelCase letters and digits, starting lowercase`.
   - A valid source manifest and a valid server manifest are admitted, and the call returns the object it was given.
2. **Worker job**, in `app-runner-worker.test.mjs`. The existing `readsConexao` job still answers
   `{ok:true, value:{code:'CONNECTOR_UNCONFIGURED'}}` (line 43). The same job with `caller.accountId:'not-a-uuid'`
   answers `{"ok":false,"code":"WORKER_JOB_REFUSED"}`. With the parse removed it would run the handler and answer
   `ok:true`. The same literal holds for a job with no `module`, with `responseLimit:'big'`, with no `input` and with an
   extra key.
3. **Worker job in the sandbox**, in `application-runner-sandbox.postgres.test.mjs`, which needs bubblewrap (F7).
   `runWorker` with `nodePermission:true` and a database socket from a `net` server in a temp folder: a job for a
   missing module answers `HANDLER_LOAD_FAILED`, and one with `responseLimit:'big'` answers `WORKER_JOB_REFUSED`. This
   proves Zod and `platform/caller.js` load under `--permission` with only `/runner/*` readable.
4. **Connector answer**, same file. A handler module is bound into `/app`, and a `net` server on a temp socket is bound
   as the connector socket. When it answers `{"ok":false}` (no code), the handler's `connectors.fetch` returns
   `{ok:false, code:'CONNECTOR_UNCONFIGURED'}`. When it answers `{"ok":"yes"}`, the same. When it answers
   `{"ok":true,"status":200,"bytes":2,"body":{}}`, the handler gets exactly that object.
5. **Prepare result**, in `app-runner-module.test.mjs`, whose `fakeRunner` serves any status and body. A 200 with
   `{"state":"READY","reset":false,"applied":["001_a.sql"]}` returns it. A 200 with
   `{"state":"READY","reset":"no","applied":[]}` and a 200 with `{"state":"OTHER"}` reject with a `Failure` of id
   `APPLICATION_RUNNER_UNAVAILABLE`.
6. **Staging and package manifest**, new `tests/implementation/app-runner-sandbox-staging.test.mjs`.
   `stageWorkerRuntime(tempDir)` holds `app-runner/worker.js`, `app-runner/wire.js`, `app-runner/data-plane.js`,
   `platform/caller.js`, `node_modules/zod/package.json` and `node_modules/pg/package.json`, and no
   `platform/failure.js`. `dependencyClosure('x', tempDir)` over a temp `node_modules/x/package.json` of
   `{"dependencies":["pg"]}` throws a `Failure` whose `id` is `INTERNAL_UNEXPECTED` and whose `details` equal
   `{invariant: 'RUNNER_PACKAGE_JSON_INVALID', name: 'x'}`, asserted with `failure-matchers.mjs`.
7. **Runner refusal read (decision 3)**, in `builder-run-operation.test.mjs`. The fake at lines 98 and 101 changes to
   the real body (`{type, title, status, code, detail}`). A new case: the runner answers `{status:500, body:{type:
   'urn:conexus:problem:HANDLER_FAILED', title:'HANDLER_FAILED', status:500, code:'HANDLER_FAILED', detail:'23505
   duplicate'}}`, and `runOnce` reports `code:'HANDLER_FAILED'` with `detail:'SQLSTATE 23505'`. A body with no `code`
   reports `RUNNER_REFUSED`. On today's code the first case reports `RUNNER_REFUSED`, so it fails there. The tests at
   lines 155 and 163 keep passing against the real shape.
8. **The channel stays closed (B2)**, two cases.
   - In `builder-run-operation.test.mjs`, a runner body with `code:'HANDLER_LOAD_FAILED'` and `detail:'secret'` reaches
     `runOnce` as `{ok:false, operation, code:'HANDLER_LOAD_FAILED'}` with no `detail` and no `secret` anywhere in the
     report. A body with `code:'HANDLER_EXPORT_MISSING'` and `detail:'find'` still shows `detail:'find'`. With the
     test 7 fix and the old `DETAIL_SHOWN`, the first case carries `secret`.
   - In `application-runner-sandbox.postgres.test.mjs`, a handler that calls `writeSync(3, '{"ok":false,"code":
     "HANDLER_EXPORT_MISSING","detail":"secret"}\n')` and returns gets a runner reply whose `detail` is the
     operation's `export` name, never `secret`.
9. **Census**, new `tests/repository/census-builder-run.test.mjs`. A temp git repo holds a copy of the script, an empty
   `apps/hub/migrations`, a `failures.json` with an empty list, and fixture files: two `debt` lines in
   `apps/hub/src/app-runner/a.ts`, one `exempt` line in `apps/hub/src/identity-access/b.ts`, and one `debt` line in
   `apps/web/src/features/c.ts`. One case for each rule:
   - the `--list` output holds `by source: app-runner 2, features 1`.
   - the run passes with a record that lists `apps/hub/src/identity-access/b.ts:<line> <reason>`.
   - it fails, naming the file, when the record lacks the exemption, and when the record lists one that is gone or at
     another line.
   - it fails, naming the file and line, for a `noUnsafeTypeAssertion` line with another suffix, for
     `biome-ignore-all` and for `biome-ignore-start`.
   - `--write` with an exemption missing from the record exits non zero and leaves the record byte for byte the same.
     `--write` with a recorded exemption whose line is gone removes it.
   - two exemptions in one file with the same reason are two entries.

   The build confirms the minimum the script needs in the temp repo.
10. **Import graph**, rewritten `tests/repository/sandbox-import-graph.test.mjs`. It reads the `STAGED_FILES` and
    `STAGED_PACKAGES` literals from `sandbox.ts`, and walks the worker's run time imports with each specifier resolved
    from the importing file. `import type` is not a run time import. It allows only staged files, `pg`, `zod` and
    `node:` built ins, and asserts the walk reaches exactly the staged files. A second case runs the same walk over a
    copy of `wire.ts` that also imports `../platform/failure.js`, and expects exactly that one violation. Both cases ran
    green on a scratch copy in revision 2.
11. **Boot stub**, new `tests/implementation/boot-server-stub.test.mjs`. `serveOutput` over a temp `out/` with a valid
    server manifest answers the stub value for an operation. With `{"version":2,...}` it answers 404
    `{"error":{"code":"OPERATION_NOT_FOUND"}}` for every operation.
12. **Installation administrator id**, in `installation-settings-routes.test.mjs`, whose fake `revoke` (line 34) records
    its `account`. A `DELETE` with the uppercase form of a listed administrator's id answers 204, and `revoke` received
    that string as sent. A `DELETE` with `0b3f6a2e-1c4d-0e8a-9f10-2a3b4c5d6e7f` (version digit 0) answers 404
    `ACCOUNT_NOT_FOUND`, and `revoke` is not called.
13. **Provider tool and model guards**, new `tests/implementation/builder-provider-guards.test.mjs`. `providerTool` and
    `languageModelOf` are exported for it. `providerTool` returns each of the three real tools (built by the
    `@ai-sdk/openai`, `@ai-sdk/anthropic` and `@ai-sdk/google` factories) unchanged. `providerTool({id:'x'})` throws a
    `Failure` of id `INTERNAL_UNEXPECTED` with `details` `{invariant:'PROVIDER_TOOL_SHAPE_REFUSED'}`.
    `languageModelOf` returns the real `openaiCodexProvider` model, and a `{specificationVersion:'v2', doStream(){}}`
    object throws `OPENAI_CODEX_MODEL_REFUSED`.
14. **Existing assertions rerun and unchanged**: `manifest-enum.test.mjs` (all enum rules),
    `builder-skill-manifest-vocabulary.test.mjs`, `builder-client-generator.test.mjs:106-107` (the template's own text),
    `builder-check-server.test.mjs:71`, `builder-application-check.browser.test.mjs:250-263`,
    `app-runner-http.test.mjs:47-52`, `app-runner-module.test.mjs:46-48`, and
    `installation-settings-routes.test.mjs` (the `DELETE` administrator routes).

## 6. Deletes

The 15 casts in `server-manifest.ts`, and with them the `refuse`, `isRecord`, `onlyKeys`, `bound` and `schema`
closures of `admitManifest`, which become module level functions (section 2.1). The `noExcessiveLinesPerFunction`
suppression on `admitManifest`. The hand `WorkerJob`, `WorkerResult` and `ConnectorAnswer` types (`worker.ts:17-32`);
`WORKER_RESULT` in `sandbox.ts:9`; `PrepareResult` in `supervisor.ts:57-60`; `problemOf` in `http.ts:15`;
`serverManifestSchema`, `schemaSchema` and the `Schema` type in `boot-server.ts`; the local `ACCOUNT_ID` in
`installation-routes.ts:9`; the `error` wrapper in the `builder-run-operation.test.mjs` fake; the old
`sandbox-import-graph` list parser. 21 `biome-ignore ... debt` lines on this part's own JSON, plus 7 on the casts of
section 1.2. The eighth of those becomes an `exempt` line. The hand `SourceManifest`, `ServerManifest`, `ServerFile`
and `ValueSchema` types stay, because they are the types the guards assert.

## 7. Behavior changes and risks

- **The manifest is the one hand validator in a part that moves JSON to Zod.** The measured reason is in section 2.1.
  Its texts, its order of faults and its refusals are today's.
- **The Builder sees real runner codes.** After the `RUNNER_REFUSED` fix a refusal reaches the Builder as its own code:
  `INPUT_REFUSED`, `HANDLER_OUTPUT_REFUSED`, `HANDLER_FAILED` with `SQLSTATE nnnnn`, `HANDLER_CRASHED` and the rest of
  `DETAIL_SHOWN`. `RUNNER_REFUSED` stays only for a body with no valid code. Searched: `builder-skills/`,
  `apps/hub/src/builder/harness/prompt/` and the rest of the repository outside `node_modules`. No prompt or skill
  names `RUNNER_REFUSED`, so none needs an update. `builder-skills/conexus-sankhya/SKILL.md:104` already promises
  `INPUT_REFUSED` with an issue path, and the fix makes that line true for the first time.
- **A detail the worker writes is handler controlled text.** The handler can write the first line of fd 3, so any
  detail a worker line carries is a string the handler chose, and it may hold a company value. The platform therefore
  shows the Builder only details it wrote itself, or a SQLSTATE (section 2.7). Through `error.code` the handler can
  choose any five character code of `[0-9A-Z]`, which `sqlstateOnly` shows as `SQLSTATE <code>` (the worker prefixes
  `error.code` to the detail, `worker.ts:78-82`, so `throw {code: 'MARIA'}` shows `SQLSTATE MARIA`): about 26 bits per
  call, without fd 3. `HANDLER_CRASHED` carries an exit code the handler can also choose. HQ accepts this. It takes
  handler code written on purpose to leak, and the sandbox is the boundary. No narrowing now. The output keys are not a
  channel: an undeclared one is hidden (section 2.7). The Builder no longer sees the import
  error text of `HANDLER_LOAD_FAILED`.
- **`connectorAnswer` is a union on `ok`.** `{ok:false}` with no `code` is now refused as `CONNECTOR_UNCONFIGURED`. The
  Hub never sends it.
- **A package file of the wrong shape stops the runner at boot** (section 3), with `RUNNER_PACKAGE_JSON_INVALID`.
- **The check's boot stub is stricter** (section 2.5). A server manifest of `version` 2, or with an unknown key, was read
  by `boot-server.ts` before and now answers 404 `OPERATION_NOT_FOUND` for every operation. The build step before boot
  already refuses such a manifest, so the boot never sees one that the build admitted.
- **The installation administrator route** checks the id with the contract's `z.uuid()` (section 1.2). It refuses ids
  with a wrong version or variant digit, and it admits an uppercase id.
- **The check bundle imports `server-manifest.ts` into the build sandbox** (`check-import-law.mjs:15`). The file has no
  imports, so it bundles as before. `builder-check-server.test.mjs` and the browser check cover it, and the build
  proves it first.
- **Zod under the worker's `--permission` flag** is proven by test 3, and was measured on the real sandbox command.

## Decided by HQ after revision 3

1. **Nine suppressions with no named owner** (section 4.1): `builder/runtime.ts` 3 and `trace-summary.ts` 2 go to part
   1, `connectors/scope.ts` 1 to part 2, `google-ai-pro/credential.ts` 3 to part 5. Each owning builder gets them in its
   brief, so rule 3 reaches zero in S1.
2. **`process.getBuiltinModule` bypasses the import list** (`server-bundle.ts:40`). Not in this part. The sandbox is the
   boundary and the list is guidance. HQ reports it.
3. **Not traced:** whether the `MIGRATION_FAILED` detail (`supervisor.ts:191`) reaches the model as the cause of
   `APPLICATION_MIGRATION_FAILED` (`application-build.ts:118`). Migrate jobs run manifest SQL, not handler code. The
   builder checks it and applies the section 2.7 rule if it does.
