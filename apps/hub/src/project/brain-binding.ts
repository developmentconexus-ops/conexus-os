import { randomUUID } from 'node:crypto'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { R2HubPRJ10Contract } from '../generated/r2-routes.js'
import { readProjectBrainRealization } from './brain-realization.js'
import type { ProjectSourceSnapshotFactory } from './inception.js'

type BrainBindingValidationCandidate = unknown
type BrainBindingValidationResult = Readonly<
  | { status: 'REFUSED' }
  | { status: 'INDETERMINATE' }
  | { status: 'ASSERTION_FAILED' }
  | { status: 'VALIDATED'; candidate: BrainBindingValidationCandidate; projectBindingDigest: string }
>
export type ProjectBrainBindingValidator = Readonly<{
  validate(input: Readonly<{
    accountId: string
    projectId: string
    workspaceId: string
    brainRevisionId: string
    brainDigest: string
    brainSource: unknown
    realization: unknown
  }>): Promise<BrainBindingValidationResult>
}>

export type ProjectBrainBinding = R2HubPRJ10Contract['responses']['200']
export type ProjectBrainBindingCurrent = Readonly<{
  projectId: string
  workspaceId: string
  brainRevisionId: string
  brainDigest: string
  projectBindingDigest: string
  validationState: string
  updateAvailable: boolean
}>

export type ProjectBrainBindingReadResult = Readonly<
  | { status: 'FOUND'; value: ProjectBrainBinding }
  | { status: 'ABSENT' }
  | { status: 'DENIED' }
  | { status: 'NOT_FOUND' }
  | { status: 'UNAVAILABLE' }
>

export type ProjectBrainBindingSetResult = Readonly<
  | { status: 'FOUND'; value: ProjectBrainBinding; created: boolean }
  | { status: 'DENIED' }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT' }
  | { status: 'STALE' }
  | { status: 'INVALID' }
  | { status: 'UNAVAILABLE' }
>

export type ProjectBrainBindingRemoveResult = Readonly<
  | { status: 'FOUND'; value: undefined }
  | { status: 'DENIED' }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT' }
  | { status: 'STALE' }
  | { status: 'INVALID' }
  | { status: 'UNAVAILABLE' }
>

export type ProjectBrainBindingContext = Readonly<{
  projectId: string
  workspaceId: string
  sourceRevision: string
  connectionPermitted: boolean
}>

export type ProjectBrainBindingProjectPort = Readonly<{
  getBindingContext(input: Readonly<{
    accountId: string
    projectId: string
  }>): Promise<ProjectBrainBindingContext | null>
}>

export type ProjectBrainBindingReadPort = Readonly<{
  getCurrent(input: Readonly<{
    accountId: string
    projectId: string
  }>): Promise<ProjectBrainBindingCurrent | null>
}>

export type ProjectBrainBindingRegistryPort = Readonly<{
  getRevision(input: Readonly<{
    workspaceId: string
    brainRevisionId: string
  }>): Promise<Readonly<{
    brainRevisionId: string
    brainDigest: string
    payload: unknown
  }> | null>
}>

export type ProjectBrainBindingAttester = Readonly<{
  persist(input: Readonly<{
    bindingValidationId: string
    projectId: string
    brainRevisionId: string
    brainDigest: string
    projectBindingDigest: string
    candidate: unknown
  }>): Promise<void>
}>

export type ProjectBrainBindingRecovery = Readonly<{
  reconcile(accountId: string, projectId: string): Promise<void>
  executeBrain(input: Readonly<{
    accountId: string
    projectId: string
    brainRevisionId: string
    brainDigest: string
    expectedCurrent: Readonly<{ state: 'ABSENT' } | { state: 'PRESENT'; projectBindingDigest: string }>
    candidate: unknown
    projectBindingDigest: string
    bindingValidationId: string
  }>): Promise<Readonly<{
    state: string
    terminal_result: unknown
    refusal_code: string | null
  }>>
  executeBrainRemoval(input: Readonly<{
    accountId: string
    projectId: string
    expectedCurrent: Readonly<{ state: 'PRESENT'; projectBindingDigest: string }>
  }>): Promise<Readonly<{
    state: string
    terminal_result: unknown
    refusal_code: string | null
  }>>
}>

export type ProjectBrainBindingStore = Readonly<{
  get(input: Readonly<{ accountId: string; projectId: string }>): Promise<ProjectBrainBindingReadResult>
  set(input: Readonly<{
    accountId: string
    projectId: string
    brainRevisionId: string
    expectedCurrent: Readonly<{ state: 'ABSENT' } | { state: 'PRESENT'; representationDigest: string }>
  }>): Promise<ProjectBrainBindingSetResult>
  remove(input: Readonly<{
    accountId: string
    projectId: string
    expectedCurrent: Readonly<{ state: 'PRESENT'; representationDigest: string }>
  }>): Promise<ProjectBrainBindingRemoveResult>
}>

const databaseCode = (error: unknown): string | undefined => error && typeof error === 'object' &&
  'code' in error && typeof error.code === 'string' ? error.code : undefined
const errorText = (error: unknown): string => error instanceof Error ? error.message : ''
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const sourceRevision = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)

const failure = (error: unknown): ProjectBrainBindingSetResult | ProjectBrainBindingReadResult | ProjectBrainBindingRemoveResult => {
  const code = databaseCode(error)
  const message = errorText(error)
  if (code === '42501' || message.includes('DENIED')) return { status: 'DENIED' }
  if (code === 'P0002' || message.includes('NOT_FOUND')) return { status: 'NOT_FOUND' }
  if (code === 'P0412' || message.includes('STALE')) return { status: 'STALE' }
  if (code === 'P0001' || code === '40001' || code === '40P01' || message.includes('CONFLICT')) {
    return { status: 'CONFLICT' }
  }
  if (code === '22023' || message.includes('REFUSED') || message.includes('ASSERTION_FAILED')) {
    return { status: 'INVALID' }
  }
  return { status: 'UNAVAILABLE' }
}

const projection = (value: unknown): ProjectBrainBinding | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).sort().join(',') !==
    'brainDigest,brainRevisionId,projectBindingDigest,updateAvailable,validationState' ||
    !uuid(candidate.brainRevisionId) || !digest(candidate.brainDigest) ||
    !digest(candidate.projectBindingDigest) || candidate.validationState !== 'VALID' ||
    typeof candidate.updateAvailable !== 'boolean') return null
  return Object.freeze({
    brainRevisionId: candidate.brainRevisionId,
    brainDigest: candidate.brainDigest,
    projectBindingDigest: candidate.projectBindingDigest,
    validationState: candidate.validationState,
    updateAvailable: candidate.updateAvailable,
  }) as ProjectBrainBinding
}

const currentProjection = (current: ProjectBrainBindingCurrent): ProjectBrainBinding => Object.freeze({
  brainRevisionId: current.brainRevisionId,
  brainDigest: current.brainDigest,
  projectBindingDigest: current.projectBindingDigest,
  validationState: current.validationState,
  updateAvailable: current.updateAvailable,
})

const validCurrent = (value: ProjectBrainBindingCurrent, projectId?: string): boolean =>
  value !== null && typeof value === 'object' &&
  (projectId === undefined || value.projectId === projectId) && uuid(value.projectId) && uuid(value.workspaceId) &&
  uuid(value.brainRevisionId) && digest(value.brainDigest) && digest(value.projectBindingDigest) &&
  value.validationState === 'VALID' && typeof value.updateAvailable === 'boolean'

const validContext = (value: ProjectBrainBindingContext, projectId: string): boolean =>
  value !== null && typeof value === 'object' && value.projectId === projectId && uuid(value.projectId) &&
  uuid(value.workspaceId) && sourceRevision(value.sourceRevision) && typeof value.connectionPermitted === 'boolean'

export const projectBrainBindingRepresentationDigest = (value: ProjectBrainBinding): string =>
  sha256(canonicalBytes(value))

export const createProjectBrainBindingStore = ({
  project,
  binding,
  registry,
  sourceSnapshot,
  validator,
  attester,
  recovery,
  mintIdentity = randomUUID,
}: Readonly<{
  project: ProjectBrainBindingProjectPort
  binding: ProjectBrainBindingReadPort
  registry: ProjectBrainBindingRegistryPort
  sourceSnapshot: ProjectSourceSnapshotFactory
  validator: ProjectBrainBindingValidator
  attester: ProjectBrainBindingAttester
  recovery: ProjectBrainBindingRecovery
  mintIdentity?: () => string
}>): ProjectBrainBindingStore => {
  const get = async ({ accountId, projectId }: Readonly<{ accountId: string; projectId: string }>): Promise<ProjectBrainBindingReadResult> => {
    try {
      const current = await binding.getCurrent({ accountId, projectId })
      if (!current) return { status: 'ABSENT' }
      if (!validCurrent(current, projectId)) return { status: 'UNAVAILABLE' }
      return { status: 'FOUND', value: currentProjection(current) }
    } catch (error) {
      return failure(error) as ProjectBrainBindingReadResult
    }
  }

  const set = async ({ accountId, projectId, brainRevisionId, expectedCurrent }: Readonly<{
    accountId: string
    projectId: string
    brainRevisionId: string
    expectedCurrent: Readonly<{ state: 'ABSENT' } | { state: 'PRESENT'; representationDigest: string }>
  }>): Promise<ProjectBrainBindingSetResult> => {
    try {
      if (!uuid(accountId) || !uuid(projectId) || !uuid(brainRevisionId) ||
        (expectedCurrent.state === 'PRESENT' && !digest(expectedCurrent.representationDigest))) {
        return { status: 'INVALID' }
      }
      await recovery.reconcile(accountId, projectId)
      const context = await project.getBindingContext({ accountId, projectId })
      if (!context) return { status: 'NOT_FOUND' }
      if (!validContext(context, projectId)) return { status: 'UNAVAILABLE' }
      const current = await binding.getCurrent({ accountId, projectId })
      if (current && !validCurrent(current, projectId)) return { status: 'UNAVAILABLE' }
      if (expectedCurrent.state === 'ABSENT' ? current !== null : current === null) return { status: 'STALE' }
      let recoveryExpected: Readonly<{ state: 'ABSENT' } | { state: 'PRESENT'; projectBindingDigest: string }> =
        { state: 'ABSENT' }
      if (expectedCurrent.state === 'PRESENT' && current) {
        const currentValue = currentProjection(current)
        if (projectBrainBindingRepresentationDigest(currentValue) !== expectedCurrent.representationDigest) {
          return { status: 'STALE' }
        }
        recoveryExpected = { state: 'PRESENT', projectBindingDigest: current.projectBindingDigest }
      }
      const revision = await registry.getRevision({ workspaceId: context.workspaceId, brainRevisionId })
      if (!revision || revision.brainRevisionId !== brainRevisionId || !uuid(revision.brainRevisionId) ||
        !digest(revision.brainDigest)) {
        return { status: 'NOT_FOUND' }
      }
      const realization = await readProjectBrainRealization({
        source: sourceSnapshot({ projectId, sourceRevision: context.sourceRevision }),
        expectedSourceRevision: context.sourceRevision,
        brainSource: revision.payload,
      })
      if (realization.requiredAssertions.length > 0) {
        // Source reads can outlive an IAM grant. Refresh the compound Project
        // admission immediately before the validator can execute physical proof.
        const proofContext = await project.getBindingContext({ accountId, projectId })
        if (!proofContext) return { status: 'NOT_FOUND' }
        if (!validContext(proofContext, projectId)) return { status: 'UNAVAILABLE' }
        if (proofContext.workspaceId !== context.workspaceId || proofContext.sourceRevision !== context.sourceRevision) {
          return { status: 'STALE' }
        }
        if (!proofContext.connectionPermitted) return { status: 'DENIED' }
      }
      const validated = await validator.validate({
        accountId,
        projectId,
        workspaceId: context.workspaceId,
        brainRevisionId,
        brainDigest: revision.brainDigest,
        brainSource: revision.payload,
        realization,
      })
      if (validated.status !== 'VALIDATED') {
        if (validated.status === 'INDETERMINATE') return { status: 'UNAVAILABLE' }
        return { status: 'INVALID' }
      }
      const preSettlement = await binding.getCurrent({ accountId, projectId })
      if (expectedCurrent.state === 'ABSENT') {
        if (preSettlement !== null) return { status: 'STALE' }
      } else {
        if (!preSettlement || !validCurrent(preSettlement, projectId) ||
          projectBrainBindingRepresentationDigest(currentProjection(preSettlement)) !== expectedCurrent.representationDigest) {
          return { status: 'STALE' }
        }
      }
      const bindingValidationId = mintIdentity()
      if (!uuid(bindingValidationId)) return { status: 'UNAVAILABLE' }
      await attester.persist({
        bindingValidationId,
        projectId,
        brainRevisionId,
        brainDigest: revision.brainDigest,
        projectBindingDigest: validated.projectBindingDigest,
        candidate: validated.candidate,
      })
      const settled = await recovery.executeBrain({
        accountId,
        projectId,
        brainRevisionId,
        brainDigest: revision.brainDigest,
        expectedCurrent: recoveryExpected,
        candidate: validated.candidate,
        projectBindingDigest: validated.projectBindingDigest,
        bindingValidationId,
      })
      const settledResult = projection(settled.terminal_result)
      if (settled.state !== 'COMPLETED' || !settledResult) {
        if (settled.state === 'ABORTED') return failure({ code: settled.refusal_code ?? 'P0001' }) as ProjectBrainBindingSetResult
        return { status: 'UNAVAILABLE' }
      }
      const latest = await binding.getCurrent({ accountId, projectId })
      if (!latest || !validCurrent(latest, projectId) || latest.brainRevisionId !== settledResult.brainRevisionId ||
        latest.projectBindingDigest !== settledResult.projectBindingDigest) return { status: 'UNAVAILABLE' }
      return {
        status: 'FOUND',
        value: currentProjection(latest),
        created: expectedCurrent.state === 'ABSENT',
      }
    } catch (error) {
      return failure(error) as ProjectBrainBindingSetResult
    }
  }

  const remove = async ({ accountId, projectId, expectedCurrent }: Readonly<{
    accountId: string
    projectId: string
    expectedCurrent: Readonly<{ state: 'PRESENT'; representationDigest: string }>
  }>): Promise<ProjectBrainBindingRemoveResult> => {
    try {
      if (!uuid(accountId) || !uuid(projectId) || !digest(expectedCurrent.representationDigest)) {
        return { status: 'INVALID' }
      }
      await recovery.reconcile(accountId, projectId)
      const current = await binding.getCurrent({ accountId, projectId })
      if (!current) return { status: 'STALE' }
      if (!validCurrent(current, projectId)) return { status: 'UNAVAILABLE' }
      const currentValue = currentProjection(current)
      if (projectBrainBindingRepresentationDigest(currentValue) !== expectedCurrent.representationDigest) {
        return { status: 'STALE' }
      }
      const settled = await recovery.executeBrainRemoval({
        accountId,
        projectId,
        expectedCurrent: {
          state: 'PRESENT',
          projectBindingDigest: current.projectBindingDigest,
        },
      })
      if (settled.state === 'ABORTED') return failure({ code: settled.refusal_code ?? 'P0001' }) as ProjectBrainBindingRemoveResult
      if (settled.state !== 'COMPLETED' || settled.terminal_result !== null) return { status: 'UNAVAILABLE' }
      return { status: 'FOUND', value: undefined }
    } catch (error) {
      return failure(error) as ProjectBrainBindingRemoveResult
    }
  }

  return Object.freeze({ get, set, remove })
}
