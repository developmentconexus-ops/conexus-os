import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CONNECTOR_GENERATED_ROUTES } from '../generated/connector-routes.js'
import type {
  BindProjectConnectionBody, ConnectorOwnerId, CreateWorkspaceConnectionBody,
  ProjectConnectionBindingParams, ProjectConnectionBindingsParams, WorkspaceConnectionParams, WorkspaceConnectionsParams,
} from '../generated/connector-routes.js'
import { Failure } from '../platform/failure.js'
import type { AccountId, HubSession } from '../identity-access/current-session.js'
import { routes } from '../http/access.js'
import {
  isConnectorBindingConflict, isConnectorConnectionConflict, isConnectorConnectionNotAvailable, isConnectorNotAdmitted, isConnectorProjectNotFound,
  isConnectorWorkspaceNotFound,
} from './model.js'
import type { ProjectBinding } from './model.js'
import { bindingId as toBindingId, bindingName as toBindingName, connectionId as toConnectionId } from './model.js'
import type { ConnectorStore } from './store.js'

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
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  checkConnection: CheckConnection
  /** The admitted credential schema per registered Connector, keyed by connectorId. An unregistered
   * key (a connectorId the wire admits but no Definition claims) is simply absent. */
  credentialSchemas: Readonly<Record<string, { safeParse(value: unknown): { success: boolean } }>>
}>

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerConnectorRoutes = async (
  app: FastifyInstance,
  { store, isInstallationAdministrator, checkConnection, credentialSchemas }: ConnectorRouteDependencies,
): Promise<readonly ConnectorOwnerId[]> => {
  const route = routes(app)
  const admittedAdministrator = async (session: HubSession): Promise<AccountId> => {
    const actor = session.account.accountId
    if (!await isInstallationAdministrator(actor)) throw new Failure('INSTALLATION_ADMINISTRATOR_REQUIRED')
    return actor
  }
  const refusedOwner = (error: unknown): never => {
    if (isConnectorProjectNotFound(error)) throw new Failure('PROJECT_NOT_FOUND')
    if (isConnectorConnectionNotAvailable(error)) throw new Failure('CONNECTOR_CONNECTION_NOT_AVAILABLE')
    if (isConnectorBindingConflict(error)) throw new Failure('CONNECTOR_BINDING_CONFLICT')
    if (isConnectorNotAdmitted(error)) throw new Failure('CONNECTOR_BINDING_MANAGE_REQUIRED')
    throw error
  }

  route.session<{ Params: WorkspaceConnectionsParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-01'],
    handler: async (request, _reply, session) => {
      const actor = await admittedAdministrator(session)
      if (!isUuid(request.params.workspaceId)) return { entries: [] }
      const connections = await store.listConnections({ actor, workspaceId: request.params.workspaceId })
      return { entries: connections.map((connection) => ({ connectionId: connection.connectionId, connectorId: connection.connectorId, label: connection.label, createdAt: connection.createdAt.toISOString(), ...(connection.disabledAt ? { disabledAt: connection.disabledAt.toISOString() } : {}) })) }
    },
  })

  route.session<{ Params: WorkspaceConnectionsParams; Body: CreateWorkspaceConnectionBody }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-02'],
    handler: async (request, reply, session) => {
      const actor = await admittedAdministrator(session)
      const { connectionId, connectorId, label, credential } = request.body
      if (!isUuid(request.params.workspaceId)) throw new Failure('CONNECTOR_WORKSPACE_NOT_FOUND')
      if (!label.trim()) throw new Failure('CONNECTOR_LABEL_REFUSED')
      const schema = credentialSchemas[connectorId]
      if (!schema?.safeParse(credential).success) throw new Failure('CONNECTOR_CREDENTIAL_REFUSED')
      const { connection, created } = await store.createConnection({
        actor, connectionId: toConnectionId(connectionId), workspaceId: request.params.workspaceId, connectorId, label, credential,
      }).catch((error: unknown) => {
        if (isConnectorConnectionConflict(error)) throw new Failure('CONNECTOR_CONNECTION_CONFLICT')
        if (isConnectorWorkspaceNotFound(error)) throw new Failure('CONNECTOR_WORKSPACE_NOT_FOUND')
        if (isConnectorNotAdmitted(error)) throw new Failure('INSTALLATION_ADMINISTRATOR_REQUIRED')
        throw error
      })
      return reply.code(created ? 201 : 200).send({
        connectionId: connection.connectionId, connectorId: connection.connectorId, label: connection.label, createdAt: connection.createdAt.toISOString(),
        ...(connection.disabledAt ? { disabledAt: connection.disabledAt.toISOString() } : {}),
      })
    },
  })

  route.session<{ Params: WorkspaceConnectionParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-03'],
    handler: async (request, _reply, session) => {
      const actor = await admittedAdministrator(session)
      if (!isUuid(request.params.workspaceId)) throw new Failure('CONNECTOR_CONNECTION_NOT_FOUND')
      const outcome = await checkConnection({ actor, workspaceId: request.params.workspaceId, connectionId: request.params.connectionId })
      if (outcome === 'NOT_FOUND') throw new Failure('CONNECTOR_CONNECTION_NOT_FOUND')
      return { outcome }
    },
  })

  route.session<{ Params: WorkspaceConnectionParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-04'],
    handler: async (request, reply, session) => {
      const actor = await admittedAdministrator(session)
      if (!isUuid(request.params.workspaceId)) throw new Failure('CONNECTOR_CONNECTION_NOT_FOUND')
      const found = await store.disableConnection({ actor, workspaceId: request.params.workspaceId, connectionId: toConnectionId(request.params.connectionId) })
      if (!found) throw new Failure('CONNECTOR_CONNECTION_NOT_FOUND')
      return reply.code(204).send()
    },
  })

  route.session<{ Params: ProjectConnectionBindingsParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-08'],
    handler: async (request, _reply, session) => {
      const actor = session.account.accountId
      if (!isUuid(request.params.projectId)) throw new Failure('PROJECT_NOT_FOUND')
      const entries = await store.listProjectBindings({ actor, projectId: request.params.projectId }).catch(refusedOwner)
      return { entries: entries.map((entry) => entry.kind === 'binding'
        ? bindingBody(entry)
        : { kind: 'bindable', connectionId: entry.connectionId, connectorId: entry.connectorId, label: entry.label }) }
    },
  })

  route.session<{ Params: ProjectConnectionBindingsParams; Body: BindProjectConnectionBody }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-09'],
    handler: async (request, _reply, session) => {
      const actor = session.account.accountId
      if (!isUuid(request.params.projectId)) throw new Failure('PROJECT_NOT_FOUND')
      const binding = await store.bindConnection({
        actor, projectId: request.params.projectId, connectionId: toConnectionId(request.body.connectionId), name: toBindingName(request.body.name),
      }).catch(refusedOwner)
      return bindingBody(binding)
    },
  })

  route.session<{ Params: ProjectConnectionBindingParams }>({
    ...CONNECTOR_GENERATED_ROUTES['CON-10'],
    handler: async (request, reply, session) => {
      const actor = session.account.accountId
      if (!isUuid(request.params.projectId)) throw new Failure('PROJECT_NOT_FOUND')
      const found = await store.unbindConnection({ actor, projectId: request.params.projectId, bindingId: toBindingId(request.params.bindingId) }).catch(refusedOwner)
      if (!found) throw new Failure('CONNECTOR_BINDING_NOT_FOUND')
      return reply.code(204).send()
    },
  })

  return ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-08', 'CON-09', 'CON-10']
}
