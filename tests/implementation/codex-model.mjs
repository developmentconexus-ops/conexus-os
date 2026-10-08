import { hubModuleUrl } from './hub-build.mjs'
const { toCodexTokens } = await import(hubModuleUrl('model-account/credential.js'))
import { providerModel } from './native-model-fixture.mjs'
export function codexModel(name, tokens, { current = async () => tokens } = {}) {
  return providerModel({ credential: { provider: 'openai-codex', kind: 'oauth', value: toCodexTokens(tokens) }, modelId: `openai/${name}`,
    current: async () => ({ provider: 'openai-codex', kind: 'oauth', value: toCodexTokens(await current()) }) })
}
