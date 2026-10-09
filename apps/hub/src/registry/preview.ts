import { z } from 'zod'
import { ArtifactDigest, ArtifactRevisionId, ProjectId, SourceRevision } from '@conexus/contract'
import type { Admitted, ProjectScope, WorkspaceScope } from '../identity-access/public.js'
import { Failure } from '../platform/failure.js'
import { sql } from '../platform/db.js'
import { pointerRow, pointerStatement } from './served.js'

const PreviewSubject = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('EMPTY') }).readonly(),
  z.object({ kind: z.literal('READY'), sourceRevision: SourceRevision, artifactRevisionId: ArtifactRevisionId, digest: ArtifactDigest }).readonly(),
])
export type PreviewSubject = z.infer<typeof PreviewSubject>

export async function readPreviewSubject(proof: Admitted<ProjectScope<'project.read'>, 'read'>): Promise<PreviewSubject> {
  const row = await proof.tx.maybe(pointerRow({ source_revision: SourceRevision, digest: ArtifactDigest }), pointerStatement(proof.scope.projectId, {
    columns: sql`revision.source_revision, revision.digest`, joins: sql``, absent: sql`FALSE`,
  }))
  if (row === null || row.state === 'NONE') return { kind: 'EMPTY' }
  if (row.state !== 'SERVED') throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'SERVED_POINTER_BROKEN' } })
  return { kind: 'READY', sourceRevision: row.source_revision, artifactRevisionId: row.revision_id, digest: row.digest }
}

export async function readPreviewPresence({ tx }: Admitted<WorkspaceScope<'workspace.read'>, 'read'>, projectIds: readonly ProjectId[]): Promise<readonly ProjectId[]> {
  const rows = await tx.rows(z.object({ project_id: ProjectId }), sql`
    SELECT project_id FROM reg.project_preview WHERE project_id = ANY(${projectIds}::uuid[])`)
  return rows.map((row) => row.project_id)
}
