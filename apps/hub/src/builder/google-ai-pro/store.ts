import type { SecretEnvelope } from '../../platform/secrets.js'
import type { PostgresPool } from '../../platform/postgres.js'
import { GOOGLE_AI_PRO_PROVIDER, type GoogleAiProKey, parseKey } from './credential.js'

const KIND = 'google_ai_pro'

/** The row a run records as the one that paid for it, and the key its model calls carry. */
type GoogleAiProAccount = Readonly<{ modelAccountId: string; key: GoogleAiProKey }>

export type GoogleAiProAccounts = Readonly<{
  /** Whether the installation has a shared account for this provider, with no caller in mind. */
  hasShared(): Promise<boolean>
  /** The caller's own account, else the one shared with everyone; null when neither exists. */
  read(accountId: string): Promise<GoogleAiProAccount | null>
  /** The caller's own connection state, for the Settings card. */
  connection(accountId: string): Promise<Readonly<{ mine: boolean; shared: boolean }>>
  /** Writes the caller's own row, sealed. An update keeps the row's existing sharing level. */
  write(accountId: string, key: GoogleAiProKey): Promise<void>
}>

const openSealed = (envelope: SecretEnvelope) => async (sealed: string): Promise<GoogleAiProKey> => {
  const opened = envelope.open(sealed)
  const key = parseKey(await opened)
  if (!key) throw new Error('GOOGLE_AI_PRO_STORED_RECORD_REFUSED')
  return key
}

/**
 * Google AI Pro's credential in `model.model_account` (kind `google_ai_pro`) (spec 0002, Data
 * model). Every row this reads
 * or writes is sealed with the same envelope every Conexus secret uses
 * (`platform/secrets.ts`), so a raw key never reaches a log or the sandbox.
 */
export const createGoogleAiProAccounts = ({ pool, envelope }: Readonly<{ pool: Pick<PostgresPool, 'query'>; envelope: SecretEnvelope }>): GoogleAiProAccounts => {
  const open = openSealed(envelope)

  type SealedRow = Readonly<{ model_account_id: string; secret: string }>
  const readOwnSealed = async (accountId: string): Promise<SealedRow | null> => {
    const { rows } = await pool.query<SealedRow>('SELECT model_account_id, secret FROM model.read_model_account($1, $2)', [accountId, GOOGLE_AI_PRO_PROVIDER])
    return rows[0] ?? null
  }
  const readSharedSealed = async (): Promise<SealedRow | null> => {
    const { rows } = await pool.query<SealedRow>('SELECT model_account_id, secret FROM model.read_shared_model_account($1)', [GOOGLE_AI_PRO_PROVIDER])
    return rows[0] ?? null
  }

  const hasShared = async (): Promise<boolean> => (await readSharedSealed()) !== null

  const read = async (accountId: string): Promise<GoogleAiProAccount | null> => {
    const row = (await readOwnSealed(accountId)) ?? (await readSharedSealed())
    return row ? Object.freeze({ modelAccountId: row.model_account_id, key: await open(row.secret) }) : null
  }

  const connection = async (accountId: string): Promise<Readonly<{ mine: boolean; shared: boolean }>> => {
    const [own, shared] = await Promise.all([readOwnSealed(accountId), readSharedSealed()])
    return Object.freeze({ mine: own !== null, shared: shared !== null })
  }

  const write = async (accountId: string, key: GoogleAiProKey): Promise<void> => {
    const sealed = await envelope.seal(key)
    await pool.query('SELECT model.upsert_model_account($1, $2, $3, $4)', [accountId, GOOGLE_AI_PRO_PROVIDER, KIND, sealed])
  }

  return Object.freeze({ hasShared, read, connection, write })
}
