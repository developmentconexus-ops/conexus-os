import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { QueryResultRow } from 'pg'
import { IAM_GENERATED_ROUTES } from '../generated/iam-routes.js'
import type { Iam05Body, Iam10Body, MemberParams, RosterEntryParams, IamOwnerId, WorkspaceParams } from '../generated/iam-routes.js'
import { Failure } from '../platform/failure.js'
import type { PostgresPool } from '../platform/postgres.js'
import {
  accountId as brandAccountId,
  invitationId as brandInvitationId,
  workspaceId as brandWorkspaceId,
  isLastOwner,
  isNotAdmitted,
  parseEmailAddress,
} from './current-session.js'
import type { AccountId, EmailAddress, InvitationId, ResolveCurrentSession, WorkspaceId } from './current-session.js'
import { isExactOrigin } from '../platform/origin.js'

const INVITATION_MS = 14 * 24 * 60 * 60 * 1000
const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const uuid = { type: 'string', format: 'uuid' } as const
// The S1 generator emits no `params` schema, so a malformed id used to reach Postgres as a
// `uuid` parameter and raise SQLSTATE 22P02, which the error handler could only see as a 500.
// These merge a params schema onto the generated route definition so Ajv refuses first.
const workspaceParamsSchema = { type: 'object', additionalProperties: false, required: ['workspaceId'], properties: { workspaceId: uuid } } as const
const memberParamsSchema = { type: 'object', additionalProperties: false, required: ['workspaceId', 'accountId'], properties: { workspaceId: uuid, accountId: uuid } } as const
// entryKind stays an unconstrained string here: the handler already answers 404 for a value
// that is neither `member` nor `invitation`, and a schema enum would turn that into a 400.
const rosterEntryParamsSchema = { type: 'object', additionalProperties: false, required: ['workspaceId', 'entryKind', 'entryId'], properties: { workspaceId: uuid, entryKind: { type: 'string' }, entryId: uuid } } as const

type WorkspaceRole = 'owner' | 'member'

const parseWorkspaceRole = (value: unknown): WorkspaceRole | null =>
  value === 'owner' || value === 'member' ? value : null

type MemberEntry = Readonly<{
  kind: 'member'
  accountId: AccountId
  displayName: string
  email?: string
  role: WorkspaceRole
  since: string
}>

type InvitationEntry = Readonly<{
  kind: 'invitation'
  invitationId: InvitationId
  email: EmailAddress
  role: WorkspaceRole
  invitedAt: string
  expiresAt: string
}>

type RosterEntry = MemberEntry | InvitationEntry
type WorkspaceRoster = Readonly<{ viewerRole: WorkspaceRole; entries: readonly RosterEntry[] }>

export type MembershipStore = Readonly<{
  roster(input: Readonly<{ actor: AccountId; workspaceId: WorkspaceId }>): Promise<WorkspaceRoster | null>
  invite(input: Readonly<{ actor: AccountId; workspaceId: WorkspaceId; email: EmailAddress; role: WorkspaceRole; now?: Date }>): Promise<InvitationEntry>
  cancelInvitation(input: Readonly<{ actor: AccountId; invitationId: InvitationId }>): Promise<void>
  setRole(input: Readonly<{ actor: AccountId; workspaceId: WorkspaceId; member: AccountId; role: WorkspaceRole }>): Promise<void>
  remove(input: Readonly<{ actor: AccountId; workspaceId: WorkspaceId; member: AccountId }>): Promise<void>
}>

type RosterRow = QueryResultRow & {
  kind: string
  account_id: string | null
  invitation_id: string | null
  display_name: string | null
  email: string | null
  role: WorkspaceRole
  since: Date
  expires_at: Date | null
}

const memberEntry = (row: RosterRow): MemberEntry => ({
  kind: 'member',
  accountId: brandAccountId(row.account_id ?? ''),
  displayName: row.display_name ?? '',
  ...(row.email ? { email: row.email } : {}),
  role: row.role,
  since: row.since.toISOString(),
})

const invitationEntry = (row: RosterRow): InvitationEntry => ({
  kind: 'invitation',
  invitationId: brandInvitationId(row.invitation_id ?? ''),
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  email: (row.email ?? '') as EmailAddress,
  role: row.role,
  invitedAt: row.since.toISOString(),
  expiresAt: (row.expires_at ?? row.since).toISOString(),
})

const rosterEntry = (row: RosterRow): RosterEntry => row.kind === 'member' ? memberEntry(row) : invitationEntry(row)

export const createMembershipStore = ({ pool }: Readonly<{ pool: PostgresPool }>): MembershipStore => Object.freeze({
  async roster({ actor, workspaceId }) {
    const result = await pool.query<RosterRow>(
      'SELECT kind, account_id, invitation_id, display_name, email, role, since, expires_at FROM iam.list_workspace_roster($1, $2)',
      [actor, workspaceId])
    // A Workspace always holds at least one owner, so no rows means this caller is not a
    // member of it. The route answers 404 rather than confirming that it exists.
    const viewer = result.rows.find((row) => row.kind === 'member' && row.account_id === actor)
    if (!viewer) return null
    const entries = result.rows.map(rosterEntry)
    return { viewerRole: viewer.role, entries }
  },
  async invite({ actor, workspaceId, email, role, now = new Date() }) {
    const expiresAt = new Date(now.getTime() + INVITATION_MS)
    const settled = await pool.query<QueryResultRow & { invitation_id: string }>(
      'SELECT iam.invite_workspace_member($1, $2, $3, $4, $5, $6) AS invitation_id',
      [actor, workspaceId, randomUUID(), email, role, expiresAt])
    const invitationId = settled.rows[0]?.invitation_id ?? ''
    const stored = await pool.query<RosterRow>(
      'SELECT kind, account_id, invitation_id, display_name, email, role, since, expires_at FROM iam.list_workspace_roster($1, $2)',
      [actor, workspaceId])
    const row = stored.rows.find((candidate) => candidate.invitation_id === invitationId)
    if (!row) throw new Error('INVITATION_NOT_READABLE')
    return invitationEntry(row)
  },
  async cancelInvitation({ actor, invitationId }) {
    await pool.query('SELECT iam.cancel_workspace_invitation($1, $2)', [actor, invitationId])
  },
  async setRole({ actor, workspaceId, member, role }) {
    await pool.query('SELECT iam.set_workspace_member_role($1, $2, $3, $4)', [actor, workspaceId, member, role])
  },
  async remove({ actor, workspaceId, member }) {
    await pool.query('SELECT iam.remove_workspace_member($1, $2, $3)', [actor, workspaceId, member])
  },
})

export type MembershipRouteDependencies = Readonly<{
  store: MembershipStore
  resolveCurrentSession: ResolveCurrentSession
  config: Readonly<{ origin: string }>
}>

export const registerMembershipRoutes = async (
  app: FastifyInstance,
  { store, resolveCurrentSession, config }: MembershipRouteDependencies,
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
  // The database's refusals of a member change, as rows.
  const refused = (error: unknown): never => {
    if (isLastOwner(error)) throw new Failure('LAST_OWNER')
    if (isNotAdmitted(error)) throw new Failure('MEMBERS_MANAGE_REQUIRED')
    throw error
  }

  app.route<{ Params: WorkspaceParams }>({
    ...IAM_GENERATED_ROUTES['IAM-04'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-04'].schema, params: workspaceParamsSchema },
    handler: async (request) => {
      const actor = await signedIn(request)
      const roster = await store.roster({ actor, workspaceId: brandWorkspaceId(request.params.workspaceId) })
      if (!roster) throw new Failure('WORKSPACE_NOT_FOUND')
      return roster
    },
  })

  app.route<{ Params: WorkspaceParams; Body: Iam05Body }>({
    ...IAM_GENERATED_ROUTES['IAM-05'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-05'].schema, params: workspaceParamsSchema },
    handler: async (request) => {
      authentic(request)
      const actor = await signedIn(request, true)
      const email = parseEmailAddress(request.body.email)
      const role = parseWorkspaceRole(request.body.role)
      if (!email || !role) throw new Failure('INVITATION_NOT_ACCEPTABLE')
      return store.invite({ actor, workspaceId: brandWorkspaceId(request.params.workspaceId), email, role }).catch((error: unknown) => {
        if (isNotAdmitted(error)) throw new Failure('MEMBERS_MANAGE_REQUIRED')
        throw error
      })
    },
  })

  app.route<{ Params: MemberParams; Body: Iam10Body }>({
    ...IAM_GENERATED_ROUTES['IAM-10'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-10'].schema, params: memberParamsSchema },
    handler: async (request, reply) => {
      authentic(request)
      const actor = await signedIn(request, true)
      const role = parseWorkspaceRole(request.body.role)
      if (!role) throw new Failure('ROLE_NOT_ACCEPTABLE')
      await store.setRole({
        actor,
        workspaceId: brandWorkspaceId(request.params.workspaceId),
        member: brandAccountId(request.params.accountId),
        role,
      }).catch(refused)
      return reply.code(204).send()
    },
  })

  app.route<{ Params: RosterEntryParams }>({
    ...IAM_GENERATED_ROUTES['IAM-06'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-06'].schema, params: rosterEntryParamsSchema },
    handler: async (request, reply) => {
      authentic(request)
      const actor = await signedIn(request, true)
      const { entryKind, entryId } = request.params
      if (entryKind !== 'member' && entryKind !== 'invitation') throw new Failure('ROSTER_ENTRY_NOT_FOUND')
      const workspaceId = brandWorkspaceId(request.params.workspaceId)
      if (entryKind === 'member') {
        await store.remove({ actor, workspaceId, member: brandAccountId(entryId) }).catch(refused)
        return reply.code(204).send()
      }
      // `iam.cancel_workspace_invitation` resolves authority from the invitation's own
      // Workspace, so it is never wrong about who may cancel it, but it never reads the
      // `workspaceId` path segment either. Without this check an owner of one Workspace
      // could cancel an invitation belonging to a different Workspace by naming its own
      // Workspace in the URL, and a caller naming the invitation's real Workspace correctly
      // would be refused. Requiring the invitation to actually be a roster entry of the
      // path Workspace first makes the URL and the effect agree.
      const pathRoster = await store.roster({ actor, workspaceId }).catch(refused)
      const belongsToPathWorkspace = pathRoster?.entries.some(
        (candidate) => candidate.kind === 'invitation' && candidate.invitationId === entryId,
      ) ?? false
      if (!belongsToPathWorkspace) throw new Failure('ROSTER_ENTRY_NOT_FOUND')
      await store.cancelInvitation({ actor, invitationId: brandInvitationId(entryId) }).catch(refused)
      return reply.code(204).send()
    },
  })

  return ['IAM-04', 'IAM-05', 'IAM-06', 'IAM-10']
}
