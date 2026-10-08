import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { OWNER, setupBuilder } from './builder-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID } from './project-fixture.mjs'

const { createRegistryModule } = await import(hubModuleUrl('registry/module.js'))
const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))

export const seedRevision = async (connection, projectId, { sourceRevision, digest, payload = {} }) => {
  const revisionId = randomUUID()
  await query(connection, 'INSERT INTO reg.artifact_revision(artifact_revision_id, project_id, source_revision, digest, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [revisionId, projectId, sourceRevision, digest, JSON.stringify(payload)])
  return revisionId
}

export const seedRevisionThumbnail = async (connection, revisionId, bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1])) => {
  await query(connection, "INSERT INTO reg.application_thumbnail(artifact_revision_id, media_type, bytes, byte_length, sha256) VALUES ($1, 'image/png', $2, $3, $4)", [revisionId, bytes, bytes.byteLength, 'e'.repeat(64)])
}

export const CURRENT_PIN = { profile: 'REACT_VITE_V2', templateRef: '537fnzf4c16x9d7oz21k:419afad1-5af3-405c-9a52-3f6dc81dee5c', recipeSha256: 'aba3957596f114f821e290dd89416aba2fa1785fc34cb5162a899de759e84ffc' }

export const launchablePayload = () => {
  const bytes = Buffer.from('<html></html>')
  return {
    format: 'application-payload-v1', ...CURRENT_PIN, entryPath: 'index.html',
    files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', byteLength: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') }],
  }
}

export const OLD = { profile: 'REACT_VITE_V1', templateRef: '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189', recipeSha256: '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf' }
export const SOURCE_1 = 'a'.repeat(40)
export const SOURCE_2 = 'b'.repeat(40)
export const SOURCE_OLD = 'f'.repeat(40)
export const SOURCE_E = 'e'.repeat(40)
export const DIGEST_1 = 'c'.repeat(64)
export const DIGEST_2 = 'd'.repeat(64)
export const D_E = 'adae19f83e89cb00bc91fcc22fb07faf5ad7ad23a987dc8a423e4a5fd8b9434d'
export const SHA_F = 'b633a587c652d02386c4f16f8c6f6aab7352d97f16367c3c40576214372dd628'
export const PNG_T2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
export const SHA_T2 = '4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6'
export const PNG_T1 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])

export const fileOf = (path, mediaType, text) => {
  const bytes = Buffer.from(text)
  return { path, mediaType, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}
export const F = fileOf('index.html', 'text/html; charset=utf-8', '<html></html>')
export const payloadOf = (files, pin = CURRENT_PIN) => ({
  format: 'application-payload-v1', ...pin, entryPath: 'index.html',
  files: files.map((file) => ({ path: file.path, mediaType: file.mediaType, byteLength: file.bytes.byteLength, sha256: file.sha256, base64: Buffer.from(file.bytes).toString('base64') })),
})

export const world = async (t, prefix) => {
  const fixture = await setupBuilder(t, prefix)
  const { database, connection, seedRun } = fixture
  const registry = createRegistryModule({ database })
  const store = createBuilderStore({ database, ownerId: OWNER, registry })
  const grant = async (projectId, accountId = ID.outsider) => {
    await query(connection, 'INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [projectId, `app-${projectId.slice(0, 8)}`, ID.owner])
    await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, accountId, ID.owner])
  }
  const point = (projectId, revisionId, sourceRevision, digest) => query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1', [projectId, sourceRevision, revisionId, digest])
  const served = async (projectId) => {
    await grant(projectId)
    const first = await seedRevision(connection, projectId, { sourceRevision: SOURCE_1, digest: DIGEST_1, payload: payloadOf([F]) })
    const second = await seedRevision(connection, projectId, { sourceRevision: SOURCE_2, digest: DIGEST_2, payload: payloadOf([F]) })
    await point(projectId, second, SOURCE_2, DIGEST_2)
    return { first, second }
  }
  const rows = async (projectId) => (await query(connection, `SELECT
    (SELECT count(*)::integer FROM reg.artifact_revision WHERE project_id = $1) AS revisions,
    (SELECT count(*)::integer FROM reg.application_thumbnail WHERE artifact_revision_id IN (SELECT artifact_revision_id FROM reg.artifact_revision WHERE project_id = $1)) AS thumbnails`, [projectId])).rows[0]
  const pointer = async (projectId) => (await query(connection, 'SELECT last_preview_source_revision AS source, last_preview_artifact_revision_id AS revision, last_preview_artifact_digest AS digest FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0]
  const sealFor = (projectId, builderRunId, files, { sourceRevision = SOURCE_E, thumbnail = null } = {}) => registry.seal(
    { compiledApplication: { projectId, executionId: builderRunId, sourceRevision, templateRef: CURRENT_PIN.templateRef, recipeSha256: CURRENT_PIN.recipeSha256, files }, thumbnail },
    { projectId, builderRunId, sourceRevision },
  )
  const runFor = (projectId, options = {}) => seedRun(projectId, { state: 'RUNNING', candidate: SOURCE_E, result: SOURCE_E, ...options })
  const settle = (projectId, builderRunId, files = [F], { sourceRevision = SOURCE_E, thumbnail = null } = {}) =>
    store.settleBuilderRunBuild({ builderRunId, kind: 'BUILT', sealed: sealFor(projectId, builderRunId, files, { sourceRevision, thumbnail }) })
  return { ...fixture, registry, store, grant, point, served, rows, pointer, sealFor, runFor, settle }
}

export const invariant = (name) => (error) => {
  assert.equal(error.id, 'INTERNAL_UNEXPECTED')
  assert.equal(error.details?.invariant, name)
  return true
}


export const P = '33333333-3333-4333-8333-333333333333'
export const B = '44444444-4444-4444-8444-444444444444'

export function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
