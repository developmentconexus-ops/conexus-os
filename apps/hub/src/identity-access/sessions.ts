import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { endSession, getSession } from '@conexus/contract'
import type { AccountId, ArtifactRevisionId, EmailAddress, ProjectId, Session, WorkspaceId } from '@conexus/contract'
import { routes } from '../http/access.js'
import type { ApplicationSlug } from '../platform/application-slug.js'
import type { Caller } from '../platform/caller.js'
import { digest, sql } from '../platform/db.js'
import type { Database, Digest, RawToken } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { APPLICATION_ABSOLUTE_SECONDS, APPLICATION_HANDOFF_SECONDS, HUB_ABSOLUTE_SECONDS, HUB_IDLE_SECONDS, PREVIEW_HANDOFF_SECONDS, PREVIEW_SECONDS } from '../platform/lifetimes.js'
import { logLine } from '../platform/logger.js'
import { mintToken } from '../platform/opaque-token.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import { admitAccount, admitApplication, checkApplication, checkProject, isInstallationAdministrator } from './admission.js'
import type { AccountScope, Admitted, ApplicationScope, Checked, ProjectScope } from './admission.js'
import { consumeApplicationHandoff, consumePreviewHandoff, endCredential, endExpiredHubSession, hubEntry, readApplicationSession, readHubSession, readPreviewSession, recordProviderCheck, slideHubSession } from './authentication.js'
import type { HubSessionRow } from './authentication.js'
import type { CurrentSession, HubSessionDigest } from './current-session.js'
import type { OidcAdapter, ProviderRefusal } from './oidc.js'

/** Why a session ended; the reason reaches a SESSION_ENDED line and nothing else. */
export type SessionEndReason =
  | 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED' | 'HUB_ENTRY_WITHDRAWN' | 'ACCOUNT_INACTIVE' | 'CUSTODY_CHANGED' | 'SIGNED_OUT'
  | 'PROVIDER_USER_DISABLED' | 'PROVIDER_SESSION_ENDED' | 'PROVIDER_REFUSED' | 'ACCESS_REFUSED' | 'PARENT_ENDED'
type SessionKind = 'HUB' | 'APPLICATION' | 'PREVIEW'

/** A session row's standing, mapped from the columns the database computed with its own clock. */
export type Standing = Readonly<{ kind: 'ended'; reason: 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED' }> | Readonly<{ kind: 'live'; recheckDue: boolean }>

const standingOf = (row: Readonly<{ liveness: 'LIVE' | 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED'; recheck_due: boolean }>): Standing =>
  row.liveness === 'LIVE' ? { kind: 'live', recheckDue: row.recheck_due } : { kind: 'ended', reason: row.liveness }

const PROVIDER_ENDING: Readonly<Record<ProviderRefusal, SessionEndReason>> = Object.freeze({
  USER_DISABLED: 'PROVIDER_USER_DISABLED',
  SESSION_ENDED: 'PROVIDER_SESSION_ENDED',
  REFUSED: 'PROVIDER_REFUSED',
})

const PROVIDER_LOGOUT_TIMEOUT_MS = 3_000

const sessionEnded = (kind: SessionKind, reason: SessionEndReason): void => { logLine('SESSION_ENDED', { kind, reason }) }

/** A request on an application or Preview host: served, sent to sign in, or refused because Keycloak could not be asked. */
export type ApplicationOutcome<T> =
  | Readonly<{ kind: 'SERVED'; value: T }>
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>
export type ApplicationRequest = Readonly<{ caller: Caller; checked: Checked<ApplicationScope>; accountId: AccountId; projectId: ProjectId }>
export type PreviewRequest = Readonly<{ caller: Caller; checked: Checked<ProjectScope<'project.read'>>; accountId: AccountId; projectId: ProjectId; artifactRevisionId: ArtifactRevisionId; expiresAt: Date }>
export type Redeemed = Readonly<{ sessionToken: RawToken; maxAgeSeconds: number }>

type Due = Readonly<{ digest: Digest; seen: string; sealedToken: string; subject: string }>
// What one entry of a session request returns: the entry commits first, then the caller acts on it.
type Step<T> =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'ended'; ended: SessionKind; reason: SessionEndReason }>
  | Readonly<{ kind: 'due'; due: Due }>
  | Readonly<{ kind: 'done'; value: T }>
type Recheck = 'KEPT' | 'ENDED' | 'UNAVAILABLE'

const callerOf = (row: Readonly<{ account_id: AccountId; email: EmailAddress | null; display_name: string }>): Caller =>
  Object.freeze({ accountId: row.account_id, email: row.email, displayName: row.display_name })

const currentOf = (row: HubSessionRow): CurrentSession => ({
  account: { accountId: row.account_id, displayName: row.display_name, ...(row.email ? { email: row.email } : {}) },
})

const dueOf = (key: Digest, row: Readonly<{ sealed_token: string; checked_at: string; subject: string }>): Due =>
  ({ digest: key, seen: row.checked_at, sealedToken: row.sealed_token, subject: row.subject })

const MaxAge = z.object({ max_age: z.number().int() })
const Expiry = z.object({ expires_at: z.date() })
const Entry = z.object({ entry: z.boolean() })

/** Whether the admitted account enters the Hub, by the one Hub entry rule. */
export const mayEnterHub = async (proof: Admitted<AccountScope>): Promise<boolean> =>
  (await proof.tx.one(Entry, sql`SELECT ${hubEntry(sql`account`)} AS entry FROM iam.account AS account WHERE account.account_id = ${proof.scope.accountId}`, 'INTERNAL_UNEXPECTED')).entry

export type WorkspaceReader = Readonly<{ listAccessibleWorkspaces(accountId: AccountId): Promise<readonly Readonly<{ workspaceId: WorkspaceId; name: string }>[]> }>

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: the three session kinds share one recheck and one entry discipline
export const createSessions = ({ database, envelope, provider }: Readonly<{
  database: Database
  /** Seals the Keycloak refresh token every Hub and application session keeps, with the installation's credential key. */
  envelope: SecretEnvelope
  provider: Pick<OidcAdapter, 'refresh' | 'endProviderSession'>
}>) => {
  const ended = <T>(gate: Parameters<typeof endCredential>[0], key: Digest, kind: SessionKind, reason: SessionEndReason): Promise<Step<T>> =>
    endCredential(gate, { digest: key, kind }).then(() => ({ kind: 'ended', ended: kind, reason }))

  const endWith = async (key: Digest, kind: SessionKind, reason: SessionEndReason): Promise<'ENDED'> => {
    if (await database.authenticate((gate) => endCredential(gate, { digest: key, kind }))) sessionEnded(kind, reason)
    return 'ENDED'
  }

  // The one Keycloak check of every session that holds a token, run outside any transaction. Keycloak
  // does not rotate refresh tokens, so requests that find one check due may all ask at once.
  const recheck = async (kind: 'HUB' | 'APPLICATION', due: Due): Promise<Recheck> => {
    let refreshToken: string
    try {
      refreshToken = await envelope.open(due.sealedToken)
    } catch {
      return endWith(due.digest, kind, 'CUSTODY_CHANGED')
    }
    const answer = await provider.refresh({ refreshToken, expectedSubject: due.subject })
    if (answer.kind === 'UNAVAILABLE') return 'UNAVAILABLE'
    if (answer.kind === 'REFUSED') return endWith(due.digest, kind, PROVIDER_ENDING[answer.reason])
    const sealedToken = await envelope.seal(answer.refreshToken)
    const recorded = await database.authenticate((gate) => recordProviderCheck(gate, { digest: due.digest, seen: due.seen, sealedToken }))
    return recorded === 'RECORDED' ? 'KEPT' : 'ENDED'
  }

  // A request runs its entry, and when the entry found a check due, asks Keycloak and runs the entry again once.
  const settle = async <T>(kind: 'HUB' | 'APPLICATION', entry: (recheckAllowed: boolean) => Promise<Step<T>>): Promise<ApplicationOutcome<T>> => {
    for (const recheckAllowed of [true, false]) {
      const step = await entry(recheckAllowed)
      if (step.kind === 'done') return { kind: 'SERVED', value: step.value }
      if (step.kind === 'absent') return { kind: 'SIGN_IN_REQUIRED' }
      if (step.kind === 'ended') {
        sessionEnded(step.ended, step.reason)
        return { kind: 'SIGN_IN_REQUIRED' }
      }
      const answer = await recheck(kind, step.due)
      if (answer === 'UNAVAILABLE') return { kind: 'PROVIDER_UNAVAILABLE' }
      if (answer === 'ENDED') return { kind: 'SIGN_IN_REQUIRED' }
    }
    throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'RECHECK_REPEATED' } })
  }

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

  /** The application request: the session, its standing and the access check in one entry with the served reads, which never write. */
  const withApplicationRequest = <T>(presented: Readonly<{ slug: ApplicationSlug; token: RawToken }>, serve: (request: ApplicationRequest) => Promise<T>): Promise<ApplicationOutcome<T>> => {
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

  /** Mints the entry handoff of a Preview under the launch's own admission, so the launch cannot disagree with it. */
  const openPreview = async (proof: Admitted<ProjectScope<'project.read'>>, hubSession: HubSessionDigest, artifactRevisionId: ArtifactRevisionId): Promise<Readonly<{ entryGrant: RawToken; expiresAt: Date }>> => {
    const entryGrant = mintToken()
    const { expires_at: expiresAt } = await proof.tx.one(Expiry, sql`
      INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, artifact_revision_id, parent_digest, minted_at, expires_at, session_expires_at)
      VALUES (${digest(entryGrant)}, 'PREVIEW', ${proof.scope.accountId}, ${proof.scope.projectId}, ${artifactRevisionId}, ${hubSession},
        now(), now() + make_interval(secs => ${PREVIEW_HANDOFF_SECONDS}), now() + make_interval(secs => ${PREVIEW_SECONDS}))
      RETURNING session_expires_at AS expires_at`, 'INTERNAL_UNEXPECTED')
    return { entryGrant, expiresAt }
  }

  const redeemPreview = (input: Readonly<{ handoff: RawToken; artifactRevisionId: ArtifactRevisionId }>): Promise<Redeemed | null> =>
    database.authenticate(async (gate) => {
      const handoff = await consumePreviewHandoff(gate, digest(input.handoff), input.artifactRevisionId)
      if (!handoff) return null
      const proof = await admitAccount(gate)
      const sessionToken = mintToken()
      const { max_age: maxAge } = await proof.tx.one(MaxAge, sql`
        INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, project_id, artifact_revision_id, parent_digest)
        VALUES (${digest(sessionToken)}, 'PREVIEW', ${proof.scope.accountId}, now(), ${handoff.session_expires_at}::timestamptz, ${handoff.project_id},
          ${handoff.artifact_revision_id}, ${handoff.parent_digest})
        RETURNING greatest(1, floor(extract(epoch FROM absolute_expires_at - now())))::int AS max_age`, 'INTERNAL_UNEXPECTED')
      return { sessionToken, maxAgeSeconds: maxAge }
    })

  /**
   * A Preview request: the session, its parent Hub session's standing and due check, and the Project's
   * membership, in one entry with the served reads. A Preview does not slide its parent. A refused
   * check ends the Preview only; an ended parent ends both.
   */
  const withPreviewRequest = <T>(presented: Readonly<{ artifactRevisionId: ArtifactRevisionId; token: RawToken }>, serve: (request: PreviewRequest) => Promise<T>): Promise<ApplicationOutcome<T>> => {
    const key = digest(presented.token)
    return settle<T>('HUB', (recheckAllowed) => database.authenticate(async (gate): Promise<Step<T>> => {
      const row = await readPreviewSession(gate, key, presented.artifactRevisionId)
      if (!row) return { kind: 'absent' }
      if (row.liveness !== 'LIVE') return ended(gate, key, 'PREVIEW', 'ABSOLUTE_EXPIRED')
      if (row.parent_liveness !== 'LIVE') return ended(gate, row.parent_digest, 'HUB', row.parent_liveness)
      if (!row.parent_active) return ended(gate, row.parent_digest, 'HUB', 'ACCOUNT_INACTIVE')
      if (!row.parent_entry) return ended(gate, row.parent_digest, 'HUB', 'HUB_ENTRY_WITHDRAWN')
      if (recheckAllowed && row.parent_recheck_due) {
        return { kind: 'due', due: { digest: row.parent_digest, seen: row.parent_checked_at, sealedToken: row.parent_sealed_token, subject: row.subject } }
      }
      const checked = await checkProject(gate, row.project_id).catch((error: unknown) => {
        if (error instanceof Failure && error.id === 'PROJECT_NOT_FOUND') return null
        throw error
      })
      if (!checked) return ended(gate, key, 'PREVIEW', 'ACCESS_REFUSED')
      return { kind: 'done', value: await serve({ caller: callerOf(row), checked, accountId: row.account_id, projectId: row.project_id, artifactRevisionId: row.artifact_revision_id, expiresAt: row.expires_at }) }
    }))
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

  /** Inserts the one use handoff an application callback hands to its host, bound to the browser that began the sign in. */
  const mintApplicationHandoff = async (proof: Admitted<ApplicationScope>, bindingDigest: Digest, refreshToken: string): Promise<RawToken> => {
    const handoff = mintToken()
    await proof.tx.run(sql`
      INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at)
      VALUES (${digest(handoff)}, 'APPLICATION', ${proof.scope.accountId}, ${proof.scope.projectId}, ${bindingDigest}, ${await envelope.seal(refreshToken)},
        now(), now() + make_interval(secs => ${APPLICATION_HANDOFF_SECONDS}))`)
    return handoff
  }

  const registerRoutes = async (app: FastifyInstance, workspaceReader: WorkspaceReader): Promise<readonly ['getSession', 'endSession']> => {
    const route = routes(app)
    route.operation(getSession, async (_input, session): Promise<Session> => {
      const { accountId } = session.account
      const workspaces = await workspaceReader.listAccessibleWorkspaces(accountId)
      const administrator = await database.read(accountId, isInstallationAdministrator)
      return { account: session.account, administrator, workspaces: workspaces.map(({ workspaceId, name }) => ({ workspaceId, name })) }
    })
    route.operation(endSession, async (_input, { digest: key }, effects) => {
      await endHub(key)
      effects['clear-session-cookie']()
      return undefined
    })
    return ['getSession', 'endSession']
  }

  return Object.freeze({
    resolveHub, withApplicationRequest, redeemApplication, signOutApplication, openPreview, redeemPreview, withPreviewRequest,
    openHubSession, mintApplicationHandoff, registerRoutes,
  })
}

export type Sessions = ReturnType<typeof createSessions>
