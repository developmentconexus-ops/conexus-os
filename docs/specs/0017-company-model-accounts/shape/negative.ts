import type { WaveFailure } from './dependencies.js'
import type { AccountId } from '@conexus/contract'
import type { Credential, CredentialKind, ParsedModelId } from './credential.js'
import { AnthropicKey } from './credential.js'
// @ts-expect-error The registry excludes a Codex API key.
const illegalPair: CredentialKind = { provider: 'openai-codex', kind: 'api_key' }
// @ts-expect-error A Claude subscription cannot contain a key.
const wrongValue: Credential = { provider: 'anthropic', kind: 'oauth', value: AnthropicKey.parse('example') }
// @ts-expect-error A key must pass its codec before entering the domain.
const bareKey: Credential = { provider: 'anthropic', kind: 'api_key', value: 'example' }
// @ts-expect-error An OAuth expiry is required.
const incompleteTokens: Credential = { provider: 'anthropic', kind: 'oauth', value: { access: 'example', refresh: 'example' } }
// @ts-expect-error Codex has an explicit absent email, never an optional field.
const incompleteCodex: Credential = { provider: 'openai-codex', kind: 'oauth', value: { access: 'example', refresh: 'example', expires: 1, accountId: 'provider-example' } }
// @ts-expect-error Model ids must be parsed into the contract brand.
const bareModel: ParsedModelId = { routerId: 'anthropic/example', prefix: 'anthropic', name: 'example' }
// @ts-expect-error Provider account identity is not Conexus Account identity.
const providerAccount: AccountId = 'provider-example'
void [illegalPair, wrongValue, bareKey, incompleteTokens, incompleteCodex, bareModel, providerAccount]

import type { Admitted, AccountScope, RunScope, Result } from './dependencies.js'
import type { SecretEnvelope, Sealed, SealContext } from './secrets.js'
import type { AccountRow, HoldError } from './store.js'
import { list, connect } from './store.js'
import { modelAccountContext } from './secrets.js'
declare const runProof: Admitted<RunScope>
declare const reader: Admitted<AccountScope, 'read'>
declare const envelope: SecretEnvelope
declare const sealed: Sealed<'model-account'>
declare const wrongOwner: SealContext<'hub-session'>
declare const credential: Credential
// @ts-expect-error Only upstream admission constructs a nominal proof.
const forged: Admitted<AccountScope> = { scope: { kind: 'account', accountId: providerAccount }, mode: 'write', tx: runProof.tx }
// @ts-expect-error Run authority does not admit account listings.
list(runProof)
// @ts-expect-error Read mode does not admit a personal write.
connect({ proof: reader, credential, displayName: 'Example' })
// @ts-expect-error Seal ownership cannot be widened to another owner.
envelope.open(sealed, wrongOwner)
// @ts-expect-error Sealed bytes must pass their owner column codec.
const raw: Sealed<'model-account'> = 'example'
// @ts-expect-error The custody branch carries a row for its caller.
const custodyWithoutRow: HoldError = { code: 'SECRET_CUSTODY_LOST' }
// @ts-expect-error A successful Result cannot carry an error.
const contradictory: Result<void, WaveFailure> = { ok: true, result: undefined, error: { code: 'ACCOUNT_INACTIVE' } }
// @ts-expect-error An error arm uses error.code, not reason beside ok.
const oldResult: Result<void, WaveFailure> = { ok: false, reason: 'ACCOUNT_INACTIVE' }
// @ts-expect-error Model context accepts only lawful credential pairs.
modelAccountContext({ scope: 'installation', provider: 'openai-codex', kind: 'api_key' })
void [forged, raw, custodyWithoutRow, contradictory, oldResult]

import { parseCredential } from './credential.js'
import type { HeldAccount as CorrelatedHeld } from './store.js'
declare const oauthHeld: Extract<CorrelatedHeld, { credential: { provider: 'anthropic'; kind: 'oauth' } }>
// @ts-expect-error A held OAuth row cannot contain an API-key credential.
const mismatchedHeld: CorrelatedHeld = { ...oauthHeld, credential: { provider: 'anthropic', kind: 'api_key', value: AnthropicKey.parse('example') } }
const parsedClaude = parseCredential({ provider: 'anthropic', kind: 'oauth' }, 'example')
// @ts-expect-error A specific parsed pair cannot return another credential kind.
const parsedKey: Extract<Credential, { provider: 'anthropic'; kind: 'api_key' }> = parsedClaude
void [mismatchedHeld, parsedKey]
