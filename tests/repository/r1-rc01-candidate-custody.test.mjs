import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))

test('RC-01 binds one exact candidate and only the three ratified ownership classes', () => {
  const profile = readJson('profiles/r1/v1/rc01-candidate-custody.json')
  const inventory = readJson(profile.candidateInventory)
  const manifest = readJson(profile.ownershipManifest)
  const receipt = readJson(profile.generationReceipt)
  assert.equal(inventory.subjectTreeDigest, manifest.subjectTreeDigest)
  assert.equal(manifest.subjectTreeDigest, receipt.subjectTreeDigest)
  assert.deepEqual(Object.keys(manifest.classCounts).sort(), ['GENERATED', 'PLATFORM-CONTRACT'])
  assert.equal(manifest.classCounts['APP-OWNED'] ?? 0, 0)
  assert.deepEqual(receipt.operationsCensus, profile.operations)
  assert.equal(receipt.operationsCensus.length, 13)
  assert.equal(receipt.rbC0Frozen, true)
  assert.deepEqual(receipt.laterTranchesStarted, [])
  assert.equal(inventory.summary.excludedPreservedPathCount, profile.excludedPreChangePaths.length)
  assert.ok(inventory.prechangeEntries.some(entry => entry.path === '.wireframe-preview/gf01.html' && entry.disposition === 'EXCLUDED_PRESERVED_ORIGINAL_WORKTREE'))
})
