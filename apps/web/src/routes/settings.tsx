import { createRoute, Outlet } from '@tanstack/react-router'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import '../features/settings/settings.css'
import { SettingsRail } from '../features/settings/components/rail'
import type { Session } from '@conexus/contract'
import { rootRoute } from './__root'

export const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsLayoutRoute })

function SettingsLayoutRoute() {
  return <AccessGate>{(context) => <SettingsShell context={context} />}</AccessGate>
}

function SettingsShell({ context }: Readonly<{ context: Session }>) {
  return <Shell context={context} place="Configurações" rail={<SettingsRail administrator={context.administrator} />}>
    <Outlet />
  </Shell>
}
