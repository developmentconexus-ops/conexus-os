// Copied from @mastra/factory 0.17.2, dist/secret-encryption.js (createFactorySecretEncryption
// only; createPlaintextFactorySecretEncryption is not ported because nothing in the Hub calls
// it). Licensed under the Apache License, Version 2.0
// (http://www.apache.org/licenses/LICENSE-2.0); see @mastra/factory's LICENSE.md. Logic and the
// envelope prefix are unchanged byte for byte (spec 0002, Security model): every stored secret
// carries `mastra:factory-secret:v1:`, five database CHECK constraints require it, and this
// module's `parseEnvelope` still slices exactly that prefix's length. Only the file's home becomes
// Conexus's. `platform/secrets.ts` is the only caller. The package itself is no longer installed.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ENVELOPE_PREFIX = 'mastra:factory-secret:v1:'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

type DecryptedFactorySecret<T> = Readonly<{ value: T; needsReencryption: boolean }>

export type FactorySecretEncryption = Readonly<{
  encrypt<T>(value: T): Promise<string>
  decrypt<T>(value: unknown): Promise<DecryptedFactorySecret<T>>
}>

export type FactorySecretEncryptionKey = Readonly<{ id: string; key: Uint8Array }>

export type FactorySecretEncryptionConfig = Readonly<{
  primary: FactorySecretEncryptionKey
  previous?: readonly FactorySecretEncryptionKey[]
}>

type Envelope = Readonly<{ keyId: string; iv: string; ciphertext: string; tag: string }>

const validateKey = ({ id, key }: FactorySecretEncryptionKey): Buffer => {
  if (!id) throw new Error('[FactorySecretEncryption] Key id is required.')
  const buffer = Buffer.from(key)
  if (buffer.byteLength !== 32) throw new Error(`[FactorySecretEncryption] Key "${id}" must be exactly 32 bytes.`)
  return buffer
}

const isEnvelopeShaped = (value: unknown): value is Envelope =>
  typeof value === 'object' && value !== null &&
  typeof (value as Envelope).keyId === 'string' && typeof (value as Envelope).iv === 'string' &&
  typeof (value as Envelope).ciphertext === 'string' && typeof (value as Envelope).tag === 'string'

const parseEnvelope = (value: string): Envelope => {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(value.slice(ENVELOPE_PREFIX.length), 'base64url').toString('utf8'))
  } catch {
    throw new Error('[FactorySecretEncryption] Invalid encrypted value.')
  }
  if (!isEnvelopeShaped(parsed)) throw new Error('[FactorySecretEncryption] Invalid encrypted value.')
  return parsed
}

/**
 * Creates a versioned AES-256-GCM encryptor. The primary key is used for new
 * writes; previous keys remain decrypt-only until stored values are rotated.
 */
export const createFactorySecretEncryption = (config: FactorySecretEncryptionConfig): FactorySecretEncryption => {
  const primaryKey = validateKey(config.primary)
  const keys = new Map<string, Buffer>([[config.primary.id, primaryKey]])
  for (const previous of config.previous ?? []) {
    if (keys.has(previous.id)) throw new Error(`[FactorySecretEncryption] Duplicate key id "${previous.id}".`)
    keys.set(previous.id, validateKey(previous))
  }
  return {
    async encrypt<T>(value: T): Promise<string> {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, primaryKey, iv)
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
      const envelope: Envelope = {
        keyId: config.primary.id,
        iv: iv.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'),
      }
      return `${ENVELOPE_PREFIX}${Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url')}`
    },
    async decrypt<T>(value: unknown): Promise<DecryptedFactorySecret<T>> {
      if (typeof value !== 'string' || !value.startsWith(ENVELOPE_PREFIX)) {
        return { value: structuredClone(value) as T, needsReencryption: true }
      }
      const envelope = parseEnvelope(value)
      const key = keys.get(envelope.keyId)
      if (!key) throw new Error(`[FactorySecretEncryption] Unknown key id "${envelope.keyId}".`)
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, 'base64url'))
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
        const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
        return { value: JSON.parse(plaintext) as T, needsReencryption: envelope.keyId !== config.primary.id }
      } catch {
        throw new Error('[FactorySecretEncryption] Unable to decrypt encrypted value.')
      }
    },
  }
}
