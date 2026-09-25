import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { parseCaller } from '../platform/caller.js'
import { parseApplicationSlug } from '../platform/application-slug.js'
import { digest, opaqueToken as opaque, parseOpaqueToken } from '../platform/opaque-token.js'
import type { Caller } from '../platform/caller.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import { accountId as brandAccountId } from './current-session.js'
import type { CurrentSession } from './current-session.js'
import { identityAccessError } from './errors.js'
import type { CompletedSignIn, ProviderCheck, ProviderRefusal } from './oidc.js'

/** A request on an application or Preview host: signed in, sent to sign in, or refused because Keycloak could not be asked. */
export type HostAuthority<Signed> =
  | Readonly<{ kind: 'SIGNED_IN' } & Signed>
  // No session, an ended or expired one, one for another host, or access withdrawn.
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  // The Keycloak check was due and Keycloak could not answer. Refuse, and keep the session.
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

export type ApplicationAuthority = HostAuthority<{ caller: Caller }>

type ManifestFile = Readonly<{ path: string; mediaType: string }>
export type PreviewManifest = Readonly<{ entryPath: 'index.html'; files: readonly ManifestFile[] }>

/** What one Preview launch shows. Stored once when the Hub opens it and never changed. */
export type PreviewLaunch = Readonly<{
  accountId: string
  projectId: string
  sourceRevision: string
  artifactRevisionId: string
  artifactDigest: string
  exactHost: string
  manifest: PreviewManifest
}>

/** A Preview request's binding: the launch, when its session ends, and its author as the caller. */
export type PreviewBinding = PreviewLaunch & Readonly<{ expiresAt: number; caller: Caller }>

export type ApplicationSignIn =
  | Readonly<{ kind: 'HANDOFF'; slug: string; handoff: string }>
  | Readonly<{ kind: 'NO_ACCESS'; slug: string }>

/** Where a handoff is presented: an application's host with the browser's binding, or a Preview's host. */
export type HandoffTarget =
  | Readonly<{ kind: 'APPLICATION'; projectId: string; binding: string }>
  | Readonly<{ kind: 'PREVIEW'; exactHost: string }>

const secondsUntil = (end: Date, now: Date): number => Math.max(1, Math.floor((end.getTime() - now.getTime()) / 1000))

export type HubSessionTokens = Readonly<{ sessionToken: string; csrfToken: string }>

export type HostSessions = Readonly<{
  /** Opens a Hub session for an active Control Plane Account, keeping the sign-in's Keycloak refresh token sealed. */
  openHub(input: Readonly<{ accountId: string; refreshToken: string; now?: Date }>): Promise<HubSessionTokens>
  /**
   * A Hub request's session. A csrfToken means the request changes state and must carry the session's own
   * token; a read passes none. Slides the idle limit.
   */
  resolveHub(input: Readonly<{ sessionToken: string; csrfToken?: string; now?: Date }>): Promise<CurrentSession | null>
  /** Signs out of the Hub with the session's own CSRF token, and ends the Previews it opened. Never asks Keycloak. */
  endHub(input: Readonly<{ sessionToken: string; csrfToken: string }>): Promise<boolean>
  applicationBySlug(slug: string): Promise<string | null>
  /** The TI-02 branch for a sign-in that began at an application host. Never touches the Hub session. */
  signIn(input: Readonly<{ identity: CompletedSignIn; existingAccountId: string | null; projectId: string; bindingDigest: Buffer; now?: Date }>): Promise<ApplicationSignIn>
  /** Opens a Preview for the developer behind a live Hub session: the entry handoff the Hub page posts to the Preview host, and when the Preview ends. */
  openPreview(input: Readonly<{ hubSessionToken: string; launch: PreviewLaunch; now?: Date }>): Promise<Readonly<{ entryGrant: string; expiresAt: number }> | null>
  redeem(input: Readonly<{ handoff: string; target: HandoffTarget; now?: Date }>): Promise<Readonly<{ sessionToken: string; maxAgeSeconds: number }> | null>
  applicationAuthority(input: Readonly<{ sessionToken: string | undefined; projectId: string; now?: Date }>): Promise<ApplicationAuthority>
  previewAuthority(input: Readonly<{ sessionToken: string | undefined; exactHost: string; now?: Date }>): Promise<HostAuthority<{ binding: PreviewBinding }>>
  signOut(sessionToken: string): Promise<void>
}>

const ENDED_BY: Readonly<Record<ProviderRefusal, string>> = Object.freeze({
  USER_DISABLED: 'PROVIDER_USER_DISABLED',
  SESSION_ENDED: 'PROVIDER_SESSION_ENDED',
  REFUSED: 'PROVIDER_REFUSED',
})

type Refusal = Readonly<{ kind: 'SIGN_IN_REQUIRED' }> | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

/** A due Keycloak check on a Hub request that Keycloak could not answer: the Hub answers 503 and keeps the session. */
export const providerUnavailable = (): Error => Object.assign(new Error('IDENTITY_PROVIDER_UNAVAILABLE'), { statusCode: 503, code: 'IDENTITY_PROVIDER_UNAVAILABLE' })

type ApplicationRow = QueryResultRow & {
  account_id: string
  email: string | null
  display_name: string
  subject: string
  provider_checked_at: Date
  /** The sealed refresh token, present only when the five-minute Keycloak check is due. */
  due_provider_refresh_token: string | null
}

type HubRow = QueryResultRow & {
  account_id: string
  issuer: string
  subject: string
  display_name: string
  email: string | null
  provider_checked_at: Date
  due_provider_refresh_token: string | null
}

type PreviewRow = QueryResultRow & {
  account_id: string
  email: string | null
  display_name: string
  subject: string
  project_id: string
  source_revision: string
  artifact_revision_id: string
  artifact_digest: string
  manifest: PreviewManifest
  expires_at: Date
  hub_digest: Buffer
  hub_checked_at: Date
  /** The Hub session's sealed refresh token, present only when its five-minute Keycloak check is due. */
  due_hub_refresh_token: string | null
}

const callerOf = (row: Readonly<{ account_id: string; email: string | null; display_name: string }>): Caller => {
  const caller = parseCaller({ accountId: row.account_id, email: row.email, displayName: row.display_name })
  if (!caller) throw new Error('HOST_CALLER_UNRESOLVABLE')
  return caller
}

export const createHostSessions = ({
  pool,
  refresh,
  envelope,
}: Readonly<{
  pool: PostgresPool
  refresh: (input: Readonly<{ refreshToken: string; expectedSubject: string }>) => Promise<ProviderCheck>
  /** Seals the Keycloak refresh token of a sign-in for the handoff and the session; the database refuses any other value. */
  envelope: SecretEnvelope
}>): HostSessions => {
  const end = (sessionDigest: Buffer, reason: string) => pool.query('SELECT iam.end_host_session($1, $2)', [sessionDigest, reason])

  const resolveApplication = async (sessionDigest: Buffer, projectId: string, now: Date): Promise<ApplicationRow | undefined> => {
    const resolved = await pool.query<ApplicationRow>(
      'SELECT account_id, email, display_name, subject, provider_checked_at, due_provider_refresh_token FROM iam.resolve_application_session($1, $2, $3)',
      [sessionDigest, projectId, now])
    return resolved.rows[0]
  }

  // The one Keycloak check for every kind of session: at most every five minutes, a request refreshes the
  // sealed token of the session that holds it (a Preview's is its Hub session's). Keycloak does not rotate
  // refresh tokens, so requests that find the same check due may all refresh at once; each is served on its
  // own answer, and the first to record the check stores its token. A refusal ends the session, and with
  // it the Previews it opened. Null: the person is still signed in.
  const checkProvider = async (check: Readonly<{ sessionDigest: Buffer; subject: string; checkedAt: Date; sealed: string; now: Date }>): Promise<Refusal | null> => {
    let refreshToken: string
    try {
      refreshToken = await envelope.open(check.sealed)
    } catch {
      // Sealed under a key this installation no longer holds: the token left its custody.
      await end(check.sessionDigest, 'CUSTODY_CHANGED')
      return { kind: 'SIGN_IN_REQUIRED' }
    }
    const answer = await refresh({ refreshToken, expectedSubject: check.subject })
    if (answer.kind === 'UNAVAILABLE') return { kind: 'PROVIDER_UNAVAILABLE' }
    if (answer.kind === 'REFUSED') {
      await end(check.sessionDigest, ENDED_BY[answer.reason])
      return { kind: 'SIGN_IN_REQUIRED' }
    }
    const recorded = await pool.query<QueryResultRow & { open: boolean }>('SELECT iam.record_provider_check($1, $2, $3, $4) AS open',
      [check.sessionDigest, check.checkedAt, await envelope.seal(answer.refreshToken), check.now])
    // The session ended while Keycloak answered: only the session in the database decides.
    return recorded.rows[0]?.open ? null : { kind: 'SIGN_IN_REQUIRED' }
  }

  const slugOf = async (projectId: string): Promise<string> => {
    const result = await pool.query<QueryResultRow & { slug: string | null }>('SELECT iam.application_slug($1) AS slug', [projectId])
    const slug = result.rows[0]?.slug
    if (!slug) throw new Error('APPLICATION_NOT_FOUND')
    return slug
  }

  return Object.freeze({
    async openHub({ accountId, refreshToken, now = new Date() }) {
      const sessionToken = opaque()
      const csrfToken = opaque()
      const opened = await pool.query<QueryResultRow & { outcome: string }>('SELECT iam.open_hub_session($1, $2, $3, $4, $5) AS outcome',
        [digest(sessionToken), digest(csrfToken), accountId, await envelope.seal(refreshToken), now])
      const outcome = opened.rows[0]?.outcome
      if (outcome === 'ACCOUNT_INACTIVE' || outcome === 'IDENTITY_NOT_ELIGIBLE') throw identityAccessError(outcome)
      if (outcome !== 'OPENED') throw new Error('HUB_SESSION_NOT_OPENED')
      return { sessionToken, csrfToken }
    },

    async resolveHub({ sessionToken, csrfToken, now = new Date() }) {
      if (!parseOpaqueToken(sessionToken)) return null
      if (csrfToken !== undefined && !parseOpaqueToken(csrfToken)) return null
      const sessionDigest = digest(sessionToken)
      const resolved = await pool.query<HubRow>(
        'SELECT account_id, issuer, subject, display_name, email, provider_checked_at, due_provider_refresh_token FROM iam.resolve_hub_session($1, $2, $3)',
        [sessionDigest, csrfToken === undefined ? null : digest(csrfToken), now])
      const row = resolved.rows[0]
      if (!row) return null
      if (row.due_provider_refresh_token) {
        const refused = await checkProvider({ sessionDigest, subject: row.subject, checkedAt: row.provider_checked_at, sealed: row.due_provider_refresh_token, now })
        if (refused?.kind === 'PROVIDER_UNAVAILABLE') throw providerUnavailable()
        if (refused) return null
      }
      return {
        account: { accountId: brandAccountId(row.account_id), displayName: row.display_name, ...(row.email ? { email: row.email } : {}) },
        issuer: row.issuer,
        subject: row.subject,
      }
    },

    async endHub({ sessionToken, csrfToken }) {
      if (!parseOpaqueToken(sessionToken) || !parseOpaqueToken(csrfToken)) return false
      const ended = await pool.query<QueryResultRow & { ended: boolean }>('SELECT iam.end_hub_session($1, $2) AS ended', [digest(sessionToken), digest(csrfToken)])
      return ended.rows[0]?.ended === true
    },

    async applicationBySlug(slug) {
      if (!parseApplicationSlug(slug)) return null
      const result = await pool.query<QueryResultRow & { project_id: string | null }>('SELECT iam.application_by_slug($1) AS project_id', [slug])
      return result.rows[0]?.project_id ?? null
    },

    async signIn({ identity, existingAccountId, projectId, bindingDigest, now = new Date() }) {
      const slug = await slugOf(projectId)
      if (!identity.refreshToken) throw new Error('APPLICATION_REFRESH_TOKEN_MISSING')
      let accountId = existingAccountId
      if (!accountId) {
        const provisioned = await pool.query<QueryResultRow & { account_id: string | null }>(
          'SELECT iam.provision_application_account($1, $2, $3, $4, $5) AS account_id',
          [randomUUID(), identity.issuer, identity.subject, identity.verifiedEmail, identity.displayName])
        accountId = provisioned.rows[0]?.account_id ?? null
        if (!accountId) return { kind: 'NO_ACCESS', slug }
      }
      await pool.query('SELECT iam.claim_application_invitations($1, $2)', [accountId, identity.verifiedEmail])
      const handoff = opaque()
      const minted = await pool.query<QueryResultRow & { minted: boolean }>(
        'SELECT iam.mint_application_handoff($1, $2, $3, $4, $5, $6) AS minted',
        [accountId, projectId, digest(handoff), bindingDigest, await envelope.seal(identity.refreshToken), now])
      return minted.rows[0]?.minted ? { kind: 'HANDOFF', slug, handoff } : { kind: 'NO_ACCESS', slug }
    },

    async openPreview({ hubSessionToken, launch, now = new Date() }) {
      if (!parseOpaqueToken(hubSessionToken)) return null
      const entryGrant = opaque()
      const opened = await pool.query<QueryResultRow & { expires_at: Date | null }>(
        'SELECT iam.open_preview($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS expires_at',
        [digest(hubSessionToken), launch.accountId, launch.projectId, launch.sourceRevision, launch.artifactRevisionId,
          launch.artifactDigest, launch.exactHost, JSON.stringify(launch.manifest), digest(entryGrant), now])
      const expiresAt = opened.rows[0]?.expires_at
      return expiresAt ? { entryGrant, expiresAt: expiresAt.getTime() } : null
    },

    async redeem({ handoff, target, now = new Date() }) {
      if (!parseOpaqueToken(handoff)) return null
      const sessionToken = opaque()
      const application = target.kind === 'APPLICATION' ? target : null
      const result = await pool.query<QueryResultRow & { expires_at: Date | null }>(
        'SELECT iam.redeem_handoff($1, $2, $3, $4, $5, $6, $7) AS expires_at',
        [target.kind, digest(handoff), application?.projectId ?? null, target.kind === 'PREVIEW' ? target.exactHost : null,
          application ? digest(application.binding) : null, digest(sessionToken), now])
      const expiresAt = result.rows[0]?.expires_at
      return expiresAt ? { sessionToken, maxAgeSeconds: secondsUntil(expiresAt, now) } : null
    },

    async applicationAuthority({ sessionToken, projectId, now = new Date() }) {
      if (!sessionToken || !parseOpaqueToken(sessionToken)) return { kind: 'SIGN_IN_REQUIRED' }
      const sessionDigest = digest(sessionToken)
      const row = await resolveApplication(sessionDigest, projectId, now)
      if (!row) return { kind: 'SIGN_IN_REQUIRED' }
      if (row.due_provider_refresh_token) {
        const refused = await checkProvider({ sessionDigest, subject: row.subject, checkedAt: row.provider_checked_at, sealed: row.due_provider_refresh_token, now })
        if (refused) return refused
      }
      return { kind: 'SIGNED_IN', caller: callerOf(row) }
    },

    async previewAuthority({ sessionToken, exactHost, now = new Date() }) {
      if (!sessionToken || !parseOpaqueToken(sessionToken)) return { kind: 'SIGN_IN_REQUIRED' }
      const resolved = await pool.query<PreviewRow>(
        `SELECT account_id, email, display_name, subject, project_id, source_revision, artifact_revision_id, artifact_digest, manifest, expires_at,
          hub_digest, hub_checked_at, due_hub_refresh_token FROM iam.resolve_preview_session($1, $2, $3)`,
        [digest(sessionToken), exactHost, now])
      const row = resolved.rows[0]
      if (!row) return { kind: 'SIGN_IN_REQUIRED' }
      if (row.due_hub_refresh_token) {
        const refused = await checkProvider({ sessionDigest: row.hub_digest, subject: row.subject, checkedAt: row.hub_checked_at, sealed: row.due_hub_refresh_token, now })
        if (refused) return refused
      }
      return {
        kind: 'SIGNED_IN',
        binding: Object.freeze({
          accountId: row.account_id, projectId: row.project_id, sourceRevision: row.source_revision,
          artifactRevisionId: row.artifact_revision_id, artifactDigest: row.artifact_digest, exactHost,
          manifest: row.manifest, expiresAt: row.expires_at.getTime(), caller: callerOf(row),
        }),
      }
    },

    async signOut(sessionToken) {
      if (!parseOpaqueToken(sessionToken)) return
      await end(digest(sessionToken), 'SIGNED_OUT')
    },
  })
}
