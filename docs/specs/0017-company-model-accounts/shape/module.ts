import type { WaveFailure } from './dependencies.js'
import type { AccountId, ModelAccountId, ModelAccountEntry, OfferedModel, ThinkingLevel } from '@conexus/contract'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { Credential, ParsedModelId, ModelRole } from './credential.js'
import type { Result } from './dependencies.js'
import type { OpenRun } from './store.js'
export type ModelBuilders = { [P in Credential['provider']]: { [K in Extract<Credential, { provider: P }>['kind']]:
  (credential: Extract<Credential, { provider: P; kind: K }>, openRun: OpenRun) => Promise<MastraModelConfig>
} }
export type ModelAccountModule = Readonly<{
  modelFor(openRun: OpenRun, call: Readonly<{ modelId: ParsedModelId; thinkingLevel: ThinkingLevel | null }>): Promise<Result<Readonly<{ model: MastraModelConfig; modelAccountId: ModelAccountId }>, WaveFailure>>
  checkBeforeRun(accountId: AccountId, modelIds: readonly ParsedModelId[]): Promise<Result<void, WaveFailure>>
  readDefault(accountId: AccountId, role: ModelRole): Promise<ParsedModelId | null>
  list(accountId: AccountId): Promise<readonly ModelAccountEntry[]>
  offers(accountId: AccountId): Promise<readonly OfferedModel[]>
  close(): Promise<void>
}>
