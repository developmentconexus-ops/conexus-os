import { Button } from '@mastra/playground-ui/components/Button'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listModelAccounts, type ModelAccounts, modelAccountsQueryKey } from '../model-accounts-api'
import { connectableProviders, ownRows, sharedRows } from '../model-account-rows'
import { ConnectAccount } from './connect-account'
import { GoogleAiProAccount } from './google-ai-pro-account'
import { MyDefaultsSection } from './my-defaults-section'
import { OwnAccountRow, SharedAccountRow } from './model-account-row'
import { PageHeader } from './page-header'
import { ReconnectAccount } from './reconnect-account'
import { SectionEmpty, SectionError, SectionLoading, StatusLine } from './states'

function OwnAccountsCard({ connecting, setConnecting, reconnecting, setReconnecting, refresh }: Readonly<{
  connecting: boolean
  setConnecting: (value: boolean) => void
  reconnecting: string | null
  setReconnecting: (value: string | null) => void
  refresh: () => void
}>) {
  const accounts = useQuery({ queryKey: modelAccountsQueryKey, queryFn: listModelAccounts })
  return <section aria-labelledby="cxs-own-accounts-title">
    <h2 id="cxs-own-accounts-title">Suas contas</h2>
    {accounts.isPending && <SectionLoading />}
    {accounts.isError && <SectionError description="Não foi possível consultar suas contas de modelo." onRetry={() => void accounts.refetch()} />}
    {accounts.isSuccess && <OwnAccountsBody data={accounts.data} connecting={connecting} setConnecting={setConnecting} reconnecting={reconnecting} setReconnecting={setReconnecting} refresh={refresh} />}
  </section>
}

function OwnAccountsBody({ data, connecting, setConnecting, reconnecting, setReconnecting, refresh }: Readonly<{
  data: ModelAccounts
  connecting: boolean
  setConnecting: (value: boolean) => void
  reconnecting: string | null
  setReconnecting: (value: string | null) => void
  refresh: () => void
}>) {
  const own = ownRows(data.providers)
  const [notice, setNotice] = useState<string | null>(null)
  return <>
    {own.length === 0
      ? <SectionEmpty>Nenhuma conta conectada</SectionEmpty>
      : <ul className="cxs-list">{own.map((row) => <OwnAccountRow key={row.provider} row={row} onReconnect={setReconnecting} />)}</ul>}
    {reconnecting && <ReconnectAccount provider={reconnecting} onDone={() => { setReconnecting(null); refresh() }} />}
    {connecting || own.length === 0
      ? <ConnectAccount providers={connectableProviders(data.providers)} onConnected={() => { setNotice('Conta conectada.'); setConnecting(false); refresh() }} />
      : <Button type="button" variant="primary" onClick={() => { setNotice(null); setConnecting(true) }}>Conectar conta</Button>}
    {notice && <StatusLine>{notice}</StatusLine>}
  </>
}

function SharedAccountsCard({ administrator }: Readonly<{ administrator: boolean }>) {
  const accounts = useQuery({ queryKey: modelAccountsQueryKey, queryFn: listModelAccounts })
  return <section aria-labelledby="cxs-shared-accounts-title">
    <h2 id="cxs-shared-accounts-title">Compartilhadas pela instalação</h2>
    {accounts.isSuccess && (() => {
      const shared = sharedRows(accounts.data.providers)
      return shared.length === 0
        ? <SectionEmpty>Nenhuma conta compartilhada.</SectionEmpty>
        : <ul className="cxs-list">{shared.map((row) => <SharedAccountRow key={row.provider} row={row} />)}</ul>
    })()}
    {administrator && <Link to="/settings/installation/models">Gerenciar contas compartilhadas</Link>}
  </section>
}

function MyDefaultsCard() {
  return <section aria-labelledby="cxs-my-defaults-title">
    <h2 id="cxs-my-defaults-title">Meus padrões</h2>
    <MyDefaultsSection />
  </section>
}

export function ModelsScreen({ administrator }: Readonly<{ administrator: boolean }>) {
  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState(false)
  const [reconnecting, setReconnecting] = useState<string | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey })

  return <main className="cxs-page">
    <PageHeader title="Minhas contas de modelo" lead="Cada pessoa usa a própria conta. Uma conta compartilhada pela instalação atende quem não conectou a sua." />
    <OwnAccountsCard connecting={connecting} setConnecting={setConnecting} reconnecting={reconnecting} setReconnecting={setReconnecting} refresh={refresh} />
    <SharedAccountsCard administrator={administrator} />
    <GoogleAiProAccount />
    <MyDefaultsCard />
  </main>
}
