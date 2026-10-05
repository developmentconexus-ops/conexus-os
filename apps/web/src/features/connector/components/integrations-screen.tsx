import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import { BindingName, CON01, CON08, ConnectionId, type ConnectionCheckOutcome, type ConnectorConnection } from '../../../../../../packages/contract/dist/index.js'
import {
  type BindableConnection,
  bindProjectConnection,
  checkOutcomeMessage,
  checkWorkspaceConnection,
  createWorkspaceConnection,
  disableWorkspaceConnection,
  isConnectorAdminRequired,
  isConnectorBindingsForbidden,
  type ProjectConnectionBinding,
  projectConnectionBindingsQuery,
  unbindProjectConnection,
  workspaceConnectionsQuery,
} from '../connector-api'
import '../connector.css'
import { failureText } from '../../../app/http'
import { FailureState } from '../../../app/failure-state'

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const formatDate = (value: string) => date.format(new Date(value))

export function IntegrationsScreen({ workspaceId, projectId }: Readonly<{ workspaceId: string; projectId: string }>) {
  return <div className="cx-connector">
    <ConnectionsSection workspaceId={workspaceId} />
    <BindingsSection projectId={projectId} />
  </div>
}

function ConnectionsSection({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const queryClient = useQueryClient()
  const connections = useQuery(workspaceConnectionsQuery(workspaceId))
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: [CON01.id] }), queryClient.invalidateQueries({ queryKey: [CON08.id] })])

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
        <FailureState title="Não foi possível carregar as conexões" error={connections.error} onRetry={() => void connections.refetch()} />
      )}
    </section>
  }

  return <section aria-labelledby="connector-connections" className="cx-connector-section">
    <h2 id="connector-connections" className="cx-section-title">Conexões do Workspace <span className="cx-count">{connections.data.entries.length}</span></h2>
    {connections.data.entries.length === 0 ? (
      <p className="cx-connector-empty">Nenhuma conexão criada ainda.</p>
    ) : (
      <ul className="cx-connection-list">
        {connections.data.entries.map((connection) => (
          <ConnectionRow key={connection.connectionId} workspaceId={workspaceId} connection={connection} onChanged={refresh} />
        ))}
      </ul>
    )}
    {connections.data.entries.some((connection) => !connection.disabledAt) && (
      <p className="cx-field-hint">Para trocar a credencial de uma conexão, desative-a e adicione outra.</p>
    )}
    <CreateConnectionForm workspaceId={workspaceId} onCreated={refresh} />
  </section>
}

function ConnectionRow({ workspaceId, connection, onChanged }: Readonly<{ workspaceId: string; connection: ConnectorConnection; onChanged: () => void }>) {
  const [outcomeMessage, setOutcomeMessage] = useState('')
  const [confirmingDisable, setConfirmingDisable] = useState(false)
  const check = useMutation({
    mutationFn: () => checkWorkspaceConnection(workspaceId, connection.connectionId),
    onSuccess: (outcome: ConnectionCheckOutcome) => setOutcomeMessage(checkOutcomeMessage(outcome)),
    onError: (error) => setOutcomeMessage(failureText(error)),
  })
  const disable = useMutation({
    mutationFn: () => disableWorkspaceConnection(workspaceId, connection.connectionId),
    onSuccess: () => { setConfirmingDisable(false); onChanged() },
    onError: (error) => { setConfirmingDisable(false); setOutcomeMessage(failureText(error)) },
  })
  const disabled = connection.disabledAt !== undefined

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
  const pendingConnectionId = useRef<ConnectionId | null>(null)
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createWorkspaceConnection>[1]) => createWorkspaceConnection(workspaceId, input),
    onSuccess: () => { pendingConnectionId.current = null; setMessage(''); setCreated(true); onCreated() },
    onError: (error) => { setCreated(false); setMessage(failureText(error)) },
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
    pendingConnectionId.current ??= ConnectionId.parse(crypto.randomUUID())
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

function BindingsSection({ projectId }: Readonly<{ projectId: string }>) {
  const queryClient = useQueryClient()
  const bindings = useQuery(projectConnectionBindingsQuery(projectId))
  const refresh = () => queryClient.invalidateQueries({ queryKey: [CON08.id] })

  if (bindings.isPending) {
    return <section aria-labelledby="connector-bindings" className="cx-connector-section" aria-busy="true">
      <h2 id="connector-bindings" className="cx-section-title">Integrações deste Projeto</h2>
      <span className="sr-only" role="status">Carregando as integrações</span>
      <Skeleton className="cx-skeleton-line" />
    </section>
  }
  if (bindings.isError) {
    return <section aria-labelledby="connector-bindings" className="cx-connector-section">
      <h2 id="connector-bindings" className="cx-section-title">Integrações deste Projeto</h2>
      {isConnectorBindingsForbidden(bindings.error) ? (
        <div className="cx-state" role="alert"><h2>Só o Owner do Workspace vincula e desvincula conexões deste Projeto.</h2></div>
      ) : (
        <FailureState title="Não foi possível carregar as integrações" error={bindings.error} onRetry={() => void bindings.refetch()} />
      )}
    </section>
  }

  const bound = bindings.data.entries.filter((entry): entry is ProjectConnectionBinding => entry.kind === 'binding')
  const bindable = bindings.data.entries.filter((entry): entry is BindableConnection => entry.kind === 'bindable')

  return <section aria-labelledby="connector-bindings" className="cx-connector-section">
    <h2 id="connector-bindings" className="cx-section-title">Integrações deste Projeto</h2>
    <h3 className="cx-connector-subtitle">Vinculadas <span className="cx-count">{bound.length}</span></h3>
    {bound.length === 0 ? (
      <p className="cx-connector-empty">Nenhuma conexão vinculada ainda.</p>
    ) : (
      <ul className="cx-connection-list">
        {bound.map((binding) => <BindingRow key={binding.bindingId} projectId={projectId} binding={binding} onChanged={refresh} />)}
      </ul>
    )}
    {bindable.length > 0 && <>
      <h3 className="cx-connector-subtitle">Disponíveis para vincular</h3>
      <ul className="cx-connection-list">
        {bindable.map((connection) => (
          <BindableRow key={connection.connectionId} projectId={projectId} connection={connection} onChanged={refresh} />
        ))}
      </ul>
    </>}
  </section>
}

function BindingRow({ projectId, binding, onChanged }: Readonly<{ projectId: string; binding: ProjectConnectionBinding; onChanged: () => void }>) {
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const unbind = useMutation({
    mutationFn: () => unbindProjectConnection(projectId, binding.bindingId),
    onSuccess: () => { setConfirming(false); onChanged() },
    onError: (error) => { setConfirming(false); setMessage(failureText(error)) },
  })

  return <li className="cx-connection">
    <div className="cx-connection-main">
      <strong>{binding.label}</strong>
      <span className="cx-connection-meta">vinculada em {formatDate(binding.boundAt)}</span>
      <code className="cx-connection-id">{binding.name}</code>
    </div>
    <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>Desvincular</Button>
    {message && <p className="cx-form-status" data-tone="error" role="alert">{message}</p>}

    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Desvincular {binding.label}?</AlertDialog.Title>
          <AlertDialog.Description>
            O Projeto para de conseguir usar esta conexão pelo nome {binding.name} assim que o vínculo for desfeito. O registro fica guardado.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Voltar</AlertDialog.Cancel>
          <AlertDialog.Action onClick={() => unbind.mutate()}>Desvincular</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  </li>
}

function BindableRow({ projectId, connection, onChanged }: Readonly<{ projectId: string; connection: BindableConnection; onChanged: () => void }>) {
  const nameId = useId()
  const [message, setMessage] = useState('')
  const bind = useMutation({
    mutationFn: (name: BindingName) => bindProjectConnection(projectId, { connectionId: connection.connectionId, name }),
    onSuccess: () => onChanged(),
    onError: (error) => setMessage(failureText(error)),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (bind.isPending) return
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    const parsed = BindingName.safeParse(name)
    if (!parsed.success) {
      setMessage('Use letras minúsculas, números e hífen, começando por uma letra.')
      return
    }
    setMessage('')
    bind.mutate(parsed.data)
  }

  return <li className="cx-connection">
    <div className="cx-connection-main">
      <strong>{connection.label}</strong>
      <Label htmlFor={nameId} className="cx-connection-meta">Nome no Projeto</Label>
    </div>
    <form className="cx-connection-actions" onSubmit={submit} noValidate>
      <Input id={nameId} name="name" type="text" size="sm" autoComplete="off" required maxLength={40} placeholder="erp" />
      <Button type="submit" variant="primary" size="sm" disabled={bind.isPending}>{bind.isPending ? 'Vinculando…' : 'Vincular'}</Button>
    </form>
    {message && <p className="cx-form-status" data-tone="error" role="alert">{message}</p>}
  </li>
}
