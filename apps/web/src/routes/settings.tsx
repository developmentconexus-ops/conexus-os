import '@mastra/playground-ui/style.css'
import { Tab, TabContent, TabList, Tabs } from '@mastra/playground-ui/components/Tabs'
import { ThemeProvider } from '@mastra/playground-ui/components/ThemeProvider'
import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { ModelConnectionSettings } from '../features/model-connection/components/model-connection-settings'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { rootRoute } from './__root'

export const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsRoute })

function SettingsRoute() {
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  if (access.isPending) return <main className="status"><h1>Carregando suas configurações</h1></main>
  if (access.isError) return <main className="status"><h1>Não foi possível consultar suas configurações</h1><button type="button" onClick={() => void access.refetch()}>Tentar novamente</button></main>
  const { account, workspaces } = access.data
  return <Shell context={access.data}><main className="control-plane-page settings-page">
    <div className="page-heading"><div><p className="eyebrow">Conta</p><h1>Configurações</h1></div></div>
    <ThemeProvider defaultTheme="light" storageKey="conexus-builder-theme">
      <Tabs defaultTab="credentials">
        <TabList><Tab value="credentials">Credenciais de modelo</Tab><Tab value="account">Conta</Tab></TabList>
        <TabContent value="credentials"><ModelConnectionSettings workspaces={workspaces} currentAccountId={account.accountId} /></TabContent>
        <TabContent value="account">
          <dl className="settings-account">
            <div><dt>Nome</dt><dd>{account.displayName}</dd></div>
            {account.email && <div><dt>E-mail</dt><dd>{account.email}</dd></div>}
            <div><dt>Identificador da conta</dt><dd><code>{account.accountId}</code></dd></div>
            <div><dt>Workspaces</dt><dd>{workspaces.length === 0 ? 'Nenhum' : workspaces.map((workspace) => workspace.name).join(', ')}</dd></div>
          </dl>
        </TabContent>
      </Tabs>
    </ThemeProvider>
  </main></Shell>
}
