import { createRoute } from '@tanstack/react-router'
import { AdminsScreen } from '../features/settings/components/admins-screen'
import { InstallationPage } from '../features/settings/components/installation-page'
import { settingsRoute } from './settings'

export const settingsInstallationAdminsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/installation/admins',
  component: () => <InstallationPage><AdminsScreen /></InstallationPage>,
})
