import { createRouter } from '@tanstack/react-router'
import { rememberReturnTo } from '../features/settings/return-to'
import { rootRoute } from '../routes/__root'
import { indexRoute } from '../routes/index'
import { construirRoute, projectBuildRoute, projectRoute } from '../routes/construir'
import { settingsRoute } from '../routes/settings'
import { settingsAccountRoute } from '../routes/settings-account'
import { settingsIndexRoute } from '../routes/settings-index'
import { settingsInstallationAdminsRoute } from '../routes/settings-installation-admins'
import { settingsInstallationGithubRoute } from '../routes/settings-installation-github'
import { settingsInstallationMemoryRoute } from '../routes/settings-installation-memory'
import { settingsInstallationModelDefaultsRoute } from '../routes/settings-installation-model-defaults'
import { settingsInstallationModelsRoute } from '../routes/settings-installation-models'
import { settingsModelsRoute } from '../routes/settings-models'
import { setupRoute } from '../routes/setup'
import { workspaceMembersRoute } from '../routes/workspace-members'
import { workspaceNewRoute } from '../routes/workspace-new'
import { workspaceProjectNewRoute } from '../routes/workspace-project-new'
import { workspaceProjectsRoute } from '../routes/workspace-projects'
import { noAccessRoute, signedOutRoute } from '../routes/entry-pages'
import { projectSettingsAccessRoute } from '../routes/project-settings-access'
import { projectSettingsRoute } from '../routes/project-settings'
import { workspacesRoute } from '../routes/workspaces'

const settingsRouteWithChildren = settingsRoute.addChildren([
  settingsIndexRoute,
  settingsAccountRoute,
  settingsModelsRoute,
  settingsInstallationGithubRoute,
  settingsInstallationModelsRoute,
  settingsInstallationModelDefaultsRoute,
  settingsInstallationMemoryRoute,
  settingsInstallationAdminsRoute,
])

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  signedOutRoute,
  noAccessRoute,
  workspacesRoute,
  projectSettingsRoute,
  projectSettingsAccessRoute,
  settingsRouteWithChildren,
  workspaceNewRoute,
  workspaceProjectsRoute,
  workspaceProjectNewRoute,
  workspaceMembersRoute,
  projectRoute,
  projectBuildRoute,
  construirRoute,
])

export const router = createRouter({ routeTree })

// The Settings rail's "Voltar" item needs the last place the person actually was; this is the one
// spot every navigation passes through.
router.subscribe('onResolved', (event) => {
  rememberReturnTo(event.toLocation.pathname)
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// router-core 1.171.27 ships this runtime/source field but omits it from the
// published RouteMatch declaration consumed by its own SSR types.
declare module '@tanstack/router-core' {
  interface RouteMatch<
    out TRouteId,
    out TFullPath,
    out TAllParams,
    out TFullSearchSchema,
    out TLoaderData,
    out TAllContext,
    out TLoaderDeps,
  > {
    __beforeLoadContext?: Record<string, unknown>
  }
}
