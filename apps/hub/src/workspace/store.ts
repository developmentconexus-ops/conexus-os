import { z } from 'zod'
import { WorkspaceId, WorkspaceName, WS01, type AccountId, type Input, type Reply } from '../../../../packages/contract/dist/index.js'
import { admitAccount, grantCreatorMembership } from '../identity-access/admission.js'
import type { Database } from '../platform/db.js'
import { sql } from '../platform/db.js'
import { idempotent } from '../platform/receipt.js'

const WorkspaceRow = z.object({ workspace_id: WorkspaceId, name: WorkspaceName })
export type WorkspaceStore = Readonly<{
  list(accountId: AccountId): Promise<readonly z.output<typeof WorkspaceRow>[]>
  createWorkspace(input: Readonly<{
    accountId: AccountId
    idempotencyKey: Input<typeof WS01>['headers']['idempotency-key']
    body: Input<typeof WS01>['body']
  }>): Promise<Readonly<{ replayed: boolean; reply: z.output<typeof WS01.success[201]> }>>
}>

export const createWorkspaceStore = (database: Database): WorkspaceStore => Object.freeze({
  list: (accountId) => database.read(accountId, (tx) =>
    tx.rows(WorkspaceRow, sql`SELECT workspace_id, name FROM workspace.workspace ORDER BY name, workspace_id`)),
  createWorkspace: ({ accountId, idempotencyKey, body }) => database.transaction(accountId, async (tx) => {
    const creator = await admitAccount(tx, accountId)
    return idempotent(creator, WS01, idempotencyKey, { params: undefined, query: undefined, body }, WorkspaceId, async (workspaceId): Promise<Reply<typeof WS01>> => {
      await creator.tx.run(sql`INSERT INTO workspace.workspace (workspace_id, name, created_by) VALUES (${workspaceId}, ${body.name}, ${creator.scope.accountId})`)
      await grantCreatorMembership(creator, workspaceId)
      return { workspaceId, name: body.name, creatorAccountId: accountId, initialAccessEstablished: true }
    })
  }),
})
