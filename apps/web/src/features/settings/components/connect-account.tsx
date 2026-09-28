import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type KeyboardEvent, useEffect, useId, useReducer, useRef, useState } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { type ConnectState, connectFlowReducer, initialConnectState } from '../connect-flow'
import {
  apiKeySaveErrorMessage, oauthFailureMessage,
} from '../error-messages'
import {
  cancelOAuth, completeOAuth, type ModelAccountsRequestError, type ModelProvider, modelAccountsQueryKey, pollOAuth, saveApiKey, startOAuth,
} from '../model-accounts-api'
import { providerName } from '../provider-names'
import { groupProviders } from '../provider-groups'
import { StatusLine } from './states'

// A live "expira em MM:SS", or null while no expiry is known. Client-side only: a UX aid, not
// the actual expiry enforcement — the server still answers `failed`/expired on a stale session.
function useCountdown(expiresAt: string | undefined, onExpire: () => void): string | null {
  const expire = useRef(onExpire)
  expire.current = onExpire
  const [remainingMs, setRemainingMs] = useState<number | null>(() => expiresAt ? new Date(expiresAt).getTime() - Date.now() : null)
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setRemainingMs(ms)
      if (ms <= 0) expire.current()
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  if (remainingMs == null) return null
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

const detailOf = (error: unknown): string | undefined => (error as ModelAccountsRequestError | undefined)?.reason ?? undefined

export function DeviceCodeStep({ provider, sessionId, url, userCode, nextPollMs, expiresAt, onDone, onExpired }: Readonly<{
  provider: string
  sessionId: string
  url: string
  userCode: string
  nextPollMs: number
  expiresAt?: string | undefined
  onDone: (error?: string, detail?: string) => void
  onExpired: () => void
}>) {
  const finish = useRef(onDone)
  finish.current = onDone
  const expired = useRef(false)
  const [copied, setCopied] = useState(false)
  const countdown = useCountdown(expiresAt, () => { expired.current = true; onExpired() })
  const cancel = useMutation({ mutationFn: () => cancelOAuth(provider, sessionId), onSettled: () => finish.current() })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const poll = async () => {
      try {
        const step = await pollOAuth(provider, sessionId)
        if (cancelled) return
        if (step.status === 'complete') { finish.current(); return }
        if (step.status === 'failed') { finish.current(oauthFailureMessage(), step.error); return }
        timer = setTimeout(poll, step.nextPollMs ?? nextPollMs)
      } catch {
        // Transient network failures don't stop polling; wait one interval and try again.
        if (!cancelled && !expired.current) timer = setTimeout(poll, nextPollMs)
      }
    }
    timer = setTimeout(poll, nextPollMs)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [nextPollMs, provider, sessionId])

  const copyAndOpen = async () => {
    try { await navigator.clipboard.writeText(userCode); setCopied(true) } catch { /* ignore */ }
    window.open(url, '_blank', 'noopener')
  }

  return <div className="cxs-connect-step">
    <div className="cxs-user-code">
      <span className="cxs-code-label">Código:</span>
      <strong className="cxs-code-value">{userCode}</strong>
    </div>
    <Button type="button" variant="primary" onClick={copyAndOpen}>Copiar código e abrir {providerName(provider)}</Button>
    {copied && <StatusLine>Copiado.</StatusLine>}
    <p className="cxs-hint">Se a aba não abrir sozinha, <a href={url} target="_blank" rel="noreferrer">abra a página de entrada manualmente</a>.</p>
    {countdown && <p className="cxs-hint">Expira em {countdown}</p>}
    <p className="cxs-waiting"><ConexusMark size={16} working />Aguardando você concluir a entrada na outra aba</p>
    <Button type="button" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar</Button>
  </div>
}

export function PasteCodeStep({ provider, sessionId, url, expiresAt, onDone, onExpired }: Readonly<{
  provider: string
  sessionId: string
  url: string
  expiresAt?: string | undefined
  onDone: (error?: string, detail?: string) => void
  onExpired: () => void
}>) {
  const [code, setCode] = useState('')
  const codeId = useId()
  const countdown = useCountdown(expiresAt, onExpired)
  // Fired once per session: opens the verification page without waiting for a click, same as the
  // device-code step's one-click open, just triggered on arrival instead of on a button.
  useEffect(() => { window.open(url, '_blank', 'noopener') }, [url])
  const complete = useMutation({
    mutationFn: () => completeOAuth(provider, sessionId, code),
    onSuccess: (step) => onDone(step.status === 'complete' ? undefined : oauthFailureMessage(), step.status === 'complete' ? undefined : step.error),
    onError: (error) => onDone(oauthFailureMessage(), detailOf(error)),
  })
  return <div className="cxs-connect-step">
    <p className="cxs-hint">O código aparece na aba que abrimos automaticamente; copie-o de lá e cole aqui.</p>
    <p>1. <a href={url} target="_blank" rel="noreferrer">Abrir a página de entrada</a></p>
    {countdown && <p className="cxs-hint">Expira em {countdown}</p>}
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); complete.mutate() }}>
      <label htmlFor={codeId}>2. Cole o código exibido pelo provedor</label>
      <Input id={codeId} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" />
      <Button type="submit" variant="primary" disabled={!code.trim() || complete.isPending}>Concluir</Button>
    </form>
  </div>
}

function ApiKeyStep({ provider, onDone }: Readonly<{ provider: string; onDone: (error?: string) => void }>) {
  const [key, setKey] = useState('')
  const keyId = useId()
  const save = useMutation({
    mutationFn: () => saveApiKey(provider, key.trim()),
    onSuccess: () => onDone(),
    onError: (error) => onDone(apiKeySaveErrorMessage(error as ModelAccountsRequestError)),
  })
  return <form className="cxs-connect-step" onSubmit={(event: FormEvent) => { event.preventDefault(); save.mutate() }}>
    <label htmlFor={keyId}>Chave de API</label>
    <Input id={keyId} type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
    <Button type="submit" variant="primary" disabled={!key.trim() || save.isPending}>Salvar chave</Button>
    <p className="cxs-hint">A chave não é exibida de novo.</p>
  </form>
}

function ProviderPicker({ providers, onChoose }: Readonly<{ providers: readonly ModelProvider[]; onChoose: (provider: string) => void }>) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => { inputRef.current?.focus() }, [])

  const groups = groupProviders(providers, query)
  const flat = 'matches' in groups ? groups.matches : [...groups.featured, ...groups.rest]
  itemRefs.current = itemRefs.current.slice(0, flat.length)

  const focusItem = (index: number) => { itemRefs.current[Math.max(0, Math.min(index, flat.length - 1))]?.focus() }

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && flat.length > 0) { event.preventDefault(); focusItem(0) }
    else if (event.key === 'Enter' && flat.length === 1 && flat[0]) { event.preventDefault(); onChoose(flat[0].provider) }
  }

  const onItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); index === flat.length - 1 ? inputRef.current?.focus() : focusItem(index + 1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); index === 0 ? inputRef.current?.focus() : focusItem(index - 1) }
  }

  const item = (provider: ModelProvider, index: number) => <li key={provider.provider}>
    <button type="button" className="cxs-provider-item" ref={(node) => { itemRefs.current[index] = node }}
      onKeyDown={(event) => onItemKeyDown(event, index)} onClick={() => onChoose(provider.provider)}>
      <span>{providerName(provider.provider)}</span>
      {provider.oauth?.supported && <span className="cxs-hint" aria-hidden="true">Entra com assinatura</span>}
    </button>
  </li>

  return <div className="cxs-picker">
    <Input ref={inputRef} type="text" value={query} onChange={(event) => setQuery(event.target.value)}
      onKeyDown={onInputKeyDown} placeholder="Buscar provedor" aria-label="Buscar provedor" autoComplete="off" />
    {'matches' in groups ? (
      groups.matches.length === 0
        ? <p className="cxs-empty">Nenhum provedor encontrado.</p>
        : <ul className="cxs-provider-matches">{groups.matches.map((provider, index) => item(provider, index))}</ul>
    ) : <>
      {groups.featured.length > 0 && <div className="cxs-provider-group">
        <h4>Principais</h4>
        <ul className="cxs-provider-featured">{groups.featured.map((provider, index) => item(provider, index))}</ul>
      </div>}
      {groups.rest.length > 0 && <div className="cxs-provider-group">
        <h4>Todos os provedores</h4>
        <ul className="cxs-provider-all">{groups.rest.map((provider, index) => item(provider, groups.featured.length + index))}</ul>
      </div>}
    </>}
  </div>
}

export function ConnectAccount({ providers, initialProvider, onConnected, onCancel }: Readonly<{ providers: readonly ModelProvider[]; initialProvider?: string; onConnected: () => void; onCancel?: () => void }>) {
  const [state, dispatch] = useReducer(
    connectFlowReducer,
    initialProvider,
    (seed): ConnectState => {
      if (!seed) return initialConnectState
      const chosen = providers.find((p) => p.provider === seed)
      if (chosen && !chosen.oauth?.supported) {
        return { step: 'api-key', provider: seed }
      }
      return { step: 'choose-method', provider: seed }
    },
  )
  const start = useMutation({
    mutationFn: (provider: string) => startOAuth(provider),
    onSuccess: (flow) => dispatch(flow.kind === 'device-code'
      ? { type: 'method-device-code', sessionId: flow.sessionId, url: flow.url, userCode: flow.userCode ?? '', nextPollMs: flow.nextPollMs ?? 2000, expiresAt: flow.expiresAt }
      : { type: 'method-paste-code', sessionId: flow.sessionId, url: flow.url, expiresAt: flow.expiresAt }),
    onError: (error) => dispatch({ type: 'failed', message: 'Não foi possível iniciar a entrada com este provedor.', detail: detailOf(error) }),
  })
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey })

  const onDone = (error?: string, detail?: string) => {
    if (error) { dispatch({ type: 'failed', message: error, detail }); return }
    dispatch({ type: 'succeeded' })
    refresh()
    onConnected()
  }

  const restart = () => { dispatch({ type: 'reset' }); refresh() }
  const regenerate = (provider: string) => { start.mutate(provider) }

  if (state.step === 'choose-provider') {
    return <section className="cxs-connect" aria-label="Conectar uma conta">
      <div className="cxs-connect-header">
        <h3>Conectar uma conta</h3>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
      <ProviderPicker providers={providers} onChoose={(provider) => dispatch({ type: 'provider-chosen', provider })} />
    </section>
  }

  const chosen = 'provider' in state ? providers.find((provider) => provider.provider === state.provider) : undefined

  if (state.step === 'choose-method' && chosen) {
    if (!chosen.oauth?.supported) return null
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(chosen.provider)}`}>
      <div className="cxs-connect-header">
        <h3>{providerName(chosen.provider)}</h3>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
      <div className="cxs-connect-methods">
        <Button type="button" variant="primary" disabled={start.isPending} onClick={() => start.mutate(chosen.provider)}>Entrar com a assinatura</Button>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: 'method-api-key' })}>Usar uma chave de API</Button>
      </div>
    </section>
  }

  if (state.step === 'api-key') {
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(state.provider)}`}>
      <div className="cxs-connect-header">
        <h3>{providerName(state.provider)}</h3>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
      </div>
      <ApiKeyStep provider={state.provider} onDone={onDone} />
    </section>
  }

  if (state.step === 'paste-code') {
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(state.provider)}`}>
      <h3>{providerName(state.provider)}</h3>
      <PasteCodeStep provider={state.provider} sessionId={state.sessionId} url={state.url} expiresAt={state.expiresAt} onDone={onDone} onExpired={() => dispatch({ type: 'expired' })} />
    </section>
  }

  if (state.step === 'device-code') {
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(state.provider)}`}>
      <h3>{providerName(state.provider)}</h3>
      <DeviceCodeStep provider={state.provider} sessionId={state.sessionId} url={state.url} userCode={state.userCode} nextPollMs={state.nextPollMs} expiresAt={state.expiresAt} onDone={onDone} onExpired={() => dispatch({ type: 'expired' })} />
    </section>
  }

  if (state.step === 'expired') {
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(state.provider)}`}>
      <h3>{providerName(state.provider)}</h3>
      <StatusLine tone="danger">O código expirou.</StatusLine>
      <Button type="button" variant="primary" disabled={start.isPending} onClick={() => regenerate(state.provider)}>Gerar outro código</Button>
    </section>
  }

  if (state.step === 'failed') {
    return <section className="cxs-connect" aria-label="Conectar uma conta">
      <StatusLine tone="danger">{state.message}</StatusLine>
      {state.detail && <details className="cxs-disclosure"><summary>Detalhe técnico</summary><code>{state.detail}</code></details>}
      <Button type="button" variant="outline" onClick={restart}>Tentar de novo</Button>
    </section>
  }

  // 'done': the parent closes the flow and announces the connected account.
  return null
}
