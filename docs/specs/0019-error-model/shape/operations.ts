import type { SourceManifest, ServerManifest, ServerFile, ServerTree, ValueSchema } from '../../../../apps/hub/src/app-runner/server-manifest.js'
import type { InvokeInput, OnDivergence } from '../../../../apps/hub/src/app-runner/supervisor.js'
import type { Result, ManifestRefusal, TreeRefusal, PrepareAnswer, InvokeAnswer, SchemaViolation } from './types.js'

export declare function admitManifest(value: unknown, stage: 'source'): Result<SourceManifest, ManifestRefusal>
export declare function admitManifest(value: unknown, stage: 'server'): Result<ServerManifest, ManifestRefusal>
export declare function admitServerTree(files: readonly ServerFile[], sha256: (bytes: Buffer) => string): Result<ServerTree, TreeRefusal | ManifestRefusal>
export declare function schemaViolation(schema: ValueSchema, value: unknown, echoUndeclared: boolean): SchemaViolation | null
export type Runner = Readonly<{
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[]; onDivergence: OnDivergence }>): Promise<PrepareAnswer>
  invoke(input: InvokeInput): Promise<InvokeAnswer>
  release(input: Readonly<{ projectId: string }>): Promise<void>
}>

// Existing module.call adapts node:http over the owner unix socket to native Response.
export declare function runnerCall(path: '/v1/prepare' | '/v1/invoke' | '/v1/release', body: unknown, signal?: AbortSignal): Promise<Response>
export type RunnerClient = Readonly<{
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[]; onDivergence: 'RESET' | 'REFUSE'; signal?: AbortSignal }>): Promise<PrepareAnswer>
  invoke(input: InvokeInput): Promise<InvokeAnswer>
  release(input: Readonly<{ projectId: string }>): Promise<void>
}>
