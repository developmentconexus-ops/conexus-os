import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const custodyPaths = [
  'scripts/record-r1-candidate-custody.mjs',
  'profiles/r1/v1/rc01-candidate-custody.json',
  'docs/evidence/rc01/rc01-candidate-inventory.json',
  'runtime/r1/.conexus/rc01-ownership-manifest.json',
  'runtime/r1/.conexus/rc01-generation-receipt.json',
]

function isolatedCustody(t) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'conexus-rc01-custody-'))
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }))
  for (const path of custodyPaths) {
    const destination = resolve(fixtureRoot, path)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(resolve(root, path), destination)
  }
  return fixtureRoot
}

test('RC-01 binds one exact candidate and only the three ratified ownership classes', () => {
  const profile = readJson('profiles/r1/v1/rc01-candidate-custody.json')
  const inventory = readJson(profile.candidateInventory)
  const manifest = readJson(profile.ownershipManifest)
  const receipt = readJson(profile.generationReceipt)
  assert.equal(profile.candidateCommit, '32adcd3157550807253af7977b3e3cce0eb38a74')
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

test('frozen RC-01 custody verifies without Git history or a candidate branch', t => {
  const fixtureRoot = isolatedCustody(t)
  const result = spawnSync(process.execPath, [resolve(fixtureRoot, 'scripts/record-r1-candidate-custody.mjs'), '--check'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /custody check passed \(frozen outputs=3\)/)
})

test('frozen RC-01 custody rejects internally drifted candidate entries', t => {
  const fixtureRoot = isolatedCustody(t)
  const inventoryPath = resolve(fixtureRoot, 'docs/evidence/rc01/rc01-candidate-inventory.json')
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
  inventory.candidateEntries[0].size += 1
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
  const result = spawnSync(process.execPath, [resolve(fixtureRoot, 'scripts/record-r1-candidate-custody.mjs'), '--check'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /RC01_INVENTORY_SUBJECT_DIGEST_DRIFT/)
})
