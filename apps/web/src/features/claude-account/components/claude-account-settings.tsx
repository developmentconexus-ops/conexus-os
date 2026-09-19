import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ClaudeAccountRequestError,
  claudeConnectionsQueryKey,
  completeClaudeAuthorization,
  listClaudeConnections,
  revokeClaudeConnection,
  selectClaudeConnection,
  shareClaudeConnection,
  startClaudeAuthorization,
  unshareClaudeConnection,
} from '../api'

export type SettingsWorkspace = Readonly<{ workspaceId: string; name: string }>

// The list never carries the owner's name, only their Account id, so a connection someone
// else shared is named by the Workspace it came through rather than by a person.
const ownership = (
  connection: Readonly<{ ownerAccountId: string; workspaceId: string }>,
  currentAccountId: string,
  workspaces: readonly SettingsWorkspace[],
) => {
  if (connection.ownerAccountId === currentAccountId) return 'Sua conexão'
  const workspace = workspaces.find((candidate) => candidate.workspaceId === connection.workspaceId)
  return workspace ? `Compartilhada com ${workspace.name}` : 'Compartilhada com você'
}

const safeMessage = (error: unknown) => {
  if (error instanceof ClaudeAccountRequestError && error.problemType === 'urn:conexus:problem:claude-authorization-rejected') return 'O Claude recusou essa autorização. Inicie uma nova conexão e cole um novo code#state.'
  if (error instanceof ClaudeAccountRequestError && error.problemType === 'urn:conexus:problem:claude-connection-publish-failed') return 'A autorização foi aceita, mas o Hub não conseguiu publicar a conexão. Tente novamente.'
  if (error instanceof ClaudeAccountRequestError && error.status === 422) return 'O resultado de autorização não foi aceito. Confira o formato code#state e inicie uma nova conexão.'
  return 'Não foi possível concluir essa operação. Tente novamente.'
}

export function ClaudeAccountSettings({
  workspaces,
  currentAccountId,
}: {
  workspaces: readonly SettingsWorkspace[]
  currentAccountId: string
}) {
  const queryClient = useQueryClient()
  const connections = useQuery({ queryKey: claudeConnectionsQueryKey, queryFn: listClaudeConnections })
  const [authorizationResult, setAuthorizationResult] = useState('')
  const [label, setLabel] = useState('Minha conta Claude')
  const [shareConnectionId, setShareConnectionId] = useState('')
  const [shareWorkspaceId, setShareWorkspaceId] = useState(workspaces[0]?.workspaceId ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const start = useMutation({ mutationFn: startClaudeAuthorization, onSuccess: ({ url }) => { window.open(url, '_blank', 'noopener,noreferrer'); setMessage('Autorização aberta em uma nova aba. Cole aqui o resultado code#state quando terminar.') }, onError: (error) => setMessage(safeMessage(error)) })
  const complete = useMutation({ mutationFn: completeClaudeAuthorization, onSuccess: async () => { setAuthorizationResult(''); await queryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setMessage('Conta Claude conectada com segurança.') }, onError: (error) => setMessage(safeMessage(error)) })
  const select = useMutation({ mutationFn: selectClaudeConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setMessage('Conexão selecionada para novos BuilderRuns.') }, onError: (error) => setMessage(safeMessage(error)) })
  const share = useMutation({ mutationFn: shareClaudeConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setShareConnectionId(''); setMessage('Conexão compartilhada com o Workspace. Quem for membro dele pode usá-la nos próprios runs.') }, onError: (error) => setMessage(safeMessage(error)) })
  const unshare = useMutation({ mutationFn: unshareClaudeConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setMessage('Compartilhamento retirado.') }, onError: (error) => setMessage(safeMessage(error)) })
  const revoke = useMutation({ mutationFn: revokeClaudeConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setMessage('Conexão revogada para novos BuilderRuns.') }, onError: (error) => setMessage(safeMessage(error)) })

  if (connections.isPending) return <section className="settings-card"><p>Carregando conexões Claude…</p></section>
  if (connections.isError) return <section className="settings-card"><h2>Claude</h2><p role="alert">Não foi possível consultar suas conexões Claude.</p><button type="button" onClick={() => void connections.refetch()}>Tentar novamente</button></section>

  return <section className="settings-card">
    <div className="page-heading"><div><p className="eyebrow">Credencial do Builder</p><h2>Claude</h2></div><button type="button" onClick={() => start.mutate()} disabled={start.isPending}>{start.isPending ? 'Abrindo…' : 'Conectar Claude'}</button></div>
    <p className="panel-intro">A conexão selecionada será usada somente em novos BuilderRuns. Tokens não ficam no navegador.</p>
    {message && <p role="status" className="settings-message">{message}</p>}
    <form onSubmit={(event) => { event.preventDefault(); complete.mutate({ result: authorizationResult.trim(), label: label.trim() }) }}>
      <label><span>Resultado da autorização</span><input value={authorizationResult} onChange={(event) => setAuthorizationResult(event.target.value)} placeholder="code#state" pattern="[^#]+#[^#]+" title="Use o formato code#state" autoComplete="off" required /></label>
      <label><span>Nome da conexão</span><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required /></label>
      <button type="submit" disabled={complete.isPending || !authorizationResult.trim() || !label.trim()}>{complete.isPending ? 'Conectando…' : 'Concluir conexão'}</button>
    </form>
    <div className="settings-list">
      <h3>Conexões disponíveis</h3>
      {connections.data.length === 0 ? <p className="empty">Nenhuma conexão Claude foi adicionada.</p> : connections.data.map((connection) => <article className="settings-connection" key={connection.connectionId}>
        <div>
          <strong>{connection.label}</strong>
          <p>{connection.state === 'ACTIVE' ? 'Ativa' : 'Revogada'} · geração •••{connection.generation.slice(-2)} · {ownership(connection, currentAccountId, workspaces)}</p>
        </div>
        <div className="settings-actions">
          <button type="button" disabled={connection.state !== 'ACTIVE' || select.isPending} onClick={() => select.mutate(connection.connectionId)}>Usar nos próximos runs</button>
          {connection.ownerAccountId === currentAccountId && <button type="button" disabled={connection.state !== 'ACTIVE' || unshare.isPending} onClick={() => unshare.mutate({ connectionId: connection.connectionId, workspaceId: connection.workspaceId })}>Parar de compartilhar</button>}
          {connection.role === 'OWNER' && <button type="button" disabled={connection.state !== 'ACTIVE' || revoke.isPending} onClick={() => revoke.mutate(connection.connectionId)}>Revogar</button>}
        </div>
      </article>)}
    </div>
    <form onSubmit={(event) => { event.preventDefault(); share.mutate({ connectionId: shareConnectionId, workspaceId: shareWorkspaceId }) }}>
      <h3>Compartilhar uma conexão com um Workspace</h3>
      <p className="panel-intro">Quem for membro do Workspace passa a poder usar esta conexão nos próprios runs, inclusive quem entrar depois. Ninguém vê o token.</p>
      {workspaces.length === 0
        ? <p className="empty">Você ainda não pertence a nenhum Workspace.</p>
        : <>
          <label>
            <span>Conexão</span>
            <select value={shareConnectionId} onChange={(event) => setShareConnectionId(event.target.value)} required>
              <option value="">Escolha uma conexão sua</option>
              {connections.data.filter((connection) => connection.ownerAccountId === currentAccountId && connection.state === 'ACTIVE').map((connection) => <option key={connection.connectionId} value={connection.connectionId}>{connection.label}</option>)}
            </select>
          </label>
          <label>
            <span>Workspace</span>
            <select value={shareWorkspaceId} onChange={(event) => setShareWorkspaceId(event.target.value)} required>
              {workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={share.isPending || !shareConnectionId || !shareWorkspaceId}>Compartilhar</button>
        </>}
    </form>
  </section>
}
