import { Button } from '@mastra/playground-ui/components/Button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { FAILURES, startCodexModelLogin, pollCodexModelLogin, type ModelLoginId } from '@conexus/contract'
import { call } from '../../../app/http'
import { accountsQueryKey, noInput, ownKind, readAccounts } from '../model-accounts-api'
import { Chip, SectionError, StatusLine } from './states'

type LoginState = 'waiting' | 'succeeded' | 'failed' | 'expired'
type Login = Readonly<{ loginId: ModelLoginId; url: string; userCode: string; intervalMs: number; expiresAt: string }>

const PROVIDER = 'openai-codex'

const OUTCOME: Readonly<Record<Exclude<LoginState, 'waiting'>, string>> = {
  succeeded: 'ChatGPT conectado.',
  failed: FAILURES.MODEL_LOGIN_OPENAI_REFUSED.message,
  expired: 'O código expirou. Gere outro código.',
}

// A live "M:SS" until the code expires. A reading aid only: the Hub still answers `expired`.
function useCountdown(expiresAt: string): string {
  const [remainingMs, setRemainingMs] = useState(() => new Date(expiresAt).getTime() - Date.now())
  useEffect(() => {
    const timer = setInterval(() => setRemainingMs(new Date(expiresAt).getTime() - Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function DeviceCode({ login, onDone, onCancel }: Readonly<{ login: Login; onDone: (state: Exclude<LoginState, 'waiting'>) => void; onCancel: () => void }>) {
  const [copied, setCopied] = useState(false)
  const countdown = useCountdown(login.expiresAt)
  // The poll lives as long as the sign-in, whatever the parent re-renders with.
  const finish = useRef(onDone)
  finish.current = onDone
  useEffect(() => {
    let stopped = false
    const timer = setInterval(async () => {
      const { state } = await call(pollCodexModelLogin, { ...noInput, query: { loginId: login.loginId } }).catch(() => ({ state: 'waiting' as const }))
      if (!stopped && state !== 'waiting') { stopped = true; clearInterval(timer); finish.current(state) }
    }, Math.max(login.intervalMs, 2000))
    return () => { stopped = true; clearInterval(timer) }
  }, [login])
  const copyAndOpen = () => {
    void navigator.clipboard.writeText(login.userCode).then(() => setCopied(true), () => setCopied(false))
    window.open(login.url, '_blank', 'noopener')
  }
  return <div className="cxs-connect-step">
    <p className="cxs-hint">Na página da OpenAI, entre com a sua conta do ChatGPT e digite este código:</p>
    <p className="cxs-device-code">{login.userCode}</p>
    <Button type="button" variant="primary" onClick={copyAndOpen}>Copiar código e abrir o ChatGPT</Button>
    {copied && <StatusLine>Código copiado.</StatusLine>}
    <p className="cxs-hint">Se a aba não abrir, <a href={login.url} target="_blank" rel="noreferrer">abra a página de entrada da OpenAI</a>.</p>
    <p className="cxs-hint">O código expira em {countdown}.</p>
    <p className="cxs-waiting"><ConexusMark size={16} working />Aguardando você concluir a entrada na outra aba</p>
    <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
  </div>
}

/** The ChatGPT subscription card: sign in by device code; the Hub keeps the tokens, never the browser. */
export function ChatGptAccount() {
  const queryClient = useQueryClient()
  const titleId = useId()
  const accounts = useQuery({ queryKey: accountsQueryKey, queryFn: readAccounts, retry: false })
  const [login, setLogin] = useState<Login | null>(null)
  const [message, setMessage] = useState<Readonly<{ text: string; failed: boolean }> | null>(null)
  // Connecting changes which models this person's pickers offer.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: accountsQueryKey }),
    queryClient.invalidateQueries({ queryKey: ['builder-models'] }),
  ])
  const start = useMutation({
    mutationFn: () => call(startCodexModelLogin, noInput),
    onSuccess: (started) => { setMessage(null); setLogin(started) },
    onError: () => setMessage({ text: 'Não foi possível iniciar a entrada com o ChatGPT agora.', failed: true }),
  })
  if (accounts.isPending) return null
  if (accounts.isError) return <section aria-labelledby={titleId}>
    <h2 id={titleId}>ChatGPT</h2>
    <SectionError error={accounts.error} description="Não foi possível consultar a sua conta do ChatGPT." onRetry={() => void accounts.refetch()} />
  </section>
  const account = accounts.data.accounts.find((item) => item.provider === PROVIDER)
  const mine = account !== undefined && ownKind(account.own) !== null
  const shared = account?.shared === true
  return <section aria-labelledby={titleId}>
    <h2 id={titleId}>ChatGPT</h2>
    <p className="cxs-hint">Use a sua assinatura do ChatGPT no Builder. Você entra com a sua conta da OpenAI no seu navegador; a Conexus nunca vê a sua senha.</p>
    {mine && <div><Chip tone="positive">Conectado com a sua conta do ChatGPT.</Chip></div>}
    {!mine && shared && <div><Chip tone="neutral">Você usa a conta compartilhada com todos.</Chip></div>}
    {login
      ? <DeviceCode login={login} onCancel={() => setLogin(null)} onDone={(state) => { setLogin(null); setMessage({ text: OUTCOME[state], failed: state !== 'succeeded' }); void refresh() }} />
      : <div className="cxs-row-actions cxs-actions-start">
        <Button type="button" variant={mine ? 'outline' : 'primary'} disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? 'Preparando a entrada do ChatGPT…' : (mine ? 'Reconectar' : 'Conectar com o ChatGPT')}
        </Button>
      </div>}
    {message && <StatusLine tone={message.failed ? 'danger' : 'positive'}>{message.text}</StatusLine>}
  </section>
}
