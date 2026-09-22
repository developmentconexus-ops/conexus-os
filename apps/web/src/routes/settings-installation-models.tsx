import { createRoute } from '@tanstack/react-router'
import { InstallationModelsScreen } from '../features/settings/components/installation-models-screen'
import { InstallationPage } from '../features/settings/components/installation-page'
import { settingsRoute } from './settings'

export const settingsInstallationModelsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/installation/models',
  component: () => <InstallationPage><InstallationModelsScreen /></InstallationPage>,
})
