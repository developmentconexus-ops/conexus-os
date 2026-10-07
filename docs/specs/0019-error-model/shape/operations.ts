import type { SourceManifest, ServerManifest, ServerFile, ServerTree } from '../../../../apps/hub/src/app-runner/server-manifest.js'
import type { InvokeInput, OnDivergence } from '../../../../apps/hub/src/app-runner/supervisor.js'
import type { Result, ManifestRefusal, TreeRefusal, PrepareAnswer } from './types.js'

export declare function admitManifest(value: unknown, stage: 'source'): Result<SourceManifest, ManifestRefusal>
export declare function admitManifest(value: unknown, stage: 'server'): Result<ServerManifest, ManifestRefusal>
export declare function admitServerTree(files: readonly ServerFile[], sha256: (bytes: Buffer) => string): Result<ServerTree, TreeRefusal | ManifestRefusal>
export type Runner = Readonly<{
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[]; onDivergence: OnDivergence }>): Promise<PrepareAnswer>
  invoke(input: InvokeInput): Promise<Response>
  release(input: Readonly<{ projectId: string }>): Promise<void>
}>
