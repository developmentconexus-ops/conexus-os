# 0019. A typed failure path from the runner to its clients

**Date**: 2026-10-07

**Status**: Approved by the operator on 2026-10-07, commit 75423cc3c3027702b6da31001b560e8d46077149

**Lane**: lane:qualification (Q-b: process/wire format; Q-c: real consumer proof)

**Wave branch**: wave/error-model

**Study**: The private error-model-respec study of 2026-10-07, sections 1–10, held by the planning session. Its public evidence and decisions are reproduced in [rationale.md](rationale.md).

## Summary

A caller that handles a refusal receives a plain typed result. The runner keeps only the safe repair facts the Builder needs on its existing private channel; the public HTTP boundary writes a table-owned code and validated trace reference. The web imports one browser reader from the existing contract package, and the standalone app receives that reader by generation. This removes message decoding, public diagnostic text and duplicate readers without a Result library, new channel or general error-analysis engine.

The operator approved the study's bounded scope and end condition on 2026-10-07, then the private Result carrier on the existing runner channel. The operator also approved final Hub exposure/Builder settlement as the one log owner for propagated native runner faults, retaining their cause in a redacted native span with existing unix trace propagation. These answers do not approve this spec or authorize product builds. No recorded-failure role is introduced. The previous unsupported approval is withdrawn. This is model wave 1; the roadmap owns any later migration or sweep.

## Requirements

- **AC-1**: The existing contract package exports one readonly `Result<T,E>` with an operation-specific, table-backed `E.code`. The old `Result=Reply` alias is deleted; operation responses retain `Reply`.
- **AC-2**: Manifest and tree admission return Results without message-based identity. Every direct caller moves together. Grammar, limits and first-violation order remain unchanged.
- **AC-3**: Worker, private invoke and prepare use strict Results. The Builder retains structured schema violation, missing export, crash, migration and validated SQLSTATE facts where relevant; the public application receives none of these or arbitrary diagnostic text. Confinement, reset, applied migrations, divergence and cancellation behavior hold.
- **AC-4**: One `failureResponse({code,traceId})` creates public failure bodies. Native adapters preserve table status/content type/security headers, request trace and one responsible failure log. No public sender accepts private facts.
- **AC-5**: Web and generated app use the same reader source, closed Problem schema and table text/action. Unknown/malformed bodies and trace markers fail closed; transport rejection maps to HUB_UNREACHABLE and genuine abort retains its identity. All current constructors and formatters move.
- **AC-6**: Only a failed production sandbox start maps to BUILDER_SANDBOX_OPEN_FAILED. The run ends once with its table text and cause retained internally, without changing source/Preview or retrying.
- **AC-7**: A small rerunnable named-mechanism check runs in required CI. Replaced APIs reach zero; strict-wire fixtures and generation drift prevent regression. It makes no claims about all catches or SQL migration history.
- **AC-8**: Authorization refusal identity/authority and existing product behavior remain unchanged. The wave ends with actual exported-contract consumers, generated builds, runtime evidence for AC-2–AC-6, zero census targets and shape deletion; independent prove/review runs on that built head.

## References copied

Reference keys identify exact revisions in rationale. A reference supports a mechanism, not the authority of Conexus product rules.

| ID / mechanism | Reference (`repository/file:line`, revision in rationale) | Kept | Adaptation and reason |
| --- | --- | --- | --- |
| R1 / handled Result | M `packages/core/src/workflows/default.ts:458-517`; installed core 1.71.0 `dist/workflows/default.d.ts:281-301` | `ok/result/error`, branchable decision | Readonly operation-specific table code; type-only export, no combinators or framework |
| R2 / code and text owner | B `packages/core/src/utils/error-codes.ts:30-68` | Code/text in one owner | Existing Conexus table also owns status/category/action/audience |
| R3 / distinct exception roles and diagnosis | B `packages/core/src/error/index.ts:3-42`; D `packages/lib/errors/app-error.ts:184-245,304-322`; M `default.ts:469-510` | Native escaping Error and reconstructed received role; diagnosis retained internally | Keep native Failure, one ReceivedFailure; public representation excludes private facts |
| R4 / public response | P `src/library/PostgREST/Error.hs:84-101` | Central response mapping | Native Response at actual HTTP exposure; private Results are not public Problems |
| R5 / native carriers | Fastify 5.12.1 `docs/Reference/Reply.md:817-842`; otel 0.21.0 `index.js:472-484`; Mastra fastify 1.5.15 `dist/index.js:407-446,505-508`; core 1.71.0 `dist/server/types.d.ts:142-172` | Native extension points | Mirror Reply status/headers; synchronous validation returns `{status: response.status, body: response}`; HTTPException uses customResponse |
| R6 / database identity | P `Error.hs:541-600`; SA `internal/utilities/postgres.go:12-75` | SQLSTATE as machine field | Existing Hub SQLSTATE+constraint mapping; no business-rule SQL or new MESSAGE protocol |
| R7 / parser boundary | Zod 4.6.5 `v4/core/parse.js:41-58`; D `app-error.ts:304-318` | Parse unknown at crossing, reconstruct client role | Closed table code, strict private variants, validated trace; reject D's permissive unknown handling |
| R8 / packaging and checks | Exact external reader emitter/census not found in inspected B/D/M/Factory mechanisms | Ordinary package ownership; local failure generation and builder census | Direct web import; app-only emission; objective named removals. Required by A §2/§5/§8 and C §10/§11, not an external universal engine |
| R9 / start mapper | Exact Conexus row not found in inspected references | Native Error cause, existing sandbox adapter | Narrow mapper for the roadmap's observed defect; C §6/A §6/P §5, no retry |

The exact private fact schema and existing manifest grammar have no inspected external equivalent. They adapt R1/R3/R7 to the current product's repair consumer and C §5; neither introduces a general validator or diagnostic service.

## Code shape

The temporary compiled `shape/` held the target contract during the build. It was deleted after U1–U7 made production its owner; the concepts below describe the resulting production contract.

- Types: Result, closed code subsets, private fact variants, account-consumer signature.
- Operations: admission and runner operations using existing input types.
- Schemas: strict worker/private answers and validated public trace/code.
- Server: native Failure, public Response writer/bridge and native runner exception event.
- Client: received Error and current useful formatter signatures.
- Usage: actual admission, public projection, private repair, fetch, native runner escape/prepare/invoke/release and named-fault forwarding call sites.
- Negative: unknown/flat/wrong-operation codes, mutability, old envelope, private/public field separation and branded boundary values must not compile.

## Design

### Data, ownership and sequencing

No database migration or new dependency. `contracts/technical/failures.json` remains the code/text/status/action/category/audience owner. U3 adds one SYSTEM, person-facing BUILDER_SANDBOX_OPEN_FAILED row (HTTP 503, action NONE) and generated outputs. Proposed person text: “O ambiente de código não abriu. A falha foi registrada.” The operator may revise that text at this spec gate. Existing rows are not reclassified here.

`packages/contract/src/result.ts` is type-only. Existing `Failure extends MastraError`, `toFailure`, redacting exporters and table generation remain. The browser-only `failure-client.ts` owns ReceivedFailure and reader/formatters; it must import no Hub, Node or secret-bearing module. Web imports its exports through `@conexus/contract`; only standalone app support is emitted, with app-audience table text. No generated web module or second parser.

U1 is existing characterization, not target compliance. U2 uses only current code. Before U3–U7 start, authorization must be merged and this spec genuinely approved: reread its actual merged contract and guards, including code/private reason/refusal location. The inspected 0018 draft at `0987494fb358b9c8491fae4476cbc16f05099393`, `shape/admission.ts`, has `refuse({code,reason}):Failure`; that is an interface observation, not upstream approval. No other spec is edited here.

### API surface and value sourcing

| Operation / owner | Input | Output / refusals | Value source |
| --- | --- | --- | --- |
| admitManifest / runner manifest owner | unknown, source/server stage | Result of existing manifest type, MANIFEST_REFUSED with local where/diagnostic | Existing first-error grammar; no exception-text decoder |
| admitServerTree / same owner | files and SHA-256 function | Result of ServerTree, tree/manifest refusal | Existing name/digest/manifest checks |
| worker fd 3 / wire owner | Existing WorkerJob/Caller | WorkerAnswer; exactly nine codes in shape | Worker structured machine field; SQLSTATE parsed as five uppercase alphanumeric chars, otherwise null |
| private prepare / runner+Hub client | Existing files/project/divergence policy | PrepareAnswer: success reset/applied; migration failed/diverged or admission code | Exact pending migration captured in data-plane; validated name; null for BEGIN/COMMIT or other transaction-level failure; a name only while executing that migration or its ledger insert |
| private invoke / runner+Hub client | Existing InvokeInput | InvokeAnswer, code-specific safe facts | Supervisor validator pointer/rule, admitted export, controlled exit/signal; worker SQLSTATE only as untrusted diagnosis |
| public failureResponse / HTTP technical layer | FailureCode, validated trace or null | Native Response, table status/type/title/code and optional SYSTEM trace | Generated table; active request span context |
| readFailure / browser contract | Native non-success Response | ReceivedFailure | Canonical Problem parse; no detail/cause/provider text |
| production sandbox start / Builder adapter | Existing start arguments | Sandbox or native Failure | Catch only rejected start; preserve named Failure and cancellation |

Private prepare/invoke handled Results use HTTP **200 application/json**, including refusals; release keeps its existing success semantics. Invalid private requests and escaping native faults use table-status **application/problem+json**. Hub module distinguishes these by content type/status and validates the appropriate schema; failed transport/invalid private body keeps existing named transport failure, never a code inferred from prose. Successful invocation JSON remains JSON, with undefined normalized to null before serialization. Replacing private producers and consumers happens in U4 without a legacy packet shim.

Manifest diagnostic stays local to admission/check reporting. Private runner admission failures carry code only. Schema rules and pointers are built by the validator, never by splitting an exception or copying returned values. Their size is bounded by admitted manifest grammar and existing transport limits. Export/migration names come from admitted artifacts, signal/exit from process outcome. Only migration failures carry migration; only schema codes carry violation. No arbitrary message, stack, cause, detail, stdout or provider body crosses as repair data. Builder run-operation projects these variants into its current report protocol, which is otherwise deferred.

### Response, logging and security invariants

1. Public writer takes code+trace only, has no logger and does not receive Error/private Result. Hosting projects InvokeAnswer; Builder preparation raises native Failure with private facts as internal cause. Private results never become public bodies by spreading an error object.
2. Fastify mirrors `reply.code(response.status).headers(Object.fromEntries(response.headers))`, then sends the native Response for ordinary methods and its body stream for HEAD. Fastify 5.12.1's auto-HEAD onSend hook runs before Response extraction and accepts the stream, cancelling it without a body. Mounted Mastra validation remains synchronous and returns the same Response as body; escaping routes use native HTTPException customResponse. Existing security headers and SDK duplicate-log suppression remain.
3. Trace is a lowercase 32-hex nonzero active trace id, validated before writer use and at reader parse. Only SYSTEM text displays a reference. It is not a run id or arbitrary request string. `shortReference` still supports stored UUID run ids at existing formatter callers.
4. Expected private prepare/invoke Results do not emit a failure log in the runner or Hub transport client. RUNNER_INVOKE remains a lifecycle event with code/status and safe validator facts, never raw body. A returned invoke refusal exposed by hosting owns one Hub failure log and uses that public request's trace; a prepare refusal ending a Builder run uses the existing terminal-settlement logger. Neither writer nor transport forwarder logs again.
5. Propagated native runner faults and invalid private requests are caught at runner HTTP, mapped once with toFailure, recorded as native exception span events through existing redacting exporters, and sent as code-only table Problems. They emit **no runner failure log**, including Fastify default error logging. Their original Error cause stays local; arbitrary message/cause/stack does not cross the HTTP wire. The Hub module validates the canonical Problem/code/body-table-response status, reconstructs native Failure with the same table code and throws, without logging or a recorded/received role. Hosting preserves a named Failure instead of wrapping it indiscriminately. Final Hub HTTP exposure or Builder terminal settlement owns the one person-visible code/trace log. This applies to prepare, invoke and release; release success remains HTTP200 and the existing body. Transport rejection/malformed representation maps once to the existing APPLICATION_RUNNER_UNAVAILABLE (release's successful-status anomaly retains APPLICATION_RUNNER_RELEASE_REFUSED); genuine caller cancellation retains its identity.

   Existing telemetry/start.ts:24-30,50-57 native HTTP instrumentation propagates trace context over owner-only unix sockets, linking runner exception event, Hub failure log and public SYSTEM reference. No origin flag, failure-log skip state, diagnostic header, new channel/store/registry or terminal logger edit. Locally unforwarded runner maintenance faults still log at their own boundary. Safe diagnostics are the redacted cause event, separate from a failure log; SYSTEM exception span is marked error. U4 implements this native escape consumption using the existing public body helper; U5 replaces that helper with the sole native writer and proves exported correlation/default-logger suppression.
6. Hub-born escaping faults and Mastra validation/guards retain their existing responsible logger. One failure log is distinct from lifecycle/request/span events. Tests check each affected path and exported trace correlation; a count ban cannot establish this invariant.
7. Worker runtime imports no contract runtime/table. Type-only shared imports erase; its strict subset/schema lives in wire with staged Zod. Actual staging is worker.js, wire.js, data-plane.js, server-manifest.js, platform/caller.js and pg/Zod dependency closures (`sandbox.ts:115-133`), not a worker bundle. No new host mount or authority. SQLSTATE from hostile worker is diagnostic, never authorization or a failure code derived from MESSAGE.
8. Preserve queue continuation, release/cleanup, migration ordering/reset windows, caller identity, connector socket and cancellation. Lifecycle WorkerOutcome remains a separate domain, not another Result candidate. Preserve SQL integrity and existing catalog replay unchanged; history regexes are not live catalog proof.

### Reader matrix and behavioral scenarios

The canonical Problem owns closed code/status fields and trace validation; unknown extra fields may be ignored but never retained by ReceivedFailure. Parsed body status must agree with both the response status and the code’s generated table status. Error message/text always comes from audience table lookup.

| Case | Required result / proof | AC |
| --- | --- | --- |
| Known person/app code | ReceivedFailure(code,status,validated trace); literal audience text/action | 5 |
| Known code without text for this audience | Preserve known identity; display table INTERNAL_UNEXPECTED text, no private title/detail | 5 |
| Unknown code, wrong content type, malformed/missing fields/JSON, body/response/table status mismatch, invalid/all-zero trace | HUB_RESPONSE_UNREADABLE and its table text; no permissive second decoder | 5 |
| Non-SYSTEM valid trace | Identity retained; no reference on screen | 5 |
| SYSTEM valid trace | Exact table text plus short validated reference; no planted marker | 4,5 |
| Real fetch rejects | HUB_UNREACHABLE at both web fetch and generated api call; original genuine AbortError rethrown | 5 |
| SDK refused question/tool answer | Normalize SDK body/status into Response; same reader; branch on code, pending outcome unchanged | 5,8 |
| Admission boundary | First violation/limits/order pinned; code read from result, never Error.message | 2 |
| Confined worker | Actual staged runtime success; each nine-code refusal; hostile unknown/detail/extra/missing result fails at parsing | 3,8 |
| Private diagnosis → Builder → public app | Correct schema/export/crash/migration/SQLSTATE facts in repair report; marker absent from public response and browser | 3,4,5 |
| Prepare with isolated database | Applied/reset/divergence/failed migration identity and cancellation races; good Preview not replaced on refusal | 3,8 |
| Mounted Hub/Mastra routes | Literal wire/onSend/span status; content type/headers; one responsible failure log and correlated trace | 4,8 |
| Production sandbox start rejects | FAILED/new code/null unopened sandbox id; source/Preview pointers unchanged; literal table note/Stage text, one log, no retry | 6,8 |

Actual generated artifact execution, actual adapter sockets and restricted runtime tests are required. U1 doubles or shape compilation cannot substitute for database/browser/confinement evidence. Real E2B requires separate operator permission; closed-endpoint isolated proof does not authorize a real sandbox turn.

## Deletes and census

Today's counts were rerun on `b07a99e7d1d7fbd4c24f681befb51a00b92635b0` (same product tree as examined main). Broad census: 424 production files, 63 ok:false sites/16 syntactic shapes, 27 other discriminants, 251 catch/promise handlers, 126 heuristic swallowing labels, 18 empty catches. These are informational, not all defects or wave targets.

The bounded census is Git-tracked Hub/web/contract TypeScript including generated TS, named declarations/calls/imports, with file:line output. Generated embedded source has separate execution/fixture checks. U2 ports the private study's bounded script into the repository, with deterministic output and minimal fixtures. CI uses the existing verify graph; no normalized occurrence database, whole-repository catch classifier, semantic reason registry, later-wave cap or duplicate SQL parser/replay.

| Check | Today | Target / activation unit |
| --- | ---: | --- |
| Old operation Result alias | 1 | 0 / U3 |
| Manifest assert helper names (retained typed-refusal traversal) | 2 | 2 / U4; prefixed throw semantics removed |
| ADMISSION_ROW/admissionFailure definitions | 2 | 0 / U4 |
| workerCodeOf filter | 1 | 0 / U4 |
| Old free-code/detail/value worker and state/detail prepare schema fixtures | Present | Rejected; new variants accepted / U4 |
| failureProblem calls / old body helper definitions | 6 / 4 | 0 / U5 (U4 may decrease first) |
| HubFailure AST class / generated ConexusError | 1 / 1 embedded | 0 / U6 |
| Direct old web failure imports | 8 files | 0 / U6, including run-failure.tsx |
| Generated decoder, HTTP_nnn, fallback/wrapper | Present | 0 / U6; generation drift and actual artifact fixtures |
| Sandbox-start row | 0 | 1 / U3, mapper proven U7 |
| Admission call expressions | 10 | Inventory for atomic migration, not target zero |
| Historical SQL raises / committed functions | 278 / 4 | Informational only; existing catalog generator/check unchanged |

`contracts/technical/error-model-census.json` stores baseline and explicitly activated zero targets, not per-occurrence semantic classifications. Replacing unit activates its own zeros; U2 is green with current baseline. Runtime invariants use tests, not AST inference. U8 must find no remaining replaced API, even under renamed local imports; use the inventory and actual call sites in addition to identifier checks.

Delete list by owner: U3 old Result alias; U4 prefixed admission throws/decoder, worker prose serializer/filter, old WorkerResult/PrepareResult and private status/body Reply carrier; U5 failureProblem/sendFailure/sendInternal/problemBody/causeText and handwritten public body assemblers; U6 HubFailure/ConexusError, generated failure decoder/HTTP_nnn/fallback, web failure module, starter lib/errors wrapper and old imports; U8 shape. No compatibility export, dual reader, legacy packet adapter or test-only retention.

## Units

Every card includes `npm run verify:quick`, its targeted behavioral/type checks and rereading the mapped guides. Each ends in one green commit using only prior units or its own types. Tests, Markdown, temporary shape and committed distribution are outside the source/config inventory. Rationale records the initial reservation and the necessary atomic caller closure found by independent review. The last independent prove/review stage is not a ninth build unit.

### U1. Keep the existing behavior pin and correct its stop rule

- **Already there**: Unchanged main product tree and characterization at `6b59730bf4673e0a76dd68e9def265245aa7d435`, https://github.com/developmentconexus-ops/conexus-os/pull/561. Observed open/unmerged during study; do not rebuild or pretend it is integrated. Verify its integration and exact test files on the wave head before U2.
- **Creates**: No new mechanism; retain existing admission/worker/private-client/generated-reader/sandbox-settlement and HTTP telemetry pins. Explain `.network.test.mjs` as Medium, as the existing verify graph already groups it; factual T §2 correction belongs here.
- **Satisfies**: AC-2–AC-6, AC-8 as characterization, not final target proof.
- **Files**: Existing test/helper/verify files in that PR; `docs/development/testing.md` factual suffix correction only. No product code.
- **Copies**: R5 actual native adapters, existing grammar; T behavior pins.
- **Guide sections**: T §1–§3, L Waves, C §5–§6.
- **Deletes**: Unsupported claim that current public detail/trace handling is acceptable. Keep those defects characterized with replacement destinations U4/U6.
- **Proof**: Run that PR's exact tests on unchanged main and wave integration; record literal existing envelopes and planted-marker behavior. Real local HTTP/OTLP sockets differ from the unrestricted fd 3 worker and store/Git/sandbox/fetch doubles. Six admission tests were rerun in study; the earlier audit's 21 passes are input, not a fresh whole-set run.
- **Out of scope**: Fixing legacy behavior or claiming database, browser, isolation/reset-race proof from doubles.
- **Stop if**: A touched boundary has no characterization, the pin changes product behavior, its integration is absent, or a premise/authority conflict is newly found. An already characterized guide departure is baseline debt assigned to a replacing unit, not itself a reason to stop U1.

### U2. Install the bounded removal check

- **Already there**: Integrated U1, existing TypeScript AST API and verify graph; Deletes and census above.
- **Creates**: `scripts/census-error-model.mjs` with list/check modes and record of baseline/activated zero targets; CI registration and minimal present/absent fixtures for named checks. Copy private bounded census source, strip machine paths. No product Result dependency.
- **Satisfies**: AC-7, AC-8.
- **Files**: Census script, `contracts/technical/error-model-census.json`, `scripts/conexus-verify.mjs`, optional `package.json`, repository test fixtures only.
- **Copies**: R8; existing `census-builder-run.mjs` count/check pattern, adapted to named removals rather than semantic classification.
- **Guide sections**: A §2, C §10–§11, T structural checks, L required checks.
- **Deletes**: Old spec's universal catch/reason/occurrence engine and duplicated SQL-replay proposal; neither is built.
- **Proof**: Reproduce every bounded count above with file:line matches; renamed-import/embedded-source limitations documented. `--check` passes baseline, activated zero fixture fails on reintroduction. Existing catalog/generator checks remain unchanged. verify:quick.
- **Out of scope**: Freezing/classifying other 27 discriminants, empty catches, categories, unused rows or migration history.
- **Stop if**: A zero needs a semantic classifier or unrelated repository traversal. Narrow to a named API or behavioral fixture rather than guessing semantics.

### U3. Export the plain Result and reserve the start code

- **Already there**: U1/U2, genuinely approved spec and merged authorization; actual merged code/private-reason contract reread. Existing contract Reply, table and generator; shape/types.ts.
- **Creates**: Type-only result.ts export; existing alias caller uses Reply. One sandbox-start row and generated outputs; C §6 clarification: “A caller-handled refusal returns the shared readonly Result with operation-specific table codes; escaping server faults retain native Failure, and received browser failures use the shared reader.” This states target ownership, not a ban on native SDK Errors or completion of deferred paths.
- **Satisfies**: AC-1, AC-6 (row only), AC-7, AC-8.
- **Files**: Contract result/index/operation; web app/http type import; failures.json, contract/Hub failure unions/text, app-failures and telemetry generated outputs; C guide; production type tests and census.
- **Copies**: R1–R3.
- **Guide sections**: C §4/§6/§10, A §5, V Voice, H §5.
- **Deletes**: Result=Reply alias and its import; no second handled Result spelling.
- **Proof**: Negative tests reject unknown/flat/unrelated/mutable/nonnarrowed results; a void account-connection signature compiles without changing account behavior. Row is unique, generated outputs drift-free, alias 1→0. verify:quick and contract/web typecheck.
- **Out of scope**: Account implementation, table cleanup, new runtime factory/dependency, rewriting authorization.
- **Stop if**: Merged authorization conflicts with this role model or an existing row already names exactly this start rejection.

### U4. Migrate admission and the complete private runner path

- **Already there**: U3 Result/table, U1 pins, U2 checks; existing manifest/input/Caller/migration/confinement owners. Read shape/types, operations, schemas, usage; all Design invariants.
- **Creates**: Total admission with first structured refusal; WorkerAnswer/PrepareAnswer/InvokeAnswer and strict parsers; private 200 JSON producer/client; canonical Problem trace/code/table-status validation and regenerated API outputs; all consumers move together. Data-plane retains exact failed migration identity as typed failure data, not an exception-message parser. Runner native escapes use existing span.recordException/redactor without runner failure logs; module preserves validated table code, named Failure and cancellation, and final Hub logger stays unchanged. Builder operation reporting keeps bounded facts; hosting projects a refusal through the existing public writer until U5 replaces that writer. This is an unchanged public boundary, not an adapter back to a legacy private packet.
- **Satisfies**: AC-2, AC-3, AC-7, AC-8.
- **Files**: app-runner server-manifest/wire/worker/sandbox/supervisor/module/http/data-plane; builder run-operation/application-build/check steps generate/server-bundle/boot-server; hosting application-invoker/application-host-routes/preview-routes; contract/problem and schema-derived API outputs; tests/census; H private-boundary clarification below. All ten admission call expressions and internal wrappers are accounted for.
- **Copies**: R1/R3/R7; exact private format/grammar adapted as disclosed above.
- **Guide sections**: C §5–§7, A runtime/recovery, H §5, D app integrity, S §1/§7/§8, T generated/process/database proof.
- **Deletes**: Admission prefixed throw semantics/ADMISSION_ROW/admissionFailure; worker detail serializer/workerCodeOf; old worker value/code/detail and prepare state/detail; private Reply status/body carrier and every direct read of those envelopes; duplicated runner failure logs for propagated native faults and module code collapsing. Existing native body helper remains until U5; no adapter recreates old private packets. Remove run-operation message/SQLSTATE prose decoding when replacing its private fact consumer. Existing check/broker report protocols remain unchanged.
- **Proof**: Literal first-error and bounds pins; all nine worker codes and private variants; unknown/private extra fields/missing result rejected. Actual restricted staged worker succeeds and refuses, using only erased contract type imports and staged dependencies. Real isolated DB tests cover migration identity, BEGIN/COMMIT failure with migration:null, applied/reset/divergence, cleanup and cancellation races; never attribute a transaction fault to the first/last migration. Builder sees structured pointer/rule/export/crash/SQLSTATE while synthetic PRIVATE_DIAGNOSTIC_MARKER never reaches public body. Native prepare/invoke/release/invalid-request faults reach the existing Hub terminal/HTTP owner without duplicate runner/default/forwarder failure logs; local unforwarded maintenance still logs. Admission decoder/filter zeros activated; two retained manifest helper names no longer throw; verify:quick and actual Hub/check/template builds.
- **Out of scope**: New migration/reset policy, connector protocol, whole-check Result migration, runtime contract mount, retry or diagnostic service.
- **Stop if**: Atomic path cannot fit one fresh session/green commit, required fact lacks a safe structured source, confinement fails or a caller needs a legacy shim. Return evidence and rescope within eight units; do not add machinery to conceal it.

H rule added here: “Runner prepare/invoke handled answers are validated private Results over the existing owner channel, HTTP 200 JSON; only the public HTTP boundary projects code and validated trace to a Problem, and private repair facts never establish authority.” Logging ownership in Design is tested here and finalized with public exposure in U5.

### U5. Replace public body writers with the native Response

- **Already there**: U4 complete private path and projections, native Failure/logging/headers/Problem, installed versions in R5. Read shape/server, usage; Response/logging invariants and scenarios.
- **Creates**: Sole failureResponse and explicit Fastify bridge; hosting projection, mounted Mastra sync validation and HTTPException customResponse. Expected invoke exposure/Builder settlement and native escape owners follow Design; runner exception event retains original cause under existing exporter redaction, inherited unix trace joins the one final Hub log; retain SDK suppression, no logger in sender/forwarder. H rule: “The sole public failureResponse returns native Response from the table; adapters preserve its observable status/headers and expose no private diagnosis.”
- **Satisfies**: AC-3, AC-4, AC-7, AC-8.
- **Files**: Hub http/problem/app; runner http/module; hosting invoker/application-host-routes/preview-routes; builder mastra-session-routes/run-operation; H guide, tests/census. OpenAPI outputs only if schema generation requires them.
- **Copies**: R4–R6; actual installed native hook contracts, not remembered API.
- **Guide sections**: C §6/§10, H §5/headers, S browser/logging, A §2/§8, T Medium adapter proof.
- **Deletes**: failureProblem/sendFailure/sendInternal/problemBody/causeText and local public refusal/body assemblers, redundant public parsers, remaining owned uppercase message decoders and any residual propagated-fault runner log. No second status/body abstraction.
- **Proof**: Actual Hub/host/preview/runner/Mastra sockets: literal 404 wire/onSend/exported request span, headers/CSP, SYSTEM 500 trace, validation codes and 200 success JSON. One failure log for each expected public invoke, Builder prepare settlement, native runner prepare/invoke/release/invalid-request escape, Hub escape and Mastra validation; retain redacted runner exception frames/type while synthetic cause text is absent. Correlate runner event/Hub log/public reference on the same exported trace; assert runner default/custom error handlers and module/hosting add no failure log, and local unforwarded maintenance still logs. Private markers absent, all six old calls/four helper definitions zero. verify:quick.
- **Out of scope**: Private Result redesign, global dedup/log registry, authorization policy, ConsoleLogger replacement.
- **Stop if**: Hook observes 200 on refusal, headers/trace are lost, duplicate/lost log occurs or native Response carrier fails. Provide actual path/runtime evidence before changing design.

### U6. Share the reader directly and emit it only for the app

- **Already there**: U5 sender, U3 table, U4’s strengthened canonical Problem and current useful formatter callers. Read shape/client/schemas/usage; reader matrix and ownership.
- **Creates**: Browser-only contract failure-client exports; direct web imports; app-only source emission from that owner with canonical Problem schema and app-audience text. Use U4’s canonical Problem trace/table-status validation and additionally reject body/response status disagreement at each received boundary; regenerate API outputs only if emission needs them. Actual web/generated fetch sites map rejection and preserve genuine abort. SDK boundary normalizes body/status into Response then uses same reader/code. V Voice clarification: “Failure text/action come from the audience's table; only a validated nonzero SYSTEM trace may appear as a reference.”
- **Satisfies**: AC-5, AC-7, AC-8.
- **Files**: Contract failure-client/index/problem and generated table support; scripts/generate-failures; Hub generated/app-failures and compiler generate-client; starter lib/errors deletion/README; web app/failure deletion, downstream consumers formerly using app/http reexports (listed in rationale), and all eight imports (attempt-key/foreign/http/route-params, builder/construir/run-failure.tsx, connector/connector-api, entry/entry-screens, identity-access/api), builder/mastra-session; four Builder examples form/list/record/dashboard and both Builder skills; DESIGN.md; API generated outputs, tests/census.
- **Copies**: R2/R3/R7/R8; packaging rationale explicitly says exact external emitter not found.
- **Guide sections**: C §5/§6/§10, A §5/§8, H validated response, V Voice, P repair/user journeys, S §7, T artifacts/browser.
- **Deletes**: HubFailure/ConexusError, web local module, app local failure()/HTTP_nnn/fallback/failureMessage, starter errorMessage/connectionMessage wrapper and old skill/example imports. Keep useful formatter names, including UUID run-id shortReference. No old-name alias or emitted web copy.
- **Proof**: Execute actual generated artifact for every reader-matrix row, including PRIVATE_DIAGNOSTIC_MARKER trace/detail, unknown code and missing-audience text. Rejecting fetch at both real call sites yields HUB_UNREACHABLE; same abort object survives. Actual web and generated builds; all four examples compile against generated exports. Attempt-key 4xx and pending question/tool outcomes unchanged. Generator drift detects stale app support; old imports/class/decoder/wrapper zero; verify:quick.
- **Out of scope**: Rewriting arbitrary generated Project screens, changing existing table text/action, account/provider behavior or catch sweep.
- **Stop if**: Canonical import brings Node/Hub access, app output includes operator-only text, formatters lose a caller or generation needs another handwritten parser.

### U7. Name only the production start rejection

The operator approved the bounded Preview extension on 2026-10-07: conversation and Preview display the same canonical table reason through the existing formatter. Sobre is unchanged. No new parser, writer, state, formatter or retry.

- **Already there**: U3 row, U5 public/log path, U6 reader; existing production adapter/start/settlement; closed-endpoint isolated verify harness. Read sandbox scenario and Non-goals.
- **Creates**: Narrow catch at conversation-sandboxes.start around the native start call: preserve existing named Failure and genuine cancellation, otherwise Failure(BUILDER_SANDBOX_OPEN_FAILED,{cause}). Existing terminal logger settles it; no extra log/retry. Update factual verification recipe only from observed behavior.
- **Satisfies**: AC-6, AC-8.
- **Files**: builder/conversation-sandboxes.ts; web builder/construir/lens-preview.tsx and run-failure.tsx comment correction; verify SKILL.md/features/construir.md, isolated live/unit tests. checkout/run/service are read dependencies, not authorized extra product edits.
- **Copies**: R3/R9.
- **Guide sections**: C §6, A §6, P §5, S §7, V failure surface, T Builder proof.
- **Deletes**: Generic start classification and stale recipe code/text/log assertions.
- **Proof**: Literal id/cause at adapter; named Failure/AbortError preserved, later preparation error unchanged. Closed endpoint in isolated app: DB FAILED/new code/null unopened id, unchanged source/Preview, one redacted log, conversation note and Stage literal row text, no retry. verify:quick. A real E2B turn still needs separate authorization.
- **Out of scope**: Lifecycle administration, keepalive/provider classifier, broader checkout catch, teardown/retry policy.
- **Stop if**: Failure actually occurs after start, bypasses this adapter, settlement changes meaning or proof requires unauthorized E2B.

### U8. Close targets and delete temporary shape

- **Already there**: Green U1–U7; all actual production exports and runtime tests. Read every AC/census target/stop rule.
- **Creates**: Final exported-contract consumer checks and AC-indexed built-head proof recipe. The manager schedules independent conexus-prove and qualification review after this unit; a fixture report is not their substitute.
- **Satisfies**: AC-1–AC-8.
- **Files**: Tests/census activation and this spec's shape deletion only; eventual prove-stage report under docs/evidence. No new runtime or other spec.
- **Copies**: Prior references as implemented; no new mechanism.
- **Guide sections**: L Waves, T real consumers/evidence, C §6, H, S.
- **Deletes**: Entire shape/ and any test-only legacy API reliance; production code owns declarations thereafter.
- **Proof**: Actual manifest caller, generated operation/browser consumer and type-only void account consumer use exported declarations. All named zeros, app generation drift, Hub/web/contract/template builds and verify:quick. Runtime proof for every AC is inventoried with exact head, commands, doubles and limits; independent prove/review must pass on that built head before wave merge.
- **Out of scope**: Building deferred paths or declaring the wave proved merely because shape/checks pass.
- **Stop if**: Legacy API remains reachable, consumer needs shim, activated check was relaxed or any AC lacks its required behavioral proof.

## Non-goals

No implementation in this spec-writing change. No migration of connector/broker/check/Git/control/account/served-file/vendor classifier protocols, merged log registries, global catch/INTERNAL_UNEXPECTED/table/category/liveness sweep, database or authorization change, new dependency, retry machinery, generated web implementation or diagnostic store. Those are deferred guide departures, not certified KEEP mechanisms or adapters to the new model. Roadmap owns their continuation. No historical migration editing or hypothetical application SQLSTATE/MESSAGE policy.

## What breaks the premise

- The actual private consumer does not need the bounded facts or needs unsafe prose: return to product/architecture owner with observed consumer evidence.
- Mounted native Response cannot preserve status/headers/log/trace; actual R5 sockets decide, not declarations.
- Strict worker code cannot run in existing restricted staging without extra host authority; U4 decides.
- Authorization's merged refusal contract conflicts with roles here; U3 reread decides.
- Direct package reader/app emission cannot fit fixed browser dependencies or audience; U6 actual builds decide.
- U4 cannot remain one fresh-session atomic conversion within this budget; rescope rather than add a shim.

## Stop rule

No product unit starts before a genuine approval line on this revised spec. Stop and return to the planning session on a disproved premise, policy conflict, later-type/compatibility dependency, unit that cannot end green in one session, or any unreserved product/check/config path. The original reservation was **54 unique paths**, then **55** with the approved Preview extension. The reconciled source/config closure is **76 paths**, listed in rationale; this corrects an undercount, not a new product approval. The original 70-file planning ceiling was exceeded by necessary atomic consumer migration and is not claimed satisfied. The correction round authorizes recording that existing closure; genuinely new capabilities or paths still require an analyzed scope decision. The eight-unit bound remains. Ready status of the respec review PR is not wave proof or build approval.
