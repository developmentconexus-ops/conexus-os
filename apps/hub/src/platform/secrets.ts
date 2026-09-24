import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { createFactorySecretEncryption } from '@mastra/factory/secret-encryption'
import type { FactorySecretEncryptionKey } from '@mastra/factory/secret-encryption'

export const readSecretFile = (path: string): string => {
  const stat = statSync(path)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('SECRET_FILE_PERMISSIONS')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) throw new Error('EMPTY_SECRET_FILE')
  return value
}

/** The installation's AES-256 credential key (CONEXUS_FACTORY_SECRET_KEY_FILE), as the Factory's encryptor names it. */
export const factorySecretKey = (hexKey: string): FactorySecretEncryptionKey => {
  if (!/^[0-9a-f]{64}$/.test(hexKey)) throw new Error('FACTORY_SECRET_KEY_REFUSED')
  const key = Buffer.from(hexKey, 'hex')
  return { id: createHash('sha256').update(key).digest('hex').slice(0, 16), key }
}

const ENVELOPE_PREFIX = 'mastra:factory-secret:v1:'

export type SecretEnvelope = Readonly<{
  seal(value: string): Promise<string>
  /** Refuses anything that is not a sealed envelope under this key: a plaintext value is never read. */
  open(sealed: string): Promise<string>
}>

/** Seals a secret the Hub keeps at rest with the same key and AES-256-GCM envelope as the Factory's stored credentials. */
export const createSecretEnvelope = (hexKey: string): SecretEnvelope => {
  const encryption = createFactorySecretEncryption({ primary: factorySecretKey(hexKey) })
  return Object.freeze({
    seal: (value: string) => encryption.encrypt(value),
    open: async (sealed: string) => {
      if (!sealed.startsWith(ENVELOPE_PREFIX)) throw new Error('SECRET_NOT_SEALED')
      const { value } = await encryption.decrypt<unknown>(sealed)
      if (typeof value !== 'string') throw new Error('SECRET_NOT_SEALED')
      return value
    },
  })
}
