import type {
  BindProjectConnectionInput,
  CheckWorkspaceConnectionOutcome,
  ConnectionBinding,
  ConnectionBindingEntry,
  ConnectorConnection,
  CreateWorkspaceConnectionInput,
} from '../../generated/connector-client'
import { connectorClient } from '../../generated/connector-client'
import { hubCall, isFailure } from '../../app/http'

export const workspaceConnectionsQueryKey = (workspaceId: string) =>
  ['connector', 'workspace-connections', workspaceId] as const

export const projectConnectionBindingsQueryKey = (projectId: string) =>
  ['connector', 'project-bindings', projectId] as const

export type ProjectConnectionBinding = Extract<ConnectionBindingEntry, { kind: 'binding' }>
export type BindableConnection = Extract<ConnectionBindingEntry, { kind: 'bindable' }>

export async function listWorkspaceConnections(workspaceId: string): Promise<readonly ConnectorConnection[]> {
  const response = await hubCall(connectorClient.listWorkspaceConnections(workspaceId), 200)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const body = (await response.json()) as { entries: ConnectorConnection[] }
  return body.entries
}

export async function createWorkspaceConnection(
  workspaceId: string,
  input: CreateWorkspaceConnectionInput,
): Promise<ConnectorConnection> {
  const response = await hubCall(connectorClient.createWorkspaceConnection(workspaceId, input), [200, 201])
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<ConnectorConnection>
}

export async function checkWorkspaceConnection(
  workspaceId: string,
  connectionId: string,
): Promise<CheckWorkspaceConnectionOutcome['outcome']> {
  const response = await hubCall(connectorClient.checkWorkspaceConnection(workspaceId, connectionId), 200)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const body = (await response.json()) as CheckWorkspaceConnectionOutcome
  return body.outcome
}

export async function disableWorkspaceConnection(workspaceId: string, connectionId: string): Promise<void> {
  await hubCall(connectorClient.disableWorkspaceConnection(workspaceId, connectionId), 204)
}

export async function listProjectConnectionBindings(projectId: string): Promise<readonly ConnectionBindingEntry[]> {
  const response = await hubCall(connectorClient.listProjectConnectionBindings(projectId), 200)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const body = (await response.json()) as { entries: ConnectionBindingEntry[] }
  return body.entries
}

export async function bindProjectConnection(projectId: string, input: BindProjectConnectionInput): Promise<ConnectionBinding> {
  const response = await hubCall(connectorClient.bindProjectConnection(projectId, input), 200)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<ConnectionBinding>
}

export async function unbindProjectConnection(projectId: string, bindingId: string): Promise<void> {
  await hubCall(connectorClient.unbindProjectConnection(projectId, bindingId), 204)
}

// The viewer isn't an installation administrator; the Connections section explains that
// instead of offering a retry.
export const isConnectorAdminRequired = (error: unknown): boolean => isFailure(error, 'INSTALLATION_ADMINISTRATOR_REQUIRED')

// The viewer isn't the Project's Workspace Owner, or the Project doesn't exist for them at all
// (kept non-disclosing). The Bindings section explains either instead of retrying.
export const isConnectorBindingsForbidden = (error: unknown): boolean => isFailure(error, 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'PROJECT_NOT_FOUND')

const CHECK_OUTCOME_MESSAGES: Record<CheckWorkspaceConnectionOutcome['outcome'], string> = {
  OK: 'A conexão autenticou com sucesso.',
  CREDENTIAL_REFUSED: 'As credenciais desta conexão foram recusadas.',
  CONNECTOR_UNCONFIGURED: 'O conector ainda não está configurado no servidor.',
  PROVIDER_UNAVAILABLE: 'O serviço não respondeu a este teste.',
  PROVIDER_TIMEOUT: 'O teste demorou demais e foi interrompido.',
  PROVIDER_ERROR: 'O serviço respondeu com um erro a este teste.',
}

export function checkOutcomeMessage(outcome: CheckWorkspaceConnectionOutcome['outcome']): string {
  return CHECK_OUTCOME_MESSAGES[outcome]
}
