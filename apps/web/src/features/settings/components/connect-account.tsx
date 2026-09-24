import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, type KeyboardEvent, useEffect, useId, useReducer, useRef, useState } from 'react'
import { connectFlowReducer, initialConnectState } from '../connect-flow'
import {
  apiKeySaveErrorMessage, oauthFailureMessage,
} from '../error-messages'
import {
  cancelOAuth, completeOAuth, type ModelAccountsRequestError, type ModelProvider, pollOAuth, saveApiKey, startOAuth,
} from '../model-accounts-api'
import { providerName } from '../provider-names'
import { groupProviders } from '../provider-groups'
import { StatusLine } from './states'

export function DeviceCodeStep({ provider, sessionId, url, userCode, nextPollMs, onDone }: Readonly<{
  provider: string
  sessionId: string
  url: string
  userCode: string
  nextPollMs: number
  onDone: (error?: string) => void
}>) {
  const finish = useRef(onDone)
  finish.current = onDone
  const [copied, setCopied] = useState(false)
  const cancel = useMutation({ mutationFn: () => cancelOAuth(provider, sessionId), onSettled: () => finish.current() })
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = (delay: number) => {
      timer = setTimeout(async () => {
        if (stopped) return
        try {
          const step = await pollOAuth(provider, sessionId)
          if (step.status === 'complete') finish.current()
          else if (step.status === 'failed') finish.current(oauthFailureMessage(step.error))
          else poll(step.nextPollMs ?? 2000)
        } catch {
          finish.current(oauthFailureMessage())
        }
      }, delay)
    }
    poll(nextPollMs)
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [provider, sessionId, nextPollMs])
  return <div className="cxs-connect-step">
    <p className="cxs-device-code">{userCode}</p>
    <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(userCode).then(() => setCopied(true)).catch(() => setCopied(false)) }}>Copiar código</Button>
    {copied && <StatusLine>Copiado.</StatusLine>}
    <p><a href={url} target="_blank" rel="noreferrer">Abrir a página de entrada</a></p>
    <p className="cxs-waiting"><span className="cxs-spinner" aria-hidden="true" />Aguardando você concluir a entrada na outra aba</p>
    <Button type="button" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar</Button>
  </div>
}

export function PasteCodeStep({ provider, sessionId, url, onDone }: Readonly<{ provider: string; sessionId: string; url: string; onDone: (error?: string) => void }>) {
  const [code, setCode] = useState('')
  const codeId = useId()
  const complete = useMutation({
    mutationFn: () => completeOAuth(provider, sessionId, code),
    onSuccess: (step) => onDone(step.status === 'complete' ? undefined : oauthFailureMessage(step.error)),
    onError: () => onDone(oauthFailureMessage()),
  })
  return <div className="cxs-connect-step">
    <p>1. <a href={url} target="_blank" rel="noreferrer">Abrir a página de entrada</a></p>
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

export function ConnectAccount({ providers, onConnected }: Readonly<{ providers: readonly ModelProvider[]; onConnected: () => void }>) {
  const [state, dispatch] = useReducer(connectFlowReducer, initialConnectState)
  const start = useMutation({
    mutationFn: (provider: string) => startOAuth(provider),
    onSuccess: (flow) => dispatch(flow.kind === 'device-code'
      ? { type: 'method-device-code', sessionId: flow.sessionId, url: flow.url, userCode: flow.userCode ?? '', nextPollMs: flow.nextPollMs ?? 2000 }
      : { type: 'method-paste-code', sessionId: flow.sessionId, url: flow.url }),
    onError: () => dispatch({ type: 'failed', message: 'Não foi possível iniciar a entrada com este provedor.' }),
  })
  const onDone = (error?: string) => {
    if (error) { dispatch({ type: 'failed', message: error }); return }
    dispatch({ type: 'succeeded' })
    onConnected()
  }
  const restart = () => dispatch({ type: 'reset' })

  // A provider with no subscription login skips the method choice; advancing state belongs in an
  // effect, not in the render that reads it.
  useEffect(() => {
    if (state.step !== 'choose-method') return
    const chosen = providers.find((provider) => provider.provider === state.provider)
    if (chosen && !chosen.oauth?.supported) dispatch({ type: 'method-api-key' })
  }, [state, providers])

  if (state.step === 'choose-provider') {
    return <section className="cxs-connect" aria-label="Conectar uma conta">
      <h3>Conectar uma conta</h3>
      <ProviderPicker providers={providers} onChoose={(provider) => dispatch({ type: 'provider-chosen', provider })} />
    </section>
  }

  const chosen = providers.find((provider) => provider.provider === state.provider)

  if (state.step === 'choose-method' && chosen) {
    if (!chosen.oauth?.supported) return null
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(chosen.provider)}`}>
      <h3>{providerName(chosen.provider)}</h3>
      <div className="cxs-connect-methods">
        <Button type="button" variant="primary" disabled={start.isPending} onClick={() => start.mutate(chosen.provider)}>Entrar com a assinatura</Button>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: 'method-api-key' })}>Usar uma chave de API</Button>
      </div>
    </section>
  }

  if (state.step === 'api-key') {
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(state.provider)}`}>
      <h3>{providerName(state.provider)}</h3>
      <ApiKeyStep provider={state.provider} onDone={onDone} />
    </section>
  }

  if (state.step === 'paste-code') {
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(state.provider)}`}>
      <h3>{providerName(state.provider)}</h3>
      <PasteCodeStep provider={state.provider} sessionId={state.sessionId} url={state.url} onDone={onDone} />
    </section>
  }

  if (state.step === 'device-code') {
    return <section className="cxs-connect" aria-label={`Conectar ${providerName(state.provider)}`}>
      <h3>{providerName(state.provider)}</h3>
      <DeviceCodeStep provider={state.provider} sessionId={state.sessionId} url={state.url} userCode={state.userCode} nextPollMs={state.nextPollMs} onDone={onDone} />
    </section>
  }

  if (state.step === 'failed') {
    return <section className="cxs-connect" aria-label="Conectar uma conta">
      <p role="alert">{state.message}</p>
      <Button type="button" variant="outline" onClick={restart}>Tentar de novo</Button>
    </section>
  }

  // 'done': the parent closes the flow and announces the connected account.
  return null
}
