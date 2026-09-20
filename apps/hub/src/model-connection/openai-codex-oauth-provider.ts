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

export const DEFAULT_OPENAI_CODEX_MODEL_ID = 'gpt-5.5'

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

// The backend gates both its catalog and its models on the version the client declares. Measured on
// 2026-09-20: with no `version` header, gpt-5.6-sol and gpt-5.6-luna were refused as "not supported
// when using Codex with a ChatGPT account" while gpt-5.6-terra answered, and with one all three
// answered; the catalog returns nothing below the newest row's minimal_client_version (0.153.0 that
// day). This is the protocol level Conexus speaks, declared under its own originator.
const CLIENT_VERSION = '1.0.0'
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/

const authorize = async (tokenStore: OAuthTokenStore, base: HeadersInit | undefined): Promise<Headers> => {
  const headers = new Headers(base)
  headers.delete('authorization')
  headers.delete('x-api-key')
  const token = await tokenStore.getToken()
  if (!token.accountId) throw new Error('OPENAI_CODEX_OAUTH_ACCOUNT_ID_REQUIRED')
  headers.set('authorization', `Bearer ${token.access}`)
  headers.set('chatgpt-account-id', token.accountId)
  headers.set('originator', CONEXUS_ORIGINATOR)
  headers.set('user-agent', CONEXUS_ORIGINATOR)
  headers.set('version', CLIENT_VERSION)
  return headers
}

export type OpenAICodexCatalogModel = Readonly<{ modelId: string; label: string }>

// What this account may run, in the backend's own words and order. A row the backend hides
// (its reviewers and reserves) is not offered, and a row that is not a plain model id is dropped
// here, at the boundary, rather than trusted into a run.
export const listOpenAICodexModels = async ({ tokenStore, fetchImpl = globalThis.fetch }: Readonly<{
  tokenStore: OAuthTokenStore
  fetchImpl?: typeof globalThis.fetch
}>): Promise<readonly OpenAICodexCatalogModel[]> => {
  const bounded = createBoundedProviderFetch({ officialOrigin: ORIGIN, maxResponseBytes: 4 * 1024 * 1024, fetchImpl })
  const response = await bounded(`${BASE_URL}/models?client_version=${CLIENT_VERSION}`, { method: 'GET', headers: await authorize(tokenStore, undefined) })
  if (!response.ok) throw new Error('OPENAI_CODEX_CATALOG_UNAVAILABLE')
  const body: unknown = await response.json()
  const rows = typeof body === 'object' && body !== null && 'models' in body && Array.isArray(body.models) ? body.models : []
  return Object.freeze(rows.flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null || !('slug' in row) || typeof row.slug !== 'string' || !MODEL_ID.test(row.slug)) return []
    if (!('visibility' in row) || row.visibility !== 'list') return []
    const label = 'display_name' in row && typeof row.display_name === 'string' && row.display_name.trim() ? row.display_name.trim().slice(0, 120) : row.slug
    return [Object.freeze({ modelId: row.slug, label })]
  }))
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
      const headers = await authorize(tokenStore, init.headers)
      headers.delete('content-length')
      const body = withCodexRequirements(init.body)
      const response = await fetchImpl(input, { ...init, redirect: 'manual', headers, ...(body === undefined ? {} : { body }) })
      // This backend is undocumented, so its own words are the only account of a refusal. The body of
      // a refusal names what it disliked and carries no credential; the operator reads it in the Hub log.
      if (response.status >= 400) {
        const refusal = (await response.clone().text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600)
        process.emitWarning(`${response.status} ${refusal}`, { code: 'OPENAI_CODEX_REFUSED' })
      }
      return response
    },
  })
  const model = createOpenAI({
    apiKey: 'replaced-by-closed-oauth-transport',
    baseURL: BASE_URL,
    fetch: bounded,
  }).responses(modelId)
  // The SDK decides how to replay earlier steps from its own `store` option, before any request
  // exists: with it unset it sends references to items it assumes OpenAI kept. Nothing is kept here,
  // so a second step, which every tool call is, was refused with "Items are not persisted when
  // `store` is set to false". Told up front, the SDK replays the items themselves and asks for the
  // encrypted reasoning that makes that possible. The backend's catalog defaults every model's
  // reasoning summary to none, so a summary is asked for unless the caller chose otherwise, or the
  // person watching a run would see that the model thought and never what.
  type CallOptions = Parameters<typeof model.doStream>[0]
  const stateless = (options: CallOptions): CallOptions => ({
    ...options,
    providerOptions: { ...options.providerOptions, openai: { reasoningSummary: 'auto', ...options.providerOptions?.openai, store: false } },
  })
  return Object.assign(Object.create(model) as typeof model, {
    doGenerate: (options: CallOptions) => model.doGenerate(stateless(options)),
    doStream: (options: CallOptions) => model.doStream(stateless(options)),
  }) as unknown as MastraLanguageModel
}
