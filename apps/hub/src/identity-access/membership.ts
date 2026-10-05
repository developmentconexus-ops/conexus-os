import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { IAM_GENERATED_ROUTES } from '../generated/iam-routes.js'
import type { Iam05Body, Iam10Body, MemberParams, RosterEntryParams, IamOwnerId, WorkspaceParams } from '../generated/iam-routes.js'
import { Failure } from '../platform/failure.js'
import { INVITATION_DAYS } from '../platform/lifetimes.js'
import type { PostgresPool } from '../platform/db.js'
import {
  accountId as brandAccountId,
  invitationId as brandInvitationId,
  workspaceId as brandWorkspaceId,
  isLastOwner,
  isNotAdmitted,
  parseEmailAddress,
} from './current-session.js'
import type { AccountId, EmailAddress, InvitationId, WorkspaceId } from './current-session.js'
import { routes } from '../http/access.js'

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
type InvitationState = 'PENDING' | 'EXPIRED'

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
  state: InvitationState
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

const workspaceRole = z.enum(['owner', 'member'])
const emailAddress = z.string().transform((value, context) => {
  const email = parseEmailAddress(value)
  if (email) return email
  context.addIssue({ code: 'custom', message: 'not an email address' })
  return z.NEVER
})
const rosterRows = z.array(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('member'), account_id: z.string(), display_name: z.string(), email: z.string().nullable(), role: workspaceRole, since: z.date() }),
  z.object({ kind: z.literal('invitation'), invitation_id: z.string(), email: emailAddress, role: workspaceRole, since: z.date(), expires_at: z.date(), state: z.enum(['PENDING', 'EXPIRED']) }),
]))
type RosterRow = z.infer<typeof rosterRows>[number]

const ROSTER_SQL = 'SELECT kind, account_id, invitation_id, display_name, email, role, since, expires_at, state FROM iam.list_workspace_roster($1, $2)'

type MemberRow = Extract<RosterRow, { kind: 'member' }>
type InvitationRow = Extract<RosterRow, { kind: 'invitation' }>

const memberEntry = (row: MemberRow): MemberEntry => ({
  kind: 'member',
  accountId: brandAccountId(row.account_id),
  displayName: row.display_name,
  ...(row.email ? { email: row.email } : {}),
  role: row.role,
  since: row.since.toISOString(),
})

const invitationEntry = (row: InvitationRow): InvitationEntry => ({
  kind: 'invitation',
  invitationId: brandInvitationId(row.invitation_id),
  email: row.email,
  role: row.role,
  invitedAt: row.since.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  state: row.state,
})

const rosterEntry = (row: RosterRow): RosterEntry => row.kind === 'member' ? memberEntry(row) : invitationEntry(row)

const readRoster = async (pool: PostgresPool, actor: AccountId, workspaceId: WorkspaceId) =>
  rosterRows.parse((await pool.query(ROSTER_SQL, [actor, workspaceId])).rows)

export const createMembershipStore = ({ pool }: Readonly<{ pool: PostgresPool }>): MembershipStore => Object.freeze({
  async roster({ actor, workspaceId }) {
    const rows = await readRoster(pool, actor, workspaceId)
    // A Workspace always holds at least one owner, so no rows means this caller is not a
    // member of it. The route answers 404 rather than confirming that it exists.
    const viewer = rows.find((row) => row.kind === 'member' && row.account_id === actor)
    if (!viewer) return null
    return { viewerRole: viewer.role, entries: rows.map(rosterEntry) }
  },
  async invite({ actor, workspaceId, email, role, now = new Date() }) {
    const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000)
    const settled = await pool.query(
      'SELECT iam.invite_workspace_member($1, $2, $3, $4, $5, $6) AS invitation_id',
      [actor, workspaceId, randomUUID(), email, role, expiresAt])
    const { invitation_id: invitationId } = z.object({ invitation_id: z.string() }).parse(settled.rows[0])
    const row = (await readRoster(pool, actor, workspaceId)).find((candidate): candidate is InvitationRow => candidate.kind === 'invitation' && candidate.invitation_id === invitationId)
    if (!row) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'INVITATION_NOT_READABLE' } })
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
}>

export const registerMembershipRoutes = async (
  app: FastifyInstance,
  { store }: MembershipRouteDependencies,
): Promise<readonly IamOwnerId[]> => {
  const route = routes(app)
  // The database's refusals of a member change, as rows.
  const refused = (error: unknown): never => {
    if (isLastOwner(error)) throw new Failure('LAST_OWNER')
    if (isNotAdmitted(error)) throw new Failure('MEMBERS_MANAGE_REQUIRED')
    throw error
  }

  route.session<{ Params: WorkspaceParams }>({
    ...IAM_GENERATED_ROUTES['IAM-04'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-04'].schema, params: workspaceParamsSchema },
    handler: async (request, _reply, session) => {
      const actor = session.account.accountId
      const roster = await store.roster({ actor, workspaceId: brandWorkspaceId(request.params.workspaceId) })
      if (!roster) throw new Failure('WORKSPACE_NOT_FOUND')
      return roster
    },
  })

  route.session<{ Params: WorkspaceParams; Body: Iam05Body }>({
    ...IAM_GENERATED_ROUTES['IAM-05'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-05'].schema, params: workspaceParamsSchema },
    handler: async (request, _reply, session) => {
      const actor = session.account.accountId
      const email = parseEmailAddress(request.body.email)
      const role = parseWorkspaceRole(request.body.role)
      if (!email || !role) throw new Failure('INVITATION_NOT_ACCEPTABLE')
      return store.invite({ actor, workspaceId: brandWorkspaceId(request.params.workspaceId), email, role }).catch((error: unknown) => {
        if (isNotAdmitted(error)) throw new Failure('MEMBERS_MANAGE_REQUIRED')
        throw error
      })
    },
  })

  route.session<{ Params: MemberParams; Body: Iam10Body }>({
    ...IAM_GENERATED_ROUTES['IAM-10'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-10'].schema, params: memberParamsSchema },
    handler: async (request, reply, session) => {
      const actor = session.account.accountId
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

  route.session<{ Params: RosterEntryParams }>({
    ...IAM_GENERATED_ROUTES['IAM-06'],
    schema: { ...IAM_GENERATED_ROUTES['IAM-06'].schema, params: rosterEntryParamsSchema },
    handler: async (request, reply, session) => {
      const actor = session.account.accountId
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
