import { createRoute } from '@tanstack/react-router'
import { InstallationModelDefaultsScreen } from '../features/settings/components/installation-model-defaults-screen'
import { InstallationPage } from '../features/settings/components/installation-page'
import { settingsRoute } from './settings'

export const settingsInstallationModelDefaultsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/installation/model-defaults',
  component: () => <InstallationPage><InstallationModelDefaultsScreen /></InstallationPage>,
})
