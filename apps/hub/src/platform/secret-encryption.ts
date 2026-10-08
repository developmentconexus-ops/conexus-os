// AES-256-GCM engine adapted from @mastra/factory 0.17.2, dist/secret-encryption.js.
// Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0); see its LICENSE.md.
// Conexus requires row AAD and refuses plaintext; key ids and JSON string encoding remain native.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { Failure } from './failure.js'

const SECRET_ENVELOPE_PREFIX = 'conexus:secret:v1:'
const Envelope = z.object({ keyId: z.string().min(1), iv: z.string(), ciphertext: z.string(), tag: z.string() })
export type SecretEncryptionKey = Readonly<{ id: string; key: Uint8Array }>
export type SecretEncryption = Readonly<{
  encrypt(value: string, aad: Buffer): Promise<string>
  decrypt(value: string, aad: Buffer): Promise<string>
}>

function validateKey({ id, key }: SecretEncryptionKey): Buffer {
  if (!id || key.byteLength !== 32) throw new Failure('CONFIG_INVALID', { details: { name: 'SECRET_KEY_REFUSED' } })
  return Buffer.from(key)
}

function parseEnvelope(value: string): z.output<typeof Envelope> {
  if (!value.startsWith(SECRET_ENVELOPE_PREFIX)) throw new Failure('SECRET_CUSTODY_LOST')
  let parsed: unknown
  try { parsed = JSON.parse(Buffer.from(value.slice(SECRET_ENVELOPE_PREFIX.length), 'base64url').toString('utf8')) } catch (cause) {
    throw new Failure('SECRET_CUSTODY_LOST', { cause })
  }
  const result = Envelope.safeParse(parsed)
  if (!result.success) throw new Failure('SECRET_CUSTODY_LOST')
  return result.data
}

export function createSecretEncryption(config: Readonly<{ primary: SecretEncryptionKey; previous?: readonly SecretEncryptionKey[] }>): SecretEncryption {
  const primaryKey = validateKey(config.primary)
  const keys = new Map([[config.primary.id, primaryKey]])
  for (const previous of config.previous ?? []) {
    if (keys.has(previous.id)) throw new Failure('CONFIG_INVALID', { details: { name: 'SECRET_KEY_DUPLICATE' } })
    keys.set(previous.id, validateKey(previous))
  }
  return Object.freeze({
    async encrypt(value, aad) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', primaryKey, iv)
      cipher.setAAD(aad)
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
      const envelope = { keyId: config.primary.id, iv: iv.toString('base64url'), ciphertext: ciphertext.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') }
      return `${SECRET_ENVELOPE_PREFIX}${Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url')}`
    },
    async decrypt(value, aad) {
      const envelope = parseEnvelope(value)
      const key = keys.get(envelope.keyId)
      if (!key) throw new Failure('CONFIG_INVALID', { details: { name: 'SECRET_KEY_UNKNOWN' } })
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'))
        decipher.setAAD(aad)
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
        const plaintext: unknown = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8'))
        const result = z.string().safeParse(plaintext)
        if (!result.success) throw new Failure('SECRET_CUSTODY_LOST')
        return result.data
      } catch (cause) {
        throw new Failure('SECRET_CUSTODY_LOST', { cause })
      }
    },
  })
}
