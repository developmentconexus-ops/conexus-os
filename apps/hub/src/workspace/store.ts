import { z } from 'zod'
import { WorkspaceId, WorkspaceName, createWorkspace, type AccountId, type Input, type Reply } from '@conexus/contract'
import { admitAccount, grantCreatorMembership, readAdministratorFlag, receiptOf } from '../identity-access/admission.js'
import type { Database } from '../platform/db.js'
import { sql } from '../platform/db.js'
import { idempotent } from '../platform/receipt.js'

const WorkspaceRow = z.object({ workspace_id: WorkspaceId, name: WorkspaceName })
export type WorkspaceStore = Readonly<{
  list(accountId: AccountId): Promise<readonly z.output<typeof WorkspaceRow>[]>
  createWorkspace(input: Readonly<{
    accountId: AccountId
    idempotencyKey: Input<typeof createWorkspace>['headers']['idempotency-key']
    body: Input<typeof createWorkspace>['body']
  }>): Promise<Readonly<{ replayed: boolean; reply: z.output<typeof createWorkspace.success[201]> }>>
}>

export const createWorkspaceStore = (database: Database): WorkspaceStore => Object.freeze({
  list: (accountId) => database.read(accountId, async (gate) => {
    const proof = await admitAccount(gate)
    if (await readAdministratorFlag(proof)) {
      return proof.tx.rows(WorkspaceRow, sql`SELECT workspace_id, name FROM workspace.workspace ORDER BY name, workspace_id`)
    }
    return proof.tx.rows(WorkspaceRow, sql`
        SELECT stored.workspace_id, stored.name FROM workspace.workspace AS stored
        JOIN iam.workspace_membership AS membership ON membership.workspace_id = stored.workspace_id
        WHERE membership.account_id = ${proof.scope.accountId}
        ORDER BY stored.name, stored.workspace_id`)
  }),
  createWorkspace: ({ accountId, idempotencyKey, body }) => database.transaction(accountId, async (gate) => {
    const creator = await admitAccount(gate)
    return idempotent(receiptOf(creator), createWorkspace, idempotencyKey, { params: undefined, query: undefined, body }, WorkspaceId, async (workspaceId): Promise<Reply<typeof createWorkspace>> => {
      await creator.tx.run(sql`INSERT INTO workspace.workspace (workspace_id, name) VALUES (${workspaceId}, ${body.name})`)
      await grantCreatorMembership(creator, workspaceId)
      return { workspaceId, name: body.name, creatorAccountId: accountId, initialAccessEstablished: true }
    })
  }),
})
