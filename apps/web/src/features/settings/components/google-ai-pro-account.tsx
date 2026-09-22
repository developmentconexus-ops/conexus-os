import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { ModelAccountsRequestError, modelAccountsQueryKey, removeApiKey, shareWithEveryone, stopSharing } from '../model-accounts-api'

type Connection = Readonly<{ mine: boolean; shared: boolean; administrator: boolean }>
type LoginState = 'waiting' | 'succeeded' | 'failed' | 'expired'
type Login = Readonly<{ loginId: string; url: string }>

const PROVIDER = 'google-ai-pro'
const base = `/api/control/model-accounts/${PROVIDER}`
// Under the accounts key, so every refresh of the accounts list refreshes this card too.
const connectionQueryKey = [...modelAccountsQueryKey, PROVIDER] as const

const OUTCOME: Readonly<Record<Exclude<LoginState, 'waiting'>, string>> = {
  succeeded: 'Google AI Pro conectado.',
  failed: 'O Google recusou a entrada. Tente de novo.',
  expired: 'A entrada expirou. Tente de novo.',
}
const START_FAILURE: Readonly<Record<number, string>> = {
  409: 'Outra pessoa está conectando agora. Tente em alguns minutos.',
}

const csrf = (): string => decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

const call = async <T,>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> => {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-conexus-csrf': csrf() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new ModelAccountsRequestError(response.status)
  return await response.json() as T
}

const statusOf = (error: unknown): number | undefined => error instanceof ModelAccountsRequestError ? error.status : undefined

function SignIn({ login, onDone }: Readonly<{ login: Login; onDone: (state: Exclude<LoginState, 'waiting'>) => void }>) {
  const [pasted, setPasted] = useState('')
  const [refused, setRefused] = useState(false)
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
    onError: () => setRefused(true),
  })
  return <div className="google-ai-pro-sign-in">
    <p><a href={login.url} target="_blank" rel="noreferrer">Abrir a entrada do Google</a></p>
    <p>Depois de entrar, esta página conclui sozinha. Se a aba terminar em uma página que não abre, copie o endereço dela e cole aqui.</p>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); setRefused(false); complete.mutate() }}>
      <label htmlFor={pastedId}>Endereço da aba que não abriu</label>
      <Input id={pastedId} value={pasted} onChange={(event) => setPasted(event.target.value)} autoComplete="off" placeholder="http://localhost:51121/oauth-callback?…" />
      <Button type="submit" variant="primary" disabled={!pasted.trim() || complete.isPending}>Concluir</Button>
    </form>
    {refused && <p role="alert">Esse endereço não é o da entrada do Google iniciada aqui.</p>}
  </div>
}

/** Absent when the Hub does not run CLIProxyAPI: the connection read answers 404 then. */
export function GoogleAiProAccount() {
  const queryClient = useQueryClient()
  const titleId = useId()
  const connection = useQuery({ queryKey: connectionQueryKey, queryFn: () => call<Connection>('GET', `${base}/connection`), retry: false })
  const [login, setLogin] = useState<Login | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Connecting or disconnecting changes which models this person's pickers offer.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey }),
    queryClient.invalidateQueries({ queryKey: ['builder-models'] }),
  ])
  const start = useMutation({
    mutationFn: () => call<Login>('POST', `${base}/login/start`, {}),
    onSuccess: (started) => { setMessage(null); setLogin(started) },
    onError: (error) => setMessage(START_FAILURE[statusOf(error) ?? 0] ?? 'Não foi possível iniciar a entrada agora.'),
  })
  const act = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => { setMessage(null); void refresh() },
    onError: () => setMessage('Não foi possível concluir. Tente novamente.'),
  })
  if (connection.isPending || (connection.isError && statusOf(connection.error) === 404)) return null
  if (connection.isError) return <p role="alert">Não foi possível consultar a sua conta Google AI Pro.</p>
  const { mine, shared, administrator } = connection.data
  return <section className="google-ai-pro-account" aria-labelledby={titleId}>
    <h3 id={titleId}>Google AI Pro</h3>
    <p>Use a sua assinatura Google AI Pro no Builder. Você entra com a sua conta Google no seu navegador; a Conexus nunca vê a sua senha.</p>
    {mine && <p>Conectado com a sua conta Google.</p>}
    {!mine && shared && <p>Você usa a conta compartilhada com todos.</p>}
    {login
      ? <SignIn login={login} onDone={(state) => { setLogin(null); setMessage(OUTCOME[state]); void refresh() }} />
      : <div className="google-ai-pro-actions">
        <Button type="button" variant={mine ? 'outline' : 'primary'} disabled={start.isPending} onClick={() => start.mutate()}>{mine ? 'Reconectar' : 'Conectar com o Google'}</Button>
        {mine && <Button type="button" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => removeApiKey(PROVIDER))}>Desconectar</Button>}
        {administrator && mine && !shared && <Button type="button" disabled={act.isPending} onClick={() => act.mutate(() => shareWithEveryone(PROVIDER))}>Compartilhar com todos</Button>}
        {administrator && shared && <Button type="button" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => stopSharing(PROVIDER))}>Parar de compartilhar</Button>}
      </div>}
    {message && <p role="status">{message}</p>}
  </section>
}
