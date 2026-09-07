import type { FastifyInstance, FastifyRequest } from 'fastify'
import { R2_GENERATED_ROUTES } from '../generated/r2-routes.js'
import type { R2HubBRN01Contract, R2HubBRN02Contract, R2HubBRN03Contract, R2HubBRN10Contract } from '../generated/r2-routes.js'
import { sendProblem } from '../http/problem.js'
import type { BrainStore } from './store.js'
import type { BrainReadResult } from './store.js'

export type BrainSession = Readonly<{ account: Readonly<{ accountId: string }> }>
export type ResolveBrainSession = (request: FastifyRequest) => Promise<BrainSession | null>

const driverCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

const respond = <T>(reply: Parameters<typeof sendProblem>[0], result: BrainReadResult<T>, serviceUnavailable = false) => {
  if (result.status === 'DENIED') return sendProblem(reply, 403, 'brain-read-required', 'Brain read required')
  if (result.status === 'NOT_FOUND') return sendProblem(reply, 404, 'brain-not-found', 'Brain not found')
  if (result.status === 'UNAVAILABLE') {
    if (serviceUnavailable) return sendProblem(reply, 503, 'brain-unavailable', 'Brain unavailable')
    throw new Error('BRAIN_PROJECTION_INVALID')
  }
  return result.value
}

const respondSelection = <T>(reply: Parameters<typeof sendProblem>[0], result: BrainReadResult<T>) => {
  if (result.status === 'DENIED') {
    return sendProblem(reply, 403, 'brain-binding-selection-required', 'Brain binding selection required')
  }
  return respond(reply, result)
}

export const registerBrainRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: BrainStore
  resolveCurrentSession: ResolveBrainSession
}>): Promise<readonly ('BRN-01' | 'BRN-02' | 'BRN-03' | 'BRN-10')[]> => {
  const current = async (request: FastifyRequest, reply: Parameters<typeof sendProblem>[0]) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    return session
  }

  app.route<{ Params: R2HubBRN01Contract['params'] }>({
    ...R2_GENERATED_ROUTES['BRN-01'],
    handler: async (request, reply) => {
      const session = await current(request, reply)
      if (!session) return reply
      try {
        return respond(reply, await dependencies.store.getWorkspaceBrain({ accountId: session.account.accountId, workspaceId: request.params.workspaceId }))
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'brain-not-found', 'Brain not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubBRN02Contract['params']; Querystring: R2HubBRN02Contract['querystring'] }>({
    ...R2_GENERATED_ROUTES['BRN-02'],
    handler: async (request, reply) => {
      const session = await current(request, reply)
      if (!session) return reply
      try {
        if (request.query.forProjectId) {
          return respondSelection(reply, await dependencies.store.listBrainRevisionsForProject({
            accountId: session.account.accountId,
            workspaceId: request.params.workspaceId,
            projectId: request.query.forProjectId,
          }))
        }
        return respond(reply, await dependencies.store.listBrainRevisions({ accountId: session.account.accountId, workspaceId: request.params.workspaceId }))
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'brain-not-found', 'Brain not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubBRN03Contract['params'] }>({
    ...R2_GENERATED_ROUTES['BRN-03'],
    handler: async (request, reply) => {
      const session = await current(request, reply)
      if (!session) return reply
      try {
        return respond(reply, await dependencies.store.getBrainRevision({
          accountId: session.account.accountId,
          workspaceId: request.params.workspaceId,
          brainRevisionId: request.params.brainRevisionId,
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'brain-not-found', 'Brain not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubBRN10Contract['params'] }>({
    ...R2_GENERATED_ROUTES['BRN-10'],
    handler: async (request, reply) => {
      const session = await current(request, reply)
      if (!session) return reply
      try {
        return respond(reply, await dependencies.store.getBrainHealth({ accountId: session.account.accountId, workspaceId: request.params.workspaceId }), true)
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'brain-not-found', 'Brain not found')
        throw error
      }
    },
  })

  return ['BRN-01', 'BRN-02', 'BRN-03', 'BRN-10']
}
