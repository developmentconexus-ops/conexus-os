import type { AccountId, ProjectId } from '@conexus/contract'
import type { ApplicationSlug } from '../platform/application-slug.js'
import type { Caller } from '../platform/caller.js'
import { digest, sql } from '../platform/db.js'
import type { Digest, RawToken } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import type { HostOutcome } from '../platform/host-outcome.js'
import { APPLICATION_ABSOLUTE_SECONDS, APPLICATION_HANDOFF_SECONDS } from '../platform/lifetimes.js'
import { mintToken } from '../platform/opaque-token.js'
import { admitApplication, checkApplication } from './admission.js'
import type { Admitted, ApplicationScope, Checked } from './admission.js'
import { consumeApplicationHandoff, endCredential, readApplicationSession } from './authentication.js'
import { callerOf, dueOf, MaxAge, sessionEnded, standingOf } from './session-core.js'
import type { Redeemed, SessionCore, SessionDependencies, Step } from './session-core.js'

export type ApplicationRequest = Readonly<{ caller: Caller; checked: Checked<ApplicationScope>; accountId: AccountId; projectId: ProjectId }>

/** The application session: redeemed from a handoff, checked on every request of its host, ended by sign out. */
export const createApplicationSessions = ({ database, envelope }: SessionDependencies, { ended, settle }: SessionCore) => {
  /** The application request: the session, its standing and the access check in one entry with the served reads, which never write. */
  const withApplicationRequest = <T>(presented: Readonly<{ slug: ApplicationSlug; token: RawToken }>, serve: (request: ApplicationRequest) => Promise<T>): Promise<HostOutcome<T>> => {
    const key = digest(presented.token)
    return settle<T>('APPLICATION', (recheckAllowed) => database.authenticate(async (gate): Promise<Step<T>> => {
      const row = await readApplicationSession(gate, key, presented.slug)
      if (!row) return { kind: 'absent' }
      const standing = standingOf(row)
      if (standing.kind === 'ended') return ended(gate, key, 'APPLICATION', standing.reason)
      if (recheckAllowed && standing.recheckDue) return { kind: 'due', due: dueOf(key, row) }
      const checked = await checkApplication(gate, row.project_id).catch((error: unknown) => {
        if (error instanceof Failure && error.id === 'APPLICATION_NOT_FOUND') return null
        throw error
      })
      if (!checked) return ended(gate, key, 'APPLICATION', 'ACCESS_REFUSED')
      return { kind: 'done', value: await serve({ caller: callerOf(row), checked, accountId: row.account_id, projectId: row.project_id }) }
    }))
  }

  /** Redeems an application handoff once, from the browser that holds its binding, into an application session. */
  const redeemApplication = (input: Readonly<{ handoff: RawToken; slug: ApplicationSlug; binding: RawToken }>): Promise<Redeemed | null> =>
    database.authenticate(async (gate) => {
      const handoff = await consumeApplicationHandoff(gate, digest(input.handoff), input.slug, digest(input.binding))
      if (!handoff) return null
      const proof = await admitApplication(gate, handoff.project_id).catch((error: unknown) => {
        if (error instanceof Failure && error.id === 'APPLICATION_NOT_FOUND') return null
        throw error
      })
      if (!proof) return null
      const sessionToken = mintToken()
      const { max_age: maxAge } = await proof.tx.one(MaxAge, sql`
        INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, project_id, provider_refresh_token, provider_checked_at)
        VALUES (${digest(sessionToken)}, 'APPLICATION', ${proof.scope.accountId}, ${handoff.minted_at}::timestamptz,
          ${handoff.minted_at}::timestamptz + make_interval(secs => ${APPLICATION_ABSOLUTE_SECONDS}), ${handoff.project_id}, ${handoff.sealed_token}, ${handoff.minted_at}::timestamptz)
        RETURNING greatest(1, floor(extract(epoch FROM absolute_expires_at - now())))::int AS max_age`, 'INTERNAL_UNEXPECTED')
      return { sessionToken, maxAgeSeconds: maxAge }
    })

  const signOutApplication = async (token: RawToken): Promise<void> => {
    if (await database.authenticate((gate) => endCredential(gate, { digest: digest(token), kind: 'APPLICATION' }))) sessionEnded('APPLICATION', 'SIGNED_OUT')
  }

  /** Inserts the one use handoff an application callback hands to its host, bound to the browser that began the sign in. */
  const mintApplicationHandoff = async (proof: Admitted<ApplicationScope>, bindingDigest: Digest, refreshToken: string): Promise<RawToken> => {
    const handoff = mintToken()
    await proof.tx.run(sql`
      INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at)
      VALUES (${digest(handoff)}, 'APPLICATION', ${proof.scope.accountId}, ${proof.scope.projectId}, ${bindingDigest}, ${await envelope.seal(refreshToken)},
        now(), now() + make_interval(secs => ${APPLICATION_HANDOFF_SECONDS}))`)
    return handoff
  }

  return Object.freeze({ withApplicationRequest, redeemApplication, signOutApplication, mintApplicationHandoff })
}
