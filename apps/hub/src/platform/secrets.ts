import { createHash, createHmac, hkdfSync } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { createFactorySecretEncryption } from '@mastra/factory/secret-encryption'
import type { FactorySecretEncryption, FactorySecretEncryptionKey } from '@mastra/factory/secret-encryption'

export const readSecretFile = (path: string): string => {
  const stat = statSync(path)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('SECRET_FILE_PERMISSIONS')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) throw new Error('EMPTY_SECRET_FILE')
  return value
}

/** The installation's AES-256 credential key (CONEXUS_FACTORY_SECRET_KEY_FILE), as the Factory's encryptor names it. */
const factorySecretKey = (hexKey: string): FactorySecretEncryptionKey => {
  if (!/^[0-9a-f]{64}$/.test(hexKey)) throw new Error('FACTORY_SECRET_KEY_REFUSED')
  const key = Buffer.from(hexKey, 'hex')
  return { id: createHash('sha256').update(key).digest('hex').slice(0, 16), key }
}

/** Encrypts with the current key; the keys a rotation retired only decrypt. */
export const factorySecretEncryption = (hexKey: string, previousHexKeys: readonly string[]): FactorySecretEncryption =>
  createFactorySecretEncryption({ primary: factorySecretKey(hexKey), previous: previousHexKeys.map(factorySecretKey) })

const ENVELOPE_PREFIX = 'mastra:factory-secret:v1:'

export type SecretEnvelope = Readonly<{
  seal(value: string): Promise<string>
  /** Refuses anything that is not a sealed envelope under this key: a plaintext value is never read. */
  open(sealed: string): Promise<string>
  /** Keyed HMAC-SHA256s of the value, in hex, one per configured key: the current key first, then each
   * key a rotation retired. A stored secret is compared without opening it, and a digest stored before a
   * rotation still matches while its key stays configured. Useless to anyone who does not hold a key. */
  fingerprints(value: string): readonly [string, ...string[]]
}>

/** Seals a secret the Hub keeps at rest with the same key and AES-256-GCM envelope as the Factory's stored credentials. */
export const createSecretEnvelope = (hexKey: string, previousHexKeys: readonly string[] = []): SecretEnvelope => {
  const encryption = factorySecretEncryption(hexKey, previousHexKeys)
  const fingerprintKeyOf = (key: string) => Buffer.from(hkdfSync('sha256', factorySecretKey(key).key, Buffer.alloc(0), 'conexus:secret-fingerprint:v1', 32))
  const currentFingerprintKey = fingerprintKeyOf(hexKey)
  const previousFingerprintKeys = previousHexKeys.map(fingerprintKeyOf)
  const hmac = (key: Buffer, value: string) => createHmac('sha256', key).update(value).digest('hex')
  return Object.freeze({
    seal: (value: string) => encryption.encrypt(value),
    open: async (sealed: string) => {
      if (!sealed.startsWith(ENVELOPE_PREFIX)) throw new Error('SECRET_NOT_SEALED')
      const { value } = await encryption.decrypt<unknown>(sealed)
      if (typeof value !== 'string') throw new Error('SECRET_NOT_SEALED')
      return value
    },
    fingerprints: (value: string) => [hmac(currentFingerprintKey, value), ...previousFingerprintKeys.map((key) => hmac(key, value))] as const,
  })
}
