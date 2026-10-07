import { z } from 'zod'
import { AccountId, ModelAccountId, type ModelAccountKind, type ModelAccountProvider } from '@conexus/contract'
import { admitAccount, admitSystem, type Admitted, type RunScope, type SystemScope } from '../../identity-access/admission.js'
import { sql, type Database } from '../../platform/db.js'
import { Failure } from '../../platform/failure.js'
import type { SecretEnvelope } from '../../platform/secrets.js'
import { ADMISSION_REFUSALS, withRun } from '../run-lifecycle.js'
import type { RunContext } from '../run-context.js'
import { LawfulCredential, type Lawful } from './providers.js'

export type ModelRole = 'build' | 'memory'

export type ConnectResult = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: 'ACCOUNT_INACTIVE' | 'ACCOUNT_NOT_FOUND' }>

type HeldRun = Pick<RunContext, 'builderRunId' | 'accountId'>

export type HeldAccount<L extends Lawful = Lawful> = Readonly<{
  modelAccountId: ModelAccountId
  credential: L
  secret: string
  run: HeldRun
  read(): Promise<HeldAccount | null>
  persist(secret: string): Promise<boolean>
}>

type OwnAccount = Readonly<{ state: 'absent' }> | Readonly<{ state: 'connected'; kind: ModelAccountKind }>
type ModelStanding = Readonly<Record<ModelAccountProvider, Readonly<{ own: OwnAccount; shared: boolean }>>>

export type ModelAccounts = Readonly<{
  standing(accountId: AccountId): Promise<ModelStanding>
  write(input: Readonly<{ accountId: AccountId; credential: Lawful; secret: string }>): Promise<void>
  connect(input: Readonly<{ accountId: AccountId; credential: Lawful; secret: string }>): Promise<ConnectResult>
  readDefault(accountId: AccountId, role: ModelRole): Promise<string | null>
  usable(accountId: AccountId, provider: ModelAccountProvider): Promise<boolean>
  select(run: HeldRun, provider: ModelAccountProvider): Promise<HeldAccount | null>
}>

const SealedRow = z.object({ model_account_id: ModelAccountId, secret: z.string() }).and(LawfulCredential)
  .transform(({ model_account_id, secret, ...credential }) => ({ modelAccountId: model_account_id, credential, sealed: secret }))
const StandingRow = z.object({ owner_account_id: AccountId, sharing: z.enum(['just_me', 'everyone']) }).and(LawfulCredential)
const DefaultRow = z.object({ model_id: z.string() })

export function createModelAccounts({ database, envelope, ownerId }: Readonly<{ database: Database; envelope: SecretEnvelope; ownerId: string }>): ModelAccounts {
  const readById = async ({ tx, scope }: Admitted<RunScope>, { modelAccountId }: Readonly<{ modelAccountId: ModelAccountId }>) => tx.maybe(SealedRow, sql`
    SELECT account.model_account_id, account.provider, account.kind, account.secret FROM model.model_account AS account
    JOIN builder.builder_run_model_account AS recorded ON recorded.model_account_id = account.model_account_id
    WHERE account.model_account_id = ${modelAccountId} AND recorded.builder_run_id = ${scope.builderRunId}`)

  const rewrite = async ({ tx }: Admitted<SystemScope<'builder-executor'>>, { modelAccountId, kind, sealed }: Readonly<{ modelAccountId: ModelAccountId; kind: ModelAccountKind; sealed: string }>): Promise<boolean> =>
    await tx.run(sql`
      UPDATE model.model_account SET secret = ${sealed}, updated_at = clock_timestamp()
      WHERE model_account_id = ${modelAccountId} AND kind = ${kind}`) === 1

  const hold = (row: Readonly<{ modelAccountId: ModelAccountId; credential: Lawful }>, secret: string, run: HeldRun): HeldAccount =>
    Object.freeze({
      modelAccountId: row.modelAccountId,
      credential: row.credential,
      secret,
      run,
      read: async () => {
        const stored = await withRun(database, ownerId, run.builderRunId, { via: 'account', accountId: run.accountId }, (proof) => readById(proof, { modelAccountId: row.modelAccountId }))
          .catch((error: unknown) => { if (error instanceof Failure && ADMISSION_REFUSALS.has(error.id)) return null; throw error })
        if (!stored || stored.credential.provider !== row.credential.provider || stored.credential.kind !== row.credential.kind) return null
        return hold(row, await envelope.open(stored.sealed), run)
      },
      persist: async (next) => {
        const sealed = await envelope.seal(next)
        return database.system('builder-executor', async (gate) => rewrite(await admitSystem(gate, 'builder-executor'), { modelAccountId: row.modelAccountId, kind: row.credential.kind, sealed }))
      },
    })

  const readUsable = (accountId: AccountId, provider: ModelAccountProvider) => database.transaction(accountId, async (gate) => {
    const { tx, scope } = await admitAccount(gate)
    return await tx.maybe(SealedRow, sql`
      SELECT model_account_id, provider, kind, secret FROM model.model_account
      WHERE provider = ${provider} AND owner_account_id = ${scope.accountId}`)
      ?? await tx.maybe(SealedRow, sql`
        SELECT model_account_id, provider, kind, secret FROM model.model_account
        WHERE provider = ${provider} AND sharing = 'everyone'`)
  })

  const write: ModelAccounts['write'] = async ({ accountId, credential, secret }) => {
    const sealed = await envelope.seal(secret)
    await database.transaction(accountId, async (gate) => {
      const { tx, scope } = await admitAccount(gate)
      await tx.run(sql`
        INSERT INTO model.model_account (owner_account_id, provider, kind, secret)
        VALUES (${scope.accountId}, ${credential.provider}, ${credential.kind}, ${sealed})
        ON CONFLICT (owner_account_id, provider) DO UPDATE
          SET kind = EXCLUDED.kind, secret = EXCLUDED.secret, updated_at = clock_timestamp()
          WHERE model_account.owner_account_id = ${scope.accountId}`)
    })
  }

  return Object.freeze({
    standing: (accountId) => database.read(accountId, async (gate) => {
      const { tx, scope } = await admitAccount(gate)
      const rows = await tx.rows(StandingRow, sql`
        SELECT provider, kind, owner_account_id, sharing FROM model.model_account
        WHERE owner_account_id = ${scope.accountId} OR sharing = 'everyone'`)
      const of = (provider: ModelAccountProvider): ModelStanding[ModelAccountProvider] => {
        const own = rows.find((row) => row.provider === provider && row.owner_account_id === scope.accountId)
        return { own: own ? { state: 'connected', kind: own.kind } : { state: 'absent' }, shared: rows.some((row) => row.provider === provider && row.sharing === 'everyone') }
      }
      return { anthropic: of('anthropic'), 'openai-codex': of('openai-codex'), 'google-ai-pro': of('google-ai-pro') }
    }),
    write,
    connect: (input) => write(input).then(
      (): ConnectResult => ({ ok: true }),
      (error: unknown): ConnectResult => {
        if (error instanceof Failure && (error.id === 'ACCOUNT_INACTIVE' || error.id === 'ACCOUNT_NOT_FOUND')) return { ok: false, reason: error.id }
        throw error
      },
    ),
    readDefault: (accountId, role) => database.read(accountId, async (gate) => {
      const { tx } = await admitAccount(gate)
      return (await tx.maybe(DefaultRow, sql`SELECT model_id FROM model.installation_default WHERE role = ${role}`))?.model_id ?? null
    }),
    usable: async (accountId, provider) => {
      const row = await readUsable(accountId, provider)
      if (!row) return false
      await envelope.open(row.sealed)
      return true
    },
    select: async (run, provider) => {
      const row = await readUsable(run.accountId, provider)
      return row ? hold(row, await envelope.open(row.sealed), run) : null
    },
  })
}
