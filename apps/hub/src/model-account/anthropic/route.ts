import { createAnthropicThinkingMiddleware, opencodeClaudeMaxProvider, promptCacheMiddleware } from '@mastra/code-sdk/providers/claude-max'
import type { CredentialStore } from '@mastra/code-sdk/auth/types'
import { ModelsDevGateway, type MastraModelConfig } from '@mastra/core/llm'
import { MODEL_PROVIDERS, type Credential, type ClaudeTokens } from '../credential.js'
import { wrapGatewayModel } from '../models.js'
import { currentCredential, type NativeCredentialAccess } from '../refresh.js'
import { Failure } from '../../platform/failure.js'

async function currentClaude(access: NativeCredentialAccess): Promise<ClaudeTokens> {
  const credential = await currentCredential(access)
  if (credential.provider !== 'anthropic' || credential.kind !== 'oauth') throw new Failure('BUILDER_MODEL_NOT_SELECTED')
  return credential.value
}

function claudeCredentials(access: NativeCredentialAccess): CredentialStore {
  return Object.freeze({
    allowEnvironmentFallback: false,
    reload: () => undefined,
    get: () => undefined,
    getStoredApiKey: () => undefined,
    getApiKey: async () => (await currentClaude(access)).access,
  })
}

export async function anthropicModel({ access, credential, modelName }: Readonly<{
  access: NativeCredentialAccess
  credential: Extract<Credential, { provider: 'anthropic' }>
  modelName: string
}>): Promise<MastraModelConfig> {
  const thinkingLevel = access.thinkingLevel ?? undefined
  switch (credential.kind) {
    case 'api_key': return wrapGatewayModel(
      await new ModelsDevGateway().resolveLanguageModel({ providerId: MODEL_PROVIDERS.anthropic.routerPrefix, modelId: modelName, apiKey: credential.value }),
      [promptCacheMiddleware, createAnthropicThinkingMiddleware(modelName, thinkingLevel)],
    )
    case 'oauth': return opencodeClaudeMaxProvider(modelName, { authStorage: claudeCredentials(access), ...thinkingLevel ? { thinkingLevel } : {} })
  }
}
