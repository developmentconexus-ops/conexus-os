import type { Credential, CredentialKind } from '../../apps/hub/src/model-account/credential.js'
import { AnthropicKey, parseCredential } from '../../apps/hub/src/model-account/credential.js'
import type { ModelId, ModelRole, Result, FailureCode } from '@conexus/contract'

// @ts-expect-error Codex has no key variant.
const illegalPair: CredentialKind = { provider: 'openai-codex', kind: 'api_key' }
// @ts-expect-error OAuth cannot contain a key value.
const wrongValue: Credential = { provider: 'anthropic', kind: 'oauth', value: AnthropicKey.parse('example') }
// @ts-expect-error Key values require the credential codec's brand.
const bareKey: Credential = { provider: 'anthropic', kind: 'api_key', value: 'example' }
// @ts-expect-error OAuth expiry is required.
const missingExpiry: Credential = { provider: 'anthropic', kind: 'oauth', value: { access: 'example', refresh: 'example' } }
// @ts-expect-error Normalized Codex email is required.
const missingEmail: Credential = { provider: 'openai-codex', kind: 'oauth', value: { access: 'example', refresh: 'example', expires: 1, accountId: 'provider' } }
// @ts-expect-error Codex account identity is required.
const missingAccount: Credential = { provider: 'openai-codex', kind: 'oauth', value: { access: 'example', refresh: 'example', expires: 1, email: null } }
// @ts-expect-error Google values require their own brand.
const bareGoogle: Credential = { provider: 'google-ai-pro', kind: 'google_ai_pro', value: 'example' }
// @ts-expect-error A model identity must cross its parse edge.
const bareModel: ModelId = 'anthropic/example'
// @ts-expect-error Only build and memory roles exist.
const illegalRole: ModelRole = 'plan'
const codex = parseCredential({ provider: 'openai-codex', kind: 'oauth' }, 'example')
// @ts-expect-error The returned credential is immutable.
codex.kind = 'oauth'
if (codex.provider === 'openai-codex') {
  // @ts-expect-error The narrowed parsed token fields are immutable.
  codex.value.expires = 2
}
// @ts-expect-error A model identity has no separately writable provider field.
bareModel.provider = 'openai'
void [illegalPair, wrongValue, bareKey, missingExpiry, missingEmail, missingAccount, bareGoogle, bareModel, illegalRole]

import type { Admitted, AccountScope, RunScope, SystemScope, Checked, ApplicationScope } from '../../apps/hub/src/identity-access/admission.js'
import type { CommandGate } from '../../apps/hub/src/platform/db.js'
import type { ModelAccountStore, HeldAccount, OpenRun } from '../../apps/hub/src/model-account/store.js'
import type { ModelAccountModule } from '../../apps/hub/src/model-account/module.js'
declare const coreStore: ModelAccountStore
declare const commandGate: CommandGate
declare const accountRead: Admitted<AccountScope, 'read'>
declare const accountWrite: Admitted<AccountScope>
declare const runProof: Admitted<RunScope>
declare const systemProof: Admitted<SystemScope>
declare const checkedApplication: Checked<ApplicationScope>
declare const heldModel: HeldAccount
declare const models: ModelAccountModule
declare const openRun: OpenRun
// @ts-expect-error Holding credentials requires admission, not an entry gate.
coreStore.hold(commandGate, 'anthropic')
// @ts-expect-error A personal account's read proof cannot select a run's credential.
coreStore.hold(accountRead, 'anthropic')
// @ts-expect-error Account commands do not carry run authority.
coreStore.hold(accountWrite, 'anthropic')
// @ts-expect-error A checked application has neither admission nor run authority.
coreStore.hold(checkedApplication, 'anthropic')
// @ts-expect-error Model metadata reads require account read admission.
coreStore.list(runProof)
// @ts-expect-error Credential persistence belongs to system admission after a run ends.
coreStore.persist(runProof, heldModel, heldModel.credential)
// @ts-expect-error A personal account command cannot perform the refresh owner's system write.
coreStore.persist(accountWrite, heldModel, heldModel.credential)
// @ts-expect-error An admitted scope cannot be forged from its public fields.
const forgedRun: Admitted<RunScope> = { scope: runProof.scope, tx: runProof.tx }
// @ts-expect-error An OpenRun must return the actual Result union, not an arbitrary callback value.
openRun(async () => heldModel)
// @ts-expect-error The native model selection requires a branded model id.
models.modelFor(openRun, { modelId: 'anthropic/claude-sonnet-5', thinkingLevel: null })
// @ts-expect-error Model roles are the finite build/memory contract.
models.readDefault(runProof.scope.accountId, 'chat')
void [systemProof, forgedRun]

// @ts-expect-error A read proof cannot write a personal credential.
coreStore.connect({ proof: accountRead, credential: heldModel.credential, displayName: 'Synthetic' })
// @ts-expect-error The actual shared Result permits only one arm.
const contradictory: Result<void, Readonly<{ code: FailureCode }>> = { ok: true, result: undefined, error: { code: 'ACCOUNT_INACTIVE' } }
declare const result: Result<void, Readonly<{ code: FailureCode }>>
// @ts-expect-error The actual shared Result is readonly.
result.ok = false
void contradictory

import type { HoldError } from '../../apps/hub/src/model-account/store.js'
// @ts-expect-error Database faults escape unchanged and cannot become model refusals.
const databaseRefusal: HoldError = { code: 'DATABASE_BUSY' }
// @ts-expect-error Configuration faults escape unchanged and cannot become model refusals.
const configRefusal: HoldError = { code: 'CONFIG_INVALID' }
// @ts-expect-error Custody refusal must retain the immutable row and spent envelope.
const contextFreeCustody: HoldError = { code: 'SECRET_CUSTODY_LOST' }
void [databaseRefusal, configRefusal, contextFreeCustody]
