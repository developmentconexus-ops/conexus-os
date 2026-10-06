import { HubNoAccessReason } from '@conexus/contract'
import { createRoute } from '@tanstack/react-router'
import { NoAccess, SignedOut } from '../features/entry/entry-screens'
import { rootRoute } from './__root'

export const signedOutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signed-out', component: SignedOut })

const reasonOf = (value: unknown): HubNoAccessReason => {
  const parsed = HubNoAccessReason.safeParse(value)
  return parsed.success ? parsed.data : 'SIGN_IN_FAILED'
}

export const noAccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/no-access',
  validateSearch: (search: Record<string, unknown>) => ({ reason: reasonOf(search.reason) }),
  component: NoAccessRoute,
})

function NoAccessRoute() {
  const { reason } = noAccessRoute.useSearch()
  return <NoAccess reason={reason} />
}
