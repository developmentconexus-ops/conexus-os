import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { canonicalBytes, recordValidation, sha256, verifyS2Plan } from '../../scripts/check-r1-s2-migration.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const verifiedState = (repositoryRootValue) => existsSync(resolve(repositoryRootValue, 'runtime/r1/.conexus/s2-migration-plan-validation.json'))
  ? verifyS2Plan({ repositoryRoot: repositoryRootValue, currentPart: 'S2-P0', requireValidation: true })
  : verifyS2Plan({ repositoryRoot: repositoryRootValue, baseline: true })

test('S2 P0 custody validates the exact pre-mutation subject', () => {
  const result = verifiedState(repositoryRoot)
  assert.equal(result.verdict, 'PASS')
  assert.equal(result.plan.prior.a0ReceiptDigest, sha256(readFileSync(resolve(repositoryRoot, 'runtime/r1/.conexus/a0-generation-receipt.json'))))
  assert.deepEqual(result.plan.parts.map(({ id }) => id), ['S2-P0', 'S2-P1', 'S2-P2', 'S2-P3', 'S2-P4', 'S2-P5'])
  assert.equal(result.plan.changedPaths.some(({ class: ownerClass }) => ownerClass === 'APP-OWNED'), false)
  assert.equal(result.plan.addedPaths.some(({ class: ownerClass }) => ownerClass === 'APP-OWNED'), false)
})

test('S2 canonical JSON and plan digest are byte-objective', () => {
  const path = resolve(repositoryRoot, 'profiles/r1/v1/s2-workspace-foundation-migration.json')
  const bytes = readFileSync(path)
  assert.equal(canonicalBytes(JSON.parse(bytes)).equals(bytes), true)
})

test('S2 migration plan satisfies its strict JSON schema', () => {
  const schema = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/profile-compiler/schemas/s2-workspace-foundation-migration.schema.json')))
  const plan = JSON.parse(readFileSync(resolve(repositoryRoot, 'profiles/r1/v1/s2-workspace-foundation-migration.json')))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(plan), true, JSON.stringify(validate.errors))
})

test('S2 custody RED controls fire on protected and bootstrap drift', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-s2-custody-red-'))
  try {
    cpSync(repositoryRoot, fixture, { recursive: true, filter: (source) => !['.git', 'node_modules', '.wireframe-preview'].includes(source.split(/[\\/]/).at(-1)) })
    const protectedPath = resolve(fixture, 'apps/hub/migrations/001_iam_foundation.sql')
    const protectedBytes = readFileSync(protectedPath)
    writeFileSync(protectedPath, Buffer.concat([readFileSync(protectedPath), Buffer.from('\n')]))
    assert.throws(() => verifiedState(fixture), /S2_DIGEST_MISMATCH:apps\/hub\/migrations\/001_iam_foundation\.sql/)
    writeFileSync(protectedPath, protectedBytes)

    const bootstrapPath = resolve(fixture, 'scripts/record-r1-s2-part-pass.mjs')
    const bootstrapBytes = readFileSync(bootstrapPath)
    writeFileSync(bootstrapPath, Buffer.concat([readFileSync(bootstrapPath), Buffer.from('\n')]))
    assert.throws(() => verifiedState(fixture), /S2_DIGEST_MISMATCH:scripts\/record-r1-s2-part-pass\.mjs/)
    writeFileSync(bootstrapPath, bootstrapBytes)

    const unlistedPath = resolve(fixture, 'apps/hub/src/unlisted.ts')
    writeFileSync(unlistedPath, 'export {}\n')
    assert.throws(() => verifiedState(fixture), /S2_UNLISTED_PATH:apps\/hub\/src\/unlisted\.ts/)
    rmSync(unlistedPath)

    const prematurePath = resolve(fixture, 'apps/hub/src/workspace/module.ts')
    mkdirSync(resolve(fixture, 'apps/hub/src/workspace'), { recursive: true })
    writeFileSync(prematurePath, 'export {}\n')
    assert.throws(() => verifiedState(fixture), /S2_(?:PREMATURE_PATH|FUTURE_PATH_PREMATURE):apps\/hub\/src\/workspace\/module\.ts/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('S2 in-flight custody refuses a changed path before its mutation window', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-s2-window-red-'))
  try {
    cpSync(repositoryRoot, fixture, { recursive: true, filter: (source) => !['.git', 'node_modules', '.wireframe-preview'].includes(source.split(/[\\/]/).at(-1)) })
    if (!existsSync(resolve(fixture, 'runtime/r1/.conexus/s2-migration-plan-validation.json'))) {
      recordValidation({
        repositoryRoot: fixture,
        fableSession: '11111111-1111-4111-8111-111111111111',
        geminiSession: '22222222-2222-4222-8222-222222222222',
      })
    }
    const futurePath = resolve(fixture, 'apps/hub/src/http/app.ts')
    const futureBytes = readFileSync(futurePath)
    writeFileSync(futurePath, Buffer.concat([readFileSync(futurePath), Buffer.from('\n')]))
    assert.throws(
      () => verifyS2Plan({ repositoryRoot: fixture, currentPart: 'S2-P1', requireValidation: true }),
      /S2_DIGEST_MISMATCH:apps\/hub\/src\/http\/app\.ts/,
    )
    writeFileSync(futurePath, futureBytes)

    const generatedPath = resolve(fixture, 'apps/hub/public/index.html')
    writeFileSync(generatedPath, Buffer.concat([readFileSync(generatedPath), Buffer.from('\n')]))
    assert.throws(
      () => verifyS2Plan({ repositoryRoot: fixture, currentPart: 'S2-P1', requireValidation: true }),
      /S2_GENERATED_ROOT_DRIFT:apps\/hub\/public/,
    )
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
