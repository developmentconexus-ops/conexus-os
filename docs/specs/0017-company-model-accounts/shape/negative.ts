import type { Credential, CredentialKind, ModelId } from './credential.js'
import { AnthropicKey } from './credential.js'
import type { Admitted, AccountScope, RunScope, Result, WaveFailure } from './dependencies.js'
import type { SecretEnvelope, Sealed, SealContext } from './secrets.js'
import type { ModelAccountStore } from './store.js'
// @ts-expect-error No Codex key variant exists.
const illegalPair: CredentialKind = { provider: 'openai-codex', kind: 'api_key' }
// @ts-expect-error A subscription cannot contain a key value.
const wrongValue: Credential = { provider: 'anthropic', kind: 'oauth', value: AnthropicKey.parse('example') }
// @ts-expect-error Key values pass the codec.
const bareKey: Credential = { provider: 'anthropic', kind: 'api_key', value: 'example' }
// @ts-expect-error OAuth expiry is required.
const incomplete: Credential = { provider: 'anthropic', kind: 'oauth', value: { access: 'example', refresh: 'example' } }
// @ts-expect-error SDK absent email is normalized to null.
const codex: Credential = { provider: 'openai-codex', kind: 'oauth', value: { access: 'example', refresh: 'example', expires: 1, accountId: 'provider' } }
// @ts-expect-error Model is one parsed opaque string, not three independently writable fields.
const bareModel: ModelId = 'anthropic/example'
declare const run: Admitted<RunScope>
declare const reader: Admitted<AccountScope, 'read'>
declare const store: ModelAccountStore
declare const credential: Credential
// @ts-expect-error The actual pinned upstream proof is nominal.
const forged: Admitted<AccountScope> = { scope: { kind: 'account', accountId: run.scope.accountId }, mode: 'write', tx: run.tx }
// @ts-expect-error A run is not account-list admission.
store.list(run)
// @ts-expect-error Read admission cannot connect.
store.connect({ proof: reader, credential, displayName: 'Example' })
declare const envelope: SecretEnvelope
declare const sealed: Sealed<'model-account'>
declare const session: SealContext<'hub-session'>
// @ts-expect-error Ciphertext owner and context cannot widen each other.
envelope.open(sealed, session)
// @ts-expect-error Raw bytes pass a column codec.
const raw: Sealed<'model-account'> = 'example'
// @ts-expect-error The upstream Result has only one arm at a time.
const contradictory: Result<void, WaveFailure> = { ok: true, result: undefined, error: { code: 'ACCOUNT_INACTIVE' } }
void [illegalPair, wrongValue, bareKey, incomplete, codex, bareModel, forged, raw, contradictory]

// @ts-expect-error Only row-context factories mint contexts from branded ids/digests.
const forgedContext: SealContext<'model-account'> = { owner: 'model-account', binding: 'reusable-slot' }
void forgedContext
