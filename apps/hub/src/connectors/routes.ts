import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CONNECTOR_GENERATED_ROUTES } from '../generated/connector-routes.js'
import type {
  BindProjectConnectionBody, ConnectorOwnerId, CreateWorkspaceConnectionBody,
  ProjectConnectionBindingParams, ProjectConnectionBindingsParams, WorkspaceConnectionParams, WorkspaceConnectionsParams,
} from '../generated/connector-routes.js'
import { sendProblem } from '../http/problem.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import {
  isConnectorBindingConflict, isConnectorConnectionConflict, isConnectorConnectionNotAvailable, isConnectorNotAdmitted, isConnectorProjectNotFound,
  isConnectorWorkspaceNotFound,
} from './model.js'
import type { ProjectBinding } from './model.js'
import { bindingId as toBindingId, bindingName as toBindingName, connectionId as toConnectionId } from './model.js'
import type { ConnectorStore } from './store.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
// workspaceId and projectId are shared parameters typed only as non-empty strings, so a reference
// PostgreSQL could not read as a uuid is answered here as the resource it cannot name.
const UUID = z.guid()
const isUuid = (value: string): boolean => UUID.safeParse(value).success

/** The Connection's outcome through the allow-listed authentication alone.
 * `NOT_FOUND`: no open Connection with this id in this Workspace. */
export type CheckConnectionOutcome = 'OK' | 'CREDENTIAL_REFUSED' | 'CONNECTOR_UNCONFIGURED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_TIMEOUT' | 'PROVIDER_ERROR'
export type CheckConnection = (input: Readonly<{ actor: AccountId; workspaceId: string; connectionId: string }>) => Promise<CheckConnectionOutcome | 'NOT_FOUND'>

const bindingBody = (binding: ProjectBinding) => ({
  kind: 'binding', bindingId: binding.bindingId, name: binding.name, connectionId: binding.connectionId,
  connectorId: binding.connectorId, label: binding.label, boundAt: binding.boundAt.toISOString(),
})

export type ConnectorRouteDependencies = Readonly<{
  store: ConnectorStore
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  checkConnection: CheckConnection
  /** The admitted credential schema per registered Connector, keyed by connectorId. An unregistered
   * key (a connectorId the wire admits but no Definition claims) is simply absent. */
  credentialSchemas: Readonly<Record<string, { safeParse(value: unknown): { success: boolean } }>>
  config: Readonly<{ origin: string }>
}>

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerConnectorRoutes = async (
  app: FastifyInstance,
  { store, resolveCurrentSession, isInstallationAdministrator, checkConnection, credentialSchemas, config }: ConnectorRouteDependencies,
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
    if (isConnectorBindingConflict(error)) return sendProblem(reply, 409, 'connector-binding-conflict', 'Connector binding conflict')
    if (isConnectorNotAdmitted(error)) return sendProblem(reply, 403, 'connector-binding-manage-required', 'Connector binding administration denied')
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
      if (!label.trim()) return sendProblem(reply, 422, 'connector-label-refused', 'Connector Connection label refused')
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
      if (!isUuid(request.params.workspaceId)) return sendProblem(reply, 404, 'connector-connection-not-found', 'Connector Connection not found')
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
      if (!isUuid(request.params.workspaceId)) return sendProblem(reply, 404, 'connector-connection-not-found', 'Connector Connection not found')
      const found = await store.disableConnection({ actor, workspaceId: request.params.workspaceId, connectionId: toConnectionId(request.params.connectionId) })
      if (!found) return sendProblem(reply, 404, 'connector-connection-not-found', 'Connector Connection not found')
      return reply.code(204).send()
    },
  })

  app.route<{ Params: ProjectConnectionBindingsParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-08'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, false)
      if (!actor) return reply
      if (!isUuid(request.params.projectId)) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
      try {
        const entries = await store.listProjectBindings({ actor, projectId: request.params.projectId })
        return { entries: entries.map((entry) => entry.kind === 'binding'
          ? bindingBody(entry)
          : { kind: 'bindable', connectionId: entry.connectionId, connectorId: entry.connectorId, label: entry.label }) }
      } catch (error) {
        return refusedOwner(reply, error)
      }
    },
  })

  app.route<{ Params: ProjectConnectionBindingsParams; Body: BindProjectConnectionBody }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-09'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, true)
      if (!actor) return reply
      if (!isUuid(request.params.projectId)) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
      try {
        const binding = await store.bindConnection({
          actor, projectId: request.params.projectId, connectionId: toConnectionId(request.body.connectionId), name: toBindingName(request.body.name),
        })
        return bindingBody(binding)
      } catch (error) {
        return refusedOwner(reply, error)
      }
    },
  })

  app.route<{ Params: ProjectConnectionBindingParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-10'],
    handler: async (request, reply) => {
      const actor = await admittedActor(request, reply, true)
      if (!actor) return reply
      if (!isUuid(request.params.projectId)) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
      try {
        const found = await store.unbindConnection({ actor, projectId: request.params.projectId, bindingId: toBindingId(request.params.bindingId) })
        if (!found) return sendProblem(reply, 404, 'connector-binding-not-found', 'Connector binding not found')
        return reply.code(204).send()
      } catch (error) {
        return refusedOwner(reply, error)
      }
    },
  })

  return ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-08', 'CON-09', 'CON-10']
}
