import { z } from 'zod'
import { ModelId, ModelAccountProvider, type AccountId, type ModelAccountId, type ModelAccountEntry, type OfferedModel, type ThinkingLevel, type ModelRole, type SessionAccount, type Result, type FailureCode } from '@conexus/contract'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { FastifyInstance } from 'fastify'
import { admitAccount, admitSystem } from '../identity-access/admission.js'
import { sql, type Database } from '../platform/db.js'
import { readCliproxyEnvironment, type GoogleAiProRuntimeConfig } from '../platform/config.js'
import type { Job } from '../platform/jobs.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import { Failure } from '../platform/failure.js'
import { MODEL_PROVIDERS, parseModelId, type Credential } from './credential.js'
import { createModelAccountStore, type ModelAccountStore, type OpenRun, type HeldAccount, type Persisted, type AccountRow, type ConnectResult } from './store.js'
import { createCredentialRefresh } from './refresh.js'
import { nativeModel, providerOf, type GoogleModelRuntime } from './providers.js'
import { offersFor } from './models.js'
import { registerModelAccountRoutes } from './routes.js'
import { createCliproxyPool, verifyCliproxyBinary } from './google-ai-pro/pool.js'
import { startModelRouter } from './google-ai-pro/router.js'
import { createRefreshWriteBack } from './google-ai-pro/write-back.js'

export { parseModelId } from './credential.js'
export { DEFAULT_THINKING_LEVEL } from './models.js'
export type { OpenRun } from './store.js'

export type ModelAccountModule = Readonly<{
  modelFor(openRun: OpenRun, call: Readonly<{ modelId: ModelId; thinkingLevel: ThinkingLevel | null }>): Promise<Result<Readonly<{ model: MastraModelConfig; modelAccountId: ModelAccountId }>, Readonly<{ code: FailureCode }>>>
  checkBeforeRun(accountId: AccountId, modelIds: readonly ModelId[]): Promise<Result<void, Readonly<{ code: FailureCode }>>>
  readDefault(accountId: AccountId, role: ModelRole): Promise<ModelId | null>
  list(accountId: AccountId): Promise<readonly ModelAccountEntry[]>
  offers(accountId: AccountId): Promise<readonly OfferedModel[]>
  registerRoutes(app: FastifyInstance): Promise<readonly string[]>
  jobs: readonly Job[]
  close(): Promise<void>
}>
export type ModelAccountDependencies = Readonly<{
  data: Database
  envelope: SecretEnvelope
  defaultThinkingLevel: ThinkingLevel
  googleAiPro: GoogleAiProRuntimeConfig | null
}>

const DefaultRow = z.object({ model_id: ModelId })
const MINUTE_MS = 60_000

async function startGoogle({ binary, sha256 }: GoogleAiProRuntimeConfig, persistFor: Parameters<typeof startModelRouter>[1]) {
  await verifyCliproxyBinary(binary, sha256)
  const pool = createCliproxyPool({ binary, stateDir: readCliproxyEnvironment().stateDir })
  await pool.sweepOrphans()
  const router = await startModelRouter(pool, persistFor)
  return Object.freeze({ pool, url: router.url, close: async () => { try { await router.close() } finally { await pool.close() } } })
}

async function readRows(data: Database, store: ModelAccountStore, accountId: AccountId): Promise<readonly AccountRow[]> {
  return data.read(accountId, async (gate) => store.list(await admitAccount(gate)))
}

function entriesOf(rows: readonly AccountRow[]): readonly ModelAccountEntry[] {
  return ModelAccountProvider.options.map((provider) => {
    const connected = rows.find((row) => row.provider === provider)
    return { provider, providerName: MODEL_PROVIDERS[provider].name, own: connected ? { state: 'connected' as const, kind: connected.kind } : { state: 'absent' as const } }
  })
}

async function writeCredential(data: Database, store: ModelAccountStore, { account, credential }: Readonly<{ account: Pick<SessionAccount, 'accountId' | 'displayName'>; credential: Credential }>): Promise<void> {
  await data.transaction(account.accountId, async (gate) => {
    const written = await store.connect({ proof: await admitAccount(gate), credential, displayName: account.displayName })
    if (!written.ok) throw new Failure(written.error.code)
  })
}

async function connectCredential(data: Database, store: ModelAccountStore, input: Parameters<typeof writeCredential>[2]): Promise<ConnectResult> {
  try {
    await writeCredential(data, store, input)
    return { ok: true, result: undefined }
  } catch (error) {
    if (error instanceof Failure && (error.id === 'ACCOUNT_INACTIVE' || error.id === 'ACCOUNT_NOT_FOUND')) return { ok: false, error: { code: error.id } }
    throw error
  }
}

async function checkRows(data: Database, store: ModelAccountStore, accountId: AccountId, modelIds: readonly ModelId[]): ReturnType<ModelAccountModule['checkBeforeRun']> {
  const rows = await readRows(data, store, accountId)
  return modelIds.every((modelId) => rows.some((row) => row.provider === providerOf(modelId)))
    ? { ok: true, result: undefined } : { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } }
}

async function heldFor(store: ModelAccountStore, openRun: OpenRun, modelId: ModelId) {
  const provider = providerOf(modelId)
  if (!provider) return { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } } as const
  return openRun(async (proof) => store.hold(proof, provider))
}

async function modelFor(store: ModelAccountStore, google: GoogleModelRuntime, refresh: ReturnType<typeof createCredentialRefresh>, persist: (held: HeldAccount, next: Credential) => Promise<Result<Persisted, Readonly<{ code: FailureCode }>>>, openRun: OpenRun, call: Readonly<{ modelId: ModelId; thinkingLevel: ThinkingLevel | null }>): ReturnType<ModelAccountModule['modelFor']> {
  const held = await heldFor(store, openRun, call.modelId)
  if (!held.ok) return held
  const access = { held: held.result, thinkingLevel: call.thinkingLevel,
    refresh: () => refresh.current(openRun, held.result), persist: (next: Credential) => persist(held.result, next) }
  const model = await nativeModel({ access, modelId: call.modelId, google })
  return { ok: true, result: { model, modelAccountId: held.result.row.modelAccountId } }
}

export async function createModelAccountModule({ data, envelope, defaultThinkingLevel, googleAiPro }: ModelAccountDependencies): Promise<ModelAccountModule> {
  const store = createModelAccountStore(envelope)
  const persist = (held: HeldAccount, next: Credential) => data.system('model-account', async (gate) => store.persist(await admitSystem(gate, 'model-account'), held, next))
  const refresh = createCredentialRefresh(store, persist)
  const writeBack = createRefreshWriteBack()
  const google = googleAiPro ? await startGoogle(googleAiPro, writeBack.persistFor) : null
  const googleModel = { url: google?.url ?? null, track: writeBack.track }
  const list = async (accountId: AccountId) => entriesOf(await readRows(data, store, accountId))
  const offers = async (accountId: AccountId) => offersFor((await readRows(data, store, accountId)).filter((row) => row.provider !== 'google-ai-pro' || google !== null).map((row) => row.provider))
  return Object.freeze({
    modelFor: (openRun, call) => modelFor(store, googleModel, refresh, persist, openRun, call),
    checkBeforeRun: (accountId, modelIds) => checkRows(data, store, accountId, modelIds),
    readDefault: (accountId, role) => data.read(accountId, async (gate) => {
      const { tx } = await admitAccount(gate)
      const stored = await tx.maybe(DefaultRow, sql`SELECT model_id FROM model.installation_default WHERE role = ${role}`)
      return stored ? parseModelId(stored.model_id) : null
    }),
    list, offers,
    registerRoutes: (app) => registerModelAccountRoutes(app, { list, offers, defaultThinkingLevel,
      write: (input) => writeCredential(data, store, input), connect: (input) => connectCredential(data, store, input),
      ...(google ? { googleAiPro: google.pool } : {}) }),
    jobs: google ? [{ name: 'idle-cliproxy', everyMs: MINUTE_MS, run: (signal) => google.pool.sweepIdle(signal) }] : [],
    close: () => google?.close() ?? Promise.resolve(),
  })
}
