import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const build = mkdtempSync(resolve(root, 'apps/hub/builder-brain-context-build-'))
test.after(() => rmSync(build, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
], { cwd: root, encoding: 'utf8' })
assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
const { createBrainStore } = await import(pathToFileURL(resolve(build, 'brain/store.js')).href)
const { formatBrainContext } = await import(pathToFileURL(resolve(build, 'builder/runtime.js')).href)

const projectId = '22222222-2222-4222-8222-222222222222'
const source = {
  schemaVersion: 'conexus-brain/v1',
  reviewText: 'Accepted Metal Nobre partner commission rule.',
  knowledgeBrowse: { domains: [{ domainRef: 'sales', label: 'Sales', concepts: [
    { conceptRef: 'partner-commission', label: 'Comissão dos parceiros', summary: 'Regra Metal Nobre para comissão dos parceiros.',
      contentClasses: ['KNOWLEDGE'], sections: [{ kind: 'BUSINESS_RULES', text: 'Parceiros recebem 12% de comissão sobre vendas líquidas.' }],
      provenanceRefs: ['metal-nobre://commercial-policy/commission/v1'] },
  ] }] },
}

const basis = {
  project_id: projectId,
  brain_revision_id: '33333333-3333-4333-8333-333333333333',
  brain_digest: 'a'.repeat(64),
  revision_source_revision: 'b'.repeat(40),
  revision_payload: source,
}

const makeStore = (basisRows = [basis]) => {
  const calls = []
  const client = {
    async query(statement) {
      calls.push(String(statement))
      if (/^(BEGIN READ ONLY|COMMIT|ROLLBACK)$/.test(String(statement))) return { rows: [] }
      if (String(statement).includes('brn.get_project_brain_basis')) return { rows: basisRows }
      throw new Error(`UNEXPECTED_QUERY:${statement}`)
    },
    release() {},
  }
  return {
    calls,
    store: createBrainStore({ pool: { connect: async () => client, end: async () => {} }, registry: {} }),
  }
}

test('Project Brain search uses the bound revision and preserves provenance', async () => {
  const { calls, store } = makeStore()
  const result = await store.readProjectKnowledge({ accountId: '11111111-1111-4111-8111-111111111111', projectId, query: 'regra de comissão dos parceiros' })
  assert.equal(result.status, 'FOUND')
  assert.equal(result.value.brainRevisionId, basis.brain_revision_id)
  assert.equal(result.value.brainDigest, basis.brain_digest)
  assert.deepEqual(result.value.matches, [{
    conceptRef: 'partner-commission', label: 'Comissão dos parceiros',
    text: 'BUSINESS_RULES: Parceiros recebem 12% de comissão sobre vendas líquidas.',
    provenanceRefs: ['metal-nobre://commercial-policy/commission/v1'],
  }])
  assert.equal(calls.some((statement) => statement.includes('project.project')), false)
})

test('Brain search distinguishes a known empty result from a missing bound revision', async () => {
  const empty = makeStore()
  const emptyResult = await empty.store.readProjectKnowledge({ accountId: 'account', projectId, query: 'inventory' })
  assert.deepEqual(emptyResult, { status: 'FOUND', value: { brainRevisionId: basis.brain_revision_id, brainDigest: basis.brain_digest, matches: [] } })
  const missing = makeStore([])
  assert.deepEqual(await missing.store.readProjectKnowledge({ accountId: 'account', projectId, query: 'inventory' }), { status: 'NOT_FOUND' })
})

test('runtime Brain context is explicit for one match, ambiguity and a gap', () => {
  const one = formatBrainContext({ status: 'FOUND', value: {
    brainRevisionId: basis.brain_revision_id, brainDigest: basis.brain_digest,
    matches: [{ conceptRef: 'rule', label: 'Commission', text: '12% on net sales.', provenanceRefs: ['proof://rule'] }],
  } })
  assert.match(one, /12% on net sales/)
  assert.match(one, /proof:\/\/rule/)
  assert.match(one, /preserve its provenance/)
  assert.match(formatBrainContext({ status: 'FOUND', value: {
    brainRevisionId: basis.brain_revision_id, brainDigest: basis.brain_digest,
    matches: [
      { conceptRef: 'one', label: 'One', text: 'one', provenanceRefs: [] },
      { conceptRef: 'two', label: 'Two', text: 'two', provenanceRefs: [] },
    ],
  } }), /multiple possible matches/)
  assert.match(formatBrainContext({ status: 'FOUND', value: { brainRevisionId: basis.brain_revision_id, brainDigest: basis.brain_digest, matches: [] } }), /Do not invent business rules/)
})
