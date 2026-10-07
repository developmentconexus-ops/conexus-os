# 0019. One failure contract across the application runner and clients

**Date**: 2026-10-07  
**Status**: Proposed  
**Lane**: lane:qualification (Q-b: runner fd 3 and prepare HTTP failure formats change; Q-c: the final proof includes a real consumer and durable evidence)  
**Wave branch**: wave/error-model  
**Study**: The planning session's approved error-pattern study of 2026-10-06, including its census, reference review and industry review; the failure-table study of 2026-10-03 and code-health study §7. These read-only inputs remain outside this public repository.

## Summary

A refusal the caller handles has one typed result envelope. An escaping server failure keeps the native Mastra base; the browser and generated application share one received-failure type and one reader. The application runner stops transporting diagnostic text as a failure's identity, and a Builder that cannot open its sandbox receives a named platform failure.

The planning session approved splitting the model on 2026-10-07 after the minimum inventory exceeded 70 product files. This is **model wave 1**, the contract and application-runner/client path. **Model wave 2**, a separate spec written after this one, migrates the connector and check loaders, Git/run control signals, account/served-file refusals and vendor classifiers, and consolidates the log registries. The originally approved **sweep wave** follows both model waves: catches, unnamed `INTERNAL_UNEXPECTED` cases and table cleanup. This spec neither writes nor approves those later specs.

## Requirements

- **AC-1**: `@conexus/contract` exports the readonly `Result<T, E>` in [types.ts](shape/types.ts). `E.code` is a generated table code, narrowed by each operation. The previous operation-response alias named `Result` is deleted and its caller uses `Reply`.
- **AC-2**: Source and server manifest admission and server-tree admission return Results; no code is read from an exception message. Every current caller moves in the same unit. Existing grammar, bounds, first-violation order and confinement remain pinned. This absorbs [issue #549](https://github.com/developmentconexus-ops/conexus-os/issues/549).
- **AC-3**: Runner workers emit strict, table-backed `{ok:true,result}` or `{ok:false,error:{code}}` on fd 3. Preparation uses the same envelope. Worker, runner and Hub transport no `detail`, diagnostic, cause, stack or provider text to the person's application.
- **AC-4**: `failureResponse({code,traceId})` is the only Conexus HTTP failure-body writer. It returns a native `Response`; the Fastify bridge mirrors status and headers before sending. Runner, hosting and Mastra use that response without another code/status table or body assembler.
- **AC-5**: The web and generated application use one source for `ReceivedFailure`, `readFailure` and table text/action lookup. `HubFailure`, `ConexusError`, generated client's local `failure()` and both local fallbacks are deleted. The Mastra SDK caller branches on the reader's code, never `body.type`.
- **AC-6**: A failed production sandbox start ends its Builder turn with `BUILDER_SANDBOX_OPEN_FAILED`, one failure log and the row's person-facing text. The verification skill and Construir recipe name that code and observed behavior.
- **AC-7**: An AST census runs in required CI, forbids new legacy sites and lowers its recorded debt when sites disappear. Wave-owned obsolete APIs reach zero; later-wave debt cannot grow. Historic SQL migration counts cannot be mistaken for live callable raisers.
- **AC-8**: Units preserve the authorization wave's code, private reason and place of refusal. Every potentially overlapping product unit starts only after `wave/authorization-model` merges. The guide changes and process matrix below make the remaining model wave and sweep mechanical against the established contract.

## References copied

| ID / mechanism | Reference (`repository/file:line`) | Kept | Adaptation and reason |
| --- | --- | --- | --- |
| R1 / result envelope | Mastra, `packages/core/src/workflows/default.ts:464,494-512`; installed `@mastra/core/dist/workflows/default.d.ts:281-301` | Literal `ok`, successful `result`, failed `error`; a caller that decides gets data | `E` is a readonly operation-specific union whose `code` belongs to the table; no workflow framework is added |
| R2 / one table and text | Better Auth, `packages/core/src/utils/error-codes.ts:30-68`, `packages/core/src/error/codes.ts:17-73` | Closed code identity and text in the same owner | Conexus also generates category, status and action from its existing table; it does not copy per-throw status selection |
| R3 / distinct roles | Better Auth, `packages/core/src/error/index.ts:3-42`; Documenso, `packages/lib/errors/app-error.ts:184-240`; installed `@mastra/core/dist/error/index.d.ts:1` | Server fault and request/client representation have distinct jobs; native Mastra cause handling | Keep `Failure extends MastraError`; use Result for caller decisions and one `ReceivedFailure` for clients, without classes per module or per code |
| R4 / one response writer | PostgREST, `src/library/PostgREST/App.hs:162`, `src/library/PostgREST/Error.hs:82-101` | One response boundary maps machine identity to the wire | Native WHATWG `Response` replaces Conexus reply packets; Fastify's documented Response support needs the explicit status/header bridge |
| R5 / framework carriers | Installed Fastify `docs/Reference/Reply.md:817-842`; installed `@fastify/otel/index.js:470-485`; installed `@mastra/fastify/dist/index.js:407-446,505-511`; `@mastra/core/dist/server/types.d.ts:142-172` | Framework-owned sending and Mastra's custom HTTPException response | Fastify mirrors the Response; the synchronous Mastra validation hook returns `{status: response.status, body: response}`, not a second problem object |
| R6 / database identity | PostgREST, `src/library/PostgREST/Error.hs:541-600`; Supabase Auth, `internal/utilities/postgres.go:21-63` | SQLSTATE is the machine field | Keep Hub mapping by SQLSTATE plus constraint; SQL contains no application business rule or code-bearing MESSAGE. No migration is needed |
| R7 / one client reader | Documenso, `packages/lib/errors/app-error.ts:226-240,304-322`; Better Auth `docs/content/docs/concepts/client.mdx:359-376,423-459` | Validate a received representation, then branch on code | A single source generates web and app reader implementations, with audience-filtered table text; no server cause or free detail enters the client type |
| R8 / generated packaging | Existing `scripts/generate-failures.mjs:renderFailureTargets`, `apps/hub/compiler-template/generate-client.mjs:65-105` | Generation owns application support code, outside Project source | Generate reader code from one checked TypeScript source. Exact cross-target reader generation was not found in the reviewed clones; it is required because the generated app cannot import a Hub/web package |
| R9 / expected errors and defects | Effect's [expected errors](https://effect.website/docs/error-management/expected-errors/) and [unexpected errors](https://effect.website/docs/error-management/unexpected-errors/); Zod's [handling errors](https://zod.dev/basics#handling-errors); TypeScript [#13219](https://github.com/microsoft/TypeScript/issues/13219) | Typed branchable failures are distinct from escaping defects; TypeScript has no checked throws | A plain union provides this distinction without adding Effect or neverthrow |

The operator approved result A, SQL C, corrected HTTP A and the three roles A on 2026-10-07. One text and action per code remains the settled 2026-10-03 decision. The rationale records the alternatives and the HTTP probe.

## Code shape

The [shape](shape/) compiled with `npx tsc --noEmit -p docs/specs/0019-error-model/shape` on the pinned environment, including thirteen negative type checks. It is a design artifact, not product implementation. U8 deletes it.

- [types.ts](shape/types.ts): Result, manifest/tree refusals, worker and prepare code subsets, and the account-connection consumer signature.
- [operations.ts](shape/operations.ts): manifest overloads, tree admission and the runner's operations.
- [server.ts](shape/server.ts): native Failure, the single sender, logging and the concrete Fastify bridge.
- [client.ts](shape/client.ts): the received browser role and shared reader/formatters.
- [schemas.ts](shape/schemas.ts): the strict worker boundary, exhaustive over its nine current table codes.
- [usage.ts](shape/usage.ts): manifest route, generated client, Preview preparation and account connection.
- [negative.ts](shape/negative.ts): closed codes, operation narrowing, readonly and branch narrowing, and forbidden private wire fields.

The production generic Result is imported from the contract package; it is never redeclared in owners. Operation aliases such as `PrepareAnswer` describe payloads, not competing envelopes. JSON transports normalize a successful absent value to `null`; the in-process account signature can use `void`. Do not introduce a new Result library, factory hierarchy or compatibility alias.

**Model-account consumer contract:** `Promise<Result<void, Readonly<{code:'ACCOUNT_INACTIVE'|'ACCOUNT_NOT_FOUND'}>>>`. This spec does not implement or rename account operations or decide their authority. The separate model-accounts wave may import the shared Result once U3 exists; its own spec owns its inputs and permissions.

## Design

### Ownership and process boundaries

| Process / channel | Failure identity and role after this wave | Parser or writer | Remaining work |
| --- | --- | --- | --- |
| Hub internal code | `Failure extends MastraError` escapes; Results carry caller decisions in replaced operations | `platform/failure.ts`; generated `FailureCode` | Model wave 2 moves remaining branchable refusal classes; sweep names generic faults |
| Hub HTTP and hosted application API | RFC problem body from one Response: `type,title,status,code`, SYSTEM `traceId` when available | `http/problem.ts:failureResponse`; thin Fastify bridge | No alternate sender remains |
| Mastra mounted HTTP | Same Response inside HTTPException; schema failures carry the same Response as hook body | Native installed adapters | SDK-level log filtering and provider classification belong to model wave 2 |
| Runner HTTP prepare | Successful Result JSON; an expected refused preparation is the same Result JSON with code only; escaping faults use the single HTTP sender | Shared strict `PrepareAnswer` schema at runner/Hub boundary | No detail transport remains |
| Worker fd 3 | Strict WorkerAnswer, nine table-backed codes, code only on failure | `app-runner/wire.ts`; supervisor | No free string filter or thrown-text decoder remains |
| Connector socket / Builder tool | Existing broker response temporarily remains, because the complete replacing unit belongs to model wave 2 | Existing wire/broker definitions, ratcheted | Replace all producers, projections, handlers and retry signals together in model wave 2; no adapter introduced here |
| Check VM / child stdout | Existing check report and diagnostic codes temporarily remain | Existing `check/report.ts` and `outcome.ts`, ratcheted | Model wave 2 adds table rows for check refusals and replaces all producers/readers together; compiler diagnostic ids remain diagnostics |
| Generated application / web | One ReceivedFailure with `code,status,traceId`; one reader and one table lookup source | Generated browser module and application `failures.gen.ts` | No ConexusError/HubFailure or detail reader remains |
| PostgreSQL | Structural constraint errors are mapped by SQLSTATE plus constraint at the Hub boundary | Existing `platform/db.ts`; CI inspects final catalog definitions | No live application-coded RAISE exists; history remains immutable. A future explicit raise needs a unique table-owned SQLSTATE and its own approved migration |

Native lifecycle states (`FAILED`, `CRASHED`, cancellation, skipped work) are not automatically refusal Results. The census distinguishes persisted lifecycle state and external SDK protocol from application result envelopes. No wholesale rewrite of the 27 `failed/refused` discriminants is authorized here.

### Data and migration

No database migration, schema, authorization policy or dependency changes. Add one row in U3:

| Code | Category | HTTP | Audience | Message | Action |
| --- | --- | --- | --- | --- | --- |
| `BUILDER_SANDBOX_OPEN_FAILED` | SYSTEM | 500 | person | `O Conexus não conseguiu abrir o ambiente de código. O código do Projeto não mudou e a falha foi registrada.` | NONE |

Do not globally repair the 55 existing USER/5xx rows, three SYSTEM/4xx rows, shared messages or rows not found by literal searches; that is sweep work. The new row follows SYSTEM rules and offers no automatic retry. Generation may add audience support for the existing browser transport-failure rows and the existing `INTERNAL_UNEXPECTED` fallback to `person+app`; their wording, action and status stay table-owned. The reader uses that one fallback for unknown or non-person rows. A network failure uses the existing `HUB_UNREACHABLE` row, and an unreadable response uses `HUB_RESPONSE_UNREADABLE`; there are no new arbitrary `HTTP_nnn` codes.

### API surface and sourcing

| Operation | Input source | Output / refusal | Owner |
| --- | --- | --- | --- |
| `admitManifest(value, stage)` | Untrusted parsed source or artifact manifest; stage selected by caller | Result of SourceManifest or ServerManifest, `MANIFEST_REFUSED` with local location/diagnostic | Runner contract, shared with the check |
| `admitServerTree(files, sha256)` | Artifact's encoded files and caller's existing digest function | Result of ServerTree; `SERVER_TREE_REFUSED` or `MANIFEST_REFUSED` | Runner contract |
| Runner `prepare` | Current project/artifact files and existing divergence policy | PrepareAnswer of reset/applied list or the four declared codes | Supervisor and client |
| Runner `invoke` | Existing admitted artifact, operation/input, Caller and scoped connector socket | Native Response; 200 JSON on success, failureResponse on refusal | Supervisor and client |
| `failureResponse({code,traceId})` | Known table code and active trace's id, or null | Native Response with table status/content type/body | HTTP technical layer |
| `readFailure(response)` | Failed HTTP Response, including MastraClientError body normalized into a Response at the SDK boundary | ReceivedFailure; unreadable/unknown representation becomes table fallback | One browser source |
| Production `RunSandbox.start()` | Existing conversation sandbox instance | Same Promise<void>; a rejected SDK start is mapped once to sandbox-open Failure | Production conversation-sandbox boundary |

`Failure` is the only server exception role; it retains its native `id` and cause. `toFailure` passes Failure unchanged and maps a previously unnamed escape to `INTERNAL_UNEXPECTED`; broad discovery/naming belongs to the sweep. The sender accepts no Error, details or cause. `logFailure` remains the existing one responsible escape logger, with scalar platform fields and redacted cause metadata. A pure sender does not log. For an expected Result returned to its caller, log only when that failure is actually exposed or ends a run; forwarding the same failure does not write another failure line.

### Response and reader invariants

1. Status, code and category come from the generated row, never a local status table. `traceId` appears only for SYSTEM failures, never a supplied private reason. The public body has no person text; the client looks it up in the table.
2. A native Response is consumed once. The runner client validates non-success responses through the shared `Problem` declaration, whitelists fields and reissues them with failureResponse. It does not forward an untrusted body verbatim or preserve unknown extensions as application data. Server validation is not a second browser reader or client Error class.
3. Keep distinct successful HTTP bodies, content types, status and cancellation/concurrency limits. The invocation success is application JSON, not problem+json. Prepare success/failure Results use application/json; only escaping HTTP failures use problem+json.
4. The Fastify bridge performs `reply.code(response.status).headers(Object.fromEntries(response.headers)).send(response)`. Do not replace it with bare `reply.send(response)`: it produces a correct wire 404 but a Fastify request-span 200. Existing security headers remain in Reply.
5. For Mastra handler failures use `new HTTPException(response.status,{res:response})`. The installed adapter already mirrors its headers and status before sending bytes. Its synchronous validation hook can carry the same native Response as `body`; it must not await body parsing or reconstruct problem fields. Pin its actual adapter path before relying on this carrier.
6. The one browser source lives at `packages/contract/src/failure-client.ts`. It imports the Problem declaration and generated table. The generator emits the same implementation to `apps/web/src/app/failure.ts` and into `APP_FAILURES_SOURCE`; change imports and generated audience data only. No re-export facade or hand-maintained duplicate implementation. The web retains its meaningful formatter function names, while all HubFailure constructions move to ReceivedFailure's object constructor.
7. The generated app inlines the same Problem declaration and generated machine-code/status data, but only `person+app` text. The generator's drift check compares implementations and table output. No reflection on Error messages or reader-specific fallback literal. Error messages, cause and extensions returned by a server are ignored.
8. Manifest/tree diagnostics stay local to admission/check callers and may never enter failureResponse. Preparation and invocation diagnostics from the worker no longer reach logs as `failure.detail` or Builder operation tools as free text. Delete the old `DETAIL_SHOWN`, `sqlstateOnly`, string-code regex and `detail()` transports; do not reconstruct them from an Error message.

### Authorization sequencing

The published authorization shape was read from `origin/wave/authorization-model` at commit `0987494fb358b9c8491fae4476cbc16f05099393`. Its `shape/admission.ts` keeps `refuse({code,reason}):Failure`; its catalog owns which code a caller receives. Its new `PROJECT_DELETING` row is that wave's addition. This model accepts the resulting generated code, preserves its native Failure and keeps `reason` private. It does not turn an outsider into a different code or relocate admission.

The published 0018 index was also read at that revision: it explicitly keeps today’s Failure/catch representation and assigns the Result/failure model to 0019. Its changes to contract exports, generated failures and Mastra guards are shared paths, so those replacements are postponed below. U1 and U2 touch only tests/scripts/CI and can precede the authorization merge. **U3 through U7 start after `wave/authorization-model` merges**, in order. This deliberately postpones all product replacements, including the potentially shared generated tables, contract exports, manifest consumers, hosting and Builder mount. Before U3, reread the merged 0018 shape/index and compare the refusal contract. Stop and return any conflict to the planning session. Do not resolve a policy/type contradiction by changing authorization's decision.

### Test scenarios and deciding proof

| Scenario | Literal assertions | AC |
| --- | --- | --- |
| Admission rejects malformed source/server/tree | Exact returned code and first violation; no exception or text-prefix classifier; positive grammar/bounds unchanged | 1, 2 |
| Worker cannot load, export or serialize handler | Strict code-only WorkerAnswer; same mapped HTTP row; a synthetic private marker never appears in fd 3, runner response, Hub response or browser message | 3, 4 |
| Migration refused / history diverged | Exact declared code; no admitted Preview; divergence policy and reset window unchanged | 3 |
| Hub 404 / SYSTEM 500 / validation refusal | Wire status equals body status, onSend and exported request-span status; one code failure record; headers/CSP preserved; only SYSTEM has trace reference | 4 |
| Mounted Mastra handler and query/body/path validation | Same problem representation and correct delivered/onSend/span status through installed adapter; no provider body or duplicate failure line | 4, 8 |
| Generated application and web read the same failure | Literal row text/action and trace reference, recognized code, unknown/non-JSON/malformed body fallback, arbitrary detail ignored, network failure table row | 5 |
| Closed sandbox endpoint in the verification harness | A real queued Builder turn settles FAILED with sandbox-open code, null unopened sandbox id, unchanged source/Preview pointers, one failure line and row text in conversation/Stage | 6 |
| Authorization outsider / inactive account / forbidden action | Preserve merged authorization's exact code and private reason; neither appears as a free detail | 8 |
| Census anti-regression | A fixture adding each forbidden mechanism fails CI; deleting a baseline occurrence succeeds and cannot later restore it | 7 |

**Deciding proof on the built wave head:** use `conexus-prove` and the isolated verification skill for the closed-endpoint Builder scenario, and run an actual generated application against the real runner to observe one successful handler and one code-only failure through worker → runner → Hub → browser. Capture wire, UI, run/source/Preview records and redacted exported telemetry on the same head, with each AC's verdict. Use synthetic project data only. Tests/live may supply the scripted model and local sandbox and must name those replaced boundaries. A real E2B sandbox or real Builder/provider turn requires separate operator authorization through the planning session at proof time; this spec does not grant it. Qualification verdict belongs to the operator; no scope-stage spike is claimed as the built-wave proof.

## Deletes and census

Baseline rerun at main `83188b3ace3866fdd1918cfe7ce55ba167b3b3db` matched the earlier local run across all headline metrics. The scope is 424 production files; generated clients and migration history have separate inspections. Counts measure syntax, not moral classifications or live SQL behavior.

| Mechanism | Baseline | This wave's target / owner | Check |
| --- | ---: | --- | --- |
| Operation Reply exported as `Result` | 1 | 0, U3 | Contract typecheck and AST export check |
| Manifest/tree code-prefixed Error emitters | 2 functions | 0, U4 | AST target check plus behavioral admission tests |
| Runner `ADMISSION_ROW` / `admissionFailure` | 1 each | 0, U4 | AST identifier/call check |
| Worker failure code:string / detail, success:value | 1 schema | 0, U4 | Strict wire schema and negative fixtures |
| Prepare state/details refusal carrier | 1 schema | 0, U4 | Strict PrepareAnswer and consumers |
| `failureProblem` / `sendFailure` / `sendInternal` / `problemBody` | 4 exports/helpers; 6 body-writer callers | 0, U5 | AST banned exports/calls; one sender permitted |
| Hand-assembled/forwarded problem replies | 5 measured sites | 0, U5 | AST canonical-sender ownership plus HTTP tests |
| HubFailure / generated ConexusError | 1 each | 0, U6 | Source plus generated-template AST |
| Generated client `failure()` / Mastra `body.type` decoding | 1 each | 0, U6 | AST single-reader ownership plus browser tests |
| Runner-to-app free-detail transport | 4 hops | 0, U4–U6 | Synthetic marker behavioral test |
| Codes missing from table in replaced operations | 0 by Failure construction; worker's type was open | 0, U3–U6 | Generated unions, exhaustive schemas, typecheck |
| Other error classes outside Failure | 7 | No new unapproved roles; replaced browser role leaves the legacy set; remainder model wave 2 | Class-role inventory, canonical roles excluded from legacy debt |
| Noncanonical ok:false sites / shapes | 63 / 16 | Zero in migrated operation envelopes; remaining legacy sites only decrease | AST site inventory and type-aware classification |
| Other failed/refused discriminants | 27 | Classify lifecycle vs refusal, cap refusal debt; model wave 2 | Explicit occurrence inventory, no blanket rewrite |
| Direct message-based decisions | 5 | Delete runner admission and run-operation identity reading; cap remaining sites for model wave 2 | AST comparisons/regex checks, plus parseError import inventory |
| Hub throw new Error | 8 | No growth; sweep | AST ratchet |
| Catches / swallowing / empty | 251 / 126 / 18 | No new swallow/empty debt; sweep | AST ratchet with per-occurrence inventory |
| INTERNAL_UNEXPECTED / reason or invariant | 56 / 51 | Sandbox start gets its own row; no new debt; sweep | AST ratchet |
| Historic SQL RAISE / distinct message codes / absent from table | 278 / 73 / 44 | History immutable; no new application-coded RAISE; active catalog separately checked | New migration check plus final-definition inventory |
| Parallel log registries | 2 beside table | No growth; remove both in model wave 2 | AST/generator inventory |
| Rows not named / USER 5xx / SYSTEM 4xx | 23 / 55 / 3 | No new debt; sweep decides removals from reachability evidence | Table check and generated-code inventory |

U2 implements `scripts/census-error-model.mjs` and a versioned `contracts/technical/error-model-census.json`. Reimplement the study's metrics using the TypeScript AST; do not copy the private study script or its paths. The check emits counts and occurrences as JSON and accepts `--check` and `--record-decreases`. Required CI invokes `--check` through `scripts/conexus-verify.mjs`. `--record-decreases` rejects every increase in a legacy-debt metric, every new forbidden occurrence and removal of a zero-target rule; it never blesses a new exception. Raw totals such as all 251 catches are informational, not a ban on legitimate boundary handlers. Ratchet the swallowing/empty catch occurrence sets; structurally classify cause-preserving vendor mappings, rethrows and responsible logging as valid handlers. A new handler must satisfy that same AST rule, not receive a path-specific exemption. U7’s native-Failure-preserving sandbox mapper is a valid boundary handler; adding it may increase the informational catch total but cannot increase swallowing/empty debt. CI also requires the committed inventory to equal the current inventory, so a disappeared site is ratcheted in the same commit. Compare occurrence sets per mechanism and path, not only totals: moving a bad catch or adding one while deleting another fails. Identify an occurrence by owner/function and normalized AST context rather than line number. Fail ambiguous duplicate identities rather than dropping them. Tests exercise this on synthetic fixtures, not production-text assertions.

Canonical Result definitions and code-specific payload aliases do not count as legacy shapes. Returned external SDK schemas and persisted lifecycle states are classified in the inventory with their owner and reason. Freeze those classifications; a new exclusion needs the planning session's scope decision. Generate process-level table checks from actual production code and schemas. Scan generated app source and compiler templates as well as normal source; do not let the study's generated-file exclusion hide ConexusError or an invented code. For SQL, replay definitions from immutable migration history against the committed catalog snapshot; currently four live functions and no application raisers/triggers were found. The authorization wave may remove structural helpers; accept disappearance, never resurrect historical code-bearing functions.

## Units

Every card is a standalone build contract. A fresh Codex session reads its card, the Design subsections it cites, the named shape files, the listed guides and `conexus-build`. It does not need the private study or rationale. Each unit updates only its reached census targets, runs its named behavior tests and `npm run verify:quick`, and ends in a green commit. A later unit is never a prerequisite.

### U1. Pin the replaced surfaces on main

- **Already there**: main baseline above, current wire/admission/HTTP/browser modules and existing tests listed below. No new product types are needed.
- **Creates**: behavior pins in `tests/implementation/error-model-admission.test.mjs`, `error-model-worker.test.mjs`, `error-model-http.network.test.mjs`, `error-model-reader.test.mjs`, `error-model-sandbox-start.test.mjs` and shared fixture helpers if needed. Register a network suffix with the Medium group if the current discovery does not recognize it. Read Design/Test scenarios, Response invariants and process matrix.
- **Satisfies**: AC-2–AC-6, AC-8's baseline.
- **Files**: tests and their group discovery only; no product, guides, other specs or census-baseline edits. Reuse existing `application-runner-*`, `builder-server-manifest-*`, `builder-client-generator*`, `builder-application-starter*`, `failures` and `application-host*` tests where they already pin behavior; locate them by those names before adding duplicates.
- **Copies**: R1, R4–R8.
- **Guides**: C §5–§6; T test size, semantic assertions and integration boundaries; H failure body; S §7.
- **Deletes**: no product mechanism yet.
- **Proof**: green on unmodified main. Pin source/server grammar limits and first violation; worker-to-browser code and current success payload; migration refusal/divergence/no reset; Hub/Mastra 404/500/validation headers, log count and request-span status; browser table text/action; sandbox-start lifecycle and unchanged pointers. Current unsafe detail exposure is an observed fixture of the old format, not an assertion that it is allowed in the target. Mark its removal assertions for U4–U6. The sandbox pin asserts today's generic code, then U7 updates the expected code; do not require the new code to pass on main. Run genuine sockets in Medium; no Small test writes files or opens a socket.
- **Out of scope**: real E2B/provider calls, changing current outcomes, broad catch characterization.
- **Stop if**: the baseline behavior disagrees with an authority document or a listed surface cannot be pinned without building product code; return the exact discrepancy.

### U2. Turn the census into a monotone CI check

- **Already there**: U1 pins and the numeric baseline in Deletes and census; existing TypeScript AST scripts and `scripts/conexus-verify.mjs`.
- **Creates**: census script, debt inventory and CI registration described in Deletes and census. Read that section in full and the process matrix. All baseline metrics must be independently rerun, not transcribed as assumed results.
- **Satisfies**: AC-7, AC-8.
- **Files**: `scripts/census-error-model.mjs`, `contracts/technical/error-model-census.json`, `scripts/conexus-verify.mjs`, `tests/repository/census-error-model.test.mjs`; package.json only if a named script is required. No runtime source or guide changes.
- **Copies**: R2's closed ownership; existing `scripts/census-builder-run.mjs` monotone recording. Exact multi-process debt checker not found in reviewed clones; this check is the necessary anti-regression lever.
- **Guides**: C §5–§6; T repository checks; L required CI.
- **Deletes**: no frozen baseline sites; reject added debt without exemptions.
- **Proof**: fixture tests for each metric, same-count site substitution, moved site, duplicate identity, legitimate lifecycle, generated code and new migration RAISE. Forbidden-debt addition fails; deletion without recording fails; recorded deletion passes; restoring it fails. A new cause-preserving vendor mapper passes the structural valid-handler rule; an empty or swallowing catch fails even when a different debt site disappears. `--check`, `npm run verify:quick`. All baseline debt targets unchanged; informational totals are reported separately. Wave-owned bans become enforced when their replacing unit lands.
- **Out of scope**: classifying/fixing every catch, changing product behavior, copying private census code into the repository.
- **Stop if**: reproducing a baseline number requires excluding a named production/template path or the counter cannot distinguish lifecycle state from a refusal.

### U3. Publish Result and the sandbox row

**Starts after `wave/authorization-model` merges.**

- **Already there**: U2 check, merged 0018 refusal contract, current failure generator/table and contract package. Read Code shape, Data and migration, Authorization sequencing and Response invariants 1/7.
- **Creates**: `packages/contract/src/result.ts`, exported by index; the new sandbox row and regenerated table outputs. The export is exactly the generic in shape/types.ts with production FailureCode, not the temporary union. Preserve Failure's native base and current logFailure API.
- **Satisfies**: AC-1, AC-6's row, AC-7, AC-8.
- **Files**: `packages/contract/src/result.ts`, `index.ts`, `operation.ts`, `failures.generated.ts`; `contracts/technical/failures.json`; `apps/hub/src/platform/failures.generated.ts`, `failure-text.generated.ts`, `apps/hub/src/generated/app-failures.ts`; `apps/hub/src/telemetry/log-codes.generated.ts`, `contracts/api/product/openapi.json`, `contracts/api/technical/openapi.yaml` when regenerated declarations change their output; `scripts/generate-failures.mjs`; `apps/web/src/app/http.ts`; relevant contract/generator tests. Do not change account operations.
- **Copies**: R1–R3, R9.
- **Guides**: C §5–§6; H contract first/failure body; D §5; S §7.
- **Deletes**: operation.ts's `Result<O> = Reply<O>` alias; migrate its web caller to Reply in this unit. No old/new Result exports coexist.
- **Proof**: production type tests reject unknown code, flat error, old success value, wrong operation code and access before narrowing; void account-consumer signature compiles; generation drift check; alias count 1→0; no new table inconsistency. `npm run verify:quick` and contract/web typecheck.
- **Out of scope**: account APIs, renaming current stable failure codes, eleven check rows, log-registry merge, category/table sweep.
- **Stop if**: merged authorization's refusal code/reason contract conflicts with Result/Failure or a new row duplicates an existing row for exactly sandbox start.

### U4. Replace the runner's admission and wire formats

**Starts after `wave/authorization-model` merges and U3 is green.**

- **Already there**: U3 Result and FailureCode, U1 pins, U2 ratchet; existing manifest types, Caller, data-plane and worker isolation. Read shape/types.ts, operations.ts, schemas.ts; Design/Ownership, API surface and Response invariants 2/3/8.
- **Creates**: total manifest/tree Result admission (recursive checks return the first typed refusal); strict WorkerAnswer and PrepareAnswer schemas; all direct producers/consumers move together. Unknown/malformed worker output is WORKER_JOB_REFUSED at its parsing boundary, not a free string mapped by a filter. Worker success stays JSON, with absent values normalized to null.
- **Satisfies**: AC-1–AC-3, AC-7, AC-8.
- **Files**: `apps/hub/src/app-runner/server-manifest.ts`, `wire.ts`, `worker.ts`, `sandbox.ts`, `supervisor.ts`, `module.ts`, `http.ts`; `apps/hub/src/builder/run-operation.ts`, `application-build.ts`; `apps/hub/src/builder/check/steps/generate.ts`, `server-bundle.ts`, `boot-server.ts`; associated pins/contract tests and census inventory. Those check files consume manifest Results directly but keep their existing whole-check protocol until model wave 2.
- **Copies**: R1–R3; shared existing manifest grammar is the pin, not a new reference framework.
- **Guides**: C §5–§6; H failures/boundaries; D app migration integrity; S confinement/§7; T.
- **Deletes**: `refuseManifest`, `refuseTree`, throwing assert-admission helpers, ADMISSION_ROW, admissionFailure; WorkerResult's old envelope/name and worker detail serializer; prepareResult's state/detail envelope/name; `workerCodeOf` filter and workerCode fallback vocabulary; all old `.value/.code/.detail/.state` reads of these answers. Use WorkerAnswer/PrepareAnswer. Do not keep adapters that recreate old envelopes. Existing check Refused and broker ConnectorAnswer are untouched debt owned by model wave 2.
- **Proof**: pins updated to literal new Results; exact first violation/order/limits unchanged; each nine-worker-code variant accepted, unknown/private-text/extra-field forms rejected. Migration history/refusal preserves reset policy. Synthetic marker absent from fd 3 and prepare response. Runner admission classifiers and old wire schemas reach zero. Build worker/check bundles and test consumers, `--record-decreases`, `--check`, `npm run verify:quick`.
- **Out of scope**: new migration/reset rules; check Outcome rewrite; connector socket format; native lifecycle states; sweeping unrelated catches or faults.
- **Stop if**: confinement/worker staging cannot import the generated code/schema dependencies or a Result conversion needs a throw-as-control-flow shim. Resolve packaging by the existing build bundle, not mounting additional host authority.

### U5. Replace every HTTP failure carrier with the single Response

**Starts after `wave/authorization-model` merges and U4 is green.**

- **Already there**: U3 table/Result, U4 runner contracts, existing Failure/logFailure/Problem, pinned native framework versions. Read shape/server.ts and operations.ts; all Response invariants, Authorization sequencing and HTTP scenarios.
- **Creates**: failureResponse and sendFailureResponse in the HTTP technical layer; native Response result for supervisor invoke, Hub runner invoke and application invoker; validated forwarding with original code and trace reference. Successful JSON responses remain successful JSON. The sync Mastra validation carrier puts Response in body; HTTPException receives the same Response. Log at the responsible escape or first exposure, never in sender/forwarder. In runner HTTP, invalid requests, escaping faults and a non-success invoke response each get one logFailure from the runner route; keep the RUNNER_INVOKE lifecycle event distinct. Hub module/hosting forwarders do not log that already-exposed failure again. Hub’s top-level handler and the Mastra guard/validation boundary own their locally born failures; pin their existing SDK duplicate suppression. Builder terminal settlement retains its current responsible logger.
- **Satisfies**: AC-3, AC-4, AC-7, AC-8.
- **Files**: `apps/hub/src/http/problem.ts`, `app.ts`; `apps/hub/src/app-runner/http.ts`, `module.ts`, `supervisor.ts`; `apps/hub/src/hosting/application-invoker.ts`, `application-host-routes.ts`, `preview-routes.ts`; `apps/hub/src/builder/mastra-session-routes.ts`, `run-operation.ts`; corresponding HTTP/hosting/runner/Mastra tests and census. No admission policy, database or global telemetry redesign.
- **Copies**: R4–R6; installed adapter lines in R5 are part of the build contract.
- **Guides**: C §6; H failure body; S security headers and §7; A native adapters; T integration tests.
- **Deletes**: failureProblem, sendFailure, problemBody, sendInternal, causeText, local refusal body builders, hand-built/forwarded problem replies, DETAIL_SHOWN/sqlstateOnly and free-detail code regex in run-operation. Every caller uses the new sender/Response or shared Problem validation. The existing operation tool's whole-report envelope waits for model wave 2; its HTTP reader carries table code only now.
- **Proof**: actual Hub error handler and telemetry through real Medium HTTP socket: literal 404 in wire/onSend/request-span; one PROJECT_NOT_FOUND log; same security headers and CSP. SYSTEM 500 trace reference; validation row code/status. Mounted Mastra handler and all validation contexts use the same body/status/content type and one failure log. Runner→Hub forwarding strips a private marker and unknown fields; 200 JSON handler result intact. Six old body-writer callers and five hand-reply sites reach zero; `npm run verify:quick`.
- **Out of scope**: ConsoleLogger replacement, retry policy, replacing all local operation-report shapes, authorization's choice of refusal, application transport limits.
- **Stop if**: the installed Mastra hook does not deliver its Response body correctly, a hook/span observes 200 for a refusal, or the same failure emits another failure line. Return actual runtime evidence; do not silently switch the approved carrier.

### U6. Generate the shared browser failure reader and migrate its callers

**Starts after `wave/authorization-model` merges and U5 is green.**

- **Already there**: U3 generated table, U5 sender, current Problem Zod declaration and generator, U1 reader/client pins. Read shape/client.ts and usage.ts; Response invariants 6/7 and reader scenarios.
- **Creates**: canonical `packages/contract/src/failure-client.ts`; checked generation of web app/failure.ts and generated application failures source from it. Inline the canonical Problem declaration for the generated app; do not add another parser. Generated api calls await readFailure on a non-success Response and throw the returned ReceivedFailure. Normalize a MastraClientError's body/status into a native Response at that SDK boundary and call the same reader; branch on TOOL_ANSWER_ALREADY_GIVEN/QUESTION_ENDED codes. Meaningful formatters retain names and signatures.
- **Satisfies**: AC-5, AC-7, AC-8.
- **Files**: `packages/contract/src/failure-client.ts`; `scripts/generate-failures.mjs`; `apps/hub/src/generated/app-failures.ts`; `apps/hub/compiler-template/generate-client.mjs`; `apps/hub/starter-template/files/app/src/lib/errors.ts` (delete), `apps/hub/starter-template/README.md`; `apps/web/src/app/failure.ts`, `http.ts`, `foreign.ts`, `route-params.ts`, `attempt-key.ts`; `apps/web/src/features/identity-access/api.ts`, `entry/entry-screens.tsx`, `connector/connector-api.ts`, `builder/mastra-session.ts`; `builder-skills/conexus-app/SKILL.md`, `builder-skills/conexus-server/SKILL.md`; `builder-skills/conexus-app/references/form.tsx`, `list.tsx`, `record.tsx`, `dashboard.tsx`; generator/starter/browser tests and census. No new model-account product behavior.
- **Copies**: R2, R3, R7, R8.
- **Guides**: C §5–§6; H validated response; V failure text/action; A generated stack/ownership; S §7; T.
- **Deletes**: HubFailure, ConexusError, compiler ERROR_AND_CALL's local failure decoder, failureMessage and independent fallback literals, starter errorMessage/connectionMessage wrappers and any now-unused imports. Migrate all four shipped Builder examples to `failureText(error)` and `failureCodeText(data.failure)` from `@/conexus/failures.gen`; update both Builder skills to teach those generated exports and ReceivedFailure, removing their ConexusError/lib/errors instructions. All constructor/reader callers move in this commit. No aliases with old class names, optional legacy detail or hand-duplicated formatter implementation.
- **Proof**: generated web/app code compiles against its own dependencies; both consume literal NOT_FOUND and SYSTEM failures and produce exact table text/action/reference. Unknown code, wrong content type, malformed JSON and non-person row fallback tests; injected detail/cause marker never reaches message; network error uses table row. Attempt-key 4xx handling and pending-question outcomes unchanged. Generator drift fails after editing either emitted implementation. Compile all four shipped examples in a synthetic generated application and assert that both skills reference the generated exports, with no old class/helper/import remaining. All named old client roles/decoders zero; `npm run verify:quick` and web/template build.
- **Out of scope**: rewriting generated Project screens, changing stable text/action, browser catch sweep, model-account APIs.
- **Stop if**: single-source generation requires a second parser implementation, app text contains operator-only rows, or a canonical import brings Hub/Node/secret access into the browser.

### U7. Name sandbox-start failure and update its guides and recipe

**Starts after `wave/authorization-model` merges and U6 is green.**

- **Already there**: U3 sandbox row, U5 sender and logs, U6 reader; production `e2bConversationSandboxes` and the verify harness's closed endpoint. Read Data and migration, sandbox scenario, deciding proof and Guide changes.
- **Creates**: map only a rejection of the production sandbox start to `new Failure('BUILDER_SANDBOX_OPEN_FAILED',{cause})` at `conversation-sandboxes.ts:start`; existing Failure is rethrown unchanged where it already names a specific failure. The run's current failure settlement carries that code. Cancellation and faults after start keep their existing meanings. Add no retry or second log.
- **Satisfies**: AC-6–AC-8.
- **Files**: `apps/hub/src/builder/conversation-sandboxes.ts`; `docs/development/codebase-principles.md`, `docs/product/wire-contract.md`, `docs/reference/database.md`, `docs/development/testing.md`; `.agents/skills/verify/SKILL.md`, `.agents/skills/verify/features/construir.md`; sandbox/live tests, census inventory. `run/checkout.ts` is a read dependency, not an authorized edit unless the pin proves start is bypassed; such a discovery stops the unit.
- **Copies**: R3, R9; native sandbox adapter boundary already exists.
- **Guides**: C §6; H failure body; D §5; T test sizes/proof; S §7; V failure surfaces.
- **Deletes**: generic classification of this specific production start rejection, outdated sandbox-start code/text/log claims in the verification skill/recipe. Replace only factual recipe text, not new authority or endpoints.
- **Proof**: unit pin asserts exact Failure id and preserved cause from rejecting start; no blanket classifier around checkout/preparation. In isolated verify, send a message with E2B deliberately closed: DB FAILED/new code/null unopened id, same source and Preview pointers, one redacted failure line; conversation note and Stage show literal row text and no automatic retry. Update recipe from actual observations, not old BUILDER_PREPARATION_FAILED text. `npm run verify:quick`. A real E2B call still requires operator authorization.
- **Out of scope**: keepalive message matching, sandbox lifecycle administration, teardown/retry changes, shared daemon, unrelated INTERNAL_UNEXPECTED cases.
- **Stop if**: the cause is after sandbox startup, the run writes a different code, or proving this requires real E2B without authorization.

### U8. Close the contract, ratchet targets and remove shape

- **Already there**: green U1–U7 and all named product contracts. Read every AC, process matrix, census, Non-goals and deciding proof; no later unit is needed.
- **Creates**: final contract-consumer tests and zero-target checks for replaced APIs, an executable proof recipe tied to the built wave head and ACs. The planning session schedules `conexus-prove` on that head after this unit; this unit does not replace independent proof or claim acceptance.
- **Satisfies**: AC-1–AC-8.
- **Files**: tests/CI/census only, this spec's shape deletion and a proof report under `docs/evidence` when the prove stage actually runs. No runtime or other-spec edits.
- **Copies**: R1–R9 as already implemented; no new mechanism.
- **Guides**: L wave/proof gate; T consumer tests; C §6; H; S §7.
- **Deletes**: all `docs/specs/0019-error-model/shape/`; any test-only legacy import or fixture that now relies on an old API. Production modules own the shape afterward.
- **Proof**: compile a real manifest caller, generated application client and account-connection Result consumer against actual exported declarations. Census all this-wave zero targets and unchanged/decreased later-wave caps; generator drift, contract/web/Hub/template builds, pins and `npm run verify:quick`. The final qualification proof and whole-wave independent review must pass on the same head before the draft wave is made ready.
- **Out of scope**: model wave 2 or sweep implementation, declaration of wave completion before proof, merging main.
- **Stop if**: a replaced legacy name remains reachable, a consumer needs a compatibility alias, any AC lacks behavioral evidence, or a zero-target check was relaxed.

## Guide changes (edited by U7, not by this spec stage)

Replace C §6's model rule with: **A caller-handled refusal returns the shared readonly Result with a table-backed operation-specific error; an escaping server failure throws native Failure, clients use the single ReceivedFailure reader, and foreign errors are mapped once at their boundary by machine fields while private diagnostics stay out of the public response.** Keep one text/action per table code and one responsible failure log. State explicitly that canonical roles are about ownership, not a ban on native SDK Error classes.

Add to H's failure rule: **The sole failureResponse returns a native Response from the table; adapters mirror its status and headers, and the shared reader accepts the validated machine code and trace reference without transporting detail, cause, stack or provider text.** Document the runner Result formats and changed boundary; the remaining broker/check shapes are named departures until model wave 2.

Clarify D §5: **SQL enforces structural constraints only, the Hub maps SQLSTATE plus constraint, and any future explicit application failure raise requires a unique table-owned SQLSTATE, never a business rule or application-code MESSAGE.** Historical migrations are not edited.

Clarify T: **Failure-contract tests assert literal Result/wire/UI outcomes and exported telemetry through the actual adapters; AST census and generator drift are structural CI checks, while sockets/processes/browser/filesystem behavior runs in the appropriate Medium or Large group.**

The guides describe the target and cite the census's bounded remaining departures; they do not imply the deferred wave already ran. Update both verify SKILL.md's boundary description and Construir's Turn outcome, Run record and Gotchas from the new observation.

## Product-file budget

This wave has **42 planned runtime/template/table/generated-output paths**, including generated outputs and deletion of the starter wrapper, plus six shipped Builder examples/instruction files and its new census record (**49 product paths conservatively counted**, including three reserved generated artifacts). Count the three planned scripts (`scripts/census-error-model.mjs`, `scripts/conexus-verify.mjs`, `scripts/generate-failures.mjs`) and the optional `package.json` change against the cap too: **53 planned product/check/configuration paths** in total. Behavioral tests, Markdown guides and this spec are outside that count. The bounded 49-path product set is the union of U3–U7 product Files plus `contracts/technical/error-model-census.json`, with the four script/configuration paths listed above also budgeted; repeated paths count once. Existing `platform/failure.ts`, `http/access.ts`, registry and account files are read dependencies and do not require edits here. Stop rather than silently extend that set. In all cases the standing hard cap remains 70 product files and eight units.

## Non-goals

- **Model wave 2**: the complete connector/token-cache/projection/handler socket migration; check Outcomes, step subprocesses and report; GitCommandError, RowEnded, CandidateRefused and check Refused; account/served-file Results; Mastra provider/retry classifiers and E2B keepalive classifier; merge/delete `log-events.json`, regex-mined LOG_CODES and other parallel code registries. Each replacing unit must migrate all callers and delete its old functions and naming; no bridge back to a legacy shape is introduced by this wave.
- **The sweep wave**: classification and codemod of the catch blocks, generic INTERNAL_UNEXPECTED cases, table liveness/category/message cleanup and remaining throw-as-refusal call sites. It uses the two model waves' Result, native Failure, sender, reader and ratchet; it does not redesign them. Native lifecycle state or compiler diagnostic ids are never codemodded into failure codes merely because they contain failed/code.
- Database migrations, authorization/product-policy changes, new dependencies, global telemetry redesign (spec 0007 owns that), real provider/E2B use in this spec stage, and implementation of any product unit before the operator's approval line.

## What breaks the premise

- Mastra/Fastify cannot carry the single Response with correct observable status/headers/log count; the native-carrier probe and U1/U5 actual-adapter tests decide this.
- Worker/check packaging would mount host credentials or authority to share the contract; U4 bundle inspection and confinement pins decide this.
- Authorization's merged refusal contract requires a different result/failure meaning; U3 compares its approved shape and stops instead of choosing.
- A model-wave split still requires a compatibility layer or a later-wave type to make a replacing unit green; unit-by-unit compile and consumer tests decide this.
- The generated client cannot use the same reader with its fixed dependencies and audience data; U6 generated builds decide this.

## Stop rule

Stop and return to the planning session if a card cannot end green without changing an approved decision, a premise is disproved, a policy conflict appears, the product-path inventory grows without a bounded update, or the wave exceeds 70 product files/eight units. Approval of this proposed spec, recorded by the planning session on a commit, is the only build gate.
