# 0017. Model account foundations and core ownership

**Date**: 2026-10-07
**Status**: Proposed rewrite. The previous approval covers accepted part 1 only; approval of this rewrite opens the new units.
**Lane**: lane:qualification (Q-b row custody and installation configuration).
**Wave branch**: wave/company-model-accounts
**Study**: Approved company model accounts study of 2026-10-06, held privately by the planning session.

## Summary

Model accounts move from Builder to a core owner, on derived credentials and parsed model ids.
Every Hub secret becomes bound to its owning row, and the envelope loses its legacy naming.
This foundation preserves the current personal settings and provider behavior. The approved
installation commands and screen ship in dependent spec 0020, not in this wave.

## Already there

Commit `885addee` built and accepted part 1: `0071_company_model_accounts.sql`, checked scope,
ownership and provider/kind, partial unique indexes, connected-by/name/date and refusal metadata.
The personal SQL consumes those columns. Sharing/history/created_at, plan and the shared wire
field are already gone. Never rebuild part 1 or edit applied 0071. Old part 2 is reference only;
its weak types, test-only external routing seam and incomplete test migration are not carried on.

## Wave dependencies and settled decisions

U1 is the pin and needs no upstream implementation. U2–U4 start only after 0018 and 0019 merge
and main is merged into this wave. 0018 owns nominal AccountScope, RunScope, SystemScope and
BootstrapScope and the one admitted read gate. 0019 owns the canonical Failure/Result contract,
`{ ok: true, result } | { ok: false, error }`, error.code from the failure table, no SQL business
rule, one native Response failureResponse and the cause classifier. Import those owners; do not
build another admission, error engine or sender. 0019 exports were confirmed against pushed shape 3395649f: Result<T, E extends { readonly code: FailureCode }> has two required parameters; Code<C> is its code projection; Failure extends MastraError with id and takes the table code; AccountConnectionAnswer is Result<void, Code<ACCOUNT_INACTIVE | ACCOUNT_NOT_FOUND>>. Domain errors can carry typed row context because E is structural. Import the merged owners rather than copying the preview.
The pushed 0018 shape was checked at `3d70bd7b`; its RunOwner remains its existing upstream type.

The operator approved two sequential waves on 2026-10-07 after independent reviewers found the
combined core/command unit too large. 0020 starts after 0017, 0018 and 0019 merge. Its separate
approval opens its build. Both waves preserve all approved product decisions:

The operator's decisions of 2026-10-06 remain in force:

| Study decisions | Accepted choice |
| --- | --- |
| 1-3 | Company keys and subscriptions; installation ownership without a person owner; personal first on screen and in runs |
| 4-7 | Scope control on the existing settings screen; all four sign-in kinds; refusal notice with a settings link; Empresa marker in the picker |
| 8-11 | Originally one wave; split into sequential 0017/0020 on 2026-10-07; model-account core owner; Google remains with its file risk declared; row-bound AAD for every Hub secret |
| 12-14 | One table and checked ownership; connection metadata and structured logs; preflight opens no secret |
| 15-18 | Checked provider/kind and refusal fields; scoped operations; connecting name/date visible; removal in both scopes |
| 19 | Refused personal account remains selected; disconnect explicitly to use the company account |

The final approved screen groups Anthropic key and subscription in one provider card, leaving
three cards and four sign-in kinds. Each model call selects again. An account is never pinned for
an entire run; Builder owns recording each paying row. The connecting name is copied at connect,
so IAM does not disclose another person's account/email to implement coverage text.

The 2026-10-07 planning-session decisions settle the upstream contracts and naming:

- 0018 owns the nominal admission proof, admitted reads and retained run/system/bootstrap scopes.
  This wave consumes them, including OpenRun's run admission, after 0018 merges.
- 0019 owns Failure and the result union `{ ok: true, result } | { ok: false, error }`, with
  `error.code` from the failure table and one failureResponse returning native Response.
  No shared error engine is designed here. U2 and later wait for that wave too.
- Remove every replaced legacy function/name with its callers, and update its owning guide.
  The operator chose to remove Factory naming from source, key environment variables and the
  persisted envelope discriminator. A new forward migration replaces the four live prefix CHECKs;
  0071 is never edited. No alias or old decoder remains. The operator resets and renames local
  configuration and re-enters the connector credential and model accounts afterward.


On 2026-10-07 the planning session also confirmed canonical Result for hold and reread. Custody
failure carries typed row and spent-sealed context; admission failure retains its upstream code. Only a successful
missing row or changed kind maps to MODEL_ACCOUNT_CHANGED in 0020. 0017 does not add 0020's
persistent refusal mechanism. Any upstream design conflict returns to the planning session.

## Requirements

- **AC-1**: All four lawful credential pairs and values derive from one codec registry. parseCredential uses Zod codecs; parseModelId produces the contract brand before new code operates on an id. Codex email is explicit string or null; Google keeps its existing encoded record validation.
- **AC-2**: Existing personal key/sign-in, provider requests, thinking/memory choice, refresh persistence, streams and paying-row recording remain behaviorally pinned. Every test migrates with its production caller; no old routing export survives only for tests.
- **AC-3**: Model-account, connector, Hub/application session and handoff ciphertext opens only with its own row context. Moving it produces SECRET_CUSTODY_LOST. Redemption reseals from handoff context into session context. Missing key produces CONFIG_INVALID and no row refusal.
- **AC-4**: Source, configuration and live persisted envelopes use secret-encryption.ts, SecretEncryption/SecretEncryptionKey, createSecretEncryption, CONEXUS_SECRET_KEY_FILE/CONEXUS_PREVIOUS_SECRET_KEY_FILES and conexus:secret:v1:. A new forward migration replaces all four live prefix CHECKs. No alias, old decoder or plaintext path remains.
- **AC-5**: apps/hub/src/model-account owns credentials, SQL, provider adapters, routes, jobs and close. It imports no Builder module or table. Builder supplies the admitted run port and alone records paying rows. Mastra receives its native MastraModelConfig.
- **AC-6**: hold and reread return the upstream Result. A deactivated account or ended run receives no tokens from a reread; admission failure preserves its upstream code rather than pretending the row changed.
- **AC-7**: Owning architecture/security/backup/configuration/decision guides name the delivered core and custody rule; scripts keep legacy paths, weak parsers and custody names at zero. 0020 remains explicitly undelivered.

## References copied

| Mechanism | Reference | Kept as is | Adapted, and why |
| --- | --- | --- | --- |
| Two scopes and unique slots | Mastra fork `mastracode/factory/src/storage/domains/credentials/base.ts:96-118`, revision `ce7e9c30c1` | One row per provider per scope | Installation replaces organization; explicit scope CHECK prevents illegal ownership |
| Administrator writes | Same fork `mastracode/factory/src/routes/config.ts:766-777`, `oauth.ts:295-297,356-362,416-422` | Recheck at start and completion | Conexus admission locks current authority through commit |
| Own first | Same fork `mastracode/factory/src/storage/domains/credentials/base.ts:292-319` | Personal precedence | One function also serves runs; the Factory's org-first run exception is rejected |
| Provider card and coverage | Same fork `mastracode/factory-ui/src/ui/domains/settings/components/ProviderAccessSection.tsx:63-114` | Scope control and covered account | Three cards; current installation flag; name/date and refusal shown from the row |
| Core module and writer | `apps/hub/src/registry/module.ts:8-39`, `connectors/store.ts:86-105` at main `017133fc` | Frozen operations, explicit proof | Model account owns SQL and takes Builder's run port |
| Credential and model parsing | Installed `@mastra/code-sdk` 1.8.3 `dist/auth/types.d.ts:4-9,74-81`; Mastra core `packages/core/src/llm/model/provider-registry.ts:392-413` | Vendor fields and model-string parsing | Zod codecs and derived union parse once; branded contract model id |
| Own refresh requests | Installed SDK `dist/auth/providers/anthropic.js:18-20,131-156`, `openai-codex.js:36-39,160-226,483-491,543` | Exact endpoint, client id, payload, token extraction | Classify structured status because the installed refresh API loses the cause |
| Row custody | cal.com `packages/lib/crypto/keyring.ts:90,121`, `packages/features/credentials/services/CredentialDataService.ts:26-32`; Tink context binding and AWS KMS encryption context | AEAD associated data | Natural row key, not only credential type; every Hub owner |
| Refusal fact | cal.com `packages/prisma/schema.prisma:329`, `packages/app-store/webex/lib/VideoApiAdapter.ts:285-293` | Persistent invalid credential | Generation and spent-secret conditions avoid marking a newer sign-in |
| Generation pool and minute capture | Not found in Factory, Mastra Code or installed SDK; examined in the approved audit and refresh study | Existing CLIProxyAPI adapter protocol | Required by AC-14 and the approved crash-loss boundary; no new execution engine |

## Code shape

Run `npx tsc --noEmit -p docs/specs/0017-company-model-accounts/shape` with the pinned toolchain.
credential.ts derives the pairs/values and model brand; secrets.ts binds owner and row;
store.ts is the personal admitted store/run port; module.ts is the native core boundary;
usage.ts shows Builder and handoff callers; negative.ts proves illegal construction fails.
dependencies.ts is a temporary declaration-only preview of the upstream signatures and must
never become a second production owner. Import the merged owners during build. A unit moving
an imported owner repoints shape in that commit. Every unit compiles shape; U4 deletes it and
compiles/tests real owners. No product test imports shape.

## Design

### 1. Accepted schema and forward custody migration

0071 is Already there. U3 adds the next forward migration, with needs:aprovo. Verify the exact
catalog constraint names, drop by name without CASCADE, and replace the live prefix CHECKs on
connector.connection, iam.handoff, iam.host_session and model.model_account. Refuse nonempty
connector/model-account credential tables; DELETE session and handoff rows before validating
new CHECKs. Regenerate catalog/migration mirrors using their scripts. Never edit applied history.
The operator resets the local Hub, renames the local key variables and re-enters the connector
credential and model accounts. Key bytes stay the same. Builders never perform those local pilot
actions. A requirement to preserve live data stops this design; no dual decoder/re-encryption.

### 2. Custody

Copy the existing AES-256-GCM engine, key-id derivation, configured-key rotation and fingerprint
semantics. Add required context and setAAD; remove plaintext fallback. AAD bytes are
JSON.stringify(['conexus-aad-v1', owner, ...binding]). The compiled signatures in secrets.ts are
the only signature owner. ModelAccountBinding uses U2 CredentialKind and scope/owner fields;
it needs no later Slot type. Its binding is [scope, ownerAccountId or 'installation', provider, kind].
Connector binds connectionId. IAM binds session/handoff token digest. Platform owns strings and
the cipher, not domain row ids. Contexts live in current accounts.ts, connectors/store.ts and
identity-access/session-core.ts; U4 moves the model context into the final store.
Current IAM calls are hub-session.ts:53,64, application-session.ts:62 and session-core.ts:70,77.
Compiler errors find every remaining call. Handoff DELETE RETURNING, mint, reseal and session
INSERT stay in the existing authentication gate. Known-key tag failure is SECRET_CUSTODY_LOST;
unknown/missing configured key is CONFIG_INVALID. Preserve reference license attribution.

### 3. Strong types before the move

One registry derives CredentialKind and Credential from its codecs. parseCredential/encodeCredential
are record-edge conversions; the return type preserves the input provider/kind pair. Implement
the generic overload with checked exhaustive lawful branches and literal round-trip tests; no provider-local weak JSON parser remains. parseModelId uses Mastra's
parser and the contract ModelId brand. ModelRole is a contract schema. Google validates encoded
filename, size bound, JSON and Antigravity discriminator with its existing codec; do not invent a
new vendor record. Invalid stored pairs/values become 0019's table-coded failure, never ZodError.
U2 migrates all current consumers before U4 moves those subjects. No external weak shape survives
for tests. The credentials, model ids and native model type drive every new implementation.

### 4. Behavior-preserving core

module.ts composes explicit dependencies into frozen operations. Store SQL is personal-only in
this wave; accepted installation rows remain schema capability, not delivered commands. Existing
list/start/complete/poll/settings wire operations remain real product operations used by the UI.
Keep their current observable behavior until 0020 replaces them with callers in one unit; do not
add duplicate endpoints or retain exports solely for tests. Move strong provider leaves, refresh,
Google composition/router/jobs and close under the core. Rename live implementation vocabulary
as it moves; preserve native provider mechanics and pool lifecycle until 0020's replacing units.

Builder supplies OpenRun, reopening its own admitted run for later refresh reads/writes. The core
never joins Builder's tables. hold returns canonical Result; its custody error contains the typed
row, so 0020 can commit a refusal separately. reread returns Result of present/gone; failure of
run admission stays in the error arm. A successful missing row is gone. Provider model resolution
returns model plus modelAccountId; Builder records that row, and unwraps canonical failure only
at Mastra's native resolver boundary using 0019's owner. No new result/error class is written here.

| Operation | Input source | Output/refusal |
| --- | --- | --- |
| modelFor | Builder OpenRun, parsed model id, contract thinking level | Native Mastra model and paying row through Result |
| personal key/sign-in routes | authenticated account/display name, current contract fields | Current wire shapes and codes; no installation writer |
| list/defaults/offers | authenticated account through admitted read | Current secret-free wire values |
| hold/reread | Builder's fresh admitted run | Held row/present/gone or upstream canonical error |
| handoff redeem | returned handoff, minted token digests | Resealed session token; no plaintext in caller |

### 5. Security and proof scenarios

Personal writes are admitted for the caller. Every read uses 0018's gate. No response/stream
includes a credential; a foreign login id gives the current no-disclosure answer. Zero model/E2B
calls are needed for U1–U4; real external proof needs separate operator authorization.

- Literal provider request/stream, thinking and memory fixtures plus two exact paying row ids pin personal behavior (**AC-2/5**).
- All four registry pairs round-trip; illegal pair/value and bare model id fail (**AC-1**).
- Move ciphertext across two rows per owner; correct/retired key opens, changed row fails; handoff HTTP redemption reseals (**AC-3**).
- PostgreSQL seeded old-prefix session/handoff rows are deleted before CHECK replacement; nonempty credential tables abort; new prefix accepted and old rejected in all four columns (**AC-4**).
- Deactivate caller/end run between rereads; no token escapes and the admission code is unchanged (**AC-6**).
- Import law rejects a Builder import under core; every old routing test calls the new actual boundary (**AC-2/5/7**).

## Deletes and census

The executable census counts the replaced model-account/provider subjects and live custody names.
Baseline on accepted part 1 plus main: 42 top-level arrows, 3 functions over 80 lines, 3 suppressions,
5 plain id declarations, 3 local JSON parsers and 16 legacy Builder files and 72 live custody-name matches in the studied subjects.
The narrowed foundation census inspects 37 current product files, of which 18 are structural; web-card consolidation belongs
to 0020. One JSON codec in the final credential owner is allowed; provider leaves contain none.
No live Factory envelope names remain in source/configuration/fixtures/scripts/security/backup docs;
historical migrations/specs and license attribution are records. The census excludes its own detection dictionary and tests/fixtures/secret-custody-retired.json, the one retired-format/configuration negative fixture, plus the exact historical 0070/0071 migration tests iam-owner-migration.postgres.test.mjs and company-model-accounts-migration.postgres.test.mjs, whose literals are not live consumers. The actual old discriminator is mastra:factory-secret:v1:. Scan tests/implementation and tests/fixtures as well as live code. A clean-final fixture and a live-old-name defect fixture prove the checker. AST leaf tokens preserve regex literals and ignore source comments. Comments are ignored so license attribution is retained; owning guide prose is still checked. Structural targets cover subjects
replaced here, not unchanged Builder/IAM declarations. U4 installs the executable check into CI, inlining the budget file list before deleting shape,
and proves each counter with a fixture that makes it fail. Existing Knip and import law remain.

| Delete | Unit | Every caller moves to |
| --- | --- | --- |
| Weak credential/token shapes and provider JSON parsers | U2 | Derived codecs and parseCredential; strong model ids |
| Factory envelope functions/types/configuration/prefix and plaintext/context-free access | U3 | Typed row context, SecretEncryption names and forward CHECKs |
| Builder model-account/provider paths, createModelRouting/ModelRoutes/ModelRoute/takeFrom/routeOf/Taken/take | U4 | Core module/modelFor; Builder native resolver and paying recorder |
| Store withRun/RunContext/ADMISSION_REFUSALS/ownerId dependency and Builder joins | U4 | OpenRun and 0018 proofs |
| Builder-owned Google composition/router/jobs/close and old pool function naming | U4 | Core composition; behavior preserved |
| Temporary shape | U4 | Actual owner code and negative type fixtures |

Run shape/file-budget.mjs for the explicit handwritten product-path union (limit 70) and per-unit
lists. A renamed subject counts once at its final path; tests/guides/generated mirrors and pure
deletions are reported separately. Every caller edited is counted; no new subject without the
planning session. U4 is a mechanical move after U2/U3, not a scoped-command implementation.

## Units

Each fresh builder reads its card, the cited Design sections, References copied and shape.
Run card tests, shape tsc and npm run verify:quick before each green commit. Use generation scripts
for mirrors. No suppression, cast, weak Conexus id or production export kept solely for a test.

### U1. Pin existing personal behavior

- **Already there**: 885addee; builder-anthropic/openai-codex/google-ai-pro/thinking-level/session-routes tests, model-account.postgres.test.mjs and IAM/connector custody suites.
- **Creates**: Missing behavioral cases for provider headers/payloads, memory choice, streams/no-secret responses, exact paying rows, login ownership/expiry, refresh persistence, stopped/deactivated reread, handoff redemption. Use existing tests where they already pin the surface; list each deciding test.
- **Satisfies**: AC-2 baseline, AC-3/5/6 regression baseline.
- **Files**: Named tests and fixtures only. No product paths.
- **Copies**: Existing provider and owner test boundaries.
- **Guide sections**: C §4–5, T §1–4/6–7, L waves.
- **Deletes**: Source-reading assertions replaced by behavior where this pin relies on them; no production export.
- **Proof**: Current main personal cases green, then accepted wave head with 0071 PostgreSQL expectations. Because 885addee is not on main, its schema-specific cases run only on the accepted wave head. Two calls record two literal row ids; foreign callers/streams expose no token.
- **Out of scope**: New scopes, custody semantics or provider network/E2B calls.
- **Stop if**: Pin needs a product change or contradicts approved behavior.

### U2. Put every credential caller on the derived types

- **Already there**: U1, 0071; merged 0018 proof/read owner and 0019 failure/result owner.
- **Creates**: Design §3 and credential.ts. Contract ModelId and ModelRole; derived CredentialKind/Credential; parseCredential/encodeCredential/parseModelId as input edges.
- **Satisfies**: AC-1/2.
- **Files**: Contract ids/model-account/index; current builder/model-account providers/accounts, three provider credential/route/model leaves, oauth-holds/model-routing and its model-input callers/fixtures. Keep current subjects until U4. file-budget.mjs lists final identities and this unit's callers.
- **Copies**: Credential/model parsing reference.
- **Guide sections**: C §3–6, H §1/8, A native first.
- **Deletes**: Weak stored values, credential JSON parsers, unparsed model-id internals; every live/test caller moves now.
- **Proof**: Four lawful pairs round-trip; illegal pair/expiry/email/model forms fail; PostgreSQL pair CHECK matches registry. Static negative cases fail for the intended property. Local JSON parser count 3→0. Personal U1 requests unchanged.
- **Out of scope**: Core move, new custody context, installation commands and refresh redesign.
- **Stop if**: Shared exports differ, a caller needs a cast/weak string, or an old external shape is retained only for tests.

### U3. Bind every secret and remove envelope legacy naming

- **Already there**: U2, accepted schema, merged 0018/0019; existing envelope/connector/IAM owners. Read Design §1–2 and secrets.ts.
- **Creates**: Typed owner/context/sealed values, AAD, reseal, SECRET_CUSTODY_LOST in the existing failure table with generated outputs, new live names and forward four-CHECK migration with needs:aprovo. ModelAccountBinding needs only U2 types/current row fields.
- **Satisfies**: AC-3/4/7 custody.
- **Files**: platform secrets/secret-encryption/config; current model accounts store; IAM session-core/hub-session/application-session/authentication schemas; connectors store/broker; new migration/catalog mirrors; contracts/technical/failures.json and generated outputs; security §6, backup guide/infra backup README; verify control.mjs; error-code-map/configuration/boot/session/connector fixtures. No core move.
- **Copies**: Custody reference; existing cipher/key-id/fingerprint engine.
- **Guide sections**: C §3–8, D §2–3/5–8, S §4/6–7, T §4/6–7, L needs:aprovo.
- **Deletes**: Plaintext/context-free operations, every Factory envelope API/helper/type/configuration name and old live prefix with consumers; no alias/old decoder.
- **Proof**: Design §5 custody/migration cases; configured and retired keys open; missing key CONFIG_INVALID; boot under new variables succeeds and old-only fails, using the dedicated tests/fixtures/secret-custody-retired.json negative fixture for retired prefix/variable names. Update S exactly: "A secret at rest is sealed with the installation's envelope and bound to the row it belongs to." Update backup/configuration consumers in this commit.
- **Out of scope**: Live reset, changing key bytes, preserving/re-encrypting old data, connector/provider calls.
- **Stop if**: Live data must survive, CHECK set differs or card grows beyond one session. Operator alone resets/renames/re-enters local credentials.

### U4. Move the strong personal account owner into the core

- **Already there**: U1–U3; merged 0018/0019; current personal operations/UI and accepted schema. Read Design §4–5, module/store/usage shape and module/writer reference.
- **Creates**: Core module/store/provider composition, Builder OpenRun, native model resolver/paying recorder, Result hold/reread. Move already-strong provider mechanics with their current actual wire consumers. Update architecture ownership and C-027 adapter path; describe installation commands as pending 0020.
- **Satisfies**: AC-2/5/6/7.
- **Files**: Final model-account module/store/providers/credential/defaults/models/offers/routes/refresh and provider leaves; Builder module/model-routing/run-lifecycle/run-turn/harness/runtime model callers; hub.ts; import law/review areas/census CI; affected tests; architecture and C-027. No settings wire change, administrator action, scoped writer, sign-in redesign, refusal persistence or Google lifecycle redesign.
- **Copies**: Registry frozen module and explicit writer; existing personal provider protocols.
- **Guide sections**: C §1/3–8/10–11, A §4–5/8/11, D §5–8, H §1/3–5, S §2/6, T §4/6–7.
- **Deletes**: U4 delete rows with all actual callers/tests, including routing seam and Builder ownership; old pool implementation names. Current personal UI endpoints remain live consumers, not compatibility endpoints for tests.
- **Proof**: All U1 pins unchanged through new boundary, exact paying ids, fresh run admission and unchanged refusal codes; native MastraModelConfig. Import law rejects every core→Builder import. No old Builder model-account path or test-only route export remains. Install foundation census/negative tests in CI, delete shape, compile actual owners. Record per-card edited paths and emitted guides.
- **Out of scope**: Every behavior owned by 0020, including installation selection/list wire and scope commands.
- **Stop if**: Mechanical movement needs new business behavior, upstream exports conflict, legacy test seam is requested, or this card cannot finish from strong existing code in one session.

## Non-goals

0020 owns scoped commands, precedence/listing/preflight, shared sign-in, refusal/OAuth races,
Google generation pooling and provider cards. Spec 0008 owns default-model writers. No new
Workspace scope, quota/cost report, second Hub process, external pilot change or live E2B use.

## What breaks the premise

Live credential data must survive the custody reset; upstream admitted-run/result contracts differ;
provider protocols no longer match the pins; or a behavior-preserving move needs scope policy.
Return to the planning session instead of building a shim or changing accepted decisions.

## Stop rule

Return on an undecided requirement, upstream conflict, impossible one-session green unit or more
than 70 handwritten product subjects. Approval belongs to the operator. This spec builds nothing.
