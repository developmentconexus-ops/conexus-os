import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Failure } from '../../platform/failure.js'

export type AuthRecord = Readonly<{ fileName: string; bytes: Uint8Array }>

const PREFIX = 'cxagy1.'
const FILE_NAME = /^antigravity-[\w.@+-]{1,200}\.json$/
const BASE64URL = /^[A-Za-z0-9_-]+$/
const MAX_RECORD_BYTES = 64 * 1024

export const isAuthFileName = (name: string): boolean => FILE_NAME.test(name)

export const decodeKey = (key: string): AuthRecord => {
  const [name, body] = key.slice(PREFIX.length).split('.')
  return Object.freeze({ fileName: Buffer.from(name ?? '', 'base64url').toString(), bytes: new Uint8Array(Buffer.from(body ?? '', 'base64url')) })
}

function isStoredRecord(value: string): boolean {
  if (!value.startsWith(PREFIX)) return false
  const parts = value.slice(PREFIX.length).split('.')
  if (parts.length !== 2 || !parts.every((part) => BASE64URL.test(part))) return false
  const record = decodeKey(value)
  if (!isAuthFileName(record.fileName) || record.bytes.byteLength === 0 || record.bytes.byteLength > MAX_RECORD_BYTES) return false
  try {
    const parsed: unknown = JSON.parse(Buffer.from(record.bytes).toString())
    return typeof parsed === 'object' && parsed !== null && 'type' in parsed && parsed.type === 'antigravity'
  } catch {
    return false
  }
}

export const GoogleAiProKey = z.string().refine(isStoredRecord).brand<'GoogleAiProKey'>()
export type GoogleAiProKey = z.output<typeof GoogleAiProKey>

export const InstanceId = z.string().regex(/^[0-9a-f]{16}$/).brand<'InstanceId'>()
export type InstanceId = z.output<typeof InstanceId>

export function encodeKey({ fileName, bytes }: AuthRecord): GoogleAiProKey {
  const key = GoogleAiProKey.safeParse(`${PREFIX}${Buffer.from(fileName).toString('base64url')}.${Buffer.from(bytes).toString('base64url')}`)
  if (!key.success) throw new Failure('GOOGLE_AI_PRO_RECORD_REFUSED')
  return key.data
}

export function parseKey(value: string): GoogleAiProKey | null {
  const key = GoogleAiProKey.safeParse(value)
  return key.success ? key.data : null
}

export function instanceIdOf(key: GoogleAiProKey): InstanceId {
  return InstanceId.parse(createHash('sha256').update(key).digest('hex').slice(0, 16))
}
