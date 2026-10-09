import { z } from 'zod'
import { ProjectId, ArtifactDigest, ArtifactRevisionId, SourceRevision } from '@conexus/contract'

const identity = { projectId: ProjectId }
export const PreviewAllocation = z.strictObject({
  kind: z.literal('PREVIEW'), ...identity,
  schema: z.string().regex(/^p_[0-9a-f]{32}_preview$/).brand<'PreviewSchema'>(),
  runtimeRole: z.string().regex(/^app_[0-9a-f]{32}_preview_rt$/).brand<'PreviewRuntimeRole'>(),
  migrationRole: z.string().regex(/^app_[0-9a-f]{32}_preview_mig$/).brand<'PreviewMigrationRole'>(),
}).readonly()
export const PublishedAllocation = z.strictObject({
  kind: z.literal('PUBLISHED'), ...identity,
  schema: z.string().regex(/^p_[0-9a-f]{32}_published$/).brand<'PublishedSchema'>(),
  runtimeRole: z.string().regex(/^app_[0-9a-f]{32}_published_rt$/).brand<'PublishedRuntimeRole'>(),
  migrationRole: z.string().regex(/^app_[0-9a-f]{32}_published_mig$/).brand<'PublishedMigrationRole'>(),
}).readonly()
export type PreviewAllocation = z.infer<typeof PreviewAllocation>
export type PublishedAllocation = z.infer<typeof PublishedAllocation>
export type Allocation = PreviewAllocation | PublishedAllocation

export function allocate(input: Readonly<{ projectId: ProjectId; kind: 'PREVIEW' }>): PreviewAllocation
export function allocate(input: Readonly<{ projectId: ProjectId; kind: 'PUBLISHED' }>): PublishedAllocation
export function allocate(input: Readonly<{ projectId: ProjectId; kind: Allocation['kind'] }>): Allocation {
  const hex = input.projectId.replaceAll('-', '')
  const suffix = input.kind === 'PREVIEW' ? 'preview' : 'published'
  const value = { ...input, schema: `p_${hex}_${suffix}`, runtimeRole: `app_${hex}_${suffix}_rt`, migrationRole: `app_${hex}_${suffix}_mig` }
  return input.kind === 'PREVIEW' ? PreviewAllocation.parse(value) : PublishedAllocation.parse(value)
}

export const PreviewSubject = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('EMPTY') }).readonly(),
  z.strictObject({ kind: z.literal('READY'), sourceRevision: SourceRevision, artifactRevisionId: ArtifactRevisionId, digest: ArtifactDigest }).readonly(),
])
export type PreviewSubject = z.infer<typeof PreviewSubject>
