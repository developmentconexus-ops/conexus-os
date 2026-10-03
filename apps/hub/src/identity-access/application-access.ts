import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { QueryResultRow } from 'pg'
import { IAM_GENERATED_ROUTES } from '../generated/iam-routes.js'
import type { ApplicationAccessEntryParams, Iam12Body, ProjectParams, IamOwnerId } from '../generated/iam-routes.js'
import { Failure } from '../platform/failure.js'
import type { PostgresPool } from '../platform/postgres.js'
import { isNotAdmitted, parseEmailAddress } from './current-session.js'
import type { AccountId, EmailAddress, ResolveCurrentSession } from './current-session.js'
import { isExactOrigin } from '../platform/origin.js'

const APPLICATION_INVITATION_MS = 14 * 24 * 60 * 60 * 1000
const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const uuid = { type: 'string', format: 'uuid' } as const
const projectParamsSchema = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: uuid } } as const
// entryKind stays a plain string so an unknown kind answers 404 like an unknown entry, not 400.
const entryParamsSchema = { type: 'object', additionalProperties: false, required: ['projectId', 'entryKind', 'entryId'], properties: { projectId: uuid, entryKind: { type: 'string' }, entryId: uuid } } as const

type ApplicationGrantEntry = Readonly<{
  kind: 'grant'
  grantId: string
  accountId: string
  displayName: string
  email?: string
  grantedAt: string
}>

type ApplicationInvitationEntry = Readonly<{
  kind: 'invitation'
  invitationId: string
  email: string
  invitedAt: string
  expiresAt: string
}>

type ApplicationAccessEntry = ApplicationGrantEntry | ApplicationInvitationEntry
type ApplicationAccess = Readonly<{ slug: string | null; entries: readonly ApplicationAccessEntry[] }>

/** Every refusal means the same two things to a caller: not told the Project exists, or not an Owner. */
export type ApplicationAccessStore = Readonly<{
  list(input: Readonly<{ actor: AccountId; projectId: string }>): Promise<ApplicationAccess>
  /** The email's current access: a new or renewed invitation, or the open grant the person already holds. */
  grant(input: Readonly<{ actor: AccountId; projectId: string; email: EmailAddress; now?: Date }>): Promise<ApplicationAccessEntry>
  cancelInvitation(input: Readonly<{ actor: AccountId; projectId: string; invitationId: string }>): Promise<boolean>
  revokeGrant(input: Readonly<{ actor: AccountId; projectId: string; grantId: string }>): Promise<boolean>
  /**
   * Runs `work` with whether the Project has an application; a platform read, not scoped to an actor.
   * While `work` runs for a Project without one, no application can be created for it, so an
   * answer of false still holds when `work` acts on it.
   */
  withApplicationPresence<Result>(projectId: string, work: (hasApplication: boolean) => Promise<Result>): Promise<Result>
}>

type AccessRow = QueryResultRow & {
  kind: 'application' | 'grant' | 'invitation'
  entry_id: string | null
  account_id: string | null
  display_name: string | null
  email: string | null
  since: Date
  expires_at: Date | null
  slug: string | null
}

const LIST_SQL = 'SELECT kind, entry_id, account_id, display_name, email, since, expires_at, slug FROM iam.list_application_access($1, $2)'

const accessOf = (rows: readonly AccessRow[]): ApplicationAccess => {
  const entries: ApplicationAccessEntry[] = []
  let slug: string | null = null
  for (const row of rows) {
    if (row.kind === 'application') slug = row.slug
    else if (row.kind === 'grant') {
      entries.push({
        kind: 'grant',
        grantId: row.entry_id ?? '',
        accountId: row.account_id ?? '',
        displayName: row.display_name ?? '',
        ...(row.email ? { email: row.email } : {}),
        grantedAt: row.since.toISOString(),
      })
    } else {
      entries.push({
        kind: 'invitation',
        invitationId: row.entry_id ?? '',
        email: row.email ?? '',
        invitedAt: row.since.toISOString(),
        expiresAt: (row.expires_at ?? row.since).toISOString(),
      })
    }
  }
  return { slug, entries }
}

// Creating an application takes this Project-keyed lock exclusively; a decision that relies on the
// Project having none holds it shared for as long as it acts.
const APPLICATION_LOCK_KEY = "hashtextextended('conexus:application:' || $1::text, 0)"

const isApplicationNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0002' &&
  'message' in error && error.message === 'APPLICATION_NOT_FOUND'

export const createApplicationAccessStore = ({ pool }: Readonly<{ pool: PostgresPool }>): ApplicationAccessStore => Object.freeze({
  async list({ actor, projectId }) {
    return accessOf((await pool.query<AccessRow>(LIST_SQL, [actor, projectId])).rows)
  },
  async grant({ actor, projectId, email, now = new Date() }) {
    const client = await pool.connect()
    let settledEntry: (QueryResultRow & { kind: 'grant' | 'invitation'; entry_id: string }) | undefined
    try {
      await client.query('BEGIN')
      await client.query(`SELECT pg_advisory_xact_lock(${APPLICATION_LOCK_KEY})`, [projectId])
      const settled = await client.query<QueryResultRow & { kind: 'grant' | 'invitation'; entry_id: string }>(
        'SELECT kind, entry_id FROM iam.grant_application_access($1, $2, $3, $4, $5)',
        [actor, projectId, randomUUID(), email, new Date(now.getTime() + APPLICATION_INVITATION_MS)])
      await client.query('COMMIT')
      settledEntry = settled.rows[0]
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
    const entry = accessOf((await pool.query<AccessRow>(LIST_SQL, [actor, projectId])).rows).entries
      .find((candidate) => candidate.kind === settledEntry?.kind &&
        (candidate.kind === 'grant' ? candidate.grantId : candidate.invitationId) === settledEntry.entry_id)
    if (!entry) throw new Error('APPLICATION_ACCESS_ENTRY_NOT_READABLE')
    return entry
  },
  async cancelInvitation({ actor, projectId, invitationId }) {
    const result = await pool.query<QueryResultRow & { found: boolean }>(
      'SELECT iam.cancel_application_invitation($1, $2, $3) AS found', [actor, projectId, invitationId])
    return result.rows[0]?.found === true
  },
  async revokeGrant({ actor, projectId, grantId }) {
    const result = await pool.query<QueryResultRow & { found: boolean }>(
      'SELECT iam.revoke_application_grant($1, $2, $3) AS found', [actor, projectId, grantId])
    return result.rows[0]?.found === true
  },
  async withApplicationPresence(projectId, work) {
    const client = await pool.connect()
    let held = false
    try {
      await client.query('BEGIN')
      held = true
      await client.query(`SELECT pg_advisory_xact_lock_shared(${APPLICATION_LOCK_KEY})`, [projectId])
      const result = await client.query<QueryResultRow & { present: boolean }>(
        'SELECT iam.application_slug($1) IS NOT NULL AS present', [projectId])
      const present = result.rows[0]?.present === true
      // An application is never taken away from a Project that keeps existing, so true needs no lock.
      if (present) {
        await client.query('COMMIT')
        held = false
      }
      const outcome = await work(present)
      if (held) await client.query('COMMIT')
      held = false
      return outcome
    } finally {
      if (held) await client.query('ROLLBACK').catch(() => undefined)
      client.release()
    }
  },
})

export type ApplicationAccessRouteDependencies = Readonly<{
  store: ApplicationAccessStore
  resolveCurrentSession: ResolveCurrentSession
  config: Readonly<{ origin: string; applicationAddress: (slug: string) => string | null }>
}>

export const registerApplicationAccessRoutes = async (
  app: FastifyInstance,
  { store, resolveCurrentSession, config }: ApplicationAccessRouteDependencies,
): Promise<readonly IamOwnerId[]> => {
  const authentic = (request: FastifyRequest): void => {
    const requestCsrf = header(request.headers['x-conexus-csrf'])
    if (!isExactOrigin(request.headers.origin, config.origin) || !requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) throw new Failure('REQUEST_AUTHENTICITY_DENIED')
  }
  const signedIn = async (request: FastifyRequest, write = false): Promise<AccountId> => {
    const current = await resolveCurrentSession(request, write)
    if (!current) throw new Failure('AUTHENTICATION_REQUIRED')
    return current.account.accountId
  }
  const refused = (error: unknown): never => {
    if (isApplicationNotFound(error)) throw new Failure('PROJECT_NOT_FOUND')
    if (isNotAdmitted(error)) throw new Failure('APPLICATION_ACCESS_MANAGE_REQUIRED')
    throw error
  }

  app.route<{ Params: ProjectParams }>({
    ...IAM_GENERATED_ROUTES['IAM-11'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-11'].schema, params: projectParamsSchema },
    handler: async (request) => {
      const actor = await signedIn(request)
      const { slug, entries } = await store.list({ actor, projectId: request.params.projectId }).catch(refused)
      const address = slug ? config.applicationAddress(slug) : null
      return { ...(address ? { address } : {}), entries }
    },
  })

  app.route<{ Params: ProjectParams; Body: Iam12Body }>({
    ...IAM_GENERATED_ROUTES['IAM-12'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-12'].schema, params: projectParamsSchema },
    handler: async (request) => {
      authentic(request)
      const actor = await signedIn(request, true)
      const email = parseEmailAddress(request.body.email)
      if (!email) throw new Failure('INVITATION_NOT_ACCEPTABLE')
      return store.grant({ actor, projectId: request.params.projectId, email }).catch(refused)
    },
  })

  app.route<{ Params: ApplicationAccessEntryParams }>({
    ...IAM_GENERATED_ROUTES['IAM-13'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-13'].schema, params: entryParamsSchema },
    handler: async (request, reply) => {
      authentic(request)
      const actor = await signedIn(request, true)
      const { projectId, entryKind, entryId } = request.params
      if (entryKind !== 'grant' && entryKind !== 'invitation') throw new Failure('APPLICATION_ACCESS_ENTRY_NOT_FOUND')
      const found = await (entryKind === 'grant'
        ? store.revokeGrant({ actor, projectId, grantId: entryId })
        : store.cancelInvitation({ actor, projectId, invitationId: entryId })).catch(refused)
      if (!found) throw new Failure('APPLICATION_ACCESS_ENTRY_NOT_FOUND')
      return reply.code(204).send()
    },
  })

  return ['IAM-11', 'IAM-12', 'IAM-13']
}
