import { z } from 'zod'
import { ApplicationFilePath, ArtifactDigest, ArtifactRevisionId, MediaType, Sha256, SourceRevision, type ProjectId } from '@conexus/contract'
import { CURRENT_TEMPLATE_PIN } from './application-template-pins.js'
import { Failure } from '../platform/failure.js'
import { sql, type Sql, type TxQueries } from '../platform/db.js'
import type { Admitted, ApplicationScope, Checked, ProjectScope } from '../identity-access/public.js'

export type ApplicationFile = Readonly<{ path: ApplicationFilePath; mediaType: MediaType; sha256: Sha256; bytes: Uint8Array }>
export type ServedManifest = Readonly<{ artifactRevisionId: ArtifactRevisionId; files: ReadonlyArray<Readonly<{ path: ApplicationFilePath; mediaType: MediaType }>> }>
export type ServedLaunch = Readonly<{ sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; digest: ArtifactDigest; entryPath: 'index.html'; files: ServedManifest['files'] }>
export type PreviewManifest = Readonly<{ sourceRevision: SourceRevision; entryPath: 'index.html'; files: ServedManifest['files'] }>
export type ServedThumbnail = Readonly<{ artifactRevisionId: ArtifactRevisionId; bytes: Uint8Array }>
export type ServedFile =
  | Readonly<{ ok: true; artifactRevisionId: ArtifactRevisionId; file: ApplicationFile }>
  | Readonly<{ ok: false; reason: 'NOT_FOUND'; artifactRevisionId: ArtifactRevisionId }>
  | Readonly<{ ok: false; reason: 'NOT_SERVED' }>

const ManifestFiles = z.array(z.object({ path: ApplicationFilePath, mediaType: MediaType }))
const FileColumns = { path: ApplicationFilePath, media_type: MediaType, sha256: Sha256, bytes: z.instanceof(Uint8Array) }

/**
 * The Project's served pointer joined to the revision it names, in one statement: one snapshot, so a
 * purge between the pointer and the revision can never read as a broken pointer. It answers NONE
 * (no pointer, or no working state left), BROKEN (a pointer no revision of the Project matches),
 * MISSING (the revision lacks what the reader joined to it) or SERVED.
 */
function pointerStatement(projectId: ProjectId, { columns, joins, absent }: Readonly<{ columns: Sql; joins: Sql; absent: Sql }>): Sql {
  return sql`
  SELECT CASE
      WHEN working.last_preview_artifact_revision_id IS NULL THEN 'NONE'
      WHEN revision.artifact_revision_id IS NULL THEN 'BROKEN'
      WHEN ${absent} THEN 'MISSING'
      ELSE 'SERVED'
    END AS state,
    revision.artifact_revision_id AS revision_id, ${columns}
  FROM builder.project_working_state AS working
  LEFT JOIN reg.artifact_revision AS revision
    ON revision.project_id = working.project_id
    AND revision.artifact_revision_id = working.last_preview_artifact_revision_id
    AND revision.source_revision = working.last_preview_source_revision
    AND revision.digest = working.last_preview_artifact_digest
  ${joins}
  WHERE working.project_id = ${projectId}`
}

function pointerRow<S extends z.ZodRawShape>(served: S) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('NONE') }),
    z.object({ state: z.literal('BROKEN') }),
    z.object({ state: z.literal('MISSING'), revision_id: ArtifactRevisionId }),
    z.object({ state: z.literal('SERVED'), revision_id: ArtifactRevisionId, ...served }),
  ])
}

const FILES_OF_REVISION = sql`(SELECT jsonb_agg(jsonb_build_object('path', value->>'path', 'mediaType', value->>'mediaType')
  ORDER BY value->>'path' COLLATE "C") FROM jsonb_array_elements(revision.payload->'files') AS files_list(value))`

function fileOf(path: ApplicationFilePath): Readonly<{ columns: Sql; joins: Sql; absent: Sql }> {
  return {
  columns: sql`file->>'path' AS path, file->>'mediaType' AS media_type, file->>'sha256' AS sha256, decode(file->>'base64', 'base64') AS bytes`,
  joins: sql`LEFT JOIN LATERAL jsonb_path_query_first(revision.payload, '$.files[*] ? (@.path == $path)', jsonb_build_object('path', ${path}::text)) AS file ON true`,
    absent: sql`file IS NULL`,
  }
}

function brokenPointer(): Failure {
  return new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'SERVED_POINTER_BROKEN' } })
}

export async function readManifest(proof: Checked<ApplicationScope>): Promise<ServedManifest | null> {
  const { tx, scope } = proof
  const projectId = scope.projectId
  const row = await tx.maybe(pointerRow({ files: ManifestFiles }), pointerStatement(projectId, { columns: sql`${FILES_OF_REVISION} AS files`, joins: sql``, absent: sql`FALSE` }))
  if (row === null || row.state === 'NONE') return null
  if (row.state !== 'SERVED') throw brokenPointer()
  return { artifactRevisionId: row.revision_id, files: row.files }
}

type FileRead =
  | Readonly<{ kind: 'NONE' }>
  | Readonly<{ kind: 'MISSING'; artifactRevisionId: ArtifactRevisionId }>
  | Readonly<{ kind: 'FILE'; artifactRevisionId: ArtifactRevisionId; file: ApplicationFile }>

async function readFile(tx: TxQueries, projectId: ProjectId, path: ApplicationFilePath): Promise<FileRead> {
  const row = await tx.maybe(pointerRow(FileColumns), pointerStatement(projectId, fileOf(path)))
  if (row === null || row.state === 'NONE') return { kind: 'NONE' }
  if (row.state === 'BROKEN') throw brokenPointer()
  if (row.state === 'MISSING') return { kind: 'MISSING', artifactRevisionId: row.revision_id }
  return { kind: 'FILE', artifactRevisionId: row.revision_id, file: { path: row.path, mediaType: row.media_type, sha256: row.sha256, bytes: row.bytes } }
}

export async function readServedFileOf(proof: Checked<ApplicationScope>, path: ApplicationFilePath): Promise<ServedFile> {
  const { tx, scope } = proof
  const projectId = scope.projectId
  const read = await readFile(tx, projectId, path)
  if (read.kind === 'NONE') return { ok: false, reason: 'NOT_SERVED' }
  return read.kind === 'MISSING' ? { ok: false, reason: 'NOT_FOUND', artifactRevisionId: read.artifactRevisionId } : { ok: true, artifactRevisionId: read.artifactRevisionId, file: read.file }
}

const LaunchColumns = {
  source_revision: SourceRevision,
  digest: ArtifactDigest,
  entry_path: z.literal('index.html'),
  profile: z.string(),
  template_ref: z.string(),
  recipe_sha256: Sha256,
  files: ManifestFiles,
}

export async function readLaunchOf(proof: Admitted<ProjectScope<'project.build'>>): Promise<ServedLaunch | null> {
  const { tx, scope } = proof
  const projectId = scope.projectId
  const row = await tx.maybe(pointerRow(LaunchColumns), pointerStatement(projectId, {
    columns: sql`revision.source_revision AS source_revision, revision.digest AS digest, revision.payload->>'entryPath' AS entry_path,
      revision.payload->>'profile' AS profile, revision.payload->>'templateRef' AS template_ref, revision.payload->>'recipeSha256' AS recipe_sha256, ${FILES_OF_REVISION} AS files`,
    joins: sql``,
    absent: sql`FALSE`,
  }))
  if (row === null || row.state === 'NONE') return null
  if (row.state !== 'SERVED') throw brokenPointer()
  if (row.profile !== CURRENT_TEMPLATE_PIN.profile || row.template_ref !== CURRENT_TEMPLATE_PIN.templateRef || row.recipe_sha256 !== CURRENT_TEMPLATE_PIN.recipeSha256) return null
  return { sourceRevision: row.source_revision, artifactRevisionId: row.revision_id, digest: row.digest, entryPath: row.entry_path, files: row.files }
}

export async function readThumbnailOf(proof: Admitted<ProjectScope<'project.read'>, 'read'>): Promise<ServedThumbnail | null> {
  const { tx, scope } = proof
  const projectId = scope.projectId
  const row = await tx.maybe(pointerRow({ bytes: z.instanceof(Uint8Array) }), pointerStatement(projectId, {
    columns: sql`thumbnail.bytes AS bytes`,
    joins: sql`LEFT JOIN reg.application_thumbnail AS thumbnail ON thumbnail.artifact_revision_id = revision.artifact_revision_id`,
    absent: sql`thumbnail.artifact_revision_id IS NULL`,
  }))
  if (row === null || row.state === 'NONE' || row.state === 'MISSING') return null
  if (row.state === 'BROKEN') throw brokenPointer()
  return { artifactRevisionId: row.revision_id, bytes: row.bytes }
}

const PreviewFileRow = z.object(FileColumns)
const PreviewManifestRow = z.object({ source_revision: SourceRevision, entry_path: z.literal('index.html'), files: ManifestFiles })

const CURRENT_PIN = sql`revision.payload->>'profile' = ${CURRENT_TEMPLATE_PIN.profile} AND revision.payload->>'templateRef' = ${CURRENT_TEMPLATE_PIN.templateRef}
      AND revision.payload->>'recipeSha256' = ${CURRENT_TEMPLATE_PIN.recipeSha256}`

/** The manifest of one revision of the Project on the current template pin, by its id: what a Preview of it serves. */
export async function readPreviewManifestOf(proof: Checked<ProjectScope<'project.read'>>, artifactRevisionId: ArtifactRevisionId): Promise<PreviewManifest | null> {
  const { tx, scope } = proof
  const row = await tx.maybe(PreviewManifestRow, sql`
    SELECT revision.source_revision, revision.payload->>'entryPath' AS entry_path, ${FILES_OF_REVISION} AS files
    FROM reg.artifact_revision AS revision
    WHERE revision.project_id = ${scope.projectId} AND revision.artifact_revision_id = ${artifactRevisionId} AND ${CURRENT_PIN}`)
  return row === null ? null : { sourceRevision: row.source_revision, entryPath: row.entry_path, files: row.files }
}

export async function readPreviewFileOf(proof: Checked<ProjectScope<'project.read'>>, input: Readonly<{ sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; path: ApplicationFilePath }>): Promise<ApplicationFile | null> {
  const { tx, scope } = proof
  const row = await tx.maybe(PreviewFileRow, sql`
    SELECT file->>'path' AS path, file->>'mediaType' AS media_type, file->>'sha256' AS sha256, decode(file->>'base64', 'base64') AS bytes
    FROM reg.artifact_revision AS revision
    CROSS JOIN LATERAL jsonb_path_query_first(revision.payload, '$.files[*] ? (@.path == $path)', jsonb_build_object('path', ${input.path}::text)) AS file
    WHERE revision.project_id = ${scope.projectId} AND revision.artifact_revision_id = ${input.artifactRevisionId} AND revision.source_revision = ${input.sourceRevision}
      AND ${CURRENT_PIN} AND file IS NOT NULL`)
  return row === null ? null : { path: row.path, mediaType: row.media_type, sha256: row.sha256, bytes: row.bytes }
}
