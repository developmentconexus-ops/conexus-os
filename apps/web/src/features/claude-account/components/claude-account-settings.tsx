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
} from '../api'

const safeMessage = (error: unknown) => {
  if (error instanceof ClaudeAccountRequestError && error.problemType === 'urn:conexus:problem:claude-authorization-rejected') return 'O Claude recusou essa autorização. Inicie uma nova conexão e cole um novo code#state.'
  if (error instanceof ClaudeAccountRequestError && error.problemType === 'urn:conexus:problem:claude-connection-publish-failed') return 'A autorização foi aceita, mas o Hub não conseguiu publicar a conexão. Tente novamente.'
  if (error instanceof ClaudeAccountRequestError && error.status === 422) return 'O resultado de autorização não foi aceito. Confira o formato code#state e inicie uma nova conexão.'
  return 'Não foi possível concluir essa operação. Tente novamente.'
}

export function ClaudeAccountSettings() {
  const queryClient = useQueryClient()
  const connections = useQuery({ queryKey: claudeConnectionsQueryKey, queryFn: listClaudeConnections })
  const [authorizationResult, setAuthorizationResult] = useState('')
  const [label, setLabel] = useState('Minha conta Claude')
  const [shareConnectionId, setShareConnectionId] = useState('')
  const [shareAccountId, setShareAccountId] = useState('')
  const [shareWorkspaceId, setShareWorkspaceId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const start = useMutation({ mutationFn: startClaudeAuthorization, onSuccess: ({ url }) => { window.open(url, '_blank', 'noopener,noreferrer'); setMessage('Autorização aberta em uma nova aba. Cole aqui o resultado code#state quando terminar.') }, onError: (error) => setMessage(safeMessage(error)) })
  const complete = useMutation({ mutationFn: completeClaudeAuthorization, onSuccess: async () => { setAuthorizationResult(''); await queryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setMessage('Conta Claude conectada com segurança.') }, onError: (error) => setMessage(safeMessage(error)) })
  const select = useMutation({ mutationFn: selectClaudeConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setMessage('Conexão selecionada para novos BuilderRuns.') }, onError: (error) => setMessage(safeMessage(error)) })
  const share = useMutation({ mutationFn: shareClaudeConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setShareAccountId(''); setMessage('Conexão compartilhada.') }, onError: (error) => setMessage(safeMessage(error)) })
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
        <div><strong>{connection.label}</strong><p>{connection.state === 'ACTIVE' ? 'Ativa' : 'Revogada'} · geração •••{connection.generation.slice(-2)} · {connection.role === 'OWNER' ? 'Sua conexão' : 'Compartilhada'}</p></div>
        <div className="settings-actions"><button type="button" disabled={connection.state !== 'ACTIVE' || select.isPending} onClick={() => select.mutate(connection.connectionId)}>Usar nos próximos runs</button>{connection.role === 'OWNER' && <button type="button" disabled={connection.state !== 'ACTIVE' || revoke.isPending} onClick={() => revoke.mutate(connection.connectionId)}>Revogar</button>}</div>
      </article>)}
    </div>
    <form onSubmit={(event) => { event.preventDefault(); share.mutate({ connectionId: shareConnectionId, accountId: shareAccountId, workspaceId: shareWorkspaceId }) }}>
      <h3>Compartilhar uma conexão</h3>
      <label><span>Connection ID</span><input value={shareConnectionId} onChange={(event) => setShareConnectionId(event.target.value)} placeholder="ID da conexão" required /></label>
      <label><span>Account ID autorizado</span><input value={shareAccountId} onChange={(event) => setShareAccountId(event.target.value)} placeholder="ID da Account" required /></label>
      <label><span>Workspace ID</span><input value={shareWorkspaceId} onChange={(event) => setShareWorkspaceId(event.target.value)} placeholder="ID do Workspace" required /></label>
      <button type="submit" disabled={share.isPending}>Compartilhar</button>
    </form>
  </section>
}
