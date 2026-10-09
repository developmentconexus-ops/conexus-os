import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ArtifactDigest, ArtifactRevisionId, SourceRevision, type BuilderRunId, type ProjectId } from '@conexus/contract'
import type { Admitted, RunOwner, SystemScope } from '../identity-access/public.js'
import { sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import type { SealedApplication } from './seal.js'
import { contentsOf } from './seal.js'

const RunSource = z.object({ state: z.literal('RUNNING'), owner_id: z.string(), candidate_revision: SourceRevision.nullable(), result_source_revision: SourceRevision.nullable() })
const Stored = z.object({ artifact_revision_id: ArtifactRevisionId, digest: ArtifactDigest })

function transitionRefused(): Failure {
  return new Failure('BUILDER_RUN_TRANSITION_REFUSED', { details: { transition: 'build settlement' } })
}

/**
 * Writes the already admitted candidate in its held run's settlement transaction.
 */
export async function retain({ tx }: Admitted<SystemScope<'builder-executor'>>, input: Readonly<{ builderRunId: BuilderRunId; projectId: ProjectId; owner: RunOwner; sealed: SealedApplication }>): Promise<Readonly<{ artifactRevisionId: ArtifactRevisionId; digest: ArtifactDigest }>> {
  const { builderRunId, projectId, owner, sealed } = input
  const run = await tx.maybe(RunSource, sql`
    SELECT state, owner_id::text AS owner_id, candidate_revision, result_source_revision FROM builder.builder_run WHERE builder_run_id = ${builderRunId} AND project_id = ${projectId}`)
  if (sealed.projectId !== projectId || run?.owner_id !== owner.ownerId || run.candidate_revision !== sealed.sourceRevision || run.result_source_revision !== sealed.sourceRevision) throw transitionRefused()
  const { payloadJson, thumbnail } = contentsOf(sealed)
  const inserted = await tx.maybe(Stored, sql`
    INSERT INTO reg.artifact_revision (artifact_revision_id, project_id, source_revision, digest, payload)
    VALUES (${ArtifactRevisionId.parse(randomUUID())}, ${projectId}, ${sealed.sourceRevision}, ${sealed.digest}, ${payloadJson}::jsonb)
    ON CONFLICT (project_id, source_revision) DO NOTHING
    RETURNING artifact_revision_id, digest`)
  const stored = inserted ?? await tx.one(Stored, sql`
    SELECT artifact_revision_id, digest FROM reg.artifact_revision WHERE project_id = ${projectId} AND source_revision = ${sealed.sourceRevision}`, 'INTERNAL_UNEXPECTED')
  if (stored.digest !== sealed.digest) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'ARTIFACT_IDENTITY_CONFLICT' } })
  if (thumbnail !== null) {
    await tx.run(sql`
      INSERT INTO reg.application_thumbnail (artifact_revision_id, media_type, bytes, byte_length, sha256)
      SELECT revision.artifact_revision_id, 'image/png', ${thumbnail.bytes}::bytea, ${thumbnail.bytes.byteLength}, ${thumbnail.sha256}
      FROM reg.artifact_revision AS revision WHERE revision.artifact_revision_id = ${stored.artifact_revision_id} AND revision.project_id = ${projectId}
      ON CONFLICT DO NOTHING`)
  }
  return { artifactRevisionId: stored.artifact_revision_id, digest: stored.digest }
}

export async function purge({ tx }: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void> {
  await tx.run(sql`DELETE FROM reg.artifact_revision WHERE project_id = ${projectId}`)
}
