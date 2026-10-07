# 0020. Personal and installation model account commands

**Date**: 2026-10-07
**Status**: Approved by the operator on 2026-10-07, commit 65ab18954933ddc3ce325705daae623b16b8c79f
**Lane**: lane:qualification (Q-b installation-wide credential authority; Q-c real Builder proof).
**Wave branch**: wave/company-model-account-commands
**Study**: Approved company model accounts study of 2026-10-06, held privately by the planning session.

## Summary

An administrator connects one company account per provider. A person uses their own first, or
uses the company's when they have none. The existing settings screen and picker show who pays,
and a dead sign-in is a persisted row fact. This wave delivers the commands and experience after
0017's strong types, row custody and behavior-preserving core move.

## Already there and wave dependencies

Accepted 885addee/0071 is schema history. [0017](../0017-company-model-accounts/index.md) owns the
pin, derived Credential/parseCredential Zod codecs, parseModelId/ModelRole, every Hub custody
context, complete envelope naming/configuration/prefix removal, its forward migration and the
personal core move. Never rebuild it or retain its old Builder routing exports. U1 can extend
pins on the completed foundation. U2–U6 wait for merged 0017, 0018 and 0019, then merge main into
this branch without rebase. The new installation behavior is first delivered here.

0018 owns nominal read/command/run/system/bootstrap proofs, the one admitted read gate and the
administrator admission owner. Add model-account.manage to that existing owner in U2. 0019 owns
Failure/Result, error.code from the failure table, one native Response failureResponse and the
cause classifier; no SQL business rule or second error mechanism is written here. Export signatures were confirmed with its writer through pushed shape 3395649f. Result<T,E> has two required parameters, E constrained by table-coded error.code; Code<C> and AccountConnectionAnswer are projections, not an account implementation. Failure extends MastraError with id and accepts a table code. Typed custody row/spent context belongs in the domain error arm; it is supported by the structural E constraint. Pushed 0018 was checked at 3d70bd7b. An upstream
conflict goes to the planning session. RunOwner stays the exact upstream owner type.

## Settled operator decisions

All 2026-10-06 decisions remain in force: installation keys and subscriptions, ownerless company
rows, personal-first use everywhere; scope control on the existing screen; all four sign-in kinds
in three provider cards; refusal notice/settings link and Empresa picker marker; core ownership;
Google support with its file risk declared; AAD on every Hub secret; one checked table, connection
metadata/logs, no-secret preflight; legal provider/kind pairs, scoped operations, connecting name/date,
removal in both scopes; refused personal never falls back. The operator approved two sequential
waves on 2026-10-07 instead of the original single wave because a combined move/command unit
exceeded a fresh-session budget. 0017 and this spec need separate approval.

The same planning session chose complete envelope source/configuration/persisted naming removal
with a forward four-CHECK migration in 0017; no alias/old decoder. The operator performs the local
reset/variable rename and re-enters the connector credential and model accounts. This wave consumes
that result. Canonical Result is used for hold/reread: custody failure carries typed row context;
admission loss preserves its own error.code. Only successful row absence/changed kind is
MODEL_ACCOUNT_CHANGED. No approved product decision is reopened.

## Requirements

**User stories**:
- As an installation administrator, I want to connect the company's model account once so that everyone can build without connecting their own.
- As a person, I want to see which account pays before I build, and to use my own when I connect one.
- As a person, I want to disconnect my own account.
- As an administrator, I want to know when the company account stopped working and to fix it in one place.

**Acceptance criteria**:
- **AC-1**: On Configurações › Modelos, an administrator chooses **Empresa** on a provider card and connects with an Anthropic key, a Claude subscription, a ChatGPT subscription or Google AI Pro. The row has `scope = 'installation'`, no owner, `connected_by` = the administrator, `connected_at` = now, and the Hub logs `MODEL_ACCOUNT_CONNECTED` (or `MODEL_ACCOUNT_REPLACED`) with scope, provider, kind and actor.
- **AC-2**: A person with no own account for a provider sees on the card "Coberta pela conta da empresa · Conectada por <nome> em <data>", the picker marks those models **Empresa**, and a real Builder turn on one of them succeeds and records the installation row in `builder.builder_run_model_account`.
- **AC-3**: A person with their own account for the provider runs on it; the card says the personal account is in use and the picker shows no **Empresa** marker for that provider.
- **AC-4**: A member sees **Empresa** greyed with "Só um administrador da instalação conecta a conta da empresa." Every write with `scope = 'installation'` (key, sign-in start, sign-in completion, remove) from a member answers `403 INSTALLATION_ADMINISTRATOR_REQUIRED`; a sign-in start is refused before the provider page opens, and a completion whose administrator was revoked mid flow is refused by the write's admission and stores nothing.
- **AC-5**: Revoking or deactivating the administrator who connected the company account leaves the row and every person's runs on it unchanged.
- **AC-6**: When the provider refuses a refresh (400 `invalid_grant` or 401), or a call on an API key or Google row answers 401 from the provider, or a call on an OAuth row answers 401 and the forced refresh that follows is refused, the row gets `refused_at`, written in its own committed transaction so it survives the failing run. The company card shows "Precisa entrar de novo" to administrators and members; a run on it fails before calling the provider with `MODEL_ACCOUNT_INSTALLATION_SIGN_IN_REQUIRED`, whose text says an administrator must reconnect it, with a link to Configurações › Modelos. A refused personal account fails with `MODEL_ACCOUNT_SIGN_IN_REQUIRED`, never falls back to the company account, and its card offers "Entrar de novo" and, when a company account exists, "Desconectar para usar a conta da empresa". A new sign-in clears `refused_at`. A 5xx, a timeout, a network fault, an SDK retry, a router fault of our own, or a missing encryption key never marks a row.
- **AC-7**: With no account at all for the chosen model, the next turn fails with `MODEL_ACCOUNT_MISSING`, whose text asks to connect an account, with the link.
- **AC-8**: The owner disconnects a personal account and an administrator disconnects the company account; the remove answers `204` also when nothing was there; after a person removes their own, the company account is in use for them.
- **AC-9**: Every sealed value at rest in the Hub (model account, connector connection, Hub and application session, handoff) opens only under its own row's context: a test per owner moves a sealed value to another row and gets `SECRET_CUSTODY_LOST`. The handoff that becomes an application session reseals its token.
- **AC-10**: Each model call of a run picks its account again with `accountInUse` (as today, `model-routing.ts:72-78`, `0038:3-6`): a person who connects their own account mid run pays with it from the next call, and a removal or a replacement is seen by the next call. A call already in flight whose row was removed or changed kind under it fails with `MODEL_ACCOUNT_CHANGED`; a same kind replacement is adopted by the call in flight; a refresh that races a new sign-in loses the compare and swap and the new sign-in stays.
- **AC-11**: The pre-run check opens no secret and gives the same answer as the run, because both call `accountInUse` and `refusalOf`.
- **AC-12**: The words tell the truth: `docs/product/contract.md:45`, `apps/web/src/features/settings/components/models-screen.tsx:11`, `apps/web/src/features/settings/components/admins-screen.tsx:62` (no "definir os padrões" until spec 0008 builds it), C-032, C-027 (the adapter's new home), `docs/reference/architecture.md:214`, the A 11 row at `architecture.md:390` (rewritten to keep only the Mastra instance in `builder`), guide S 6 (the AAD rule, for the operator's review) and an A 11 row for the Google sign-in file on disk.
- **AC-13**: Model accounts live in `apps/hub/src/model-account/`; nothing under it imports `builder/` (import check); one card per provider and one sign-in module; repository tests pin the SQL pair CHECK to `MODEL_PROVIDERS` and each seal owner's context to one file.
- **AC-14**: Google AI Pro at installation scope runs one CLIProxyAPI instance per sign-in generation shared by concurrent runs, captures the refreshed record to the row every minute, and a new sign-in or a remove retires the old instance.

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

Run `npx tsc --noEmit -p docs/specs/0020-company-model-account-commands/shape` before approval
and every unit. The compiled store/module/runtime/usage/negative files own the signatures.
credential.ts and secrets.ts preview 0017's exact types only so this spec compiles from main;
they are not a second product owner. Repointer units import merged foundation owners, never copy
those previews. dependencies.ts likewise previews upstream proofs/results only. U6 deletes shape
and compiles/tests actual owners. Product tests never import shape. No weak shape or obsolete
external API remains solely for tests.

## Design

### 1. Accepted data and custody

0071's scoped table and 0017's forward custody migration are Already there. Every model-account
write uses the row context including scope, owner-or-installation, provider and kind. No migration,
new cipher or configuration rename belongs to this wave. See 0017 Design §1–2 for that delivered
contract. Scope/ownership/pair CHECKs, partial unique indexes, connected-by/name/date and refused_at
remain authoritative. Preserve connected_by_name from the authenticated session at connect;
never expose another person's IAM account/email to display coverage text.

### 2. Canonical refusal and admission

hold returns Result with a typed row for custody failure. markRefused commits on the separate
refusal job before the scope error is raised; rollback of the model call cannot erase it.
reread returns Result of present/gone. Its upstream admission error is propagated unchanged;
no token is exposed to a deactivated/ended waiter. A successful missing row or changed kind alone
becomes MODEL_ACCOUNT_CHANGED. swap only accepts the held provider/kind, and only a run/capture
proof. Refusal mark only accepts the refusal-job proof. The error-model owner supplies canonical
Failure/Result exports; this spec adds domain failure-table rows and internal row context only.

### 3. Registry and one credential

`model-account/providers.ts`, already delivered by 0017, keeps `name`, `routerPrefix`, `models` and gains `kinds: { [kind]: { flow, codec } }`, `as const satisfies Record<ModelAccountProvider, ProviderEntry>`:

| Provider | Kind | Flow | Codec value |
| --- | --- | --- | --- |
| `anthropic` | `api_key` | `api-key` | `AnthropicKey` |
| `anthropic` | `oauth` | `paste-code` | `ClaudeTokens { access, refresh, expires }` |
| `openai-codex` | `oauth` | `device-code` | `CodexTokens { access, refresh, expires, accountId, email: string \| null }` |
| `google-ai-pro` | `google_ai_pro` | `callback-paste` | `GoogleAiProKey` (the encoded record, as today) |

`CredentialKind` (the lawful pair) and `Credential = { provider, kind, value }` are mapped types derived from the table, never written by hand. `parseCredential(pair, plain)` runs once, after `open`; builders, refreshers and token stores take `Credential`. A row whose pair or value does not parse raises the failure type of spec 0019, with its code from the failure table, never a `ZodError` (D3).

### 4. Which account pays (one function)

`model-account/in-use.ts` owns the pure selection rule and row/slot types. The compiled
`shape/store.ts` is the signature owner: it correlates the provider with CredentialKind,
includes connectedByName and takes a single input object for accountInUse. Personal first,
installation second, none last; a refused personal row stays selected. refusalOf maps the
selected row to the scope's code, or no refusal.

**Each model call picks again.** A run has no account of its own: every model call of the run (`resolve` and `resolveMemory`, `model-routing.ts:72-78`) runs `accountInUse` over the rows as they are at that call, and records the row that paid (`0038:3-6`, a run pays each call with the account of the model being called). So a person who connects their own account mid run pays with it from the next call, and a removal or replacement is seen by the next call. `MODEL_ACCOUNT_CHANGED` exists only for a call already in flight whose row was removed or changed kind under it (refresh step 2).

Five readers call these and nothing else compares scopes: the pre-run check (reader rows, no secret opened, so `usable` goes), the run's hold (command rows, on the run's proof, then opens), the account list, the offers (`paidBy = row.slot.scope`), and the test fake, which imports `in-use.js` instead of copying the rule (X2). The web reads `inUse` and `paidBy` and computes nothing (M7).

### 5. Store and admission

`model-account/store.ts` is the only file that touches `model.model_account`.

- `admitWriter(gate, scope)`: `admitAccount(gate)` for `personal`, `admitInstallationAdministrator(gate, { action: 'model-account.manage' })` for `installation`. `AdministratorAction` gains `'model-account.manage'`, mapped to `INSTALLATION_ADMINISTRATOR_REQUIRED` (`identity-access/admission.ts:17`; the write shape of `connectors/store.ts:86-105`).
- `connect` (the WriteTarget input in shape/store.ts): one upsert per scope, `ON CONFLICT (owner_account_id, provider) WHERE scope = 'personal'` or `ON CONFLICT (provider) WHERE scope = 'installation'`, setting `kind`, `secret`, `connected_by` (the proof's account), `connected_by_name` (the authenticated session's display name, which the route passes), `connected_at = clock_timestamp()`, `updated_at = clock_timestamp()`, `refused_at = NULL`, keeping `model_account_id`; `RETURNING (xmax = 0) AS inserted` tells `MODEL_ACCOUNT_CONNECTED` from `MODEL_ACCOUNT_REPLACED` (S 9). One port: `write` and its throwing twin go (M6).
- `remove` (the scoped input in shape/store.ts): `DELETE` of the slot filtered by the proof's scope; zero rows is success; logs `MODEL_ACCOUNT_REMOVED`.
- `hold` (canonical Result): on the run's transaction, reads the rows, runs `accountInUse` and `refusalOf`, opens and parses. On `SECRET_CUSTODY_LOST` its error arm carries the typed row to `modelFor`, which raises the scope's sign-in code only after `markRefused` committed (below), so the run's rollback cannot undo the mark.
- `reread(openRun, held)`: by id, inside `openRun`, the Builder's port that runs `withRun` for the same run and its admission (`run-lifecycle.ts:16-19`). Authority stays what it is today (`accounts.ts:60-62`): a run whose person was deactivated or whose run ended cannot reread a secret, and admission failure retains its upstream error.code. Only a successful missing row reads as gone. The module never joins `builder.builder_run_model_account` and never imports the run: the Builder hands it the port with each `modelFor` call. (The arena had rejected this port; review showed a refresh runs after the call's transaction ended, so a proof argument cannot cover it.)
- `swap` (the run/capture proof and same-kind credential in shape/store.ts): `UPDATE ... SET secret = $next, updated_at = clock_timestamp() WHERE model_account_id = $id AND secret = $held.sealed AND refused_at IS NULL`. False means someone wrote first.
- `markRefused` (the job proof and RefusalMark in shape/store.ts): always its own transaction on `system('model-account-refusal')`, committed before any refusal is raised to the caller, from `modelFor` (custody), from the refresher and from `refusalAtCall`. `UPDATE ... SET refused_at = clock_timestamp() WHERE model_account_id = $id AND connected_at = $row.connectedAt AND secret = $mark.spent AND refused_at IS NULL`, bound to the sign-in generation and the bytes this call spent. An older call cannot mark a later capture or sign-in. Every refusal reason carries spent ciphertext, including custody and provider-call failure. Logs `MODEL_ACCOUNT_REFUSED` with the reason.
- System jobs: `JobName` (`platform/db.ts:20`) gains `'model-account-refusal'` (the mark above, one row's `refused_at`) and `'model-account-capture'` (the Google minute capture, one row's `secret` and `updated_at` through `swap`), each admitted through the system proof owner of spec 0018; no per-job admission branch is invented. The refresh `swap` of an OAuth row runs inside `openRun` like the reread.
- `list(proof: Admitted<AccountScope, 'read'>)` through spec 0018's read gate returns `AccountRow[]` with `connectedByName`; the routes build entries from it.
- `readDefault(accountId, role)` moves to `defaults.ts` (D5).

### 6. Sign-in, refresh and the failure codes

**One sign-in module** (`model-account/sign-in.ts`). Each flow kind of the registry has `begin()` returning a `StartedSignIn` that closes over the vendor state (PKCE verifier, device code, Google login instance) and exposes `advance(input)` and `close()`; the module holds no `unknown` state. One attempt map; an attempt is `{ loginId, caller, target: { scope, credentialKind }, deadlineAt, started, outcome, settling }`. Written once: one attempt per caller, provider and scope (a new start for the same key replaces the old attempt), the sweep of expired attempts on every call (no timer), single flight settle, serialized completion commit against replacement/expiry, `admitWriter` at start in a transaction that writes nothing, and `connect` under `admitWriter` at completion. `exclusive: 'installation-wide'` on Google's flow (its fixed redirect port, so a member's personal Google sign-in in progress makes an administrator's company Google start answer `MODEL_LOGIN_BUSY`, whose text says to try again in a few minutes), `'per-caller'` on the others. `advance` sorts each provider answer into `waiting`, a value, or `refused` with its code; a network fault or an unparsable answer throws `MODEL_LOGIN_UNAVAILABLE` (F6). Completion checks that the exact attempt remains current and unexpired after vendor I/O, then holds the same caller/provider/scope serialization through re-admission and connect commit. Replacement and expiry serialize against that commit. If replacement/expiry won first, completion closes the old vendor state and stores no row. This lock is local to the sign-in subject, never across unrelated scopes or provider I/O. The api key flow has no attempt: parse with the codec, then `admitWriter` and `connect` in one transaction.

**Refresh** (`model-account/refresh.ts`, replaces `builder/oauth-holds.ts`). Single flight per row in the process (a cache; the compare and swap keeps a second Hub correct). Each call:
1. value not expired: use it;
2. `reread`: gone, or `kind` differs, raises `MODEL_ACCOUNT_CHANGED`; refused raises the scope's sign-in code; a stored value not expired is adopted (a same kind sign-in mid run);
3. the provider's refresher answers `refreshed`, `refused` (400 `invalid_grant`, 401) or `unreachable` (5xx, network): `refused` marks the row (`PROVIDER_REFUSED`) only while its secret is still the one this refresh spent (`markRefused` adds `AND secret = $held.sealed`); zero rows means another refresh rotated the token first, so it goes back to step 2 and adopts it. Claude and ChatGPT refresh tokens are single use and rotate (`storage.ts:771`, `persistRefreshedCredential`), so the loser of a race gets `invalid_grant` for a sign-in that is alive. Then it raises the scope's code; `unreachable` raises `MODEL_LOGIN_UNAVAILABLE` and marks nothing;
4. `swap`; won, the held value becomes the one just written (the next swap compares against it); lost, back to step 2 once.

**The refresher is our own token call.** A spike run against the installed packages (`@mastra/code-sdk` 1.8.3) showed that Mastra's `refreshAnthropicToken` carries the status only in its message (`"Anthropic token refresh failed: 400"`, a dropped connection is a `TypeError`), that `refreshOpenAICodexToken` throws the same message for 400, 401, 500 and a drop, that neither takes a `fetch`, and that the token URL and client id are module private. No reference classifies a refresh failure: Mastra's `AuthStorage` returns `undefined` on any refresh error (`@mastra/code-sdk` `auth/storage.ts:817,895,965`), Mastra Code turns it into `ProviderAuthRequiredError("Not logged in")` (`claude-max.ts:255-259`), and the Factory calls Mastra's `oauthProvider.refreshToken` under a row lock and returns `undefined` on any error (`mastracode/factory/src/routes/tenant-credentials.ts:146,153`), marking nothing. Mastra's `OAuthProviderInterface.refreshToken` has no error type, status or `fetch` parameter (`dist/auth/types.d.ts:46-81`). So the classification is ours by necessity: each OAuth leaf (`anthropic.ts`, `openai-codex.ts`) calls its token endpoint itself with `fetch` and classifies by HTTP status, keeping Mastra's request exactly: Anthropic `POST https://console.anthropic.com/v1/oauth/token`, JSON `{ grant_type: 'refresh_token', client_id, refresh_token }`, `expires = now + expires_in * 1000 - 5 min` (`anthropic.ts:131-156`); Codex `POST https://auth.openai.com/oauth/token`, form encoded `grant_type, refresh_token, client_id`, parsed as Mastra's `tokenResponseToResult` requires both tokens (`openai-codex.ts:160-185,214-226`); 15 s timeout on both. If a later Mastra exports a refresh with a status, the leaf calls it instead. The URL and client id are local constants; `tests/repository/model-token-endpoints.test.mjs` parses the installed Mastra dist files (`@mastra/code-sdk/dist/auth/providers/anthropic.js` and `openai-codex.js`, where the constants are module private and Anthropic's client id is base64 encoded) and fails when they differ. The Codex leaf copies the account id and email extraction from the token's claims (id token claims, then access token claims, then the previous value; `openai-codex.ts:133-160`; Mastra exports it only under `__testing`, `openai-codex.js:483-491,543`), with a test over a fixture token.

**At call time** (`model-account/models.ts`). `refusalAtCall(held)` is one Vercel AI SDK middleware over `doGenerate` and `doStream` on every model the module builds. The spike showed a 401 and a 403 reach it as `APICallError` with `statusCode`, not retried, on all four model kinds; a 500 and a drop are retried by the SDK and pass through. A 401 on an `api_key` row, or on a Google row when the router passes the upstream's 401 (section 7), marks the row and throws the scope's code as the cause. A 401 on an `oauth` row proves only a dead access token: it forces one refresh (reread, refresh even if `expires` says valid, swap); only a `refused` refresh marks the row and raises the scope's code, and otherwise the call fails as a retryable provider fault. 403, 429 and 5xx pass to Mastra's own handling. A typed failure our refresher raised inside the provider's fetch (the token store's `current()`) passes through unchanged.

**Codes** (`contracts/technical/failures.json`, `audience: person`, each with a link action to Configurações › Modelos where the person can act):

| Code | Cause | Raised in |
| --- | --- | --- |
| `MODEL_ACCOUNT_MISSING` | no account pays for this model's provider | `refusalOf` |
| `MODEL_ACCOUNT_SIGN_IN_REQUIRED` | your account needs a new sign-in | `refusalOf`, refresh step 3, `refusalAtCall`, custody lost |
| `MODEL_ACCOUNT_INSTALLATION_SIGN_IN_REQUIRED` | the company account needs an administrator | the same places; `signInRequired(slot)` picks the code |
| `MODEL_ACCOUNT_CHANGED` | the row of a call in flight was removed or changed kind under it | refresh step 2; Google reread after a missing row or changed kind |
| `GOOGLE_AI_PRO_ROUTER_UNAVAILABLE` | the router is down (exists) | the Google model builder |

`BUILDER_MODEL_AUTH_FAILED` is deleted; `BUILDER_MODEL_NOT_SELECTED` keeps one meaning (no model chosen, or a model id no route serves) and its text stops naming accounts (`failures.json:141,145`). `builder/runtime.ts` uses 0019's canonical cause classifier for `MODEL_ACCOUNT_RUN_FAILURES` and `MODEL_LOGIN_UNAVAILABLE` (the walk `namesNoModelAccount` does today), and `failureOfType('auth')` returns null.

### 7. Google AI Pro at installation scope

- The pool keys each CLIProxyAPI instance by sign-in generation `{ modelAccountId, connectedAt }`, not by record hash. One company row used by every person's runs is one instance with many leases; the row owns it.
- It stops on no lease for `idleMs` (a final capture first), on Hub close, when a call holds a newer generation (retired with no write back), and after a remove or new sign-in commits (`pool.retire`). Before dispatch, acquire returns its canonical error with reason GENERATION_RETIRED; the module rereads through its own admitted run and adopts a same-kind replacement. A successful missing row or changed kind yields MODEL_ACCOUNT_CHANGED; admission loss retains its code. A request already dispatched is never replayed. Its old 401 cannot refuse newer bytes because markRefused compares spent ciphertext; the next call selects again.
- Write back no longer waits for the stop: the one minute pool job (`system('model-account-capture')`) reads each running instance's auth file and, when the bytes changed, `swap`s on the instance's sealed value; a won swap makes the written value the instance's new compare value, so every later capture lands; a lost swap stops capture for that instance. A Hub crash loses at most one minute of refreshes.
- Runs reach the router with a ticket instead of the record: 32 random bytes (base64url), held in the pool's memory beside the instance, bound to the generation and not to a request or a lease, so an SDK retry carries a ticket that is still valid. It lives until its generation is retired (a new sign-in, a remove, the idle stop, Hub close). The router listens on loopback only (as today), takes a lease per HTTP request and runs `pool.acquire` itself, outside any transaction, as today (`router.ts:25-29`). An unknown or retired ticket answers `503` with `GOOGLE_AI_PRO_ROUTER_UNAVAILABLE`, never `401`. The router passes a `401` through only when CLIProxyAPI answered it, with header `x-conexus-upstream: 1`, and `refusalAtCall` marks the row only on that header. `write-back.ts` and its key to row map go (M11); the router's hard coded texts go (F5). Its own answers are proved on the real router in U5.
- The sign-in file on disk (`google-ai-pro/pool.ts:210`, mode `0600`, removed at stop, wiped at boot) becomes an A 11 departure row, now with its worst case lifetime (as long as anyone builds on the company account).

### 8. Module map and imports

`apps/hub/src/model-account/`, `module.ts` first, shaped like `registry/module.ts:8-39` (declares `ModelAccountModule`, returns a frozen object):

| File | Owns |
| --- | --- |
| `module.ts` | composition; `modelFor(openRun, call)`, `checkBeforeRun(accountId, modelIds)` through an admitted read, `readDefault`, `registerRoutes`, `jobs`, `close` |
| `providers.ts` | the registry, `CredentialKind`, `Credential`, `parseCredential`, `parseModelId` |
| `credential.ts` | the four codecs |
| `in-use.ts` | the pure rule (section 4) |
| `store.ts` | every statement on `model.model_account`, `modelAccountContext`, `admitWriter` |
| `refresh.ts` | liveness, the swap, refusal marking |
| `models.ts` | `ModelBuilders` (exhaustive over `Credential`), `refusalAtCall` |
| `sign-in.ts` | the one flow module |
| `offers.ts` | the offer catalog and thinking levels (M3) |
| `routes.ts` | the operations, thin (`connectors/routes.ts` shape) |
| `defaults.ts` | `readDefault` |
| `anthropic.ts`, `openai-codex.ts` | provider leaves: builders, refresher, held token store bridge, flow `begin` |
| `google-ai-pro/` | `pool.ts`, `router.ts`, `flow.ts`, `model.ts` |

Import law, enforced in the repository import check: files under `model-account/` import `platform/*`, `identity-access/admission.ts` and the contract; nothing under `model-account/` imports `builder/`; `builder/` imports only `model-account/module.ts`; leaves never import each other, `module.ts` or `routes.ts`. `hub.ts` builds the one envelope and passes it to identity, connectors and model accounts (D6) and composes the module before the Builder.

The run side in `builder/model-routing.ts` after the wave:

The compiled signatures in shape/store.ts, module.ts and usage.ts are the only signature owner.
OpenRun is Builder's canonical-Result port already delivered by 0017. Each waiter obtains its own
fresh admission. modelFor returns Result of native MastraModelConfig plus the paying row; Builder
unwraps only at Mastra's native resolver boundary. markRefused is an independently committed
refusal-job transaction. Google capture uses only its capture proof, never a refusal proof.

### 9. API surface

Paths keep the delivered operation names and gain required scope. Resolve names from the merged contract, not old study identifiers. Study MDL labels below identify surfaces, not exports.

| Today | Method and path | Input | Output | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `MDL-01` | `GET /api/control/model-accounts/models` | none (its `scope` query goes, M9) | `OfferedModel[]` with `provider: RouterPrefix`, `paidBy`, `needsSignIn` | person | |
| `MDL-02` | `GET /api/control/model-accounts` | none | `ModelAccountEntry[]`, every provider: `available`, `kinds` with flow, `personal`, `installation` (`ConnectedAccount { kind, needsSignIn, connectedBy { accountId, displayName }, connectedAt }`), `inUse` | person | |
| `MDL-03` | `PUT /api/control/model-accounts/:provider/api-key` | `{ key, scope }` | entry | person; installation needs administrator | `403 INSTALLATION_ADMINISTRATOR_REQUIRED`, key refusal |
| `MDL-04`, `MDL-06`, `MDL-09` | `POST .../anthropic/oauth/start`, `.../openai-codex/oauth/start`, `.../google-ai-pro/login/start` | `{ scope }` | `StartHandoff` per flow | same | `403`, `MODEL_LOGIN_BUSY` (Google) |
| `MDL-05`, `MDL-07`, `MDL-10`, `MDL-11` | completion and poll routes | `{ loginId: ModelLoginId, ... }` (one way in, T4) | `SignInState` | the attempt's caller | `MODEL_LOGIN_NOT_FOUND` |
| `MDL-08` | deleted, folded into `MDL-02` (M8) | | | | |
| new `MDL-12` | `DELETE /api/control/model-accounts/:provider?scope=` | `scope`, required (`ModelAccountScope`) | `204` | owner for personal; administrator for installation | `400 REQUEST_VALIDATION_FAILED` when `scope` is absent or unknown (no default on a remove); `403` |

`SignInState` is one union in the contract: `waiting`, `succeeded`, `expired`, `refused` with `code` (`MODEL_LOGIN_ANTHROPIC_REFUSED`, `MODEL_LOGIN_OPENAI_REFUSED`, `MODEL_LOGIN_GOOGLE_REFUSED`, `INSTALLATION_ADMINISTRATOR_REQUIRED`, `ACCOUNT_INACTIVE`). The Hub and the web derive from the contract (`z.output`); the Hub's `OwnAccount`, `ModelStanding`, the seven login state copies and the four `Caller` types go (T2).

### 10. Screen

- One card per provider (three: Anthropic holds key and subscription, ChatGPT, Google AI Pro), each with **Pessoal | Empresa**. Decision 5 named "the four cards" of today; the four sign-in kinds all stay, and three cards keep the switch from doubling one provider into two cards (three cards approved by the operator on 2026-10-06). One sign-in part per flow kind (`api-key`, `paste-code`, `device-code`, `callback-paste`). The four card files go (S2).
- **Empresa** for a member: greyed, "Só um administrador da instalação conecta a conta da empresa."; the administrator flag comes from `GET /api/session` (0018).
- **Pessoal** with no own account and a company account: "Coberta pela conta da empresa · Conectada por <nome> em <data>" with the connect actions. Refused: "Precisa entrar de novo", the reconnect action, and "Desconectar para usar a conta da empresa" when a company account exists. A disconnect action on each connected scope.
- One text per action across cards (S3): "Conectar", "Entrar de novo", "Trocar a chave", "Desconectar".
- Failure words come from `failures.json` through `app/failure.ts` (S4); the polls map by code and end on any other failure (S5).
- Every read goes through `query()` (`app/http.ts:61-64`) with one exported invalidation of the model reads.
- The picker shows **Empresa** beside a model whose `paidBy` is `installation`; a refused account's models stay offered with `needsSignIn`.

### 11. Value sourcing

| Action | Value | Source |
| --- | --- | --- |
| Card | "Conectada por <nome>" | `connected_by_name`, written at connect from the authenticated session's display name (section 1) |
| Card | "em <data>" | `connected_at` |
| Card | "em uso" and the switch state | `inUse` from `accountInUse` over the reader rows |
| Card | "Precisa entrar de novo" | `refused_at IS NOT NULL` of the row in that scope |
| Card | Empresa greyed | `GET /api/session` `administrator` |
| Picker | "Empresa" | `OfferedModel.paidBy`, from `inUse.row.slot.scope` |
| Run | which row pays, per call | `accountInUse` over the command rows, inside `openRun`, at each model call |
| Run | the failure code | `refusalOf`, `signInRequired(slot)`, the refresher and `refusalAtCall` outcomes |
| Connect | `connected_by` | the writer proof's account |
| Seal | the associated data | the row's natural key, built in the owner's context file |
| Memory turn | the memory model | `readDefault(accountId, 'memory')` (spec 0008 owns the writer; the verify seed sets it) |

### 12. Key invariants

- A personal row has an owner and an installation row has none (CHECK); at most one row per person and provider and one installation row per provider (partial unique indexes); only lawful pairs (CHECK pinned to the registry).
- Which account pays is decided only by `accountInUse`; a refused own row never yields to the installation's.
- A sealed value opens only under its row's context; the plain value of a handoff never leaves `reseal`.
- Refusal is a row fact (`refused_at`), bound to the sign-in generation; a transient fault never sets it; a sign-in clears it.
- A refresh write never overwrites a newer sign-in (compare and swap on the sealed value read).
- `model-account/` never imports `builder/`.

### 13. Security model

- Personal rows: written and removed only by the owner (`admitAccount`); read by the owner. Installation rows: written and removed only by an installation administrator (`admitInstallationAdministrator(gate, { action: 'model-account.manage' })`), checked at sign-in start and again by the completing write's admission; read by every person. No reader reads `secret`.
- A run reads and opens only the row `accountInUse` picks for its own person, under its own run admission (`openRun`), now and at every later refresh: authority is today's (`accounts.ts:60-62`), a deactivated person or an ended run cannot reread a secret. `markRefused` runs on `system('model-account-refusal')` and writes only `refused_at` of one row; the Google capture runs on `system('model-account-capture')` and writes only `secret` and `updated_at` of one row through `swap`.
- The connecting person's display name is copied to the row at connect; no person reads another person's `iam.account` row through this wave.
- Every connect, replace, remove and refusal is a structured log line with code, scope, provider, kind, actor and trace id (S 9). No token, key or record is logged.
- Tokens never leave the Hub (the held credential stores keep Mastra's environment fallback off, `anthropic/credential.ts:33-39`, `openai-codex/credential.ts:43-50`); the Google record leaves only to the local CLIProxyAPI file (A 11 row).

### 14. Critical test scenarios

- Happy path: an administrator connects the company Anthropic key over HTTP; a person with no own account runs a turn; the run recorded the installation row; `MDL-02` shows `inUse.source = 'installation'` and the name. **AC-1**, **AC-2**.
- Own first: the same person connects a key; the next run records the personal row; removing it returns to the installation row. **AC-3**, **AC-8**.
- Member refused: `PUT .../api-key` and each start with `scope: 'installation'` answer `403` and the provider stub sees no request; a completion after the administrator is revoked stores nothing. **AC-4**.
- Administrator revoked: the row and a run on it are unchanged. **AC-5**.
- Refusal per flow: the refresh stub answers 400 `invalid_grant`; the row is marked; the next call fails with the scope's code and the stub sees no further request; a 500 marks nothing; a new sign-in clears the mark. **AC-6**.
- No account: `MODEL_ACCOUNT_MISSING` with its action. **AC-7**.
- Custody per owner: a sealed value moved to another row raises `SECRET_CUSTODY_LOST` for model account, connection, session and handoff; the redeem test passes through HTTP. **AC-9**.
- Mid run: a person connects their own account between two calls of one run and the second call records the personal row; a same kind replacement under a call in flight is adopted; a kind change and a removal under a call in flight fail it with `MODEL_ACCOUNT_CHANGED`; a refresh racing a new sign-in loses the swap and the new sign-in stays. **AC-10**.
- No fallback (decision 19): a refused personal row with a healthy company row fails with `MODEL_ACCOUNT_SIGN_IN_REQUIRED` (a table test over `accountInUse` and `refusalOf`, and one run over HTTP); "Desconectar para usar a conta da empresa" removes it and the next run records the installation row. **AC-6**, **AC-8**.
- Marks survive the failing run: after a run fails on custody lost, on a refused refresh and on an upstream 401, `refused_at` is set when read afterwards. An OAuth call 401 followed by a refresh that succeeds leaves `refused_at` null. A missing key id raises `CONFIG_INVALID` and marks nothing. **AC-6**.
- Removes: `DELETE` with nothing there answers `204`; without `scope` answers `400`. **AC-8**.
- Picker: a person with their own Anthropic account sees no **Empresa** marker on Anthropic models; a person without one sees it. **AC-2**, **AC-3**.
- Google retries: a 500 from the stubbed upstream followed by the SDK's retry leaves `refused_at` null; an unknown ticket answers `503`; an upstream 401 marks the row; two captures in a row both land. **AC-6**, **AC-14**.
- Structure: the import check fails on a `builder/` import under `model-account/`; `model-providers.test.mjs`, `seal-contexts.test.mjs` and `model-token-endpoints.test.mjs` fail on a drifted fixture. **AC-13**.
- Words: the verify report quotes the texts of AC-12 as changed. **AC-12**.
- The pre-run check and the hold disagree on no fixture (one table driven test over both). **AC-11**.
- Google: two concurrent runs on the company row share one instance; a capture after a stubbed refresh writes the row; a new sign-in retires the old instance. **AC-14**.
- Verify run on the real Hub as administrator and as member, with a real company account and a real turn (study verify feature `settings-models.md` updated). **AC-1** to **AC-8**.

## Deletes and census

0017 has already removed weak types, Builder ownership and legacy envelope naming. The follow-up
census counts remaining sign-in/state/card duplication and the model-account subjects this wave
replaces; its baseline is taken on merged 0017 before U1. The executable script also runs today
on main and reports 35 inspected/23 structural files, 42 top-level arrows, 3 functions over 80 lines, 3 suppressions, 5 plain ids, 3 local JSON parsers, 16 legacy Builder files, 72 custody-name matches, 4 legacy cards and 6 provider login-state/Caller aliases, which must not be mistaken for merged 0017.
U6 replaces the foundation census with the final zero-target check in CI, inlining its budget file list before deleting shape, and proves each counter with a defect fixture.
The census excludes its own detection dictionary and tests/fixtures/secret-custody-retired.json, the one retired-format/configuration negative fixture, plus the exact historical 0070/0071 migration tests iam-owner-migration.postgres.test.mjs and company-model-accounts-migration.postgres.test.mjs; a fixture proves a legacy name in a live consumer still fails. AST leaf tokens preserve regex literals; comments retain license provenance; code tokens and real tests/fixtures are scanned, including the actual mastra:factory-secret:v1: retired discriminator. One final credential JSON codec is permitted; provider leaves have none. Knip/import law remain.
Run shape/file-budget.mjs for the 41-path handwritten product union and per-unit lists. The four
old card files are counted because U2/U3 minimally migrate them before U6 deletes them. Every
edited caller counts; no new subject or 71st file without returning to the planning session.

| Delete | Unit | Every caller moves to |
| --- | --- | --- |
| OwnAccount/ModelStanding/standing/usable, throwing writer twin, getGoogleModelConnection, duplicate offer ordering/selection | U2 | Shared accountInUse/refusalOf/list and scoped commands, all four web consumers |
| Seven login state copies, four Caller types and repeated attempt lifecycle | U3 | Contract SignInState, one sign-in owner; each real web poll/start consumer |
| Unconditional refresh writes, rollback-lost mark, model-account text under BUILDER_MODEL_NOT_SELECTED, namesNoModelAccount cause walker | U4 | Same-generation/spent-secret CAS, separate mark and 0019 classifier |
| Google write-back map, request-spent tickets and record-hash lifetime | U5 | Generation pool, minute capture and generation ticket |
| Four provider cards and repeated queries/invalidation | U6 | Three provider cards, one part per flow, shared query() |
| Stale product/defaults/ownership/file-risk guide wording; temporary shape | U6 | Delivered facts and actual owner types |

## Units

Read only the card, its Design sections, References copied and shape. Every new call uses 0017's
strong types. Run card tests, shape tsc and npm run verify:quick before its green commit. Repoint
shape when an import moves. No suppression, cast, weak id or test-only production export.

### U1. Extend the foundation pin where behavior will move

- **Already there**: Completed 0017 U1–U4 with migrated personal provider/run/custody tests; no installation behavior yet. Read 0017's recorded deciding tests.
- **Creates**: Only missing characterization cases for attempts/polls, call-time provider errors and Google retry/pool shutdown before those structures change. Report the test name for every covered surface; use existing migrated tests for already-pinned behavior.
- **Satisfies**: AC-3/9/10/11/13 regression baseline.
- **Files**: Existing model-account, provider, pool/HTTP and web read tests/fixtures only; no product changes or external call.
- **Copies**: Existing real consumer tests.
- **Guide sections**: C §4–5, T §1–4/6–7, L waves.
- **Deletes**: Source-text assertions on these pins replaced with behavioral calls; no export introduced.
- **Proof**: Tests green on main after 0017 merges before any 0020 structure changes. Literal stream/header/retry and ownership snapshots. No token leaves a stream or foreign login response.
- **Out of scope**: New scope, refusal state or real model/E2B work.
- **Stop if**: Foundation is not merged or a pin needs product changes.

### U2. Deliver scoped commands and one account-in-use rule

- **Already there**: U1, merged 0017 strong personal core and contexts; 0018 nominal/read/run proofs; 0019 canonical result/failureResponse. Read Design §1–5/8–9/11–13, store/module/usage shape.
- **Creates**: accountInUse/refusalOf, secret-free checkBeforeRun, list/offers/default reads; model-account.manage in the existing administrator owner; scoped key connect and idempotent remove. Register MODEL_ACCOUNT_MISSING, MODEL_ACCOUNT_SIGN_IN_REQUIRED, MODEL_ACCOUNT_INSTALLATION_SIGN_IN_REQUIRED and MODEL_ACCOUNT_CHANGED plus their settings actions in the existing failure table and generate outputs before these paths use Result. All-provider wire replaces the old own-only list and Google-only operation. No parallel selection rule.
- **Satisfies**: AC-1 key, AC-2/3, AC-4 key/remove, AC-5, AC-7/8, AC-11/13.
- **Files**: Model-account store/in-use/module/models/offers/routes; admission action; contracts/technical/failures.json and generated outputs; contract model-account/index/operation/builder and generated consumers; web settings API, models-screen and all four api-key/Claude/ChatGPT/Google cards with minimal personal/read-field migration; Builder model inputs and affected tests. Budget counts every card now, even though U6 later deletes it.
- **Copies**: Scope/writer/personal-first reference rows.
- **Guide sections**: C §3–8, A §4–5, D §5–8, H §1/3–5/8, S §2/6, T §4/6–7.
- **Deletes**: U2 delete row, every caller/test in this unit. No old list/Google operation remains solely for tests or UI compilation.
- **Proof**: Personal/company/none/refused-personal-no-fallback cases share one pure rule; preflight opens zero secrets. Member key/remove gets 403 and writes nothing; administrator connect logs exact slot metadata. Remove is 204 twice; missing/invalid scope is 400. Revoke connector administrator leaves installation row usable. All four existing cards compile and consume the new personal/list fields without redesign. Negative proof/read/write/credential cases pass. U1 pins unchanged.
- **Out of scope**: New subscription attempt machine, provider refusal persistence, Google generation lifecycle or final cards.
- **Stop if**: Any scope decision escapes accountInUse, upstream exports differ, or a consumer retains the removed shape.

### U3. Share sign-in and admit both scopes

- **Already there**: U2 scoped writer/read contract; 0017 credentials and provider leaves. Read Design §6/9 and module shape.
- **Creates**: One attempt map keyed caller/provider/scope, begin/advance/close vendor state, expiry sweep on calls, single-flight settle; Google installation-wide exclusivity. Required scope at every subscription start; completion re-admits the stored target.
- **Satisfies**: AC-1 subscriptions, AC-4 starts/completion, AC-5/8/13.
- **Files**: Core sign-in/routes/module and Anthropic/Codex/Google flow leaves; shared contract SignInState and model operations; all four web sign-in/poll consumers/settings API; attempt/route/provider fixtures.
- **Copies**: Sign-in admission and native vendor/flow reference rows.
- **Guide sections**: C §4–7, H §1/3/8, S §2/5–6, T §6–7.
- **Deletes**: U3 row and all callers; no old state shape remains for tests. No independent expiry timer or unknown vendor state inside the domain.
- **Proof**: Member refused before provider stub call; revoked administrator completes no row; foreign id MODEL_LOGIN_NOT_FOUND; expiry closes vendor state; same key start replaces only its attempt. Concurrent advance spends once. Delay vendor completion; let replacement or expiry win before it resumes; the old completion writes zero rows and closes its state. If completion commits first, later replacement starts a new attempt without undoing the committed row. Wrong callback refused; network/5xx ends MODEL_LOGIN_UNAVAILABLE. Missing/malformed branded poll id rejected. All current web consumers terminate on canonical codes.
- **Out of scope**: Refresh and Google generation pooling; card consolidation remains U6.
- **Stop if**: Vendor state becomes unknown internally or classification depends on message text.

### U4. Persist refusals and close OAuth races

- **Already there**: U2 selection/scoped operations and generated domain code/action rows, U3 reconnect clears refusal, 0017 Result hold/reread and strong credentials, 0019 shared cause classifier. Read Design §2/5–6/12–14 and runtime/store shape.
- **Creates**: Separate committed markRefused, generation/spent-secret guard, same-kind swap; per-row refresh single flight with each waiter's own admission; own native-payload token calls; generate/stream middleware. U2's domain codes/actions are already generated; update their runtime usage and BUILDER_MODEL_NOT_SELECTED's text in the existing failure table. Do not defer a code needed by U2 to this unit.
- **Satisfies**: AC-6/7/10/11.
- **Files**: Core store/refresh/models/Anthropic/Codex/module; job-name owner; Builder runtime boundary; failure table/generated outputs; endpoint drift and refusal/race tests.
- **Copies**: Refusal fact, exact installed token requests and structured provider status.
- **Guide sections**: C §4–7, D §5–8, S §6/9, T §4/6–7.
- **Deletes**: U4 row. Imported canonical classifier replaces the old walker; no new shared error owner.
- **Proof**: invalid_grant/401 mark survives run rollback; 403/429/5xx/network/configuration mark nothing. OAuth call 401 forces one refresh; success leaves row unmarked and never replays an ambiguous model call. Same-kind sign-in adopted; successful gone/kind-change maps MODEL_ACCOUNT_CHANGED. Admission loss retains its code and returns no tokens. A provider-call 401 racing a won capture/refresh cannot mark the newer bytes. Two swaps land with advanced compare value; old refused refresh cannot mark rotated/new sign-in. Exact scope-code/link literals tested.
- **Out of scope**: Google lifecycle, cross-process support or new SDK retry policy.
- **Stop if**: Mark shares failing transaction, upstream result context cannot express the row, or native SDK now provides a structured refresh API replacing own requests.

### U5. Bind Google instances and capture to generations

- **Already there**: U4 mark/swap/job proofs, U3 Google flow and 0017 core router/composition. Read Design §7/12–14 and runtime shape.
- **Creates**: Pool key modelAccountId plus connectedAt, shared instance/leases; minute capture with advanced compare bytes; generation ticket across SDK retries; post-commit retirement and adapter-only orphan sweep.
- **Satisfies**: AC-6 Google, AC-10 Google, AC-14.
- **Files**: Google pool/router/flow/model and core module/store integration; real router/pool/HTTP tests; opt-in CLIProxyAPI proof.
- **Copies**: Existing adapter protocol; approved generation/crash-loss requirement with no reference equivalent.
- **Guide sections**: C §1/4–7, A native first/8, S §6–7, T §4/6–7.
- **Deletes**: U5 row; retired instance closes and restricted auth file is removed. The old pool function naming was already removed by 0017.
- **Proof**: Concurrent runs share one generation; two captures persist; replace/remove retires without stale write. Retry after upstream 500 keeps ticket and refusal null. Unknown/retired ticket literal 503; only tagged upstream 401 on still-current spent bytes marks; a 401 racing successful capture changes no refusal. Two real refreshes determine rotation only with operator authorization; a rotating token stops for C-027 resolution. No live model/E2B call without separate approval.
- **Out of scope**: Second process/replica, vendor replacement or wider disk access.
- **Stop if**: Rotation falsifies one-minute crash-loss premise or router cannot distinguish upstream from its own faults.

### U6. Deliver cards, picker and truthful owning guides

- **Already there**: U2 inUse/offers/scoped commands, U3 shared state, U4 failures/actions, U5 final Google lifecycle; administrator flag from GET /api/session. Read Design §10–14.
- **Creates**: Three provider cards with Pessoal/Empresa, one part per flow, query() and one model-read invalidation; picker paidBy/needsSignIn. Product/architecture/security/decisions describe delivery and Google file risk; install final census into existing CI graph.
- **Satisfies**: AC-2/3/4/6/8/12/13; qualification readiness AC-1–14.
- **Files**: Settings card/sign-in/models/admins/API/CSS; Builder picker/session and failure-action renderer; verify feature recipe; product contract, C-027/C-032 decisions, architecture/security §6; census/verify integration; shape deletion. Every edited old card is already counted in U2/U3.
- **Copies**: Provider card/coverage and existing query()/HTTP helper.
- **Guide sections**: C §4/10–11, A §4–5/8/11, P §2/4–6, V Layout/Interaction/accessibility/Voice, T §8–9, L wave proof/surface approval.
- **Deletes**: U6 row; stale defaults promise stays undelivered until 0008. Architecture owns personal/installation rules and keeps only unrelated Mastra-instance debt; Google file lifetime/risk is explicit.
- **Proof**: Real Hub/browser administrator/member, light/dark, 390px/200% zoom, keyboard order and no console/CSP failures. Exact name/date, refusal/no-fallback/disconnect, member explanation and picker markers from server facts. Operator approves usable structure before inherited styling when not already approved. Defect-fixture census/Knip/import law/type negatives pass; delete shape and compile actual owners. Wave proof maps every AC; real company Builder turn paying row needs separately authorized model/E2B call. Evidence stays private with the planning session.
- **Out of scope**: Default writers, new Settings route or unrelated guide/product changes.
- **Stop if**: UI infers authority/scope, census misses target, AC lacks deciding evidence or product paths exceed 70.

## Non-goals

0017 foundations and all other specs are consumed, not rebuilt. 0008 owns model-default writers;
verify seed supplies current build/memory defaults. No Workspace account, quota/cost report, history,
re-encryption, generic provider endpoint, second process, new dependency or external pilot mutation.

## What breaks the premise

Google token rotation invalidates minute capture, a vendor protocol changes, upstream admission/result
contracts differ or live data must survive 0017's reset. Return to the planning session; no silent
Google omission, new decoder or invented data migration. Approval opens build, not external calls.

## Stop rule

Return on an undecided requirement, upstream conflict, a unit too large for one fresh session or
more than 70 handwritten product subjects. The operator approves this spec independently of 0017.
