import { useQuery } from '@tanstack/react-query'
import { createRoute, Outlet } from '@tanstack/react-router'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import '../features/settings/settings.css'
import { SettingsRail } from '../features/settings/components/rail'
import { getInstallationStatus, installationQueryKey } from '../features/settings/installation-api'
import type { AccessContext } from '../generated/iam-client'
import { rootRoute } from './__root'

export const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsLayoutRoute })

function SettingsLayoutRoute() {
  return <AccessGate>{(context) => <SettingsShell context={context} />}</AccessGate>
}

function SettingsShell({ context }: Readonly<{ context: AccessContext }>) {
  // Read once here and cached for every child screen: the rail's groups and each installation
  // screen's refused state both depend on it, and react-query keeps it to one request.
  const installation = useQuery({ queryKey: installationQueryKey, queryFn: getInstallationStatus })
  return <Shell context={context} place="Configurações" rail={<SettingsRail administrator={installation.data?.administrator === true} />}>
    <Outlet />
  </Shell>
}
