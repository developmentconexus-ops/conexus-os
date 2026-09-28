import type { SecretEnvelope } from '../platform/secrets.js'
import type { PostgresPool } from '../platform/postgres.js'

type ModelAccountKind = 'api_key' | 'oauth' | 'google_ai_pro'

/** A row the Hub reads to call a model: its id (what a run records as the account that paid) and its opened secret. */
export type HeldModelAccount = Readonly<{ modelAccountId: string; kind: ModelAccountKind; secret: string }>

export type ModelAccountStore = Readonly<{
  /** The caller's own account for the provider, else the one shared with everyone; null when neither exists. */
  usable(accountId: string, provider: string): Promise<HeldModelAccount | null>
  /** Whether the caller has their own account for the provider, and whether one is shared. */
  connection(accountId: string, provider: string): Promise<Readonly<{ mine: boolean; shared: boolean }>>
  /** Whether the installation shares an account for the provider, with no caller in mind. */
  hasShared(provider: string): Promise<boolean>
  /** Writes the caller's own row, sealed. A new row is `just_me`; an update keeps the row's sharing. */
  write(accountId: string, provider: string, kind: ModelAccountKind, secret: string): Promise<void>
  /** The row a run holds, by id, whoever owns it; null once it is gone. */
  readById(modelAccountId: string): Promise<HeldModelAccount | null>
  /** Replaces the secret of the row a run holds, sealed; false once the row is gone. */
  rewrite(modelAccountId: string, secret: string): Promise<boolean>
}>

type SealedRow = Readonly<{ model_account_id: string; secret: string; kind: ModelAccountKind }>

/**
 * `model.model_account` through the functions `hub_model_account` is granted (spec 0002, Data
 * model). Every secret is sealed with the envelope every Conexus secret uses before it is written,
 * and opened only here, in the Hub.
 */
export const createModelAccountStore = ({ pool, envelope }: Readonly<{ pool: Pick<PostgresPool, 'query'>; envelope: SecretEnvelope }>): ModelAccountStore => {
  const readOwn = async (accountId: string, provider: string): Promise<SealedRow | null> =>
    (await pool.query<SealedRow>('SELECT model_account_id, secret, kind FROM model.read_model_account($1, $2)', [accountId, provider])).rows[0] ?? null
  const readShared = async (provider: string): Promise<SealedRow | null> =>
    (await pool.query<SealedRow>('SELECT model_account_id, secret, kind FROM model.read_shared_model_account($1)', [provider])).rows[0] ?? null
  const opened = async (row: SealedRow): Promise<HeldModelAccount> =>
    Object.freeze({ modelAccountId: row.model_account_id, kind: row.kind, secret: await envelope.open(row.secret) })

  return Object.freeze({
    usable: async (accountId, provider) => {
      const row = (await readOwn(accountId, provider)) ?? (await readShared(provider))
      return row ? opened(row) : null
    },
    connection: async (accountId, provider) => {
      const [own, shared] = await Promise.all([readOwn(accountId, provider), readShared(provider)])
      return Object.freeze({ mine: own !== null, shared: shared !== null })
    },
    hasShared: async (provider) => (await readShared(provider)) !== null,
    write: async (accountId, provider, kind, secret) => {
      await pool.query('SELECT model.upsert_model_account($1, $2, $3, $4)', [accountId, provider, kind, await envelope.seal(secret)])
    },
    readById: async (modelAccountId) => {
      const row = (await pool.query<Omit<SealedRow, 'model_account_id'>>('SELECT secret, kind FROM model.read_model_account_by_id($1)', [modelAccountId])).rows[0]
      return row ? opened({ ...row, model_account_id: modelAccountId }) : null
    },
    rewrite: async (modelAccountId, secret) =>
      (await pool.query<{ value: boolean }>('SELECT model.rewrite_model_account_secret($1, $2) AS value', [modelAccountId, await envelope.seal(secret)])).rows[0]?.value === true,
  })
}
