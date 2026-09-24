import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import type { PostgresPool } from '../platform/postgres.js'
import type { CompletedSignIn, ProviderCheck } from './oidc.js'

/** The only identity a handler ever sees. Built from a resolved session, never from input. */
export type ApplicationCaller = Readonly<{ accountId: string; email: string | null; displayName: string }>

export type ApplicationAuthority =
  | Readonly<{ kind: 'SIGNED_IN'; caller: ApplicationCaller }>
  // No session, an ended or expired one, one for another application, or access withdrawn.
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  // The Keycloak check was due and Keycloak could not answer: refuse, and keep the session.
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

export type ApplicationSignIn =
  | Readonly<{ kind: 'HANDOFF'; slug: string; handoff: string }>
  | Readonly<{ kind: 'NO_ACCESS'; slug: string }>

export const PROVIDER_RECHECK_MS = 5 * 60 * 1000
const SLUG = /^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$/
const OPAQUE = /^[A-Za-z0-9_-]{43}$/

export const providerCheckDue = (checkedAt: Date, now: Date): boolean => now.getTime() - checkedAt.getTime() >= PROVIDER_RECHECK_MS
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
  provider_refresh_token: string
}

export type ApplicationSessions = Readonly<{
  applicationBySlug(slug: string): Promise<string | null>
  /** The TI-02 branch for a sign-in that began at an application host. Never touches the Hub session. */
  signIn(input: Readonly<{ identity: CompletedSignIn; existingAccountId: string | null; projectId: string; bindingDigest: Buffer; now?: Date }>): Promise<ApplicationSignIn>
  redeem(input: Readonly<{ handoff: string; projectId: string; binding: string; now?: Date }>): Promise<Readonly<{ sessionToken: string; maxAgeSeconds: number }> | null>
  authority(input: Readonly<{ sessionToken: string | undefined; projectId: string; now?: Date }>): Promise<ApplicationAuthority>
  signOut(sessionToken: string): Promise<void>
}>

export const createApplicationSessions = ({
  pool,
  refresh,
}: Readonly<{
  pool: PostgresPool
  refresh: (input: Readonly<{ refreshToken: string; expectedSubject: string }>) => Promise<ProviderCheck>
}>): ApplicationSessions => {
  // One Keycloak refresh per session at a time: two requests that find the check due share it, so a
  // rotated refresh token is never spent twice.
  const checks = new Map<string, Promise<ProviderCheck>>()
  const checkOnce = (key: string, run: () => Promise<ProviderCheck>): Promise<ProviderCheck> => {
    const pending = checks.get(key)
    if (pending) return pending
    const started = run().finally(() => checks.delete(key))
    checks.set(key, started)
    return started
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
        const provisioned = await pool.query<QueryResultRow & { provisioned: boolean }>(
          'SELECT iam.provision_application_account($1, $2, $3, $4, $5) AS provisioned',
          [candidate, identity.issuer, identity.subject, identity.verifiedEmail, identity.displayName])
        if (!provisioned.rows[0]?.provisioned) return { kind: 'NO_ACCESS', slug }
        accountId = candidate
      }
      await pool.query('SELECT iam.claim_application_invitations($1, $2)', [accountId, identity.verifiedEmail])
      const handoff = opaque()
      const minted = await pool.query<QueryResultRow & { minted: boolean }>(
        'SELECT iam.mint_application_handoff($1, $2, $3, $4, $5, $6) AS minted',
        [accountId, projectId, digest(handoff), bindingDigest, identity.refreshToken, now])
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
      const resolved = await pool.query<ResolvedRow>(
        'SELECT account_id, email, display_name, subject, provider_checked_at, provider_refresh_token FROM iam.resolve_application_session($1, $2, $3)',
        [sessionDigest, projectId, now])
      const row = resolved.rows[0]
      if (!row) return { kind: 'SIGN_IN_REQUIRED' }
      if (providerCheckDue(row.provider_checked_at, now)) {
        const check = await checkOnce(sessionDigest.toString('hex'), () => refresh({ refreshToken: row.provider_refresh_token, expectedSubject: row.subject }))
        if (check.kind === 'UNAVAILABLE') return { kind: 'PROVIDER_UNAVAILABLE' }
        if (check.kind === 'REFUSED') {
          await pool.query('SELECT iam.end_application_session($1, $2)', [sessionDigest, 'PROVIDER_REFUSED'])
          return { kind: 'SIGN_IN_REQUIRED' }
        }
        // A concurrent request that shared this check records the same answer; one write wins.
        await pool.query('SELECT iam.record_provider_check($1, $2, $3, $4)', [sessionDigest, row.provider_checked_at, check.refreshToken, now])
      }
      return { kind: 'SIGNED_IN', caller: Object.freeze({ accountId: row.account_id, email: row.email, displayName: row.display_name }) }
    },

    async signOut(sessionToken) {
      if (!parseOpaqueToken(sessionToken)) return
      await pool.query('SELECT iam.end_application_session($1, $2)', [digest(sessionToken), 'SIGNED_OUT'])
    },
  })
}
