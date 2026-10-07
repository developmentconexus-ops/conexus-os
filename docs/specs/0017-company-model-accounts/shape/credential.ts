import { z } from 'zod'
import { parseModelString } from '@mastra/core/llm'
import { ModelAccountProvider, ModelAccountKind } from '@conexus/contract'

const OAuth = z.object({ access: z.string(), refresh: z.string(), expires: z.number() })
export const AnthropicKey = z.string().regex(/^sk-ant-[A-Za-z0-9_-]{20,200}$/).brand<'AnthropicKey'>()
export const ClaudeTokens = OAuth.readonly()
export const CodexTokens = OAuth.extend({ accountId: z.string(), email: z.string().nullable() }).readonly()
// The existing Google record edge moves here; no provider leaf parses JSON.
export const GoogleAiProKey = z.string().refine(function validRecord(value) {
  if (!value.startsWith('cxagy1.')) return false
  const parts = value.slice(7).split('.')
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return false
  const fileName = Buffer.from(parts[0] ?? '', 'base64url').toString()
  const bytes = Buffer.from(parts[1] ?? '', 'base64url')
  if (!/^antigravity-[\w.@+-]{1,200}\.json$/.test(fileName) || bytes.length === 0 || bytes.length > 64 * 1024) return false
  try {
    const record: unknown = JSON.parse(bytes.toString())
    return typeof record === 'object' && record !== null && 'type' in record && record.type === 'antigravity'
  } catch { return false }
}).brand<'GoogleAiProKey'>()
const Json = z.codec(z.string(), z.json(), {
  decode(text, ctx) {
    try { return z.json().parse(JSON.parse(text)) }
    catch { ctx.issues.push({ code: 'custom', message: 'Invalid JSON', input: text }); return z.NEVER }
  },
  encode(value) { return JSON.stringify(value) },
})
const StoredClaude = OAuth.extend({ type: z.literal('oauth') })
const StoredCodex = OAuth.extend({ type: z.literal('oauth'), accountId: z.string(), email: z.string().nullable() })
export const ClaudeRecord = Json.pipe(z.codec(StoredClaude, ClaudeTokens, {
  decode({ type: _type, ...value }) { return value },
  encode(value) { return { type: 'oauth' as const, ...value } },
}))
export const CodexRecord = Json.pipe(z.codec(StoredCodex, CodexTokens, {
  decode({ type: _type, ...value }) { return value },
  encode(value) { return { type: 'oauth' as const, ...value } },
}))
type Entry = Readonly<{ routerPrefix: string; kinds: Partial<Record<ModelAccountKind, Readonly<{ flow: string; codec: z.ZodType }>>> }>
export const MODEL_PROVIDERS = {
  anthropic: { routerPrefix: 'anthropic', kinds: { api_key: { flow: 'api-key', codec: AnthropicKey }, oauth: { flow: 'paste-code', codec: ClaudeRecord } } },
  'openai-codex': { routerPrefix: 'openai', kinds: { oauth: { flow: 'device-code', codec: CodexRecord } } },
  'google-ai-pro': { routerPrefix: 'google-ai-pro', kinds: { google_ai_pro: { flow: 'callback-paste', codec: GoogleAiProKey } } },
} as const satisfies Record<ModelAccountProvider, Entry>
type Registry = typeof MODEL_PROVIDERS
type Kinds<P extends ModelAccountProvider> = Registry[P]['kinds']
type Value<E> = E extends { codec: infer C extends z.ZodType } ? z.output<C> : never
export type CredentialKind = { [P in ModelAccountProvider]: { [K in keyof Kinds<P>]: Readonly<{ provider: P; kind: K }> }[keyof Kinds<P>] }[ModelAccountProvider]
export type Credential = { [P in ModelAccountProvider]: { [K in keyof Kinds<P>]: Readonly<{ provider: P; kind: K; value: Value<Kinds<P>[K]> }> }[keyof Kinds<P>] }[ModelAccountProvider]
export type RouterPrefix = Registry[ModelAccountProvider]['routerPrefix']
// ModelId is added to packages/contract/src/ids.ts. The parsed fields belong to providers.ts.
export const ModelId = z.string().refine(function validModelId(value) {
  try {
    const parsed = parseModelString(value)
    return Object.values(MODEL_PROVIDERS).some(entry => entry.routerPrefix === parsed.provider) && parsed.modelId.trim().length > 0
  } catch { return false }
}).brand<'ModelId'>()
export type ModelId = z.output<typeof ModelId>
export declare function parseModelId(value: string): ModelId | null
export declare function parseCredential<K extends CredentialKind>(pair: K, plain: string): Extract<Credential, K>
export declare function encodeCredential(credential: Credential): string

export const ModelRole = z.enum(['build', 'memory'])
export type ModelRole = z.output<typeof ModelRole>
