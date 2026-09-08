import { createAnthropic } from '@ai-sdk/anthropic'
import type { MastraLanguageModel } from '@mastra/core/agent'
import { createBoundedProviderFetch } from './bounded-provider-fetch.js'
import type { OAuthTokenStore } from './oauth-token-store.js'

const ORIGIN = 'https://api.anthropic.com/'
const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude."
const BETAS = ['oauth-2025-04-20', 'claude-code-20250219', 'interleaved-thinking-2025-05-14', 'fine-grained-tool-streaming-2025-05-14']

export const PROJECT_ANTHROPIC_ADMISSION_ID = 'project-inception-opus-5'
export const PROJECT_ANTHROPIC_MODEL_ID = 'claude-opus-5'

const withIdentity = (body: BodyInit | null | undefined): BodyInit | null | undefined => {
  if (typeof body !== 'string') return body
  let value: unknown
  try { value = JSON.parse(body) } catch { throw new Error('PROJECT_MODEL_REQUEST_INVALID') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROJECT_MODEL_REQUEST_INVALID')
  const request = value as Record<string, unknown>
  const prior = request.system === undefined ? [] : typeof request.system === 'string'
    ? [{ type: 'text', text: request.system }]
    : Array.isArray(request.system) ? request.system : null
  if (!prior) throw new Error('PROJECT_MODEL_REQUEST_INVALID')
  return JSON.stringify({ ...request, system: [{ type: 'text', text: IDENTITY }, ...prior] })
}

export const createAnthropicOAuthModel = ({
  tokenStore,
  modelId = PROJECT_ANTHROPIC_MODEL_ID,
  fetchImpl = globalThis.fetch,
}: Readonly<{ tokenStore: OAuthTokenStore; modelId?: string; fetchImpl?: typeof globalThis.fetch }>): MastraLanguageModel => {
  if (!modelId || /latest|\*/i.test(modelId)) throw new Error('PROJECT_MODEL_ID_REFUSED')
  const bounded = createBoundedProviderFetch({
    officialOrigin: ORIGIN,
    maxResponseBytes: 8 * 1024 * 1024,
    fetchImpl: async (input, init = {}) => {
      const headers = new Headers(init.headers)
      headers.delete('authorization')
      headers.delete('x-api-key')
      headers.set('authorization', `Bearer ${await tokenStore.getAccessToken()}`)
      headers.set('anthropic-version', '2023-06-01')
      const requestBetas = (headers.get('anthropic-beta') ?? '').split(',').map((beta) => beta.trim()).filter(Boolean)
      headers.set('anthropic-beta', [...new Set([...BETAS, ...requestBetas])].join(','))
      headers.delete('content-length')
      const body = withIdentity(init.body)
      return fetchImpl(input, { ...init, redirect: 'manual', headers, ...(body === undefined ? {} : { body }) })
    },
  })
  return createAnthropic({
    apiKey: 'replaced-by-closed-oauth-transport',
    baseURL: `${ORIGIN}v1`,
    fetch: bounded,
  })(modelId) as unknown as MastraLanguageModel
}
