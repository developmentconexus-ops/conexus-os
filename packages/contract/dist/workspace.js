import { z } from 'zod';
import { AccountId, IdempotencyKey, WorkspaceId } from './ids.js';
import { operation } from './operation.js';
export const WorkspaceName = z.string().min(1).regex(/\S/).meta({ id: 'WorkspaceName' });
export const WorkspaceCreated = z.object({
    workspaceId: WorkspaceId,
    name: WorkspaceName,
    creatorAccountId: AccountId,
    initialAccessEstablished: z.literal(true),
}).meta({ id: 'WorkspaceCreated' });
export const createWorkspace = operation({
    id: 'createWorkspace', summary: 'Create a Workspace; the creator becomes its owner.', access: 'session', method: 'POST', path: '/api/control/workspaces',
    params: null, query: null,
    headers: z.looseObject({ 'idempotency-key': IdempotencyKey }),
    body: z.object({ name: WorkspaceName }).strict(),
    success: { 201: WorkspaceCreated },
    effects: [], failures: ['ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'], malformed: null,
});
