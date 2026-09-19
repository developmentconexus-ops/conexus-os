import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { QueryResultRow } from 'pg'
import { S1_GENERATED_ROUTES } from '../generated/s1-routes.js'
import type { Iam05Body, Iam10Body, MemberParams, RosterEntryParams, S1OwnerId, WorkspaceParams } from '../generated/s1-routes.js'
import { sendProblem } from '../http/problem.js'
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

const INVITATION_MS = 14 * 24 * 60 * 60 * 1000
const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

export type WorkspaceRole = 'owner' | 'member'

export const parseWorkspaceRole = (value: unknown): WorkspaceRole | null =>
  value === 'owner' || value === 'member' ? value : null

export type MemberEntry = Readonly<{
  kind: 'member'
  accountId: AccountId
  displayName: string
  email?: string
  role: WorkspaceRole
  since: string
}>

export type InvitationEntry = Readonly<{
  kind: 'invitation'
  invitationId: InvitationId
  email: EmailAddress
  role: WorkspaceRole
  invitedAt: string
  expiresAt: string
}>

export type RosterEntry = MemberEntry | InvitationEntry
export type WorkspaceRoster = Readonly<{ viewerRole: WorkspaceRole; entries: readonly RosterEntry[] }>

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

const rosterEntry = (row: RosterRow): RosterEntry => row.kind === 'member'
  ? {
    kind: 'member',
    accountId: brandAccountId(row.account_id ?? ''),
    displayName: row.display_name ?? '',
    ...(row.email ? { email: row.email } : {}),
    role: row.role,
    since: row.since.toISOString(),
  }
  : {
    kind: 'invitation',
    invitationId: brandInvitationId(row.invitation_id ?? ''),
    email: (row.email ?? '') as EmailAddress,
    role: row.role,
    invitedAt: row.since.toISOString(),
    expiresAt: (row.expires_at ?? row.since).toISOString(),
  }

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
    return rosterEntry(row) as InvitationEntry
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
): Promise<readonly S1OwnerId[]> => {
  const authentic = (request: Parameters<ResolveCurrentSession>[0]): boolean => {
    const requestCsrf = header(request.headers['x-conexus-csrf'])
    return request.headers.origin === config.origin && !!requestCsrf && requestCsrf === request.cookies[CSRF_COOKIE]
  }

  app.route<{ Params: WorkspaceParams }>({
    ...S1_GENERATED_ROUTES['IAM-04'],
    handler: async (request, reply) => {
      const current = await resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const roster = await store.roster({
        actor: current.account.accountId,
        workspaceId: brandWorkspaceId(request.params.workspaceId),
      })
      if (!roster) return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
      return roster
    },
  })

  app.route<{ Params: WorkspaceParams; Body: Iam05Body }>({
    ...S1_GENERATED_ROUTES['IAM-05'],
    handler: async (request, reply) => {
      if (!authentic(request)) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const email = parseEmailAddress(request.body.email)
      const role = parseWorkspaceRole(request.body.role)
      if (!email || !role) return sendProblem(reply, 422, 'invitation-not-acceptable', 'Invitation not acceptable')
      try {
        return await store.invite({
          actor: current.account.accountId,
          workspaceId: brandWorkspaceId(request.params.workspaceId),
          email,
          role,
        })
      } catch (error) {
        if (isNotAdmitted(error)) return sendProblem(reply, 403, 'members-manage-required', 'Member administration denied')
        throw error
      }
    },
  })

  app.route<{ Params: MemberParams; Body: Iam10Body }>({
    ...S1_GENERATED_ROUTES['IAM-10'],
    handler: async (request, reply) => {
      if (!authentic(request)) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const role = parseWorkspaceRole(request.body.role)
      if (!role) return sendProblem(reply, 422, 'role-not-acceptable', 'Role not acceptable')
      try {
        await store.setRole({
          actor: current.account.accountId,
          workspaceId: brandWorkspaceId(request.params.workspaceId),
          member: brandAccountId(request.params.accountId),
          role,
        })
        return reply.code(204).send()
      } catch (error) {
        if (isLastOwner(error)) return sendProblem(reply, 409, 'last-owner', 'The Workspace would be left without an owner')
        if (isNotAdmitted(error)) return sendProblem(reply, 403, 'members-manage-required', 'Member administration denied')
        throw error
      }
    },
  })

  app.route<{ Params: RosterEntryParams }>({
    ...S1_GENERATED_ROUTES['IAM-06'],
    handler: async (request, reply) => {
      if (!authentic(request)) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const { entryKind, entryId } = request.params
      if (entryKind !== 'member' && entryKind !== 'invitation') {
        return sendProblem(reply, 404, 'roster-entry-not-found', 'Roster entry not found')
      }
      try {
        if (entryKind === 'member') {
          await store.remove({
            actor: current.account.accountId,
            workspaceId: brandWorkspaceId(request.params.workspaceId),
            member: brandAccountId(entryId),
          })
        } else {
          await store.cancelInvitation({
            actor: current.account.accountId,
            invitationId: brandInvitationId(entryId),
          })
        }
        return reply.code(204).send()
      } catch (error) {
        if (isLastOwner(error)) return sendProblem(reply, 409, 'last-owner', 'The Workspace would be left without an owner')
        if (isNotAdmitted(error)) return sendProblem(reply, 403, 'members-manage-required', 'Member administration denied')
        throw error
      }
    },
  })

  return ['IAM-04', 'IAM-05', 'IAM-06', 'IAM-10']
}
