# 0017. Company model accounts: the installation's account beside each person's, on one owner module

**Date**: 2026-10-06

**Status**: Proposed

**Lane**: `lane:qualification` (Q-b: a new authority, the installation administrator writing a credential every person's run pays with; Q-c: the proof is a real Builder turn). The migration carries `needs:aprovo` ([delivery](../../development/delivery.md)).

**Depends on**: S1 part 6 (identity and access) merged, and the post S1 reset of the local databases (Keycloak and Sankhya untouched). Every `file:line` is a line of `origin/main` at `544bcf42` unless it names part 6's target; part 6's names (`identity-access/sessions.ts`, `GET /api/session` with `administrator`, `conexus_owner`) come from its approved spec and are rechecked against main when this wave's build starts.

**Rationale**: options, the audit of today's code, the arena synthesis and the references are in [rationale.md](rationale.md).

## Summary

An installation administrator connects one company account per model provider (a key or a subscription, like the Mastra Factory's organization account). A person who has not connected their own account builds on the company's, and the screen and the model picker say so. The person's own account always comes first, the same on screen and in runs, from one function.

Today's code cannot carry this: a "shared" account is one person's row with a flag, each provider repeats the sign-in and the card, five places compute which account pays, and a dead sign-in leaves no trace. So the wave first rebuilds model accounts as their own module in the Hub core, then adds the company scope. It also binds every sealed secret in the Hub to its row (AAD, associated data checked by the cipher), so a secret moved to another row no longer opens.

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

## Decision

**Chosen option**: one owner module `apps/hub/src/model-account/` (registry shape), one table with a checked `scope`, one pure account-in-use rule, the row as the home of every sign-in fact, and the Hub envelope binding each sealed value to its row.

The base design is the Opus candidate of a two model arena, with three grafts from the Sonnet candidate (rationale, "Synthesis").

**Implementation skills**: `mastra` (`.claude/skills/mastra/`, the installed `@mastra/*` docs and sources) · `conexus-development` (`.agents/skills/conexus-development/`) · `typescript-best-practices` (pstack).

## Feature design

### 1. Data model (the one migration)

Runs after part 6's migration, as the next free number; names no `model_owner` (part 6 moves every object to `conexus_owner`). If S1's end replaces the chain with one baseline (`docs/roadmap.md:53-54`), the drop list below is rewritten against that baseline when the build starts, the way part 6's names are rechecked. Moves no rows: a value sealed without associated data cannot open after this wave, so it stops with a clear error ("reset the local databases first") if `model.model_account` or `connector.connection` has any row, and it deletes every `iam.host_session` and `iam.handoff` row (everyone signs in again). See the Migration plan.

| Table | Column | Type | Rule |
| --- | --- | --- | --- |
| `model.model_account` | `model_account_id` | `uuid` PK | kept |
| | `scope` | `text NOT NULL` | `CHECK (scope IN ('personal', 'installation'))` |
| | `owner_account_id` | `uuid NULL`, FK `iam.account` `ON DELETE RESTRICT` | structural containment of a personal row (guide D 7); `CHECK ((scope = 'personal') = (owner_account_id IS NOT NULL))` |
| | `provider`, `kind` | `text NOT NULL` | `CHECK ((provider, kind) IN (('anthropic','api_key'), ('anthropic','oauth'), ('openai-codex','oauth'), ('google-ai-pro','google_ai_pro')))`, pinned to `MODEL_PROVIDERS` by `tests/repository/model-providers.test.mjs`; replaces the regex and list CHECKs (`0033:32-33`) |
| | `secret` | `text NOT NULL` | sealed, associated data per section 2; the prefix CHECK stays (`0033:37`) |
| | `connected_by` | `uuid NOT NULL` | an id without a key (guide D 7): the record outlives the person |
| | `connected_by_name` | `text NOT NULL` | the connecting person's display name at connect time, from the writer proof's account (decision 17; see below) |
| | `connected_at` | `timestamptz(3) NOT NULL` | the last sign-in; also the sign-in generation, compared for equality with a JS `Date`, hence milliseconds |
| | `updated_at` | `timestamptz NOT NULL` | the last secret write, a refresh included (kept) |
| | `refused_at` | `timestamptz(3) NULL` | the provider refused this sign-in; `CHECK (refused_at IS NULL OR refused_at >= connected_at)`, both at millisecond precision |
| | indexes | | `UNIQUE (owner_account_id, provider) WHERE scope = 'personal'`; `UNIQUE (provider) WHERE scope = 'installation'` |
| `model.installation_default` | `role` | | CHECK loses `plan` (no reader, `accounts.ts:11`); the writer stays with spec 0008 |
| `builder.builder_run_model_account` | | | unchanged: it records every row that paid, with no key (`0038:3-12`) |

Dropped: `sharing`, `model_account_sharing_check`, `model_account_shared_provider_key`, `model_account_owner_provider_key`, `created_at` (`connected_at` replaces it; no reader), and `model.model_account_sharing_history` (`0044`, no writer since #380).

Split wall, rewritten for scope: `reader` policy `TO hub_reader USING (rls.acting_account() IS NOT NULL AND (scope = 'installation' OR owner_account_id = (SELECT rls.acting_account())))`; the `command` policy stays. Grants: `hub_reader` `SELECT` on every column but `secret`; `hub_command` `SELECT`, `INSERT (scope, owner_account_id, provider, kind, secret, connected_by, connected_by_name, connected_at)`, `UPDATE (kind, secret, connected_by, connected_by_name, connected_at, updated_at, refused_at)`, `DELETE`. Nothing rewrites `scope`, owner or provider.

The name in "Conectada por <nome>" (decision 17) is a fact of the connection, stored on the row at connect time (`connected_by_name`), like `connected_by`: the record of who connected stays true after that person leaves or renames. Every person reads it through the model account reader policy. Part 6's `iam.account` policy is not touched, so no person can read the administrator's email, and no IAM policy depends on a model table. (Decided by the operator on 2026-10-06 against the live name through `iam.account`, which both reviewers showed exposes the whole account row, `email` included, `0065_split_wall.sql:269`.)

### 2. The envelope binds each value to its row

`platform/secrets.ts`:

```ts
export type SealOwner = 'model-account' | 'connection' | 'hub-session' | 'handoff'
export type SealContext<O extends SealOwner> = Readonly<{ owner: O; binding: readonly [string, ...string[]] }>
export type Sealed<O extends SealOwner> = string & z.BRAND<`sealed:${O}`>
export const SealedColumn: <O extends SealOwner>(owner: O) => z.ZodType<Sealed<O>>   // the row parse: prefix, then brand

export type SecretEnvelope = Readonly<{
  seal<O extends SealOwner>(value: string, context: SealContext<O>): Promise<Sealed<O>>
  /** Throws Failure('SECRET_CUSTODY_LOST') when the value does not open under this context. */
  open<O extends SealOwner>(sealed: Sealed<O>, context: SealContext<O>): Promise<string>
  /** Opens under one context and seals under another; the caller never holds the plain value. */
  reseal<A extends SealOwner, B extends SealOwner>(sealed: Sealed<A>, from: SealContext<A>, to: SealContext<B>): Promise<Sealed<B>>
  fingerprints(value: string): readonly [string, ...string[]]   // unchanged
}>
```

- The associated data is `JSON.stringify(['conexus-aad-v1', owner, ...binding])`, passed to `cipher.setAAD` and `decipher.setAAD` in `platform/factory-secret-encryption.ts`, which also loses its plaintext branch (`decrypt` returns a value without the prefix as plain, `factory-secret-encryption.ts:79-81`) and its "unchanged byte for byte" header. The prefix and its five CHECKs stay.
- `platform/` holds strings only. Each owner builds its context in one file: `modelAccountContext(slot, kind)` in `model-account/store.ts` (binding `[scope, owner account id or 'installation', provider, kind]`), `connectionContext(connectionId)` in `connectors/store.ts`, `sessionContext(tokenDigest)` and `handoffContext(handoffDigest)` in `identity-access/sessions.ts`. `tests/repository/seal-contexts.test.mjs` pins each `owner: '<name>'` literal to its file.
- The context is required, so `tsc` lists the 12 call sites of today, 11 after the `usable` open goes: `connectors/store.ts:87`, `connectors/broker.ts:105` (its `checkCredential` takes `connectionId`), the five of `host-sessions.ts:161,174,190,220,258` as part 6 rewrote them in `sessions.ts`, and the five in `builder/model-account/accounts.ts:64,67,83,119,124` (the `usable` open at `:119` is deleted, section 4).
- The handoff hop: `DELETE ... RETURNING` the handoff, mint the session token, `envelope.reseal(returned, handoffContext(h), sessionContext(digest(token)))`, `INSERT` the session. CPU only, so it stays inside part 6's authentication gate. A Keycloak recheck opens and seals under the same `sessionContext`. Preview sessions hold no sealed value.
- `open` tells two causes apart. A sealed value under a key id this installation does not hold raises `CONFIG_INVALID` (`details.name: 'SECRET_KEY_MISSING'`, `factory-secret-encryption.ts:84`) and no owner marks anything: the fix is the configuration, and restoring the key heals every row. A tag failure under a known key raises `SECRET_CUSTODY_LOST` (new failure row, `SYSTEM`, 500 when it escapes), mapped by each owner: IAM ends the session with reason `CUSTODY_CHANGED` as today; the model account module marks the row refused (section 5); the connector broker refuses the call. One envelope test pins each case.

### 3. Registry and one credential

`model-account/providers.ts` keeps `name`, `routerPrefix`, `models` and gains `kinds: { [kind]: { flow, codec } }`, `as const satisfies Record<ModelAccountProvider, ProviderEntry>`:

| Provider | Kind | Flow | Codec value |
| --- | --- | --- | --- |
| `anthropic` | `api_key` | `api-key` | `AnthropicKey` |
| `anthropic` | `oauth` | `paste-code` | `ClaudeTokens { access, refresh, expires }` |
| `openai-codex` | `oauth` | `device-code` | `CodexTokens { access, refresh, expires, accountId, email: string \| null }` |
| `google-ai-pro` | `google_ai_pro` | `callback-paste` | `GoogleAiProKey` (the encoded record, as today) |

`CredentialKind` (the lawful pair) and `Credential = { provider, kind, value }` are mapped types derived from the table, never written by hand. `parseCredential(pair, plain)` runs once, after `open`; builders, refreshers and token stores take `Credential`. A row whose pair or value does not parse raises a `Failure`, never a `ZodError` (D3).

### 4. Which account pays (one function)

`model-account/in-use.ts`, pure, types only:

```ts
export type Slot =
  | Readonly<{ scope: 'personal'; ownerAccountId: AccountId; provider: ModelAccountProvider }>
  | Readonly<{ scope: 'installation'; provider: ModelAccountProvider }>
export type AccountRow = Readonly<{ modelAccountId: ModelAccountId; slot: Slot; credentialKind: CredentialKind;
  connectedBy: AccountId; connectedAt: Date; refusedAt: Date | null }>
/** Whose row pays is `row.slot.scope`; no second field can contradict it. */
export type InUse = Readonly<{ source: 'row'; row: AccountRow }> | Readonly<{ source: 'none' }>

/** The person's own row, else the installation's, else none. A refused own row stays in use (no fallback). */
export function accountInUse(rows: readonly AccountRow[], accountId: AccountId, provider: ModelAccountProvider): InUse
/** MODEL_ACCOUNT_MISSING for none; the scope's sign-in code when refused; null when the run may use it. */
export function refusalOf(inUse: InUse): ModelAccountRunFailure | null
export function toAccountInUse(inUse: InUse): AccountInUse   // the wire
```

**Each model call picks again.** A run has no account of its own: every model call of the run (`resolve` and `resolveMemory`, `model-routing.ts:72-78`) runs `accountInUse` over the rows as they are at that call, and records the row that paid (`0038:3-6`, a run pays each call with the account of the model being called). So a person who connects their own account mid run pays with it from the next call, and a removal or replacement is seen by the next call. `MODEL_ACCOUNT_CHANGED` exists only for a call already in flight whose row was removed or changed kind under it (refresh step 2).

Five readers call these and nothing else compares scopes: the pre-run check (reader rows, no secret opened, so `usable` goes), the run's hold (command rows, on the run's proof, then opens), the account list, the offers (`paidBy = row.slot.scope`), and the test fake, which imports `in-use.js` instead of copying the rule (X2). The web reads `inUse` and `paidBy` and computes nothing (M7).

### 5. Store and admission

`model-account/store.ts` is the only file that touches `model.model_account`.

- `admitWriter(gate, scope)`: `admitAccount(gate)` for `personal`, `admitInstallationAdministrator(gate, 'model-account.manage')` for `installation`. `AdministratorAction` gains `'model-account.manage'`, mapped to `INSTALLATION_ADMINISTRATOR_REQUIRED` (`identity-access/admission.ts:17`; the write shape of `connectors/store.ts:86-105`).
- `connect(proof, credential)`: one upsert per scope, `ON CONFLICT (owner_account_id, provider) WHERE scope = 'personal'` or `ON CONFLICT (provider) WHERE scope = 'installation'`, setting `kind`, `secret`, `connected_by` (the proof's account), `connected_by_name` (the authenticated session's display name, which the route passes), `connected_at = clock_timestamp()`, `updated_at = clock_timestamp()`, `refused_at = NULL`, keeping `model_account_id`; `RETURNING (xmax = 0) AS inserted` tells `MODEL_ACCOUNT_CONNECTED` from `MODEL_ACCOUNT_REPLACED` (S 9). One port: `write` and its throwing twin go (M6).
- `remove(proof, provider)`: `DELETE` of the slot filtered by the proof's scope; zero rows is success; logs `MODEL_ACCOUNT_REMOVED`.
- `hold(proof: Admitted<RunScope>, provider)`: on the run's transaction, reads the rows, runs `accountInUse` and `refusalOf`, opens and parses. On `SECRET_CUSTODY_LOST` it returns the refusal to `modelFor`, which raises the scope's sign-in code only after `markRefused` committed (below), so the run's rollback cannot undo the mark.
- `reread(openRun, held)`: by id, inside `openRun`, the Builder's port that runs `withRun` for the same run and its admission (`run-lifecycle.ts:16-19`). Authority stays what it is today (`accounts.ts:60-62`): a run whose person was deactivated or whose run ended cannot reread a secret, and an admission refusal reads as gone. The module never joins `builder.builder_run_model_account` and never imports the run: the Builder hands it the port with each `modelFor` call. (The arena had rejected this port; review showed a refresh runs after the call's transaction ended, so a proof argument cannot cover it.)
- `swap(held, next)`: `UPDATE ... SET secret = $next, updated_at = clock_timestamp() WHERE model_account_id = $id AND secret = $held.sealed AND refused_at IS NULL`. False means someone wrote first.
- `markRefused(row, reason)`: always its own transaction on `system('model-account-refusal')`, committed before any refusal is raised to the caller, from `modelFor` (custody), from the refresher and from `refusalAtCall`. `UPDATE ... SET refused_at = clock_timestamp() WHERE model_account_id = $id AND connected_at = $row.connectedAt AND refused_at IS NULL`, bound to the sign-in generation, so an older sign-in's refusal never marks a newer one. Logs `MODEL_ACCOUNT_REFUSED` with the reason.
- System jobs: `JobName` (`platform/db.ts:20`) gains `'model-account-refusal'` (the mark above, one row's `refused_at`) and `'model-account-capture'` (the Google minute capture, one row's `secret` and `updated_at` through `swap`), each admitted by `admitSystem` with its own branch (`identity-access/admission.ts:334-339`). The refresh `swap` of an OAuth row runs inside `openRun` like the reread.
- `list(accountId)` on the reader role returns `AccountRow[]` with `connectedByName`; the routes build entries from it.
- `readDefault(accountId, role)` moves to `defaults.ts` (D5).

### 6. Sign-in, refresh and the failure codes

**One sign-in module** (`model-account/sign-in.ts`). Each flow kind of the registry has `begin()` returning a `StartedSignIn` that closes over the vendor state (PKCE verifier, device code, Google login instance) and exposes `advance(input)` and `close()`; the module holds no `unknown` state. One attempt map; an attempt is `{ loginId, caller, target: { scope, credentialKind }, deadlineAt, started, outcome, settling }`. Written once: one attempt per caller, provider and scope (a new start for the same key replaces the old attempt), the sweep of expired attempts on every call (no timer), single flight settle, `admitWriter` at start in a transaction that writes nothing, and `connect` under `admitWriter` at completion. `exclusive: 'installation-wide'` on Google's flow (its fixed redirect port, so a member's personal Google sign-in in progress makes an administrator's company Google start answer `MODEL_LOGIN_BUSY`, whose text says to try again in a few minutes), `'per-caller'` on the others. `advance` sorts each provider answer into `waiting`, a value, or `refused` with its code; a network fault or an unparsable answer throws `MODEL_LOGIN_UNAVAILABLE` (F6). The api key flow has no attempt: parse with the codec, then `admitWriter` and `connect` in one transaction.

**Refresh** (`model-account/refresh.ts`, replaces `builder/oauth-holds.ts`). Single flight per row in the process (a cache; the compare and swap keeps a second Hub correct). Each call:
1. value not expired: use it;
2. `reread`: gone, or `kind` differs, raises `MODEL_ACCOUNT_CHANGED`; refused raises the scope's sign-in code; a stored value not expired is adopted (a same kind sign-in mid run);
3. the provider's refresher answers `refreshed`, `refused` (400 `invalid_grant`, 401) or `unreachable` (5xx, network): `refused` marks the row (`PROVIDER_REFUSED`) only while its secret is still the one this refresh spent (`markRefused` adds `AND secret = $held.sealed`); zero rows means another refresh rotated the token first, so it goes back to step 2 and adopts it. Claude and ChatGPT refresh tokens are single use and rotate (`storage.ts:771`, `persistRefreshedCredential`), so the loser of a race gets `invalid_grant` for a sign-in that is alive. Then it raises the scope's code; `unreachable` raises `MODEL_LOGIN_UNAVAILABLE` and marks nothing;
4. `swap`; won, the held value becomes the one just written (the next swap compares against it); lost, back to step 2 once.

**The refresher is our own token call.** A spike run against the installed packages (`@mastra/code-sdk` 1.8.3) showed that Mastra's `refreshAnthropicToken` carries the status only in its message (`"Anthropic token refresh failed: 400"`, a dropped connection is a `TypeError`), that `refreshOpenAICodexToken` throws the same message for 400, 401, 500 and a drop, that neither takes a `fetch`, and that the token URL and client id are module private. No reference classifies a refresh failure: Mastra's `AuthStorage` returns `undefined` on any refresh error (`@mastra/code-sdk` `auth/storage.ts:817,895,965`), Mastra Code turns it into `ProviderAuthRequiredError("Not logged in")` (`claude-max.ts:255-259`), and the Factory calls Mastra's `oauthProvider.refreshToken` under a row lock and returns `undefined` on any error (`factory/src/.../tenant-credentials.ts:146,153`), marking nothing. Mastra's `OAuthProviderInterface.refreshToken` has no error type, status or `fetch` parameter (`dist/auth/types.d.ts:46-81`). So the classification is ours by necessity: each OAuth leaf (`anthropic.ts`, `openai-codex.ts`) calls its token endpoint itself with `fetch` and classifies by HTTP status, keeping Mastra's request exactly: Anthropic `POST https://console.anthropic.com/v1/oauth/token`, JSON `{ grant_type: 'refresh_token', client_id, refresh_token }`, `expires = now + expires_in * 1000 - 5 min` (`anthropic.ts:131-156`); Codex `POST https://auth.openai.com/oauth/token`, form encoded `grant_type, refresh_token, client_id`, parsed as Mastra's `tokenResponseToResult` requires both tokens (`openai-codex.ts:160-185,214-226`); 15 s timeout on both. If a later Mastra exports a refresh with a status, the leaf calls it instead. The URL and client id are local constants; `tests/repository/model-token-endpoints.test.mjs` parses the installed Mastra dist files (`@mastra/code-sdk/dist/auth/providers/anthropic.js` and `openai-codex.js`, where the constants are module private and Anthropic's client id is base64 encoded) and fails when they differ. The Codex leaf copies the account id and email extraction from the token's claims (id token claims, then access token claims, then the previous value; `openai-codex.ts:133-160`; Mastra exports it only under `__testing`, `openai-codex.js:483-491,543`), with a test over a fixture token.

**At call time** (`model-account/models.ts`). `refusalAtCall(held)` is one Vercel AI SDK middleware over `doGenerate` and `doStream` on every model the module builds. The spike showed a 401 and a 403 reach it as `APICallError` with `statusCode`, not retried, on all four model kinds; a 500 and a drop are retried by the SDK and pass through. A 401 on an `api_key` row, or on a Google row when the router passes the upstream's 401 (section 7), marks the row and throws the scope's code as the cause. A 401 on an `oauth` row proves only a dead access token: it forces one refresh (reread, refresh even if `expires` says valid, swap); only a `refused` refresh marks the row and raises the scope's code, and otherwise the call fails as a retryable provider fault. 403, 429 and 5xx pass to Mastra's own handling. A typed failure our refresher raised inside the provider's fetch (the token store's `current()`) passes through unchanged.

**Codes** (`contracts/technical/failures.json`, `audience: person`, each with a link action to Configurações › Modelos where the person can act):

| Code | Cause | Raised in |
| --- | --- | --- |
| `MODEL_ACCOUNT_MISSING` | no account pays for this model's provider | `refusalOf` |
| `MODEL_ACCOUNT_SIGN_IN_REQUIRED` | your account needs a new sign-in | `refusalOf`, refresh step 3, `refusalAtCall`, custody lost |
| `MODEL_ACCOUNT_INSTALLATION_SIGN_IN_REQUIRED` | the company account needs an administrator | the same places; `signInRequired(slot)` picks the code |
| `MODEL_ACCOUNT_CHANGED` | the row of a call in flight was removed or changed kind under it | refresh step 2; Google `acquire` on a newer generation |
| `GOOGLE_AI_PRO_ROUTER_UNAVAILABLE` | the router is down (exists) | the Google model builder |

`BUILDER_MODEL_AUTH_FAILED` is deleted; `BUILDER_MODEL_NOT_SELECTED` keeps one meaning (no model chosen, or a model id no route serves) and its text stops naming accounts (`failures.json:141,145`). `builder/runtime.ts` walks the cause chain for `MODEL_ACCOUNT_RUN_FAILURES` and `MODEL_LOGIN_UNAVAILABLE` (the walk `namesNoModelAccount` does today), and `failureOfType('auth')` returns null.

### 7. Google AI Pro at installation scope

- The pool keys each CLIProxyAPI instance by sign-in generation `{ modelAccountId, connectedAt }`, not by record hash. One company row used by every person's runs is one instance with many leases; the row owns it.
- It stops on no lease for `idleMs` (a final capture first), on Hub close, when a call holds a newer generation (retired with no write back), and after a remove or new sign-in commits (`pool.retire`). A call already in flight on an older generation than the running one fails with `MODEL_ACCOUNT_CHANGED`; the next call holds the new generation (section 4, each call picks again).
- Write back no longer waits for the stop: the one minute pool job (`system('model-account-capture')`) reads each running instance's auth file and, when the bytes changed, `swap`s on the instance's sealed value; a won swap makes the written value the instance's new compare value, so every later capture lands; a lost swap stops capture for that instance. A Hub crash loses at most one minute of refreshes.
- Runs reach the router with a ticket instead of the record: 32 random bytes (base64url), held in the pool's memory beside the instance, bound to the generation and not to a request or a lease, so an SDK retry carries a ticket that is still valid. It lives until its generation is retired (a new sign-in, a remove, the idle stop, Hub close). The router listens on loopback only (as today), takes a lease per HTTP request and runs `pool.acquire` itself, outside any transaction, as today (`router.ts:25-29`). An unknown or retired ticket answers `503` with `GOOGLE_AI_PRO_ROUTER_UNAVAILABLE`, never `401`. The router passes a `401` through only when CLIProxyAPI answered it, with header `x-conexus-upstream: 1`, and `refusalAtCall` marks the row only on that header. `write-back.ts` and its key to row map go (M11); the router's hard coded texts go (F5). Its own answers are proved on the real router before step 9 ends.
- The sign-in file on disk (`google-ai-pro/pool.ts:210`, mode `0600`, removed at stop, wiped at boot) becomes an A 11 departure row, now with its worst case lifetime (as long as anyone builds on the company account).

### 8. Module map and imports

`apps/hub/src/model-account/`, `module.ts` first, shaped like `registry/module.ts:8-39` (declares `ModelAccountModule`, returns a frozen object):

| File | Owns |
| --- | --- |
| `module.ts` | composition; `modelFor(openRun, call)`, `checkBeforeRun(accountId, modelIds)`, `readDefault`, `registerRoutes`, `jobs`, `close` |
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

```ts
// The Builder's port: runs work under this run's admission, now or later (a refresh, a forced refresh).
const openRun: OpenRun = (work) => withRun(database, ownerId, run.builderRunId, { via: 'account', accountId: run.accountId }, work)
const paid = await modelAccounts.modelFor(openRun, { modelId, thinkingLevel })   // holds inside openRun; marks outside it
await openRun((proof) => recordPayingAccount(proof, paid.modelAccountId))       // builder.builder_run_model_account
return paid.model
```

`OpenRun = <T>(work: (proof: Admitted<RunScope>) => Promise<T>) => Promise<T>` is declared in `model-account/module.ts` and built by the Builder; the module uses it for `hold`, `reread` and the refresh `swap`, and opens its own `system(...)` transaction only for `markRefused` and the Google capture.

### 9. API surface

Paths keep today's shape with `scope` added (operation names as on main when the build starts: PR #539 renames operations by verb and noun).

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
- **Empresa** for a member: greyed, "Só um administrador da instalação conecta a conta da empresa."; the administrator flag comes from `GET /api/session` (part 6).
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

- Personal rows: written and removed only by the owner (`admitAccount`); read by the owner. Installation rows: written and removed only by an installation administrator (`admitInstallationAdministrator(gate, 'model-account.manage')`), checked at sign-in start and again by the completing write's admission; read by every person. No reader reads `secret`.
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

## Build plan

One pull request, one green commit per step (tsc, Biome, tests, the guide L local check).

1. **Subtract and land the schema.** The migration in full: the guard over `model.model_account` and `connector.connection`, the delete of sessions and handoffs, the final columns. Rewrite today's personal SQL onto them (`scope = 'personal'`, `connected_by`, `connected_by_name`, `connected_at`, the partial `ON CONFLICT`). Delete the shared read, `MDL-01`'s `scope` (M9), the stale comments (N3), `plan`, the fake's `share()` and the raw `sharing` seeds (X1). Personal path green. Satisfies **AC-13** (part), prepares **AC-1**.
2. **Move.** Pure move of `builder/model-account/`, `builder/model-accounts.ts`, `builder/oauth-holds.ts` and the three provider folders into `model-account/`, imports fixed, no behavior change. **AC-13**.
3. **Envelope.** `SealContext`, `Sealed<O>`, `reseal`, `SECRET_CUSTODY_LOST`, `CONFIG_INVALID` for a missing key id, the AAD in the encryption, the plaintext branch deleted; `in-use.ts` lands here with its types only (`Slot`, `AccountRow`), which `modelAccountContext` needs; contexts at the 11 sites; the handoff reseal in `sessions.ts`; the custody test per owner; `seal-contexts.test.mjs`. **AC-9**.
4. **Registry and credential.** Flow and codec per kind; `Credential`, `parseCredential`; the pair CHECK pinning test; `modelFor(openRun, call)` and the Builder's `OpenRun` port (M4); `module.ts` takes the Hub's envelope (D6). **AC-13**.
5. **The rule.** `in-use.ts`; `MDL-02` over every provider (`MDL-08` deleted); `checkBeforeRun` without opening (M10); the fake calls the rule. **AC-11**, **AC-3**.
6. **One sign-in module.** Replaces the three `login.ts`; status mapping (F6); `SignInState`. **AC-13**, **AC-1**.
7. **Installation scope.** `admitWriter`, `'model-account.manage'`, `scope` on `MDL-03` and the starts, `MDL-12` remove, the log lines and their generated codes, `connected_by_name`; tests over HTTP. **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-8**.
8. **Refusal and codes.** `JobName` gains `model-account-refusal` and `model-account-capture` with their `admitSystem` branches; `markRefused` in its own transaction; `refresh.ts` with our own token calls, the swap and the forced refresh on an OAuth 401; `refusalAtCall`; the pinning test of the token endpoints; the five codes and their texts; `runtime.ts`; the refusal, survival, race, no fallback and mid run tests. **AC-6**, **AC-7**, **AC-10**.
9. **Google.** First the rotation check: two refreshes through a real CLIProxyAPI on a real Google account, comparing the stored refresh token (operator's ok for the account; if it rotates, stop and return to the operator). Then the generation keyed pool, the ticket and the router's answers, the minute capture, retire; the A 11 row; the router's own 401 and 503 proved on the real router. **AC-14**.
10. **Web and words.** One card per provider, one part per flow, the switch, the marker, failure links; P and V copy; C-032, A `:214`, S 6 rule, A 11 rows; the verify feature and the census script. **AC-2**, **AC-3**, **AC-4**, **AC-6**, **AC-12**.

The plan touches about 60 product files; the spec stays one because the six root causes share the files the company scope lands in (rationale, "Why one wave").

## What the wave deletes

- `builder/model-account/accounts.ts` (into `store.ts` and `module.ts`): `standing`, `write`, `usable`, `OwnAccount`, `ModelStanding`, the `withRun` and `ADMISSION_REFUSALS` imports, the `ownerId` dependency.
- `builder/model-account/providers.ts` (into `model-account/providers.ts`): `Lawful` and `LawfulCredential` become derived `CredentialKind`.
- `builder/model-accounts.ts` (into `routes.ts` and `offers.ts`): its `Caller`, `LISTED_PROVIDERS` and `OFFER_ORDER` split.
- `builder/oauth-holds.ts` (into `refresh.ts`).
- `builder/anthropic/{credential,login,route}.ts` and `builder/openai-codex/{credential,login,route}.ts` (into `anthropic.ts`, `openai-codex.ts`): the attempt maps, sweeps, login state copies, string parses.
- `builder/google-ai-pro/write-back.ts`; `login.ts` becomes `flow.ts` with Zod over the management answers (T6) and no timer.
- `builder/model-routing.ts` shrinks to the run side; `takeFrom` and `routeOf` move to `models.ts`.
- `builder/module.ts`: `createSecretEnvelope`, the key config, the Google start, the model routes.
- `failures.json`: `BUILDER_MODEL_AUTH_FAILED`; the account wording of `BUILDER_MODEL_NOT_SELECTED`.
- Contract: `MDL-08`, `OwnModelAccount`, `shared`, the unexported login enums, `MDL-01`'s `scope`, `OfferedModel.provider: z.string()`, the optional `loginId` query.
- Web: `api-key-account.tsx`, `claude-account.tsx`, `chatgpt-account.tsx`, `google-ai-pro-account.tsx`, their per card `refresh()` and hand built query keys.
- Tests: the fake's precedence and `share()`; raw `sharing` seeds.
- SQL: section 1's dropped list.

## Consequences

**Positive**:
- The company account works like the Factory's, without its two defects (runs and screen disagree; a failed organization refresh is silent).
- Model accounts become one module with one rule per fact; adding a provider is one registry row and one leaf.
- A secret moved to the wrong row fails loudly in every Hub owner.

**Negative / tradeoffs**:
- A large wave (about 60 product files) and a schema with no data path: it needs the post S1 reset, and an installation with real accounts could not take it without a reseal pass.
- Part 6 lands `sessions.ts` on the old envelope and this wave edits its five calls right after.
- `connected_at` carries two meanings (the shown date and the sign-in generation).
- The Google sign-in file sits on disk as long as anyone builds on the company account.
- A refused own account blocks a person who could have used the company's, until they sign in again or disconnect (decision 19).

**Neutral**:
- Everyone signs in again (the migration deletes sessions and handoffs), and the Sankhya connection and model accounts are connected again through the screens after the second reset.

## Migration plan

**Strategy**: no data migration (dev stage, no backward compatibility).

**Phases**: after S1, the local Conexus is reset and tested as a person, so by the time this wave's build lands its local database holds model accounts and the Sankhya connection, all sealed without associated data. So:
1. Right before applying this wave's migration on the local Conexus, a second reset of the local Conexus databases, everything included (operator's ok, 2026-10-06). Keycloak is not touched, and the Sankhya system stays read only; the Conexus connection to Sankhya is deleted with the rest.
2. The migration runs on empty `model.model_account` and `connector.connection` (its guard stops it otherwise) and deletes every session and handoff (everyone signs in again).
3. The operator adds the Sankhya connection again and the model accounts are connected through the screens, which is also the verify run's first step.

**Rollback**: revert the pull request and reset again. **Risks**: running it over rows (the guard stops it); forgetting step 3 (the verify run starts with it).

## Non-goals

- The default model writer (`model.installation_default`): spec 0008 slice 2. Until then the verify skill seeds it (`.agents/skills/verify/scripts/control.mjs:486`), and the post S1 person test uses the same seed.
- An account per Workspace or per team (C-024: one installation is one company), quotas or cost per person, a full change history table (the log keeps it).
- Key rotation's re-encryption job (D9, A 11): `reseal` is its primitive, the job is not built here.
- Generic sign-in paths (`/model-accounts/:provider/sign-in`): the paths keep today's shape.
- Two Hub processes per installation (F4): the swap makes a second process lose cleanly, nothing more.

## Preserved decisions

- C-024 (one installation, one company), C-026 (the installation administrator is an IAM role), C-027 (Hub hosted sign-in adapter for Google).
- The split wall of S1 (#512): `hub_reader` with RLS, `hub_command` with the Admitted proof, rules in TypeScript, one Zod contract.
- Model calls run in the Hub; no sandbox, app or browser receives a credential (S 6).
- The run records every account that paid (`builder.builder_run_model_account`).
- The operator's decisions 1 to 19 of the study (scope as a sum, own first, no fallback, both scopes removable, Google at both scopes, AAD everywhere).

## What breaks the premise

- Google rotates the refresh token on every access token refresh (C-027 names it): a crash within a minute after a refresh leaves a dead record, the row is marked and an administrator signs in again. The wave's verify drives two refreshes on a real company account and compares the stored refresh token; if it rotates, Google goes to the personal scope only and the operator decides.
- A provider changes its token endpoint, client id or request shape: the pinning test fails on the Mastra upgrade that carries it, and the leaf follows Mastra's new values. The real CLIProxyAPI router's own 401 was not run in the spike; the Google step proves it on the real router before step 9 ends.
- Part 6 lands a different session table or reader policy for `iam.account`: sections 1 and 2 are rechecked and the operator is asked before step 3.
- An installation with real model accounts or connections must keep them: the wave needs a reseal pass and returns to the operator.

## Owner reconciliation

- **S1 part 6** owns `identity-access/sessions.ts`, the `iam.account` reader policy and `GET /api/session`. It ships on today's envelope; this wave changes its five seal and open calls (the handoff to session hop becomes a `reseal`) after part 6 merged, with the part 6 owner's tests kept. Its `iam.account` reader policy is not touched.
- **Connectors** (part 2) own `connectors/store.ts` and `broker.ts`; this wave changes two calls and `checkCredential`'s argument.
- **Spec 0008** owns the default model; this wave only drops `plan`.
- **The Builder** owns the run, `withRun` and `builder_run_model_account`; it calls `modelFor` and records the paying row.
- **PR #539** renames operations; whichever merges second rebases.
- **The roadmap's Hub base wave** (`docs/roadmap.md:89`, "model accounts in the core", "one sign-in per model provider"): this wave delivers those two lines.

## Stop rule

Stop and return to the operator when: a step cannot end green without changing a decision of the study; part 6 merges a shape that changes sections 1 or 2; a spike or the verify disproves a "What breaks the premise" line; or the plan grows past 75 product files.

## Follow-up

- [x] "Conectada por <nome>": copied to the row at connect (operator, 2026-10-06).
- [x] Guide S 6 gains "A secret at rest is sealed with the installation's envelope and bound to the row it belongs to" (operator, 2026-10-06); the final wording is reviewed in the pull request.
- [ ] The operator confirms our own token refresh call for Claude and ChatGPT (section 6). The alternatives are unequal: parsing Mastra's message works for Anthropic only, and ChatGPT's refresh carries no cause at all, so AC-6 could not hold for ChatGPT; an upstream Mastra change first would block the wave on a release.
- [x] The second local reset of the Migration plan, everything in the local Conexus included (operator, 2026-10-06).
