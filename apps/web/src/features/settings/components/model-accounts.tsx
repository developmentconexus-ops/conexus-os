import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Notice } from '@mastra/playground-ui/components/Notice'
import { ThemeProvider } from '@mastra/playground-ui/components/ThemeProvider'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { useBuilderModels } from '../../builder/mastra-session'
import {
  clearMyDefaults, completeOAuth, listModelAccounts, type ModelDefaults, type ModelProvider, modelAccountsQueryKey, modelDefaultsQueryKey,
  type OAuthStart, pollOAuth, readModelDefaults, removeApiKey, saveApiKey, saveInstallationDefaults, saveMyDefaults, shareWithEveryone,
  signOut, startOAuth, stopSharing,
} from '../model-accounts-api'

const ownKind = (provider: ModelProvider) => provider.userCredential === 'oauth' ? 'assinatura' : 'chave de API'
const sharedKind = (provider: ModelProvider) => provider.orgCredential === 'oauth' ? 'assinatura' : 'chave de API'

function useAccountsRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey })
}

function OAuthFlow({ provider, flow, onDone }: Readonly<{ provider: string; flow: OAuthStart; onDone: (error?: string) => void }>) {
  const [code, setCode] = useState('')
  const codeId = useId()
  // The poll loop lives as long as the flow, whatever the parent re-renders with.
  const finish = useRef(onDone)
  finish.current = onDone
  useEffect(() => {
    const onDone = (error?: string) => finish.current(error)
    if (flow.kind !== 'device-code') return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (delay: number) => {
      timer = setTimeout(async () => {
        if (stopped) return
        try {
          const step = await pollOAuth(provider, flow.sessionId)
          if (step.status === 'complete') onDone()
          else if (step.status === 'failed') onDone(step.error ?? 'A entrada falhou.')
          else void poll(step.nextPollMs ?? 2000)
        } catch {
          onDone('A entrada falhou.')
        }
      }, delay)
    }
    void poll(flow.nextPollMs ?? 2000)
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [provider, flow])
  const complete = useMutation({
    mutationFn: () => completeOAuth(provider, flow.sessionId, code),
    onSuccess: (step) => onDone(step.status === 'complete' ? undefined : step.error ?? 'A entrada falhou.'),
    onError: () => onDone('O código não foi aceito.'),
  })
  return <div className="model-account-oauth">
    <p><a href={flow.url} target="_blank" rel="noreferrer">Abrir a página de entrada do provedor</a></p>
    {flow.userCode && <p>Código para informar: <code>{flow.userCode}</code></p>}
    {flow.kind === 'paste-code'
      ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); complete.mutate() }}>
        <label htmlFor={codeId}>Cole o código exibido pelo provedor</label>
        <Input id={codeId} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" />
        <Button type="submit" variant="primary" disabled={!code.trim() || complete.isPending}>Concluir entrada</Button>
      </form>
      : <p>Aguardando você concluir a entrada no provedor.</p>}
  </div>
}

function ConnectAccount({ providers }: Readonly<{ providers: readonly ModelProvider[] }>) {
  const refresh = useAccountsRefresh()
  const [provider, setProvider] = useState('')
  const [key, setKey] = useState('')
  const [flow, setFlow] = useState<OAuthStart | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const providerId = useId()
  const keyId = useId()
  const chosen = providers.find((entry) => entry.provider === provider)
  const save = useMutation({
    mutationFn: () => saveApiKey(provider, key.trim()),
    onSuccess: () => { setKey(''); setMessage('Conta conectada.'); void refresh() },
    onError: () => setMessage('Não foi possível salvar a chave.'),
  })
  const start = useMutation({
    mutationFn: () => startOAuth(provider),
    onSuccess: setFlow,
    onError: () => setMessage('Não foi possível iniciar a entrada com este provedor.'),
  })
  return <section aria-labelledby={`${providerId}-title`} className="model-account-connect">
    <h3 id={`${providerId}-title`}>Conectar uma conta</h3>
    <label htmlFor={providerId}>Provedor</label>
    <select id={providerId} value={provider} onChange={(event) => { setProvider(event.target.value); setFlow(null); setMessage(null) }}>
      <option value="">Escolha um provedor</option>
      {providers.map((entry) => <option key={entry.provider} value={entry.provider}>{entry.provider}</option>)}
    </select>
    {chosen?.oauth?.supported && !flow && <Button type="button" onClick={() => start.mutate()} disabled={start.isPending}>Entrar com a sua assinatura</Button>}
    {chosen && flow && <OAuthFlow provider={chosen.provider} flow={flow} onDone={(error) => { setFlow(null); setMessage(error ?? 'Conta conectada.'); void refresh() }} />}
    {chosen && !flow && <form onSubmit={(event: FormEvent) => { event.preventDefault(); save.mutate() }}>
      <label htmlFor={keyId}>Chave de API</label>
      <Input id={keyId} type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
      <Button type="submit" variant="primary" disabled={!key.trim() || save.isPending}>Salvar chave</Button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>
}

function AccountRow({ provider, administrator }: Readonly<{ provider: ModelProvider; administrator: boolean }>) {
  const refresh = useAccountsRefresh()
  const [failed, setFailed] = useState(false)
  const act = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => { setFailed(false); void refresh() },
    onError: () => setFailed(true),
  })
  const mine = provider.userCredential !== undefined
  const shared = provider.orgCredential !== undefined
  return <li className="model-account">
    <strong>{provider.provider}</strong>
    {mine && <span> · Sua conta ({ownKind(provider)})</span>}
    {shared && <span> · Compartilhada com todos ({sharedKind(provider)})</span>}
    <div className="model-account-actions">
      {mine && <Button type="button" variant="outline" disabled={act.isPending}
        onClick={() => act.mutate(() => provider.userCredential === 'oauth' ? signOut(provider.provider) : removeApiKey(provider.provider))}>Desconectar</Button>}
      {administrator && mine && !shared && <Button type="button" disabled={act.isPending} onClick={() => act.mutate(() => shareWithEveryone(provider.provider))}>Compartilhar com todos</Button>}
      {administrator && shared && <Button type="button" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => stopSharing(provider.provider))}>Parar de compartilhar</Button>}
    </div>
    {failed && <p role="alert">Não foi possível concluir. Tente novamente.</p>}
  </li>
}

function ModelAccountsSection() {
  const accounts = useQuery({ queryKey: modelAccountsQueryKey, queryFn: listModelAccounts })
  if (accounts.isPending) return <p>Carregando suas contas de modelo</p>
  if (accounts.isError) return <p role="alert">Não foi possível consultar suas contas de modelo.</p>
  const administrator = accounts.data.orgKeyAdmin === true
  const connected = accounts.data.providers.filter((provider) => provider.userCredential || provider.orgCredential)
  return <>
    {connected.length === 0
      ? <p>Nenhuma conta conectada. Conecte a sua para usar o Builder.</p>
      : <ul className="model-accounts">{connected.map((provider) => <AccountRow key={provider.provider} provider={provider} administrator={administrator} />)}</ul>}
    {administrator && <Notice variant="warning"><Notice.Message>Os termos de uma assinatura podem proibir o uso por outras pessoas; confira antes de compartilhar.</Notice.Message></Notice>}
    <ConnectAccount providers={accounts.data.providers} />
  </>
}

function DefaultsForm({ title, value, onSave, onClear }: Readonly<{
  title: string
  value: ModelDefaults | null
  onSave: (defaults: ModelDefaults) => Promise<unknown>
  onClear?: () => Promise<unknown>
}>) {
  const queryClient = useQueryClient()
  const models = useBuilderModels()
  const [build, setBuild] = useState(value?.build ?? '')
  const [fast, setFast] = useState(value?.fast ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const buildId = useId()
  const fastId = useId()
  const done = (text: string) => { setMessage(text); void queryClient.invalidateQueries({ queryKey: modelDefaultsQueryKey }) }
  const save = useMutation({ mutationFn: () => onSave({ build, fast }), onSuccess: () => done('Padrões salvos.'), onError: () => setMessage('Não foi possível salvar.') })
  const clear = useMutation({ mutationFn: () => onClear?.() ?? Promise.resolve(), onSuccess: () => { setBuild(''); setFast(''); done('Padrões removidos.') }, onError: () => setMessage('Não foi possível remover.') })
  const options = (models.data ?? []).map((model) => <option key={model.id} value={model.id}>{`${model.provider} · ${model.modelName}`}</option>)
  return <form className="model-defaults" onSubmit={(event: FormEvent) => { event.preventDefault(); save.mutate() }}>
    <h3>{title}</h3>
    <label htmlFor={buildId}>Modelo de construção</label>
    <select id={buildId} value={build} onChange={(event) => setBuild(event.target.value)}>
      <option value="" disabled>Escolha um modelo</option>{options}
    </select>
    <label htmlFor={fastId}>Modelo rápido</label>
    <select id={fastId} value={fast} onChange={(event) => setFast(event.target.value)}>
      <option value="" disabled>Escolha um modelo</option>{options}
    </select>
    <Button type="submit" variant="primary" disabled={!build || !fast || save.isPending}>Salvar</Button>
    {onClear && value && <Button type="button" variant="outline" disabled={clear.isPending} onClick={() => clear.mutate()}>Usar os modelos padrão</Button>}
    {message && <p role="status">{message}</p>}
  </form>
}

function ModelDefaultsSection() {
  const defaults = useQuery({ queryKey: modelDefaultsQueryKey, queryFn: readModelDefaults })
  if (defaults.isPending) return <p>Carregando seus padrões</p>
  if (defaults.isError) return <p role="alert">Não foi possível consultar os padrões de modelo.</p>
  const { installation, mine, administrator } = defaults.data
  return <>
    <DefaultsForm title="Meus padrões" value={mine ?? installation} onSave={saveMyDefaults} onClear={clearMyDefaults} />
    {administrator && <DefaultsForm title="Modelos padrão" value={installation} onSave={saveInstallationDefaults} />}
  </>
}

export function ModelAccountSettings() {
  return <ThemeProvider defaultTheme="light" storageKey="conexus-builder-theme">
    <section className="settings-model-accounts" aria-labelledby="model-accounts-title">
      <h2 id="model-accounts-title">Contas de modelo</h2>
      <p>Cada pessoa usa a própria conta. Uma conta compartilhada com todos atende quem não conectou a sua.</p>
      <ModelAccountsSection />
    </section>
    <section className="settings-model-defaults" aria-labelledby="model-defaults-title">
      <h2 id="model-defaults-title">Modelos</h2>
      <p>Uma conversa nova começa com os seus padrões; na conversa, o seletor troca o modelo só dela.</p>
      <ModelDefaultsSection />
    </section>
  </ThemeProvider>
}
