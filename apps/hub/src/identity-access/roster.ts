import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AccountId, DisplayName, EmailAddress, InvitationId, WorkspaceRole,
  cancelWorkspaceInvitation, getWorkspaceRoster, inviteWorkspaceMember, removeWorkspaceMember, setWorkspaceMemberRole,
} from '@conexus/contract'
import type { InvitationState, WorkspaceId, WorkspaceInvitationEntry, WorkspaceMemberEntry, WorkspaceRoster } from '@conexus/contract'
import { routes } from '../http/access.js'
import { sql } from '../platform/db.js'
import type { Database, WriteTx } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { INVITATION_DAYS } from '../platform/lifetimes.js'
import { idempotent } from '../platform/receipt.js'
import { admitWorkspace, Present, receiptOf } from './admission.js'
import type { AccountScope, Admitted, OwnerRow } from './admission.js'
import type { Claim } from './authentication.js'

/** A role change of one member: the role it would hold, or null when it leaves. */
type OwnerChange = Readonly<{ accountId: AccountId; role: WorkspaceRole | null }>

/**
 * A Workspace keeps an active owner: a change that takes an owner away needs another active one in the locked set.
 * @public Tests call it through the built Hub.
 */
export const lastOwnerStays = (owners: readonly OwnerRow[], change: OwnerChange): boolean =>
  change.role === 'owner' || !owners.some((owner) => owner.accountId === change.accountId) ||
  owners.some((owner) => owner.accountId !== change.accountId && owner.active)

/** An invitation's state, from whether the database's clock still finds it open. */
const invitationState = (row: Readonly<{ open: boolean }>): InvitationState => (row.open ? 'PENDING' : 'EXPIRED')

/** The columns every invitation list reads, a Workspace's and an application's. */
export const InvitationRow = z.object({ invitation_id: InvitationId, email: EmailAddress, invited_at: z.date(), expires_at: z.date(), open: z.boolean() })
/** The entry fields both invitation lists share. */
/** Whether an invitation upsert inserted (`xmax = 0`) or refreshed the existing invitation. */
export const inserted = { inserted: z.boolean() }
export const invitationFields = (row: z.output<typeof InvitationRow>) => ({
  invitationId: row.invitation_id, email: row.email, invitedAt: row.invited_at.toISOString(), expiresAt: row.expires_at.toISOString(), state: invitationState(row),
})

const MemberRow = z.object({ account_id: AccountId, display_name: DisplayName, email: EmailAddress.nullable(), role: WorkspaceRole, since: z.date() })
const WorkspaceInvitationRow = InvitationRow.extend({ role: WorkspaceRole })

const memberEntry = (row: z.output<typeof MemberRow>): WorkspaceMemberEntry => ({
  kind: 'member', accountId: row.account_id, displayName: row.display_name, ...(row.email ? { email: row.email } : {}), role: row.role, since: row.since.toISOString(),
})

const invitationEntry = (row: z.output<typeof WorkspaceInvitationRow>): WorkspaceInvitationEntry => ({ kind: 'invitation', ...invitationFields(row), role: row.role })

// The target's row, locked before the change; the decision reads the owners the admission locked.
const lockMember = async (tx: WriteTx, workspaceId: WorkspaceId, accountId: AccountId): Promise<void> => {
  const member = await tx.maybe(Present, sql`
    SELECT 1 AS present FROM iam.workspace_membership WHERE workspace_id = ${workspaceId} AND account_id = ${accountId} FOR UPDATE`)
  if (!member) throw new Failure('ROSTER_ENTRY_NOT_FOUND')
}

/** Inserts the memberships a sign in's claim took; a membership the account already holds stays as it is. */
export const joinClaimed = async (proof: Admitted<AccountScope>, claim: Claim): Promise<void> => {
  for (const invitation of claim.workspaces) {
    await proof.tx.run(sql`
      INSERT INTO iam.workspace_membership (account_id, workspace_id, role)
      VALUES (${proof.scope.accountId}, ${invitation.workspace_id}, ${invitation.role})
      ON CONFLICT (account_id, workspace_id) DO NOTHING`)
  }
}

export const registerRosterRoutes = async (app: FastifyInstance, database: Database) => {
  const route = routes(app)

  route.operation(getWorkspaceRoster, ({ params }, session): Promise<WorkspaceRoster> => database.read(session.account.accountId, async (tx) => {
    const proof = await admitWorkspace(tx, params.workspaceId, 'workspace.read')
    const members = await tx.rows(MemberRow, sql`
      SELECT member.account_id, member.display_name, member.email, membership.role, membership.created_at AS since
      FROM iam.workspace_membership AS membership JOIN iam.account AS member ON member.account_id = membership.account_id
      WHERE membership.workspace_id = ${proof.scope.workspaceId}
      ORDER BY membership.created_at, membership.account_id`)
    const invitations = await tx.rows(WorkspaceInvitationRow, sql`
      SELECT invitation_id, email, role, created_at AS invited_at, expires_at, expires_at > now() AS open
      FROM iam.workspace_invitation WHERE workspace_id = ${proof.scope.workspaceId}
      ORDER BY created_at, invitation_id`)
    return { viewerRole: proof.scope.role, entries: [...members.map(memberEntry), ...invitations.map(invitationEntry)] }
  }))

  // The pair (Workspace, email) is the invitation: a new invitation of the same email refreshes its role, inviter and expiry and keeps its id.
  route.operation(inviteWorkspaceMember, ({ params, headers, body }, session) => database.transaction(session.account.accountId, async (gate) => {
    const proof = await admitWorkspace(gate, params.workspaceId, 'members.manage')
    const { reply } = await idempotent(receiptOf(proof), inviteWorkspaceMember, headers['idempotency-key'], { params, query: undefined, body }, InvitationId, async (invitationId) => {
      const row = await proof.tx.one(WorkspaceInvitationRow.extend(inserted), sql`
        INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, expires_at)
        VALUES (${invitationId}, ${proof.scope.workspaceId}, ${body.email}, ${body.role}, ${proof.scope.accountId}, now() + make_interval(days => ${INVITATION_DAYS}))
        ON CONFLICT (workspace_id, email) DO UPDATE
          SET (role, invited_by, expires_at, created_at) = (EXCLUDED.role, EXCLUDED.invited_by, EXCLUDED.expires_at, clock_timestamp())
          WHERE workspace_invitation.workspace_id = ${proof.scope.workspaceId}
        RETURNING invitation_id, email, role, created_at AS invited_at, expires_at, expires_at > now() AS open, xmax = 0 AS inserted`, 'INTERNAL_UNEXPECTED')
      return { status: row.inserted ? 201 : 200, body: invitationEntry(row) } as const
    })
    return reply
  }))

  // Oneself leaves with members.leave; removing anyone else needs members.manage. Both lock the owner set.
  route.operation(removeWorkspaceMember, ({ params }, session) => database.transaction(session.account.accountId, async (gate) => {
    const leaving = params.accountId === session.account.accountId
    const proof = leaving ? await admitWorkspace(gate, params.workspaceId, 'members.leave') : await admitWorkspace(gate, params.workspaceId, 'members.manage')
    await lockMember(proof.tx, proof.scope.workspaceId, params.accountId)
    if (!lastOwnerStays(proof.scope.owners, { accountId: params.accountId, role: null })) throw new Failure('LAST_OWNER')
    await proof.tx.run(sql`DELETE FROM iam.workspace_membership WHERE workspace_id = ${proof.scope.workspaceId} AND account_id = ${params.accountId}`)
    return undefined
  }))

  route.operation(cancelWorkspaceInvitation, ({ params }, session) => database.transaction(session.account.accountId, async (gate) => {
    const proof = await admitWorkspace(gate, params.workspaceId, 'members.manage')
    const cancelled = await proof.tx.run(sql`
      DELETE FROM iam.workspace_invitation WHERE invitation_id = ${params.invitationId} AND workspace_id = ${proof.scope.workspaceId}`)
    if (cancelled !== 1) throw new Failure('ROSTER_ENTRY_NOT_FOUND')
    return undefined
  }))

  route.operation(setWorkspaceMemberRole, ({ params, body }, session) => database.transaction(session.account.accountId, async (gate) => {
    const proof = await admitWorkspace(gate, params.workspaceId, 'members.manage')
    await lockMember(proof.tx, proof.scope.workspaceId, params.accountId)
    if (!lastOwnerStays(proof.scope.owners, { accountId: params.accountId, role: body.role })) throw new Failure('LAST_OWNER')
    return memberEntry(await proof.tx.one(MemberRow, sql`
      WITH changed AS (
        UPDATE iam.workspace_membership SET (role) = ROW(${body.role})
        WHERE workspace_id = ${proof.scope.workspaceId} AND account_id = ${params.accountId}
        RETURNING account_id, role, created_at)
      SELECT member.account_id, member.display_name, member.email, changed.role, changed.created_at AS since
      FROM changed JOIN iam.account AS member ON member.account_id = changed.account_id`, 'INTERNAL_UNEXPECTED'))
  }))

  return ['getWorkspaceRoster', 'inviteWorkspaceMember', 'removeWorkspaceMember', 'cancelWorkspaceInvitation', 'setWorkspaceMemberRole'] as const
}
