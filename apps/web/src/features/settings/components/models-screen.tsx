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
import { SectionEmpty, SectionError, SectionLoading, StatusLine } from './states'

function OwnAccountsCard({ connecting, setConnecting, refresh }: Readonly<{
  connecting: boolean
  setConnecting: (value: boolean) => void
  refresh: () => void
}>) {
  const accounts = useQuery({ queryKey: modelAccountsQueryKey, queryFn: listModelAccounts })
  return <section aria-labelledby="cxs-own-accounts-title">
    <h2 id="cxs-own-accounts-title">Suas contas</h2>
    {accounts.isPending && <SectionLoading />}
    {accounts.isError && <SectionError description="Não foi possível consultar suas contas de modelo." onRetry={() => void accounts.refetch()} />}
    {accounts.isSuccess && <OwnAccountsBody data={accounts.data} connecting={connecting} setConnecting={setConnecting} refresh={refresh} />}
  </section>
}

function OwnAccountsBody({ data, connecting, setConnecting, refresh }: Readonly<{
  data: ModelAccounts
  connecting: boolean
  setConnecting: (value: boolean) => void
  refresh: () => void
}>) {
  const own = ownRows(data.providers)
  const [notice, setNotice] = useState<string | null>(null)
  return <>
    {own.length === 0
      ? <SectionEmpty>Nenhuma conta conectada</SectionEmpty>
      : <ul className="cxs-list">{own.map((row) => <OwnAccountRow key={row.provider} row={row} />)}</ul>}
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
  const refresh = () => void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey })

  return <main className="cxs-page">
    <PageHeader title="Minhas contas de modelo" lead="Cada pessoa usa a própria conta. Uma conta compartilhada pela instalação atende quem não conectou a sua." />
    <OwnAccountsCard connecting={connecting} setConnecting={setConnecting} refresh={refresh} />
    <SharedAccountsCard administrator={administrator} />
    <GoogleAiProAccount />
    <MyDefaultsCard />
  </main>
}
