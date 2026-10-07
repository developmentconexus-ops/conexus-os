import { z } from 'zod'
import type { AccountId, ModelAccountId, ModelLoginId, ModelAccountProvider, ThinkingLevel } from '@conexus/contract'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { Credential, CredentialKind, MODEL_PROVIDERS, ParsedModelId, RouterPrefix, ModelRole } from './credential.js'
import type { Result, WaveFailure, ModelAccountRunCode } from './dependencies.js'
import type { OpenRun } from './store.js'
export const SignInState = z.discriminatedUnion('state', [
  z.object({ state: z.literal('waiting') }), z.object({ state: z.literal('succeeded') }),
  z.object({ state: z.literal('expired') }),
  z.object({ state: z.literal('refused'), code: z.enum(['MODEL_LOGIN_ANTHROPIC_REFUSED', 'MODEL_LOGIN_OPENAI_REFUSED', 'MODEL_LOGIN_GOOGLE_REFUSED', 'INSTALLATION_ADMINISTRATOR_REQUIRED', 'ACCOUNT_INACTIVE']) }),
])
export type SignInState = z.output<typeof SignInState>
export type StartHandoff =
  | Readonly<{ flow: 'paste-code'; loginId: ModelLoginId; url: string; deadlineAt: string }>
  | Readonly<{ flow: 'device-code'; loginId: ModelLoginId; url: string; code: string; deadlineAt: string; intervalMs: number }>
  | Readonly<{ flow: 'callback-paste'; loginId: ModelLoginId; url: string; deadlineAt: string }>
export type FlowInput = Readonly<{ flow: 'device-code' }> | Readonly<{ flow: 'paste-code' | 'callback-paste'; code: string }>
export type StartedSignIn = Readonly<{
  handoff: StartHandoff
  advance(input: FlowInput): Promise<Result<Readonly<{ state: 'waiting' }> | Readonly<{ state: 'credential'; credential: Credential }>, WaveFailure>>
  close(): Promise<void>
}>
export type SignInTarget = Readonly<{ scope: 'personal' | 'installation'; credentialKind: CredentialKind }>
export type ConnectedAccount = Readonly<{ state: 'connected'; kind: CredentialKind['kind']; needsSignIn: boolean; connectedBy: Readonly<{ accountId: AccountId; displayName: string }>; connectedAt: string }> | Readonly<{ state: 'absent' }>
export type AccountInUse = Readonly<{ source: 'personal' | 'installation'; kind: CredentialKind['kind'] }> | Readonly<{ source: 'none' }>
type Registry = typeof MODEL_PROVIDERS
type Kind<P extends ModelAccountProvider> = { [K in keyof Registry[P]['kinds']]: Readonly<{ kind: K; flow: Registry[P]['kinds'][K] extends { flow: infer F } ? F : never }> }[keyof Registry[P]['kinds']]
export type ModelAccountEntry = { [P in ModelAccountProvider]: Readonly<{ provider: P; providerName: string; available: boolean; kinds: readonly Kind<P>[]; personal: ConnectedAccount; installation: ConnectedAccount; inUse: AccountInUse }> }[ModelAccountProvider]
export type OfferedModel = Readonly<{ id: ParsedModelId['routerId']; provider: RouterPrefix; providerName: string; modelName: string; thinkingLevels: readonly ThinkingLevel[]; paidBy: 'personal' | 'installation'; needsSignIn: boolean }>
export type ModelAccountModule = Readonly<{
  modelFor(openRun: OpenRun, call: Readonly<{ modelId: ParsedModelId; thinkingLevel: ThinkingLevel | null }>): Promise<Result<Readonly<{ model: MastraModelConfig; modelAccountId: ModelAccountId }>, WaveFailure>>
  checkBeforeRun(accountId: AccountId, modelIds: readonly ParsedModelId[]): Promise<Result<void, Readonly<{ code: ModelAccountRunCode }>>>
  readDefault(accountId: AccountId, role: ModelRole): Promise<ParsedModelId | null>
  list(accountId: AccountId): Promise<readonly ModelAccountEntry[]>
  offers(accountId: AccountId): Promise<readonly OfferedModel[]>
  start(input: Readonly<{ accountId: AccountId; target: SignInTarget }>): Promise<StartHandoff>
  advance(input: Readonly<{ accountId: AccountId; loginId: ModelLoginId; input: FlowInput }>): Promise<SignInState>
  close(): Promise<void>
}>
