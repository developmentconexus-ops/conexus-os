import { parseModelString, type MastraModelConfig } from '@mastra/core/llm'
import type { ModelId, ModelAccountProvider } from '@conexus/contract'
import { MODEL_PROVIDERS } from './credential.js'
import { anthropicModel } from './anthropic/route.js'
import { codexModel } from './openai-codex/route.js'
import { googleAiProModel } from './google-ai-pro/route.js'
import type { GoogleAiProKey } from './credential.js'
import type { NativeCredentialAccess } from './refresh.js'

export function providerOf(modelId: ModelId): ModelAccountProvider | null {
  const prefix = parseModelString(modelId).provider
  switch (prefix) {
    case MODEL_PROVIDERS.anthropic.routerPrefix: return 'anthropic'
    case MODEL_PROVIDERS['openai-codex'].routerPrefix: return 'openai-codex'
    case MODEL_PROVIDERS['google-ai-pro'].routerPrefix: return 'google-ai-pro'
    default: return null
  }
}

export type GoogleModelRuntime = Readonly<{ url: string | null; track(key: GoogleAiProKey, access: NativeCredentialAccess): void }>

export function nativeModel({ access, modelId, google }: Readonly<{ access: NativeCredentialAccess; modelId: ModelId; google: GoogleModelRuntime }>): Promise<MastraModelConfig> {
  const modelName = parseModelString(modelId).modelId
  const credential = access.held.credential
  switch (credential.provider) {
    case 'anthropic': return anthropicModel({ access, credential, modelName })
    case 'openai-codex': return Promise.resolve(codexModel({ access, tokens: credential.value, modelName }))
    case 'google-ai-pro': return googleAiProModel({ access, modelName, routerUrl: google.url, track: google.track })
  }
}
