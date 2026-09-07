import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import {
  validateBrainHealth,
  validateBrainSource,
  type BrainSourceV2,
} from '../../../../packages/brain-contract/src/index.mjs'
import type { R2HubBRN14Contract } from '../generated/r2-routes.js'

export type ProjectBrainContext = R2HubBRN14Contract['responses']['200']

type ContextProjectId = Readonly<{ accountId: string; projectId: string }>
type ContextReadStatus = 'FOUND' | 'NOT_FOUND' | 'DENIED' | 'UNAVAILABLE'

export type ProjectBrainContextPortResult<T> = Readonly<
  | { status: 'FOUND'; value: T }
  | { status: 'NOT_FOUND' }
  | { status: 'DENIED' }
  | { status: 'UNAVAILABLE' }
>

export type ProjectBrainContextAuthorization = Readonly<{
  projectRead: boolean
  brainRead: boolean
  projectBuild: boolean
}>

export type CurrentProjectBrainBinding = Readonly<{
  projectId: string
  workspaceId: string
  brainRevisionId: string
  brainDigest: string
  projectBindingDigest: string
  validationState: string
  updateAvailable: boolean
  currentProjectSourceRevision: string
  validationCandidate: unknown
}>

export type CurrentProjectBrainRealization = Readonly<{
  sourceRevision: string
  inputDigest: string
  manifestDigest: string
  applicableItemIds: readonly string[]
}>

export type ProjectBrainContextRegistryRevision = Readonly<{
  brainRevisionId: string
  brainDigest: string
  sourceRevision: string
  availability: 'AVAILABLE'
  payload: unknown
}>

export type ProjectBrainContextHealth = Readonly<{
  brainRevisionId: string
  brainDigest: string
  healthSnapshotDigest: string
  items: readonly Readonly<{
    semanticRef: string
    state: 'UNVERIFIED' | 'VALID' | 'SUSPECT' | 'INVALID' | 'CHECK_ERROR'
    critical: boolean
  }>[]
}>

export type ProjectBrainContextPorts = Readonly<{
  basis: Readonly<{
    load(input: ContextProjectId): Promise<ProjectBrainContextPortResult<Readonly<{
      authorization: ProjectBrainContextAuthorization
      binding: CurrentProjectBrainBinding
      revision: ProjectBrainContextRegistryRevision
      health: ProjectBrainContextHealth
    }>>>
  }>
  project: Readonly<{
    getCurrentRealization(input: ContextProjectId & Readonly<{
      sourceRevision: string
      brainSource: unknown
    }>): Promise<ProjectBrainContextPortResult<CurrentProjectBrainRealization>>
  }>
}>

export type ProjectBrainContextResult = Readonly<
  | { status: 'FOUND'; value: ProjectBrainContext }
  | { status: 'NOT_FOUND' }
  | { status: 'DENIED' }
  | { status: 'UNAVAILABLE' }
>

export type ProjectBrainContextPurpose = 'READ' | 'BUILD'

export type ResolveProjectBrainContextInput = ContextProjectId & Readonly<{
  purpose?: ProjectBrainContextPurpose
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const DIGEST = /^[0-9a-f]{64}$/
const SOURCE_REVISION = /^[0-9a-f]{40}$/
const MAX_TEXT_LENGTH = 256

type RecordValue = Record<string, unknown>
type BrainV2Domain = BrainSourceV2['knowledgeBrowse']['domains'][number]
type BrainV2Concept = BrainV2Domain['concepts'][number]

const unavailable = (): ProjectBrainContextResult => ({ status: 'UNAVAILABLE' })
const result = (value: ProjectBrainContext): ProjectBrainContextResult => ({ status: 'FOUND', value })

const record = (value: unknown): value is RecordValue => {
  try {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))
  } catch {
    return false
  }
}

const exactKeys = (value: RecordValue, keys: readonly string[]): boolean =>
  Reflect.ownKeys(value).length === keys.length &&
  keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor?.enumerable === true && 'value' in descriptor
  }) &&
  Reflect.ownKeys(value).every((key) => typeof key === 'string' && keys.includes(key))

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 &&
  value.length <= MAX_TEXT_LENGTH && value.trim() === value &&
  [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)

const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const digest = (value: unknown): value is string => typeof value === 'string' && DIGEST.test(value)
const sourceRevision = (value: unknown): value is string => typeof value === 'string' && SOURCE_REVISION.test(value)
const decimal = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value)

const arrayOfText = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(text) && new Set(value).size === value.length

const candidateKeys = [
  'applicableItemIds', 'brainDigest', 'brainRevisionId', 'inputDigest', 'manifestDigest',
  'projectId', 'proofs', 'schemaVersion', 'sourceRevision', 'validationState', 'workspaceId',
] as const

const proofKeys = [
  'assertionId', 'coherence', 'counts', 'empty', 'itemId', 'observationId', 'outcome',
  'predicateVersion', 'proofDigest', 'registration', 'registrationDigest', 'subject', 'subjectDigest',
] as const

const registrationKeys = [
  'queryId', 'queryVersion', 'workspaceId', 'projectId', 'connectionId',
  'environment', 'datasetId', 'grainId', 'mappingDigest',
] as const
const subjectKeys = [
  'workspaceId', 'projectId', 'connectionId', 'connectionRevisionId',
  'qualificationId', 'credentialGeneration', 'environment', 'sourceScopeId', 'sourceRevision', 'inputDigest',
] as const
const countKeys = ['totalRows', 'nullKeyRows', 'duplicateKeyGroups'] as const

const proofDigest = (value: RecordValue): boolean => {
  if (!exactKeys(value, proofKeys) || !text(value.assertionId) || !text(value.itemId) ||
    value.predicateVersion !== '1' || value.outcome !== 'PASS' || !text(value.observationId) ||
    !['SINGLE_STATEMENT', 'IMMUTABLE_SNAPSHOT'].includes(String(value.coherence)) ||
    typeof value.empty !== 'boolean' || !digest(value.registrationDigest) ||
    !digest(value.subjectDigest) || !digest(value.proofDigest)) return false
  const registration = value.registration
  const subject = value.subject
  const counts = value.counts
  if (!record(registration) || !record(subject) || !record(counts) ||
    !exactKeys(registration, registrationKeys) || !exactKeys(subject, subjectKeys) || !exactKeys(counts, countKeys)) return false
  if (!decimal(counts.totalRows) || !decimal(counts.nullKeyRows) || !decimal(counts.duplicateKeyGroups)) return false
  return uuid(registration.connectionId) && uuid(subject.connectionId) &&
    uuid(subject.connectionRevisionId) && uuid(subject.qualificationId) && digest(subject.sourceScopeId) &&
    text(registration.queryId) && text(registration.queryVersion) && text(registration.workspaceId) &&
    text(registration.projectId) && text(registration.datasetId) && text(registration.grainId) &&
    digest(registration.mappingDigest) && ['SANDBOX', 'PRODUCTION'].includes(String(registration.environment)) &&
    text(subject.workspaceId) && text(subject.projectId) && sourceRevision(subject.sourceRevision) &&
    digest(subject.inputDigest) && /^(0|[1-9][0-9]{0,18})$/.test(String(subject.credentialGeneration)) &&
    ['SANDBOX', 'PRODUCTION'].includes(String(subject.environment)) &&
    value.registrationDigest === sha256(canonicalBytes(registration)) &&
    value.subjectDigest === sha256(canonicalBytes(subject)) &&
    value.proofDigest === sha256(canonicalBytes({
      registrationDigest: value.registrationDigest,
      subjectDigest: value.subjectDigest,
      observationId: value.observationId,
      coherence: value.coherence,
      totalRows: counts.totalRows,
      nullKeyRows: counts.nullKeyRows,
      duplicateKeyGroups: counts.duplicateKeyGroups,
      outcome: value.outcome,
    }))
}

const validCandidate = (
  value: unknown,
  binding: CurrentProjectBrainBinding,
  source: BrainSourceV2,
): value is RecordValue & Readonly<{
  projectId: string
  workspaceId: string
  brainRevisionId: string
  brainDigest: string
  sourceRevision: string
  inputDigest: string
  manifestDigest: string
  applicableItemIds: readonly string[]
  proofs: readonly RecordValue[]
}> => {
  if (!record(value) || !exactKeys(value, candidateKeys) || value.schemaVersion !== 'conexus-brain-binding-validation/v1' ||
    value.validationState !== 'VALID' || value.projectId !== binding.projectId || value.workspaceId !== binding.workspaceId ||
    value.brainRevisionId !== binding.brainRevisionId || value.brainDigest !== binding.brainDigest ||
    !uuid(value.projectId) || !uuid(value.workspaceId) ||
    !uuid(value.brainRevisionId) || !digest(value.brainDigest) || !sourceRevision(value.sourceRevision) ||
    !digest(value.inputDigest) || !digest(value.manifestDigest) || !arrayOfText(value.applicableItemIds) ||
    !Array.isArray(value.proofs) || value.applicableItemIds.length > 2_048 || value.proofs.length > 4_096) return false

  const itemById = new Map(source.items.map((item) => [item.itemId, item]))
  const applicable = new Set(value.applicableItemIds)
  if ([...applicable].some((itemId) => !itemById.has(itemId))) return false
  for (const itemId of applicable) {
    const pending = [...(itemById.get(itemId)?.dependsOn ?? [])]
    const seen = new Set<string>()
    while (pending.length > 0) {
      const dependency = pending.pop()
      if (dependency === undefined || seen.has(dependency)) continue
      seen.add(dependency)
      if (!applicable.has(dependency)) return false
      pending.push(...(itemById.get(dependency)?.dependsOn ?? []))
    }
  }

  const required = source.assertions.filter((assertion) =>
    assertion.scope === 'REVISION' || applicable.has(assertion.itemId))
  if (value.proofs.length !== required.length) return false
  const proofByAssertion = new Map<string, RecordValue>()
  for (const proof of value.proofs) {
    if (!record(proof) || !proofDigest(proof) || proofByAssertion.has(String(proof.assertionId))) return false
    proofByAssertion.set(String(proof.assertionId), proof)
    const registration = proof.registration as RecordValue
    const subject = proof.subject as RecordValue
    if (registration.projectId !== binding.projectId || registration.workspaceId !== binding.workspaceId ||
      subject.projectId !== binding.projectId || subject.workspaceId !== binding.workspaceId ||
      subject.sourceRevision !== value.sourceRevision || subject.inputDigest !== value.inputDigest ||
      registration.connectionId !== subject.connectionId || registration.environment !== subject.environment) return false
  }
  return required.every((assertion) => {
    const proof = proofByAssertion.get(assertion.assertionId)
    return proof?.itemId === assertion.itemId && proof?.assertionId === assertion.assertionId
  }) && sha256(canonicalBytes(value)) === binding.projectBindingDigest
}

const validBinding = (value: CurrentProjectBrainBinding, projectId: string): boolean =>
  record(value) && value.projectId === projectId && uuid(value.projectId) && uuid(value.workspaceId) &&
  uuid(value.brainRevisionId) && digest(value.brainDigest) && digest(value.projectBindingDigest) &&
  value.validationState === 'VALID' && typeof value.updateAvailable === 'boolean' &&
  sourceRevision(value.currentProjectSourceRevision) &&
  value.validationCandidate !== null && value.validationCandidate !== undefined

const currentRealizationMatches = (
  current: CurrentProjectBrainRealization,
  candidate: RecordValue & Readonly<{
    inputDigest: string
    manifestDigest: string
    applicableItemIds: readonly string[]
  }>,
  binding: CurrentProjectBrainBinding,
): boolean => record(current) && sourceRevision(current.sourceRevision) &&
  current.sourceRevision === binding.currentProjectSourceRevision &&
  digest(current.inputDigest) && current.inputDigest === candidate.inputDigest &&
  digest(current.manifestDigest) && current.manifestDigest === candidate.manifestDigest &&
  arrayOfText(current.applicableItemIds) &&
  canonicalBytes(current.applicableItemIds).equals(canonicalBytes(candidate.applicableItemIds))

const authoringRef = (input: Readonly<{
  projectId: string
  brainRevisionId: string
  brainDigest: string
  projectBindingDigest: string
  itemId: string
}>): string => `project-brain-authoring/v1:${sha256(canonicalBytes(input))}`

const presentationRef = (input: Readonly<{
  projectId: string
  brainRevisionId: string
  projectBindingDigest: string
  domainRef: string
  conceptRef?: string
}>): string => `project-brain-context/v1:${sha256(canonicalBytes(input))}`

const healthIsCurrent = (
  value: ProjectBrainContextHealth,
  source: BrainSourceV2,
  binding: CurrentProjectBrainBinding,
): boolean => {
  if (!record(value) || value.brainRevisionId !== binding.brainRevisionId || value.brainDigest !== binding.brainDigest ||
    !digest(value.healthSnapshotDigest) || !Array.isArray(value.items)) return false
  try {
    validateBrainHealth({ schemaVersion: 'conexus-brain-health/v1', items: value.items }, source)
    return true
  } catch {
    return false
  }
}

const projectContext = (
  binding: CurrentProjectBrainBinding,
  source: BrainSourceV2,
  candidate: RecordValue & Readonly<{
    applicableItemIds: readonly string[]
  }>,
  health: ProjectBrainContextHealth,
  detailDisclosed: boolean,
): ProjectBrainContext => {
  const applicable = new Set(candidate.applicableItemIds)
  const healthByItem = new Map(health.items.map((item) => [item.semanticRef, item]))
  const domains = source.knowledgeBrowse.domains.flatMap((domain: BrainV2Domain) => {
    const concepts = domain.concepts.flatMap((concept: BrainV2Concept) => {
      if (!applicable.has(concept.itemRef)) return []
      const healthItem = healthByItem.get(concept.itemRef)
      if (!healthItem) return []
      const refInput = {
        projectId: binding.projectId,
        brainRevisionId: binding.brainRevisionId,
        brainDigest: binding.brainDigest,
        projectBindingDigest: binding.projectBindingDigest,
        itemId: concept.itemRef,
      }
      return [{
        conceptRef: presentationRef({ ...refInput, domainRef: domain.domainRef, conceptRef: concept.conceptRef }),
        authoringRef: authoringRef(refInput),
        label: concept.label,
        summary: concept.summary,
        contentClasses: [...concept.contentClasses],
        detailDisclosed,
        sections: detailDisclosed ? concept.sections.map((section) => ({ kind: section.kind, text: section.text })) : [],
        provenanceRefs: detailDisclosed ? [...concept.provenanceRefs] : [],
      }]
    })
    if (concepts.length === 0) return []
    return [{
      domainRef: presentationRef({
        projectId: binding.projectId,
        brainRevisionId: binding.brainRevisionId,
        projectBindingDigest: binding.projectBindingDigest,
        domainRef: domain.domainRef,
      }),
      label: domain.label,
      concepts,
    }]
  })
  return Object.freeze({
    projectId: binding.projectId,
    brainRevisionId: binding.brainRevisionId,
    brainDigest: binding.brainDigest,
    projectBindingDigest: binding.projectBindingDigest,
    validationState: binding.validationState,
    updateAvailable: binding.updateAvailable,
    domains,
  })
}

const resolve = async (
  ports: ProjectBrainContextPorts,
  input: ResolveProjectBrainContextInput,
): Promise<ProjectBrainContextResult> => {
  const purpose = input.purpose ?? 'READ'
  const basis = await ports.basis.load(input)
  if (basis.status !== 'FOUND') return basis.status === 'NOT_FOUND'
    ? { status: 'NOT_FOUND' }
    : basis.status === 'DENIED' ? { status: 'DENIED' } : unavailable()
  const grants = basis.value.authorization
  if (typeof grants.projectRead !== 'boolean' || typeof grants.brainRead !== 'boolean' ||
    typeof grants.projectBuild !== 'boolean') return unavailable()
  const detailDisclosed = purpose === 'READ' && grants.projectRead && grants.brainRead
  const authoringOnly = purpose === 'BUILD' && grants.projectBuild
  if (!detailDisclosed && !authoringOnly) return { status: 'DENIED' }

  const binding = basis.value.binding
  if (!validBinding(binding, input.projectId)) return unavailable()

  const revision = basis.value.revision
  if (!record(revision) || revision.availability !== 'AVAILABLE' || revision.brainRevisionId !== binding.brainRevisionId ||
    revision.brainDigest !== binding.brainDigest) return unavailable()
  let source: BrainSourceV2
  try {
    const parsed = validateBrainSource(revision.payload)
    if (parsed.schemaVersion !== 'conexus-brain/v2') return unavailable()
    source = parsed as BrainSourceV2
  } catch {
    return unavailable()
  }
  if (!validCandidate(binding.validationCandidate, binding, source)) return unavailable()
  const candidate = binding.validationCandidate as RecordValue & Readonly<{
    inputDigest: string
    manifestDigest: string
    applicableItemIds: readonly string[]
  }>
  const realizationResult = await ports.project.getCurrentRealization({
    ...input,
    sourceRevision: binding.currentProjectSourceRevision,
    brainSource: source,
  })
  if (realizationResult.status !== 'FOUND' ||
    !currentRealizationMatches(realizationResult.value, candidate, binding)) return unavailable()

  const health = basis.value.health
  if (!healthIsCurrent(health, source, binding)) return unavailable()
  const healthByItem = new Map(health.items.map((item) => [item.semanticRef, item]))
  for (const itemId of candidate.applicableItemIds) {
    const item = healthByItem.get(itemId)
    if (!item || (item.critical && item.state !== 'VALID')) return unavailable()
  }
  return result(projectContext(binding, source, candidate, health, detailDisclosed))
}

export type ProjectBrainContextResolver = Readonly<{
  resolve(input: ResolveProjectBrainContextInput): Promise<ProjectBrainContextResult>
}>

export const createProjectBrainContextResolver = (
  ports: ProjectBrainContextPorts,
): ProjectBrainContextResolver => Object.freeze({
  resolve: async (input) => {
    try { return await resolve(ports, input) } catch { return unavailable() }
  },
})

export const resolveProjectBrainContext = (
  ports: ProjectBrainContextPorts,
  input: ResolveProjectBrainContextInput,
): Promise<ProjectBrainContextResult> => createProjectBrainContextResolver(ports).resolve(input)

export type ProjectBrainContextStatus = ContextReadStatus
