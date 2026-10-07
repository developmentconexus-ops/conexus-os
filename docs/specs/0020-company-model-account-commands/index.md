# 0020. Company model account commands and experience

**Date**: 2026-10-07
**Status**: Approved by the operator on 2026-10-07, commit 1f96d465a15faecdcf240c425a3e513f65e16054
**Lane**: lane:qualification (Q-b authority/custody; Q-c real Builder and Google adapter)
**Wave branch**: wave/company-model-account-commands
**Spec rewrite branch**: wave/model-account-commands-respec → wave/company-model-account-commands
**Study**: Model accounts re-study of 2026-10-07, held privately by firstmate; approved objective/limits/end, with installation Builder default writer added by the operator. This spec is not approved.

## Summary

An administrator connects or removes the company's AI account without making it belong to that
person. Each person uses their own account first; the screen and picker show which account pays.
A refused personal account remains selected until explicitly disconnected. Three provider cards
support the four connection kinds, and the same screen saves the installation's default Builder model.

## Dependencies and accepted choices

Measured main is `5efbc090c43176ca4e666688769d2a4ee09e1745`; this spec branch base is
`674f534896c720d2364175323c02bcb88c5bb019`, whose product tree equals that main. It does not
already contain the scoped schema, core module or any company command. Schema prerequisite
`885addee625db576de92de52d5e0e49aca086cc4` is unmerged. Integrate 0071 before 0018 removes
its `rls.acting_account()` dependency, then rerun upstream catalogs/canaries. Never edit 0071.

This wave starts only after implemented/proved 0017 and delivered 0018/0019 owners merge. Recheck
their exact outgoing contracts at integration; a changed owner returns to firstmate. Actual audited
upstream draft pins: 0018 `0987494fb358b9c8491fae4476cbc16f05099393`, 0019
`b07a99e7d1d7fbd4c24f681befb51a00b92635b0`. Consume their nominal modes, actual RunOwner,
two-parameter Result and table-coded Failure. This wave adds only model-account.manage to the
merged AdministratorScope/input owner and uses it for company account commands and Builder default
writes. It creates no second authority/read/error engine. Current 0018 removes RLS/roles contrary to
current D §6–7; its approved owning resolution is a pre-build gate, not a downstream design choice.

Operator-approved on 2026-10-07: two sequential waves; company ownership independent of the
connecting person; personal-first precedence; all four kinds including Google; scoped controls on the
existing settings screen; truthful refusal with settings link; Empresa payer marker; no silent fallback
from a refused personal account; connecting name/date without disclosing another AccountId.
The study amendment puts **installation Builder default writer** here on that same screen, using
`model.installation_default`; personal and memory writers stay outside. Spec 0008's later slice 2
migration into `{build,memory}` settings is not implemented or redesigned here. Update only its
consumed interface/status to avoid two competing writers. Firstmate authorized this spec-only rewrite
branch and review destination separately. 0017's guarded cutover approval is not repeated or widened.

## Requirements

- **AC-1**: Current administrator admission gates company start/complete/key/remove/default writes; personal writes use current account admission. Deactivating/demoting after start cannot commit. Foreign attempts disclose no provider URL/token/actor data.
- **AC-2**: One selector chooses personal row first, then company, then none for listing, picker, preflight and each actual call. Refused personal rows do not fall through. Preflight opens no secret; a running caller receives unchanged upstream admission errors.
- **AC-3**: Connect/reconnect clears refusal and assigns a new generated generation id while preserving row id; refresh/capture preserve generation. Conditional persist/refusal never overwrites or marks a newer generation/credential. Disconnect deletes only its authorized slot and permits fallback on next use.
- **AC-4**: One in-memory attempt owner drives the existing three native sign-in leaves. It owns deadline/replacement/expiry/close, rechecks authority at completion and frees an abandoned Google login through an existing platform job without another request. It persists no attempt secrets.
- **AC-5**: Definitive provider auth rejection/known-key custody loss can commit guarded refusal. Timeouts, 5xx, malformed responses, network/router-hop failures and CONFIG_INVALID cannot. Classified OAuth uses a narrow pinned transport adaptation while SDK loses status, with a removal trigger. Rotated tokens still persist after run end through 0017.
- **AC-6**: Google uses generated generation identity, opaque local tickets and current row reread. Reconnect/disconnect retires the matching process/tickets without affecting a new generation. Capture uses existing jobs plus before-response/stop capture, tracks last successful persistence and is best effort; no hard one-minute or replica guarantee.
- **AC-7**: Three concrete cards show personal/company state, payer, name/date and refusal; Anthropic combines key/subscription choices. Four concrete flow parts may be shared only where repeated. Current company admin sees its control; others read company coverage. No credentials/connecting AccountId leave the Hub. Composer/replay/runtime show a settings link and Empresa marker from server facts.
- **AC-8**: Current administrator saves installation Builder default from **company-offered** models to the existing build row. New conversations use it through the existing read path; a running conversation is not silently changed. Rejected/personal-only model causes MODEL_NOT_AVAILABLE. Memory/personal defaults are untouched.
- **AC-9**: Retired persisted BUILDER_MODEL_AUTH_FAILED rows normalize forward before code removal; events/failures generate from existing owners. One upstream census is extended, obsolete routes/maps/cards leave with all callers and temporary shape is deleted. Qualification proves actual company/personal Builder behavior before merge.

## References copied

| Mechanism | Reference (commit/file:line) | Kept | Adapted and reason |
| --- | --- | --- | --- |
| Scoped table/current admin | Mastra `ce7e9c30c1fb22ca37936121d88336ccee1f955c`, credentials `mastracode/factory/src/storage/domains/credentials/base.ts:96-118`; config.ts:766-777; oauth.ts:295-297,356-362,416-422 | Separate owner slot, check admin at start/completion | Existing installation table and 0018 admission, no organization service |
| Personal-first | Same Factory base.ts:292-319 | Personal before company | Reject Factory's optional org-first execution exception; one selector every actual call |
| Persistent refused fact | cal.com `54343aa685ae8f33159d2f485ec4a57bad5c574a`, VideoApiAdapter.ts:278-293 | Invalid credential persisted | Generation/spent guards and definitive provider origin; reject unguarded invalid=true |
| Refresh | Factory base.ts:329-352; SDK1.8.3 anthropic.js:85-102, openai-codex.js:139-161,495-505 | Native endpoints/payloads/token extraction; persist before release | SDK loses status, narrow response classification at copied request; one Hub only |
| Attempt lifecycle | Factory base.ts:120-133,355-369 has durable sessions | Deadline/current authority | Reject durable attempt storage without restart-resume product need; one in-memory owner over concrete native handles |
| Three provider cards | Factory UI ProviderAccessSection.tsx:63-115 at same fork commit | Scope and coverage | Three concrete cards/four kinds, Conexus styling and connected name/date |
| Default eligibility | Conexus 0008 index.md:227-236 at main `5efbc090` | Administrator, next-use, refuse model not offered by company | Only build role in existing installation_default now; no general settings registry/slice2 migration |
| Generated Google pool identity/tickets | Not found in examined Factory storage/adapter, Mastra native provider or SDK | Existing local proxy/process/files | One uuid column and opaque retry-stable ticket required by existing Google adapter; no new daemon/service |
| Capture scheduling | Conexus platform/jobs.ts:16-35 at main `5efbc090` | Settled-pass scheduling and close | Best effort 60s delay after pass, no maximum crash window |

All new mechanism options/cost and three-proof verdicts are in rationale. Row custody and native
credential/ModelId ownership are consumed from 0017, not copied/redelivered here.

## Code shape

Shape's credential/secrets imports re-export the actual pinned foundation shape, not second codecs.
compile.mjs extracts foundation and upstream drafts at recorded commits, extends only the proposed
upstream model-account.manage union and generated failure rows for this compile, and runs tsc
--noEmit. These planned extensions are explicit; none is claimed delivered. After integration map
the imports to real owners and run `npx tsc --noEmit -p shape` directly. Negative cases cover
wrong scope/action, timestamp generation, raw ticket, no actor identity and company default admission.
Module includes the actual constructor, routes, jobs and close; usage compiles Hub/Builder/default
consumer calls. Store extends 0017 persistence/reread, preserving typed custody context.

## Design

### 1. Data, commands and shared selection

Add `<next>_model_account_generation.sql`: non-null UUID generation_id, backfill each existing row
once, default for new rows. Connect uses a new UUID even when the same row/timestamp is reused;
refresh/capture never change it. Keep all 0071 ownership/lawful-pair/refused CHECKs and immutable row
AAD from 0017. Store row id, scope/provider/kind, generation and spent ciphertext participate in CAS.
Refusal marks add refused_at only if still current and not already refused. A guarded write with zero
rows changed is superseded, not provider rejection of the newer connection. Commit before emitting
MODEL_ACCOUNT_CONNECTED/REPLACED/REMOVED/REFUSED through existing log-events register; no token,
provider email/actor id in those public settings payloads.

Personal row wins even when refused. Installation wins only when personal absent. Reconnecting
clears refused_at; disconnecting a refused personal row explicitly opts into company fallback. One
selector supplies metadata and use; preflight queries metadata only. Each actual call reacquires under
current OpenRun and Builder records its paying row. No run-long payer pin or personal→company retry.

| Wire operation | Source / authority | Output / behavior |
| --- | --- | --- |
| listModelAccounts | Session admitted read | Three provider entries, both scopes, current payer and admin flag; company name/date, never actor id |
| listAvailableModels | Session admitted read, existing explicit scope=installation query preserved | Personal-first offers normally; scope=installation uses company-only offers, unaffected by caller personal refusal. Response includes installationBuildDefault: null or {modelId,available}; never secret. Native offers have paidBy/needsSignIn |
| setModelAccountApiKey | scope/provider path + strict body | Account or model-account.manage admission, lawful Anthropic key; 204 |
| removeModelAccount | scope/provider path | Current matching authority, idempotent slot removal; 204 |
| startModelSignIn | POST /api/control/model-sign-ins; target scope/lawful pair, Idempotency-Key | Current authority; stable {loginId} receipt, no credential/provider challenge persisted |
| getModelSignIn | GET /api/control/model-sign-ins/:loginId; current caller | Current in-memory waiting/ready handoff/deadline/refused/expired; foreign id neutral expired |
| advanceModelSignIn | PUT /api/control/model-sign-ins/:loginId; caller/login id and concrete flow input | waiting/succeeded/expired/refused; current authority at commit, foreign id neutral expired |
| setInstallationBuilderModel | branded model body | model-account.manage; company eligibility, existing build-role row, 204 |

Contract operation() owns request/response/effects/failures; regenerate schemas/clients. Generic
start/read/advance replace all provider-specific login/status routes **with current card callers in U2**.
Google connection state is part of list; its separate GET/status disappear. Scope is explicit in key
and delete routes; no implicit personal compatibility endpoint. The selected model list/default view
can include an existing default now unavailable, labeled unavailable; save refuses it. A default
is a model id, never an account pin. A person's own account can still pay for that model on use.

### 2. Attempts and current authority

Reuse the existing platform/receipt.ts reserve/complete owner and admission.receiptOf, not a new
idempotency store. Start takes contract IdempotencyKey, scoped by operation+caller authority and the
exact target slot/pair in its request fingerprint. Under a short admitted transaction reserve and complete
only {loginId}; commit before external work. The owner claims the fresh receipt's id in memory once,
then starts native work outside the transaction. Same-key retries return that same id, changed payload
is IDEMPOTENCY_CONFLICT, missing key is IDEMPOTENCY_KEY_REQUIRED. A replay never opens a new
native handle. GET then supplies the live handoff (or waiting while initialization settles). Persist no
URL/device challenge/verifier/token/native attempt; after restart or expiry the old id reads expired,
so a new key is required. This preserves retry semantics without durable attempt-secret storage.
Reuse web useAttemptKey per target and keep its key on ambiguous transport failure. Test dropped
POST response/retry, concurrent retries, conflicting target and restart replay with one native start.


An attempt stores private initiating AccountId, slot/provider/kind, concrete native handle and deadline.
Start admits before opening provider work; it performs no network I/O holding a database transaction.
Completion/advance verifies caller/flow, then current authority before connection commit. The attempt
owner serializes only its own transition/replacement/expiry, not unrelated login/provider I/O. Native
close is idempotent and called on success, failure, expiry, replacement and module close. Platform job
expires abandoned handles even if no user polls; keep the bounded process-exit timeout, remove the
private expiration timer. No persisted login-session schema, queue or generic workflow.

Native provider fields and callbacks remain their existing owner mechanics. Correlate returned pair to
the target before connect; a mismatch is a platform/adapter fault, not a credential silently in another
scope. A demoted administrator cannot finish a company attempt; personal authority is separate.

### 3. Refusal, refresh and historical failures

Consume 0017 row-local serialization, post-run persistence and fresh per-waiter release. Definitive
refresh refusal is only authenticated provider response with recognized OAuth auth rejection
(e.g. invalid_grant); 400 alone, 401 text or Exception.message is insufficient. Copy only installed
Anthropic/Codex refresh request mechanics where the SDK currently drops response status/body.
Keep endpoint/client/payload/token semantics pinned with fake fetch; bound/sanitize body parsing.
Transient/unknown/malformed response remains unavailable. Delete this adaptation when an installed
native SDK API exposes equivalent structured results; pin/version drift reopens it rather than guessing.

On direct provider calls, create the narrow provider-call classifier at this model boundary with verified provider-origin
evidence; 0019 supplies canonical Failure/Result and explicitly defers vendor classifiers, not this implementation; do not classify by a message regex or generic 401. Unknown configured key stays CONFIG_INVALID.
Mark custody/provider refusal in a separate owner system transaction only **after** the caller transaction
finishes, avoiding self-deadlock. The row/generation/spent guard prevents a reconnect being marked.

Add generated failure rows for required/changed/personal-refused/installation-refused, narrow provider
sign-in refusals and MODEL_NOT_AVAILABLE in contracts/technical/failures.json; add structured events to
contracts/technical/log-events.json before use. Remove BUILDER_MODEL_AUTH_FAILED only after a forward
migration normalizes historical builder.run failure_code occurrences to INTERNAL_UNEXPECTED, preserving
rows and other existing codes. Historical data cannot reliably recover provider/scope; don't fabricate it.
RunRow enum and transport/browser links use the new generated owner, not a private union/runtime registry.

### 4. Google generation, tickets and capture

Use {modelAccountId,generationId}, never connectedAt/hash of changing credential bytes. Local acquire
accepts one Google-specialized held snapshot and derives row/generation/credential from it; no independent identity inputs. It retains current owner persistence callback and spent context. Opaque random tickets map
only within this Hub to that generation/lease; ticket bytes carry no credential and are not auth for the
public Hub. Keep them valid across the SDK's retry sequence until generation retirement/lease end;
a reusable SDK retry is not consumed by first request. Fresh row authority still controls model acquisition.
On retire, reject new requests, allow in-flight work to settle/capture and close only that generation.
Reconnecting with an equal timestamp must get a different process/ticket owner. Existing instance lock
precludes two Hubs; spent CAS is no distributed token-spend guarantee.

Retain CLIProxyAPI binary verification/protocol, local 0600 credential files, boot orphan sweep, idle
cleanup, bounded exit wait and close. Replace encoded-secret routing header and instance hash; retire
record→HeldAccount write-back map into the generation entry with advancing spent context. Capture
before successful response completion when available, on normal close and in existing jobs. Record
last successful persistence without credential bytes; CAS losing to reconnect is superseded. Every
periodic pass rereads current state and closes abandoned login/retired processes through owner jobs.

A router-generated 401 or arbitrary CLIProxyAPI 401 is not enough to mark provider refusal. Exact
adapter/provider error origin and two refresh rotations require real qualification before acceptance.
No suitable structured provider-origin contract was found in the examined adapter path; if the bounded
qualification cannot establish it, stop and bring measured options to firstmate rather than mark on a
proxy status or claim the behavior proved. Capture is best effort: scheduler waits 60s **after** a settled
pass; hangs/errors/crashes can lose more than one minute since last persistence. No hard loss bound.

### 5. Screen and installation default

U2 migrates all existing four card API consumers; U7 then replaces them with three concrete cards:
Anthropic key/subscription choice, ChatGPT device code, Google callback. Scope control stays in the
existing Models screen. Server facts own payer, needsSignIn, name/date, scope and admin ability;
the browser derives no ownership/authority. Four small concrete flow parts may share actual repeated
markup/state; no generic provider renderer or workflow builder. One query invalidation owner refreshes
list/offers/default after success/removal. Refused state gives a reconnect/disconnect action and settings
link in composer/replay/runtime; ordinary users read company coverage without writer controls.

The default control saves only the build-role model id from current **company** offers under fresh
administrator admission, preserving existing memory role and next-use conversation behavior. It never
uses the administrator's personal-only availability as company eligibility. Use existing table/query;
no new settings service, duplicate default table or 0008 slice2 engine. Invalid/removed/refused company
offer cannot be newly saved; show existing unavailable default truthfully and refuse new unusable choice.
Document that no available company model means connect a company account before saving a default.

## Deletes and census

Current main baseline: 16 Builder credential owner files, four separate cards, three local JSON parsers,
seven Caller/LoginState **aliases** (not seven proven state-machine owners), two timers (expiration plus
bounded process exit), two persistence consumers, two native parse calls in owned subjects. Foundation
removes ownership/parsers and preserves persistence/native mechanics; do not claim these are newly
replaced in 0020. U1 remeasure delivered foundation, recording new baseline before commands.

Extend scripts/check-model-account-census.mjs from 0017; no second scanner or duplicate credential/
secret/dependency preview. Add exact retired login exports, old Google record routing/hash/write-back
map and four old card paths. Target zero obsolete maps/private expiry timers/old routes/cards after their
units; keep existing process exit timeout as named allowance. Core provider JSON parsers/legacy names/
Builder imports remain zero. Types enforce lawful registry variants; event/failure generation uses current
CI. U7 tests a clean fixture plus moved parser, retired API, stale card and old runtime-header, extra-codec and duplicate-selector defects. The selector check proves exact named API/table ownership, not semantic equivalence of arbitrary code.

Deletes: implicit-personal wire with all callers U2; duplicated selection U3; three vendor attempt maps/
Caller/LoginState duplicates/private expiry timer U4; blanket auth failure and unstructured refresh wrapper
U5 (after historical migration); hash/header/write-back map and timestamp generation U6; four old card
paths and temporary shape U7. Keep bounded native exit timeout and license attribution. Manifest counts
actual changed paths including old+new, records generated/test/guide paths separately; max70 product
files, seven units, 51 actual product paths. No invented “final identity” discount or omitted default/event/migration/job consumer.

## Units

Each card names the exact product paths in shape/file-budget.mjs, plus tests/guides below. Run its
behaviors/types/census and npm run verify:quick before one green commit. A file outside the allowlist
is a spec correction, not hidden build appetite. Read the card, cited Design and shape; no later unit
contract is required. Foundation APIs remain delivered authority, not rewritten previews.

### U1. Pin delivered foundation and present settings before commands

- **Already there**: Implemented/proved 0017/0018/0019 on actual main, correct schema order. Current provider/thinking/model-account-routes/account/IAM suites and foundation consumer proof.
- **Creates**: Only missing characterization in those suites: personal payer, refresh after run end, exact default build/memory reads, current four-card interactions, native Google boot/close/capture. Record reused test names and actual foundation census.
- **Satisfies**: AC-2/5/6/7/8 baseline.
- **Files**: U1 zero product paths; tests/implementation/model-account-routes.test.mjs, model-account.postgres.test.mjs, builder-anthropic.test.mjs, builder-openai-codex.test.mjs, builder-google-ai-pro.test.mjs, builder-thinking-level.test.mjs; settings browser test from delivered owner (if absent create model-accounts.browser.test.mjs).
- **Copies**: Existing native boundary, not source-text assertions.
- **Guide sections**: C §4–5; T §1–4/6–7/9–10; L Waves.
- **Deletes**: No product surface.
- **Proof**: Green on real integrated main before commands; correct build/memory defaults remain distinct. No assertion of company behavior before U2/U3.
- **Out of scope**: Provider/E2B effects during pin without authorization.
- **Stop if**: Foundation outgoing contract or baseline differs; fix owning spec before building this wave.

### U2. Replace wire and connect/remove both scopes with real callers

- **Already there**: U1 and complete delivered core/persist/lifecycle, lawful credentials and row contexts. Read Design §1/2.
- **Creates**: Resource POST/read/advance with existing receipt-backed stable login id and Idempotency-Key, real browser read consumer (Design §2); model-account.manage in actual merged admission owner, scoped store commands and generic wire operations; connected metadata/events/failure registration. Create/backfill generation UUID column/brand and assign a new id on every connect here, before later refusal/pool consumers. Rewrite all current four card API calls in this commit using existing native leaves; current attempts still own their existing lifecycle until U4 replaces it.
- **Satisfies**: AC-1/3 commands and AC-7 wire; AC-9 event ownership.
- **Files**: U2 manifest, generated contract outputs; tests model-account-routes, model-account.postgres, installation-administrator.postgres (delivered suite), model-accounts.browser and new model-account-generation.postgres.test.mjs. Guide interfaces H/A/S and C-032 company command status only.
- **Copies**: Scoped/current-admin reference rows.
- **Guide sections**: C §3–8; D §5–8; S current authority; H operation contract; V Settings; T §4/6–7.
- **Deletes**: All replaced provider-specific endpoints/callers and implicit-personal wire together; no aliases.
- **Proof**: Before scope controls are implemented, present a usable clickable scoped settings structure to the operator through firstmate under L, receive its approval, then build its consumers. This is a distinct future usable-surface gate, not implied by study/spec approval. Verify its real-browser light/dark states under T §8. Personal caller writes only own row; admin writes company, demoted/deactivated completion refuses; ordinary user cannot key/remove company. Missing/conflicting idempotency key fails; dropped start response retries to the same login id/one native start, replay after owner restart reads expired rather than starting blindly. Current cards still connect all four kinds and remove either authorized scope. Secret-free payload contains name/date, no connecting id/email. Refusal reset happens on connect only. Generation schema/assignment is delivered here; refresh/capture preserve it. Same timestamp reconnect proof runs here, before guarded refusal.
- **Out of scope**: New selector, shared attempt owner, refreshed transport or card consolidation.
- **Stop if**: Upstream admission action cannot be extended in its owner or current consumer cannot move in same green commit.

### U3. Use one payer selector and secret-free preflight

- **Already there**: U2 scoped rows/metadata/current writes; delivered OpenRun/Result. Read Design §1.
- **Creates**: accountInUse personal→installation→none across list/offers/preflight/modelFor. Refused metadata stays selected and creates new failure/settings-link response from generated codes. No persistent mark yet; tests seed existing refused_at.
- **Satisfies**: AC-2/7 payer.
- **Files**: U3 manifest; tests model-account.postgres/module/routes/thinking, composer/session runtime tests. Guides P delivered status, A ownership and C-032 only where truth changes.
- **Copies**: Personal-first reference, rejecting Factory org-first exception.
- **Guide sections**: C §4–8; A §4–5; H wire; S current caller; T §4/6–7.
- **Deletes**: Every duplicate selection function and run-long payer assumption.
- **Proof**: Own usable beats company; own refused fails without company retry; absent own uses company; absent both required. Disconnect own switches next call; two calls record exact different payer ids. Preflight envelope.open spy remains zero. Ended/deactivated run retains actual admission code.
- **Out of scope**: Refusal write, generation pool or default writer.
- **Stop if**: Selector requires secret opening or a call pins payer for a run.

### U4. Own sign-in transitions and abandoned expiry once

- **Already there**: U2 live generic routes/consumers, three native leaves; U3 authority/selection. Read Design §2.
- **Creates**: In-memory attempt owner and platform expiry job returned by existing module.jobs. Exact native handoff/advance/close handles; current admission at final connect.
- **Satisfies**: AC-1/4.
- **Files**: U4 manifest; tests provider suites/routes/module plus model-account-attempts.test.mjs.
- **Copies**: Current-authority reference and native provider handles; rejects Factory durable table.
- **Guide sections**: C §4–8; A lifecycle; D transaction lifetime; S; T §4/6–7.
- **Deletes**: Three private attempt maps/state aliases and private expiry timer, all native consumers migrated now. Keep bounded process exit timer.
- **Proof**: Native four kinds still work; advance twice/replace/expire/demotion races converge to one connection, no transaction spans provider I/O. No-request Google expiry invokes native close and removes process/files. Foreign caller sees expired; module shutdown closes handles once.
- **Out of scope**: Durable attempts, general workflow or provider refresh.
- **Stop if**: Native handle cannot close without another request or serializing unrelated provider I/O becomes necessary.

### U5. Classify auth facts and persist guarded refusal

- **Already there**: U1–U4, delivered owner CAS/post-run release and existing failure owner. Read Design §3.
- **Creates**: Narrow Anthropic/Codex refresh response and provider-call adapters at this owner, using 0019 Failure/Result but no assumed vendor classifier; owner guarded markRefused and failure/event rows; forward historical-run normalization before removing enum code. Changed custody reread carries row/spent from 0017.
- **Satisfies**: AC-3/5/9 refusal and data compatibility.
- **Files**: U5 manifest, generated mirrors; tests provider/routes/model-account.postgres, builder-conversation-rows, builder-runtime.test.mjs and native harness retry tests, new model-account-failure-migration.postgres.test.mjs.
- **Copies**: SDK pinned request mechanics and persistent invalid fact, adapted with guards.
- **Guide sections**: C §4–8; D migrations/transactions; H failures; S fault semantics; T §4/6–7.
- **Deletes**: Unstructured SDK refresh wrapper only for these two exact requests, message-based refusal, BUILDER_MODEL_AUTH_FAILED after normalization. No compatibility runtime code. Migrate runtime.ts auth producer: definitive current row refusal escapes with its scoped canonical code; unproven generic Mastra auth returns no invented account-refusal fact and uses the existing ordinary failure fallback. All references to retired code, including producer tests, reach zero.
- **Proof**: Fake response invalid_grant definitive vs 5xx/network/malformed/unknown transient; pair tokens/expiry preserved. Reconnect between refusal observation/write not marked; custody marks only current spent row; missing key never marks. Historical run parses after migration. Two waiters still get current admission, rotated tokens persist after run end. Separate mark transaction has no self-held conflicting lock.
- **Out of scope**: Generic OAuth/error engine, replica guarantee, marking arbitrary Google/proxy401.
- **Stop if**: SDK mechanics drift or response cannot establish provider auth origin.

### U6. Give Google connections explicit generation and bounded native lifecycle

- **Already there**: U5 owner persist/refusal and current native pool/protocol; job owner. Read Design §4.
- **Creates**: Consume U2 generation UUID schema/connect assignment; generation-keyed pool, retry-stable opaque ticket, advancing capture context; existing jobs periodic capture and last-success record.
- **Satisfies**: AC-3/6.
- **Files**: U6 manifest, generated catalog; tests builder-google-ai-pro, model-account.postgres, model-account-routes, U2 model-account-generation.postgres.test.mjs and generation/capture cases in native fake adapter.
- **Copies**: Existing native protocol/files, no reference exact mechanism found; adapt only required identity/lifecycle.
- **Guide sections**: C §4–8; A §5/11; D §8; S credential files; T §4/6–7/9–10. Update A/C-027 disk lifetime/crash facts precisely.
- **Deletes**: Timestamp/hash generation, encoded credential header, record write-back map and old acquire consumers.
- **Proof**: Same row/same timestamp reconnect gets two generation ids; refresh preserves id. SDK retry reuses ticket while old generation retirement rejects it; new generation unaffected. Rotation→capture→restart fake test; reconnect CAS wins; after-run close persists; no-request expiry/orphan/idle/shutdown clean native processes/files. Failure/origin qualification below remains gate, no fabricated proxy-origin proof.
- **Out of scope**: New proxy service, hard minute bound or multiple Hub processes.
- **Stop if**: Adapter does not expose sufficient rotation/origin facts; bring measured alternatives through firstmate before narrowing Google behavior.

### U7. Finish three cards and installation Builder default, then close

- **Already there**: U1–U6 complete commands/selection/attempt/Google owner; existing default table/read path and company offers. Read Design §5.
- **Creates**: Three concrete cards and repeated flow parts, scope coverage/payer/refusal UX, default control and setInstallationBuilderModel operation/store write. Extend existing census and CI; production-bound negative cases.
- **Satisfies**: AC-7/8/9 and final AC-1–6 regression.
- **Files**: U7 manifest; tests model-accounts.browser, model-account-routes/postgres/census/types, composer/session runtime; guides V/A/P current screen/default status and 0008 consumed next-use build interface only. Delete all shape files.
- **Copies**: Provider card and default eligibility reference rows.
- **Guide sections**: C §4–8/10–11; V Settings; H wire; S admin; T §4/6–7/9–10; L Waves.
- **Deletes**: Four old card paths/duplicated flow markup, duplicate query invalidation and temporary shape. No generic renderer/checker framework.
- **Proof**: Before implementing shared three-card/default pieces, obtain operator approval of the usable clickable structure through firstmate (L), then verify actual light/dark browser states under T §8. Study/spec approval does not substitute. Admin connects company in all kinds; ordinary user reads coverage/name/date. Personal refusal stays chosen with settings link, Empresa marker matches actual payer. Save company-offered build model, reject personal-only/foreign/unavailable, next conversation uses it; current conversation/memory role unchanged. Browser usable states and DOM accessibility under V/T. Census zeros and representative defect fixtures; actual-owner shape/type negatives, path receipt, verify:quick.
- **Out of scope**: Personal/memory writers, configuration registry/slice2 migration or unrelated settings UI.
- **Stop if**: Default needs a different owning data/service contract, reference screen cannot fit current product or total paths exceed70.

## Qualification and what breaks the premise

conexus-prove runs after the units and before merge. Obtain separate operator authorization for real
provider/E2B turns; none is authorized by this writing task. Prove a real company-paid call, personal
precedence, native stream/payer record and truthful refusal/settings navigation. Google requires real
two-refresh rotation/capture/restart and a verified provider-origin rejection distinction; private receipt
must identify exact binary/SDK versions and last successful persisted generation. A skip is not proof.
Existing code/fakes prove baseline behavior only. If the adapter cannot provide required facts, return
measured keep/replace/remove options, cost and recommendation before changing accepted Google scope.

Premises: one live Hub instance, stable native protocol, delivered upstream proof/custody/persist,
correct schema-before-0018 ordering and no restart-resume attempt need. Any falsified premise, new
product decision, unfinishable one-session unit or >8 units/70 paths stops for firstmate. No compatibility
shim, silent fallback, inferred auth cause or claimed unperformed proof.

## Non-goals

Personal/memory default writers, full 0008 settings implementation, per-person company membership,
quota/cost metering, second company/Hub, queue/workflow/service, building units in this task, pilot
reset/credentials, touching authorization spec internals, merge or real E2B/provider work without its gate.
