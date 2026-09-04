import { createAnthropic } from '@ai-sdk/anthropic'
import { createBoundedProviderFetch } from './bounded-provider-fetch.mjs'
import { createOAuthTokenStore } from './oauth-token-store.mjs'

export const ANTHROPIC_API_ORIGIN = 'https://api.anthropic.com/'
export const ANTHROPIC_API_BASE_URL = `${ANTHROPIC_API_ORIGIN}v1`
export const ANTHROPIC_MODEL_ID = 'claude-fable-5'
export const ANTHROPIC_OPUS_SUCCESSOR_MODEL_ID = 'claude-opus-5'
export const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude."
export const OAUTH_BETAS = Object.freeze([
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
])

function withIdentity(body) {
  if (typeof body !== 'string') return body
  let value
  try { value = JSON.parse(body) } catch { throw new Error('PROJECT_MODEL_REQUEST_INVALID') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROJECT_MODEL_REQUEST_INVALID')
  const identity = { type: 'text', text: CLAUDE_CODE_IDENTITY }
  const prior = value.system === undefined
    ? []
    : typeof value.system === 'string'
      ? [{ type: 'text', text: value.system }]
      : Array.isArray(value.system) ? value.system : null
  if (!prior) throw new Error('PROJECT_MODEL_REQUEST_INVALID')
  return JSON.stringify({ ...value, system: [...prior, identity] })
}

export function createAnthropicOAuthFetch({
  tokenStore = createOAuthTokenStore(),
  fetchImpl = globalThis.fetch,
  maxResponseBytes = 8 * 1024 * 1024,
  observe = () => {},
} = {}) {
  const authenticatedFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers)
    headers.delete('authorization')
    headers.delete('x-api-key')
    headers.delete('content-length')
    const requestedBetas = (headers.get('anthropic-beta') ?? '').split(',').map(value => value.trim()).filter(Boolean)
    headers.set('authorization', `Bearer ${await tokenStore.getAccessToken()}`)
    headers.set('anthropic-beta', [...new Set([...OAUTH_BETAS, ...requestedBetas])].join(','))
    headers.set('anthropic-version', '2023-06-01')
    return fetchImpl(input, { ...init, redirect: 'manual', headers, body: withIdentity(init.body) })
  }
  return createBoundedProviderFetch({
    officialOrigin: ANTHROPIC_API_ORIGIN,
    maxResponseBytes,
    fetchImpl: authenticatedFetch,
    observe,
  })
}

export function createAnthropicOAuthModel(options = {}) {
  const { modelId = ANTHROPIC_MODEL_ID, ...fetchOptions } = options
  if (![ANTHROPIC_MODEL_ID, ANTHROPIC_OPUS_SUCCESSOR_MODEL_ID].includes(modelId)) {
    throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
  }
  const provider = createAnthropic({
    authToken: 'replaced-by-closed-oauth-transport',
    baseURL: ANTHROPIC_API_BASE_URL,
    fetch: createAnthropicOAuthFetch(fetchOptions),
  })
  return provider(modelId)
}
