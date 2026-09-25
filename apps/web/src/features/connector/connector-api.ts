import type {
  CheckWorkspaceConnectionOutcome,
  ConnectorConnection,
  ConnectorGrantEntry,
  ConnectorOpenGrant,
  CreateWorkspaceConnectionInput,
  GrantProjectConnectorOperationInput,
} from '../../generated/connector-client'
import { connectorClient } from '../../generated/connector-client'
import { clearAuthorityCache } from '../../app/query-client'

export const workspaceConnectionsQueryKey = (workspaceId: string) =>
  ['connector', 'workspace-connections', workspaceId] as const

export const projectConnectorGrantsQueryKey = (projectId: string) =>
  ['connector', 'project-grants', projectId] as const

export type ConnectorGrant = Extract<ConnectorGrantEntry, { kind: 'grant' }>
export type ConnectorGrantable = Extract<ConnectorGrantEntry, { kind: 'grantable' }>

export class ConnectorRequestError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? 'Connector request did not complete' : `Connector request failed with ${status}`)
  }
}

function reject(response: Response): never {
  if (response.status === 401) clearAuthorityCache()
  throw new ConnectorRequestError(response.status)
}

async function send(call: () => Promise<Response>, expected: number | readonly number[]): Promise<Response> {
  let response: Response
  try {
    response = await call()
  } catch {
    throw new ConnectorRequestError(null)
  }
  const ok = Array.isArray(expected) ? expected.includes(response.status) : response.status === expected
  if (!ok) reject(response)
  return response
}

export async function listWorkspaceConnections(workspaceId: string): Promise<readonly ConnectorConnection[]> {
  const response = await send(() => connectorClient.listWorkspaceConnections(workspaceId), 200)
  const body = (await response.json()) as { entries: ConnectorConnection[] }
  return body.entries
}

export async function createWorkspaceConnection(
  workspaceId: string,
  input: CreateWorkspaceConnectionInput,
): Promise<ConnectorConnection> {
  const response = await send(() => connectorClient.createWorkspaceConnection(workspaceId, input), [200, 201])
  return response.json() as Promise<ConnectorConnection>
}

export async function checkWorkspaceConnection(
  workspaceId: string,
  connectionId: string,
): Promise<CheckWorkspaceConnectionOutcome['outcome']> {
  const response = await send(() => connectorClient.checkWorkspaceConnection(workspaceId, connectionId), 200)
  const body = (await response.json()) as CheckWorkspaceConnectionOutcome
  return body.outcome
}

export async function disableWorkspaceConnection(workspaceId: string, connectionId: string): Promise<void> {
  await send(() => connectorClient.disableWorkspaceConnection(workspaceId, connectionId), 204)
}

export async function listProjectConnectorGrants(projectId: string): Promise<readonly ConnectorGrantEntry[]> {
  const response = await send(() => connectorClient.listProjectConnectorGrants(projectId), 200)
  const body = (await response.json()) as { entries: ConnectorGrantEntry[] }
  return body.entries
}

export async function grantProjectConnectorOperation(
  projectId: string,
  input: GrantProjectConnectorOperationInput,
): Promise<ConnectorOpenGrant> {
  const response = await send(() => connectorClient.grantProjectConnectorOperation(projectId, input), 200)
  return response.json() as Promise<ConnectorOpenGrant>
}

export async function revokeProjectConnectorGrant(projectId: string, grantId: string): Promise<void> {
  await send(() => connectorClient.revokeProjectConnectorGrant(projectId, grantId), 204)
}

// The viewer isn't an installation administrator; the Connections section explains that
// instead of offering a retry.
export function isConnectorAdminRequired(error: unknown): boolean {
  return error instanceof ConnectorRequestError && error.status === 403
}

export function workspaceConnectionsMessage(error: unknown): string {
  if (!(error instanceof ConnectorRequestError)) return 'A alteração não foi confirmada.'
  if (error.status === 409) return 'Este Workspace já tem uma conexão Sankhya ativa.'
  if (error.status === 422) return 'As credenciais informadas não foram aceitas.'
  return 'A alteração não foi confirmada.'
}

// The viewer isn't the Project's Workspace Owner (403), or the Project doesn't exist for them
// at all (404, kept non-disclosing) — the Grants section explains either instead of retrying.
export function isConnectorGrantsForbidden(error: unknown): boolean {
  return error instanceof ConnectorRequestError && (error.status === 403 || error.status === 404)
}

export function projectGrantsMessage(error: unknown): string {
  if (!(error instanceof ConnectorRequestError)) return 'A alteração não foi confirmada.'
  if (error.status === 422) return 'Esta operação não pode mais ser concedida.'
  if (error.status === 404) return 'Esta conexão não está mais disponível para o Projeto.'
  return 'A alteração não foi confirmada.'
}

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

export function checkConnectionMessage(error: unknown): string {
  if (error instanceof ConnectorRequestError && error.status === 404) return 'Esta conexão não existe mais.'
  return 'Não foi possível testar a conexão agora.'
}

const OPERATION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'sankhya.purchase-order.read': 'Ler pedido de compra do Sankhya',
}

export function describeOperation(operationId: string): string {
  return OPERATION_DESCRIPTIONS[operationId] ?? operationId
}
