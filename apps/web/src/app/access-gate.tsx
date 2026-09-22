import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EntryFailure, EntryLoading, SignedOut } from '../features/entry/entry-screens'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import type { AccessContext } from '../generated/iam-client'
import { useAuthorityLost } from './query-client'

export const useAccessContext = () => useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })

// Every signed-in screen waits for the server's answer about who is here. A session that ended
// shows the same "Sessão encerrada" page as signing out, never an empty screen.
export function AccessGate({ children }: Readonly<{ children: (context: AccessContext) => ReactNode }>) {
  const authorityLost = useAuthorityLost()
  const access = useAccessContext()
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) return <SignedOut />
  if (access.isPending) return <EntryLoading label="Abrindo o Conexus" />
  if (access.isError) return <EntryFailure onRetry={() => void access.refetch()} />
  return children(access.data)
}
