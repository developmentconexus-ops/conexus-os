import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Badge } from '@mastra/playground-ui/components/Badge'
import { Button } from '@mastra/playground-ui/components/Button'
import { Combobox } from '@mastra/playground-ui/components/Combobox'
import { Input } from '@mastra/playground-ui/components/Input'
import { Tab, TabContent, TabList, Tabs } from '@mastra/playground-ui/components/Tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, UserRound } from 'lucide-react'
import { createContext, useContext, useId, useRef, useState, type RefObject } from 'react'
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
  type AccountSignIn,
  type ApiKeyProvider,
  type ModelConnection,
} from '../api'

export type SettingsWorkspace = Readonly<{ workspaceId: string; name: string }>

// What the person pastes back differs because the providers differ: Anthropic hosts a page that
// prints code#state, and OpenAI redirects to a port on the person's own machine that nothing is
// listening on, so the browser shows an error page and the address bar holds the result.
const PASTE_STEPS: Readonly<Record<string, Readonly<{ instruction: string; field: string; placeholder: string; pattern: string }>>> = {
  anthropic: {
    instruction: 'Autorize na aba que abriu. A página final mostra um código. Copie e cole aqui.',
    field: 'Código mostrado pela Anthropic',
    placeholder: 'código#estado',
    pattern: '[^#]+#[^#]+',
  },
  'openai-codex': {
    instruction: 'Autorize na aba que abriu. No final o navegador para em uma página que não carrega: isso é esperado. Copie o endereço inteiro da barra e cole aqui.',
    field: 'Endereço da página que não carregou',
    placeholder: 'http://localhost:1455/auth/callback?code=…',
    pattern: 'http://localhost:1455/auth/callback\\?.+',
  },
}

const failure = (error: unknown): string => {
  if (!(error instanceof ModelConnectionRequestError)) return 'Não foi possível concluir. Tente novamente.'
  if (error.problemType === 'urn:conexus:problem:model-authorization-rejected') return 'O provedor recusou essa autorização. Comece de novo e cole um resultado novo.'
  if (error.problemType === 'urn:conexus:problem:model-connection-publish-failed') return 'A autorização foi aceita, mas a conexão não pôde ser guardada. Tente novamente.'
  if (error.problemType === 'urn:conexus:problem:model-connection-provider-unknown') return 'Esse provedor não é conhecido pelo roteador de modelos.'
  if (error.status === 422) return 'O que foi colado não está no formato esperado. Comece de novo.'
  return 'Não foi possível concluir. Tente novamente.'
}

// Popups are portalled. Landing them inside the page keeps the library's own control styles in
// force instead of the app's global form rules.
const PopupContainer = createContext<RefObject<HTMLDivElement | null> | null>(null)

const useRefreshConnections = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: modelConnectionsQueryKey })
}

function AccountSignInCard({ signIn }: Readonly<{ signIn: AccountSignIn }>) {
  const refresh = useRefreshConnections()
  const fieldId = useId()
  const step = PASTE_STEPS[signIn.providerId]
  const [pasted, setPasted] = useState('')
  const [label, setLabel] = useState(`Minha conta ${signIn.name}`)
  const start = useMutation({ mutationFn: startModelAuthorization, onSuccess: ({ url }) => { window.open(url, '_blank', 'noopener,noreferrer') } })
  const complete = useMutation({ mutationFn: completeModelAuthorization, onSuccess: async () => { setPasted(''); start.reset(); await refresh() } })
  const error = start.error ?? complete.error
  return <article className="credential-card">
    <header><UserRound aria-hidden="true" size={18} /><div><strong>{signIn.name}</strong><span>Entrar com a sua conta. Usa a assinatura que você já paga.</span></div>
      {!start.isSuccess && <Button variant="primary" size="sm" disabled={start.isPending} onClick={() => start.mutate(signIn.providerId)}>{start.isPending ? 'Abrindo…' : 'Conectar'}</Button>}
    </header>
    {start.isSuccess && step && <form onSubmit={(event) => { event.preventDefault(); complete.mutate({ providerId: signIn.providerId, result: pasted.trim(), label: label.trim() }) }}>
      <p>{step.instruction}</p>
      <label htmlFor={`${fieldId}-result`}><span>{step.field}</span><Input id={`${fieldId}-result`} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={step.placeholder} pattern={step.pattern} autoComplete="off" required /></label>
      <label htmlFor={`${fieldId}-label`}><span>Nome da conexão</span><Input id={`${fieldId}-label`} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required /></label>
      <div className="credential-actions">
        <Button type="submit" variant="primary" size="sm" disabled={complete.isPending || !pasted.trim() || !label.trim()}>{complete.isPending ? 'Conectando…' : 'Concluir'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { start.reset(); complete.reset(); setPasted('') }}>Cancelar</Button>
      </div>
    </form>}
    {error && <p role="alert" className="credential-error">{failure(error)}</p>}
  </article>
}

function ApiKeyForm({ providers }: Readonly<{ providers: readonly ApiKeyProvider[] }>) {
  const refresh = useRefreshConnections()
  const popups = useContext(PopupContainer)
  const fieldId = useId()
  const [providerId, setProviderId] = useState('')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const provider = providers.find((candidate) => candidate.providerId === providerId)
  const add = useMutation({ mutationFn: addModelConnectionApiKey, onSuccess: async () => { setApiKey(''); setLabel(''); await refresh() } })
  return <form className="credential-card" onSubmit={(event) => { event.preventDefault(); add.mutate({ providerId, label: label.trim(), apiKey }) }}>
    <header><KeyRound aria-hidden="true" size={18} /><div><strong>Chave de API</strong><span>{providers.length} provedores que o roteador de modelos do Mastra conhece. A chave fica em custódia e nunca é mostrada de novo.</span></div></header>
    <div className="credential-field"><span>Provedor</span>
      <Combobox
        options={providers.map((candidate) => ({ value: candidate.providerId, label: candidate.name, description: candidate.providerId }))}
        value={providerId} onValueChange={(value) => { setProviderId(value); if (!label.trim()) setLabel(`Chave ${providers.find((candidate) => candidate.providerId === value)?.name ?? value}`) }}
        placeholder="Escolha um provedor" searchPlaceholder="Buscar provedor…" emptyText="Nenhum provedor com esse nome" aria-label="Provedor" container={popups} />
    </div>
    {provider?.docUrl && <a href={provider.docUrl} target="_blank" rel="noreferrer noopener">Onde encontrar a chave de {provider.name}</a>}
    <label htmlFor={`${fieldId}-label`}><span>Nome da conexão</span><Input id={`${fieldId}-label`} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required /></label>
    <label htmlFor={`${fieldId}-key`}><span>Chave</span><Input id={`${fieldId}-key`} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} minLength={8} maxLength={4096} autoComplete="off" spellCheck={false} required /></label>
    <div className="credential-actions"><Button type="submit" variant="primary" size="sm" disabled={add.isPending || !providerId || !label.trim() || apiKey.length < 8}>{add.isPending ? 'Guardando…' : 'Guardar chave'}</Button></div>
    {add.error && <p role="alert" className="credential-error">{failure(add.error)}</p>}
  </form>
}

function ConnectionRow({ connection, rows, providerName, currentAccountId, workspaces }: Readonly<{
  connection: ModelConnection
  rows: readonly ModelConnection[]
  providerName: string
  currentAccountId: string
  workspaces: readonly SettingsWorkspace[]
}>) {
  const refresh = useRefreshConnections()
  const popups = useContext(PopupContainer)
  const owned = connection.ownerAccountId === currentAccountId
  const active = connection.state === 'ACTIVE'
  const workspaceName = (workspaceId: string): string =>
    workspaces.find((workspace) => workspace.workspaceId === workspaceId)?.name ?? 'outro Workspace'
  // A row is one connection paired with one Workspace, and only `shared` says whether the
  // connection is in it: on an owner row the Workspace is merely one the owner can see.
  const sharedWith = rows.filter((row) => row.shared)
  const shareable = rows.filter((row) => !row.shared)
  const [shareWorkspaceId, setShareWorkspaceId] = useState('')
  const select = useMutation({ mutationFn: selectModelConnection, onSuccess: refresh })
  const share = useMutation({ mutationFn: shareModelConnection, onSuccess: async () => { setShareWorkspaceId(''); await refresh() } })
  const unshare = useMutation({ mutationFn: unshareModelConnection, onSuccess: refresh })
  const revoke = useMutation({ mutationFn: revokeModelConnection, onSuccess: refresh })
  const error = select.error ?? share.error ?? unshare.error ?? revoke.error
  return <article className="credential-row" data-state={connection.state}>
    <div className="credential-row-main">
      <div>
        <strong>{connection.label}</strong>
        <p>
          <Badge variant="neutral" emphasis="muted" size="sm">{providerName}</Badge>
          <Badge variant="blue" emphasis="muted" size="sm">{connection.credentialKind === 'API_KEY' ? 'Chave de API' : 'Conta'}</Badge>
          {!active && <Badge variant="red" emphasis="muted" size="sm">Revogada</Badge>}
          {active && connection.selected && <Badge variant="green" indicator="dot" size="sm">Em uso no Builder</Badge>}
          {!owned && <Badge variant="neutral" emphasis="muted" size="sm">{sharedWith.length > 0 ? `Compartilhada por ${sharedWith.map((row) => workspaceName(row.workspaceId)).join(', ')}` : 'Compartilhada com você'}</Badge>}
        </p>
      </div>
      {active && !connection.selected && <Button variant="outline" size="sm" disabled={select.isPending} onClick={() => select.mutate(connection.connectionId)}>Usar no Builder</Button>}
    </div>
    {owned && active && <div className="credential-row-manage">
      <div className="credential-shares">
        {sharedWith.map((row) => <span key={row.workspaceId}>Compartilhada com <strong>{workspaceName(row.workspaceId)}</strong>. <Button variant="ghost" size="xs" disabled={unshare.isPending} onClick={() => unshare.mutate({ connectionId: connection.connectionId, workspaceId: row.workspaceId })}>Parar de compartilhar</Button></span>)}
        {shareable.length > 0 && <span className="credential-share">
          <Combobox options={shareable.map((row) => ({ value: row.workspaceId, label: workspaceName(row.workspaceId) }))} value={shareWorkspaceId} onValueChange={setShareWorkspaceId} placeholder="Compartilhar com um Workspace" size="sm" aria-label="Workspace" container={popups} />
          <Button variant="outline" size="sm" disabled={!shareWorkspaceId || share.isPending} onClick={() => share.mutate({ connectionId: connection.connectionId, workspaceId: shareWorkspaceId })}>Compartilhar</Button>
        </span>}
      </div>
      {connection.role === 'OWNER' && <AlertDialog>
        <AlertDialog.Trigger render={<Button variant="destructive-ghost" size="xs">Revogar</Button>} />
        <AlertDialog.Portal><AlertDialog.Overlay /><AlertDialog.Content>
          <AlertDialog.Header><AlertDialog.Title>Revogar “{connection.label}”?</AlertDialog.Title><AlertDialog.Description>Novos pedidos no Builder deixam de poder usar esta conexão, para você e para quem a recebeu por compartilhamento. Não dá para desfazer.</AlertDialog.Description></AlertDialog.Header>
          <AlertDialog.Footer><AlertDialog.Cancel>Manter</AlertDialog.Cancel><AlertDialog.Action onClick={() => revoke.mutate(connection.connectionId)}>Revogar</AlertDialog.Action></AlertDialog.Footer>
        </AlertDialog.Content></AlertDialog.Portal>
      </AlertDialog>}
    </div>}
    {error && <p role="alert" className="credential-error">{failure(error)}</p>}
  </article>
}

export function ModelConnectionSettings({ workspaces, currentAccountId }: Readonly<{
  workspaces: readonly SettingsWorkspace[]
  currentAccountId: string
}>) {
  const popups = useRef<HTMLDivElement>(null)
  const connections = useQuery({ queryKey: modelConnectionsQueryKey, queryFn: listModelConnections })
  if (connections.isPending) return <p>Carregando credenciais…</p>
  if (connections.isError) return <div role="alert"><p>Não foi possível consultar suas credenciais.</p><Button variant="outline" size="sm" onClick={() => void connections.refetch()}>Tentar novamente</Button></div>
  const { accountSignIns, apiKeyProviders } = connections.data
  const providerName = (connection: ModelConnection): string =>
    accountSignIns.find((signIn) => signIn.providerId === connection.providerId)?.name
    ?? apiKeyProviders.find((provider) => provider.providerId === connection.providerId)?.name
    ?? connection.providerId
  // The endpoint returns one row per connection and Workspace pair, so an owned connection repeats
  // once per Workspace the owner can see. Settings is about the connection, not the pair.
  const groups: { connection: ModelConnection; rows: ModelConnection[] }[] = []
  const byConnection = new Map<string, { connection: ModelConnection; rows: ModelConnection[] }>()
  for (const row of connections.data.connections) {
    const group = byConnection.get(row.connectionId)
    if (group) group.rows.push(row)
    else { const created = { connection: row, rows: [row] }; byConnection.set(row.connectionId, created); groups.push(created) }
  }
  const ordered = groups.sort((left, right) => Number(right.connection.state === 'ACTIVE') - Number(left.connection.state === 'ACTIVE') || Number(right.connection.selected) - Number(left.connection.selected))
  return <PopupContainer.Provider value={popups}><div className="credentials">
    <section aria-labelledby="credentials-yours">
      <h2 id="credentials-yours">Suas conexões</h2>
      <p className="panel-intro">O Builder só oferece modelos dos provedores que têm uma conexão ativa aqui.</p>
      {ordered.length === 0
        ? <p className="empty">Nenhuma conexão ainda. Adicione uma abaixo para poder usar o Builder.</p>
        : ordered.map((group) => <ConnectionRow key={group.connection.connectionId} connection={group.connection} rows={group.rows} providerName={providerName(group.connection)} currentAccountId={currentAccountId} workspaces={workspaces} />)}
    </section>
    <section aria-labelledby="credentials-add">
      <h2 id="credentials-add">Adicionar conexão</h2>
      <Tabs defaultTab="account">
        <TabList variant="pill"><Tab value="account">Entrar com uma conta</Tab><Tab value="api-key">Chave de API</Tab></TabList>
        <TabContent value="account"><div className="credential-grid">{accountSignIns.map((signIn) => <AccountSignInCard key={signIn.providerId} signIn={signIn} />)}</div></TabContent>
        <TabContent value="api-key"><ApiKeyForm providers={apiKeyProviders} /></TabContent>
      </Tabs>
    </section>
    <div ref={popups} />
  </div></PopupContainer.Provider>
}
