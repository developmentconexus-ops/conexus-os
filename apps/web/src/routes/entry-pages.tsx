import { createRoute } from '@tanstack/react-router'
import { NoAccess, SignedOut } from '../features/entry/entry-screens'
import { rootRoute } from './__root'

export const signedOutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signed-out', component: SignedOut })
export const noAccessRoute = createRoute({ getParentRoute: () => rootRoute, path: '/no-access', component: NoAccess })
