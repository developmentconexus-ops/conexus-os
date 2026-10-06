import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ArtifactDigest, ArtifactRevisionId, SourceRevision, type ProjectId } from '../../../../packages/contract/dist/index.js'
import type { Admitted, RunScope, SystemScope } from '../identity-access/admission.js'
import { sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import type { SealedApplication } from '../platform/sealed-application.js'
import { contentsOf } from './seal.js'

const RunSource = z.object({ result_source_revision: SourceRevision.nullable() })
const Stored = z.object({ artifact_revision_id: ArtifactRevisionId, digest: ArtifactDigest })

function transitionRefused(): Failure {
  return new Failure('BUILDER_RUN_TRANSITION_REFUSED', { details: { transition: 'build settlement' } })
}

/**
 * Writes a sealed build and its thumbnail in the settlement transaction of the run that built it.
 * The Project and the source are the proof's and the run's, so a build sealed for another Project
 * or source is refused. A retry finds the first insert's revision and returns it.
 */
export async function retain({ tx, scope }: Admitted<RunScope>, sealed: SealedApplication): Promise<Readonly<{ artifactRevisionId: ArtifactRevisionId; digest: ArtifactDigest }>> {
  const run = await tx.maybe(RunSource, sql`
    SELECT result_source_revision FROM builder.builder_run WHERE builder_run_id = ${scope.builderRunId} AND project_id = ${scope.projectId}`)
  if (sealed.projectId !== scope.projectId || run?.result_source_revision !== sealed.sourceRevision) throw transitionRefused()
  const { payloadJson, thumbnail } = contentsOf(sealed)
  const inserted = await tx.maybe(Stored, sql`
    INSERT INTO reg.artifact_revision (artifact_revision_id, project_id, source_revision, digest, payload)
    VALUES (${ArtifactRevisionId.parse(randomUUID())}, ${scope.projectId}, ${sealed.sourceRevision}, ${sealed.digest}, ${payloadJson}::jsonb)
    ON CONFLICT (project_id, source_revision) DO NOTHING
    RETURNING artifact_revision_id, digest`)
  const stored = inserted ?? await tx.one(Stored, sql`
    SELECT artifact_revision_id, digest FROM reg.artifact_revision WHERE project_id = ${scope.projectId} AND source_revision = ${sealed.sourceRevision}`, 'INTERNAL_UNEXPECTED')
  if (stored.digest !== sealed.digest) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'ARTIFACT_IDENTITY_CONFLICT' } })
  if (thumbnail !== null) {
    await tx.run(sql`
      INSERT INTO reg.application_thumbnail (artifact_revision_id, media_type, bytes, byte_length, sha256)
      SELECT revision.artifact_revision_id, 'image/png', ${thumbnail.bytes}::bytea, ${thumbnail.bytes.byteLength}, ${thumbnail.sha256}
      FROM reg.artifact_revision AS revision WHERE revision.artifact_revision_id = ${stored.artifact_revision_id} AND revision.project_id = ${scope.projectId}
      ON CONFLICT DO NOTHING`)
  }
  return { artifactRevisionId: stored.artifact_revision_id, digest: stored.digest }
}

export async function purge({ tx }: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void> {
  await tx.run(sql`DELETE FROM reg.artifact_revision WHERE project_id = ${projectId}`)
}
