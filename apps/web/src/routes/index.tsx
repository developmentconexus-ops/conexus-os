import { createRoute, Navigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuthorityLost } from '../app/query-client'
import { useAccessContext } from '../app/access-gate'
import { entryDestination, readLastWorkspace } from '../features/entry/entry-destination'
import { EntryFailure, EntryLoading, SIGN_IN_URL } from '../features/entry/entry-screens'
import { isAuthenticationRequired } from '../features/identity-access/api'
import { rootRoute } from './__root'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: EntryRoute,
})

function GoToSignIn() {
  useEffect(() => {
    window.location.replace(SIGN_IN_URL)
  }, [])
  return <EntryLoading label="Abrindo a página de entrada" />
}

function EntryRoute() {
  const authorityLost = useAuthorityLost()
  const access = useAccessContext()
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) return <GoToSignIn />
  if (access.isPending) return <EntryLoading label="Abrindo o Conexus" />
  if (access.isError) return <EntryFailure onRetry={() => void access.refetch()} />
  const destination = entryDestination(access.data.workspaces, readLastWorkspace())
  switch (destination.kind) {
    case 'create-workspace':
      return <Navigate to="/workspaces/new" replace />
    case 'workspace':
      return <Navigate to="/workspaces/$workspaceId/projects" params={{ workspaceId: destination.workspaceId }} replace />
    case 'choose-workspace':
      return <Navigate to="/workspaces" replace />
  }
}
