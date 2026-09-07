import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { R2_GENERATED_ROUTES } from '../generated/r2-routes.js'
import type {
  R2HubCON02Contract,
  R2HubCON03Contract,
  R2HubCON04Contract,
  R2HubCON05Contract,
  R2HubCON06Contract,
  R2HubCON07Contract,
  R2HubCON08Contract,
  R2HubCON09Contract,
} from '../generated/r2-routes.js'
import { sendProblem } from '../http/problem.js'
import type { ConnectionResult, ConnectionStore } from './store.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const driverCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

export type ConnectionSession = Readonly<{ account: Readonly<{ accountId: string }> }>
export type ResolveConnectionSession = (
  request: FastifyRequest,
  requireCsrf?: boolean,
) => Promise<ConnectionSession | null>

export type ConnectionOwnerId =
  | 'CON-01'
  | 'CON-02'
  | 'CON-03'
  | 'CON-04'
  | 'CON-05'
  | 'CON-06'
  | 'CON-07'
  | 'CON-08'
  | 'CON-09'

const readResult = <T>(reply: FastifyReply, result: ConnectionResult<T>): T | FastifyReply => {
  if (result.status === 'FOUND') return result.value
  if (result.status === 'DENIED') return sendProblem(reply, 403, 'connection-access-denied', 'Connection access denied')
  if (result.status === 'NOT_FOUND') return sendProblem(reply, 404, 'connection-not-found', 'Connection not found')
  throw new Error(`CONNECTION_READ_RESULT_${result.status}`)
}

const commandProblem = (reply: FastifyReply, result: ConnectionResult<unknown>, unavailable = false): FastifyReply => {
  if (result.status === 'DENIED') return sendProblem(reply, 403, 'connection-command-denied', 'Connection command denied')
  if (result.status === 'NOT_FOUND') return sendProblem(reply, 404, 'connection-not-found', 'Connection not found')
  if (result.status === 'CONFLICT') return sendProblem(reply, 409, 'connection-conflict', 'Connection conflict')
  if (result.status === 'STALE') return sendProblem(reply, 412, 'connection-revision-stale', 'Connection revision is no longer current')
  if (result.status === 'INVALID') return sendProblem(reply, 422, 'connection-input-refused', 'Connection input refused')
  if (result.status === 'UNAVAILABLE' && unavailable) {
    return sendProblem(reply, 503, 'connection-dependency-unavailable', 'Connection dependency unavailable')
  }
  throw new Error(`CONNECTION_COMMAND_RESULT_${result.status}`)
}

const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply,
  resolveCurrentSession: ResolveConnectionSession,
  requireCsrf = false,
): Promise<ConnectionSession | null> => {
  const session = await resolveCurrentSession(request, requireCsrf)
  if (!session) sendProblem(reply, 401, 'authentication-required', 'Authentication required')
  return session
}

const authenticCommand = async (
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Readonly<{ origin: string; resolveCurrentSession: ResolveConnectionSession }>,
): Promise<ConnectionSession | null> => {
  const csrf = header(request.headers['x-conexus-csrf'])
  if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
    sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
    return null
  }
  return authenticate(request, reply, dependencies.resolveCurrentSession, true)
}

const idempotencyKey = (request: FastifyRequest, reply: FastifyReply): string | null => {
  const value = header(request.headers['idempotency-key'])
  if (!value) {
    sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
    return null
  }
  return value
}

export const registerConnectionRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    store: ConnectionStore
    resolveCurrentSession: ResolveConnectionSession
    origin: string
  }>,
): Promise<readonly ConnectionOwnerId[]> => {
  app.route({
    ...R2_GENERATED_ROUTES['CON-01'],
    handler: async (request, reply) => {
      const session = await authenticate(request, reply, dependencies.resolveCurrentSession)
      if (!session) return reply
      return readResult(reply, await dependencies.store.listConnectorDefinitions({ accountId: session.account.accountId }))
    },
  })

  app.route<{ Params: R2HubCON02Contract['params'] }>({
    ...R2_GENERATED_ROUTES['CON-02'],
    handler: async (request, reply) => {
      const session = await authenticate(request, reply, dependencies.resolveCurrentSession)
      if (!session) return reply
      return readResult(reply, await dependencies.store.getConnectorDefinition({
        accountId: session.account.accountId,
        connectorDefinitionId: request.params.connectorDefinitionId,
      }))
    },
  })

  app.route<{ Params: R2HubCON03Contract['params']; Querystring: R2HubCON03Contract['querystring'] }>({
    ...R2_GENERATED_ROUTES['CON-03'],
    handler: async (request, reply) => {
      const session = await authenticate(request, reply, dependencies.resolveCurrentSession)
      if (!session) return reply
      try {
        return readResult(reply, await dependencies.store.listConnections({
          accountId: session.account.accountId,
          ownerScopeKind: request.params.ownerScopeKind,
          ownerId: request.params.ownerId,
          ...(request.query.forProjectId ? { forProjectId: request.query.forProjectId } : {}),
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'connection-scope-not-found', 'Connection scope not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubCON04Contract['params'] }>({
    ...R2_GENERATED_ROUTES['CON-04'],
    handler: async (request, reply) => {
      const session = await authenticate(request, reply, dependencies.resolveCurrentSession)
      if (!session) return reply
      try {
        return readResult(reply, await dependencies.store.getConnection({
          accountId: session.account.accountId,
          connectionId: request.params.connectionId,
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'connection-not-found', 'Connection not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubCON05Contract['params']; Body: R2HubCON05Contract['body'] }>({
    ...R2_GENERATED_ROUTES['CON-05'],
    handler: async (request, reply) => {
      const session = await authenticCommand(request, reply, dependencies)
      if (!session) return reply
      const key = idempotencyKey(request, reply)
      if (!key) return reply
      try {
        const result = await dependencies.store.createConnection({
          accountId: session.account.accountId,
          ownerScopeKind: request.params.ownerScopeKind,
          ownerId: request.params.ownerId,
          idempotencyKey: key,
          body: request.body,
        })
        if (result.status !== 'FOUND') return commandProblem(reply, result)
        return reply.code(201).send(result.value)
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'connection-scope-not-found', 'Connection scope not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubCON06Contract['params']; Body: R2HubCON06Contract['body'] }>({
    ...R2_GENERATED_ROUTES['CON-06'],
    handler: async (request, reply) => {
      const session = await authenticCommand(request, reply, dependencies)
      if (!session) return reply
      try {
        const result = await dependencies.store.reviseConnection({
          accountId: session.account.accountId,
          connectionId: request.params.connectionId,
          body: request.body,
        })
        if (result.status !== 'FOUND') return commandProblem(reply, result)
        return reply.code(201).send(result.value)
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'connection-not-found', 'Connection not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubCON07Contract['params']; Body: R2HubCON07Contract['body'] }>({
    ...R2_GENERATED_ROUTES['CON-07'],
    handler: async (request, reply) => {
      const session = await authenticCommand(request, reply, dependencies)
      if (!session) return reply
      const key = idempotencyKey(request, reply)
      if (!key) return reply
      try {
        const result = await dependencies.store.setConnectionCredential({
          accountId: session.account.accountId,
          connectionId: request.params.connectionId,
          idempotencyKey: key,
          body: request.body,
        })
        if (result.status !== 'FOUND') return commandProblem(reply, result)
        return reply.code(204).send()
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'connection-not-found', 'Connection not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubCON08Contract['params']; Body: R2HubCON08Contract['body'] }>({
    ...R2_GENERATED_ROUTES['CON-08'],
    handler: async (request, reply) => {
      const session = await authenticCommand(request, reply, dependencies)
      if (!session) return reply
      const key = idempotencyKey(request, reply)
      if (!key) return reply
      try {
        const result = await dependencies.store.qualifyConnection({
          accountId: session.account.accountId,
          connectionId: request.params.connectionId,
          idempotencyKey: key,
          body: request.body,
        })
        if (result.status !== 'FOUND') return commandProblem(reply, result, true)
        return reply.code(201).send(result.value)
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'connection-not-found', 'Connection not found')
        throw error
      }
    },
  })

  app.route<{ Params: R2HubCON09Contract['params'] }>({
    ...R2_GENERATED_ROUTES['CON-09'],
    handler: async (request, reply) => {
      const session = await authenticate(request, reply, dependencies.resolveCurrentSession)
      if (!session) return reply
      try {
        return readResult(reply, await dependencies.store.getConnectionQualification({
          accountId: session.account.accountId,
          connectionId: request.params.connectionId,
          qualificationId: request.params.qualificationId,
        }))
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'connection-qualification-not-found', 'Connection qualification not found')
        throw error
      }
    },
  })

  return ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07', 'CON-08', 'CON-09']
}
