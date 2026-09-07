import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import { requestBoundedJson, type BoundedJsonResponse } from '../platform/bounded-json.js'
import { sankhyaSourceScopeId } from './sankhya-key-conformance-subject.js'
import type {
  RegisteredKeyConformanceDescriptor,
  RegisteredKeyConformanceObservation,
  RegisteredKeyConformanceObserver,
  RegisteredKeyConformanceSubject,
} from './key-conformance.js'

const SIGNED_BIGINT_MAX = 9_223_372_036_854_775_807n
const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_TEXT_LENGTH = 256
const QUERY_VERSION = '1'
const SERVICE_NAME = 'DbExplorerSP.executeQuery'
const TRANSACTION_ID = /^[\x21-\x7e]{32}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const GENERATION = /^(?:0|[1-9][0-9]{0,18})$/

/** The only physical mapping admitted by this bounded producer. */
export const SANKHYA_TGFCAB_KEY_MAPPING = Object.freeze({
  schemaVersion: 'conexus-sankhya-budget-header-key-mapping/v1',
  entity: 'TGFCAB',
  companyScopeColumn: 'CODEMP',
  operationTypeColumn: 'CODTIPOPER',
  operationTypeCodes: Object.freeze([14, 714]),
  keyColumn: 'NUNOTA',
})

/** Digest over the immutable physical mapping only; Brain IDs are not included. */
export const SANKHYA_TGFCAB_KEY_MAPPING_DIGEST = sha256(canonicalBytes(SANKHYA_TGFCAB_KEY_MAPPING))
export const SANKHYA_KEY_CONFORMANCE_QUERY_VERSION = QUERY_VERSION
export const SANKHYA_KEY_CONFORMANCE_SERVICE_NAME = SERVICE_NAME

/**
 * Oracle-compatible one-statement aggregate. The company literal is inserted
 * only after integer validation; there is no caller SQL/table/URL input.
 */
export const sankhyaTgfcabKeyConformanceSql = (companyCode: number): string => {
  if (!Number.isInteger(companyCode) || companyCode < 1 || companyCode > 2_147_483_647) {
    throw new Error('SANKHYA_COMPANY_CODE_REFUSED')
  }
  return `SELECT NVL(SUM(KEY_COUNT), 0) AS TOTAL_ROWS, NVL(SUM(CASE WHEN NUNOTA IS NULL THEN KEY_COUNT ELSE 0 END), 0) AS NULL_KEY_ROWS, NVL(SUM(CASE WHEN NUNOTA IS NOT NULL AND KEY_COUNT > 1 THEN 1 ELSE 0 END), 0) AS DUPLICATE_KEY_GROUPS FROM (SELECT NUNOTA, COUNT(*) AS KEY_COUNT FROM TGFCAB WHERE CODEMP = ${companyCode} AND CODTIPOPER IN (14, 714) GROUP BY NUNOTA)`
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

const hasExactKeys = (value: UnknownRecord, keys: readonly string[]): boolean => {
  const actual = Reflect.ownKeys(value)
  return actual.length === keys.length && actual.every((key) => typeof key === 'string' && keys.includes(key))
}

const boundedText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH && /\S/.test(value)

const countValue = (value: unknown): Readonly<{ integer: bigint; text: string }> | null => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null
  const integer = BigInt(value)
  return integer <= SIGNED_BIGINT_MAX ? Object.freeze({ integer, text: String(value) }) : null
}

const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

const captureObservationResponse = (
  value: unknown,
  registrationDigest: string,
  subjectDigest: string,
): RegisteredKeyConformanceObservation | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['pendingPrinting', 'responseBody', 'serviceName', 'status', 'transactionId'])) return null
  if (value.pendingPrinting !== 'false') return null
  if (value.status !== '1' || value.serviceName !== SERVICE_NAME ||
    typeof value.transactionId !== 'string' || !TRANSACTION_ID.test(value.transactionId)) return null
  if (!isRecord(value.responseBody) || !hasExactKeys(value.responseBody, [
    'burstLimit', 'fieldsMetadata', 'rows', 'timeQuery', 'timeResultSet',
  ])) return null
  if (value.responseBody.burstLimit !== false ||
    typeof value.responseBody.timeQuery !== 'string' || value.responseBody.timeQuery.length === 0 || value.responseBody.timeQuery.length > MAX_TEXT_LENGTH ||
    typeof value.responseBody.timeResultSet !== 'string' || value.responseBody.timeResultSet.length === 0 || value.responseBody.timeResultSet.length > MAX_TEXT_LENGTH) return null

  const metadata = value.responseBody.fieldsMetadata
  if (!Array.isArray(metadata) || metadata.length !== 3) return null
  const expectedNames = ['TOTAL_ROWS', 'NULL_KEY_ROWS', 'DUPLICATE_KEY_GROUPS']
  for (let index = 0; index < expectedNames.length; index += 1) {
    const entry = metadata[index]
    if (!isRecord(entry)) return null
    const precision = entry.precision
    if (!hasExactKeys(entry, ['description', 'name', 'order', 'userType', ...(Object.hasOwn(entry, 'precision') ? ['precision'] : [])]) ||
      typeof entry.description !== 'string' || entry.description.length > MAX_TEXT_LENGTH ||
      entry.name !== expectedNames[index] || !Number.isInteger(entry.order) || entry.order !== index + 1 ||
      typeof entry.userType !== 'string' || entry.userType.length > MAX_TEXT_LENGTH ||
      (Object.hasOwn(entry, 'precision') && (typeof precision !== 'number' || !Number.isInteger(precision) || precision < 0))) return null
  }

  const rows = value.responseBody.rows
  if (!Array.isArray(rows) || rows.length !== 1 || !Array.isArray(rows[0]) || rows[0].length !== 3 ||
    countValue(rows[0][0]) === null || countValue(rows[0][1]) === null || countValue(rows[0][2]) === null) return null
  const total = countValue(rows[0][0])
  const nullRows = countValue(rows[0][1])
  const duplicates = countValue(rows[0][2])
  if (total === null || nullRows === null || duplicates === null || nullRows.integer > total.integer || duplicates.integer > (total.integer - nullRows.integer) / 2n) return null

  return Object.freeze({
    registrationDigest,
    subjectDigest,
    observationId: `conexus-sankhya-key-conformance/v1:${value.transactionId}`,
    complete: true,
    coherence: 'SINGLE_STATEMENT',
    totalRows: total.text,
    nullKeyRows: nullRows.text,
    duplicateKeyGroups: duplicates.text,
  })
}

const validDescriptor = (value: unknown): value is RegisteredKeyConformanceDescriptor => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'queryId', 'queryVersion', 'workspaceId', 'projectId', 'connectionId', 'environment',
    'datasetId', 'grainId', 'mappingDigest',
  ])) return false
  return boundedText(value.queryId) && value.queryVersion === QUERY_VERSION &&
    UUID.test(value.workspaceId as string) && UUID.test(value.projectId as string) && UUID.test(value.connectionId as string) &&
    (value.environment === 'SANDBOX' || value.environment === 'PRODUCTION') && boundedText(value.datasetId) &&
    boundedText(value.grainId) && value.mappingDigest === SANKHYA_TGFCAB_KEY_MAPPING_DIGEST
}

const validSubject = (value: unknown): value is RegisteredKeyConformanceSubject => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'workspaceId', 'projectId', 'connectionId', 'connectionRevisionId', 'qualificationId',
    'credentialGeneration', 'environment', 'sourceScopeId', 'sourceRevision', 'inputDigest',
  ])) return false
  return UUID.test(value.workspaceId as string) && UUID.test(value.projectId as string) && UUID.test(value.connectionId as string) &&
    UUID.test(value.connectionRevisionId as string) && UUID.test(value.qualificationId as string) &&
    typeof value.credentialGeneration === 'string' && GENERATION.test(value.credentialGeneration) && BigInt(value.credentialGeneration) <= SIGNED_BIGINT_MAX &&
    (value.environment === 'SANDBOX' || value.environment === 'PRODUCTION') && digest(value.sourceScopeId) &&
    typeof value.sourceRevision === 'string' && SOURCE_REVISION.test(value.sourceRevision) && digest(value.inputDigest)
}

const safeDigestOf = (value: unknown): string | null => {
  try { return sha256(canonicalBytes(value)) } catch { return null }
}

const observerInputValid = (value: unknown): value is Readonly<{
  registration: RegisteredKeyConformanceDescriptor
  registrationDigest: string
  subject: RegisteredKeyConformanceSubject
  subjectDigest: string
}> => {
  if (!isRecord(value) || !hasExactKeys(value, ['registration', 'registrationDigest', 'subject', 'subjectDigest'])) return false
  return validDescriptor(value.registration) && digest(value.registrationDigest) && validSubject(value.subject) && digest(value.subjectDigest)
}

export type SankhyaKeyConformanceObserverFactory = Readonly<{
  origin: string
  environment: 'SANDBOX' | 'PRODUCTION'
  companyCode: number
  authenticate(coordinate: Readonly<{ connectionId: string; generation: string }>): Promise<Readonly<{ bearer: string }>>
  fetchImpl?: typeof fetch
}>

export const createSankhyaKeyConformanceObserver = ({
  origin,
  environment,
  companyCode,
  authenticate,
  fetchImpl = globalThis.fetch,
}: SankhyaKeyConformanceObserverFactory): RegisteredKeyConformanceObserver => {
  let parsedOrigin: URL
  try { parsedOrigin = new URL(origin) } catch { throw new Error('SANKHYA_OBSERVER_CONFIGURATION_REFUSED') }
  if ((environment !== 'SANDBOX' && environment !== 'PRODUCTION') ||
    !Number.isInteger(companyCode) || companyCode < 1 || companyCode > 2_147_483_647 ||
    parsedOrigin.protocol !== 'https:' || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash ||
    typeof authenticate !== 'function') {
    throw new Error('SANKHYA_OBSERVER_CONFIGURATION_REFUSED')
  }
  return async (input): Promise<RegisteredKeyConformanceObservation> => {
    if (!observerInputValid(input)) throw new Error('SANKHYA_OBSERVER_INPUT_REFUSED')
    const registration = input.registration
    const subject = input.subject
    if (safeDigestOf(registration) !== input.registrationDigest || safeDigestOf(subject) !== input.subjectDigest ||
      registration.workspaceId !== subject.workspaceId || registration.projectId !== subject.projectId ||
      registration.connectionId !== subject.connectionId || registration.environment !== subject.environment ||
      environment !== registration.environment ||
      subject.sourceScopeId !== sankhyaSourceScopeId({
        connectorDefinitionId: 'sankhya-om',
        connectorVersion: '1.0.0',
        connectionId: registration.connectionId,
        companyCode,
        environment,
      })) throw new Error('SANKHYA_OBSERVER_SUBJECT_REFUSED')

    let authentication: Readonly<{ bearer: string }>
    try {
      authentication = await authenticate({ connectionId: subject.connectionId, generation: subject.credentialGeneration })
    } catch {
      throw new Error('SANKHYA_OBSERVER_PROVIDER_REFUSED')
    }

    const queryUrl = `${origin}/gateway/v1/mge/service.sbr?serviceName=${SERVICE_NAME}&outputType=json`
    let result: BoundedJsonResponse
    try {
      result = await requestBoundedJson(fetchImpl, queryUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${authentication.bearer}`,
        },
        body: JSON.stringify({
          serviceName: SERVICE_NAME,
          requestBody: { sql: sankhyaTgfcabKeyConformanceSql(companyCode) },
        }),
      }, MAX_RESPONSE_BYTES)
    } catch {
      throw new Error('SANKHYA_OBSERVER_PROVIDER_REFUSED')
    }
    if (!result.response.ok) throw new Error('SANKHYA_OBSERVER_PROVIDER_REFUSED')
    const observation = captureObservationResponse(result.body, input.registrationDigest, input.subjectDigest)
    if (!observation) throw new Error('SANKHYA_OBSERVER_RESPONSE_REFUSED')
    return observation
  }
}
