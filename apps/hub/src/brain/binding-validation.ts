import {
  parseBrainRealization,
  validateBrainSource,
  type BrainAssertion,
  type BrainRealization,
  type BrainSourceV2,
} from '../../../../packages/brain-contract/src/index.mjs'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const DIGEST = /^[0-9a-f]{64}$/
const SOURCE = /^[0-9a-f]{40}$/
const DECIMAL = /^(?:0|[1-9][0-9]*)$/
const MAX_CANDIDATE_BYTES = 1_048_576
const SIGNED_BIGINT_MAX = 9_223_372_036_854_775_807n

type UnknownRecord = Record<string, unknown>
type SourceFile = Readonly<{ path: string; digest: string; byteLength: number }>
type RegisteredKeyConformanceDescriptor = Readonly<{
  queryId: string
  queryVersion: string
  workspaceId: string
  projectId: string
  connectionId: string
  environment: 'SANDBOX' | 'PRODUCTION'
  datasetId: string
  grainId: string
  mappingDigest: string
}>
type RegisteredKeyConformanceSubject = Readonly<{
  workspaceId: string
  projectId: string
  connectionId: string
  connectionRevisionId: string
  qualificationId: string
  credentialGeneration: string
  environment: 'SANDBOX' | 'PRODUCTION'
  sourceScopeId: string
  sourceRevision: string
  inputDigest: string
}>
type RegisteredKeyConformanceResult = Readonly<
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
    counts: Readonly<{ totalRows: string; nullKeyRows: string; duplicateKeyGroups: string }>
    proofDigest: string
  }
>
type RegisteredKeyConformanceModule = Readonly<{
  execute(
    request: Readonly<{
      accountId: string
      projectId: string
      queryId: string
      expectedSourceRevision: string
      expectedInputDigest: string
    }>,
    expectedMapping: Readonly<{ datasetId: string; grainId: string; mappingDigest: string }>,
  ): Promise<RegisteredKeyConformanceResult>
}>

export type BrainBindingVerifiedRealization = Readonly<{
  manifest: BrainRealization
  applicableItemIds: readonly string[]
  requiredAssertions: readonly BrainAssertion[]
  inputDigest: string
  sourceRevision: string
  manifestDigest: string
  sourceFiles: readonly SourceFile[]
}>

export type BrainBindingValidationInput = Readonly<{
  accountId: string
  projectId: string
  workspaceId: string
  brainRevisionId: string
  brainDigest: string
  brainSource: unknown
  realization: BrainBindingVerifiedRealization
}>

export type BrainBindingProof = Readonly<{
  assertionId: string
  itemId: string
  predicateVersion: '1'
  outcome: 'PASS'
  registration: RegisteredKeyConformanceDescriptor
  registrationDigest: string
  subject: RegisteredKeyConformanceSubject
  subjectDigest: string
  observationId: string
  coherence: 'SINGLE_STATEMENT' | 'IMMUTABLE_SNAPSHOT'
  counts: Readonly<{ totalRows: string; nullKeyRows: string; duplicateKeyGroups: string }>
  empty: boolean
  proofDigest: string
}>

export type BrainBindingValidationCandidate = Readonly<{
  schemaVersion: 'conexus-brain-binding-validation/v1'
  validationState: 'VALID'
  projectId: string
  workspaceId: string
  brainRevisionId: string
  brainDigest: string
  sourceRevision: string
  inputDigest: string
  manifestDigest: string
  applicableItemIds: readonly string[]
  proofs: readonly BrainBindingProof[]
}>

export type BrainBindingValidationResult = Readonly<
  | { status: 'REFUSED' }
  | { status: 'INDETERMINATE' }
  | { status: 'ASSERTION_FAILED' }
  | { status: 'VALIDATED'; candidate: BrainBindingValidationCandidate; projectBindingDigest: string }
>

export type BrainBindingValidator = Readonly<{
  validate(input: BrainBindingValidationInput): Promise<BrainBindingValidationResult>
}>

const result = <T extends BrainBindingValidationResult>(value: T): T => Object.freeze(value)
const refused = () => result({ status: 'REFUSED' } as const)
const indeterminate = () => result({ status: 'INDETERMINATE' } as const)
const failed = () => result({ status: 'ASSERTION_FAILED' } as const)
const record = (value: unknown): value is UnknownRecord => {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    return [Object.prototype, null].includes(Object.getPrototypeOf(value))
  } catch { return false }
}
const closed = (value: unknown, keys: readonly string[]): UnknownRecord | null => {
  try {
    if (!record(value) || Reflect.ownKeys(value).length !== keys.length) return null
    const copy: UnknownRecord = {}
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !('value' in descriptor)) return null
      copy[key] = descriptor.value
    }
    return copy
  } catch { return null }
}
const canonicalEqual = (left: unknown, right: unknown): boolean => {
  try { return canonicalBytes(left).equals(canonicalBytes(right)) } catch { return false }
}
const digest = (value: unknown): value is string => typeof value === 'string' && DIGEST.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const decimal = (value: unknown): value is string => typeof value === 'string' && value.length <= 19 && DECIMAL.test(value)
const boundedText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 &&
  value.length <= 256 && value.trim() === value && [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
const frozenCopy = <T>(value: T): T => JSON.parse(canonicalBytes(value).toString('utf8')) as T

const capture = (input: unknown): Readonly<{
  accountId: string
  projectId: string
  workspaceId: string
  brainRevisionId: string
  brainDigest: string
  brainSource: BrainSourceV2
  realization: BrainBindingVerifiedRealization
}> | null => {
  const top = closed(input, ['accountId', 'projectId', 'workspaceId', 'brainRevisionId', 'brainDigest', 'brainSource', 'realization'])
  if (!top || !uuid(top.accountId) || !uuid(top.projectId) || !uuid(top.workspaceId) ||
    !uuid(top.brainRevisionId) || !digest(top.brainDigest)) return null
  let brainSource: BrainSourceV2
  try {
    const validated = validateBrainSource(top.brainSource)
    if (validated.schemaVersion !== 'conexus-brain/v2') return null
    brainSource = frozenCopy(validated) as BrainSourceV2
  } catch { return null }
  const raw = closed(top.realization, [
    'manifest', 'applicableItemIds', 'requiredAssertions', 'inputDigest',
    'sourceRevision', 'manifestDigest', 'sourceFiles',
  ])
  if (!raw || !digest(raw.inputDigest) || typeof raw.sourceRevision !== 'string' || !SOURCE.test(raw.sourceRevision) ||
    !digest(raw.manifestDigest) || !Array.isArray(raw.sourceFiles) || raw.sourceFiles.length > 2_048) return null
  let parsed: ReturnType<typeof parseBrainRealization>
  try { parsed = parseBrainRealization(raw.manifest, brainSource) } catch { return null }
  if (!canonicalEqual(parsed.applicableItemIds, raw.applicableItemIds) ||
    !canonicalEqual(parsed.requiredAssertions, raw.requiredAssertions) || parsed.inputDigest !== raw.inputDigest) return null
  const sourceFiles: SourceFile[] = []
  for (const [index, value] of raw.sourceFiles.entries()) {
    const file = closed(value, ['path', 'digest', 'byteLength'])
    const reference = parsed.manifest.sourceInputs[index]
    if (!file || !reference || file.path !== reference.path || file.digest !== reference.digest ||
      !Number.isSafeInteger(file.byteLength) || Number(file.byteLength) < 0) return null
    sourceFiles.push(Object.freeze({ path: reference.path, digest: reference.digest, byteLength: Number(file.byteLength) }))
  }
  if (sourceFiles.length !== parsed.manifest.sourceInputs.length) return null
  return Object.freeze({
    accountId: top.accountId, projectId: top.projectId, workspaceId: top.workspaceId,
    brainRevisionId: top.brainRevisionId, brainDigest: top.brainDigest, brainSource,
    realization: Object.freeze({
      manifest: parsed.manifest, applicableItemIds: parsed.applicableItemIds,
      requiredAssertions: parsed.requiredAssertions, inputDigest: parsed.inputDigest,
      sourceRevision: raw.sourceRevision, manifestDigest: raw.manifestDigest,
      sourceFiles: Object.freeze(sourceFiles),
    }),
  })
}

const boundedDecimal = (value: unknown): value is string => decimal(value) && BigInt(value) <= SIGNED_BIGINT_MAX

const proofDigest = (proof: UnknownRecord): string => sha256(canonicalBytes({
  registrationDigest: proof.registrationDigest,
  subjectDigest: proof.subjectDigest,
  observationId: proof.observationId,
  coherence: proof.coherence,
  totalRows: (proof.counts as UnknownRecord).totalRows,
  nullKeyRows: (proof.counts as UnknownRecord).nullKeyRows,
  duplicateKeyGroups: (proof.counts as UnknownRecord).duplicateKeyGroups,
  outcome: proof.outcome,
}))

const captureProof = (
  produced: unknown,
  assertion: BrainAssertion,
  expected: Readonly<{
    projectId: string
    workspaceId: string
    sourceRevision: string
    inputDigest: string
    queryId: string
    datasetId: string
    grainId: string
    mappingDigest: string
  }>,
): BrainBindingProof | null => {
  try {
    const proof = closed(produced, [
      'status', 'outcome', 'registrationDigest', 'subjectDigest', 'observationId', 'empty',
      'registration', 'subject', 'coherence', 'counts', 'proofDigest',
    ])
    if (proof?.status !== 'PROVEN' || proof.outcome !== 'PASS' ||
      !boundedText(proof.observationId) ||
      typeof proof.empty !== 'boolean' || !digest(proof.registrationDigest) || !digest(proof.subjectDigest) ||
      !digest(proof.proofDigest) || !['SINGLE_STATEMENT', 'IMMUTABLE_SNAPSHOT'].includes(String(proof.coherence))) return null
    const registration = closed(proof.registration, [
      'queryId', 'queryVersion', 'workspaceId', 'projectId', 'connectionId', 'environment',
      'datasetId', 'grainId', 'mappingDigest',
    ])
    const subject = closed(proof.subject, [
      'workspaceId', 'projectId', 'connectionId', 'connectionRevisionId', 'qualificationId',
      'credentialGeneration', 'environment', 'sourceScopeId', 'sourceRevision', 'inputDigest',
    ])
    const counts = closed(proof.counts, ['totalRows', 'nullKeyRows', 'duplicateKeyGroups'])
    if (!registration || !subject || !counts || registration.queryId !== expected.queryId ||
      registration.projectId !== expected.projectId || registration.workspaceId !== expected.workspaceId ||
      registration.datasetId !== expected.datasetId || registration.grainId !== expected.grainId ||
      registration.mappingDigest !== expected.mappingDigest || !boundedText(registration.queryVersion) ||
      !uuid(registration.connectionId) ||
      !['SANDBOX', 'PRODUCTION'].includes(String(registration.environment)) ||
      subject.projectId !== expected.projectId || subject.workspaceId !== expected.workspaceId ||
      subject.connectionId !== registration.connectionId || subject.environment !== registration.environment ||
      subject.sourceRevision !== expected.sourceRevision || subject.inputDigest !== expected.inputDigest ||
      !uuid(subject.connectionRevisionId) || !uuid(subject.qualificationId) || !digest(subject.sourceScopeId) ||
      !boundedDecimal(subject.credentialGeneration) || !boundedDecimal(counts.totalRows) ||
      !boundedDecimal(counts.nullKeyRows) || !boundedDecimal(counts.duplicateKeyGroups)) return null
    const totalRows = BigInt(counts.totalRows)
    const nonNullRows = totalRows - BigInt(counts.nullKeyRows)
    if (nonNullRows < 0n || BigInt(counts.duplicateKeyGroups) > nonNullRows / 2n ||
      proof.empty !== (counts.totalRows === '0') || proof.registrationDigest !== sha256(canonicalBytes(registration)) ||
      proof.subjectDigest !== sha256(canonicalBytes(subject)) || proofDigest(proof) !== proof.proofDigest) return null
    return Object.freeze({
      assertionId: assertion.assertionId,
      itemId: assertion.itemId,
      predicateVersion: assertion.predicateVersion,
      outcome: 'PASS',
      registration: Object.freeze(frozenCopy(registration)) as RegisteredKeyConformanceDescriptor,
      registrationDigest: proof.registrationDigest,
      subject: Object.freeze(frozenCopy(subject)) as RegisteredKeyConformanceSubject,
      subjectDigest: proof.subjectDigest,
      observationId: proof.observationId,
      coherence: proof.coherence as BrainBindingProof['coherence'],
      counts: Object.freeze(frozenCopy(counts)) as BrainBindingProof['counts'],
      empty: proof.empty,
      proofDigest: proof.proofDigest,
    })
  } catch { return null }
}

export const createBrainBindingValidator = ({ conformance }: Readonly<{
  conformance: RegisteredKeyConformanceModule
}>): BrainBindingValidator => {
  if (!conformance || typeof conformance.execute !== 'function') throw new Error('BRAIN_BINDING_VALIDATOR_CONFIGURATION_REFUSED')
  return Object.freeze({
    validate: async (input) => {
      const captured = capture(input)
      if (!captured) return refused()
      const items = new Map(captured.brainSource.items.map((item) => [item.itemId, item]))
      const mappings = new Map(captured.realization.manifest.mappings.map((mapping) => [mapping.itemId, mapping]))
      const proofs: BrainBindingProof[] = []
      for (const assertion of captured.realization.requiredAssertions) {
        const item = items.get(assertion.itemId)
        const mapping = mappings.get(assertion.itemId)
        if (item?.kind !== 'DATASET' || !mapping) return refused()
        let produced: Awaited<ReturnType<RegisteredKeyConformanceModule['execute']>>
        try {
          produced = await conformance.execute({
            accountId: captured.accountId, projectId: captured.projectId, queryId: mapping.queryId,
            expectedSourceRevision: captured.realization.sourceRevision,
            expectedInputDigest: captured.realization.inputDigest,
          }, { datasetId: item.itemId, grainId: item.grainId, mappingDigest: mapping.mappingDigest })
        } catch { return indeterminate() }
        if (produced.status === 'REFUSED') return refused()
        if (produced.status === 'INDETERMINATE') return indeterminate()
        if (produced.outcome === 'ASSERTION_FAILED') return failed()
        const proof = captureProof(produced, assertion, {
          projectId: captured.projectId, workspaceId: captured.workspaceId,
          sourceRevision: captured.realization.sourceRevision, inputDigest: captured.realization.inputDigest,
          queryId: mapping.queryId, datasetId: item.itemId, grainId: item.grainId,
          mappingDigest: mapping.mappingDigest,
        })
        if (!proof) return refused()
        proofs.push(proof)
      }
      const candidate: BrainBindingValidationCandidate = Object.freeze({
        schemaVersion: 'conexus-brain-binding-validation/v1', validationState: 'VALID',
        projectId: captured.projectId, workspaceId: captured.workspaceId,
        brainRevisionId: captured.brainRevisionId, brainDigest: captured.brainDigest,
        sourceRevision: captured.realization.sourceRevision, inputDigest: captured.realization.inputDigest,
        manifestDigest: captured.realization.manifestDigest,
        applicableItemIds: Object.freeze([...captured.realization.applicableItemIds]),
        proofs: Object.freeze(proofs),
      })
      const bytes = canonicalBytes(candidate)
      if (bytes.length > MAX_CANDIDATE_BYTES) return refused()
      return result({ status: 'VALIDATED', candidate, projectBindingDigest: sha256(bytes) } as const)
    },
  })
}
