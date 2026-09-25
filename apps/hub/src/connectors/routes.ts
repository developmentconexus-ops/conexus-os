import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CONNECTOR_GENERATED_ROUTES } from '../generated/connector-routes.js'
import type {
  ConnectorOwnerId, CreateWorkspaceConnectionBody, GrantProjectConnectorOperationBody,
  ProjectConnectorGrantParams, ProjectConnectorGrantsParams, WorkspaceConnectionParams, WorkspaceConnectionsParams,
} from '../generated/connector-routes.js'
import { sendProblem } from '../http/problem.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import {
  isConnectorConnectionConflict, isConnectorConnectionNotAvailable, isConnectorNotAdmitted, isConnectorProjectNotFound, isConnectorWorkspaceNotFound,
} from './model.js'
import type { OperationId } from './model.js'
import { connectionId as toConnectionId, grantId as toGrantId, operationId as toOperationId } from './model.js'
import type { ConnectorStore } from './store.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
// Every id the wire carries is an untrusted string, and the store's functions take uuid parameters: a
// reference PostgreSQL could not read as a uuid is answered here as the resource it cannot name.
const UUID = z.guid()
const isUuid = (value: string): boolean => UUID.safeParse(value).success

/** The Connection's outcome through the allow-listed authentication alone.
 * `NOT_FOUND`: no open Connection with this id in this Workspace. */
export type CheckConnectionOutcome = 'OK' | 'CREDENTIAL_REFUSED' | 'CONNECTOR_UNCONFIGURED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_TIMEOUT' | 'PROVIDER_ERROR'
export type CheckConnection = (input: Readonly<{ actor: AccountId; workspaceId: string; connectionId: string }>) => Promise<CheckConnectionOutcome | 'NOT_FOUND'>

export type ConnectorRouteDependencies = Readonly<{
  store: ConnectorStore
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  checkConnection: CheckConnection
  /** The admitted credential schema per registered Connector, keyed by connectorId. An unregistered
   * key (a connectorId the wire admits but no Definition claims) is simply absent. */
  credentialSchemas: Readonly<Record<string, { safeParse(value: unknown): { success: boolean } }>>
  /** Every operation id a registered Connector Definition admits, flattened. A `GrantProjectConnectorOperation`
   * body naming any other id is refused as 422 before the store. */
  admittedOperationIds: ReadonlySet<OperationId>
  config: Readonly<{ origin: string }>
}>

export const registerConnectorRoutes = async (
  app: FastifyInstance,
  { store, resolveCurrentSession, isInstallationAdministrator, checkConnection, credentialSchemas, admittedOperationIds, config }: ConnectorRouteDependencies,
): Promise<readonly ConnectorOwnerId[]> => {
  const authentic = (request: Parameters<ResolveCurrentSession>[0]): boolean => {
    const requestCsrf = header(request.headers['x-conexus-csrf'])
    return request.headers.origin === config.origin && !!requestCsrf && requestCsrf === request.cookies[CSRF_COOKIE]
  }
  const admittedActor = async (request: Parameters<ResolveCurrentSession>[0], reply: Parameters<typeof sendProblem>[0], requireCsrf: boolean): Promise<AccountId | null> => {
    if (requireCsrf && !authentic(request)) {
      await sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      return null
    }
    const current = await resolveCurrentSession(request, requireCsrf)
    if (!current) {
      await sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      return null
    }
    return current.account.accountId
  }
  const refusedOwner = (reply: Parameters<typeof sendProblem>[0], error: unknown) => {
    if (isConnectorProjectNotFound(error)) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
    if (isConnectorConnectionNotAvailable(error)) return sendProblem(reply, 404, 'connector-connection-not-available', 'Connector Connection not available')
    if (isConnectorNotAdmitted(error)) return sendProblem(reply, 403, 'connector-grant-manage-required', 'Connector grant administration denied')
    throw error
  }
  const requireAdministrator = async (actor: AccountId, reply: Parameters<typeof sendProblem>[0]): Promise<boolean> => {
    if (await isInstallationAdministrator(actor)) return true
    await sendProblem(reply, 403, 'installation-administrator-required', 'Installation administrator required')
    return false
  }

  app.route<{ Params: WorkspaceConnectionsParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-01'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, false)
      if (!actor) return reply
      if (!await requireAdministrator(actor, reply)) return reply
      if (!isUuid(request.params.workspaceId)) return { entries: [] }
      const connections = await store.listConnections({ actor, workspaceId: request.params.workspaceId })
      return { entries: connections.map((connection) => ({ connectionId: connection.connectionId, connectorId: connection.connectorId, label: connection.label, createdAt: connection.createdAt.toISOString(), ...(connection.disabledAt ? { disabledAt: connection.disabledAt.toISOString() } : {}) })) }
    },
  })

  app.route<{ Params: WorkspaceConnectionsParams; Body: CreateWorkspaceConnectionBody }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-02'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, true)
      if (!actor) return reply
      if (!await requireAdministrator(actor, reply)) return reply
      const { connectionId, connectorId, label, credential } = request.body
      if (!isUuid(request.params.workspaceId)) return sendProblem(reply, 422, 'connector-workspace-not-found', 'Connector Workspace not found')
      if (!isUuid(connectionId)) return sendProblem(reply, 422, 'connector-connection-id-refused', 'Connector Connection id refused')
      const schema = credentialSchemas[connectorId]
      if (!schema?.safeParse(credential).success) {
        return sendProblem(reply, 422, 'connector-credential-refused', 'Connector credential refused')
      }
      try {
        const { connection, created } = await store.createConnection({
          actor, connectionId: toConnectionId(connectionId), workspaceId: request.params.workspaceId, connectorId, label, credential,
        })
        return reply.code(created ? 201 : 200).send({
          connectionId: connection.connectionId, connectorId: connection.connectorId, label: connection.label, createdAt: connection.createdAt.toISOString(),
          ...(connection.disabledAt ? { disabledAt: connection.disabledAt.toISOString() } : {}),
        })
      } catch (error) {
        if (isConnectorConnectionConflict(error)) return sendProblem(reply, 409, 'connector-connection-conflict', 'Connector Connection conflict')
        if (isConnectorWorkspaceNotFound(error)) return sendProblem(reply, 422, 'connector-workspace-not-found', 'Connector Workspace not found')
        if (isConnectorNotAdmitted(error)) return sendProblem(reply, 403, 'installation-administrator-required', 'Installation administrator required')
        throw error
      }
    },
  })

  app.route<{ Params: WorkspaceConnectionParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-03'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, true)
      if (!actor) return reply
      if (!await requireAdministrator(actor, reply)) return reply
      if (!isUuid(request.params.workspaceId) || !isUuid(request.params.connectionId)) return sendProblem(reply, 404, 'connector-connection-not-found', 'Connector Connection not found')
      const outcome = await checkConnection({ actor, workspaceId: request.params.workspaceId, connectionId: request.params.connectionId })
      if (outcome === 'NOT_FOUND') return sendProblem(reply, 404, 'connector-connection-not-found', 'Connector Connection not found')
      return { outcome }
    },
  })

  app.route<{ Params: WorkspaceConnectionParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-04'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, true)
      if (!actor) return reply
      if (!await requireAdministrator(actor, reply)) return reply
      if (!isUuid(request.params.workspaceId) || !isUuid(request.params.connectionId)) return sendProblem(reply, 404, 'connector-connection-not-found', 'Connector Connection not found')
      const found = await store.disableConnection({ actor, workspaceId: request.params.workspaceId, connectionId: toConnectionId(request.params.connectionId) })
      if (!found) return sendProblem(reply, 404, 'connector-connection-not-found', 'Connector Connection not found')
      return reply.code(204).send()
    },
  })

  app.route<{ Params: ProjectConnectorGrantsParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-05'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, false)
      if (!actor) return reply
      if (!isUuid(request.params.projectId)) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
      try {
        const entries = await store.listProjectGrants({ actor, projectId: request.params.projectId, operationIds: [...admittedOperationIds] })
        return { entries: entries.map((entry) => entry.kind === 'grant'
          ? { kind: 'grant', grantId: entry.grantId, connectionId: entry.connectionId, connectorId: entry.connectorId, capabilityId: entry.capabilityId, grantedAt: entry.grantedAt.toISOString() }
          : { kind: 'grantable', connectionId: entry.connectionId, connectorId: entry.connectorId, capabilityId: entry.capabilityId }) }
      } catch (error) {
        return refusedOwner(reply, error)
      }
    },
  })

  app.route<{ Params: ProjectConnectorGrantsParams; Body: GrantProjectConnectorOperationBody }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-06'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, true)
      if (!actor) return reply
      const { connectionId, operationId } = request.body
      if (!isUuid(request.params.projectId)) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
      if (!isUuid(connectionId)) return sendProblem(reply, 422, 'connector-connection-id-refused', 'Connector Connection id refused')
      if (!admittedOperationIds.has(toOperationId(operationId))) {
        return sendProblem(reply, 422, 'connector-operation-not-admitted', 'Connector operation not admitted')
      }
      try {
        const grant = await store.grantCapability({ actor, projectId: request.params.projectId, connectionId: toConnectionId(connectionId), operationId: toOperationId(operationId) })
        return { kind: 'grant', grantId: grant.grantId, connectionId: grant.connectionId, connectorId: grant.connectorId, capabilityId: grant.capabilityId, grantedAt: grant.grantedAt.toISOString() }
      } catch (error) {
        return refusedOwner(reply, error)
      }
    },
  })

  app.route<{ Params: ProjectConnectorGrantParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-07'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, true)
      if (!actor) return reply
      if (!isUuid(request.params.projectId)) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
      if (!isUuid(request.params.grantId)) return sendProblem(reply, 404, 'connector-grant-not-found', 'Connector grant not found')
      try {
        const found = await store.revokeGrant({ actor, projectId: request.params.projectId, grantId: toGrantId(request.params.grantId) })
        if (!found) return sendProblem(reply, 404, 'connector-grant-not-found', 'Connector grant not found')
        return reply.code(204).send()
      } catch (error) {
        return refusedOwner(reply, error)
      }
    },
  })

  return ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07']
}
