import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-application-registry-build-'))
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`BUILDER_APPLICATION_REGISTRY_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)

const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createApplicationArtifactStore } = await import(built('registry/application-artifact-store.js'))

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const CHANGE_ID = '33333333-3333-4333-8333-333333333333'
const REVISION_ID = '44444444-4444-4444-8444-444444444444'
const SOURCE_REVISION = 'a'.repeat(40)
const TEMPLATE_REF = 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6'
const RECIPE_SHA256 = '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97'

const fileBytes = Buffer.from('<!doctype html><title>Proof</title>')
const fileSha256 = createHash('sha256').update(fileBytes).digest('hex')
const compiledApplication = Object.freeze({
  projectId: PROJECT_ID,
  changeId: CHANGE_ID,
  sourceRevision: SOURCE_REVISION,
  templateRef: TEMPLATE_REF,
  recipeSha256: RECIPE_SHA256,
  files: Object.freeze([Object.freeze({
    path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes: fileBytes,
    sha256: fileSha256,
  })]),
})

const metadataRow = (payload) => ({
  artifact_revision_id: REVISION_ID,
  artifact_digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  project_id: PROJECT_ID,
  source_revision: SOURCE_REVISION,
  profile: 'REACT_VITE_V1',
  template_ref: TEMPLATE_REF,
  recipe_sha256: RECIPE_SHA256,
  entry_path: 'index.html',
  files: payload.files.map(({ path, mediaType, byteLength, sha256 }) => ({ path, mediaType, byteLength, sha256 })),
})

test('application artifact adapter retains a copied manifest and exposes immutable metadata', async () => {
  const calls = []
  const client = {
    async query(statement, values) {
      calls.push({ statement, values })
      const payload = JSON.parse(values[4])
      return { command: 'SELECT', rowCount: 1, oid: 0, fields: [], rows: [metadataRow(payload)] }
    },
  }
  const store = createApplicationArtifactStore()
  const result = await store.retainApplication(client, { accountId: ACCOUNT_ID, compiled: compiledApplication })

  assert.equal(calls.length, 1)
  assert.match(calls[0].statement, /reg\.retain_application\(\$1, \$2, \$3, \$4, \$5::jsonb\)/)
  assert.deepEqual(calls[0].values.slice(0, 4), [ACCOUNT_ID, PROJECT_ID, CHANGE_ID, SOURCE_REVISION])
  assert.deepEqual(result, {
    artifactRevisionId: REVISION_ID,
    artifactDigest: metadataRow(JSON.parse(calls[0].values[4])).artifact_digest,
    projectId: PROJECT_ID,
    sourceRevision: SOURCE_REVISION,
    profile: 'REACT_VITE_V1',
    templateRef: TEMPLATE_REF,
    recipeSha256: RECIPE_SHA256,
    entryPath: 'index.html',
    files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', byteLength: fileBytes.byteLength, sha256: fileSha256 }],
  })
  assert.notEqual(calls[0].values[4], undefined)
  fileBytes[0] = 0
  assert.equal(JSON.parse(calls[0].values[4]).files[0].base64, Buffer.from('<!doctype html><title>Proof</title>').toString('base64'))
})

test('application artifact adapter rejects an unadmitted read with the stable subject refusal', async () => {
  const client = { async query() { throw new Error('APPLICATION_SUBJECT_REFUSED') } }
  const store = createApplicationArtifactStore()
  await assert.rejects(
    store.getApplication(client, { accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, sourceRevision: SOURCE_REVISION }),
    /APPLICATION_SUBJECT_REFUSED/,
  )
})

test('application artifact adapter refuses a malformed query response envelope', async () => {
  const client = { async query() { return { rows: null } } }
  const store = createApplicationArtifactStore()
  await assert.rejects(
    store.getApplication(client, { accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, sourceRevision: SOURCE_REVISION }),
    /APPLICATION_ARTIFACT_RESPONSE_REFUSED/,
  )
})

test('application artifact adapter refuses malformed metadata paths and media types', async () => {
  const malformedRows = [
    { ...metadataRow({ files: [{ path: '../index.html', mediaType: 'text/html; charset=utf-8', byteLength: fileBytes.byteLength, sha256: fileSha256 }] }),
      files: [{ path: '../index.html', mediaType: 'text/html; charset=utf-8', byteLength: fileBytes.byteLength, sha256: fileSha256 }] },
    { ...metadataRow({ files: [{ path: 'index.html', mediaType: 'text/plain; charset=utf-8', byteLength: fileBytes.byteLength, sha256: fileSha256 }] }),
      files: [{ path: 'index.html', mediaType: 'text/plain; charset=utf-8', byteLength: fileBytes.byteLength, sha256: fileSha256 }] },
    { ...metadataRow({ files: [{ path: `${'a'.repeat(1022)}.html`, mediaType: 'text/html; charset=utf-8', byteLength: fileBytes.byteLength, sha256: fileSha256 }] }),
      files: [{ path: `${'a'.repeat(1022)}.html`, mediaType: 'text/html; charset=utf-8', byteLength: fileBytes.byteLength, sha256: fileSha256 }] },
  ]
  const store = createApplicationArtifactStore()
  for (const row of malformedRows) {
    const client = { async query() { return { rows: [row] } } }
    await assert.rejects(
      store.getApplication(client, { accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, sourceRevision: SOURCE_REVISION }),
      /APPLICATION_ARTIFACT_RESPONSE_REFUSED/,
    )
  }
})

test('application artifact adapter refuses file response scope and hash mismatches', async () => {
  const row = {
    artifact_revision_id: REVISION_ID,
    project_id: PROJECT_ID,
    source_revision: SOURCE_REVISION,
    path: 'index.html',
    media_type: 'text/html; charset=utf-8',
    bytes: Uint8Array.from(fileBytes),
    sha256: '0'.repeat(64),
  }
  const store = createApplicationArtifactStore()
  await assert.rejects(
    store.readApplicationFile({ async query() { return { rows: [row] } } }, {
      accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, sourceRevision: SOURCE_REVISION,
      artifactRevisionId: REVISION_ID, path: 'index.html',
    }),
    /APPLICATION_ARTIFACT_RESPONSE_REFUSED/,
  )
  await assert.rejects(
    store.readApplicationFile({ async query() { return { rows: [{ ...row, project_id: ACCOUNT_ID, sha256: fileSha256 }] } } }, {
      accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, sourceRevision: SOURCE_REVISION,
      artifactRevisionId: REVISION_ID, path: 'index.html',
    }),
    /APPLICATION_ARTIFACT_RESPONSE_SCOPE_REFUSED/,
  )
})
