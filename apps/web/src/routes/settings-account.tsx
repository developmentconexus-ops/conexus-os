import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { AccountScreen } from '../features/settings/components/account-screen'
import { accessContextQueryKey, getAccessContext } from '../features/identity-access/api'
import { settingsRoute } from './settings'

export const settingsAccountRoute = createRoute({ getParentRoute: () => settingsRoute, path: '/account', component: SettingsAccountRoute })

function SettingsAccountRoute() {
  // The parent layout already resolved this to render at all; a plain read is enough here.
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  if (!access.data) return null
  return <AccountScreen account={access.data.account} workspaces={access.data.workspaces} />
}
