import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canonicalBytes } from '../../../../packages/canonical-json/src/index.mjs'
import type { Input, JsonOperation, Reply } from '../../../../packages/contract/dist/index.js'
import type { Admitted, AccountScope, BootstrapScope, ProjectScope, WorkspaceAction, WorkspaceScope } from '../identity-access/admission.js'
import { sql } from './db.js'
import { Failure } from './failure.js'

type ReceiptScope = AccountScope | WorkspaceScope<WorkspaceAction> | ProjectScope | BootstrapScope
export type DigestInput<O extends JsonOperation> = Pick<Input<O>, 'params' | 'query' | 'body'>
export type Receipt<I, R> = Readonly<{ kind: 'fresh'; resourceId: I }> | Readonly<{ kind: 'replay'; reply: R }>

const ReceiptRow = z.object({
  request_digest: z.instanceof(Buffer), resource_id: z.string(), state: z.enum(['reserved', 'completed']),
  response_status: z.number().nullable(), response_body: z.unknown(),
})

const digest = (value: unknown): Buffer => createHash('sha256').update(canonicalBytes(value)).digest()
const authorityOf = (scope: ReceiptScope): string => {
  switch (scope.kind) {
    case 'account': return `account:${scope.accountId}`
    case 'workspace': return `workspace:${scope.workspaceId}:account:${scope.accountId}`
    case 'project': return `workspace:${scope.workspaceId}:account:${scope.accountId}`
    case 'bootstrap': return `bootstrap:${scope.issuer}:${scope.subject}`
  }
}

const replyStatus = <O extends JsonOperation>(op: O, reply: Reply<O>): number => {
  const statuses = Object.keys(op.success)
  if (statuses.length === 1) return Number(statuses[0])
  if (typeof reply === 'object' && reply !== null && 'status' in reply && typeof reply.status === 'number') return reply.status
  throw new Failure('INTERNAL_UNEXPECTED')
}

const replyBody = <O extends JsonOperation>(op: O, reply: Reply<O>): unknown => {
  const body = Object.keys(op.success).length > 1 && typeof reply === 'object' && reply !== null && 'body' in reply ? reply.body : reply
  return body === undefined ? null : body
}

const replayReply = <O extends JsonOperation>(op: O, status: number | null, body: unknown): Reply<O> => {
  const declared = Object.entries(op.success).find(([key]) => Number(key) === status)
  if (!declared) throw new Failure('INTERNAL_UNEXPECTED')
  const parsed = declared[1] === null ? undefined : declared[1].parse(body)
  const reply: unknown = Object.keys(op.success).length === 1 ? parsed : { status, body: parsed }
  const isReply = (value: unknown): value is Reply<O> => {
    if (Object.keys(op.success).length === 1) {
      return declared[1] === null ? value === undefined : declared[1].safeParse(value).success
    }
    return typeof value === 'object' && value !== null && 'status' in value && value.status === status &&
      'body' in value && (declared[1] === null ? value.body === undefined : declared[1].safeParse(value.body).success)
  }
  if (!isReply(reply)) throw new Failure('INTERNAL_UNEXPECTED')
  return reply
}

const receiptKey = <O extends JsonOperation>(proof: Admitted<ReceiptScope>, op: O, key: string, input: DigestInput<O>) => ({
  operationId: op.id,
  authority: authorityOf(proof.scope),
  accountId: 'accountId' in proof.scope ? proof.scope.accountId : null,
  keyDigest: digest(key),
  requestDigest: digest(input),
})

export const reserve = async <O extends JsonOperation, I extends z.ZodType>(
  proof: Admitted<ReceiptScope>, op: O, key: string, input: DigestInput<O>, id: I,
): Promise<Receipt<z.output<I>, Reply<O>>> => {
  const receipt = receiptKey(proof, op, key, input)
  const candidate = id.parse(randomUUID())
  await proof.tx.run(sql`
    INSERT INTO platform.operation_receipt (operation_id, authority, account_id, key_digest, request_digest, resource_id, state)
    VALUES (${receipt.operationId}, ${receipt.authority}, ${receipt.accountId}, ${receipt.keyDigest}, ${receipt.requestDigest}, ${candidate}, 'reserved')
    ON CONFLICT (operation_id, authority, key_digest) DO NOTHING
  `)
  const row = await proof.tx.one(ReceiptRow, sql`
    SELECT request_digest, resource_id, state, response_status, response_body
    FROM platform.operation_receipt
    WHERE operation_id = ${receipt.operationId} AND authority = ${receipt.authority} AND key_digest = ${receipt.keyDigest}
    FOR UPDATE
  `, 'INTERNAL_UNEXPECTED')
  if (!row.request_digest.equals(receipt.requestDigest)) throw new Failure('IDEMPOTENCY_CONFLICT')
  const resourceId = id.parse(row.resource_id)
  if (row.state === 'completed') return { kind: 'replay', reply: replayReply(op, row.response_status, row.response_body) }
  return { kind: 'fresh', resourceId }
}

export const complete = async <O extends JsonOperation>(
  proof: Admitted<ReceiptScope>, op: O, key: string, input: DigestInput<O>, resourceId: unknown, reply: Reply<O>,
): Promise<void> => {
  const receipt = receiptKey(proof, op, key, input)
  const changed = await proof.tx.run(sql`
    UPDATE platform.operation_receipt SET state = 'completed', response_status = ${replyStatus(op, reply)},
      response_body = ${JSON.stringify(replyBody(op, reply))}::jsonb, completed_at = clock_timestamp()
    WHERE operation_id = ${receipt.operationId} AND authority = ${receipt.authority} AND key_digest = ${receipt.keyDigest}
      AND request_digest = ${receipt.requestDigest} AND resource_id = ${resourceId} AND state = 'reserved'
  `)
  if (changed !== 1) throw new Failure('INTERNAL_UNEXPECTED')
}

export const idempotent = async <O extends JsonOperation, I extends z.ZodType>(
  proof: Admitted<ReceiptScope>, op: O, key: string, input: DigestInput<O>, id: I,
  run: (resourceId: z.output<I>) => Promise<Reply<O>>,
): Promise<Readonly<{ replayed: boolean; reply: Reply<O> }>> => {
  const receipt = await reserve(proof, op, key, input, id)
  if (receipt.kind === 'replay') return { replayed: true, reply: receipt.reply }
  const reply = await run(receipt.resourceId)
  await complete(proof, op, key, input, receipt.resourceId, reply)
  return { replayed: false, reply }
}
