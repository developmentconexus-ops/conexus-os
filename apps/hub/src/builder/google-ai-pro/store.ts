import type { SecretEnvelope } from '../../platform/secrets.js'
import type { PostgresPool } from '../../platform/postgres.js'
import { GOOGLE_AI_PRO_PROVIDER, type GoogleAiProKey, parseKey } from './credential.js'

const KIND = 'google_ai_pro'

export type GoogleAiProAccounts = Readonly<{
  /** Whether the installation has a shared account for this provider, with no caller in mind. */
  hasShared(): Promise<boolean>
  /** The caller's own key, else the one shared with everyone; null when neither exists. */
  read(accountId: string): Promise<GoogleAiProKey | null>
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
 * Google AI Pro's credential in `model.model_account` (kind `google_ai_pro`), replacing the
 * Factory's `ModelCredentialsStorage` (spec 0002, Data model and Copy list). Every row this reads
 * or writes is sealed with the same envelope every Conexus secret uses
 * (`platform/secrets.ts`), so a raw key never reaches a log or the sandbox.
 */
export const createGoogleAiProAccounts = ({ pool, envelope }: Readonly<{ pool: Pick<PostgresPool, 'query'>; envelope: SecretEnvelope }>): GoogleAiProAccounts => {
  const open = openSealed(envelope)

  const readOwnSealed = async (accountId: string): Promise<string | null> => {
    const { rows } = await pool.query<{ secret: string }>('SELECT secret FROM model.read_model_account($1, $2)', [accountId, GOOGLE_AI_PRO_PROVIDER])
    return rows[0]?.secret ?? null
  }
  const readSharedSealed = async (): Promise<string | null> => {
    const { rows } = await pool.query<{ secret: string }>('SELECT secret FROM model.read_shared_model_account($1)', [GOOGLE_AI_PRO_PROVIDER])
    return rows[0]?.secret ?? null
  }

  const hasShared = async (): Promise<boolean> => (await readSharedSealed()) !== null

  const read = async (accountId: string): Promise<GoogleAiProKey | null> => {
    const sealed = (await readOwnSealed(accountId)) ?? (await readSharedSealed())
    return sealed ? open(sealed) : null
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
