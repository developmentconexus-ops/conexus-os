import { Button } from '@mastra/playground-ui/components/Button'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listModelAccounts, type ModelAccounts, modelAccountsQueryKey } from '../model-accounts-api'
import { connectableProviders, unifiedRows } from '../model-account-rows'
import { groupProviders } from '../provider-groups'
import { ConnectAccount } from './connect-account'
import { GoogleAiProAccount } from './google-ai-pro-account'
import { MyDefaultsSection } from './my-defaults-section'
import { ProviderCard } from './model-account-row'
import { PageHeader } from './page-header'
import { ReconnectAccount } from './reconnect-account'
import { SectionError, SectionLoading, StatusLine } from './states'

function ProvidersCard({ connecting, setConnecting, reconnecting, setReconnecting, refresh, administrator }: Readonly<{
  connecting: string | 'other' | null
  setConnecting: (value: string | 'other' | null) => void
  reconnecting: string | null
  setReconnecting: (value: string | null) => void
  refresh: () => void
  administrator: boolean
}>) {
  const accounts = useQuery({ queryKey: modelAccountsQueryKey, queryFn: listModelAccounts })
  return <section aria-labelledby="cxs-providers-title">
    <h2 id="cxs-providers-title">Provedores</h2>
    {accounts.isPending && <SectionLoading />}
    {accounts.isError && <SectionError description="Não foi possível consultar suas contas de modelo." onRetry={() => void accounts.refetch()} />}
    {accounts.isSuccess && <ProvidersBody
      data={accounts.data}
      connecting={connecting}
      setConnecting={setConnecting}
      reconnecting={reconnecting}
      setReconnecting={setReconnecting}
      refresh={refresh}
      administrator={administrator}
    />}
  </section>
}

function ProvidersBody({ data, connecting, setConnecting, reconnecting, setReconnecting, refresh, administrator }: Readonly<{
  data: ModelAccounts
  connecting: string | 'other' | null
  setConnecting: (value: string | 'other' | null) => void
  reconnecting: string | null
  setReconnecting: (value: string | null) => void
  refresh: () => void
  administrator: boolean
}>) {
  const rows = unifiedRows(data.providers)
  const groups = groupProviders(connectableProviders(data.providers), '')
  const rest = 'rest' in groups ? groups.rest : []
  const [notice, setNotice] = useState<string | null>(null)

  return <>
    <ul className="cxs-list">
      {rows.flatMap((row) => [
        <ProviderCard
          key={row.provider}
          row={row}
          onConnect={(provider) => { setNotice(null); setConnecting(provider) }}
          onReconnect={setReconnecting}
        />,
        ...(row.provider === 'google' ? [<GoogleAiProAccount key="google-ai-pro" />] : []),
      ])}
    </ul>
    {reconnecting && <ReconnectAccount provider={reconnecting} onDone={() => { setReconnecting(null); refresh() }} />}
    {connecting === 'other' && (
      <ConnectAccount
        providers={rest}
        onConnected={() => { setNotice('Conta conectada.'); setConnecting(null); refresh() }}
      />
    )}
    {connecting && connecting !== 'other' && (() => {
      const selected = data.providers.find((p) => p.provider === connecting)
      if (!selected) return null
      return <ConnectAccount
        providers={[selected]}
        initialProvider={connecting}
        onConnected={() => { setNotice('Conta conectada.'); setConnecting(null); refresh() }}
      />
    })()}
    {!reconnecting && !connecting && rest.length > 0 && (
      <div className="cxs-row-actions cxs-actions-start">
        <Button type="button" variant="outline" onClick={() => { setNotice(null); setConnecting('other') }}>
          Conectar outro provedor
        </Button>
      </div>
    )}
    {administrator && (
      <div>
        <Link to="/settings/installation/models">Gerenciar contas compartilhadas</Link>
      </div>
    )}
    {notice && <StatusLine>{notice}</StatusLine>}
  </>
}

function MyDefaultsCard() {
  return <section aria-labelledby="cxs-my-defaults-title">
    <h2 id="cxs-my-defaults-title">Meus padrões</h2>
    <MyDefaultsSection />
  </section>
}

export function ModelsScreen({ administrator }: Readonly<{ administrator: boolean }>) {
  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState<string | 'other' | null>(null)
  const [reconnecting, setReconnecting] = useState<string | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey })

  return <main className="cxs-page">
    <PageHeader title="Minhas contas de modelo" lead="Cada pessoa usa a própria conta. Uma conta compartilhada pela instalação atende quem não conectou a sua." />
    <ProvidersCard
      connecting={connecting}
      setConnecting={setConnecting}
      reconnecting={reconnecting}
      setReconnecting={setReconnecting}
      refresh={refresh}
      administrator={administrator}
    />
    <MyDefaultsCard />
  </main>
}
