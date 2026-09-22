import { createRoute } from '@tanstack/react-router'
import { GithubScreen } from '../features/settings/components/github-screen'
import { InstallationPage } from '../features/settings/components/installation-page'
import { settingsRoute } from './settings'

export const settingsInstallationGithubRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/installation/github',
  component: () => <InstallationPage><GithubScreen /></InstallationPage>,
})
