import type { AccountId, ModelAccountId, ModelAccountEntry, OfferedModel, ThinkingLevel } from '@conexus/contract'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { FastifyInstance } from 'fastify'
import type { Database } from '../../../../apps/hub/src/platform/db.js'
import type { GoogleAiProRuntimeConfig } from '../../../../apps/hub/src/platform/config.js'
import type { Job } from '../../../../apps/hub/src/platform/jobs.js'
import type { Credential, ModelId, ModelRole } from './credential.js'
import type { Result, WaveFailure } from './dependencies.js'
import type { OpenRun, HeldAccount, Persisted } from './store.js'
import type { SecretEnvelope } from './secrets.js'
export type ModelAccountModule = Readonly<{
  modelFor(openRun: OpenRun, call: Readonly<{ modelId: ModelId; thinkingLevel: ThinkingLevel | null }>): Promise<Result<Readonly<{ model: MastraModelConfig; modelAccountId: ModelAccountId }>, WaveFailure>>
  checkBeforeRun(accountId: AccountId, modelIds: readonly ModelId[]): Promise<Result<void, WaveFailure>>
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
export declare function createModelAccountModule(dependencies: ModelAccountDependencies): Promise<ModelAccountModule>
// Native provider leaves are concrete functions, not an injected parallel routing engine.
export type NativeCredentialAccess = Readonly<{
  held: HeldAccount
  refresh(): Promise<Result<Credential, WaveFailure>>
  persist(next: Credential): Promise<Result<Persisted, WaveFailure>>
}>
export declare function nativeModel(access: NativeCredentialAccess, modelId: ModelId): Promise<MastraModelConfig>
