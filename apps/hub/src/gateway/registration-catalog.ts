import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs'
import type { RegisteredKeyConformanceDescriptor } from './key-conformance.js'
import {
  SANKHYA_KEY_CONFORMANCE_QUERY_VERSION,
  SANKHYA_TGFCAB_KEY_MAPPING_DIGEST,
} from './sankhya-key-conformance-observer.js'

const SCHEMA_VERSION = 'conexus-key-conformance-registration-catalog/v1'
const PRODUCER_ID = 'sankhya-budget-header-key-conformance/v1'
const MAX_FILE_BYTES = 256 * 1024
const MAX_ENTRIES = 128
const MAX_TEXT_LENGTH = 256
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type SankhyaKeyConformanceRegistrationCatalogEntry = Readonly<{
  descriptor: RegisteredKeyConformanceDescriptor
  producer: Readonly<{ producerId: typeof PRODUCER_ID; companyCode: number }>
}>

export type SankhyaKeyConformanceRegistrationCatalog = readonly SankhyaKeyConformanceRegistrationCatalogEntry[]

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Reflect.ownKeys(value)
  return actual.length === keys.length && actual.every((key) => typeof key === 'string' && keys.includes(key))
}

const boundedTree = (value: unknown, depth = 0, state = { nodes: 0 }): boolean => {
  if (++state.nodes > 4096 || depth > 16) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return true
  if (Array.isArray(value)) return value.length <= MAX_ENTRIES && value.every((item) => boundedTree(item, depth + 1, state))
  return isRecord(value) && Object.entries(value).every(([key, item]) => key.length <= MAX_TEXT_LENGTH && boundedTree(item, depth + 1, state))
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH && /\S/.test(value)
const companyCode = (value: unknown): value is number => Number.isSafeInteger(value) && (value === 1 || value === 2)

const parseEntry = (value: unknown): SankhyaKeyConformanceRegistrationCatalogEntry => {
  if (!isRecord(value) || !exact(value, ['descriptor', 'producer']) || !isRecord(value.descriptor) || !isRecord(value.producer) ||
    !exact(value.descriptor, ['queryId', 'queryVersion', 'workspaceId', 'projectId', 'connectionId', 'environment', 'datasetId', 'grainId', 'mappingDigest']) ||
    !exact(value.producer, ['producerId', 'companyCode'])) throw new Error('KEY_CONFORMANCE_CATALOG_REFUSED')
  const descriptor = value.descriptor
  if (!text(descriptor.queryId) || descriptor.queryVersion !== SANKHYA_KEY_CONFORMANCE_QUERY_VERSION ||
    !UUID.test(String(descriptor.workspaceId)) || !UUID.test(String(descriptor.projectId)) || !UUID.test(String(descriptor.connectionId)) ||
    (descriptor.environment !== 'SANDBOX' && descriptor.environment !== 'PRODUCTION') || !text(descriptor.datasetId) ||
    !text(descriptor.grainId) || descriptor.mappingDigest !== SANKHYA_TGFCAB_KEY_MAPPING_DIGEST ||
    value.producer.producerId !== PRODUCER_ID || !companyCode(value.producer.companyCode)) {
    throw new Error('KEY_CONFORMANCE_CATALOG_REFUSED')
  }
  return Object.freeze({
    descriptor: Object.freeze({
      queryId: descriptor.queryId,
      queryVersion: descriptor.queryVersion,
      workspaceId: descriptor.workspaceId,
      projectId: descriptor.projectId,
      connectionId: descriptor.connectionId,
      environment: descriptor.environment,
      datasetId: descriptor.datasetId,
      grainId: descriptor.grainId,
      mappingDigest: descriptor.mappingDigest,
    }) as RegisteredKeyConformanceDescriptor,
    producer: Object.freeze({ producerId: PRODUCER_ID, companyCode: value.producer.companyCode }),
  })
}

/** Reads only a closed, bounded, non-symlink catalog; no provider-controlled fields are admitted. */
export const readSankhyaKeyConformanceRegistrationCatalog = (
  path: string,
): SankhyaKeyConformanceRegistrationCatalog => {
  let bytes: Buffer
  let descriptor = -1
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const metadata = fstatSync(descriptor)
    if (!metadata.isFile() || (metadata.mode & 0o022) !== 0 || metadata.size > MAX_FILE_BYTES) {
      throw new Error('KEY_CONFORMANCE_CATALOG_REFUSED')
    }
    bytes = readFileSync(descriptor)
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('KEY_CONFORMANCE_CATALOG_REFUSED')
  } catch {
    throw new Error('KEY_CONFORMANCE_CATALOG_REFUSED')
  } finally {
    if (descriptor !== -1) closeSync(descriptor)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error('KEY_CONFORMANCE_CATALOG_REFUSED')
  }
  if (!boundedTree(parsed) || !isRecord(parsed) || !exact(parsed, ['schemaVersion', 'entries']) ||
    parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.entries) || parsed.entries.length === 0 || parsed.entries.length > MAX_ENTRIES) {
    throw new Error('KEY_CONFORMANCE_CATALOG_REFUSED')
  }
  const seen = new Set<string>()
  const result = parsed.entries.map((entry) => {
    const captured = parseEntry(entry)
    if (seen.has(captured.descriptor.queryId)) throw new Error('KEY_CONFORMANCE_CATALOG_REFUSED')
    seen.add(captured.descriptor.queryId)
    return captured
  })
  return Object.freeze(result)
}

export { PRODUCER_ID as SANKHYA_KEY_CONFORMANCE_PRODUCER_ID, SCHEMA_VERSION as SANKHYA_KEY_CONFORMANCE_CATALOG_SCHEMA }
