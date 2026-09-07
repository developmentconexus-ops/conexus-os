import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { S3_GENERATED_ROUTES } from '../generated/s3-routes.js'
import type {
  Prj01Params,
  Prj02Params,
  Prj03Body,
  Prj03Params,
  Prj07Body,
  Prj07Params,
  Prj08Params,
  Prj09Body,
  Prj09Params,
  Prj23Params,
  Prj24Body,
  Prj24Params,
} from '../generated/s3-routes.js'
import { R2_GENERATED_ROUTES } from '../generated/r2-routes.js'
import type {
  R2HubPRJ10Contract,
  R2HubPRJ11Contract,
  R2HubPRJ12Contract,
  R2HubPRJ13Contract,
  R2HubPRJ14Contract,
  R2HubPRJ15Contract,
} from '../generated/r2-routes.js'
import { sendProblem } from '../http/problem.js'
import { projectErrorCode } from './errors.js'
import type { ProjectBaselineExplanationService } from './explanation.js'
import type { ProjectInceptionService } from './inception.js'
import type { ProjectBindingResult, ProjectConnectionBindingStore, ProjectStore } from './store.js'
import type {
  ProjectBrainBindingSetResult,
  ProjectBrainBindingRemoveResult,
  ProjectBrainBindingStore,
} from './brain-binding.js'
import { projectBrainBindingRepresentationDigest } from './brain-binding.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const driverCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : ''

export type ProjectSession = Readonly<{ account: Readonly<{ accountId: string }> }>
export type ResolveProjectSession = (request: FastifyRequest, requireCsrf?: boolean) => Promise<ProjectSession | null>

export const registerProjectRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    store: ProjectStore
    inception: ProjectInceptionService
    explanation: ProjectBaselineExplanationService
    resolveCurrentSession: ResolveProjectSession
    origin: string
  }>,
): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03' | 'PRJ-07' | 'PRJ-08' | 'PRJ-09' | 'PRJ-23' | 'PRJ-24')[]> => {
  app.route<{ Params: Prj01Params }>({
    ...S3_GENERATED_ROUTES['PRJ-01'],
    handler: async (request, reply) => {
      const current = await dependencies.resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        return await dependencies.store.listProjects({
          accountId: current.account.accountId,
          workspaceId: request.params.workspaceId,
        })
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })

  app.route<{ Params: Prj02Params }>({
    ...S3_GENERATED_ROUTES['PRJ-02'],
    handler: async (request, reply) => {
      const current = await dependencies.resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        const project = await dependencies.store.getProject({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
        })
        if (!project) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
        return project
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'project-not-found', 'Project not found')
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })

  app.route<{ Params: Prj23Params }>({
    ...S3_GENERATED_ROUTES['PRJ-23'],
    handler: async (request, reply) => {
      const current = await dependencies.resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        const candidate = await dependencies.store.getBaselineCandidate({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          candidateBaselineDigest: request.params.candidateBaselineDigest,
        })
        if (!candidate) return sendProblem(reply, 404, 'baseline-candidate-not-found', 'Baseline candidate not found')
        return candidate
      } catch (error) {
        if (driverCode(error) === '22P02') {
          return sendProblem(reply, 404, 'baseline-candidate-not-found', 'Baseline candidate not found')
        }
        return sendProblem(reply, 503, 'baseline-candidate-unavailable', 'Baseline candidate unavailable')
      }
    },
  })

  app.route<{ Params: Prj07Params; Body: Prj07Body }>({
    ...S3_GENERATED_ROUTES['PRJ-07'],
    handler: async (request, reply) => {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const current = await dependencies.resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) return sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
      try {
        return await dependencies.inception.run({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          idempotencyKey,
          body: request.body,
        })
      } catch (error) {
        const message = errorMessage(error)
        if (message.includes('PRJ07_NOT_AUTHORIZED')) return sendProblem(reply, 403, 'project-inception-denied', 'Project Inception denied')
        if (message.includes('PRJ07_PRIOR_CANDIDATE_NOT_FOUND') || driverCode(error) === '22P02') {
          return sendProblem(reply, 404, 'project-inception-subject-not-found', 'Project Inception subject not found')
        }
        if (message.includes('PRJ07_IDEMPOTENCY_CONFLICT') || message.includes('PRJ07_IN_PROGRESS') || message.includes('PRJ07_BINDING_SOURCE_CONFLICT') ||
          message.includes('PRJ07_OUTCOME_UNKNOWN') || message.includes('PRJ07_SOURCE_STALE') ||
          message.includes('PRJ07_PRIOR_CANDIDATE_STALE')) {
          return sendProblem(reply, 409, 'project-inception-conflict', 'Project Inception conflict')
        }
        if (message.includes('PRJ07_REFINEMENT_INPUT_REFUSED') || message.includes('PRJ07_REFINEMENT_NO_CHANGE') ||
          message.includes('PROJECT_MODEL_REFINEMENT_INPUT_REFUSED')) {
          return sendProblem(reply, 422, 'project-inception-refinement-refused', 'Project Inception refinement refused')
        }
        if (message.includes('PROJECT_SOURCE_UNSUPPORTED')) {
          return sendProblem(reply, 422, 'project-source-unsupported', 'Project source unsupported')
        }
        return sendProblem(reply, 503, 'project-inception-unavailable', 'Project Inception unavailable')
      }
    },
  })

  app.route<{ Params: Prj24Params; Body: Prj24Body }>({
    ...S3_GENERATED_ROUTES['PRJ-24'],
    handler: async (request, reply) => {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const current = await dependencies.resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        return await dependencies.explanation.run({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          candidateBaselineDigest: request.params.candidateBaselineDigest,
          body: request.body,
        })
      } catch (error) {
        const message = errorMessage(error)
        if (message.includes('PRJ24_CANDIDATE_NOT_FOUND') || driverCode(error) === '22P02') {
          return sendProblem(reply, 404, 'baseline-candidate-not-found', 'Baseline candidate not found')
        }
        return sendProblem(reply, 422, 'baseline-explanation-refused', 'Baseline explanation refused')
      }
    },
  })

  app.route<{ Params: Prj08Params }>({
    ...S3_GENERATED_ROUTES['PRJ-08'],
    handler: async (request, reply) => {
      const current = await dependencies.resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        const baseline = await dependencies.store.getApprovedBaseline({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
        })
        if (!baseline) return sendProblem(reply, 404, 'approved-baseline-not-found', 'Approved Baseline not found')
        return baseline
      } catch (error) {
        if (driverCode(error) === '22P02') {
          return sendProblem(reply, 404, 'approved-baseline-not-found', 'Approved Baseline not found')
        }
        return sendProblem(reply, 503, 'approved-baseline-unavailable', 'Approved Baseline unavailable')
      }
    },
  })

  app.route<{ Params: Prj09Params; Body: Prj09Body }>({
    ...S3_GENERATED_ROUTES['PRJ-09'],
    handler: async (request, reply) => {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const current = await dependencies.resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        return await dependencies.store.approveBaseline({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          candidateBaselineDigest: request.body.candidateBaselineDigest,
        })
      } catch (error) {
        const message = errorMessage(error)
        if (message.includes('PRJ09_APPROVAL_NOT_AUTHORIZED')) {
          return sendProblem(reply, 403, 'baseline-approval-denied', 'Baseline approval denied')
        }
        if (message.includes('PRJ09_CANDIDATE_NOT_FOUND') || driverCode(error) === '22P02') {
          return sendProblem(reply, 404, 'baseline-candidate-not-found', 'Baseline candidate not found')
        }
        if (message.includes('PRJ09_STALE_CANDIDATE')) {
          return sendProblem(reply, 412, 'baseline-candidate-stale', 'Baseline candidate is no longer current')
        }
        if (message.includes('PRJ09_OUTCOME_UNKNOWN')) {
          return sendProblem(reply, 409, 'baseline-approval-conflict', 'Baseline approval outcome is unknown')
        }
        return sendProblem(reply, 503, 'baseline-approval-unavailable', 'Baseline approval unavailable')
      }
    },
  })

  app.route<{ Params: Prj03Params; Body: Prj03Body }>({
    ...S3_GENERATED_ROUTES['PRJ-03'],
    handler: async (request, reply) => {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const current = await dependencies.resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) return sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
      try {
        const { replayed: _replayed, ...body } = await dependencies.store.createProject({
          accountId: current.account.accountId,
          workspaceId: request.params.workspaceId,
          idempotencyKey,
          body: request.body,
        })
        return reply.code(201).send(body)
      } catch (error) {
        const code = projectErrorCode(error)
        if (code === 'AUTHORIZATION_DENIED') return sendProblem(reply, 403, 'project-create-denied', 'Project creation denied')
        if (code === 'SOURCE_INPUT_REFUSED') return sendProblem(reply, 422, 'project-source-refused', 'Project source refused')
        if (code === 'RECOVERY_REFUSED' || code === 'SOURCE_DEPENDENCY_REFUSED') {
          return sendProblem(reply, 503, 'project-source-unavailable', 'Project source unavailable')
        }
        if (code === 'IDEMPOTENCY_CONFLICT' || code === 'OUTCOME_UNKNOWN' || code === 'SOURCE_CONFLICT') {
          return sendProblem(reply, 409, 'project-create-conflict', 'Project creation conflict')
        }
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })
  return ['PRJ-01', 'PRJ-02', 'PRJ-03', 'PRJ-07', 'PRJ-08', 'PRJ-09', 'PRJ-23', 'PRJ-24']
}

const projectBindingUnavailable = (reply: FastifyReply): FastifyReply => sendProblem(
  reply,
  503,
  'project-connection-binding-unavailable',
  'Project connection binding unavailable',
)

const projectBindingNotFound = (reply: FastifyReply): FastifyReply => sendProblem(
  reply,
  404,
  'project-connection-binding-not-found',
  'Project connection binding not found',
)

const authenticateProjectBindingCommand = async (
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Readonly<{ resolveCurrentSession: ResolveProjectSession; origin: string }>,
): Promise<ProjectSession | null> => {
  try {
    const csrf = header(request.headers['x-conexus-csrf'])
    if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
      sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      return null
    }
    const current = await dependencies.resolveCurrentSession(request, true)
    if (!current) sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    return current
  } catch (error) {
    if (driverCode(error) === '22P02') projectBindingNotFound(reply)
    else projectBindingUnavailable(reply)
    return null
  }
}

const authenticateProjectBindingRead = async (
  request: FastifyRequest,
  reply: FastifyReply,
  resolveCurrentSession: ResolveProjectSession,
): Promise<ProjectSession | null> => {
  try {
    const current = await resolveCurrentSession(request)
    if (!current) sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    return current
  } catch (error) {
    if (driverCode(error) === '22P02') projectBindingNotFound(reply)
    else projectBindingUnavailable(reply)
    return null
  }
}

const respondProjectBindingRead = <T>(
  reply: FastifyReply,
  result: ProjectBindingResult<T>,
): T | FastifyReply => {
  if (result.status === 'FOUND') return result.value
  if (result.status === 'DENIED') return sendProblem(reply, 403, 'project-connection-binding-denied', 'Project connection binding access denied')
  if (result.status === 'NOT_FOUND') return projectBindingNotFound(reply)
  if (result.status === 'UNAVAILABLE') return projectBindingUnavailable(reply)
  return projectBindingUnavailable(reply)
}

const respondProjectBindingSet = (
  reply: FastifyReply,
  result: ProjectBindingResult<R2HubPRJ14Contract['responses']['200']>,
): FastifyReply => {
  if (result.status === 'FOUND') return reply.code(200).send(result.value)
  if (result.status === 'DENIED') return sendProblem(reply, 403, 'project-connection-binding-denied', 'Project connection binding command denied')
  if (result.status === 'NOT_FOUND') return projectBindingNotFound(reply)
  if (result.status === 'CONFLICT') return sendProblem(reply, 409, 'project-connection-binding-conflict', 'Project connection binding conflict')
  if (result.status === 'STALE') return sendProblem(reply, 412, 'project-connection-binding-stale', 'Project connection binding is no longer current')
  if (result.status === 'INVALID') return sendProblem(reply, 422, 'project-connection-binding-invalid', 'Project connection binding input refused')
  return projectBindingUnavailable(reply)
}

const respondProjectBindingRemove = (
  reply: FastifyReply,
  result: ProjectBindingResult<undefined>,
): FastifyReply => {
  if (result.status === 'FOUND') return reply.code(204).send()
  if (result.status === 'DENIED') return sendProblem(reply, 403, 'project-connection-binding-denied', 'Project connection binding command denied')
  if (result.status === 'NOT_FOUND') return projectBindingNotFound(reply)
  if (result.status === 'CONFLICT') return sendProblem(reply, 409, 'project-connection-binding-conflict', 'Project connection binding conflict')
  if (result.status === 'STALE' || result.status === 'INVALID') return sendProblem(reply, 412, 'project-connection-binding-stale', 'Project connection binding is no longer current')
  return projectBindingUnavailable(reply)
}

export const registerProjectConnectionBindingRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    store: ProjectConnectionBindingStore
    resolveCurrentSession: ResolveProjectSession
    origin: string
  }>,
): Promise<readonly ('PRJ-13' | 'PRJ-14' | 'PRJ-15')[]> => {
  app.route<{ Params: R2HubPRJ13Contract['params'] }>({
    ...R2_GENERATED_ROUTES['PRJ-13'],
    handler: async (request, reply) => {
      const current = await authenticateProjectBindingRead(request, reply, dependencies.resolveCurrentSession)
      if (!current) return reply
      try {
        return respondProjectBindingRead(reply, await dependencies.store.listConnectionBindings({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return projectBindingNotFound(reply)
        return projectBindingUnavailable(reply)
      }
    },
  })

  app.route<{ Params: R2HubPRJ14Contract['params']; Body: R2HubPRJ14Contract['body'] }>({
    ...R2_GENERATED_ROUTES['PRJ-14'],
    handler: async (request, reply) => {
      const current = await authenticateProjectBindingCommand(request, reply, dependencies)
      if (!current) return reply
      try {
        return respondProjectBindingSet(reply, await dependencies.store.setConnectionBinding({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          body: request.body,
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return projectBindingNotFound(reply)
        return projectBindingUnavailable(reply)
      }
    },
  })

  app.route<{ Params: R2HubPRJ15Contract['params']; Body: R2HubPRJ15Contract['body'] }>({
    ...R2_GENERATED_ROUTES['PRJ-15'],
    handler: async (request, reply) => {
      const current = await authenticateProjectBindingCommand(request, reply, dependencies)
      if (!current) return reply
      try {
        return respondProjectBindingRemove(reply, await dependencies.store.removeConnectionBinding({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          body: request.body,
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return projectBindingNotFound(reply)
        return projectBindingUnavailable(reply)
      }
    },
  })

  return ['PRJ-13', 'PRJ-14', 'PRJ-15']
}

const projectBrainBindingNotFound = (reply: FastifyReply): FastifyReply => sendProblem(
  reply,
  404,
  'project-brain-binding-not-found',
  'Project Brain binding not found',
)

const projectBrainBindingUnavailable = (reply: FastifyReply): FastifyReply => sendProblem(
  reply,
  503,
  'project-brain-binding-unavailable',
  'Project Brain binding unavailable',
)

const respondProjectBrainBindingSet = (
  reply: FastifyReply,
  result: ProjectBrainBindingSetResult,
): FastifyReply => {
  if (result.status === 'FOUND') {
    return reply.code(result.created ? 201 : 200)
      .header('etag', `"${projectBrainBindingRepresentationDigest(result.value)}"`)
      .send(result.value)
  }
  if (result.status === 'DENIED') return sendProblem(reply, 403, 'project-brain-binding-denied', 'Project Brain binding command denied')
  if (result.status === 'NOT_FOUND') return projectBrainBindingNotFound(reply)
  if (result.status === 'CONFLICT') return sendProblem(reply, 409, 'project-brain-binding-conflict', 'Project Brain binding conflict')
  if (result.status === 'STALE') return sendProblem(reply, 412, 'project-brain-binding-stale', 'Project Brain binding is no longer current')
  if (result.status === 'INVALID') return sendProblem(reply, 422, 'project-brain-binding-invalid', 'Project Brain binding input refused')
  return projectBrainBindingUnavailable(reply)
}

const respondProjectBrainBindingRemove = (
  reply: FastifyReply,
  result: ProjectBrainBindingRemoveResult,
): FastifyReply => {
  if (result.status === 'FOUND') return reply.code(204).send()
  if (result.status === 'DENIED') return sendProblem(reply, 403, 'project-brain-binding-denied', 'Project Brain binding command denied')
  if (result.status === 'NOT_FOUND') return projectBrainBindingNotFound(reply)
  if (result.status === 'CONFLICT') return sendProblem(reply, 409, 'project-brain-binding-conflict', 'Project Brain binding conflict')
  if (result.status === 'STALE' || result.status === 'INVALID') {
    return sendProblem(reply, 412, 'project-brain-binding-stale', 'Project Brain binding is no longer current')
  }
  return projectBrainBindingUnavailable(reply)
}

const brainBindingExpectedCurrent = (
  request: FastifyRequest,
): Readonly<{ state: 'ABSENT' } | { state: 'PRESENT'; representationDigest: string }> | null => {
  const ifMatch = header(request.headers['if-match'])
  const ifNoneMatch = header(request.headers['if-none-match'])
  if ((ifMatch === undefined) === (ifNoneMatch === undefined)) return null
  if (ifNoneMatch !== undefined) return ifNoneMatch === '*' ? { state: 'ABSENT' } : null
  const match = ifMatch?.match(/^"([0-9a-f]{64})"$/)
  return match?.[1] ? { state: 'PRESENT', representationDigest: match[1] } : null
}

export const registerProjectBrainBindingRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    store: ProjectBrainBindingStore
    resolveCurrentSession: ResolveProjectSession
    origin: string
  }>,
): Promise<readonly ('PRJ-10' | 'PRJ-11' | 'PRJ-12')[]> => {
  app.route<{ Params: R2HubPRJ10Contract['params'] }>({
    ...R2_GENERATED_ROUTES['PRJ-10'],
    handler: async (request, reply) => {
      const current = await authenticateProjectBindingRead(request, reply, dependencies.resolveCurrentSession)
      if (!current) return reply
      try {
        const result = await dependencies.store.get({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
        })
        if (result.status === 'FOUND') {
          return reply.header('etag', `"${projectBrainBindingRepresentationDigest(result.value)}"`).send(result.value)
        }
        if (result.status === 'DENIED') return sendProblem(reply, 403, 'project-brain-binding-denied', 'Project Brain binding access denied')
        if (result.status === 'ABSENT' || result.status === 'NOT_FOUND') return projectBrainBindingNotFound(reply)
        return projectBrainBindingUnavailable(reply)
      } catch (error) {
        if (driverCode(error) === '22P02') return projectBrainBindingNotFound(reply)
        return projectBrainBindingUnavailable(reply)
      }
    },
  })

  app.route<{ Params: R2HubPRJ11Contract['params']; Headers: R2HubPRJ11Contract['headers']; Body: R2HubPRJ11Contract['body'] }>({
    ...R2_GENERATED_ROUTES['PRJ-11'],
    preValidation: async (request, reply) => {
      const ifNoneMatch = header(request.headers['if-none-match'])
      if (ifNoneMatch !== undefined && ifNoneMatch !== '*') {
        sendProblem(reply, 422, 'project-brain-binding-precondition-invalid', 'Exactly one valid Brain binding precondition is required')
      }
    },
    handler: async (request, reply) => {
      const current = await authenticateProjectBindingCommand(request, reply, dependencies)
      if (!current) return reply
      const expectedCurrent = brainBindingExpectedCurrent(request)
      if (!expectedCurrent) return sendProblem(reply, 422, 'project-brain-binding-precondition-invalid', 'Exactly one valid Brain binding precondition is required')
      try {
        return respondProjectBrainBindingSet(reply, await dependencies.store.set({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          brainRevisionId: request.body.brainRevisionId,
          expectedCurrent,
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return projectBrainBindingNotFound(reply)
        return projectBrainBindingUnavailable(reply)
      }
    },
  })

  app.route<{ Params: R2HubPRJ12Contract['params']; Headers: R2HubPRJ12Contract['headers'] }>({
    ...R2_GENERATED_ROUTES['PRJ-12'],
    handler: async (request, reply) => {
      const current = await authenticateProjectBindingCommand(request, reply, dependencies)
      if (!current) return reply
      const ifMatch = header(request.headers['if-match'])
      const match = ifMatch?.match(/^"([0-9a-f]{64})"$/)
      if (!match?.[1]) return sendProblem(reply, 412, 'project-brain-binding-stale', 'Project Brain binding is no longer current')
      try {
        return respondProjectBrainBindingRemove(reply, await dependencies.store.remove({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          expectedCurrent: { state: 'PRESENT', representationDigest: match[1] },
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return projectBrainBindingNotFound(reply)
        return projectBrainBindingUnavailable(reply)
      }
    },
  })

  return ['PRJ-10', 'PRJ-11', 'PRJ-12']
}
