import { Failure } from '../platform/failure.js'
import { z } from 'zod'
import type { AccountId, EmailAddress } from '@conexus/contract'
import type { Caller } from '../platform/caller.js'
import type { AuthenticationGate, Database, Digest, RawToken } from '../platform/db.js'
import type { HostOutcome } from './host-outcome.js'
import { logLine } from '../platform/logger.js'
import { sessionContext, type Sealed, type SecretEnvelope } from '../platform/secrets.js'
import { endCredential, recordProviderCheck } from './authentication.js'
import type { OidcAdapter, ProviderRefusal } from './oidc.js'

/** Why a session ended; the reason reaches a SESSION_ENDED line and nothing else. */
export type SessionEndReason =
  | 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED' | 'HUB_ENTRY_WITHDRAWN' | 'ACCOUNT_INACTIVE' | 'CUSTODY_CHANGED' | 'SIGNED_OUT'
  | 'PROVIDER_USER_DISABLED' | 'PROVIDER_SESSION_ENDED' | 'PROVIDER_REFUSED' | 'ACCESS_REFUSED' | 'PARENT_ENDED'
export type SessionKind = 'HUB' | 'APPLICATION' | 'PREVIEW'

/** A session row's standing, mapped from the columns the database computed with its own clock. */
type Standing = Readonly<{ kind: 'ended'; reason: 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED' }> | Readonly<{ kind: 'live'; recheckDue: boolean }>

export const standingOf = (row: Readonly<{ liveness: 'LIVE' | 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED'; recheck_due: boolean }>): Standing =>
  row.liveness === 'LIVE' ? { kind: 'live', recheckDue: row.recheck_due } : { kind: 'ended', reason: row.liveness }

export type Redeemed = Readonly<{ sessionToken: RawToken; maxAgeSeconds: number }>
export type Due = Readonly<{ digest: Digest; seen: string; sealedToken: Sealed<'hub-session'>; subject: string }>
/** What one entry of a session request returns: the entry commits first, then the caller acts on it. */
export type Step<T> =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'ended'; ended: SessionKind; reason: SessionEndReason }>
  | Readonly<{ kind: 'due'; due: Due }>
  | Readonly<{ kind: 'done'; value: T }>

export const callerOf = (row: Readonly<{ account_id: AccountId; email: EmailAddress | null; display_name: string }>): Caller =>
  Object.freeze({ accountId: row.account_id, email: row.email, displayName: row.display_name })

export const dueOf = (key: Digest, row: Readonly<{ sealed_token: Sealed<'hub-session'>; checked_at: string; subject: string }>): Due =>
  ({ digest: key, seen: row.checked_at, sealedToken: row.sealed_token, subject: row.subject })

export const MaxAge = z.object({ max_age: z.number().int() })

export const sessionEnded = (kind: SessionKind, reason: SessionEndReason): void => { logLine('SESSION_ENDED', { kind, reason }) }

const PROVIDER_ENDING: Readonly<Record<ProviderRefusal, SessionEndReason>> = Object.freeze({
  USER_DISABLED: 'PROVIDER_USER_DISABLED',
  SESSION_ENDED: 'PROVIDER_SESSION_ENDED',
  REFUSED: 'PROVIDER_REFUSED',
})

export type SessionDependencies = Readonly<{
  database: Database
  envelope: SecretEnvelope
  provider: Pick<OidcAdapter, 'refresh' | 'endProviderSession'>
}>

/** What every session kind shares: ending a session once, the Keycloak recheck, and the entry that runs again after it. */
export const createSessionCore = ({ database, envelope, provider }: SessionDependencies) => {
  // A parallel request that ended the session first leaves no row here, so this one writes no second line.
  const ended = async <T>(gate: AuthenticationGate, key: Digest, kind: SessionKind, reason: SessionEndReason): Promise<Step<T>> =>
    (await endCredential(gate, { digest: key, kind })) ? { kind: 'ended', ended: kind, reason } : { kind: 'absent' }

  const endWith = async (key: Digest, kind: SessionKind, reason: SessionEndReason): Promise<'ENDED'> => {
    if ((await database.authenticate((gate) => ended(gate, key, kind, reason))).kind === 'ended') sessionEnded(kind, reason)
    return 'ENDED'
  }

  // The one Keycloak check of every session that holds a token, run outside any transaction. Keycloak
  // does not rotate refresh tokens, so requests that find one check due may all ask at once.
  const recheck = async (kind: 'HUB' | 'APPLICATION', due: Due): Promise<'KEPT' | 'ENDED' | 'UNAVAILABLE'> => {
    let refreshToken: string
    try {
      refreshToken = await envelope.open(due.sealedToken, sessionContext(due.digest))
    } catch (error) {
      if (!(error instanceof Failure) || error.id !== 'SECRET_CUSTODY_LOST') throw error
      return endWith(due.digest, kind, 'CUSTODY_CHANGED')
    }
    const answer = await provider.refresh({ refreshToken, expectedSubject: due.subject })
    if (answer.kind === 'UNAVAILABLE') return 'UNAVAILABLE'
    if (answer.kind === 'REFUSED') return endWith(due.digest, kind, PROVIDER_ENDING[answer.reason])
    const sealedToken = await envelope.seal(answer.refreshToken, sessionContext(due.digest))
    const recorded = await database.authenticate((gate) => recordProviderCheck(gate, { digest: due.digest, seen: due.seen, sealedToken }))
    return recorded === 'RECORDED' ? 'KEPT' : 'ENDED'
  }

  // An entry that ran without a recheck never answers `due`, so a second `due` asks to sign in.
  const outcomeOf = <T>(step: Step<T>): HostOutcome<T> => {
    if (step.kind === 'done') return { kind: 'SERVED', value: step.value }
    if (step.kind === 'ended') sessionEnded(step.ended, step.reason)
    return { kind: 'SIGN_IN_REQUIRED' }
  }

  /** Runs a request's entry; when it found a check due, asks Keycloak and runs the entry once more without one. */
  const settle = async <T>(kind: 'HUB' | 'APPLICATION', entry: (recheckAllowed: boolean) => Promise<Step<T>>): Promise<HostOutcome<T>> => {
    const first = await entry(true)
    if (first.kind !== 'due') return outcomeOf(first)
    const answer = await recheck(kind, first.due)
    if (answer === 'UNAVAILABLE') return { kind: 'PROVIDER_UNAVAILABLE' }
    if (answer === 'ENDED') return { kind: 'SIGN_IN_REQUIRED' }
    return outcomeOf(await entry(false))
  }

  return Object.freeze({ ended, settle })
}

export type SessionCore = ReturnType<typeof createSessionCore>
