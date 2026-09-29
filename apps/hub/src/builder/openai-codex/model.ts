// Copied from @mastra/code-sdk 1.8.3: dist/providers/openai-codex.js (createCodexMiddleware,
// buildOpenAICodexOAuthFetch, openaiCodexProvider) and dist/providers/model-ids.js
// (CODEX_OPENAI_MODEL_REMAPS, remapOpenAIModelForCodexOAuth), the parts dist/agents/model.js and
// dist/agents/mastracode-gateway.js use to build an `openai/*` model on a ChatGPT subscription.
// Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0); see
// @mastra/code-sdk's LICENSE.md. Wire values are unchanged. Changed: the bearer comes from the
// run's held account (`CodexBearer`) instead of Mastra Code's file-backed AuthStorage, the
// reasoning effort is Mastra Code's default level (`medium`) since the Builder does not pass a
// thinking level yet, and the OPENAI_BASE_URL and test-environment branches are dropped because
// the Hub always calls the Codex endpoint, and `reasoningSummary: 'auto'` is added so the model
// returns the reasoning text the Builder shows (Mastra Code never asks for it). Only the file's home becomes Conexus's.
import { createOpenAI } from '@ai-sdk/openai'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'

/** A live bearer for one call: refreshed first when it has expired, never cached by the caller. */
export type CodexBearer = () => Promise<Readonly<{ accessToken: string; accountId: string }>>

const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'
const CODEX_ORIGINATOR = 'mastracode'
const CODEX_USER_AGENT = 'mastracode'
const CODEX_REASONING_EFFORT = 'medium'
const CODEX_INSTRUCTIONS = `You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: You should be concise, direct, and helpful. Focus on solving the user's problem efficiently.`

/**
 * The Codex ChatGPT-account endpoint serves some OpenAI models only under a
 * `-codex` id. Applied wherever a model id is sent over Codex OAuth (chat
 * agents and Stagehand alike) so both paths hit the same upstream model.
 */
const CODEX_OPENAI_MODEL_REMAPS: Readonly<Record<string, string>> = {
  'gpt-5.3': 'gpt-5.3-codex',
  'gpt-5.2': 'gpt-5.2-codex',
  'gpt-5.1': 'gpt-5.1-codex',
  'gpt-5.1-mini': 'gpt-5.1-codex-mini',
  'gpt-5': 'gpt-5-codex',
}

const remapForCodexOAuth = (modelId: string): string =>
  modelId.includes('-codex') ? modelId : CODEX_OPENAI_MODEL_REMAPS[modelId] ?? modelId

/**
 * Create Codex middleware with the given reasoning effort level.
 */
function createCodexMiddleware(reasoningEffort: string | undefined): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (params.temperature !== undefined && params.temperature !== null) delete params.topP
      params.providerOptions = {
        ...params.providerOptions,
        openai: {
          ...params.providerOptions?.openai ?? {},
          instructions: CODEX_INSTRUCTIONS,
          store: false,
          ...reasoningEffort ? { reasoningEffort } : {},
          reasoningSummary: 'auto',
        },
      }
      return params
    },
  }
}

/**
 * Build a fetch function that handles OpenAI Codex OAuth.
 * Preserves non-authorization headers from init.
 * Rewrites /v1/responses and /chat/completions to the Codex API endpoint.
 */
function buildOpenAICodexOAuthFetch(bearer: CodexBearer): typeof fetch {
  return (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const { accessToken, accountId } = await bearer()
    const { headers: initHeaders, ...requestInit } = init ?? {}
    const request = new Request(url, requestInit)
    const headers = new Headers(url instanceof Request ? url.headers : undefined)
    if (initHeaders) new Headers(initHeaders).forEach((value, key) => { headers.set(key, value) })
    headers.delete('authorization')
    headers.delete('x-api-key')
    headers.set('Authorization', `Bearer ${accessToken}`)
    if (!headers.has('originator')) headers.set('originator', CODEX_ORIGINATOR)
    if (!headers.has('User-Agent')) headers.set('User-Agent', CODEX_USER_AGENT)
    if (accountId) headers.set('ChatGPT-Account-ID', accountId)
    const parsed = new URL(request.url)
    const finalUrl = parsed.pathname.includes('/v1/responses') || parsed.pathname.includes('/chat/completions') ? new URL(CODEX_API_ENDPOINT) : parsed
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
    const finalRequest = new Request(finalUrl, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
      redirect: request.redirect,
      integrity: request.integrity,
      ...body ? { duplex: 'half' } : {},
    } as RequestInit)
    return fetch(finalRequest)
  }) as typeof fetch
}

/**
 * Creates an OpenAI model using ChatGPT OAuth authentication.
 *
 * IMPORTANT: This uses the Codex API endpoint, not the standard OpenAI API.
 * URLs are rewritten from /v1/responses or /chat/completions to the Codex endpoint.
 */
export function openaiCodexModel(modelId: string, bearer: CodexBearer) {
  return wrapLanguageModel({
    model: createOpenAI({ apiKey: 'oauth-dummy-key', fetch: buildOpenAICodexOAuthFetch(bearer) }).responses(remapForCodexOAuth(modelId)),
    middleware: [createCodexMiddleware(CODEX_REASONING_EFFORT)],
  })
}
