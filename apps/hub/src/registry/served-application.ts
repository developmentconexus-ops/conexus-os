import type { QueryResultRow } from 'pg'
import { z } from 'zod'
import type { PostgresPool } from '../platform/postgres.js'

/** The artifact an application host serves, as its manifest: the paths and their media types. */
export type ServedApplication = Readonly<{
  artifactRevisionId: string
  files: readonly Readonly<{ path: string; mediaType: string }>[]
}>

export type ServedApplicationFile = Readonly<{ path: string; mediaType: string; bytes: Uint8Array; sha256: string }>

/** One page or asset: nothing served (or no access), a served artifact without the file, or the file. */
export type ServedFileRead =
  | Readonly<{ kind: 'NOT_SERVED' }>
  | Readonly<{ kind: 'NOT_FOUND'; artifactRevisionId: string }>
  | Readonly<{ kind: 'FILE'; artifactRevisionId: string; file: ServedApplicationFile }>

export type ServedApplicationReader = Readonly<{
  /** The served manifest, for an API request that runs its server tree. */
  served(input: Readonly<{ accountId: string; projectId: string }>): Promise<ServedApplication | null>
  /** A page or asset of whatever is served now, in one read. */
  readServedFile(input: Readonly<{ accountId: string; projectId: string; path: string }>): Promise<ServedFileRead>
  /** One file of a pinned revision, while it is still the one served. */
  readFile(input: Readonly<{ accountId: string; projectId: string; artifactRevisionId: string; path: string }>): Promise<ServedApplicationFile | null>
}>

const uuid = z.uuid()
const servedRow = z.object({
  artifact_revision_id: uuid,
  files: z.array(z.object({ path: z.string().min(1).max(1024), mediaType: z.string().min(1) }).strict()).min(1),
}).strict()
const fileRow = z.union([
  z.object({ artifact_revision_id: uuid, path: z.null(), media_type: z.null(), bytes: z.null(), sha256: z.null() }).strict(),
  z.object({
    artifact_revision_id: uuid,
    path: z.string().min(1).max(1024),
    media_type: z.string().min(1),
    bytes: z.instanceof(Uint8Array),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
])
const READ_FILE_SQL = 'SELECT artifact_revision_id, path, media_type, bytes, sha256 FROM reg.read_served_application_file($1, $2, $3, $4)'

// Both reads are gated in the database by the Account's access to the application (a grant or a
// membership), not by Project visibility, and they read only the artifact the application serves.
export const createServedApplicationReader = (pool: PostgresPool): ServedApplicationReader => Object.freeze({
  async served({ accountId, projectId }) {
    if (!uuid.safeParse(accountId).success || !uuid.safeParse(projectId).success) return null
    const result = await pool.query<QueryResultRow>(
      'SELECT artifact_revision_id, files FROM reg.get_served_application($1, $2)', [accountId, projectId])
    if (!result.rows[0]) return null
    const row = servedRow.parse(result.rows[0])
    return { artifactRevisionId: row.artifact_revision_id, files: row.files }
  },
  async readServedFile({ accountId, projectId, path }) {
    if (!uuid.safeParse(accountId).success || !uuid.safeParse(projectId).success) return { kind: 'NOT_SERVED' }
    const result = await pool.query<QueryResultRow>(READ_FILE_SQL, [accountId, projectId, null, path])
    if (!result.rows[0]) return { kind: 'NOT_SERVED' }
    const row = fileRow.parse(result.rows[0])
    if (row.path === null) return { kind: 'NOT_FOUND', artifactRevisionId: row.artifact_revision_id }
    return { kind: 'FILE', artifactRevisionId: row.artifact_revision_id, file: { path: row.path, mediaType: row.media_type, bytes: row.bytes, sha256: row.sha256 } }
  },
  async readFile({ accountId, projectId, artifactRevisionId, path }) {
    if (!uuid.safeParse(accountId).success || !uuid.safeParse(projectId).success || !uuid.safeParse(artifactRevisionId).success) return null
    const result = await pool.query<QueryResultRow>(READ_FILE_SQL, [accountId, projectId, artifactRevisionId, path])
    if (!result.rows[0]) return null
    const row = fileRow.parse(result.rows[0])
    return row.path === null ? null : { path: row.path, mediaType: row.media_type, bytes: row.bytes, sha256: row.sha256 }
  },
})
