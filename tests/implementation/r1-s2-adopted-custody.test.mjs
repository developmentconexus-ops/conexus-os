import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { canonicalBytes, verifyS2Plan } from '../../scripts/check-r1-s2-migration.mjs'
import { buildManifest } from '../../scripts/record-r1-s2-receipt.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const phases = ['S2-P0', 'S2-P1', 'S2-P2', 'S2-P3', 'S2-P4']
const archiveRoot = 'docs/evidence/4f/s2-p0-reopen-v1'
const withoutEnvelope = (record) => {
  const value = structuredClone(record)
  delete value.planDigest
  delete value.validationDigest
  delete value.previousPartPassDigest
  return value
}
const verifyAdopted = (root = repositoryRoot) => verifyS2Plan({
  repositoryRoot: root,
  currentPart: 'S2-P5',
  requireValidation: true,
})

test('S2 v4 custody adopts one exact pinned lineage', () => {
  const verified = verifyAdopted()
  assert.equal(verified.verdict, 'PASS')
  assert.equal(verified.adopting, true)
  assert.equal(verified.planDigest, '957ec2ecd76886fd4b3ffb960e16b8130cfc41744a06d733946180a48d35cc79')
  assert.equal(verified.validationDigest, 'a3b75d5f2d0cfcc7f9d5cb4a3de17434ce3be248496982978b3b0645fd5d433c')
})

test('S2 v4 translated P0-P4 payloads equal their archived v1 subjects', () => {
  for (const part of phases) {
    const live = JSON.parse(readFileSync(resolve(repositoryRoot, `runtime/r1/.conexus/${part.toLowerCase()}-pass.json`)))
    const archived = JSON.parse(readFileSync(resolve(repositoryRoot, archiveRoot, `${part.slice(3).toLowerCase()}-pass.json`)))
    assert.equal(canonicalBytes(withoutEnvelope(live)).equals(canonicalBytes(withoutEnvelope(archived))), true, part)
  }
})

test('S2 receipt classifies generated descendants and refuses missing or overlapping authority', () => {
  const plan = verifyAdopted().plan
  const manifest = buildManifest(plan)
  const executableSources = manifest.entries.filter(({ path }) => plan.sourceRefs.some((entry) => entry.path === path) && !path.startsWith('docs/'))
  assert.ok(executableSources.length > 0)
  assert.equal(executableSources.every(({ class: ownerClass }) => ownerClass === 'PLATFORM-CONTRACT'), true)
  const generated = manifest.entries.filter(({ path }) => path.startsWith('apps/hub/public/'))
  assert.ok(generated.length > 0)
  assert.equal(generated.every(({ class: ownerClass }) => ownerClass === 'GENERATED'), true)
  const candidate = generated[0].path

  const missing = structuredClone(plan)
  missing.generatedRoots = []
  assert.throws(() => buildManifest(missing), (error) => error.message === `S2_RECEIPT_UNCLASSIFIED:${candidate}`)

  const duplicate = structuredClone(plan)
  duplicate.generatedRoots.push(structuredClone(duplicate.generatedRoots[0]))
  assert.throws(() => buildManifest(duplicate), (error) => error.message === `S2_RECEIPT_GENERATED_ROOT_OVERLAP:${candidate}`)

  const conflicting = structuredClone(plan)
  conflicting.addedPaths.push({ path: candidate, class: 'PLATFORM-CONTRACT', mutationWindows: ['S2-P5'], currentDigest: '0'.repeat(64) })
  assert.throws(() => buildManifest(conflicting), (error) => error.message === `S2_RECEIPT_CLASS_OVERLAP:${candidate}`)
})

test('S2 v4 custody RED controls refuse every protected class', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-s2-v2-custody-red-'))
  try {
    cpSync(repositoryRoot, fixture, {
      recursive: true,
      filter: (source) => !['.git', 'node_modules', '.wireframe-preview'].includes(source.split(/[\\/]/).at(-1)),
    })

    const assertDrift = (path, pattern) => {
      const target = resolve(fixture, ...path.split('/'))
      const bytes = readFileSync(target)
      writeFileSync(target, Buffer.concat([bytes, Buffer.from('\n')]))
      assert.throws(() => verifyAdopted(fixture), pattern)
      writeFileSync(target, bytes)
    }

    assertDrift('apps/hub/migrations/001_iam_foundation.sql', /S2_DIGEST_MISMATCH:apps\/hub\/migrations\/001_iam_foundation\.sql/)
    assertDrift('scripts/record-r1-s2-part-pass.mjs', /S2_DIGEST_MISMATCH:scripts\/record-r1-s2-part-pass\.mjs/)
    assertDrift(`${archiveRoot}/plan.json`, /S2_DIGEST_MISMATCH:docs\/evidence\/4f\/s2-p0-reopen-v1\/plan\.json/)
    assertDrift('apps/hub/src/workspace/module.ts', /S2_DIGEST_MISMATCH:apps\/hub\/src\/workspace\/module\.ts/)
    assertDrift('apps/hub/public/index.html', /S2_GENERATED_ROOT_DRIFT:apps\/hub\/public/)

    const unlisted = resolve(fixture, 'apps/hub/src/unlisted.ts')
    mkdirSync(resolve(fixture, 'apps/hub/src'), { recursive: true })
    writeFileSync(unlisted, 'export {}\n')
    assert.throws(() => verifyAdopted(fixture), /S2_UNLISTED_PATH:apps\/hub\/src\/unlisted\.ts/)
    rmSync(unlisted)

    const validation = resolve(fixture, 'runtime/r1/.conexus/s2-migration-plan-validation.json')
    const value = JSON.parse(readFileSync(validation))
    value.planDigest = '0'.repeat(64)
    writeFileSync(validation, canonicalBytes(value))
    assert.throws(() => verifyAdopted(fixture), /S2_VALIDATION_SUBJECT_REFUSED/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
