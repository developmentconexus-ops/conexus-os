import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { accountsQueryKey, accountsUrl, callModelAccounts, ModelAccountsRequestError, type Accounts } from '../model-accounts-api'
import { providerName } from '../provider-names'
import { Chip, SectionError, StatusLine } from './states'

/** The providers a person connects by pasting a key, with where the key comes from. */
const API_KEY_PROVIDERS = {
  anthropic: { console: 'https://platform.claude.com/settings/keys', placeholder: 'sk-ant-…' },
} as const satisfies Readonly<Record<string, Readonly<{ console: string; placeholder: string }>>>

/** One card per API key provider: the person pastes a key, the Hub keeps it sealed, and no answer shows it again. */
export function ApiKeyAccount({ provider }: Readonly<{ provider: keyof typeof API_KEY_PROVIDERS }>) {
  const queryClient = useQueryClient()
  const titleId = useId()
  const keyId = useId()
  const name = providerName(provider)
  const { console: consoleUrl, placeholder } = API_KEY_PROVIDERS[provider]
  const accounts = useQuery({ queryKey: accountsQueryKey, queryFn: () => callModelAccounts<Accounts>('GET', accountsUrl), retry: false })
  const [key, setKey] = useState('')
  const [message, setMessage] = useState<Readonly<{ text: string; failed: boolean }> | null>(null)
  const save = useMutation({
    mutationFn: () => callModelAccounts<undefined>('PUT', `/api/control/model-accounts/${encodeURIComponent(provider)}/api-key`, { key: key.trim() }),
    onSuccess: () => {
      setKey('')
      setMessage({ text: 'Chave salva. Os modelos da sua conta já aparecem no Builder.', failed: false })
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['builder-models'] }),
      ])
    },
    onError: (error) => setMessage({
      text: error instanceof ModelAccountsRequestError && error.status === 400
        ? `Essa não é uma chave de API da ${name}. Confira e cole de novo; nada foi alterado.`
        : 'Não foi possível salvar a chave agora. Nada foi alterado.',
      failed: true,
    }),
  })
  const title = `Chave de API da ${name}`
  if (accounts.isPending) return null
  if (accounts.isError) return <section aria-labelledby={titleId}>
    <h2 id={titleId}>{title}</h2>
    <SectionError description={`Não foi possível consultar a sua conta da ${name}.`} onRetry={() => void accounts.refetch()} />
  </section>
  const account = accounts.data.accounts.find((item) => item.provider === provider)
  const kind = account?.kind ?? null
  return <section aria-labelledby={titleId}>
    <h2 id={titleId}>{title}</h2>
    <p className="cxs-hint">
      Cole uma chave criada no <a href={consoleUrl} target="_blank" rel="noreferrer">console da {name}</a>. O uso é cobrado na conta dessa chave. A Conexus guarda a chave cifrada e nunca a mostra de novo.
    </p>
    {kind === 'api_key' && <div><Chip tone="positive">Conectado com a sua chave.</Chip></div>}
    {kind !== null && kind !== 'api_key' && <p className="cxs-hint">Salvar uma chave substitui a outra forma de acesso que você conectou para a {name}.</p>}
    {kind === null && account?.shared && <div><Chip tone="neutral">Você usa a conta compartilhada com todos.</Chip></div>}
    <form className="cxs-connect-step" onSubmit={(event: FormEvent) => { event.preventDefault(); setMessage(null); save.mutate() }}>
      <label htmlFor={keyId}>Chave de API</label>
      <Input id={keyId} type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder={placeholder} />
      <div className="cxs-row-actions cxs-actions-start">
        <Button type="submit" variant={kind === 'api_key' ? 'outline' : 'primary'} disabled={!key.trim() || save.isPending}>
          {save.isPending ? 'Salvando a chave…' : (kind === 'api_key' ? 'Trocar a chave' : 'Salvar a chave')}
        </Button>
      </div>
    </form>
    {message && <StatusLine tone={message.failed ? 'danger' : 'positive'}>{message.text}</StatusLine>}
  </section>
}
