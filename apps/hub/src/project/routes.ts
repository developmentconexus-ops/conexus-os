import type { FastifyInstance, FastifyRequest } from 'fastify'
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
import { sendProblem } from '../http/problem.js'
import { projectErrorCode } from './errors.js'
import type { ProjectBaselineExplanationService } from './explanation.js'
import type { ProjectInceptionService } from './inception.js'
import type { ProjectStore } from './store.js'

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
        if (message.includes('PRJ07_IDEMPOTENCY_CONFLICT') || message.includes('PRJ07_IN_PROGRESS') ||
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
