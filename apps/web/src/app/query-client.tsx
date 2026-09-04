import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

let authorityLost = false
const authorityListeners = new Set<() => void>()

const publishAuthorityState = () => {
  for (const listener of authorityListeners) listener()
}

export function clearAuthorityCache() {
  authorityLost = true
  queryClient.clear()
  publishAuthorityState()
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
