import { createHash, createHmac, hkdfSync } from 'node:crypto'
import { z } from 'zod'
import type { ModelAccountId, ConnectionId } from '@conexus/contract'
import type { Digest } from './db.js'
import { createSecretEncryption } from './secret-encryption.js'
import type { SecretEncryptionKey } from './secret-encryption.js'
import { Failure } from './failure.js'

function secretKey(hexKey: string): SecretEncryptionKey {
  if (!/^[0-9a-f]{64}$/.test(hexKey)) throw new Failure('CONFIG_INVALID', { details: { name: 'SECRET_KEY_REFUSED' } })
  const key = Buffer.from(hexKey, 'hex')
  return { id: createHash('sha256').update(key).digest('hex').slice(0, 16), key }
}

export type SealOwner = 'model-account' | 'connection' | 'hub-session' | 'handoff'
class RowContext<O extends SealOwner> {
  private readonly rowContext: string
  constructor(readonly owner: O, readonly binding: string) {
    this.rowContext = JSON.stringify(['conexus-aad-v1', owner, binding])
    Object.freeze(this)
  }
  aad(): Buffer { return Buffer.from(this.rowContext, 'utf8') }
}
export type SealContext<O extends SealOwner> = RowContext<O>
const SEALED_COLUMNS = {
  'model-account': z.string().brand<'sealed:model-account'>(),
  connection: z.string().brand<'sealed:connection'>(),
  'hub-session': z.string().brand<'sealed:hub-session'>(),
  handoff: z.string().brand<'sealed:handoff'>(),
} as const
type SealedValues = { readonly [O in SealOwner]: z.output<(typeof SEALED_COLUMNS)[O]> }
export type Sealed<O extends SealOwner> = SealedValues[O]
export function SealedColumn<O extends SealOwner>(owner: O): (typeof SEALED_COLUMNS)[O] { return SEALED_COLUMNS[owner] }
export function modelAccountContext(id: ModelAccountId): SealContext<'model-account'> { return new RowContext('model-account', id) }
export function connectionContext(id: ConnectionId): SealContext<'connection'> { return new RowContext('connection', id) }
export function sessionContext(digest: Digest): SealContext<'hub-session'> { return new RowContext('hub-session', digest.toString('hex')) }
export function handoffContext(digest: Digest): SealContext<'handoff'> { return new RowContext('handoff', digest.toString('hex')) }


export function createSecretEnvelope(hexKey: string, previousHexKeys: readonly string[] = []) {
  const encryption = createSecretEncryption({ primary: secretKey(hexKey), previous: previousHexKeys.map(secretKey) })
  const fingerprintKeyOf = (key: string) => Buffer.from(hkdfSync('sha256', secretKey(key).key, Buffer.alloc(0), 'conexus:secret-fingerprint:v1', 32))
  const currentFingerprintKey = fingerprintKeyOf(hexKey)
  const previousFingerprintKeys = previousHexKeys.map(fingerprintKeyOf)
  const hmac = (key: Buffer, value: string) => createHmac('sha256', key).update(value).digest('hex')
  const encrypt = async (value: string, context: SealContext<SealOwner>): Promise<Sealed<SealOwner>> =>
    SealedColumn(context.owner).parse(await encryption.encrypt(value, context.aad()))
  const decrypt = (sealed: Sealed<SealOwner>, context: SealContext<SealOwner>): Promise<string> => encryption.decrypt(sealed, context.aad())
  function seal(value: string, context: SealContext<'model-account'>): Promise<Sealed<'model-account'>>
  function seal(value: string, context: SealContext<'connection'>): Promise<Sealed<'connection'>>
  function seal(value: string, context: SealContext<'hub-session'>): Promise<Sealed<'hub-session'>>
  function seal(value: string, context: SealContext<'handoff'>): Promise<Sealed<'handoff'>>
  function seal(value: string, context: SealContext<SealOwner>): Promise<Sealed<SealOwner>> { return encrypt(value, context) }
  function open(sealed: Sealed<'model-account'>, context: SealContext<'model-account'>): Promise<string>
  function open(sealed: Sealed<'connection'>, context: SealContext<'connection'>): Promise<string>
  function open(sealed: Sealed<'hub-session'>, context: SealContext<'hub-session'>): Promise<string>
  function open(sealed: Sealed<'handoff'>, context: SealContext<'handoff'>): Promise<string>
  function open(sealed: Sealed<SealOwner>, context: SealContext<SealOwner>): Promise<string> { return decrypt(sealed, context) }
  function reseal(sealed: Sealed<'model-account'>, from: SealContext<'model-account'>, to: SealContext<'model-account'>): Promise<Sealed<'model-account'>>
  function reseal(sealed: Sealed<'model-account'>, from: SealContext<'model-account'>, to: SealContext<'connection'>): Promise<Sealed<'connection'>>
  function reseal(sealed: Sealed<'model-account'>, from: SealContext<'model-account'>, to: SealContext<'hub-session'>): Promise<Sealed<'hub-session'>>
  function reseal(sealed: Sealed<'model-account'>, from: SealContext<'model-account'>, to: SealContext<'handoff'>): Promise<Sealed<'handoff'>>
  function reseal(sealed: Sealed<'connection'>, from: SealContext<'connection'>, to: SealContext<'model-account'>): Promise<Sealed<'model-account'>>
  function reseal(sealed: Sealed<'connection'>, from: SealContext<'connection'>, to: SealContext<'connection'>): Promise<Sealed<'connection'>>
  function reseal(sealed: Sealed<'connection'>, from: SealContext<'connection'>, to: SealContext<'hub-session'>): Promise<Sealed<'hub-session'>>
  function reseal(sealed: Sealed<'connection'>, from: SealContext<'connection'>, to: SealContext<'handoff'>): Promise<Sealed<'handoff'>>
  function reseal(sealed: Sealed<'hub-session'>, from: SealContext<'hub-session'>, to: SealContext<'model-account'>): Promise<Sealed<'model-account'>>
  function reseal(sealed: Sealed<'hub-session'>, from: SealContext<'hub-session'>, to: SealContext<'connection'>): Promise<Sealed<'connection'>>
  function reseal(sealed: Sealed<'hub-session'>, from: SealContext<'hub-session'>, to: SealContext<'hub-session'>): Promise<Sealed<'hub-session'>>
  function reseal(sealed: Sealed<'hub-session'>, from: SealContext<'hub-session'>, to: SealContext<'handoff'>): Promise<Sealed<'handoff'>>
  function reseal(sealed: Sealed<'handoff'>, from: SealContext<'handoff'>, to: SealContext<'model-account'>): Promise<Sealed<'model-account'>>
  function reseal(sealed: Sealed<'handoff'>, from: SealContext<'handoff'>, to: SealContext<'connection'>): Promise<Sealed<'connection'>>
  function reseal(sealed: Sealed<'handoff'>, from: SealContext<'handoff'>, to: SealContext<'hub-session'>): Promise<Sealed<'hub-session'>>
  function reseal(sealed: Sealed<'handoff'>, from: SealContext<'handoff'>, to: SealContext<'handoff'>): Promise<Sealed<'handoff'>>
  async function reseal(sealed: Sealed<SealOwner>, from: SealContext<SealOwner>, to: SealContext<SealOwner>): Promise<Sealed<SealOwner>> { return encrypt(await decrypt(sealed, from), to) }
  return Object.freeze({ seal, open, reseal,
    fingerprints: (value: string) => [hmac(currentFingerprintKey, value), ...previousFingerprintKeys.map((key) => hmac(key, value))] as const,
  })
}

export type SecretEnvelope = ReturnType<typeof createSecretEnvelope>
