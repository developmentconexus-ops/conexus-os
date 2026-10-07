# 0019. Rationale: one failure contract across the application runner and clients

## Context

The approved study found a sound closed code table surrounded by competing carriers. A worker sent code and optional text; the runner turned those into a problem body plus detail; the Hub forwarded the body; a generated client rebuilt a different Error from the detail. A malformed manifest identified its refusal by an Error message prefix. The web and generated application also had different reader classes and fallbacks.

The study's census counted 63 `ok:false` sites with 16 shapes, 27 other failed/refused discriminants, seven parallel error classes outside Failure, six wrappers around the HTTP body writer and five hand-written replies. Those are syntax measurements, not proof that every failed lifecycle state is a branchable refusal. The code-health study §7 had counted five senders; the error-pattern study identified the omitted Fastify sender and the additional forwarding paths.

The failure-table study of 2026-10-03 settled person-facing meaning: one text and action per code, in the table. This wave does not reopen that decision, move text into screens or infer category from a caught exception. Authorization's separate model chooses the code and where it is born; this wave owns the representation.

## Options considered

### The Result shape

A plain `{ok:true,result} | {ok:false,error}` union follows Mastra's workflow decision loop and needs no runtime library. The caller can narrow its own refusal codes and payloads, and a browser/server defect still escapes through Error. The alternative was an error-oriented envelope modeled on SDK `{data,error}` or a Result library. That could provide combinators, but would add a convention or dependency without changing these callers' decisions. The operator chose A on 2026-10-07: the plain readonly Mastra-shaped union with table-backed `E.code`.

The old operation-response `Result<O> = Reply<O>` is not that type. It disappears when the new Result is exported, and its caller uses the existing meaningful Reply name. No compatibility alias remains.

### Failure roles

A universal plain Error could replace every error class, including native MastraError. It would simplify the inheritance tree but discard a working framework integration without evidence of a need. Keeping native Failure for escapes, Result for caller decisions and one ReceivedFailure for the browser gives each role one owner. The operator chose the latter, A, on 2026-10-07.

This is not a numerical rule that every Error subclass is wrong. Better Auth separates programmer/setup failure from API error, while Documenso reconstructs a client representation. The defects in Conexus are two classes/readers for the same received body and thrown classes used as local branch signals. AdapterFailure, BrokerRefusal, check Refused, GitCommandError as a refusal signal, RowEnded and CandidateRefused must disappear in the complete replacing units of model wave 2. They are not retained as adapters to the new representation.

### SQL transport

The historical census found 278 RAISE sites with 73 message codes, 44 outside the table. Assigning each apparent raiser a custom SQLSTATE, or using PostgREST's structured MESSAGE carrier, would be unnecessary if the function body was superseded. The final catalog check found four live functions and no application-code raisers/triggers.

The operator chose C on 2026-10-07: SQL retains structural constraints and no application business rule, and the Hub maps SQLSTATE plus constraint. CI rejects new application-code RAISE MESSAGE definitions. No migration or SQL format change is part of this wave. If a future structural failure needs an explicit custom SQLSTATE, its unique table-owned assignment and forward migration need their own bounded approval; historical migrations remain immutable.

### The HTTP carrier

A native Response works across the installed Fastify and Mastra adapters and avoids another Conexus `{status,headers,body}` carrier. A custom packet would also work but require each adapter to reassemble it. The operator chose native Response A, then required a status/header correction after the actual telemetry probe.

The probe exercised the real Hub HTTP app, failure logging, OpenTelemetry instrumentation and redacting exporters through a real local HTTP socket. It substituted only the final export callbacks to capture their actual input. It did not launch a database, Keycloak, E2B or a provider.

| Variant | Delivered HTTP | onSend | Fastify request span | onResponse | Failure code / count | Security headers |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Existing Reply/body | 404 | 404 | 404 | 404 | PROJECT_NOT_FOUND / 1 | Preserved |
| Bare `reply.send(Response)` | 404 | 200 | 200 | 404 | PROJECT_NOT_FOUND / 1 | Preserved |
| Mirror status/headers, then send Response | 404 | 404 | 404 | 404 | PROJECT_NOT_FOUND / 1 | Preserved |

The outer HTTP span was 404 in all cases. It did not repair the Fastify request span: installed `@fastify/otel/index.js:470-485` ends that span in onSend and reads reply.statusCode. The existing failure log has no HTTP-status field and the exported request span has no failure-code attribute; the probe did not invent either assertion. The code was present in the problem body and in one stdout/exported failure record.

The operator approved corrected A on 2026-10-07: one failureResponse produces the native Response, and the Fastify bridge mirrors its status and headers first. Mastra's HTTPException custom-response path already mirrors both before sending bytes. Its validation hook is synchronous and returns `{status,body}`; the proposed adaptation puts the Response itself in `body`, with its status in the framework envelope. A local actual-adapter probe exercised body, query and path validation failures (each delivered 400 and onSend 400) and the HTTPException handler path (delivered 404 and onSend 404), all with problem+json on the wire. That probe used no database, provider or E2B and did not capture SDK telemetry or failure logs. U1/U5 must still prove those observations with the real instrumentation and responsible log ownership on the built wave, and stop if the path does not work. It must not call an asynchronous JSON reader inside the synchronous hook or introduce another problem-body writer.

### Model wave size

The original two-wave decision was model, then sweep. The instruction to remove every legacy function/name made the complete model inventory exceed the 70-file cap: a conservative required lower bound was 74 product paths, or 72 even excluding the two JSON contract files, before ancillary consumers. Deleting a legacy role requires its producers and consumers to migrate together.

The planning session approved option A on 2026-10-07: split the model into two sequential waves, each independently green, with the catch/INTERNAL_UNEXPECTED/table sweep still separate. The alternative was an explicit exception to the cap. The first model wave therefore owns the shared Result, runner admission/prepare/worker path, single HTTP sender, shared browser reader and sandbox-start row. The second owns complete broker/check/control/account/served-result replacements, field-based vendor classification and consolidation of log registries. No second spec is written here, and no unchecked claim of global legacy removal is made at this wave's end.

## Decision and why

A table-backed code is the identity; a role determines how it travels. Result carries decisions without a typed-throws fiction. Native Failure carries escaping server failures and their private cause. ReceivedFailure carries validated browser-visible identity and the trace reference. HTTP adapters use a single Response and do not guess the failure's status from the module that raised it.

Manifest/tree admission is the first real Result consumer. Its current code-as-message workaround becomes a total parser returning the first refusal, reused unchanged by the runner and check. The worker's narrow nine-code schema keeps an external process from inventing platform identities. Preparation's state/detail carrier moves with all its consumers. A generated app then exercises the same code through the whole application path, rather than proving the new contract with a dummy module only.

The sandbox-open defect fits the server role: opening the production environment failed before source changes, with no recovery decision for an inner caller. A SYSTEM row describes it, says it was recorded and offers no automatic retry. Its mapper belongs around production sandbox start, not a broad catch around checkout or preparation. The existing closed-endpoint verification harness can prove the real user surface without authorizing a real E2B sandbox.

The shared reader's source is compiled and generation-owned. The app cannot import Hub/web modules, so generation changes imports and audience data while keeping the same reader implementation. The existing generator is the packaging reference; an exact multi-target implementation generator was not found in the external clones. Drift checks and building both generated targets are the proof that this is one source rather than two maintained readers.

All product replacement units wait for the authorization merge. The published 0018 shape retains native Failure, its catalog-selected code and a private reason. That fits this model. The full published index at the later revision keeps that refusal representation, explicitly assigns Result/failure modeling to 0019, and confirms overlaps in contract exports, generated failures and Mastra guards. U3 still rechecks the merged contract before product edits.

The census distinguishes identities and occurrences from totals. A count-only ratchet would allow deleting a bad catch in one file and adding the same mechanism in another. CI therefore rejects new legacy-debt occurrence identities, requires removals to lower the committed record, and freezes lifecycle/SDK classifications. The raw count of all catches is informational: a new cause-preserving vendor mapper, rethrow or responsible logger is permitted by the same structural classification, while new swallowing/empty debt is forbidden. This allows the required sandbox-start mapper without creating a location-specific exception. The later model and sweep waves get an executable map of remaining debt and the exact replacement forms; they do not get license to rediscover the model or preserve compatibility.

## Evidence and limits

- The study census was rerun on main `83188b3ace3866fdd1918cfe7ce55ba167b3b3db`; all headline metrics matched the earlier run. Its raw output and the required-path inventory remain in the planning session's private task evidence, outside this repository.
- The code shape compiles in the pinned environment and includes thirteen negative type checks. It demonstrates the contract, operation narrowing, no private wire fields and the framework bridge; declarations do not prove the future implementation.
- The three HTTP variants above have actual captured wire/hook/span/log evidence and literal assertions. This probe proves the carrier premise; it is not the final built-wave qualification proof.
- `npm run verify:quick` passed before the initial shape was committed and pushed; the final `npm run verify:docs` passed all 221 repository tests with zero failures or skipped tests. The spec stage changes only its own folder. It does not edit product code, guides, recipes or another spec.
- Authorization's remote shape was read at `0987494fb358b9c8491fae4476cbc16f05099393`. No conflict was found in its Failure/refusal contract. Its full index and all shape files were reread at that revision; U3 rechecks the merged spec before touching shared paths.
- The final wave proof must observe the actual generated app, application runner, user-facing closed-sandbox failure and exported telemetry on the built head. Any real E2B/provider use still needs separate operator authorization.

## References

Primary clone/source references are listed with their kept/adapted portions in index.md. In addition to those rows, the study reviewed Cal.com `packages/lib/server/getServerErrorFromUnknown.ts:17-30,127-179,207-210`, Supabase Auth `internal/api/errors.go:76-79,142-182`, PostgREST `docs/references/errors.rst:366-460`, and Better Auth `packages/core/src/db/adapter/factory.ts:600-606,825-832`. Their message fallbacks, overlapping status maps and legacy carriers are evidence of drift risks, not mechanisms copied into this model.

Industry sources used for the rules: [Node error.code](https://nodejs.org/api/errors.html#errorcode), [TypeScript unknown catch variables](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html#defaulting-to-the-unknown-type-in-catch-variables---useunknownincatchvariables), [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), [OpenTelemetry recording errors](https://opentelemetry.io/docs/specs/semconv/general/recording-errors/), [Zod safeParse](https://zod.dev/basics#handling-errors), the Effect sources and TypeScript issue in index.md. No conclusion here depends on the study's unverified summary of structured-clone behavior.

The owning Conexus guides read for this design were A, C, D, H, L, P, S, T and V, plus the verify skill and Construir recipe. The spec's unit cards state the exact guide changes; this stage leaves those guides unchanged.

## Independent interrogation and disposition

Two fresh reviewers independently applied the pstack interrogate rubric and code-quality lens against the study, guides, actual callers and compiled shape. The current session’s reviewer configuration selected gpt-6.1-sol and gpt-6-sol, each at medium effort. Neither reviewer implemented product changes.

| Reviewer / finding | Evidence | Disposition |
| --- | --- | --- |
| gpt-6.1-sol / critical: deleted formatter still used by shipped Builder examples | Four `builder-skills/conexus-app/references/*.tsx` examples import `@/lib/errors`; the app/server skills teach those exports and ConexusError | Resolved in U6: migrate all four examples and both skills in the deleting unit, compile the examples against generated code, and check old instructions are absent. Conservatively count the six additional paths: 46 product paths total |
| gpt-6.1-sol / warning: catch ratchet could reject the required sandbox mapper | U2 froze every increase while U7 adds a legitimate vendor-boundary catch around start | Resolved in the census contract: raw catch totals are informational; swallowing/empty and other legacy-debt occurrence sets only decrease. The same structural rule admits valid cause-preserving mappings, without path exemptions |
| gpt-6-sol / no findings | Traced manifest/check/runner/hosting/Mastra/generated-client callers, authorization shape and HTTP probe; compiled the shape and checked thirteen negative assertions | Answered: independent review found no evidence-backed blocker; proposed product behavior still requires built-wave proof |

Both reviewers confirmed the submitted shape compiles; the first reviewer reread both corrections and reported no unresolved finding. The first review also exposed the omitted six shipped paths in the original 40-path inventory; the bounded inventory and standalone U6 card now include them. No finding remains unanswered.

The final budget also reserves telemetry and both OpenAPI generated artifacts in U3, for 49 product paths plus four script/configuration paths: 53 total against the 70-file cap. These outputs are regenerated through their existing owners only when declarations change them; their generators and the deferred log-registry model are unchanged.
