import { createHash } from 'node:crypto'
import type { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'

declare const brand: unique symbol

// The person's CLIProxyAPI auth record, file name and bytes, carried as the Factory credential's
// key. The Factory row is the only durable copy; a proxy directory holds a throwaway copy of it.
export type GoogleAiProKey = string & { readonly [brand]: 'GoogleAiProKey' }
export type InstanceId = string & { readonly [brand]: 'InstanceId' }
export type AuthRecord = Readonly<{ fileName: string; bytes: Uint8Array }>

export const GOOGLE_AI_PRO_PROVIDER = 'google-ai-pro'
export const GOOGLE_AI_PRO_NAME = 'Google AI Pro'
// What CLIProxyAPI v7.3.12 listed for an AI Pro account on 2026-09-22, Gemini only: Claude through
// Antigravity has a small separate quota, and an account that lacks a model fails at call time.
export const GOOGLE_AI_PRO_MODELS: readonly string[] = Object.freeze([
  'gemini-3.1-pro-low', 'gemini-pro-agent', 'gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-3.6-flash-high',
  'gemini-3-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite',
])
// The Factory's custom-provider catalog (`/web/config/models`) now lists this provider itself, by
// its own providerId, so this is also the id a picker offers and a selection stores. A selection
// made before this fix can still carry the old Mastra Code gateway alias id
// (`mastracode/google-ai-pro/<model>`); it still resolves at call time
// (`stripMastraCodeCustomProviderPrefix` treats it and the bare id as the same provider), so it only
// shows as unselected in a picker until the person re-picks it once. This installation is a
// single-operator pilot, so that one-time re-pick costs less than a permanent id-rewrite layer.
export const GOOGLE_AI_PRO_MEMORY_MODEL = `${GOOGLE_AI_PRO_PROVIDER}/gemini-3.5-flash-lite`

// The Factory's own seed call (om-seed): it never overwrites a model the person already chose.
export const seedGoogleAiProMemory = async (memorySettings: Pick<MemorySettingsStorage, 'ensureReady' | 'patch'>, tenant: Readonly<{ orgId: string; userId: string }>): Promise<void> => {
  await memorySettings.ensureReady()
  await memorySettings.patch({
    ...tenant, patch: {},
    fillIfUnset: { observerModelId: GOOGLE_AI_PRO_MEMORY_MODEL, reflectorModelId: GOOGLE_AI_PRO_MEMORY_MODEL },
  })
}

const PREFIX = 'cxagy1.'
const FILE_NAME = /^antigravity-[\w.@+-]{1,200}\.json$/
const BASE64URL = /^[A-Za-z0-9_-]+$/
const MAX_RECORD_BYTES = 64 * 1024

export const isAuthFileName = (name: string): boolean => FILE_NAME.test(name)

export const encodeKey = ({ fileName, bytes }: AuthRecord): GoogleAiProKey => {
  if (!isAuthFileName(fileName) || bytes.byteLength === 0 || bytes.byteLength > MAX_RECORD_BYTES) throw new Error('GOOGLE_AI_PRO_RECORD_REFUSED')
  return `${PREFIX}${Buffer.from(fileName).toString('base64url')}.${Buffer.from(bytes).toString('base64url')}` as GoogleAiProKey
}

export const decodeKey = (key: GoogleAiProKey): AuthRecord => {
  const [name, body] = key.slice(PREFIX.length).split('.')
  return Object.freeze({ fileName: Buffer.from(name ?? '', 'base64url').toString(), bytes: new Uint8Array(Buffer.from(body ?? '', 'base64url')) })
}

export const parseKey = (value: string): GoogleAiProKey | null => {
  if (!value.startsWith(PREFIX)) return null
  const parts = value.slice(PREFIX.length).split('.')
  if (parts.length !== 2 || !parts.every((part) => BASE64URL.test(part))) return null
  const record = decodeKey(value as GoogleAiProKey)
  if (!isAuthFileName(record.fileName) || record.bytes.byteLength === 0 || record.bytes.byteLength > MAX_RECORD_BYTES) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(record.bytes).toString())
    if (typeof parsed !== 'object' || parsed === null || (parsed as { type?: unknown }).type !== 'antigravity') return null
  } catch {
    return null
  }
  return value as GoogleAiProKey
}

export const instanceIdOf = (key: GoogleAiProKey): InstanceId =>
  createHash('sha256').update(key).digest('hex').slice(0, 16) as InstanceId
