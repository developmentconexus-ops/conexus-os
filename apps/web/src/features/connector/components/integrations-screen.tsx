import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import type { CheckWorkspaceConnectionOutcome, ConnectorConnection } from '../../../generated/connector-client'
import {
  checkConnectionMessage,
  checkOutcomeMessage,
  checkWorkspaceConnection,
  type ConnectorGrant,
  type ConnectorGrantable,
  createWorkspaceConnection,
  describeOperation,
  disableConnectionMessage,
  disableWorkspaceConnection,
  grantProjectConnectorOperation,
  isConnectorAdminRequired,
  isConnectorGrantsForbidden,
  listProjectConnectorGrants,
  listWorkspaceConnections,
  projectConnectorGrantsQueryKey,
  projectGrantsMessage,
  revokeProjectConnectorGrant,
  workspaceConnectionsMessage,
  workspaceConnectionsQueryKey,
} from '../connector-api'
import '../connector.css'

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const formatDate = (value: string) => date.format(new Date(value))

export function IntegrationsScreen({ workspaceId, projectId }: Readonly<{ workspaceId: string; projectId: string }>) {
  return <div className="cx-connector">
    <ConnectionsSection workspaceId={workspaceId} />
    <GrantsSection projectId={projectId} />
  </div>
}

function ConnectionsSection({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const queryClient = useQueryClient()
  const queryKey = workspaceConnectionsQueryKey(workspaceId)
  const connections = useQuery({ queryKey, queryFn: () => listWorkspaceConnections(workspaceId) })
  // A new or disabled Connection changes what the Grants section can offer too, so both sections
  // refresh together rather than drifting until the next reload.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['connector'] })

  if (connections.isPending) {
    return <section aria-labelledby="connector-connections" className="cx-connector-section" aria-busy="true">
      <h2 id="connector-connections" className="cx-section-title">Conexões do Workspace</h2>
      <span className="sr-only" role="status">Carregando as conexões</span>
      <Skeleton className="cx-skeleton-line" />
    </section>
  }
  if (connections.isError) {
    return <section aria-labelledby="connector-connections" className="cx-connector-section">
      <h2 id="connector-connections" className="cx-section-title">Conexões do Workspace</h2>
      {isConnectorAdminRequired(connections.error) ? (
        <div className="cx-state" role="alert"><h2>Só um administrador da instalação vê e administra as conexões do Workspace.</h2></div>
      ) : (
        <div className="cx-state" role="alert">
          <h2>Não foi possível carregar as conexões</h2>
          <p>Nada foi alterado. O servidor não respondeu desta vez.</p>
          <Button type="button" variant="outline" onClick={() => void connections.refetch()}>Tentar de novo</Button>
        </div>
      )}
    </section>
  }

  return <section aria-labelledby="connector-connections" className="cx-connector-section">
    <h2 id="connector-connections" className="cx-section-title">Conexões do Workspace <span className="cx-count">{connections.data.length}</span></h2>
    {connections.data.length === 0 ? (
      <p className="cx-connector-empty">Nenhuma conexão criada ainda.</p>
    ) : (
      <ul className="cx-connection-list">
        {connections.data.map((connection) => (
          <ConnectionRow key={connection.connectionId} workspaceId={workspaceId} connection={connection} onChanged={refresh} />
        ))}
      </ul>
    )}
    {connections.data.some((connection) => connection.connectorId === 'sankhya' && !connection.disabledAt) ? (
      <p className="cx-field-hint">Para trocar a credencial, desative a conexão ativa e adicione outra.</p>
    ) : (
      <CreateConnectionForm workspaceId={workspaceId} onCreated={refresh} />
    )}
  </section>
}

function ConnectionRow({ workspaceId, connection, onChanged }: Readonly<{ workspaceId: string; connection: ConnectorConnection; onChanged: () => void }>) {
  const [outcomeMessage, setOutcomeMessage] = useState('')
  const [confirmingDisable, setConfirmingDisable] = useState(false)
  const check = useMutation({
    mutationFn: () => checkWorkspaceConnection(workspaceId, connection.connectionId),
    onSuccess: (outcome: CheckWorkspaceConnectionOutcome['outcome']) => setOutcomeMessage(checkOutcomeMessage(outcome)),
    onError: (error) => setOutcomeMessage(checkConnectionMessage(error)),
  })
  const disable = useMutation({
    mutationFn: () => disableWorkspaceConnection(workspaceId, connection.connectionId),
    onSuccess: () => { setConfirmingDisable(false); onChanged() },
    onError: (error) => { setConfirmingDisable(false); setOutcomeMessage(disableConnectionMessage(error)) },
  })
  const disabled = Boolean(connection.disabledAt)

  return <li className="cx-connection">
    <div className="cx-connection-main">
      <strong>{connection.label}</strong>
      <span className="cx-connection-meta">Sankhya · criada em {formatDate(connection.createdAt)}{disabled ? ' · desativada' : ''}</span>
      <code className="cx-connection-id">{connection.connectionId}</code>
    </div>
    <div className="cx-connection-actions">
      <Button type="button" variant="outline" size="sm" disabled={disabled || check.isPending} onClick={() => check.mutate()}>
        {check.isPending ? 'Testando…' : 'Testar'}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setConfirmingDisable(true)}>Desativar</Button>
    </div>
    {outcomeMessage && <p className="cx-form-status" role="status" aria-live="polite">{outcomeMessage}</p>}

    <AlertDialog open={confirmingDisable} onOpenChange={setConfirmingDisable}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Desativar {connection.label}?</AlertDialog.Title>
          <AlertDialog.Description>
            Todo Projeto que usa esta conexão para de conseguir chamadas assim que a desativação acontecer. O registro fica guardado.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Voltar</AlertDialog.Cancel>
          <AlertDialog.Action onClick={() => disable.mutate()}>Desativar</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  </li>
}

function CreateConnectionForm({ workspaceId, onCreated }: Readonly<{ workspaceId: string; onCreated: () => void }>) {
  const labelId = useId()
  const clientIdId = useId()
  const clientSecretId = useId()
  const xTokenId = useId()
  const [message, setMessage] = useState('')
  const [created, setCreated] = useState(false)
  // One id per Connection the administrator is adding, kept across a failed submit: if the server
  // committed but the answer was lost, the resubmit is the same request and answers 200.
  const pendingConnectionId = useRef<string | null>(null)
  const create = useMutation({
    mutationFn: (input: Readonly<{ connectionId: string; connectorId: 'sankhya'; label: string; credential: Readonly<{ clientId: string; clientSecret: string; xToken: string }> }>) =>
      createWorkspaceConnection(workspaceId, input),
    onSuccess: () => { pendingConnectionId.current = null; setMessage(''); setCreated(true); onCreated() },
    onError: (error) => { setCreated(false); setMessage(workspaceConnectionsMessage(error)) },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (create.isPending) return
    const form = event.currentTarget
    const data = new FormData(form)
    const label = String(data.get('label') ?? '').trim()
    const clientId = String(data.get('clientId') ?? '')
    const clientSecret = String(data.get('clientSecret') ?? '')
    const xToken = String(data.get('xToken') ?? '')
    if (!label || !clientId || !clientSecret || !xToken) {
      setMessage('Preencha todos os campos.')
      return
    }
    setCreated(false)
    pendingConnectionId.current ??= crypto.randomUUID()
    create.mutate(
      { connectionId: pendingConnectionId.current, connectorId: 'sankhya', label, credential: { clientId, clientSecret, xToken } },
      // reset() also drops the mutation's cached variables, which hold the credential.
      { onSuccess: () => { form.reset(); create.reset() } },
    )
  }

  return <form className="cx-panel cx-connection-form" onSubmit={submit} noValidate>
    <h3 className="cx-connector-form-title">Adicionar conexão Sankhya</h3>
    <div className="cx-field">
      <Label htmlFor={labelId}>Nome da conexão</Label>
      <Input id={labelId} name="label" type="text" autoComplete="off" required placeholder="ERP principal" />
    </div>
    <div className="cx-field">
      <Label htmlFor={clientIdId}>Client id</Label>
      <Input id={clientIdId} name="clientId" type="password" autoComplete="off" required />
    </div>
    <div className="cx-field">
      <Label htmlFor={clientSecretId}>Client secret</Label>
      <Input id={clientSecretId} name="clientSecret" type="password" autoComplete="off" required />
    </div>
    <div className="cx-field">
      <Label htmlFor={xTokenId}>X-Token</Label>
      <Input id={xTokenId} name="xToken" type="password" autoComplete="off" required />
    </div>
    <p className="cx-field-hint">As credenciais não são exibidas de novo depois de salvas.</p>
    <Button type="submit" variant="primary" disabled={create.isPending}>{create.isPending ? 'Adicionando…' : 'Adicionar conexão Sankhya'}</Button>
    <p className="cx-form-status" data-tone={message ? 'error' : undefined} role="status" aria-live="polite">
      {message}
      {created && !message && 'Conexão adicionada.'}
    </p>
  </form>
}

function GrantsSection({ projectId }: Readonly<{ projectId: string }>) {
  const queryClient = useQueryClient()
  const queryKey = projectConnectorGrantsQueryKey(projectId)
  const grants = useQuery({ queryKey, queryFn: () => listProjectConnectorGrants(projectId) })
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  if (grants.isPending) {
    return <section aria-labelledby="connector-grants" className="cx-connector-section" aria-busy="true">
      <h2 id="connector-grants" className="cx-section-title">Integrações deste Projeto</h2>
      <span className="sr-only" role="status">Carregando as integrações</span>
      <Skeleton className="cx-skeleton-line" />
    </section>
  }
  if (grants.isError) {
    return <section aria-labelledby="connector-grants" className="cx-connector-section">
      <h2 id="connector-grants" className="cx-section-title">Integrações deste Projeto</h2>
      {isConnectorGrantsForbidden(grants.error) ? (
        <div className="cx-state" role="alert"><h2>Só o Owner do Workspace concede e revoga integrações deste Projeto.</h2></div>
      ) : (
        <div className="cx-state" role="alert">
          <h2>Não foi possível carregar as integrações</h2>
          <p>Nada foi alterado. O servidor não respondeu desta vez.</p>
          <Button type="button" variant="outline" onClick={() => void grants.refetch()}>Tentar de novo</Button>
        </div>
      )}
    </section>
  }

  const open = grants.data.filter((entry): entry is ConnectorGrant => entry.kind === 'grant')
  const grantable = grants.data.filter((entry): entry is ConnectorGrantable => entry.kind === 'grantable')

  return <section aria-labelledby="connector-grants" className="cx-connector-section">
    <h2 id="connector-grants" className="cx-section-title">Integrações deste Projeto</h2>
    <h3 className="cx-connector-subtitle">Concedidas <span className="cx-count">{open.length}</span></h3>
    {open.length === 0 ? (
      <p className="cx-connector-empty">Nenhuma integração concedida ainda.</p>
    ) : (
      <ul className="cx-connection-list">
        {open.map((grant) => <OpenGrantRow key={grant.grantId} projectId={projectId} grant={grant} onChanged={refresh} />)}
      </ul>
    )}
    {grantable.length > 0 && <>
      <h3 className="cx-connector-subtitle">Disponíveis para conceder</h3>
      <ul className="cx-connection-list">
        {grantable.map((capability) => (
          <GrantableRow key={`${capability.connectionId}:${capability.capabilityId}`} projectId={projectId} capability={capability} onChanged={refresh} />
        ))}
      </ul>
    </>}
  </section>
}

function OpenGrantRow({ projectId, grant, onChanged }: Readonly<{ projectId: string; grant: ConnectorGrant; onChanged: () => void }>) {
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const revoke = useMutation({
    mutationFn: () => revokeProjectConnectorGrant(projectId, grant.grantId),
    onSuccess: () => { setConfirming(false); onChanged() },
    onError: (error) => { setConfirming(false); setMessage(projectGrantsMessage(error)) },
  })

  return <li className="cx-connection">
    <div className="cx-connection-main">
      <strong>{describeOperation(grant.capabilityId)}</strong>
      <span className="cx-connection-meta">concedida em {formatDate(grant.grantedAt)}</span>
      <code className="cx-connection-id">{grant.capabilityId}</code>
    </div>
    <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>Revogar</Button>
    {message && <p className="cx-form-status" data-tone="error" role="alert">{message}</p>}

    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Revogar {describeOperation(grant.capabilityId)}?</AlertDialog.Title>
          <AlertDialog.Description>O Projeto para de conseguir chamar esta integração assim que a revogação acontecer.</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Voltar</AlertDialog.Cancel>
          <AlertDialog.Action onClick={() => revoke.mutate()}>Revogar</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  </li>
}

function GrantableRow({ projectId, capability, onChanged }: Readonly<{ projectId: string; capability: ConnectorGrantable; onChanged: () => void }>) {
  const [message, setMessage] = useState('')
  const grant = useMutation({
    mutationFn: () => grantProjectConnectorOperation(projectId, { connectionId: capability.connectionId, operationId: capability.capabilityId }),
    onSuccess: () => onChanged(),
    onError: (error) => setMessage(projectGrantsMessage(error)),
  })

  return <li className="cx-connection">
    <div className="cx-connection-main">
      <strong>{describeOperation(capability.capabilityId)}</strong>
      <code className="cx-connection-id">{capability.capabilityId}</code>
    </div>
    <Button type="button" variant="primary" size="sm" disabled={grant.isPending} onClick={() => grant.mutate()}>
      {grant.isPending ? 'Concedendo…' : 'Conceder'}
    </Button>
    {message && <p className="cx-form-status" data-tone="error" role="alert">{message}</p>}
  </li>
}
