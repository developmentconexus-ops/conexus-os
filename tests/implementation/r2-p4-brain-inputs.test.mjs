import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  parseBrainRealizationManifest,
  validateBrainSource,
  validateBrainHealth,
} from '../../packages/brain-contract/src/index.mjs'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { validateBrainSource as bootstrapSource, validateBrainHealth as bootstrapHealth } from '../../scripts/bootstrap-r2-brain.mjs'

const root = resolve(import.meta.dirname, '../..')
const build = mkdtempSync(resolve(root, 'apps/hub/r2-p4-brain-input-build-'))
process.once('exit', () => rmSync(build, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build], { encoding: 'utf8' })
assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
const { parseBrainRealization } = await import(pathToFileURL(resolve(build, 'project/brain-realization.js')).href)
const { createBrainStore } = await import(pathToFileURL(resolve(build, 'brain/store.js')).href)

const source = () => ({
  schemaVersion: 'conexus-brain/v2', reviewText: 'Synthetic reviewed meaning.',
  knowledgeBrowse: { domains: [{ domainRef: 'finance', label: 'Finance', concepts: [{
    conceptRef: 'budget-view', itemRef: 'budget', label: 'Budget', summary: 'Synthetic budget.',
    contentClasses: ['SEMANTIC'], sections: [{ kind: 'GRAIN', text: 'One document.' }], provenanceRefs: [],
  }] }] },
  items: [
    { itemId: 'budget', kind: 'SEMANTIC', dependsOn: ['documents'] },
    { itemId: 'documents', kind: 'DATASET', dependsOn: [], grainId: 'document' },
    { itemId: 'policy', kind: 'KNOWLEDGE', dependsOn: [] },
  ],
  assertions: [{ assertionId: 'document-key', itemId: 'documents', kind: 'KEY_CONFORMANCE',
    predicateVersion: '1', scope: 'SELECTED' }],
})
const health = () => ({ schemaVersion: 'conexus-brain-health/v1', items: source().items.map((item) => ({
  semanticRef: item.itemId, state: 'VALID', critical: true,
})) })
const manifest = () => ({ schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: ['budget'],
  mappings: [{ itemId: 'documents', queryId: 'registered-document-key', mappingDigest: 'a'.repeat(64) }],
  sourceInputs: [{ path: 'src/budget.ts', digest: 'b'.repeat(64) }],
})
const clone = (value) => structuredClone(value)

test('Brain v2 bootstrap and runtime share one parser while legacy v1 remains unchanged', () => {
  assert.equal(bootstrapSource, validateBrainSource)
  assert.equal(bootstrapHealth, validateBrainHealth)
  const input = source()
  assert.deepEqual(validateBrainSource(input), input)
  assert.deepEqual(validateBrainHealth(health(), input), health())
  const legacy = clone(input)
  legacy.schemaVersion = 'conexus-brain/v1'
  delete legacy.items
  delete legacy.assertions
  delete legacy.knowledgeBrowse.domains[0].concepts[0].itemRef
  assert.equal(validateBrainSource(legacy), legacy)
  assert.throws(() => parseBrainRealization(manifest(), legacy), /REALIZATION_REFUSED/)
})

test('bootstrap wires source-aware health validation before constructing its database client', () => {
  const code = readFileSync(resolve(root, 'scripts/bootstrap-r2-brain.mjs'), 'utf8')
  const joinedCall = /const health = validateBrainHealth\(decodeJsonFile\(healthPath, 'BRAIN_HEALTH_FILE_REFUSED', MAX_HEALTH_BYTES\), source\)/
  assert.match(code, joinedCall)
  assert.ok(code.search(joinedCall) < code.indexOf('const client = new pg.Client'))
  assert.doesNotMatch(code.replace(', source)\n  const canonicalBytes', ')\n  const canonicalBytes'), joinedCall)
})

test('Brain v2 rejects incomplete, ambiguous or unsupported semantic structure', () => {
  const changes = [
    (s) => { s.extra = true },
    (s) => { s.schemaVersion = 'conexus-brain/v3' },
    (s) => { s.items.push(clone(s.items[0])) },
    (s) => { s.items[0].kind = 'SQL' },
    (s) => { s.items[0].dependsOn = ['unknown'] },
    (s) => { s.items[1].dependsOn = ['budget'] },
    (s) => { s.items[0].dependsOn = ['documents', 'documents'] },
    (s) => { delete s.items[1].grainId },
    (s) => { s.items[0].grainId = 'wrong-kind' },
    (s) => { s.assertions = [] },
    (s) => { s.assertions[0].itemId = 'policy' },
    (s) => { s.assertions[0].kind = 'CALLER_PASS' },
    (s) => { s.assertions[0].predicateVersion = '2' },
    (s) => { delete s.assertions[0].scope },
    (s) => { s.assertions.push(clone(s.assertions[0])) },
    (s) => { s.knowledgeBrowse.domains[0].concepts[0].itemRef = 'unknown' },
    (s) => { s.items[0].itemId = 'x'.repeat(257) },
    (s) => { s.items[0].itemId = ' budget' },
    (s) => { s.items[0].itemId = 'budget\n' },
    (s) => { s.reviewText = 'x'.repeat(1_048_576) },
  ]
  for (const change of changes) {
    const input = source()
    change(input)
    assert.throws(() => validateBrainSource(input), /BRAIN_SOURCE_REFUSED/, change.toString())
  }
})

test('v2 refuses accessor-based records and validates the admitted maximum dependency depth', () => {
  const accessor = source()
  Object.defineProperty(accessor.items[0], 'itemId', { enumerable: true, get: () => 'budget' })
  assert.throws(() => validateBrainSource(accessor), /BRAIN_SOURCE_REFUSED/)
  const deep = source()
  deep.knowledgeBrowse.domains = []
  deep.assertions = []
  deep.items = Array.from({ length: 2_048 }, (_, index) => ({ itemId: `item-${index}`, kind: 'GROUP',
    dependsOn: index === 2_047 ? [] : [`item-${index + 1}`] }))
  assert.deepEqual(validateBrainSource(deep), deep)
  deep.items[2_047].dependsOn.push('item-0')
  assert.throws(() => validateBrainSource(deep), /BRAIN_SOURCE_REFUSED/)
})

test('Brain v2 health coverage joins canonical items rather than browse coordinates', () => {
  for (const change of [
    (h) => { h.items.pop() },
    (h) => { h.items[0].semanticRef = 'budget-view' },
    (h) => { h.items.push(clone(h.items[0])) },
    (h) => { h.items[0].state = 'APPROVED' },
  ]) {
    const input = health()
    change(input)
    assert.throws(() => validateBrainHealth(input, source()), /BRAIN_HEALTH_REFUSED/)
  }
  const blocked = health()
  blocked.items[0].state = 'INVALID'
  assert.deepEqual(validateBrainHealth(blocked, source()), blocked) // Grammar success is not usability.
})

test('Project manifest derives dependency and assertion closure without inventing conformance', () => {
  const input = manifest()
  const parsed = parseBrainRealization(input, source())
  assert.deepEqual(parsed.applicableItemIds, ['budget', 'documents'])
  assert.deepEqual(parsed.requiredAssertions, source().assertions)
  assert.equal(parsed.inputDigest, sha256(canonicalBytes(input)))
  input.mappings[0].mappingDigest = 'f'.repeat(64)
  input.sourceInputs[0].digest = 'f'.repeat(64)
  assert.equal(parsed.manifest.mappings[0].mappingDigest, 'a'.repeat(64))
  assert.equal(parsed.manifest.sourceInputs[0].digest, 'b'.repeat(64))
  assert.equal(Object.isFrozen(parsed.manifest.sourceInputs), true)
  assert.equal('conformant' in parsed, false)
  assert.notEqual(parseBrainRealization(input, source()).inputDigest, parsed.inputDigest)
})

test('closed manifest identity is reusable without weakening Brain semantic closure', () => {
  const input = manifest()
  const parsedManifest = parseBrainRealizationManifest(input)
  assert.deepEqual(parsedManifest.manifest, input)
  assert.equal(parsedManifest.inputDigest, sha256(canonicalBytes(input)))
  assert.equal(Object.isFrozen(parsedManifest.manifest), true)
  const semanticallyForeign = manifest()
  semanticallyForeign.mappings[0].itemId = 'not-a-brain-dataset'
  assert.equal(parseBrainRealizationManifest(semanticallyForeign).manifest.mappings[0].itemId, 'not-a-brain-dataset')
  assert.throws(() => parseBrainRealization(semanticallyForeign, source()), /REALIZATION_REFUSED/)
})

test('empty selection never bypasses REVISION obligations and missing input never means empty', () => {
  const empty = { ...manifest(), selectedRoots: [], mappings: [], sourceInputs: [] }
  assert.deepEqual(parseBrainRealization(empty, source()).applicableItemIds, [])
  assert.throws(() => parseBrainRealization(undefined, source()), /REALIZATION_REFUSED/)
  const global = source()
  global.assertions[0].scope = 'REVISION'
  assert.throws(() => parseBrainRealization(empty, global), /REALIZATION_REFUSED/)
  const parsed = parseBrainRealization({ ...empty, mappings: manifest().mappings }, global)
  assert.equal(parsed.requiredAssertions.length, 1)
  assert.deepEqual(parsed.applicableItemIds, [])
})

test('Project rejects forged mappings, unsupported references and mutable authority fields', () => {
  const changes = [
    (m) => { m.sql = 'SELECT anything' },
    (m) => { m.selectedRoots = ['unknown'] },
    (m) => { m.selectedRoots.push('budget') },
    (m) => { m.mappings = [] },
    (m) => { m.mappings[0].itemId = 'policy' },
    (m) => { m.mappings[0].mappingDigest = 'not-a-digest' },
    (m) => { m.mappings[0].pass = true },
    (m) => { m.mappings.push(clone(m.mappings[0])) },
    (m) => { m.sourceInputs.push(clone(m.sourceInputs[0])) },
    ...['../source', '/source', 'src/../source', 'src\\source', '.git/config',
      '.conexus/project/brain-binding.json', '.conexus/brain/realization.json']
      .map((path) => (m) => { m.sourceInputs[0].path = path }),
  ]
  for (const change of changes) {
    const input = manifest()
    change(input)
    assert.throws(() => parseBrainRealization(input, source()), /REALIZATION_REFUSED/, change.toString())
  }
})

// Contract fixture for production Brain store, not live publication or PostgreSQL proof.
test('v2 Workspace reads strip typed internals and refuse unjoined current health', async () => {
  const payload = source()
  let healthItems = health().items
  let healthBrainDigest = 'digest'
  const client = {
    async query(sql) {
      if (sql.includes('iam.admit_brain_read')) return { rows: [{ workspace_id: 'workspace', can_read_brain: true }] }
      if (sql.includes('brn.get_brain_health')) return { rows: [{ brain_revision_id: 'revision', brain_digest: healthBrainDigest,
        health_snapshot_digest: 'health', items: healthItems }] }
      return { rows: [] }
    }, release() {},
  }
  const registryRevision = { brainRevisionId: 'revision', brainDigest: 'digest', sourceRevision: 'source',
    availability: 'AVAILABLE', payload }
  const store = createBrainStore({ pool: { connect: async () => client, end: async () => {} }, registry: {
    getWorkspaceBrain: async () => ({ workspaceId: 'workspace', publishedBrainRevisionId: 'revision' }),
    listBrainRevisions: async () => [registryRevision], getBrainRevision: async () => registryRevision,
  } })
  const args = { accountId: 'account', workspaceId: 'workspace', brainRevisionId: 'revision' }
  const read = await store.getBrainRevision(args)
  assert.equal(read.status, 'FOUND')
  assert.equal('itemRef' in read.value.knowledgeBrowse.domains[0].concepts[0], false)
  assert.equal('items' in read.value, false)
  assert.equal('assertions' in read.value, false)
  assert.equal((await store.getBrainHealth(args)).status, 'FOUND')
  healthItems = healthItems.slice(1)
  assert.equal((await store.getBrainHealth(args)).status, 'UNAVAILABLE')
  healthItems = health().items
  healthBrainDigest = 'foreign-digest'
  assert.equal((await store.getBrainHealth(args)).status, 'UNAVAILABLE')
})
