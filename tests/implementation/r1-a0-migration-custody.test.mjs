import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { canonicalBytes, sha256, verifyBootstrap } from '../../scripts/check-r1-a0-bootstrap.mjs'
import { validateMigrationPlan } from '../../scripts/check-r1-a0-migration.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const planPath = resolve(repositoryRoot, 'profiles/r1/v1/a0-code-architecture-migration.json')

test('A0 migration plan is canonical and its exact baseline is independently green', () => {
  const bytes = readFileSync(planPath)
  const plan = JSON.parse(bytes)
  assert.deepEqual(bytes, canonicalBytes(plan))
  assert.deepEqual(validateMigrationPlan(), {
    verdict: 'PASS',
    planDigest: sha256(bytes),
    scopedPaths: 60,
    transitions: 2,
  })
})

test('bootstrap digest control fires on one changed byte', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-a0-red-'))
  try {
    const plan = JSON.parse(readFileSync(planPath))
    plan.bootstrapPaths[0].outputDigest = '0'.repeat(64)
    const redPlanPath = resolve(temporary, 'red-plan.json')
    writeFileSync(redPlanPath, canonicalBytes(plan))
    assert.throws(
      () => verifyBootstrap({ root: repositoryRoot, planPath: redPlanPath }),
      /A0_DIGEST_MISMATCH/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('A0 bootstrap refuses Product delta and keeps S2 absent', () => {
  const plan = JSON.parse(readFileSync(planPath))
  assert.deepEqual(plan.expectedProductDelta, {
    durableRecordClassesAdded: 0,
    operationsAdded: [],
    operationsChanged: [],
    operationsRemoved: [],
    ownersAdded: 0,
    permissionsAdded: 0,
    rolesAdded: 0,
    schemasAdded: 0,
    tablesAdded: 0,
  })
  assert.equal(plan.addedPaths.some(({ path }) => path.includes('/workspace/')), false)
  assert.equal(plan.addedPaths.some(({ path }) => path.includes('/project/')), false)
})

test('in-flight custody requires an exact current part and protects rebuilt web bytes', () => {
  assert.throws(
    () => validateMigrationPlan({ requireBaseline: false }),
    /A0_CURRENT_PART_REQUIRED/,
  )
  const plan = JSON.parse(readFileSync(planPath))
  assert.equal(plan.custodyScope.recursiveRoots.includes('packages/canonical-json'), true)
  const protectedPaths = new Set(plan.unchangedProtected.map(({ path }) => path))
  assert.equal(protectedPaths.has('apps/web/src/generated/iam-client.ts'), true)
  assert.equal(protectedPaths.has('apps/hub/public/index.html'), true)
  assert.equal([...protectedPaths].some((path) => path.startsWith('apps/hub/public/assets/')), true)
})
