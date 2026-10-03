import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { failureText, hubCall, hubFetch, isFailure } from '../../../app/http'
import { Chip, SectionError, StatusLine } from './states'

type Connection = Readonly<{ mine: boolean; shared: boolean; administrator: boolean }>
type LoginState = 'waiting' | 'succeeded' | 'failed' | 'expired'
type Login = Readonly<{ loginId: string; url: string }>

const PROVIDER = 'google-ai-pro'
const base = `/api/control/model-accounts/${PROVIDER}`
const connectionQueryKey = ['model-accounts', PROVIDER] as const

const OUTCOME: Readonly<Record<Exclude<LoginState, 'waiting'>, string>> = {
  succeeded: 'Google AI Pro conectado.',
  failed: 'O Google recusou a entrada.',
  expired: 'A entrada expirou.',
}

const call = async <T,>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> => {
  const response = await hubCall(hubFetch(url, {
    method,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }))
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return await response.json() as T
}

function SignIn({ login, autoOpened, onDone }: Readonly<{ login: Login; autoOpened: boolean; onDone: (state: Exclude<LoginState, 'waiting'>) => void }>) {
  const [pasted, setPasted] = useState('')
  const [refusal, setRefusal] = useState<unknown>(null)
  const pastedId = useId()
  // The poll lives as long as the sign-in, whatever the parent re-renders with.
  const finish = useRef(onDone)
  finish.current = onDone
  // The sign-in completes by itself when the browser runs on the Hub's machine; the poll notices.
  useEffect(() => {
    let stopped = false
    const timer = setInterval(async () => {
      const { state } = await call<{ state: LoginState }>('GET', `${base}/login/${login.loginId}`).catch(() => ({ state: 'waiting' as const }))
      if (!stopped && state !== 'waiting') { stopped = true; clearInterval(timer); finish.current(state) }
    }, 2000)
    return () => { stopped = true; clearInterval(timer) }
  }, [login])
  const complete = useMutation({
    mutationFn: () => call<{ state: LoginState }>('POST', `${base}/login/complete`, { loginId: login.loginId, callbackUrl: pasted.trim() }),
    onSuccess: ({ state }) => { if (state !== 'waiting') onDone(state) },
    onError: setRefusal,
  })
  return <div className="cxs-connect">
    <p><Button as="a" href={login.url} target="_blank" rel="noreferrer" variant={autoOpened ? 'outline' : 'primary'}>Abrir a entrada do Google</Button></p>
    <p className="cxs-hint">
      {autoOpened
        ? 'Abrimos uma nova aba para você entrar com a sua conta Google. '
        : 'Não conseguimos abrir a aba automaticamente; use o botão acima. '}
      Depois de entrar, esta página conclui sozinha. Se a aba terminar em uma página que não abre, copie o endereço dela e cole aqui.
    </p>
    <form className="cxs-connect-step" onSubmit={(event: FormEvent) => { event.preventDefault(); setRefusal(null); complete.mutate() }}>
      <label htmlFor={pastedId}>Endereço da aba que não abriu</label>
      <Input id={pastedId} value={pasted} onChange={(event) => setPasted(event.target.value)} autoComplete="off" placeholder="http://localhost:51121/oauth-callback?…" />
      <Button type="submit" variant="primary" disabled={!pasted.trim() || complete.isPending}>Concluir</Button>
    </form>
    {refusal !== null && <StatusLine tone="danger">{failureText(refusal)}</StatusLine>}
  </div>
}

/** Absent when the Hub does not run CLIProxyAPI: the connection read answers 404 then. */
export function GoogleAiProAccount() {
  const queryClient = useQueryClient()
  const titleId = useId()
  const connection = useQuery({ queryKey: connectionQueryKey, queryFn: () => call<Connection>('GET', `${base}/connection`), retry: false })
  const [login, setLogin] = useState<Login | null>(null)
  const [autoOpened, setAutoOpened] = useState(true)
  const [message, setMessage] = useState<Readonly<{ text: string; failed: boolean }> | null>(null)
  const fail = (text: string) => setMessage({ text, failed: true })
  // Connecting changes which models this person's pickers offer.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: connectionQueryKey }),
    queryClient.invalidateQueries({ queryKey: ['builder-models'] }),
  ])
  const start = useMutation({
    // Opened before the login/start request resolves, so the click's user-activation still
    // covers the popup; a blocker that would refuse a post-await window.open lets this one through.
    mutationFn: async (): Promise<Readonly<{ started: Login; tab: Window | null }>> => {
      const tab = window.open('about:blank', '_blank')
      if (tab) tab.opener = null
      try {
        const started = await call<Login>('POST', `${base}/login/start`, {})
        return { started, tab }
      } catch (error) {
        tab?.close()
        throw error
      }
    },
    onSuccess: ({ started, tab }) => {
      setMessage(null)
      setAutoOpened(tab !== null)
      if (tab) tab.location.href = started.url
      setLogin(started)
    },
    onError: (error) => fail(failureText(error)),
  })
  if (connection.isPending || (connection.isError && isFailure(connection.error, 'NOT_FOUND'))) return null
  if (connection.isError) return <section aria-labelledby={titleId}>
    <h2 id={titleId}>Google AI Pro</h2>
    <SectionError error={connection.error} description="Não foi possível consultar a sua conta Google AI Pro." onRetry={() => void connection.refetch()} />
  </section>
  const { mine, shared } = connection.data
  return <section aria-labelledby={titleId}>
    <h2 id={titleId}>Google AI Pro</h2>
    <p className="cxs-hint">Use a sua assinatura Google AI Pro no Builder. Você entra com a sua conta Google no seu navegador; a Conexus nunca vê a sua senha.</p>
    {mine && <div><Chip tone="positive">Conectado com a sua conta Google.</Chip></div>}
    {!mine && shared && <div><Chip tone="neutral">Você usa a conta compartilhada com todos.</Chip></div>}
    {login
      ? <SignIn login={login} autoOpened={autoOpened} onDone={(state) => { setLogin(null); setMessage({ text: OUTCOME[state], failed: state !== 'succeeded' }); void refresh() }} />
      : <div className="cxs-row-actions cxs-actions-start">
        <Button type="button" variant={mine ? 'outline' : 'primary'} disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? 'Preparando a entrada do Google…' : (mine ? 'Reconectar' : 'Conectar com o Google')}
        </Button>
      </div>}
    {message && <StatusLine tone={message.failed ? 'danger' : 'positive'}>{message.text}</StatusLine>}
  </section>
}
