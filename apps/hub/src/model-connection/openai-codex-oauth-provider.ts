import { createOpenAI } from '@ai-sdk/openai'
import type { MastraLanguageModel } from '@mastra/core/agent'
import { createBoundedProviderFetch } from './bounded-provider-fetch.js'
import { CONEXUS_ORIGINATOR } from './oauth-provider-registry.js'
import type { OAuthTokenStore } from './oauth-token-store.js'

const ORIGIN = 'https://chatgpt.com/'
// The Responses model appends /responses to the base URL, so the base carries the Codex path and
// the pinned egress origin stays a bare origin, exactly as the Anthropic call is built.
const BASE_URL = `${ORIGIN}backend-api/codex`
// The Codex backend requires a non-empty instructions field on every request. It does not police
// the content: the reference implementation sends a generic sentence rather than the Codex CLI's
// own prompt, and works. This is the structural counterpart of the Anthropic identity block, with
// one difference worth knowing: Anthropic's prepends to the caller's system prompt, and this
// supplies a default only when the caller has no instructions of its own.
const INSTRUCTIONS = 'You are a coding agent running inside Conexus. Use the tools available to you to help the user with software engineering tasks.'

export const DEFAULT_OPENAI_CODEX_MODEL_ID = 'gpt-5.3-codex'

// stream and store are not the caller's to choose. The backend delivers Server-Sent Events and
// refuses a request that asks it not to, and store: false keeps the conversation off OpenAI's
// side. An unexpected body shape is refused rather than passed through, so a request that cannot
// carry these settings never leaves the Hub.
const withCodexRequirements = (body: BodyInit | null | undefined): BodyInit | null | undefined => {
  if (typeof body !== 'string') return body
  let value: unknown
  try { value = JSON.parse(body) } catch { throw new Error('PROJECT_MODEL_REQUEST_INVALID') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROJECT_MODEL_REQUEST_INVALID')
  const request = value as Record<string, unknown>
  const supplied = typeof request.instructions === 'string' ? request.instructions.trim() : ''
  return JSON.stringify({ ...request, instructions: supplied || INSTRUCTIONS, stream: true, store: false })
}

export const createOpenAICodexOAuthModel = ({
  tokenStore,
  modelId = DEFAULT_OPENAI_CODEX_MODEL_ID,
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
      const token = await tokenStore.getToken()
      if (!token.accountId) throw new Error('OPENAI_CODEX_OAUTH_ACCOUNT_ID_REQUIRED')
      headers.set('authorization', `Bearer ${token.access}`)
      headers.set('chatgpt-account-id', token.accountId)
      headers.set('originator', CONEXUS_ORIGINATOR)
      headers.set('user-agent', CONEXUS_ORIGINATOR)
      headers.delete('content-length')
      const body = withCodexRequirements(init.body)
      return fetchImpl(input, { ...init, redirect: 'manual', headers, ...(body === undefined ? {} : { body }) })
    },
  })
  return createOpenAI({
    apiKey: 'replaced-by-closed-oauth-transport',
    baseURL: BASE_URL,
    fetch: bounded,
  }).responses(modelId) as unknown as MastraLanguageModel
}
