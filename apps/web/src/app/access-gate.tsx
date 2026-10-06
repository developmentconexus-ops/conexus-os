import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Session } from '@conexus/contract'
import { EntryFailure, EntryLoading, SignedOut } from '../features/entry/entry-screens'
import { isAuthenticationRequired, sessionQuery } from '../features/identity-access/api'
import { useAuthorityLost } from './query-client'

export const useSession = () => useQuery(sessionQuery)

// Every signed-in screen waits for the server's answer about who is here. A session that ended
// shows the same "Sessão encerrada" page as signing out, never an empty screen.
export function AccessGate({ children }: Readonly<{ children: (context: Session) => ReactNode }>) {
  const authorityLost = useAuthorityLost()
  const access = useSession()
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) return <SignedOut />
  if (access.isPending) return <EntryLoading label="Abrindo o Conexus" />
  if (access.isError) return <EntryFailure error={access.error} onRetry={() => void access.refetch()} />
  return children(access.data)
}
