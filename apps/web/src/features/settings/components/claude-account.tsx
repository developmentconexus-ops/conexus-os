import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { FAILURES } from '../../../generated/failures.ts'
import { accountsQueryKey, accountsUrl, callModelAccounts as call, type Accounts } from '../model-accounts-api'
import { Chip, SectionError, StatusLine } from './states'
import { failureText } from '../../../app/http'

type LoginState = 'succeeded' | 'failed' | 'expired'
type Login = Readonly<{ loginId: string; url: string; expiresAt: string }>

const PROVIDER = 'anthropic'
const base = `/api/control/model-accounts/${PROVIDER}/oauth`

function PasteCode({ login, onDone, onCancel }: Readonly<{ login: Login; onDone: (state: Exclude<LoginState, 'failed'>) => void; onCancel: () => void }>) {
  const [pasted, setPasted] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const pastedId = useId()
  const complete = useMutation({
    mutationFn: () => call<{ state: LoginState }>('POST', `${base}/complete`, { loginId: login.loginId, code: pasted.trim() }),
    onSuccess: ({ state }) => { if (state === 'failed') setRefusal(FAILURES.MODEL_LOGIN_ANTHROPIC_REFUSED.message); else onDone(state) },
    onError: (error) => setRefusal(failureText(error)),
  })
  return <div className="cxs-connect">
    <p><Button as="a" href={login.url} target="_blank" rel="noreferrer" variant="primary">Abrir a página da Claude</Button></p>
    <p className="cxs-hint">Na página da Claude, entre com a sua conta e autorize. A última página mostra um código; copie e cole aqui.</p>
    <form className="cxs-connect-step" onSubmit={(event: FormEvent) => { event.preventDefault(); setRefusal(null); complete.mutate() }}>
      <label htmlFor={pastedId}>Código da Claude</label>
      <Input id={pastedId} value={pasted} onChange={(event) => setPasted(event.target.value)} autoComplete="off" spellCheck={false} />
      <div className="cxs-row-actions cxs-actions-start">
        <Button type="submit" variant="primary" disabled={!pasted.trim() || complete.isPending}>{complete.isPending ? 'Conferindo o código…' : 'Concluir'}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
    {refusal !== null && <StatusLine tone="danger">{refusal}</StatusLine>}
  </div>
}

/** The Claude subscription card: sign in on claude.ai and paste the code back; the Hub keeps the tokens, never the browser. */
export function ClaudeAccount() {
  const queryClient = useQueryClient()
  const titleId = useId()
  const accounts = useQuery({ queryKey: accountsQueryKey, queryFn: () => call<Accounts>('GET', accountsUrl), retry: false })
  const [login, setLogin] = useState<Login | null>(null)
  const [message, setMessage] = useState<Readonly<{ text: string; failed: boolean }> | null>(null)
  // Connecting changes which models this person's pickers offer.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: accountsQueryKey }),
    queryClient.invalidateQueries({ queryKey: ['builder-models'] }),
  ])
  const start = useMutation({
    mutationFn: () => call<Login>('POST', `${base}/start`, {}),
    onSuccess: (started) => { setMessage(null); setLogin(started) },
    onError: () => setMessage({ text: 'Não foi possível iniciar a entrada com a Claude agora.', failed: true }),
  })
  if (accounts.isPending) return null
  if (accounts.isError) return <section aria-labelledby={titleId}>
    <h2 id={titleId}>Assinatura Claude</h2>
    <SectionError error={accounts.error} description="Não foi possível consultar a sua assinatura Claude." onRetry={() => void accounts.refetch()} />
  </section>
  const account = accounts.data.accounts.find((item) => item.provider === PROVIDER)
  const kind = account?.kind ?? null
  return <section aria-labelledby={titleId}>
    <h2 id={titleId}>Assinatura Claude</h2>
    <p className="cxs-hint">Use a sua assinatura Claude Pro ou Max no Builder. Você entra com a sua conta Claude no seu navegador; a Conexus nunca vê a sua senha.</p>
    {kind === 'oauth' && <div><Chip tone="positive">Conectado com a sua assinatura Claude.</Chip></div>}
    {kind !== null && kind !== 'oauth' && <p className="cxs-hint">Entrar com a assinatura substitui a chave de API da Anthropic que você salvou.</p>}
    {kind === null && account?.shared && <div><Chip tone="neutral">Você usa a conta compartilhada com todos.</Chip></div>}
    {login
      ? <PasteCode login={login} onCancel={() => setLogin(null)} onDone={(state) => {
        setLogin(null)
        setMessage(state === 'succeeded' ? { text: 'Assinatura Claude conectada.', failed: false } : { text: 'A entrada expirou.', failed: true })
        void refresh()
      }} />
      : <div className="cxs-row-actions cxs-actions-start">
        <Button type="button" variant={kind === 'oauth' ? 'outline' : 'primary'} disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? 'Preparando a entrada da Claude…' : (kind === 'oauth' ? 'Entrar de novo' : 'Entrar com a assinatura Claude')}
        </Button>
      </div>}
    {message && <StatusLine tone={message.failed ? 'danger' : 'positive'}>{message.text}</StatusLine>}
  </section>
}
