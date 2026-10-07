import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { endSession, getSession } from '@conexus/contract'
import type { AccountId, Session, WorkspaceId } from '@conexus/contract'
import { routes } from '../http/access.js'
import { digest, sql } from '../platform/db.js'
import type { RawToken } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { HUB_ABSOLUTE_SECONDS, HUB_IDLE_SECONDS, PROVIDER_LOGOUT_TIMEOUT_MS } from '../platform/lifetimes.js'
import { logLine } from '../platform/logger.js'
import { mintToken } from '../platform/opaque-token.js'
import { admitAccount, readAdministratorFlag } from './admission.js'
import type { AccountScope, Admitted } from './admission.js'
import { endCredential, endExpiredHubSession, hubEntry, readHubSession, slideHubSession } from './authentication.js'
import type { HubSessionRow } from './authentication.js'
import type { CurrentSession, HubSessionDigest } from './current-session.js'
import { dueOf, sessionEnded, standingOf } from './session-core.js'
import type { SessionCore, SessionDependencies, Step } from './session-core.js'

const Entry = z.object({ entry: z.boolean() })

export const mayEnterHub = async (proof: Admitted<AccountScope>): Promise<boolean> =>
  (await proof.tx.one(Entry, sql`SELECT ${hubEntry(sql`account`)} AS entry FROM iam.account AS account WHERE account.account_id = ${proof.scope.accountId}`, 'INTERNAL_UNEXPECTED')).entry

export type WorkspaceReader = Readonly<{ listAccessibleWorkspaces(accountId: AccountId): Promise<readonly Readonly<{ workspaceId: WorkspaceId; name: string }>[]> }>

const currentOf = (row: HubSessionRow): CurrentSession => ({
  account: { accountId: row.account_id, displayName: row.display_name, ...(row.email ? { email: row.email } : {}) },
})

/** The Hub session: resolved on every Hub request, opened by a sign in, ended by sign out. */
export const createHubSessions = ({ database, envelope, provider }: SessionDependencies, { ended, settle }: SessionCore) => {
  const resolveHub = async (key: HubSessionDigest): Promise<CurrentSession | null> => {
    const outcome = await settle<CurrentSession>('HUB', (recheckAllowed) => database.authenticate(async (gate): Promise<Step<CurrentSession>> => {
      const row = await readHubSession(gate, key)
      if (!row) return { kind: 'absent' }
      const standing = standingOf(row)
      if (standing.kind === 'ended') return (await endExpiredHubSession(gate, key)) ? { kind: 'ended', ended: 'HUB', reason: standing.reason } : { kind: 'absent' }
      if (!row.active) return ended(gate, key, 'HUB', 'ACCOUNT_INACTIVE')
      if (!row.hub_entry) return ended(gate, key, 'HUB', 'HUB_ENTRY_WITHDRAWN')
      await slideHubSession(gate, key)
      return recheckAllowed && row.recheck_due ? { kind: 'due', due: dueOf(key, row) } : { kind: 'done', value: currentOf(row) }
    }))
    if (outcome.kind === 'PROVIDER_UNAVAILABLE') throw new Failure('IDENTITY_PROVIDER_UNAVAILABLE')
    return outcome.kind === 'SERVED' ? outcome.value : null
  }

  /** Signs the Hub session out, its Previews with it by cascade, then asks Keycloak to end its own session. */
  const endHub = async (key: HubSessionDigest): Promise<void> => {
    const deleted = await database.authenticate((gate) => endCredential(gate, { digest: key, kind: 'HUB' }))
    if (!deleted) throw new Failure('AUTHENTICATION_REQUIRED')
    sessionEnded('HUB', 'SIGNED_OUT')
    const refreshToken = deleted.sealedToken ? await envelope.open(deleted.sealedToken).catch(() => null) : null
    const logout = refreshToken ? await provider.endProviderSession({ refreshToken, signal: AbortSignal.timeout(PROVIDER_LOGOUT_TIMEOUT_MS) }) : 'UNCONFIRMED'
    if (logout !== 'ENDED') logLine('HUB_SIGN_OUT_PROVIDER_LOGOUT_UNCONFIRMED', {}, 'warn')
  }

  /** Inserts the Hub session of a sign in on its admission, keeping the sign in's Keycloak refresh token sealed. */
  const openHubSession = async (proof: Admitted<AccountScope>, refreshToken: string): Promise<RawToken> => {
    const sessionToken = mintToken()
    await proof.tx.run(sql`
      INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, idle_expires_at, provider_refresh_token, provider_checked_at)
      VALUES (${digest(sessionToken)}, 'HUB', ${proof.scope.accountId}, now(), now() + make_interval(secs => ${HUB_ABSOLUTE_SECONDS}),
        now() + make_interval(secs => ${HUB_IDLE_SECONDS}), ${await envelope.seal(refreshToken)}, now())`)
    return sessionToken
  }

  const registerRoutes = async (app: FastifyInstance, workspaceReader: WorkspaceReader): Promise<readonly ['getSession', 'endSession']> => {
    const route = routes(app)
    route.operation(getSession, async (_input, session): Promise<Session> => {
      const { accountId } = session.account
      const workspaces = await workspaceReader.listAccessibleWorkspaces(accountId)
      const administrator = await database.read(accountId, async (gate) => {
        return readAdministratorFlag(await admitAccount(gate))
      })
      return { account: session.account, administrator, workspaces: workspaces.map(({ workspaceId, name }) => ({ workspaceId, name })) }
    })
    route.operation(endSession, async (_input, { digest: key }, effects) => {
      await endHub(key)
      effects['clear-session-cookie']()
      return undefined
    })
    return ['getSession', 'endSession']
  }

  return Object.freeze({ resolveHub, openHubSession, registerRoutes })
}
