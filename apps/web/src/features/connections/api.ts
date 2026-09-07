import type {
  R2ClientCON01Contract,
  R2ClientCON02Contract,
  R2ClientCON03Contract,
  R2ClientCON04Contract,
  R2ClientCON05Contract,
  R2ClientCON06Contract,
  R2ClientCON07Contract,
  R2ClientCON08Contract,
  R2ClientCON09Contract,
} from '../../generated/r2-client'
import { r2Client } from '../../generated/r2-client'
import { expectR2Empty, expectR2Json } from '../r2-response'

export type ConnectorDefinitionSummary = R2ClientCON01Contract['responses']['200'][number]
export type ConnectorDefinition = R2ClientCON02Contract['responses']['200']
export type ConnectionSummary = R2ClientCON03Contract['responses']['200'][number]
export type Connection = R2ClientCON04Contract['responses']['200']
export type CreateConnectionInput = R2ClientCON05Contract['body']
export type ReviseConnectionInput = R2ClientCON06Contract['body']
export type ConnectionRevision = R2ClientCON06Contract['responses']['201']
export type ConnectionCredentialInput = R2ClientCON07Contract['body']
export type QualifyConnectionInput = R2ClientCON08Contract['body']
export type ConnectionQualification = R2ClientCON09Contract['responses']['200']
export type ConnectionOwnerScope = R2ClientCON03Contract['params']['ownerScopeKind']

export const connectorDefinitionsQueryKey = ['connections', 'definitions'] as const
export const connectorDefinitionQueryKey = (connectorDefinitionId: string) => (
  ['connections', 'definition', connectorDefinitionId] as const
)
export const connectionsQueryKey = (
  ownerScopeKind: ConnectionOwnerScope,
  ownerId: string,
  forProjectId?: string,
) => ['connections', 'scope', ownerScopeKind, ownerId, forProjectId ?? null] as const
export const connectionQueryKey = (connectionId: string) => ['connections', 'detail', connectionId] as const
export const connectionQualificationQueryKey = (connectionId: string, qualificationId: string) => (
  ['connections', 'qualification', connectionId, qualificationId] as const
)

export function listConnectorDefinitions() {
  return expectR2Json<ConnectorDefinitionSummary[]>(r2Client.request('CON-01', {}), [200])
}

export function getConnectorDefinition(connectorDefinitionId: string) {
  return expectR2Json<ConnectorDefinition>(
    r2Client.request('CON-02', { params: { connectorDefinitionId } }),
    [200],
  )
}

export function listConnections(
  ownerScopeKind: ConnectionOwnerScope,
  ownerId: string,
  forProjectId?: string,
) {
  return expectR2Json<ConnectionSummary[]>(
    r2Client.request('CON-03', {
      params: { ownerScopeKind, ownerId },
      ...(forProjectId === undefined ? {} : { querystring: { forProjectId } }),
    }),
    [200],
  )
}

export function getConnection(connectionId: string) {
  return expectR2Json<Connection>(
    r2Client.request('CON-04', { params: { connectionId } }),
    [200],
  )
}

export function createConnection(
  ownerScopeKind: ConnectionOwnerScope,
  ownerId: string,
  body: CreateConnectionInput,
  idempotencyKey: string,
) {
  return expectR2Json<Connection>(
    r2Client.request('CON-05', {
      params: { ownerScopeKind, ownerId },
      headers: { 'idempotency-key': idempotencyKey },
      body,
    }),
    [201],
  )
}

export function reviseConnection(connectionId: string, body: ReviseConnectionInput) {
  return expectR2Json<ConnectionRevision>(
    r2Client.request('CON-06', { params: { connectionId }, body }),
    [201],
  )
}

export function setConnectionCredential(
  connectionId: string,
  body: ConnectionCredentialInput,
  idempotencyKey: string,
) {
  return expectR2Empty(
    r2Client.request('CON-07', {
      params: { connectionId },
      headers: { 'idempotency-key': idempotencyKey },
      body,
    }),
    [204],
  )
}

export function qualifyConnection(
  connectionId: string,
  body: QualifyConnectionInput,
  idempotencyKey: string,
) {
  return expectR2Json<ConnectionQualification>(
    r2Client.request('CON-08', {
      params: { connectionId },
      headers: { 'idempotency-key': idempotencyKey },
      body,
    }),
    [201],
  )
}

export function getConnectionQualification(connectionId: string, qualificationId: string) {
  return expectR2Json<ConnectionQualification>(
    r2Client.request('CON-09', { params: { connectionId, qualificationId } }),
    [200],
  )
}
