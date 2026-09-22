import { createRouter } from '@tanstack/react-router'
import { rootRoute } from '../routes/__root'
import { indexRoute } from '../routes/index'
import { projectDetailRoute } from '../routes/project-detail'
import { projectBuildRoute } from '../routes/project-build'
import { setupRoute } from '../routes/setup'
import { settingsRoute } from '../routes/settings'
import { workspaceMembersRoute } from '../routes/workspace-members'
import { workspaceNewRoute } from '../routes/workspace-new'
import { workspaceProjectNewRoute } from '../routes/workspace-project-new'
import { workspaceProjectsRoute } from '../routes/workspace-projects'
import { noAccessRoute, signedOutRoute } from '../routes/entry-pages'
import { projectSettingsRoute } from '../routes/project-settings'
import { workspacesRoute } from '../routes/workspaces'

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  signedOutRoute,
  noAccessRoute,
  workspacesRoute,
  projectSettingsRoute,
  settingsRoute,
  workspaceNewRoute,
  workspaceProjectsRoute,
  workspaceProjectNewRoute,
  workspaceMembersRoute,
  projectDetailRoute,
  projectBuildRoute,
])

export const router = createRouter({ routeTree })

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
