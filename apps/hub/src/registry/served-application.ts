import { z } from 'zod'
import { AccountId } from '../../../../packages/contract/dist/index.js'
import { sql, type Database } from '../platform/db.js'

/** The artifact an application host serves, as its manifest: the paths and their media types. */
type ServedApplication = Readonly<{
  artifactRevisionId: string
  files: readonly Readonly<{ path: string; mediaType: string }>[]
}>

type ServedApplicationFile = Readonly<{ path: string; mediaType: string; bytes: Uint8Array; sha256: string }>

/** One page or asset: nothing served (or no access), a served artifact without the file, or the file. */
type ServedFileRead =
  | Readonly<{ kind: 'NOT_SERVED' }>
  | Readonly<{ kind: 'NOT_FOUND'; artifactRevisionId: string }>
  | Readonly<{ kind: 'FILE'; artifactRevisionId: string; file: ServedApplicationFile }>

type ServedApplicationThumbnail = Readonly<{
  artifactRevisionId: string
  mediaType: 'image/png'
  bytes: Uint8Array
  sha256: string
}>

export type ServedApplicationReader = Readonly<{
  /** The served manifest, for an API request that runs its server tree. */
  served(input: Readonly<{ accountId: string; projectId: string }>): Promise<ServedApplication | null>
  /** A page or asset of whatever is served now, in one read. */
  readServedFile(input: Readonly<{ accountId: string; projectId: string; path: string }>): Promise<ServedFileRead>
  /** One file of a pinned revision, while it is still the one served. */
  readFile(input: Readonly<{ accountId: string; projectId: string; artifactRevisionId: string; path: string }>): Promise<ServedApplicationFile | null>
  /** The captured build thumbnail for whatever is served now, if present and matching the served revision. */
  readThumbnail(input: Readonly<{ accountId: string; projectId: string }>): Promise<ServedApplicationThumbnail | null>
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
const thumbnailRow = z.object({
  artifact_revision_id: uuid,
  media_type: z.literal('image/png'),
  bytes: z.instanceof(Uint8Array),
  byte_length: z.number().int().positive().max(512000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export const createServedApplicationReader = (database: Pick<Database, 'read'>): ServedApplicationReader => Object.freeze({
  async served({ accountId, projectId }) {
    const account = AccountId.safeParse(accountId)
    if (!account.success || !uuid.safeParse(projectId).success) return null
    const row = await database.read(account.data, (tx) => tx.maybe(servedRow,
      sql`SELECT artifact_revision_id, files FROM reg.get_served_application(${accountId}, ${projectId})`))
    if (!row) return null
    return { artifactRevisionId: row.artifact_revision_id, files: row.files }
  },
  async readServedFile({ accountId, projectId, path }) {
    const account = AccountId.safeParse(accountId)
    if (!account.success || !uuid.safeParse(projectId).success) return { kind: 'NOT_SERVED' }
    const row = await database.read(account.data, (tx) => tx.maybe(fileRow,
      sql`SELECT artifact_revision_id, path, media_type, bytes, sha256 FROM reg.read_served_application_file(${accountId}, ${projectId}, ${null}, ${path})`))
    if (!row) return { kind: 'NOT_SERVED' }
    if (row.path === null) return { kind: 'NOT_FOUND', artifactRevisionId: row.artifact_revision_id }
    return { kind: 'FILE', artifactRevisionId: row.artifact_revision_id, file: { path: row.path, mediaType: row.media_type, bytes: row.bytes, sha256: row.sha256 } }
  },
  async readFile({ accountId, projectId, artifactRevisionId, path }) {
    const account = AccountId.safeParse(accountId)
    if (!account.success || !uuid.safeParse(projectId).success || !uuid.safeParse(artifactRevisionId).success) return null
    const row = await database.read(account.data, (tx) => tx.maybe(fileRow,
      sql`SELECT artifact_revision_id, path, media_type, bytes, sha256 FROM reg.read_served_application_file(${accountId}, ${projectId}, ${artifactRevisionId}, ${path})`))
    if (!row) return null
    return row.path === null ? null : { path: row.path, mediaType: row.media_type, bytes: row.bytes, sha256: row.sha256 }
  },
  async readThumbnail({ accountId, projectId }) {
    const account = AccountId.safeParse(accountId)
    if (!account.success || !uuid.safeParse(projectId).success) return null
    const row = await database.read(account.data, (tx) => tx.maybe(thumbnailRow,
      sql`SELECT artifact_revision_id, media_type, bytes, byte_length, sha256 FROM reg.get_application_thumbnail(${accountId}, ${projectId})`))
    if (!row) return null
    return {
      artifactRevisionId: row.artifact_revision_id,
      mediaType: row.media_type,
      bytes: row.bytes,
      sha256: row.sha256,
    }
  },
})
