import type { Credential, CredentialKind } from '../../apps/hub/src/builder/model-account/providers.js'
import { AnthropicKey, parseCredential } from '../../apps/hub/src/builder/model-account/providers.js'
import type { ModelId, ModelRole } from '@conexus/contract'

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
// @ts-expect-error The parsed token fields are immutable.
codex.value.expires = 2
// @ts-expect-error A model identity has no separately writable provider field.
bareModel.provider = 'openai'
void [illegalPair, wrongValue, bareKey, missingExpiry, missingEmail, missingAccount, bareGoogle, bareModel, illegalRole]
