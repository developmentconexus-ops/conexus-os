import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  ModelConnectionRequestError,
  modelConnectionsQueryKey,
  addModelConnectionApiKey,
  completeModelAuthorization,
  listModelConnections,
  revokeModelConnection,
  selectModelConnection,
  shareModelConnection,
  startModelAuthorization,
  unshareModelConnection,
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
  if (error instanceof ModelConnectionRequestError && error.problemType === 'urn:conexus:problem:model-authorization-rejected') return 'O provedor recusou essa autorização. Inicie uma nova conexão e cole um novo code#state.'
  if (error instanceof ModelConnectionRequestError && error.problemType === 'urn:conexus:problem:model-connection-publish-failed') return 'A autorização foi aceita, mas o Hub não conseguiu publicar a conexão. Tente novamente.'
  if (error instanceof ModelConnectionRequestError && error.status === 422) return 'O resultado de autorização não foi aceito. Confira o formato code#state e inicie uma nova conexão.'
  return 'Não foi possível concluir essa operação. Tente novamente.'
}

export function ModelConnectionSettings({
  workspaces,
  currentAccountId,
}: {
  workspaces: readonly SettingsWorkspace[]
  currentAccountId: string
}) {
  const queryClient = useQueryClient()
  const connections = useQuery({ queryKey: modelConnectionsQueryKey, queryFn: listModelConnections })
  const [authorizationResult, setAuthorizationResult] = useState('')
  const [label, setLabel] = useState('Minha conta Anthropic')
  // The picker offers only what the operator's model catalog enables, so a member cannot file a
  // key under a provider this deployment will never run.
  const providers = useMemo(() => connections.data?.providers ?? [], [connections.data])
  const [apiKeyProvider, setApiKeyProvider] = useState('')
  const [apiKeyLabel, setApiKeyLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const selectedProvider = apiKeyProvider || providers[0] || ''
  const [shareConnectionId, setShareConnectionId] = useState('')
  const [shareWorkspaceId, setShareWorkspaceId] = useState(workspaces[0]?.workspaceId ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const start = useMutation({ mutationFn: startModelAuthorization, onSuccess: ({ url }) => { window.open(url, '_blank', 'noopener,noreferrer'); setMessage('Autorização aberta em uma nova aba. Cole aqui o resultado code#state quando terminar.') }, onError: (error) => setMessage(safeMessage(error)) })
  const complete = useMutation({ mutationFn: completeModelAuthorization, onSuccess: async () => { setAuthorizationResult(''); await queryClient.invalidateQueries({ queryKey: modelConnectionsQueryKey }); setMessage('Conexão de modelo criada com segurança.') }, onError: (error) => setMessage(safeMessage(error)) })
  const select = useMutation({ mutationFn: selectModelConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: modelConnectionsQueryKey }); setMessage('Conexão selecionada para novos BuilderRuns.') }, onError: (error) => setMessage(safeMessage(error)) })
  const share = useMutation({ mutationFn: shareModelConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: modelConnectionsQueryKey }); setShareConnectionId(''); setMessage('Conexão compartilhada com o Workspace. Quem for membro dele pode usá-la nos próprios runs.') }, onError: (error) => setMessage(safeMessage(error)) })
  const unshare = useMutation({ mutationFn: unshareModelConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: modelConnectionsQueryKey }); setMessage('Compartilhamento retirado.') }, onError: (error) => setMessage(safeMessage(error)) })
  const addKey = useMutation({ mutationFn: addModelConnectionApiKey, onSuccess: async () => { setApiKey(''); setApiKeyLabel(''); await queryClient.invalidateQueries({ queryKey: modelConnectionsQueryKey }); setMessage('Chave guardada em custódia. Ela nunca é exibida novamente.') }, onError: (error) => setMessage(safeMessage(error)) })
  const revoke = useMutation({ mutationFn: revokeModelConnection, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: modelConnectionsQueryKey }); setMessage('Conexão revogada para novos BuilderRuns.') }, onError: (error) => setMessage(safeMessage(error)) })

  if (connections.isPending) return <section className="settings-card"><p>Carregando conexões de modelo…</p></section>
  if (connections.isError) return <section className="settings-card"><h2>Conexões de modelo</h2><p role="alert">Não foi possível consultar suas conexões de modelo.</p><button type="button" onClick={() => void connections.refetch()}>Tentar novamente</button></section>

  return <section className="settings-card">
    <div className="page-heading"><div><p className="eyebrow">Credencial do Builder</p><h2>Conexões de modelo</h2></div><button type="button" onClick={() => start.mutate()} disabled={start.isPending}>{start.isPending ? "Abrindo…" : "Conectar conta Anthropic"}</button></div>
    <p className="panel-intro">A conexão selecionada será usada somente em novos BuilderRuns. Tokens não ficam no navegador.</p>
    {message && <p role="status" className="settings-message">{message}</p>}
    <form onSubmit={(event) => { event.preventDefault(); complete.mutate({ result: authorizationResult.trim(), label: label.trim() }) }}>
      <label><span>Resultado da autorização</span><input value={authorizationResult} onChange={(event) => setAuthorizationResult(event.target.value)} placeholder="code#state" pattern="[^#]+#[^#]+" title="Use o formato code#state" autoComplete="off" required /></label>
      <label><span>Nome da conexão</span><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required /></label>
      <button type="submit" disabled={complete.isPending || !authorizationResult.trim() || !label.trim()}>{complete.isPending ? 'Conectando…' : 'Concluir conexão'}</button>
    </form>
    <form onSubmit={(event) => { event.preventDefault(); addKey.mutate({ providerId: selectedProvider, label: apiKeyLabel.trim(), apiKey }) }}>
      <h3>Conectar por chave de API</h3>
      <p className="panel-intro">A chave é guardada em custódia e nunca é devolvida por nenhuma operação.</p>
      <label><span>Provedor</span>
        <select value={selectedProvider} onChange={(event) => setApiKeyProvider(event.target.value)} required>
          {providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
        </select>
      </label>
      <label><span>Nome da conexão</span><input value={apiKeyLabel} onChange={(event) => setApiKeyLabel(event.target.value)} maxLength={120} required /></label>
      <label><span>Chave de API</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} minLength={8} maxLength={4096} autoComplete="off" spellCheck={false} required /></label>
      <button type="submit" disabled={addKey.isPending || !selectedProvider || !apiKeyLabel.trim() || apiKey.length < 8}>{addKey.isPending ? 'Guardando…' : 'Guardar chave'}</button>
    </form>
    <div className="settings-list">
      <h3>Conexões disponíveis</h3>
      {connections.data.connections.length === 0 ? <p className="empty">Nenhuma conexão de modelo foi adicionada.</p> : connections.data.connections.map((connection) => <article className="settings-connection" key={connection.connectionId}>
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
              {connections.data.connections.filter((connection) => connection.ownerAccountId === currentAccountId && connection.state === 'ACTIVE').map((connection) => <option key={connection.connectionId} value={connection.connectionId}>{connection.label}</option>)}
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
