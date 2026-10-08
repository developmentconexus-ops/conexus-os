import { createHash } from 'node:crypto'
import { z } from 'zod'
import { GoogleAiProKey, GOOGLE_RECORD_PREFIX } from '../model-account/providers.js'
import { Failure } from '../../platform/failure.js'

export type AuthRecord = Readonly<{ fileName: string; bytes: Uint8Array }>

export function decodeKey(key: GoogleAiProKey): AuthRecord {
  const [name, body] = key.slice(GOOGLE_RECORD_PREFIX.length).split('.')
  return Object.freeze({ fileName: Buffer.from(name ?? '', 'base64url').toString(), bytes: new Uint8Array(Buffer.from(body ?? '', 'base64url')) })
}

export const InstanceId = z.string().regex(/^[0-9a-f]{16}$/).brand<'InstanceId'>()
export type InstanceId = z.output<typeof InstanceId>

export function encodeKey({ fileName, bytes }: AuthRecord): GoogleAiProKey {
  const key = GoogleAiProKey.safeParse(`${GOOGLE_RECORD_PREFIX}${Buffer.from(fileName).toString('base64url')}.${Buffer.from(bytes).toString('base64url')}`)
  if (!key.success) throw new Failure('GOOGLE_AI_PRO_RECORD_REFUSED')
  return key.data
}

export function instanceIdOf(key: GoogleAiProKey): InstanceId {
  return InstanceId.parse(createHash('sha256').update(key).digest('hex').slice(0, 16))
}
