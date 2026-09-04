import React, { useState } from 'react'
import { createRootRouteWithContext, createRoute, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

const Root = () => (
  <main>
    <header><strong>R1 browser foundation</strong></header>
    <Outlet />
    <footer>{import.meta.env.VITE_PUBLIC_LABEL}</footer>
  </main>
)

export const rootRoute = createRootRouteWithContext()({ component: Root })

const Project = () => {
  const { projectId } = projectRoute.useParams()
  const search = projectRoute.useSearch()
  const { queryClient } = rootRoute.useRouteContext()
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const response = await fetch('/api/session', { credentials: 'same-origin' })
      if (!response.ok) throw new Error('session')
      return response.json()
    },
    staleTime: Infinity,
    retry: false,
  })
  const project = useQuery({
    queryKey: ['project', projectId],
    enabled: session.isSuccess,
    queryFn: async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(response.status === 403 ? 'denied' : 'project')
      return response.json()
    },
    retry: false,
    staleTime: Infinity,
  })
  const [status, setStatus] = useState('Idle')

  React.useEffect(() => {
    window.__R1F_QUERY_CLIENT = queryClient
    return () => { delete window.__R1F_QUERY_CLIENT }
  }, [queryClient])

  if (session.isPending || project.isPending) return <p role="status">Loading</p>
  if (session.isError || project.isError) return <h1>Access denied</h1>

  const save = async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/save`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': session.data.csrf,
      },
      body: JSON.stringify({ expectedRevision: 1 }),
    })
    setStatus(response.ok ? `Saved ${(await response.json()).mutationCount}` : 'Denied')
  }

  return (
    <section>
      <h1>{project.data.name}</h1>
      <p>Requested workspace: {search.workspaceId ?? 'none'}</p>
      <button type="button" onClick={save}>Save project</button>
      <p role="status">{status}</p>
    </section>
  )
}

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  validateSearch: search => ({
    workspaceId: typeof search.workspaceId === 'string' ? search.workspaceId : undefined,
    admin: search.admin === true || search.admin === 'true',
  }),
  component: Project,
})

export const routeTree = rootRoute.addChildren([projectRoute])
