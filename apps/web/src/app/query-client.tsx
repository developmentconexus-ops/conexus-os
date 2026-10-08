import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

let authorityLost = false
const authorityListeners = new Set<() => void>()
const projectQueries = new Set([
  'project-conversations', 'builder-thread-messages', 'builder-session-model', 'builder-session',
  'builder-source-tree', 'builder-source-file', 'builder-source-compare', 'builder-source-sides',
  'builder-run-trace', 'builder-result-diff',
])

const publishAuthorityState = () => {
  for (const listener of authorityListeners) listener()
}

export function clearAuthorityCache() {
  authorityLost = true
  queryClient.clear()
  publishAuthorityState()
}

export function clearProjectCache(projectId: string) {
  queryClient.removeQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' && projectQueries.has(queryKey[0]) && queryKey[1] === projectId,
  })
  void queryClient.invalidateQueries({ queryKey: ['listProjects'] })
  void queryClient.invalidateQueries({ queryKey: ['listProjectSummaries'] })
}

export function refreshProjectCache(projectId: string) {
  void queryClient.invalidateQueries({
    predicate: ({ queryKey }) => {
      const input = queryKey[1]
      return queryKey[0] === 'getProject'
        && typeof input === 'object' && input !== null && 'params' in input
        && typeof input.params === 'object' && input.params !== null && 'projectId' in input.params
        && input.params.projectId === projectId
    },
  })
}

export function confirmAuthority() {
  if (!authorityLost) return
  authorityLost = false
  publishAuthorityState()
}

export function useAuthorityLost() {
  return useSyncExternalStore(
    (listener) => {
      authorityListeners.add(listener)
      return () => authorityListeners.delete(listener)
    },
    () => authorityLost,
  )
}

export function AppQueryClientProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
