import { createRoute } from '@tanstack/react-router'
import { InstallationPage } from '../features/settings/components/installation-page'
import { MemoryScreen } from '../features/settings/components/memory-screen'
import { settingsRoute } from './settings'

export const settingsInstallationMemoryRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/installation/memory',
  component: () => <InstallationPage><MemoryScreen /></InstallationPage>,
})
