import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { QueryResultRow } from 'pg'
import { S1_GENERATED_ROUTES } from '../generated/s1-routes.js'
import type { ApplicationAccessEntryParams, Iam12Body, ProjectParams, S1OwnerId } from '../generated/s1-routes.js'
import { sendProblem } from '../http/problem.js'
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

export type ApplicationGrantEntry = Readonly<{
  kind: 'grant'
  grantId: string
  accountId: string
  displayName: string
  email?: string
  grantedAt: string
}>

export type ApplicationInvitationEntry = Readonly<{
  kind: 'invitation'
  invitationId: string
  email: string
  invitedAt: string
  expiresAt: string
}>

export type ApplicationAccessEntry = ApplicationGrantEntry | ApplicationInvitationEntry
export type ApplicationAccess = Readonly<{ slug: string | null; entries: readonly ApplicationAccessEntry[] }>

/** Every refusal means the same two things to a caller: not told the Project exists, or not an Owner. */
export type ApplicationAccessStore = Readonly<{
  list(input: Readonly<{ actor: AccountId; projectId: string }>): Promise<ApplicationAccess>
  /** The email's current access: a new or renewed invitation, or the open grant the person already holds. */
  grant(input: Readonly<{ actor: AccountId; projectId: string; email: EmailAddress; now?: Date }>): Promise<ApplicationAccessEntry>
  cancelInvitation(input: Readonly<{ actor: AccountId; projectId: string; invitationId: string }>): Promise<boolean>
  revokeGrant(input: Readonly<{ actor: AccountId; projectId: string; grantId: string }>): Promise<boolean>
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

export const isApplicationNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0002' &&
  'message' in error && error.message === 'APPLICATION_NOT_FOUND'

export const createApplicationAccessStore = ({ pool }: Readonly<{ pool: PostgresPool }>): ApplicationAccessStore => Object.freeze({
  async list({ actor, projectId }) {
    return accessOf((await pool.query<AccessRow>(LIST_SQL, [actor, projectId])).rows)
  },
  async grant({ actor, projectId, email, now = new Date() }) {
    const settled = await pool.query<QueryResultRow & { kind: 'grant' | 'invitation'; entry_id: string }>(
      'SELECT kind, entry_id FROM iam.grant_application_access($1, $2, $3, $4, $5)',
      [actor, projectId, randomUUID(), email, new Date(now.getTime() + APPLICATION_INVITATION_MS)])
    const settledEntry = settled.rows[0]
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
})

export type ApplicationAccessRouteDependencies = Readonly<{
  store: ApplicationAccessStore
  resolveCurrentSession: ResolveCurrentSession
  config: Readonly<{ origin: string; applicationAddress: (slug: string) => string | null }>
}>

export const registerApplicationAccessRoutes = async (
  app: FastifyInstance,
  { store, resolveCurrentSession, config }: ApplicationAccessRouteDependencies,
): Promise<readonly S1OwnerId[]> => {
  const authentic = (request: Parameters<ResolveCurrentSession>[0]): boolean => {
    const requestCsrf = header(request.headers['x-conexus-csrf'])
    return isExactOrigin(request.headers.origin, config.origin) && !!requestCsrf && requestCsrf === request.cookies[CSRF_COOKIE]
  }
  const refused = (reply: Parameters<typeof sendProblem>[0], error: unknown) => {
    if (isApplicationNotFound(error)) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
    if (isNotAdmitted(error)) return sendProblem(reply, 403, 'application-access-manage-required', 'Application access administration denied')
    throw error
  }

  app.route<{ Params: ProjectParams }>({
    ...S1_GENERATED_ROUTES['IAM-11'],
    schema: { ...S1_GENERATED_ROUTES['IAM-11'].schema, params: projectParamsSchema },
    handler: async (request, reply) => {
      const current = await resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        const { slug, entries } = await store.list({ actor: current.account.accountId, projectId: request.params.projectId })
        const address = slug ? config.applicationAddress(slug) : null
        return { ...(address ? { address } : {}), entries }
      } catch (error) {
        return refused(reply, error)
      }
    },
  })

  app.route<{ Params: ProjectParams; Body: Iam12Body }>({
    ...S1_GENERATED_ROUTES['IAM-12'],
    schema: { ...S1_GENERATED_ROUTES['IAM-12'].schema, params: projectParamsSchema },
    handler: async (request, reply) => {
      if (!authentic(request)) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const email = parseEmailAddress(request.body.email)
      if (!email) return sendProblem(reply, 422, 'invitation-not-acceptable', 'Invitation not acceptable')
      try {
        return await store.grant({ actor: current.account.accountId, projectId: request.params.projectId, email })
      } catch (error) {
        return refused(reply, error)
      }
    },
  })

  app.route<{ Params: ApplicationAccessEntryParams }>({
    ...S1_GENERATED_ROUTES['IAM-13'],
    schema: { ...S1_GENERATED_ROUTES['IAM-13'].schema, params: entryParamsSchema },
    handler: async (request, reply) => {
      if (!authentic(request)) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const { projectId, entryKind, entryId } = request.params
      if (entryKind !== 'grant' && entryKind !== 'invitation') {
        return sendProblem(reply, 404, 'application-access-entry-not-found', 'Application access entry not found')
      }
      try {
        const actor = current.account.accountId
        const found = entryKind === 'grant'
          ? await store.revokeGrant({ actor, projectId, grantId: entryId })
          : await store.cancelInvitation({ actor, projectId, invitationId: entryId })
        if (!found) return sendProblem(reply, 404, 'application-access-entry-not-found', 'Application access entry not found')
        return reply.code(204).send()
      } catch (error) {
        return refused(reply, error)
      }
    },
  })

  return ['IAM-11', 'IAM-12', 'IAM-13']
}
