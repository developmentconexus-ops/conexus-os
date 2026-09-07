import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'

const MAX_TEXT_LENGTH = 256
const SIGNED_BIGINT_MAX = 9_223_372_036_854_775_807n
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const DIGEST = /^[0-9a-f]{64}$/
const SOURCE_REVISION = /^[0-9a-f]{40}$/
const DECIMAL = /^(?:0|[1-9][0-9]*)$/
const ENVIRONMENTS = new Set(['SANDBOX', 'PRODUCTION'])
const COHERENCES = new Set(['SINGLE_STATEMENT', 'IMMUTABLE_SNAPSHOT'])

type MaybePromise<T> = T | PromiseLike<T>
type UnknownRecord = Record<string, unknown>

export type RegisteredKeyConformanceEnvironment = 'SANDBOX' | 'PRODUCTION'

export type RegisteredKeyConformanceDescriptor = Readonly<{
  queryId: string
  queryVersion: string
  workspaceId: string
  projectId: string
  connectionId: string
  environment: RegisteredKeyConformanceEnvironment
  datasetId: string
  grainId: string
  mappingDigest: string
}>

export type RegisteredKeyConformanceExpectedMapping = Readonly<{
  datasetId: string
  grainId: string
  mappingDigest: string
}>

export type RegisteredKeyConformanceSubject = Readonly<{
  workspaceId: string
  projectId: string
  connectionId: string
  connectionRevisionId: string
  qualificationId: string
  credentialGeneration: string
  environment: RegisteredKeyConformanceEnvironment
  sourceScopeId: string
  sourceRevision: string
  inputDigest: string
}>

export type RegisteredKeyConformanceRequest = Readonly<{
  accountId: string
  projectId: string
  queryId: string
  expectedSourceRevision: string
  expectedInputDigest: string
}>

export type RegisteredKeyConformanceObservation = Readonly<{
  registrationDigest: string
  subjectDigest: string
  observationId: string
  complete: true
  coherence: 'SINGLE_STATEMENT' | 'IMMUTABLE_SNAPSHOT'
  totalRows: string
  nullKeyRows: string
  duplicateKeyGroups: string
}>

export type RegisteredKeyConformanceObserver = (
  input: Readonly<{
    registration: RegisteredKeyConformanceDescriptor
    registrationDigest: string
    subject: RegisteredKeyConformanceSubject
    subjectDigest: string
  }>,
) => MaybePromise<RegisteredKeyConformanceObservation>

export type RegisteredKeyConformanceRegistration = Readonly<RegisteredKeyConformanceDescriptor & {
  observe: RegisteredKeyConformanceObserver
}>

export type RegisteredKeyConformanceResolutionRequest = Readonly<{
  accountId: string
  registration: RegisteredKeyConformanceDescriptor
}>

export type RegisteredKeyConformanceResolver = (
  request: RegisteredKeyConformanceResolutionRequest,
) => MaybePromise<RegisteredKeyConformanceSubject | null>

export type RegisteredKeyConformanceResult = Readonly<
  | { status: 'REFUSED' }
  | { status: 'INDETERMINATE' }
  | {
    status: 'PROVEN'
    outcome: 'PASS' | 'ASSERTION_FAILED'
    registrationDigest: string
    subjectDigest: string
    observationId: string
    empty: boolean
    registration: RegisteredKeyConformanceDescriptor
    subject: RegisteredKeyConformanceSubject
    coherence: 'SINGLE_STATEMENT' | 'IMMUTABLE_SNAPSHOT'
    counts: Readonly<{
      totalRows: string
      nullKeyRows: string
      duplicateKeyGroups: string
    }>
    proofDigest: string
  }
>

export type RegisteredKeyConformanceModule = Readonly<{
  execute(
    request: RegisteredKeyConformanceRequest,
    expectedMapping: RegisteredKeyConformanceExpectedMapping,
  ): Promise<RegisteredKeyConformanceResult>
}>

const isRecord = (value: unknown): value is UnknownRecord => {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

const hasOnlyKeys = (value: UnknownRecord, keys: readonly string[]): boolean => {
  const ownKeys = Reflect.ownKeys(value)
  return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === 'string' && keys.includes(key))
}

const copyClosed = (value: unknown, keys: readonly string[]): UnknownRecord | null => {
  try {
    if (!isRecord(value) || !hasOnlyKeys(value, keys)) return null
    const copy: UnknownRecord = {}
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor)) return null
      copy[key] = descriptor.value
    }
    return copy
  } catch {
    return null
  }
}

const freeze = <T>(value: T): T => Object.freeze(value)

const boundedText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH && /\S/.test(value)

const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const digest = (value: unknown): value is string => typeof value === 'string' && DIGEST.test(value)
const sourceRevision = (value: unknown): value is string => typeof value === 'string' && SOURCE_REVISION.test(value)
const environment = (value: unknown): value is RegisteredKeyConformanceEnvironment =>
  typeof value === 'string' && ENVIRONMENTS.has(value)

const decimal = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 19 || !DECIMAL.test(value)) return false
  try {
    return BigInt(value) <= SIGNED_BIGINT_MAX
  } catch {
    return false
  }
}

const descriptorKeys = Object.freeze([
  'queryId', 'queryVersion', 'workspaceId', 'projectId', 'connectionId',
  'environment', 'datasetId', 'grainId', 'mappingDigest',
])
const expectedMappingKeys = Object.freeze(['datasetId', 'grainId', 'mappingDigest'])
const requestKeys = Object.freeze(['accountId', 'projectId', 'queryId', 'expectedSourceRevision', 'expectedInputDigest'])
const subjectKeys = Object.freeze([
  'workspaceId', 'projectId', 'connectionId', 'connectionRevisionId', 'qualificationId',
  'credentialGeneration', 'environment', 'sourceScopeId', 'sourceRevision', 'inputDigest',
])
const observationKeys = Object.freeze([
  'registrationDigest', 'subjectDigest', 'observationId', 'complete', 'coherence',
  'totalRows', 'nullKeyRows', 'duplicateKeyGroups',
])
const registrationKeys = Object.freeze([...descriptorKeys, 'observe'])

const captureDescriptor = (value: unknown): Readonly<RegisteredKeyConformanceDescriptor> => {
  const record = copyClosed(value, descriptorKeys)
  if (!record || !boundedText(record.queryId) || !boundedText(record.queryVersion) ||
    !uuid(record.workspaceId) || !uuid(record.projectId) || !uuid(record.connectionId) ||
    !environment(record.environment) || !boundedText(record.datasetId) || !boundedText(record.grainId) ||
    !digest(record.mappingDigest)) throw new Error('KEY_CONFORMANCE_REGISTRATION_INVALID')
  return freeze({
    queryId: record.queryId,
    queryVersion: record.queryVersion,
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    connectionId: record.connectionId,
    environment: record.environment,
    datasetId: record.datasetId,
    grainId: record.grainId,
    mappingDigest: record.mappingDigest,
  })
}

const captureRequest = (value: unknown): Readonly<RegisteredKeyConformanceRequest> | null => {
  const record = copyClosed(value, requestKeys)
  if (!record || !uuid(record.accountId) || !uuid(record.projectId) || !boundedText(record.queryId) ||
    !sourceRevision(record.expectedSourceRevision) || !digest(record.expectedInputDigest)) return null
  return freeze({
    accountId: record.accountId,
    projectId: record.projectId,
    queryId: record.queryId,
    expectedSourceRevision: record.expectedSourceRevision,
    expectedInputDigest: record.expectedInputDigest,
  })
}

const captureExpectedMapping = (value: unknown): Readonly<RegisteredKeyConformanceExpectedMapping> | null => {
  const record = copyClosed(value, expectedMappingKeys)
  if (!record || !boundedText(record.datasetId) || !boundedText(record.grainId) || !digest(record.mappingDigest)) return null
  return freeze({
    datasetId: record.datasetId,
    grainId: record.grainId,
    mappingDigest: record.mappingDigest,
  })
}

const captureSubject = (value: unknown): Readonly<RegisteredKeyConformanceSubject> | null => {
  const record = copyClosed(value, subjectKeys)
  if (!record || !uuid(record.workspaceId) || !uuid(record.projectId) || !uuid(record.connectionId) ||
    !uuid(record.connectionRevisionId) || !uuid(record.qualificationId) || !decimal(record.credentialGeneration) ||
    !environment(record.environment) || !digest(record.sourceScopeId) || !sourceRevision(record.sourceRevision) ||
    !digest(record.inputDigest)) return null
  return freeze({
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    connectionId: record.connectionId,
    connectionRevisionId: record.connectionRevisionId,
    qualificationId: record.qualificationId,
    credentialGeneration: record.credentialGeneration,
    environment: record.environment,
    sourceScopeId: record.sourceScopeId,
    sourceRevision: record.sourceRevision,
    inputDigest: record.inputDigest,
  })
}

const captureObservation = (value: unknown, registrationDigest: string, subjectDigest: string): Readonly<RegisteredKeyConformanceObservation> | null => {
  const record = copyClosed(value, observationKeys)
  if (!record || record.registrationDigest !== registrationDigest || record.subjectDigest !== subjectDigest ||
    !boundedText(record.observationId) || record.complete !== true ||
    typeof record.coherence !== 'string' || !COHERENCES.has(record.coherence) ||
    !decimal(record.totalRows) || !decimal(record.nullKeyRows) || !decimal(record.duplicateKeyGroups)) return null
  try {
    const total = BigInt(record.totalRows)
    const nullRows = BigInt(record.nullKeyRows)
    const duplicateGroups = BigInt(record.duplicateKeyGroups)
    if (nullRows > total || duplicateGroups > (total - nullRows) / 2n) return null
  } catch {
    return null
  }
  return freeze({
    registrationDigest,
    subjectDigest,
    observationId: record.observationId,
    complete: true,
    coherence: record.coherence as 'SINGLE_STATEMENT' | 'IMMUTABLE_SNAPSHOT',
    totalRows: record.totalRows,
    nullKeyRows: record.nullKeyRows,
    duplicateKeyGroups: record.duplicateKeyGroups,
  })
}

const refuse = (): RegisteredKeyConformanceResult => freeze({ status: 'REFUSED' })
const indeterminate = (): RegisteredKeyConformanceResult => freeze({ status: 'INDETERMINATE' })

const registrationDigest = (registration: RegisteredKeyConformanceDescriptor): string => sha256(canonicalBytes(registration))
const subjectDigest = (subject: RegisteredKeyConformanceSubject): string => sha256(canonicalBytes(subject))

export const createRegisteredKeyConformance = ({ registrations, resolveSubject }: Readonly<{
  registrations: readonly RegisteredKeyConformanceRegistration[]
  resolveSubject: RegisteredKeyConformanceResolver
}>): RegisteredKeyConformanceModule => {
  if (!Array.isArray(registrations) || typeof resolveSubject !== 'function') throw new Error('KEY_CONFORMANCE_CONFIGURATION_INVALID')
  const registry = new Map<string, Readonly<{
    descriptor: RegisteredKeyConformanceDescriptor
    digest: string
    observe: RegisteredKeyConformanceObserver
  }>>()
  for (const input of registrations) {
    const record = copyClosed(input, registrationKeys)
    if (!record || typeof record.observe !== 'function') throw new Error('KEY_CONFORMANCE_REGISTRATION_INVALID')
    const descriptor = captureDescriptor(Object.fromEntries(descriptorKeys.map((key) => [key, record[key]])))
    if (registry.has(descriptor.queryId)) throw new Error('KEY_CONFORMANCE_REGISTRATION_DUPLICATE')
    registry.set(descriptor.queryId, freeze({ descriptor, digest: registrationDigest(descriptor), observe: record.observe as RegisteredKeyConformanceObserver }))
  }

  const execute = async (
    input: RegisteredKeyConformanceRequest,
    expectedMappingInput: RegisteredKeyConformanceExpectedMapping,
  ): Promise<RegisteredKeyConformanceResult> => {
    const request = captureRequest(input)
    if (!request) return refuse()
    const expectedMapping = captureExpectedMapping(expectedMappingInput)
    if (!expectedMapping) return refuse()
    const registration = registry.get(request.queryId)
    if (!registration || registration.descriptor.projectId !== request.projectId) return refuse()
    if (
      expectedMapping.datasetId !== registration.descriptor.datasetId ||
      expectedMapping.grainId !== registration.descriptor.grainId ||
      expectedMapping.mappingDigest !== registration.descriptor.mappingDigest
    ) return refuse()
    const resolutionRequest = freeze({ accountId: request.accountId, registration: registration.descriptor })
    let beforeRaw: RegisteredKeyConformanceSubject | null
    try {
      beforeRaw = await resolveSubject(resolutionRequest)
    } catch {
      return indeterminate()
    }
    if (beforeRaw === null) return refuse()
    const before = captureSubject(beforeRaw)
    if (!before) return indeterminate()
    if (before.projectId !== registration.descriptor.projectId || before.workspaceId !== registration.descriptor.workspaceId ||
      before.connectionId !== registration.descriptor.connectionId || before.environment !== registration.descriptor.environment) return refuse()
    if (before.sourceRevision !== request.expectedSourceRevision || before.inputDigest !== request.expectedInputDigest) return indeterminate()
    const beforeDigest = subjectDigest(before)
    let observed: unknown
    try {
      observed = await registration.observe(freeze({
        registration: registration.descriptor,
        registrationDigest: registration.digest,
        subject: before,
        subjectDigest: beforeDigest,
      }))
    } catch {
      return indeterminate()
    }
    const observation = captureObservation(observed, registration.digest, beforeDigest)
    if (!observation) return indeterminate()
    let afterRaw: RegisteredKeyConformanceSubject | null
    try {
      afterRaw = await resolveSubject(resolutionRequest)
    } catch {
      return indeterminate()
    }
    if (afterRaw === null) return indeterminate()
    const after = captureSubject(afterRaw)
    if (!after) return indeterminate()
    if (after.projectId !== registration.descriptor.projectId || after.workspaceId !== registration.descriptor.workspaceId ||
      after.connectionId !== registration.descriptor.connectionId || after.environment !== registration.descriptor.environment) return indeterminate()
    if (after.sourceRevision !== request.expectedSourceRevision || after.inputDigest !== request.expectedInputDigest) return indeterminate()
    if (subjectDigest(after) !== beforeDigest) return indeterminate()
    const outcome = observation.nullKeyRows === '0' && observation.duplicateKeyGroups === '0' ? 'PASS' : 'ASSERTION_FAILED'
    const proofDigest = sha256(canonicalBytes({
      registrationDigest: registration.digest,
      subjectDigest: beforeDigest,
      observationId: observation.observationId,
      coherence: observation.coherence,
      totalRows: observation.totalRows,
      nullKeyRows: observation.nullKeyRows,
      duplicateKeyGroups: observation.duplicateKeyGroups,
      outcome,
    }))
    return freeze({
      status: 'PROVEN', outcome,
      registrationDigest: registration.digest,
      subjectDigest: beforeDigest,
      observationId: observation.observationId,
      empty: observation.totalRows === '0',
      registration: registration.descriptor,
      subject: before,
      coherence: observation.coherence,
      counts: freeze({
        totalRows: observation.totalRows,
        nullKeyRows: observation.nullKeyRows,
        duplicateKeyGroups: observation.duplicateKeyGroups,
      }),
      proofDigest,
    })
  }
  return freeze({ execute })
}
