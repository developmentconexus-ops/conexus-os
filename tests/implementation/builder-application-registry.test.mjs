import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createApplicationArtifactStore } = await import(hubModuleUrl('registry/application-artifact-store.js'))

const accountId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const executionId = '33333333-3333-4333-8333-333333333333'
const revisionId = '44444444-4444-4444-8444-444444444444'
const sourceRevision = 'a'.repeat(40)
const templateRef = '537fnzf4c16x9d7oz21k:449fd9f1-3b61-4c88-9a06-fd61bbfb4060'
const recipeSha256 = '4ce6f3a6b1233edb4a3f8741751239c7d43bf70c0b8e75318106ac08543ab05d'
const bytes = Buffer.from('<!doctype html><title>Proof</title>')
const file = { path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
const metadata = (payload) => ({ artifact_revision_id: revisionId, artifact_digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), project_id: projectId, source_revision: sourceRevision, profile: 'REACT_VITE_V2', template_ref: templateRef, recipe_sha256: recipeSha256, entry_path: 'index.html', files: [{ path: 'index.html', mediaType: file.mediaType, byteLength: bytes.byteLength, sha256: file.sha256 }] })
const application = { projectId, executionId, sourceRevision, templateRef, recipeSha256, files: [file] }

test('C-020 Registry adapter uses executionId retention and immutable source reads', async () => {
  const calls = []
  const client = { async query(statement, values) {
    calls.push({ statement, values })
    if (statement.includes('read_application_file_by_source')) return { rows: [{ artifact_revision_id: revisionId, project_id: projectId, source_revision: sourceRevision, path: 'index.html', media_type: file.mediaType, bytes, sha256: file.sha256 }] }
    return { rows: [metadata(JSON.parse(values[4] ?? JSON.stringify({ files: [] })))] }
  } }
  const store = createApplicationArtifactStore()
  await store.retainApplication(client, { accountId, compiled: application })
  assert.match(calls[0].statement, /reg\.retain_application_execution\(/)
  assert.deepEqual(calls[0].values.slice(0, 4), [accountId, projectId, executionId, sourceRevision])
  await store.getApplicationBySource(client, { accountId, projectId, sourceRevision })
  assert.match(calls[1].statement, /reg\.get_application_by_source\(/)
  await store.readApplicationFileBySource(client, { accountId, projectId, sourceRevision, artifactRevisionId: revisionId, path: 'index.html' })
  assert.match(calls[2].statement, /reg\.read_application_file_by_source\(/)
  assert.doesNotMatch(calls.map((call) => call.statement).join('\n'), /changeId|reg\.(retain_application|get_application|read_application_file)\(/)
})

test('a stored application on any template but the current one is refused on read, and a new one must carry the current template', async () => {
  const previous = { profile: 'REACT_VITE_V1', template_ref: '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189', recipe_sha256: '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf' }
  const calls = []
  const client = { async query(statement) { calls.push(statement); return { rows: [{ ...metadata({ files: [] }), ...previous }] } } }
  const store = createApplicationArtifactStore()
  await assert.rejects(store.getApplicationBySource(client, { accountId, projectId, sourceRevision }))
  await assert.rejects(store.retainApplication(client, { accountId, compiled: { ...application, templateRef: previous.template_ref, recipeSha256: previous.recipe_sha256 } }))
  assert.equal(calls.length, 1, 'the old template is refused before the database is asked')
})

test('a new application is retained as REACT_VITE_V2', async () => {
  const calls = []
  const client = { async query(_statement, values) { calls.push(values); return { rows: [metadata(JSON.parse(values[4]))] } } }
  const retained = await createApplicationArtifactStore().retainApplication(client, { accountId, compiled: application })
  assert.equal(retained.profile, 'REACT_VITE_V2')
  assert.equal(JSON.parse(calls[0][4]).profile, 'REACT_VITE_V2')
})
