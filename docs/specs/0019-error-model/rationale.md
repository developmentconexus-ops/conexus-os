# 0019. Rationale: identity, private repair facts and public failures

## Context

The question is not whether every error should have the same superclass. Admission throws a code as prose, worker output combines code and arbitrary text, private runner responses mix repair facts with public representation, and each browser reconstructs meaning differently. The resulting defects are message-based decisions and internal text reaching the application. The guides require machine identity, safe diagnosis for repair, owned text and authority at boundaries. An early product needs that path corrected before a broad cleanup, with fewer mechanisms to maintain.

Why several formats? They were made for individual callers. Why a problem? Each crossing must reinterpret identity and disclosure. Why not simply remove all fields except code? The Builder uses schema/export/crash/migration facts to repair an app; P §2/A §6 require that capability. Why not unify every catch now? Syntactic failed states include real lifecycle and cleanup behavior, and no reference-backed generic semantic classifier was established. The root cause is combining identity, diagnosis and display into an ad hoc string or packet.

Today's code is census and replacement evidence, not the reason for the target. C/A/H/S/P/V decide the target and may themselves be challenged by checked references. The study read AGENTS, roadmap, delivery Waves, areas.json and all A/C/D/H/L/P/S/T/V guides. The audit and earlier studies were corrected inputs, not proof or authenticated approval.

## Options considered

The full inspected revisions/file:line are under References below; R keys correspond to index. “Removal” is included even where it violates a current requirement.

| Root question | Complete options and cost | Recommendation and evidence |
| --- | --- | --- |
| How much scope now? | Leave unchanged: cheapest, leaks/prose remain. Parser-only: small, leaves browser duplication/public detail. This bounded path: coordinated migration within 54 reserved paths/eight units. All failures together: larger semantic census and unsettled deferred roles, delays product; no proved 74-path lower bound. | Bounded path, based on actual consumers, C/H/S/P and R1–R7. Scope approved at study gate. No new service/library/engine. |
| How should handled refusal travel? | Keep throws/flat states: no moves, decoder remains. Plain ok/result/error: migrate callers only. success/data or SDK data/error: same moves with another spelling. Result library/factories: dependency/runtime/combinators to maintain. Remove results and throw all: fewer return types but loses caller decision required by C §6. | Plain readonly type-only Result in existing contract, R1. Mastra returns native Error internally; Conexus adapts only the envelope and closed code. |
| Which exception roles? | Current native server/two clients: no moves, duplicate. Native Failure/one received class: migrate imports/constructors. Objects everywhere: loses native cause/throw/instanceof semantics. Plain Error alone: loses typed identity. Remove client wrapper: repeat unknown parsing at callers. | Native Failure and one ReceivedFailure, R3. Existing Error identity callers retained; no class per code or module. |
| Can the private carrier choice disappear? | Existing channel already separates private runner from public app; no need for endpoint/header/store. Keep packet/detail and filter at Builder: cheap but leaks/prose remain. Typed Result on existing channel: all producers/consumers migrate, safe facts retained. Native Response plus diagnostic headers: encode/decode/strip protocol and leak risk, no inspected reference. Response plus side store/callback registry: lifecycle/correlation machinery, no current need. Remove diagnosis: simplest public wire but breaks repair promise. | Private typed Results, public native Response, R1/R3 and A technical context. Exact fact protocol is a Conexus adaptation, not found externally. Operator approved this choice. No header protocol/store/channel/library. |
| Who writes public response? | Keep local packets: redundancy/status drift. One native Response: migrate public helpers/adapters. Another status/body abstraction: more reconstruction. Per-framework writers: table mapping duplication. Remove writer: hand-built mapping repeated. | R4 central mapping plus R5 actual native carriers. Explicit Fastify status/headers; do not force Response into private handled results. |
| Where is browser source? | Keep two readers: drift. Contract source/direct web import/app-only emission: one export/migrate imports. Web-owned source emitted to app: ownership under UI conflicts A §5. Dual emission: unnecessary web artifact/drift. Remove reader: parser duplication at callers. | Existing contract owner and app-only generation, R2/R3/R7/R8. Exact external emitter not found; fixed standalone app cannot import platform package. No new package/parser. |
| How strict are code/trace/network handling? | Current permissive app and arbitrary trace: cheapest, leaks. Canonical closed Problem and validated trace with table fallbacks: boundary changes/tests. Second permissive decoder: extra policy and unknown identity. Remove references: loses SYSTEM diagnosis promised by V. Propagate raw fetch error: no owned text; swallow abort: changes cancellation. | R7 parsing principle adapted to C §5/S §7/V. Unknown malformed → HUB_RESPONSE_UNREADABLE; known no-audience → INTERNAL_UNEXPECTED text; fetch → HUB_UNREACHABLE; preserve abort. No public raw fields. |
| How much census/check infrastructure? | Universal AST classifier/normalized occurrences/reason registry/SQL replay: ongoing policy and maintenance, no exact reference. Bounded API zeros+strict fixtures+drift: small script/record/CI slot. Empty-catch freeze: syntactic only, needs separate ownership. No check/remove census: recurrence. | R8, existing builder census pattern and C §11. Old broad metrics informational only. Reuse SQL catalog replay; not a migration-history engine. |
| What SQL policy? | Keep structural integrity/map: no schema change. Edit historic raises: violates immutability and false live premise. New custom SQLSTATE/MESSAGE protocol: consumerless machinery. Remove constraints/map: violates D. | Existing SQLSTATE+constraint map, D §5/§8, R6. P/SA also retain messages/custom status; BJ business SQL differs from Conexus D §8. No invented universal SQL ban or future raise rule. |
| Where name sandbox fault? | Leave generic: wrong known outcome. Narrow start catch: row/mapper only. Broad preparation catch: misclassifies other failures. Retry/classifier: new policy. Remove start: removes Builder capability. | Narrow production adapter mapper, R3/R9 and roadmap. Preserve named Failure/cancellation, cause and terminal logger; no retry. |

## Decision and why

On 2026-10-07 the operator answered “Aprovado error” to the study's section 8: scope, exclusions, end condition, at most eight units and conservative 54-path reservation. Firstmate relayed it in instruction 001. Instruction 002 was withdrawn by 003 because it concerned spec 0018; no simplification from it applies here. Instruction 004 relayed “0019: Aprovo” for typed private invoke/prepare Results on the existing channel with bounded repair facts and code+validated trace projected publicly. Other recommendations above follow checked guides and references; no fresh product choice was manufactured for an observable implementation detail.

The two independent spec reviewers (gpt-6.1-sol and gpt-6-sol) both reopened native runner escape/log ownership: runner/http.ts:59 logged before module.prepare reconstructed a Failure flowing into builder/run/run.ts:359 or service.ts:133. On 2026-10-07 instruction 005 relayed the operator’s “Aprovo” for option 2: final Hub exposure/Builder settlement owns one failure log, runner keeps original cause as a redacted native span event, existing unix instrumentation joins their trace, no recorded-failure role/header protocol/store and no path expansion. Locally unforwarded runner faults retain their local logger. The revised shape compiles producer and prepare/invoke/release consumption and named-Failure forwarding; unchanged terminal loggers need no skip state. Other findings corrected: action NONE, migration:null for transaction failures, missing-result rejection and table/body/response status agreement. Five corrected schema probes passed. Both independent reviewers rechecked the corrected flow and closed their findings with no new concrete blocker; their private reports preserve file:line evidence. Those review verdicts are distinct from the operator’s spec approval and the later built-head qualification proof.

These decisions replace the former unsupported approval; they do not approve this revised spec. Its status is draft awaiting operator approval. Product builds remain gated. U1's characterization survives; its known guide departures are baseline facts with replacing units, rather than an impossible “stop on legacy defect” rule.

The simplest target has one type-only Result, existing native Failure, one browser received role, one public Response writer, one canonical reader, app-only generation, one narrow start mapper and small named checks. It deliberately does not normalize lifecycle states, rewrite database history, generate a web reader, build a diagnosis service or classify every catch.

### Native escape ownership, reopened by review

The root issue was erased responsibility, not a missing dedup service. Keeping the runner log plus adding a recorded-Failure role could preserve it but requires trusted origin metadata, wrapper/terminal changes and paths outside the reservation; R3 separates received roles but provides no once-only protocol. Allowing one log per process costs least immediately but reopens C §6 and the approved end condition. Removing runner logs without cause evidence loses diagnosis. Swallowing the fault hides failure and violates C/A. The approved alternative deletes propagated runner log calls, keeps original cause as native redacted exception event and lets existing final Hub owners log once. It fits the 54 paths, needs no new role/registry/channel and preserves source diagnosis without arbitrary cause transfer.

Copied mechanism: installed OpenTelemetry API `build/src/trace/span.d.ts:130` recordException and sdk-trace-base2.10.0, existing native HTTP instrumentation and redacting exporters; M at the pinned revision `default.ts:469-510` preserves original Error and span diagnosis. Adaptation is final Hub log ownership instead of engine-local logging. Exact one-log topology not found externally; C/S/A and the operator decide this Conexus boundary. Native Fault Problems retain table identity rather than module’s old collapse; malformed transport retains named unavailability. Future default-logger suppression, exported cause redaction, trace correlation and terminal behavior still require U4/U5 runtime proof; compiling this flow is not that proof.

## Evidence

Examined base: `b07a99e7d1d7fbd4c24f681befb51a00b92635b0`, local main `5efbc090c43176ca4e666688769d2a4ee09e1745`, U1 `6b59730bf4673e0a76dd68e9def265245aa7d435`. Product diffs main→base and main→U1 on apps/packages/contracts were empty, exit 0. These local revisions are not a claim to latest upstream. U1 https://github.com/developmentconexus-ops/conexus-os/pull/561 was observed open/unmerged; integration must be checked before building.

Private planning evidence includes study.md, rerunnable census.mjs/bounded-census.mjs, JSON/file:line output, deterministic path-budget script, actual-source probes.mjs and six extracted U1 admission cases. Machine paths are intentionally omitted here; the planning session holds the report. U2 makes the bounded removal check public and required. Study broad census reruns 424 files, 63 ok:false/16 shapes, 27 other discriminants, 251 handlers/126 syntactic swallowing labels/18 empty. Bounded named counts are in index. Those labels do not prove 126 swallowed defects. Historical 278 raises/73 codes/44 absent table rows are migration history, not live callable failures. The committed catalog lists four functions, not a live proof.

Study probes executed actual current modules/generated source: admission throws `MANIFEST_REFUSED: operations: must be an object`; worker schema accepts unknown code/private detail; generated app exposes PRIVATE_DETAIL and raw rejected TypeError; arbitrary trace marker displays `PRIVATE_`. Installed Fastify real socket probe: native bare Response wire404/onSend200, explicit mirror404/404. Six actual-source admission cases passed, zero failed/skipped. Node24.20.0/npm12.0.2 preflight passed. Shape compilation is type evidence only. The earlier audit's 21 focused passes were not rerun as a complete set in this study.

Not verified here: future implementation, confined future worker, actual DB reset/migration/cancellation race/catalog replay, real browser, exported target telemetry/log/trace, whole U1/CI, E2B/provider turn. U4–U8 require these target proofs where applicable; no existing double is relabeled as end-to-end evidence. Existing `scripts/generate-hub-catalog-snapshot.mjs:47-73` already performs protected isolated replay/readFunctions. It remains owner; no duplicate parser or SQL policy is justified by unrun replay.

### Mechanism verdicts: three proofs each

Proof 1 establishes current existence/reachability and states the operational limit; it is not a claim that future behavior works. Proof 2 is the guide obligation; proof 3 is reference comparison and cost.

| Mechanism and verdict | Proof 1, current code / operational limit | Proof 2, guide target | Proof 3, reference and cost |
| --- | --- | --- | --- |
| Failure/MastraError, toFailure: KEEP | platform/failure.ts:15-33; native class/cause extension inspected, not new target-runtime tested | C §2/§6, A §2 | B and M retain native exceptions. Replacement would remove working native metadata without a proved gain |
| Table and generated text/status/action: KEEP | 260 rows; generator:89-110; existing consumers run in probe | C §4/§6; V Voice | B owns code/text together. Conexus status/audience are deliberate adaptation; no second table |
| Result=Reply alias: DELETE | operation.ts:66; web http type import | C §4/§10, A §5 | M's Result has different meaning. Use existing Reply name; only one new type-only definition |
| Shared handled Result: REPLACE local branch envelopes | manifest/work/preparation callers observed | C §6; no generic Product API introduced | M/I ok/result/error. Plain union costs caller edits, no library, factory or runtime combinators |
| Manifest grammar/first-error walk/schemaViolation: KEEP; throwing helpers: REPLACE | six U1 grammar tests pass; pointer creation at supervisor:235/254 | C §5 explicit exception, C §6 | Z safeParse supplies principle, not grammar. Preserve grammar; fewer code-prefix decoders, no general schema rewrite |
| ADMISSION_ROW and uppercase message classifiers in owned path: DELETE | runner http:21-25 and run-operation:200-203 | C §6 | C and Mastra SDK demonstrate contrary fallbacks, not reason to copy them. Typed refusal eliminates need |
| WorkerJob/Caller/relay/socket/confinement: KEEP | wire:1-25; sandbox:53-66,115-133; pg-relay:204-218; future restricted runtime unproved | A §7, S §1/§8 | Native worker/runtime separation rather than new engine. Preserve mount/dependency footprint; no new host authority |
| Worker result/free code/detail: REPLACE; detail formatter/filter: DELETE | wire:27-31, worker:81-84, supervisor:65-71; permissive parse reproduced | C §5/§6; S §7 | M union adapted to strict nine-code external identity; not wholesale table authority. Any safe SQLSTATE must be separately typed, not parsed prose |
| WorkerOutcome timeout/crash/output limit: KEEP | sandbox:48-51; supervisor:248-249 | C §4, A recovery/runtime | M distinguishes lifecycle and local step results. No failed-state codemod |
| Prepare state/detail format: REPLACE | module:57-66; application-build:47-53; no actual DB reset test here | C §6; D §2/§8 | M/Z branchable result, preserving applied/reset/divergence facts. Explicit handled HTTP 200 private convention |
| Prepare serialization/reset/refusal/cancellation: KEEP | supervisor:195-220; module:21-22,55-56 | C §7, A recovery, D integrity | References do not prove timings. Existing actual behavior is pinned obligation, real race proof required; queue continuation is not automatically lost error |
| Trusted diagnosis: KEEP, replace prose projection | supervisor:235-255 and migration divergence; run-operation:85-113 | P §2; A §6; S §7 | D and M retain internal diagnosis. Keep bounded facts on existing private channel; no diagnostic service or store |
| Public detail/cause/provider/raw stdout: DELETE | generated error exposes planted marker; worker/migration free-text paths | S §7/§9, H §5 | Reference disclosure differs and is rejected by guide; no arbitrary text inside public role |
| failureProblem/sendFailure/sendInternal/problemBody and body assemblers: REPLACE/DELETE | 6 calls and 4 definitions; hosting/Mastra packet construction inspected | H §5; C §10 | P central writer; I/F native Response at HTTP boundary. No second public body writer |
| Native Fastify/Mastra extension points and SDK log suppression: KEEP | installed lines above; Fastify socket probe; target Mastra/telemetry not rerun | A §2/§8; S §5 | I/F documented carrier. Explicit mirroring, sync hook body, custom HTTPException, no patch/fork |
| logFailure/exporters/native HTTP trace: KEEP; propagated runner failure logs/detail forwarding: DELETE | failure.ts:62-72; runner http:59; terminal run/run.ts:359; telemetry/start.ts:24-30,50-57 and redact.ts:23-27,44-73; target export unproved | C §6, S §9; A §2/§5; C-029 | M default.ts:469-510 preserves cause and span diagnosis. Adapt owner to final Hub log; runner native exception event is redacted, native unix trace joins them. No recorded role/dedup/header/store or terminal edit |
| HubFailure/ConexusError: REPLACE with one received role | web:7-17; generation:122-131; probes | C §6/§10, A §5 | B/D distinguish server/received jobs. Current instanceof callers favor one shared class over migrating every branch to plain fields |
| Generated failure decoder/HTTP_nnn/fallback/wrapper: DELETE | generator:65-84 and failure generator:137-139; four shipped example imports | H §5/§9; V Voice; C §10 | B code owner/D received reconstruction; app-only generation adapts existing packaging, not new architecture |
| Problem parser/table formatter: KEEP, strengthen trace boundary | trace gap reproduced; 8 direct web imports incl. run-failure.tsx | C §5, S §7; V Voice | D parsing principle adapted strictly. Preserve shortReference for legitimate UUID run references |
| Browser package source/app support generation: REPLACE duplication | web already imports contract; generated app fixed stack; path budget 54 | A §5/§8, C §10 | Exact external generator not found. Direct web import avoids second emitted implementation and extra drift checks |
| Native start/settlement: KEEP; generic start mapping: REPLACE | start at conversation-sandboxes:53; U1 sandbox characterization read, not rerun | A §6; C §6; roadmap | Native Error/cause plus named local row. Single boundary catch, no retry, no lifecycle redesign |
| SQL structural constraints/map/history/catalog owner: KEEP | db.ts:148-170; committed four-function snapshot, live state unverified | D §2/§3/§5/§8 | P/SA code mapping; BJ business SQL differs deliberately. No migration or duplicate replay/parser |
| Temporary compiled shape: KEEP for review, DELETE last | revised shape compiles with negative type tests | spec rules 4/12 | Method artifact, not product mechanism. Negative type tests must survive in real contract tests |
| Global semantic checker/occurrence identities/dual reader generation: DELETE proposal | no production implementation exists; old U2/U6 demand them | A §2, C §10/§11 | No exact reference found. Bounded zero-target checks and app-only emission satisfy observed need at lower cost |


Untouched broker/check/control/Git/vendor/account/served-file mechanisms are deferred departures or unclassified native roles, not certified KEEP decisions. We do not invent their three proofs or use them as compatibility adapters. The roadmap owns continuation. New shape now compiles; negative type tests move into real production contract tests before U8 removes it.

### Audit disposition

| Finding | Resolution and evidence | Target proof |
| --- | --- | --- |
| F1 unsupported approval/analysis | Unsupported status/overnight proof/lower bound removed. New root-cause study/options/checked references above; only relayed study/private-carrier approvals recorded. Draft status. | Spec review and actual operator approval gate |
| F2 contradictory U1 stop | Existing PR retained; stop only on missing pin/integration or new premise/authority conflict. Known defects assigned U4/U6. `.network` grouping factual T correction with U1. | Existing pin on unchanged main and integrated wave, explicit doubles |
| F3 lost useful diagnosis | Private typed fact variants and real consumers preserved; code-only public projection. data-plane reserved to retain failed migration identity. No prose SQLSTATE parser. R3 retains internal diagnosis. | U4 repair facts plus U5/U6 marker exclusion, real DB/confinement |
| F4 reader matrix/trace/fetch | Matrix explicitly covers unknown, missing audience, malformed status/trace, rejection and abort at both real fetch call sites; canonical schema/formatter and UUID caller preserved. | U6 actual generated artifact, web build/browser and fetch identity |
| F5 fictional worker bundle | Real staging files/dependency closure named; contract imports type-only, runtime schema local wire/Zod. Unrestricted U1 worker is insufficient. | U4 actual restricted runtime success/refusal/hostile output |
| F6 overbuilt census | Bounded named AST checks/record with activated zeros; broad metrics informational; strict fixtures and existing drift. No occurrence identities/semantic catch labels/new SQL replay. | U2 check fixtures, replacing-unit zeros, existing catalog check |
| F7 late guide rules/private status/logging/SQL | Rules land U3/C, U4/private H and canonical Problem, U5/public H, U6/V, U1/factual T. Private handled200JSON vs escaping problem status explicit. Operator-approved final Hub log owner, native redacted runner cause span and unix trace are compiled/named for prepare/invoke/release; no terminal edit/skip flag. D policy unchanged, no hypothetical raise rule. | U4/U5 exact boundary logs/trace and runtime races |
| F8 duplicate reader emission/missed formatter/budget | Web direct contract import; only app emission; run-failure.tsx included among eight imports; reconciled explicit 76-path source/config closure below. No emitted web implementation. | U6 both builds/examples/drift; U8 final path/census audit |

### Reserved product/check/configuration paths

The initial approved reservation was 54 source/config paths, then 55 after the explicit Preview extension. Independent review of the first-parent batch found 21 necessary source/config consumers missing from that record. The corrected union below has **76** paths, including optional and deletion paths. Tests, Markdown, temporary shape and committed contract distribution are separately accounted for. The original 70-file planning ceiling was exceeded; the previous Files-green claim against 55 paths was incorrect.

The existing U6 instruction required deleting the local reader and old aliases while migrating all consumers atomically. Most additional web paths only replace imports from app/http with direct shared-contract imports; project/api migrates the incorporated authorization caller, platform/failure removes the unused causeText writer helper, and knip tracks the new shared owner. The correction-round instruction authorizes reconciling this existing necessary closure, not retrospectively approving a new capability or claiming the old ceiling passed. Completed authorization is not reopened. Distribution under packages/contract/dist follows the existing package build and is generated from the same owner. Future product extensions remain a stop requiring a scoped decision.

```text
apps/hub/compiler-template/generate-client.mjs
apps/hub/src/app-runner/data-plane.ts
apps/hub/src/app-runner/http.ts
apps/hub/src/app-runner/module.ts
apps/hub/src/app-runner/sandbox.ts
apps/hub/src/app-runner/server-manifest.ts
apps/hub/src/app-runner/supervisor.ts
apps/hub/src/app-runner/wire.ts
apps/hub/src/app-runner/worker.ts
apps/hub/src/builder/application-build.ts
apps/hub/src/builder/check/steps/boot-server.ts
apps/hub/src/builder/check/steps/generate.ts
apps/hub/src/builder/check/steps/server-bundle.ts
apps/hub/src/builder/conversation-sandboxes.ts
apps/hub/src/builder/mastra-session-routes.ts
apps/hub/src/builder/run-operation.ts
apps/hub/src/generated/app-failures.ts
apps/hub/src/hosting/application-host-routes.ts
apps/hub/src/hosting/application-invoker.ts
apps/hub/src/hosting/preview-routes.ts
apps/hub/src/http/app.ts
apps/hub/src/http/problem.ts
apps/hub/src/platform/failure-text.generated.ts
apps/hub/src/platform/failure.ts
apps/hub/src/platform/failures.generated.ts
apps/hub/src/telemetry/log-codes.generated.ts
apps/hub/starter-template/files/app/src/lib/errors.ts
apps/web/src/app/attempt-key.ts
apps/web/src/app/failure-state.tsx
apps/web/src/app/failure.ts
apps/web/src/app/foreign.ts
apps/web/src/app/http.ts
apps/web/src/app/route-params.ts
apps/web/src/app/shell.tsx
apps/web/src/features/builder/construir/construir.tsx
apps/web/src/features/builder/construir/lens-preview.tsx
apps/web/src/features/builder/construir/run-failure.tsx
apps/web/src/features/builder/mastra-session.ts
apps/web/src/features/connector/components/integrations-screen.tsx
apps/web/src/features/connector/connector-api.ts
apps/web/src/features/entry/entry-screens.tsx
apps/web/src/features/identity-access/api.ts
apps/web/src/features/identity-access/components/application-access.tsx
apps/web/src/features/identity-access/components/workspace-members.tsx
apps/web/src/features/project/api.ts
apps/web/src/features/project/components/prompt-box.tsx
apps/web/src/features/project/start-project.ts
apps/web/src/features/settings/components/admins-screen.tsx
apps/web/src/features/settings/components/api-key-account.tsx
apps/web/src/features/settings/components/claude-account.tsx
apps/web/src/features/settings/components/google-ai-pro-account.tsx
apps/web/src/features/settings/components/states.tsx
apps/web/src/features/workspace/components/workspace-create-form.tsx
apps/web/src/routes/construir.tsx
apps/web/src/routes/project-integrations.tsx
apps/web/src/routes/project-settings-access.tsx
apps/web/src/routes/project-settings.tsx
builder-skills/conexus-app/references/dashboard.tsx
builder-skills/conexus-app/references/form.tsx
builder-skills/conexus-app/references/list.tsx
builder-skills/conexus-app/references/record.tsx
contracts/api/product/openapi.json
contracts/api/technical/openapi.yaml
contracts/technical/error-model-census.json
contracts/technical/failures.json
knip.jsonc
package.json
packages/contract/src/failure-client.ts
packages/contract/src/failures.generated.ts
packages/contract/src/index.ts
packages/contract/src/operation.ts
packages/contract/src/problem.ts
packages/contract/src/result.ts
scripts/census-error-model.mjs
scripts/conexus-verify.mjs
scripts/generate-failures.mjs
```

## References

Each revision was checked out and read locally, read-only. Machine paths are not part of the public contract. File ranges identify code actually inspected; no remembered web link decides this spec.

| Key | Repository/revision | Inspected source and limit |
| --- | --- | --- |
| P | PostgREST `d42ae9d55d12989cdc2f0fda8d551b07af4e6ab5` | `src/library/PostgREST/Error.hs:84-101,541-600`: central writer/SQLSTATE, also message fallbacks/custom raises. Not a universal no-diagnosis/SQL-rule reference. |
| SA | Supabase Auth `ce9a8eee0cc042be8c7a42981a7ddae631e41d91` | `internal/utilities/postgres.go:12-75`, `internal/api/errors.go:76-79,151-182`: machine SQL field and typed HTTP role, retains messages/details/custom status. |
| BJ | Basejump `7a1f95ccef74eb2e638d5e4233b66b6cbbe175e6` | `supabase/migrations/20240414161947_basejump-accounts.sql:395-459,500-510`: business/authority SQL exceptions. Conexus deliberately follows D §8's TypeScript policy instead. |
| B | Better Auth `0e1a9c8413ff048a617cad81ab67175933ca8c7a` | `packages/core/src/utils/error-codes.ts:30-68`, `packages/core/src/error/index.ts:3-43`: code/text owner and different setup/API roles; no shared reader generator/census. |
| C | cal.com `54343aa685ae8f33159d2f485ec4a57bad5c574a` | `packages/lib/server/getServerErrorFromUnknown.ts:17-30,127-160,202-210`: Prisma machine mapping plus prose fallback, which is not copied. |
| D | Documenso `cd0cc5febcbb76ec7e5ecb75c0b8c65ab8432198` | `packages/lib/errors/app-error.ts:184-322`: internal/received representation and diagnosis; permissive unknown parsing adapted, not copied. |
| M | Mastra fork `ce7e9c30c1fb22ca37936121d88336ccee1f955c` | `packages/core/src/workflows/default.ts:458-517`, `mastracode/sdk/src/error-classification.ts:9-16`, `mastracode/factory/src/server-error.ts:14-30`: plain result around native Error; SDK prose fallback/native message disclosure are contrary examples. No exact worker fact protocol. |
| I/F/Z | Installed core/server1.71.0, fastify-adapter1.5.15, code-sdk1.8.3; Fastify5.12.1/otel0.21.0; Zod4.6.5 | Exact R1/R5/R7 lines; actual source/types/docs and socket probe. OpenTelemetry API `build/src/trace/spancontext-utils.js:35-36` validates 32hex nonzero; browser enforces equivalent boundary. |
| Factory | dev-factory `46afa616eafb54e57fa6ec71a9a3392f0dfb485a` (audit input) | Audit read sandbox composition/cleanup/setup; current study established no exact Result/reader/census mechanism there. Not deciding proof for a new feature. |
| Supabase monorepo | `cb52c0f42565032ab3f1cfb9a48fe4c44aad381e` | Located/versioned; packages/common searched, no relevant generator/Result mechanism established. Never substitute for inspected Supabase Auth. |
| Conexus | Base/main/U1 revisions under Evidence | `operation.ts:66`; runner `server-manifest.ts:26-28,189,249-296`, `wire.ts:27-31`, `worker.ts:81-89`, `supervisor.ts:195-255`, `sandbox.ts:115-133`, `module.ts:57-66`, `http.ts:21-25`; Builder `run-operation.ts:85-113,200-203`, `application-build.ts:35-53`, `conversation-sandboxes.ts:53`; `problem.ts:9`; web `failure.ts:26-63`; generators `generate-client.mjs:65-84`, `generate-failures.mjs:89-141`; `db.ts:148-170`, catalog snapshot:453-456. Current evidence/delete destinations, never architectural authority. |

The standing authority remains roadmap, decision register, product contract, mapped subject guides and delivery Waves, in their owning documents. This spec consumes authorization's interface only and does not certify its draft or edit its content.
