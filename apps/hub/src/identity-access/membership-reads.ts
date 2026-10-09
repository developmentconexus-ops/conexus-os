import { z } from 'zod'
import { WorkspaceId } from '@conexus/contract'
import type { AccountScope, Admitted } from './admission.js'
import { sql } from '../platform/db.js'

const Membership = z.object({ workspace_id: WorkspaceId })

export async function readMemberWorkspaceIds({ tx, scope }: Admitted<AccountScope, 'read'>): Promise<readonly WorkspaceId[]> {
  return (await tx.rows(Membership, sql`SELECT workspace_id FROM iam.workspace_membership WHERE account_id = ${scope.accountId}`)).map((row) => row.workspace_id)
}
