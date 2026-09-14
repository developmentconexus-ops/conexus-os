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
const compiled = spawnSync(process.execPath, [resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`BUILDER_APPLICATION_REGISTRY_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const { createApplicationArtifactStore } = await import(pathToFileURL(resolve(buildRoot, 'registry/application-artifact-store.js')).href)

const accountId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const executionId = '33333333-3333-4333-8333-333333333333'
const revisionId = '44444444-4444-4444-8444-444444444444'
const sourceRevision = 'a'.repeat(40)
const templateRef = 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6'
const recipeSha256 = '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97'
const bytes = Buffer.from('<!doctype html><title>Proof</title>')
const file = { path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
const metadata = (payload) => ({ artifact_revision_id: revisionId, artifact_digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), project_id: projectId, source_revision: sourceRevision, profile: 'REACT_VITE_V1', template_ref: templateRef, recipe_sha256: recipeSha256, entry_path: 'index.html', files: [{ path: 'index.html', mediaType: file.mediaType, byteLength: bytes.byteLength, sha256: file.sha256 }] })
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
