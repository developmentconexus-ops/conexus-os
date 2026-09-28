import { createRoute, redirect } from '@tanstack/react-router'
import { settingsRoute } from './settings'

export const settingsInstallationMemoryRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/installation/memory',
  beforeLoad: () => { throw redirect({ to: '/settings/installation/models' }) },
})
