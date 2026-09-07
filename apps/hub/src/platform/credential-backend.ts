import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs'
import { access, link, mkdir, open, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type CredentialCoordinate = Readonly<{
  connectionId: string
  generation: string
}>

export type CredentialBackend = Readonly<{
  write(coordinate: CredentialCoordinate, plaintext: Uint8Array): Promise<void>
  publishOrMatch(coordinate: CredentialCoordinate, plaintext: Uint8Array): Promise<'PUBLISHED' | 'MATCHED_EXISTING'>
  idempotencyDigest(connectionId: string, plaintext: Uint8Array): string
  materialize(coordinate: CredentialCoordinate): Promise<Uint8Array>
}>

type CredentialEnvelope = Readonly<{
  version: 1
  algorithm: 'AES-256-GCM'
  keyGeneration: string
  nonce: string
  authenticationTag: string
  ciphertext: string
}>

const maximumPlaintextBytes = 64 * 1024
const maximumEnvelopeBytes = 128 * 1024
const coordinatePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const fail = (code: string): never => { throw new Error(code) }
const assertConnectionId = (connectionId: string): void => {
  if (!coordinatePattern.test(connectionId)) fail('CREDENTIAL_COORDINATE_REFUSED')
}
const assertCoordinate = ({ connectionId, generation }: CredentialCoordinate): void => {
  assertConnectionId(connectionId)
  if (!coordinatePattern.test(generation)) fail('CREDENTIAL_COORDINATE_REFUSED')
}
const assertRestrictedDirectory = (path: string): void => {
  const metadata = lstatSync(path)
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || (metadata.mode & 0o077) !== 0) {
    fail('CREDENTIAL_ROOT_REFUSED')
  }
}
const keyFromFile = (keyFile: string): Buffer => {
  const descriptor = openSync(keyFile, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = fstatSync(descriptor)
    const permissions = metadata.mode & 0o777
    if (!metadata.isFile() || (permissions !== 0o400 && permissions !== 0o600)) {
      fail('CREDENTIAL_KEY_FILE_REFUSED')
    }
    const encoded = readFileSync(descriptor, 'utf8').trim()
    const key = Buffer.from(encoded, 'base64')
    if (key.length !== 32 || key.toString('base64') !== encoded) fail('CREDENTIAL_KEY_MATERIAL_REFUSED')
    return key
  } finally {
    closeSync(descriptor)
  }
}

const coordinateDigest = (value: string): string => createHash('sha256').update(value).digest('hex')
const aadFor = (keyGeneration: string, coordinate: CredentialCoordinate): Buffer => Buffer.from(JSON.stringify([
  'conexus.credential-envelope/v1', keyGeneration, coordinate.connectionId, coordinate.generation,
]))

const parseEnvelope = (bytes: Buffer): CredentialEnvelope => {
  if (bytes.length > maximumEnvelopeBytes) fail('CREDENTIAL_ENVELOPE_REFUSED')
  let value: unknown
  try { value = JSON.parse(bytes.toString('utf8')) } catch { fail('CREDENTIAL_ENVELOPE_REFUSED') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CREDENTIAL_ENVELOPE_REFUSED')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (JSON.stringify(keys) !== JSON.stringify([
    'algorithm', 'authenticationTag', 'ciphertext', 'keyGeneration', 'nonce', 'version',
  ])) fail('CREDENTIAL_ENVELOPE_REFUSED')
  if (record.version !== 1 || record.algorithm !== 'AES-256-GCM'
    || typeof record.keyGeneration !== 'string' || !coordinatePattern.test(record.keyGeneration)
    || typeof record.nonce !== 'string' || typeof record.authenticationTag !== 'string'
    || typeof record.ciphertext !== 'string') fail('CREDENTIAL_ENVELOPE_REFUSED')
  const nonceText = record.nonce as string
  const tagText = record.authenticationTag as string
  const ciphertextText = record.ciphertext as string
  const nonce = Buffer.from(nonceText, 'base64')
  const tag = Buffer.from(tagText, 'base64')
  const ciphertext = Buffer.from(ciphertextText, 'base64')
  if (nonce.length !== 12 || tag.length !== 16
    || nonce.toString('base64') !== nonceText
    || tag.toString('base64') !== tagText
    || ciphertext.toString('base64') !== ciphertextText) fail('CREDENTIAL_ENVELOPE_REFUSED')
  return record as CredentialEnvelope
}

export const createEncryptedFileCredentialBackend = ({
  root,
  keyFile,
  keyGeneration,
}: Readonly<{ root: string; keyFile: string; keyGeneration: string }>): CredentialBackend => {
  if (!coordinatePattern.test(keyGeneration)) fail('CREDENTIAL_KEY_GENERATION_REFUSED')
  const requestedRoot = resolve(root)
  const requestedKeyFile = resolve(keyFile)
  assertRestrictedDirectory(requestedRoot)
  const keyMetadata = lstatSync(requestedKeyFile)
  if (keyMetadata.isSymbolicLink() || !keyMetadata.isFile()) fail('CREDENTIAL_KEY_FILE_REFUSED')
  const resolvedRoot = realpathSync(requestedRoot)
  const resolvedKeyFile = realpathSync(requestedKeyFile)
  if (resolvedKeyFile === resolvedRoot || resolvedKeyFile.startsWith(`${resolvedRoot}/`)) {
    fail('CREDENTIAL_KEY_CUSTODY_REFUSED')
  }
  const key = keyFromFile(resolvedKeyFile)

  const location = (coordinate: CredentialCoordinate) => {
    assertCoordinate(coordinate)
    const connectionRoot = resolve(resolvedRoot, coordinateDigest(coordinate.connectionId))
    const path = resolve(connectionRoot, `${coordinateDigest(coordinate.generation)}.json`)
    if (dirname(path) !== connectionRoot || dirname(connectionRoot) !== resolvedRoot) fail('CREDENTIAL_PATH_REFUSED')
    return { connectionRoot, path }
  }

  const recheckRoots = (connectionRoot?: string): void => {
    assertRestrictedDirectory(resolvedRoot)
    if (connectionRoot) assertRestrictedDirectory(connectionRoot)
  }

  const backend: CredentialBackend = {
    async write(coordinate, plaintext) {
      if (plaintext.byteLength === 0 || plaintext.byteLength > maximumPlaintextBytes) fail('CREDENTIAL_PLAINTEXT_REFUSED')
      const { connectionRoot, path } = location(coordinate)
      recheckRoots()
      await mkdir(connectionRoot, { mode: 0o700, recursive: true })
      await access(connectionRoot, constants.R_OK | constants.W_OK | constants.X_OK)
      recheckRoots(connectionRoot)
      const nonce = randomBytes(12)
      const copy = Buffer.from(plaintext)
      let temporaryPath: string | undefined
      try {
        const cipher = createCipheriv('aes-256-gcm', key, nonce)
        cipher.setAAD(aadFor(keyGeneration, coordinate))
        const ciphertext = Buffer.concat([cipher.update(copy), cipher.final()])
        const envelope: CredentialEnvelope = {
          version: 1,
          algorithm: 'AES-256-GCM',
          keyGeneration,
          nonce: nonce.toString('base64'),
          authenticationTag: cipher.getAuthTag().toString('base64'),
          ciphertext: ciphertext.toString('base64'),
        }
        const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`)
        temporaryPath = resolve(connectionRoot, `.${coordinateDigest(randomBytes(32).toString('hex'))}.tmp`)
        const handle = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
        try {
          await handle.chmod(0o600)
          await handle.writeFile(bytes)
          await handle.sync()
        } finally {
          await handle.close()
        }
        await link(temporaryPath, path)
        await rm(temporaryPath)
        temporaryPath = undefined
        const directory = await open(connectionRoot, constants.O_RDONLY)
        try { await directory.sync() } finally { await directory.close() }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('CREDENTIAL_GENERATION_EXISTS')
        throw error
      } finally {
        copy.fill(0)
        if (temporaryPath) await rm(temporaryPath, { force: true })
      }
    },

    async materialize(coordinate) {
      const { connectionRoot, path } = location(coordinate)
      recheckRoots(connectionRoot)
      const linkMetadata = lstatSync(path)
      if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile() || (linkMetadata.mode & 0o777) !== 0o600) {
        fail('CREDENTIAL_FILE_REFUSED')
      }
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      let bytes: Buffer
      try {
        const opened = await handle.stat()
        if (!opened.isFile() || (opened.mode & 0o777) !== 0o600 || opened.size > maximumEnvelopeBytes) {
          fail('CREDENTIAL_FILE_REFUSED')
        }
        bytes = await readFile(handle)
      } finally {
        await handle.close()
      }
      const envelope = parseEnvelope(bytes)
      if (envelope.keyGeneration !== keyGeneration) fail('CREDENTIAL_KEY_GENERATION_MISMATCH')
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64'))
        decipher.setAAD(aadFor(keyGeneration, coordinate))
        decipher.setAuthTag(Buffer.from(envelope.authenticationTag, 'base64'))
        return Buffer.concat([
          decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
          decipher.final(),
        ])
      } catch {
        return fail('CREDENTIAL_AUTHENTICATION_FAILED')
      }
    },

    async publishOrMatch(coordinate, plaintext) {
      try {
        await backend.write(coordinate, plaintext)
        return 'PUBLISHED'
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'CREDENTIAL_GENERATION_EXISTS') throw error
      }

      const expected = Buffer.from(plaintext)
      let existing: Buffer | undefined
      try {
        const materialized = await backend.materialize(coordinate)
        existing = Buffer.isBuffer(materialized)
          ? materialized
          : Buffer.from(materialized.buffer, materialized.byteOffset, materialized.byteLength)
        if (existing.length !== expected.length || !timingSafeEqual(existing, expected)) {
          fail('CREDENTIAL_GENERATION_CONFLICT')
        }
        return 'MATCHED_EXISTING'
      } finally {
        expected.fill(0)
        existing?.fill(0)
      }
    },

    idempotencyDigest(connectionId, plaintext) {
      assertConnectionId(connectionId)
      if (plaintext.byteLength === 0 || plaintext.byteLength > maximumPlaintextBytes) fail('CREDENTIAL_PLAINTEXT_REFUSED')
      const copy = Buffer.from(plaintext)
      try {
        return createHmac('sha256', key)
          .update('conexus.credential-idempotency/v1\0')
          .update(keyGeneration)
          .update('\0')
          .update(connectionId)
          .update('\0')
          .update(copy)
          .digest('hex')
      } finally {
        copy.fill(0)
      }
    },
  }
  return Object.freeze(backend)
}
