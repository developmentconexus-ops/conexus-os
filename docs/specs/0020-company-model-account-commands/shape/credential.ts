import { z } from 'zod'
import { ModelAccountProvider, ModelAccountKind } from '@conexus/contract'

const OAuth = z.object({ access: z.string(), refresh: z.string(), expires: z.number() })
export const AnthropicKey = z.string().regex(/^sk-ant-[A-Za-z0-9_-]{20,200}$/).brand<'AnthropicKey'>()
export const ClaudeTokens = OAuth.readonly()
export const CodexTokens = OAuth.extend({ accountId: z.string(), email: z.string().nullable() }).readonly()
// The existing record codec is preserved, moved to this credential owner in U2/U4.
// It checks the encoded filename, byte bound, JSON and Antigravity discriminator.
export { GoogleAiProKey } from '../../../../apps/hub/src/builder/google-ai-pro/credential.js'
import { GoogleAiProKey } from '../../../../apps/hub/src/builder/google-ai-pro/credential.js'
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
export const ModelId = z.string().min(1).brand<'ModelId'>()
export type ParsedModelId = Readonly<{ routerId: z.output<typeof ModelId>; prefix: RouterPrefix; name: string }>
export declare function parseModelId(value: string): ParsedModelId | null
export declare function parseCredential<K extends CredentialKind>(pair: K, plain: string): Extract<Credential, K>
export declare function encodeCredential(credential: Credential): string

export const ModelRole = z.enum(['build', 'memory'])
export type ModelRole = z.output<typeof ModelRole>
