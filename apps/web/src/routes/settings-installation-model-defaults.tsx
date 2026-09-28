import { createRoute, redirect } from '@tanstack/react-router'
import { settingsRoute } from './settings'

export const settingsInstallationModelDefaultsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/installation/model-defaults',
  beforeLoad: () => { throw redirect({ to: '/settings/installation/models' }) },
})
