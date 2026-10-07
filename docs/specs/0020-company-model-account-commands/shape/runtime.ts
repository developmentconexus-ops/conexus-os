import type { ModelAccountId } from '@conexus/contract'
import type { Credential } from './credential.js'
import type { HeldAccount, OpenRun } from './store.js'
import type { WaveFailure, Result } from './dependencies.js'
import type { MastraModelConfig } from '@mastra/core/llm'
export type ModelBuilders = { [P in Credential['provider']]: { [K in Extract<Credential, { provider: P }>['kind']]:
  (credential: Extract<Credential, { provider: P; kind: K }>, openRun: OpenRun) => Promise<MastraModelConfig>
} }
export type OAuthCredential = Extract<Credential, { kind: 'oauth' }>
export declare function refresh(input: Readonly<{ held: HeldAccount; openRun: OpenRun; force: boolean }>): Promise<Result<Credential, WaveFailure>>
export declare function refreshAtProvider(credential: OAuthCredential): Promise<Result<OAuthCredential, WaveFailure>>
export type Generation = Readonly<{ modelAccountId: ModelAccountId; connectedAt: Date }>
export type GoogleCredential = Extract<Credential, { provider: 'google-ai-pro' }>
export type GoogleLease = Readonly<{ baseURL: string; ticket: string; release(): Promise<void> }>
export type AcquireError = Readonly<{ code: 'GOOGLE_AI_PRO_ROUTER_UNAVAILABLE'; reason: 'GENERATION_RETIRED' | 'ROUTER_UNAVAILABLE' }>
export type GoogleAiProPool = Readonly<{
  acquire(input: Readonly<{ generation: Generation; credential: GoogleCredential }>): Promise<Result<GoogleLease, AcquireError>>
  retire(generation: Generation): Promise<void>
  capture(): Promise<void>
  close(): Promise<void>
}>
