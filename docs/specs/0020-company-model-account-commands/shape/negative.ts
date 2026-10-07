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

import type { Admitted, AccountScope, AdministratorScope, RunScope, SystemScope, Result } from './dependencies.js'
import type { SecretEnvelope, Sealed, SealContext } from './secrets.js'
import { list, connect, markRefused, swap } from './store.js'
import type { AccountRow, HeldAccount } from './store.js'
import { modelAccountContext } from './secrets.js'
import type { SignInState, FlowInput } from './module.js'
declare const runProof: Admitted<RunScope>
declare const readerProof: Admitted<AdministratorScope, 'read'>
declare const envelope: SecretEnvelope
declare const accountSecret: Sealed<'model-account'>
declare const sessionContext: SealContext<'hub-session'>
declare const systemProof: Admitted<SystemScope<'model-account-refusal'>>
declare const captureProof: Admitted<SystemScope<'model-account-capture'>>
declare const row: AccountRow
declare const heldKey: Extract<HeldAccount, { credential: { provider: 'anthropic'; kind: 'api_key' } }>
declare const oauth: Extract<Credential, { provider: 'anthropic'; kind: 'oauth' }>
declare const lawful: Credential
// @ts-expect-error Only 0018's admission owner constructs the nominal proof.
const forged: Admitted<AccountScope> = { mode: 'write', scope: { kind: 'account', accountId: providerAccount }, tx: runProof.tx }
// @ts-expect-error A run command proof cannot authorize an account listing.
list(runProof)
// @ts-expect-error A read proof cannot authorize an installation write.
connect({ proof: readerProof, scope: 'installation', credential: lawful, displayName: 'Example' })
// @ts-expect-error Owner contexts cannot be widened to open a secret of another owner.
envelope.open(accountSecret, sessionContext)
// @ts-expect-error Raw sealed bytes must be parsed by the owner column schema.
const rawSealed: Sealed<'model-account'> = 'conexus:secret:v1:example'
// @ts-expect-error A refused refresh always compares the spent sealed value.
markRefused({ proof: systemProof, mark: { reason: 'PROVIDER_REFRESH_REFUSED', row } })
// @ts-expect-error A refusal carries the canonical error, not a reason beside ok.
const oldResult: Result<void, WaveFailure> = { ok: false, reason: 'ACCOUNT_INACTIVE' }
// @ts-expect-error No succeeded result can also carry an error.
const impossibleResult: Result<void, WaveFailure> = { ok: true, result: undefined, error: { code: 'ACCOUNT_INACTIVE' } }
// @ts-expect-error A refused sign-in names its table code.
const noCode: SignInState = { state: 'refused' }
// @ts-expect-error Paste flows cannot advance without pasted input.
const noPaste: FlowInput = { flow: 'paste-code' }
void [forged, rawSealed, oldResult, impossibleResult, noCode, noPaste]

// @ts-expect-error Capture cannot authorize a refusal write.
markRefused({ proof: captureProof, mark: { reason: 'CUSTODY_CHANGED', row, spent: accountSecret } })
// @ts-expect-error Refusal cannot authorize a credential swap.
swap({ proof: systemProof, held: heldKey, next: heldKey.credential })
// @ts-expect-error Refresh cannot change the selected credential kind.
swap({ proof: runProof, held: heldKey, next: oauth })
// @ts-expect-error A custody binding cannot contain an illegal provider/kind pair.
modelAccountContext({ scope: 'installation', provider: 'openai-codex', kind: 'api_key' })

import type { HoldError } from './store.js'
// @ts-expect-error A custody error must carry its typed row.
const noCustodyRow: HoldError = { code: 'SECRET_CUSTODY_LOST' }
void noCustodyRow

import { parseCredential } from './credential.js'
import type { HeldAccount as CorrelatedHeld } from './store.js'
declare const oauthHeld: Extract<CorrelatedHeld, { credential: { provider: 'anthropic'; kind: 'oauth' } }>
// @ts-expect-error A held OAuth row cannot contain an API-key credential.
const mismatchedHeld: CorrelatedHeld = { ...oauthHeld, credential: { provider: 'anthropic', kind: 'api_key', value: AnthropicKey.parse('example') } }
const parsedClaude = parseCredential({ provider: 'anthropic', kind: 'oauth' }, 'example')
// @ts-expect-error A specific parsed pair cannot return another credential kind.
const parsedKey: Extract<Credential, { provider: 'anthropic'; kind: 'api_key' }> = parsedClaude
void [mismatchedHeld, parsedKey]
