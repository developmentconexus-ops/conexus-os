import { useQuery } from '@tanstack/react-query'
import { createRoute, Outlet } from '@tanstack/react-router'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import '../features/settings/settings.css'
import { SettingsRail } from '../features/settings/components/rail'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { getInstallationStatus, installationQueryKey } from '../features/settings/installation-api'
import { rootRoute } from './__root'

export const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsLayoutRoute })

function SettingsLayoutRoute() {
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  // Read once here and cached for every child screen: the rail's groups and each installation
  // screen's refused state both depend on it, and react-query keeps it to one request.
  const installation = useQuery({ queryKey: installationQueryKey, queryFn: getInstallationStatus, enabled: access.isSuccess })
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  if (access.isPending) return <main className="status"><h1>Carregando suas configurações</h1></main>
  if (access.isError) return <main className="status"><h1>Não foi possível consultar suas configurações</h1><button type="button" onClick={() => void access.refetch()}>Tentar novamente</button></main>
  return <Shell context={access.data} place="Configurações" rail={<SettingsRail administrator={installation.data?.administrator === true} />}>
    <Outlet />
  </Shell>
}
