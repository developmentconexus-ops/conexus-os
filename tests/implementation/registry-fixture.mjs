import { createHash, randomUUID } from 'node:crypto'
import { query } from './hub-database.mjs'

export const seedRevision = async (connection, projectId, { sourceRevision, digest, payload = {} }) => {
  const revisionId = randomUUID()
  await query(connection, 'INSERT INTO reg.artifact_revision(artifact_revision_id, project_id, source_revision, digest, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [revisionId, projectId, sourceRevision, digest, JSON.stringify(payload)])
  return revisionId
}

export const seedRevisionThumbnail = async (connection, revisionId, bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1])) => {
  await query(connection, "INSERT INTO reg.application_thumbnail(artifact_revision_id, media_type, bytes, byte_length, sha256) VALUES ($1, 'image/png', $2, $3, $4)", [revisionId, bytes, bytes.byteLength, 'e'.repeat(64)])
}

export const CURRENT_PIN = { profile: 'REACT_VITE_V2', templateRef: '537fnzf4c16x9d7oz21k:3331a697-459d-44d8-bcdd-abade6ba1e81', recipeSha256: 'ce2a48f54c08ccdd7641fac8208560963cf43ecdc16bd459a3f333786d1ed4b5' }

export const launchablePayload = () => {
  const bytes = Buffer.from('<html></html>')
  return {
    format: 'application-payload-v1', ...CURRENT_PIN, entryPath: 'index.html',
    files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', byteLength: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') }],
  }
}
