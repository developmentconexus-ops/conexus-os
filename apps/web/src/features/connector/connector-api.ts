import { call, failureText, isFailure, query } from '../../app/http'
import { HubFailure } from '../../app/failure'
import { routeParam } from '../../app/route-params'
import {
  BindingId, ConnectionId, CON01, CON02, CON03, CON04, CON08, CON09, CON10, ProjectId, WorkspaceId,
  type ConnectionBinding, type ConnectionBindingEntry, type ConnectionCheckOutcome, type Input,
} from '../../../../../packages/contract/dist/index.js'

const noInput = { query: undefined, headers: undefined } as const
const workspaceParams = (workspaceId: string) => ({ workspaceId: routeParam(WorkspaceId, workspaceId) })
const projectParams = (projectId: string) => ({ projectId: routeParam(ProjectId, projectId) })

export type ProjectConnectionBinding = Extract<ConnectionBindingEntry, { kind: 'binding' }>
export type BindableConnection = Extract<ConnectionBindingEntry, { kind: 'bindable' }>

export const workspaceConnectionsQuery = (workspaceId: string) => query(CON01, { params: workspaceParams(workspaceId), ...noInput, body: undefined })
export const projectConnectionBindingsQuery = (projectId: string) => query(CON08, { params: projectParams(projectId), ...noInput, body: undefined })

export const createWorkspaceConnection = (workspaceId: string, body: Input<typeof CON02>['body']) =>
  call(CON02, { params: workspaceParams(workspaceId), ...noInput, body })

export const checkWorkspaceConnection = async (workspaceId: string, connectionId: string): Promise<ConnectionCheckOutcome> =>
  (await call(CON03, { params: { ...workspaceParams(workspaceId), connectionId: routeParam(ConnectionId, connectionId) }, ...noInput, body: undefined })).outcome

export const disableWorkspaceConnection = (workspaceId: string, connectionId: string) =>
  call(CON04, { params: { ...workspaceParams(workspaceId), connectionId: routeParam(ConnectionId, connectionId) }, ...noInput, body: undefined })

export const bindProjectConnection = (projectId: string, body: Input<typeof CON09>['body']): Promise<ConnectionBinding> =>
  call(CON09, { params: projectParams(projectId), ...noInput, body })

export const unbindProjectConnection = (projectId: string, bindingId: string) =>
  call(CON10, { params: { ...projectParams(projectId), bindingId: routeParam(BindingId, bindingId) }, ...noInput, body: undefined })

// The viewer isn't an installation administrator; the Connections section explains that
// instead of offering a retry.
export const isConnectorAdminRequired = (error: unknown): boolean => isFailure(error, 'INSTALLATION_ADMINISTRATOR_REQUIRED')

// The viewer isn't the Project's Workspace Owner, or the Project doesn't exist for them at all
// (kept non-disclosing). The Bindings section explains either instead of retrying.
export const isConnectorBindingsForbidden = (error: unknown): boolean => isFailure(error, 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'PROJECT_NOT_FOUND')

// A refused check is a row of the failure table under the outcome's own name.
export function checkOutcomeMessage(outcome: ConnectionCheckOutcome): string {
  return outcome === 'OK' ? 'A conexão autenticou com sucesso.' : failureText(new HubFailure(outcome, null))
}
