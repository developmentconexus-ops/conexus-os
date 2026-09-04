import { createRouter } from '@tanstack/react-router'
import { rootRoute } from '../routes/__root'
import { indexRoute } from '../routes/index'
import { projectDetailRoute } from '../routes/project-detail'
import { projectInceptionRoute } from '../routes/project-inception'
import { projectBaselineCandidateRoute } from '../routes/project-baseline-candidate'
import { setupRoute } from '../routes/setup'
import { workspaceNewRoute } from '../routes/workspace-new'
import { workspaceProjectNewRoute } from '../routes/workspace-project-new'
import { workspaceProjectsRoute } from '../routes/workspace-projects'

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  workspaceNewRoute,
  workspaceProjectsRoute,
  workspaceProjectNewRoute,
  projectDetailRoute,
  projectInceptionRoute,
  projectBaselineCandidateRoute,
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
