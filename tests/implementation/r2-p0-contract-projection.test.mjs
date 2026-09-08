import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { CANDIDATE_GRAPH } from '../../scripts/conexus-verify.mjs'
import { assertGeneratedBytes } from '../../scripts/generate-r2-contracts.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubTarget = resolve(repositoryRoot, 'apps/hub/src/generated/r2-routes.ts')
const webTarget = resolve(repositoryRoot, 'apps/web/src/generated/r2-client.ts')
const r1Targets = [
  resolve(repositoryRoot, 'apps/hub/src/generated/s1-routes.ts'),
  resolve(repositoryRoot, 'apps/hub/src/generated/s2-routes.ts'),
  resolve(repositoryRoot, 'apps/hub/src/generated/s3-routes.ts'),
]
const expectedOwners = [
  'BRN-01', 'BRN-02', 'BRN-03', 'BRN-10', 'BRN-14',
  'CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07', 'CON-08', 'CON-09',
  'PRJ-10', 'PRJ-11', 'PRJ-12', 'PRJ-13', 'PRJ-14', 'PRJ-15',
]

test('R2-P0 projects exactly the authorized 20 operations and preserves R1 output', () => {
  const before = Object.fromEntries(r1Targets.map((path) => [path, digest(readFileSync(path))]))
  const projectionDigests = new Set()
  for (const target of [hubTarget, webTarget]) {
    const generated = readFileSync(target, 'utf8')
    assert.deepEqual([...generated.matchAll(/ownerId":"([^"]+)/g)].map((match) => match[1]), expectedOwners)
    assert.doesNotMatch(generated, /GW-0[12]|BRN-0[4-9]|PRJ-(?:16|29)|BLD-|executeOperation|operationSlug/)
    const sourceDigests = JSON.parse(generated.match(/R2_SOURCE_DIGESTS = Object\.freeze\((\{[^\n]+\})\)/)?.[1] ?? '')
    assert.equal(Object.keys(sourceDigests).length, 7)
    for (const digestValue of Object.values(sourceDigests)) assert.match(digestValue, /^[a-f0-9]{64}$/)
    projectionDigests.add(generated.match(/R2_(?:ROUTE|CLIENT)_PROJECTION_DIGEST = "([a-f0-9]{64})"/)?.[1])
  }
  assert.deepEqual([...projectionDigests], ['1981f48968b5ee451fe1dd6bbbf64d01cbffe0f7a3d1e8767d60b6c25f899fd4'])
  assert.deepEqual(Object.fromEntries(r1Targets.map((path) => [path, digest(readFileSync(path))])), before)
})

test('R2-P0 check rejects editable generated-output drift', () => {
  const original = readFileSync(webTarget, 'utf8')
  assert.throws(() => assertGeneratedBytes(`${original}// unauthorized drift\n`, original, 'R2_GENERATED_WEB_DRIFT'), /R2_GENERATED_WEB_DRIFT/)
  assert.doesNotThrow(() => assertGeneratedBytes(original, original, 'R2_GENERATED_WEB_DRIFT'))
})

test('R2-P0 remains a required verification property', () => {
  const scopes = CANDIDATE_GRAPH.map(entry => entry.scope)
  const r2P0Index = scopes.indexOf('r2-p0-check')
  const repositoryIndex = scopes.indexOf('repository-check')
  assert.notEqual(r2P0Index, -1)
  assert.ok(r2P0Index < repositoryIndex)
})

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
