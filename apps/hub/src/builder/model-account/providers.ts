import { z } from 'zod'
import { parseModelString } from '@mastra/core/llm'
import { ModelAccountProvider, ModelAccountKind, ModelId } from '@conexus/contract'
import type { OAuthCredentials } from '@mastra/code-sdk/auth/types'
import { Failure } from '../../platform/failure.js'

const OAuth = z.object({ access: z.string(), refresh: z.string(), expires: z.number() })
export const AnthropicKey = z.string().regex(/^sk-ant-[A-Za-z0-9_-]{20,200}$/).brand<'AnthropicKey'>()
export const ClaudeTokens = OAuth.readonly()
export type ClaudeTokens = z.output<typeof ClaudeTokens>
export const CodexTokens = OAuth.extend({ accountId: z.string(), email: z.string().nullable() }).readonly()
export type CodexTokens = z.output<typeof CodexTokens>
export const GOOGLE_RECORD_PREFIX = 'cxagy1.'
const GOOGLE_AUTH_FILE_NAME = /^antigravity-[\w.@+-]{1,200}\.json$/

export function isAuthFileName(name: string): boolean {
  return GOOGLE_AUTH_FILE_NAME.test(name)
}

export const GoogleAiProKey = z.string().refine(function validRecord(value) {
  if (!value.startsWith(GOOGLE_RECORD_PREFIX)) return false
  const parts = value.slice(GOOGLE_RECORD_PREFIX.length).split('.')
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return false
  const fileName = Buffer.from(parts[0] ?? '', 'base64url').toString()
  const bytes = Buffer.from(parts[1] ?? '', 'base64url')
  if (!isAuthFileName(fileName) || bytes.length === 0 || bytes.length > 64 * 1024) return false
  try {
    const record: unknown = JSON.parse(bytes.toString())
    return typeof record === 'object' && record !== null && 'type' in record && record.type === 'antigravity'
  } catch { return false }
}).brand<'GoogleAiProKey'>()
export type GoogleAiProKey = z.output<typeof GoogleAiProKey>
const Json = z.codec(z.string(), z.json(), {
  decode(text, ctx) {
    try { return z.json().parse(JSON.parse(text)) }
    catch { ctx.issues.push({ code: 'custom', message: 'Invalid JSON', input: text }); return z.NEVER }
  },
  encode(value) { return JSON.stringify(value) },
})
const StoredClaude = z.object({ type: z.literal('oauth'), ...OAuth.shape })
const StoredCodex = StoredClaude.extend({ accountId: z.string(), email: z.string().nullable() })
const ClaudeRecord = Json.pipe(z.codec(StoredClaude, ClaudeTokens, {
  decode({ type: _type, ...value }) { return value },
  encode(value) { return { type: 'oauth' as const, ...value } },
}))
const CodexRecord = Json.pipe(z.codec(StoredCodex, CodexTokens, {
  decode({ type: _type, ...value }) { return value },
  encode(value) { return { type: 'oauth' as const, ...value } },
}))
type Entry = Readonly<{ name: string; routerPrefix: string; models: readonly string[] | null; kinds: Partial<Record<ModelAccountKind, Readonly<{ flow: string; codec: z.ZodType }>>> }>
export const MODEL_PROVIDERS = {
  anthropic: { name: 'Anthropic (Claude)', routerPrefix: 'anthropic', kinds: { api_key: { flow: 'api-key', codec: AnthropicKey }, oauth: { flow: 'paste-code', codec: ClaudeRecord } }, models: null },
  'openai-codex': { name: 'OpenAI (ChatGPT)', routerPrefix: 'openai', kinds: { oauth: { flow: 'device-code', codec: CodexRecord } }, models: null },
  // What CLIProxyAPI v7.3.12 listed for an AI Pro account on 2026-09-22, Gemini only: Claude through
  // Antigravity has a small separate quota, and an account that lacks a model fails at call time.
  'google-ai-pro': {
    name: 'Google AI Pro',
    routerPrefix: 'google-ai-pro',
    kinds: { google_ai_pro: { flow: 'callback-paste', codec: GoogleAiProKey } },
    models: ['gemini-3.1-pro-low', 'gemini-pro-agent', 'gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-3.6-flash-high', 'gemini-3-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  },
} as const satisfies Record<ModelAccountProvider, Entry>

type Registry = typeof MODEL_PROVIDERS
type Kinds<P extends ModelAccountProvider> = Registry[P]['kinds']
type Value<E> = E extends { codec: infer C extends z.ZodType } ? z.output<C> : never
export type CredentialKind = { [P in ModelAccountProvider]: { [K in keyof Kinds<P>]: Readonly<{ provider: P; kind: K }> }[keyof Kinds<P>] }[ModelAccountProvider]
export type Credential = { [P in ModelAccountProvider]: { [K in keyof Kinds<P>]: Readonly<{ provider: P; kind: K; value: Value<Kinds<P>[K]> }> }[keyof Kinds<P>] }[ModelAccountProvider]
export type RouterPrefix = Registry[ModelAccountProvider]['routerPrefix']

const Pair = z.object({ provider: ModelAccountProvider, kind: ModelAccountKind })
export const CredentialKind = Pair.transform(function lawfulPair(pair, ctx): CredentialKind {
  if (isCredentialKind(pair)) return pair
  ctx.issues.push({ code: 'custom', message: 'Unlawful model credential pair', input: pair })
  return z.NEVER
})

function isCredentialKind(pair: z.output<typeof Pair>): pair is CredentialKind {
  return Object.hasOwn(MODEL_PROVIDERS[pair.provider].kinds, pair.kind)
}

export function isRouterPrefix(value: string): value is RouterPrefix {
  return Object.values(MODEL_PROVIDERS).some(entry => entry.routerPrefix === value)
}

export function parseModelId(value: string): ModelId | null {
  const parsed = parseModelString(value)
  return parsed.provider && isRouterPrefix(parsed.provider) && parsed.modelId.trim().length > 0 ? ModelId.parse(value) : null
}

export function parseCredential<K extends CredentialKind>(pair: K, plain: string): Extract<Credential, K>
export function parseCredential(pair: CredentialKind, plain: string): Credential {
  const lawful = CredentialKind.safeParse(pair)
  if (!lawful.success) throw new Failure('MODEL_ACCOUNT_KEY_REFUSED')
  switch (lawful.data.provider) {
    case 'anthropic': {
      if (lawful.data.kind === 'api_key') {
        const key = MODEL_PROVIDERS.anthropic.kinds.api_key.codec.safeParse(plain)
        if (!key.success) throw new Failure('MODEL_ACCOUNT_KEY_REFUSED')
        return { ...lawful.data, kind: 'api_key', value: key.data }
      }
      const tokens = MODEL_PROVIDERS.anthropic.kinds.oauth.codec.safeParse(plain)
      if (!tokens.success) throw new Failure('ANTHROPIC_STORED_RECORD_REFUSED')
      return { ...lawful.data, kind: 'oauth', value: tokens.data }
    }
    case 'openai-codex': {
      const tokens = MODEL_PROVIDERS['openai-codex'].kinds.oauth.codec.safeParse(plain)
      if (!tokens.success) throw new Failure('OPENAI_CODEX_STORED_RECORD_REFUSED')
      return { ...lawful.data, value: tokens.data }
    }
    case 'google-ai-pro': {
      const key = MODEL_PROVIDERS['google-ai-pro'].kinds.google_ai_pro.codec.safeParse(plain)
      if (!key.success) throw new Failure('GOOGLE_AI_PRO_RECORD_REFUSED')
      return { ...lawful.data, value: key.data }
    }
  }
}

export function encodeCredential(credential: Credential): string {
  switch (credential.provider) {
    case 'anthropic': return credential.kind === 'api_key' ? credential.value : z.encode(ClaudeRecord, credential.value)
    case 'openai-codex': return z.encode(CodexRecord, credential.value)
    case 'google-ai-pro': return credential.value
  }
}

export function toCodexTokens(credentials: OAuthCredentials): CodexTokens {
  const tokens = CodexTokens.safeParse({ ...credentials, email: credentials.email ?? null })
  if (!tokens.success) throw new Failure('OPENAI_CODEX_STORED_RECORD_REFUSED')
  return tokens.data
}
