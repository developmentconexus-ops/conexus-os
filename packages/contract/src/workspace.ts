import { z } from 'zod'
import { AccountId, WorkspaceId } from './ids.js'
import { operation } from './operation.js'

export const IdempotencyKey = z.string().min(1).brand<'IdempotencyKey'>().meta({ id: 'IdempotencyKey', failureCode: 'IDEMPOTENCY_KEY_REQUIRED' })
export type IdempotencyKey = z.output<typeof IdempotencyKey>
export const WorkspaceName = z.string().min(1).regex(/\S/).meta({ id: 'WorkspaceName' })
export const WorkspaceCreated = z.object({
  workspaceId: WorkspaceId,
  name: WorkspaceName,
  creatorAccountId: AccountId,
  initialAccessEstablished: z.literal(true),
}).meta({ id: 'WorkspaceCreated' })
export type WorkspaceCreated = z.output<typeof WorkspaceCreated>

export const WS01 = operation({
  id: 'WS-01', access: 'session', method: 'POST', path: '/api/control/workspaces',
  params: null, query: null,
  headers: z.looseObject({ 'idempotency-key': IdempotencyKey }),
  body: z.object({ name: WorkspaceName }).strict(),
  success: { 201: WorkspaceCreated },
  effects: [], failures: ['IDEMPOTENCY_CONFLICT'], malformed: null,
})
