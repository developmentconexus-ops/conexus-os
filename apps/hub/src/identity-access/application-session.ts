import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { parseCaller } from '../platform/caller.js'
import type { Caller } from '../platform/caller.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import type { CompletedSignIn, ProviderCheck, ProviderRefusal } from './oidc.js'

export type ApplicationAuthority =
  | Readonly<{ kind: 'SIGNED_IN'; caller: Caller }>
  // No session, an ended or expired one, one for another application, or access withdrawn.
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  // The Keycloak check was due and Keycloak could not answer. Refuse, and keep the session.
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

export type ApplicationSignIn =
  | Readonly<{ kind: 'HANDOFF'; slug: string; handoff: string }>
  | Readonly<{ kind: 'NO_ACCESS'; slug: string }>

const SLUG = /^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$/
const OPAQUE = /^[A-Za-z0-9_-]{43}$/

export const parseApplicationSlug = (value: unknown): string | null => typeof value === 'string' && SLUG.test(value) && !value.includes('--') ? value : null
export const parseOpaqueToken = (value: unknown): string | null => typeof value === 'string' && OPAQUE.test(value) ? value : null

const digest = (value: string): Buffer => createHash('sha256').update(value).digest()
const opaque = (): string => randomBytes(32).toString('base64url')

type ResolvedRow = QueryResultRow & {
  account_id: string
  email: string | null
  display_name: string
  subject: string
  provider_checked_at: Date
  /** The sealed refresh token, present only when the five-minute Keycloak check is due. */
  due_provider_refresh_token: string | null
}

export type ApplicationSessions = Readonly<{
  applicationBySlug(slug: string): Promise<string | null>
  /** The TI-02 branch for a sign-in that began at an application host. Never touches the Hub session. */
  signIn(input: Readonly<{ identity: CompletedSignIn; existingAccountId: string | null; projectId: string; bindingDigest: Buffer; now?: Date }>): Promise<ApplicationSignIn>
  redeem(input: Readonly<{ handoff: string; projectId: string; binding: string; now?: Date }>): Promise<Readonly<{ sessionToken: string; maxAgeSeconds: number }> | null>
  authority(input: Readonly<{ sessionToken: string | undefined; projectId: string; now?: Date }>): Promise<ApplicationAuthority>
  signOut(sessionToken: string): Promise<void>
}>

const ENDED_BY: Readonly<Record<ProviderRefusal, string>> = Object.freeze({
  USER_DISABLED: 'PROVIDER_USER_DISABLED',
  SESSION_ENDED: 'PROVIDER_SESSION_ENDED',
  REFUSED: 'PROVIDER_REFUSED',
})

export const createApplicationSessions = ({
  pool,
  refresh,
  envelope,
}: Readonly<{
  pool: PostgresPool
  refresh: (input: Readonly<{ refreshToken: string; expectedSubject: string }>) => Promise<ProviderCheck>
  /** Seals the Keycloak refresh token for the handoff and the session; the database refuses any other value. */
  envelope: SecretEnvelope
}>): ApplicationSessions => {
  // Keycloak does not rotate refresh tokens, so requests that find the same check due may all refresh
  // at once. Each is served on its own answer, and the first to record the check stores its token.
  const checkProvider = async (sessionDigest: Buffer, projectId: string, row: ResolvedRow, sealed: string, now: Date): Promise<ApplicationAuthority | null> => {
    let refreshToken: string
    try {
      refreshToken = await envelope.open(sealed)
    } catch {
      // Sealed under a key this installation no longer holds: the token left its custody.
      await pool.query('SELECT iam.end_application_session($1, $2)', [sessionDigest, 'CUSTODY_CHANGED'])
      return { kind: 'SIGN_IN_REQUIRED' }
    }
    const check = await refresh({ refreshToken, expectedSubject: row.subject })
    if (check.kind === 'UNAVAILABLE') return { kind: 'PROVIDER_UNAVAILABLE' }
    if (check.kind === 'REFUSED') {
      await pool.query('SELECT iam.end_application_session($1, $2)', [sessionDigest, ENDED_BY[check.reason]])
      return { kind: 'SIGN_IN_REQUIRED' }
    }
    const recorded = await pool.query<QueryResultRow & { recorded: boolean }>('SELECT iam.record_provider_check($1, $2, $3, $4) AS recorded',
      [sessionDigest, row.provider_checked_at, await envelope.seal(check.refreshToken), now])
    // False: the session ended while Keycloak answered, or another request recorded this check first.
    // The loser of that race is still served, so only the session in the database decides.
    if (!recorded.rows[0]?.recorded && !await resolve(sessionDigest, projectId, now)) return { kind: 'SIGN_IN_REQUIRED' }
    return null
  }

  const resolve = async (sessionDigest: Buffer, projectId: string, now: Date): Promise<ResolvedRow | undefined> => {
    const resolved = await pool.query<ResolvedRow>(
      'SELECT account_id, email, display_name, subject, provider_checked_at, due_provider_refresh_token FROM iam.resolve_application_session($1, $2, $3)',
      [sessionDigest, projectId, now])
    return resolved.rows[0]
  }

  const slugOf = async (projectId: string): Promise<string> => {
    const result = await pool.query<QueryResultRow & { slug: string | null }>('SELECT iam.application_slug($1) AS slug', [projectId])
    const slug = result.rows[0]?.slug
    if (!slug) throw new Error('APPLICATION_NOT_FOUND')
    return slug
  }

  return Object.freeze({
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
        const candidate = randomUUID()
        const provisioned = await pool.query<QueryResultRow & { account_id: string | null }>(
          'SELECT iam.provision_application_account($1, $2, $3, $4, $5) AS account_id',
          [candidate, identity.issuer, identity.subject, identity.verifiedEmail, identity.displayName])
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

    async redeem({ handoff, projectId, binding, now = new Date() }) {
      const sessionToken = opaque()
      const result = await pool.query<QueryResultRow & { expires_at: Date | null }>(
        'SELECT iam.redeem_application_handoff($1, $2, $3, $4, $5) AS expires_at',
        [digest(handoff), projectId, digest(binding), digest(sessionToken), now])
      const expiresAt = result.rows[0]?.expires_at
      if (!expiresAt) return null
      return { sessionToken, maxAgeSeconds: Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)) }
    },

    async authority({ sessionToken, projectId, now = new Date() }) {
      if (!sessionToken || !parseOpaqueToken(sessionToken)) return { kind: 'SIGN_IN_REQUIRED' }
      const sessionDigest = digest(sessionToken)
      const row = await resolve(sessionDigest, projectId, now)
      if (!row) return { kind: 'SIGN_IN_REQUIRED' }
      if (row.due_provider_refresh_token) {
        const refused = await checkProvider(sessionDigest, projectId, row, row.due_provider_refresh_token, now)
        if (refused) return refused
      }
      const caller = parseCaller({ accountId: row.account_id, email: row.email, displayName: row.display_name })
      if (!caller) throw new Error('APPLICATION_CALLER_UNRESOLVABLE')
      return { kind: 'SIGNED_IN', caller }
    },

    async signOut(sessionToken) {
      if (!parseOpaqueToken(sessionToken)) return
      await pool.query('SELECT iam.end_application_session($1, $2)', [digest(sessionToken), 'SIGNED_OUT'])
    },
  })
}
