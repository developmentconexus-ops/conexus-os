import { z } from 'zod'
import type { ProjectId } from '@conexus/contract'

export const AllocationKind = z.enum(['PREVIEW', 'PUBLISHED'])
export type AllocationKind = z.output<typeof AllocationKind>

const PreviewCoordinates = z.object({
  schema: z.string().brand<'PreviewSchema'>(),
  runtimeRole: z.string().brand<'PreviewRuntimeRole'>(),
  migrationRole: z.string().brand<'PreviewMigrationRole'>(),
}).readonly()
const PublishedCoordinates = z.object({
  schema: z.string().brand<'PublishedSchema'>(),
  runtimeRole: z.string().brand<'PublishedRuntimeRole'>(),
  migrationRole: z.string().brand<'PublishedMigrationRole'>(),
}).readonly()

export type PreviewAllocation = Readonly<{ kind: 'PREVIEW'; projectId: ProjectId }> & z.output<typeof PreviewCoordinates>
export type PublishedAllocation = Readonly<{ kind: 'PUBLISHED'; projectId: ProjectId }> & z.output<typeof PublishedCoordinates>
export type Allocation = PreviewAllocation | PublishedAllocation

export function allocate(input: Readonly<{ projectId: ProjectId; kind: 'PREVIEW' }>): PreviewAllocation
export function allocate(input: Readonly<{ projectId: ProjectId; kind: 'PUBLISHED' }>): PublishedAllocation
export function allocate(input: Readonly<{ projectId: ProjectId; kind: AllocationKind }>): Allocation
export function allocate(input: Readonly<{ projectId: ProjectId; kind: AllocationKind }>): Allocation {
  const hex = input.projectId.replaceAll('-', '').toLowerCase()
  const suffix = input.kind === 'PREVIEW' ? 'preview' : 'published'
  const coordinates = {
    schema: `p_${hex}_${suffix}`,
    runtimeRole: `app_${hex}_${suffix}_rt`,
    migrationRole: `app_${hex}_${suffix}_mig`,
  }
  return input.kind === 'PREVIEW'
    ? Object.freeze({ projectId: input.projectId, kind: 'PREVIEW', ...PreviewCoordinates.parse(coordinates) })
    : Object.freeze({ projectId: input.projectId, kind: 'PUBLISHED', ...PublishedCoordinates.parse(coordinates) })
}
