import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { Shell } from '../app/shell'
import { ClaudeAccountSettings } from '../features/claude-account/components/claude-account-settings'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { rootRoute } from './__root'

export const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsRoute })

function SettingsRoute() {
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  if (access.isError && isAuthenticationRequired(access.error)) return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  if (access.isPending) return <main className="status"><h1>Carregando suas configurações</h1></main>
  if (access.isError) return <main className="status"><h1>Não foi possível consultar suas configurações</h1><button type="button" onClick={() => void access.refetch()}>Tentar novamente</button></main>
  return <Shell context={access.data}><main className="control-plane-page"><div className="page-heading"><div><p className="eyebrow">Conta</p><h1>Configurações</h1></div></div><ClaudeAccountSettings /></main></Shell>
}
