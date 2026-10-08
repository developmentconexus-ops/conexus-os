import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AccountId, ModelAccountId, type ModelAccountProvider, type Result } from '@conexus/contract'
import type { AccountScope, Admitted, RunScope, SystemScope } from '../identity-access/admission.js'
import { sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { modelAccountContext, SealedColumn, type Sealed, type SecretEnvelope } from '../platform/secrets.js'
import { CredentialKind, encodeCredential, parseCredential, type Credential } from './credential.js'

export type ConnectResult = Result<void, Readonly<{ code: 'ACCOUNT_INACTIVE' | 'ACCOUNT_NOT_FOUND' }>>

type Slot = Readonly<{ scope: 'personal'; ownerAccountId: AccountId }> | Readonly<{ scope: 'installation' }>
type RowBase = Readonly<{ modelAccountId: ModelAccountId; slot: Slot; connectedAt: Date; refusedAt: Date | null }>
export type AccountRow = RowBase & CredentialKind
export type HeldAccount = Readonly<{ row: RowBase; credential: Credential; sealed: Sealed<'model-account'> }>
export type HoldError = Readonly<{ code: 'SECRET_CUSTODY_LOST'; row: AccountRow; spent: Sealed<'model-account'> }> | Readonly<{ code: 'BUILDER_MODEL_NOT_SELECTED' }>
export type OpenRun = <T, E extends HoldError>(work: (proof: Admitted<RunScope>) => Promise<Result<T, E>>) => Promise<Result<T, E>>
type Reread = Readonly<{ state: 'present'; held: HeldAccount }> | Readonly<{ state: 'gone' }>
export type Persisted = Readonly<{ state: 'stored'; held: HeldAccount }> | Readonly<{ state: 'superseded' }>
export type ModelAccountStore = Readonly<{
  list(proof: Admitted<AccountScope, 'read'>): Promise<readonly AccountRow[]>
  connect(input: Readonly<{ proof: Admitted<AccountScope>; credential: Credential; displayName: string }>): Promise<ModelAccountId>
  hold(proof: Admitted<RunScope>, provider: ModelAccountProvider): Promise<Result<HeldAccount, HoldError>>
  reread(openRun: OpenRun, held: HeldAccount): Promise<Result<Reread, HoldError>>
  persist(proof: Admitted<SystemScope>, held: HeldAccount, next: Credential): Promise<Persisted>
}>

const SlotRow = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('personal'), owner_account_id: AccountId }).transform(({ owner_account_id }) => ({ scope: 'personal' as const, ownerAccountId: owner_account_id })),
  z.object({ scope: z.literal('installation'), owner_account_id: z.null() }).transform(() => ({ scope: 'installation' as const })),
]).transform((slot) => ({ slot }))
const MetadataRow = z.object({ model_account_id: ModelAccountId, connected_at: z.date(), refused_at: z.date().nullable() })
  .transform(({ model_account_id, connected_at, refused_at }) => ({ modelAccountId: model_account_id, connectedAt: connected_at, refusedAt: refused_at }))
const AccountRowSchema = MetadataRow.and(SlotRow).and(CredentialKind)
const StoredRow = AccountRowSchema.and(z.object({ secret: SealedColumn('model-account') }))
  .transform(({ secret, ...row }) => ({ ...row, sealed: secret }))
type StoredRow = z.output<typeof StoredRow>
const ACCOUNT_COLUMNS = sql`model_account_id, scope, owner_account_id, provider, kind, connected_at, refused_at`
const ROW_COLUMNS = sql`${ACCOUNT_COLUMNS}, secret`

async function openRow(envelope: SecretEnvelope, stored: StoredRow): Promise<Result<HeldAccount, HoldError>> {
  const { sealed, ...accountRow } = stored
  const { modelAccountId, slot, connectedAt, refusedAt, ...pair } = accountRow
  const row = { modelAccountId, slot, connectedAt, refusedAt }
  try {
    const credential = parseCredential(pair, await envelope.open(sealed, modelAccountContext(modelAccountId)))
    return { ok: true, result: { row, credential, sealed } }
  } catch (error) {
    if (error instanceof Failure && error.id === 'SECRET_CUSTODY_LOST') return { ok: false, error: { code: error.id, row: accountRow, spent: sealed } }
    throw error
  }
}

async function rereadRow(envelope: SecretEnvelope, openRun: OpenRun, held: HeldAccount): Promise<Result<Reread, HoldError>> {
  return openRun<Reread, HoldError>(async ({ tx, scope }) => {
    const stored = await tx.maybe(StoredRow, sql`SELECT ${ROW_COLUMNS} FROM model.model_account WHERE model_account_id = ${held.row.modelAccountId}
      AND scope = 'personal' AND owner_account_id = ${scope.accountId} AND provider = ${held.credential.provider} AND kind = ${held.credential.kind}`)
    if (!stored) return { ok: true, result: { state: 'gone' } }
    const opened = await openRow(envelope, stored)
    return opened.ok ? { ok: true, result: { state: 'present', held: opened.result } } : opened
  })
}

async function connectRow(envelope: SecretEnvelope, { proof: { tx, scope }, credential, displayName }: Parameters<ModelAccountStore['connect']>[0]): ReturnType<ModelAccountStore['connect']> {
  await tx.run(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`model-account:personal:${scope.accountId}:${credential.provider}`}, 0))`)
  const existing = await tx.maybe(z.object({ model_account_id: ModelAccountId }), sql`
    SELECT model_account_id FROM model.model_account
    WHERE scope = 'personal' AND owner_account_id = ${scope.accountId} AND provider = ${credential.provider} FOR UPDATE`)
  const id = existing?.model_account_id ?? ModelAccountId.parse(randomUUID())
  const sealed = await envelope.seal(encodeCredential(credential), modelAccountContext(id))
  await tx.run(sql`
    INSERT INTO model.model_account (model_account_id, scope, owner_account_id, provider, kind, secret, connected_by, connected_by_name, connected_at)
    VALUES (${id}, 'personal', ${scope.accountId}, ${credential.provider}, ${credential.kind}, ${sealed}, ${scope.accountId}, ${displayName}, clock_timestamp())
    ON CONFLICT (owner_account_id, provider) WHERE scope = 'personal' DO UPDATE
      SET kind = EXCLUDED.kind, secret = EXCLUDED.secret, connected_by = EXCLUDED.connected_by, connected_by_name = EXCLUDED.connected_by_name,
        connected_at = EXCLUDED.connected_at, updated_at = clock_timestamp(), refused_at = NULL
      WHERE model_account.owner_account_id = ${scope.accountId}`)
  return id
}

async function persistRow(envelope: SecretEnvelope, { tx }: Admitted<SystemScope>, held: HeldAccount, next: Credential): ReturnType<ModelAccountStore['persist']> {
  const { row, credential, sealed: spent } = held
  if (next.provider !== credential.provider || next.kind !== credential.kind) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'MODEL_ACCOUNT_REFRESH_PAIR_CHANGED' } })
  const sealed = await envelope.seal(encodeCredential(next), modelAccountContext(row.modelAccountId))
  const stored = await tx.maybe(StoredRow, sql`
    UPDATE model.model_account SET secret = ${sealed}, updated_at = clock_timestamp()
    WHERE model_account_id = ${row.modelAccountId} AND scope = ${row.slot.scope}
      AND owner_account_id IS NOT DISTINCT FROM ${row.slot.scope === 'personal' ? row.slot.ownerAccountId : null}
      AND provider = ${credential.provider} AND kind = ${credential.kind} AND secret = ${spent}
    RETURNING ${ROW_COLUMNS}`)
  return stored ? { state: 'stored', held: { row, credential: next, sealed } } : { state: 'superseded' }
}

export function createModelAccountStore(envelope: SecretEnvelope): ModelAccountStore {
  return Object.freeze({
    list: ({ tx, scope }) => tx.rows(AccountRowSchema, sql`SELECT ${ACCOUNT_COLUMNS} FROM model.model_account WHERE scope = 'personal' AND owner_account_id = ${scope.accountId}`),
    connect: (input) => connectRow(envelope, input),
    hold: async ({ tx, scope }, provider) => {
      const row = await tx.maybe(StoredRow, sql`SELECT ${ROW_COLUMNS} FROM model.model_account WHERE scope = 'personal' AND owner_account_id = ${scope.accountId} AND provider = ${provider}`)
      return row ? openRow(envelope, row) : { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } }
    },
    reread: (openRun, held) => rereadRow(envelope, openRun, held),
    persist: (proof, held, next) => persistRow(envelope, proof, held, next),
  })
}
