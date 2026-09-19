const MAX_BYTES = 16 * 1024

// accountId is the provider's own routing identity for the signed-in account. Anthropic's flow
// has no such value and leaves it unset; OpenAI Codex refuses a connection without one.
export type OAuthTokenSet = Readonly<{ access: string; refresh: string; expiresAt: number; accountId?: string }>

// The hardened token request, shared by every OAuth provider. A redirect is refused rather than
// followed, a response that arrived from another origin is refused, and the body is capped twice:
// once on the declared length and again through a byte counter, so a provider cannot stream an
// unbounded body into the Hub. Only the code prefix differs per provider, so a caller reading a
// refusal still learns which provider refused.
export const requestTokenPayload = async ({
  url,
  headers,
  body,
  fetchImpl = globalThis.fetch,
  codePrefix,
}: Readonly<{
  url: string
  headers: Readonly<Record<string, string>>
  body: string
  fetchImpl?: typeof globalThis.fetch
  codePrefix: string
}>): Promise<Readonly<Record<string, unknown>>> => {
  const target = new URL(url)
  const response = await fetchImpl(target, { method: 'POST', redirect: 'manual', headers: { ...headers }, body })
  if (response.status >= 300 && response.status < 400) throw new Error(`${codePrefix}_REDIRECT_DENIED`)
  if (response.url && new URL(response.url).origin !== target.origin) throw new Error(`${codePrefix}_EGRESS_DENIED`)
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw new Error(`${codePrefix}_RESPONSE_LIMIT_EXCEEDED`)
  if (!response.body) throw new Error(`${codePrefix}_RESPONSE_INVALID`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const item = await reader.read()
    if (item.done) break
    size += item.value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new Error(`${codePrefix}_RESPONSE_LIMIT_EXCEEDED`)
    }
    chunks.push(item.value)
  }
  if (!response.ok) throw new Error(`${codePrefix}_PROVIDER_REFUSED`)
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error(`${codePrefix}_RESPONSE_INVALID`) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${codePrefix}_TOKEN_INVALID`)
  return value as Record<string, unknown>
}
