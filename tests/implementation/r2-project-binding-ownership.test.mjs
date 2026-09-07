import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import {
  buildR2ProjectBindingOwnership,
  checkR2ProjectBindingOwnership,
} from '../../scripts/generate-r2-project-binding-ownership.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const inputPath = 'profiles/r1/v1/r2-project-binding-ownership.json'
const generatorPath = 'scripts/generate-r2-project-binding-ownership.mjs'
const outputPath = 'apps/hub/src/generated/r2-project-binding-ownership.ts'
const receiptPath = 'runtime/r1/.conexus/r2-project-binding-ownership-receipt.json'

const copyFixture = () => {
  // Keep the fixture below the checkout so the copied generator resolves the
  // repository's installed canonical-json dependency through Node's normal
  // ancestor lookup.
  const root = mkdtempSync(resolve(repositoryRoot, '.conexus-r2-project-binding-ownership-'))
  for (const path of [inputPath, generatorPath, outputPath, receiptPath]) {
    const target = resolve(root, path)
    mkdirSync(resolve(target, '..'), { recursive: true })
    cpSync(resolve(repositoryRoot, path), target)
  }
  return root
}

const readJson = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const runCheck = (root) => spawnSync(process.execPath, [resolve(root, generatorPath), '--check'], {
  cwd: root,
  encoding: 'utf8',
})
const assertRejected = (root, pattern) => assert.throws(() => checkR2ProjectBindingOwnership(root), pattern)

const compileHub = () => {
  const outputRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-ownership-build-'))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', outputRoot,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}${compiled.stderr}`)
  return { outputRoot, built: (path) => resolve(outputRoot, path) }
}

test('R2 project binding ownership is a deterministic, exact three-entry projection', () => {
  const projection = checkR2ProjectBindingOwnership(repositoryRoot)
  assert.deepEqual(projection, buildR2ProjectBindingOwnership(repositoryRoot))
  assert.equal(projection.kind, 'conexus.r2-project-binding-ownership/v1')
  assert.match(projection.inputDigest, /^[a-f0-9]{64}$/)
  assert.equal(projection.inputDigest, sha256(canonicalBytes(readJson(repositoryRoot, inputPath))))
  assert.deepEqual(projection.entries, [
    {
      class: 'APP-OWNED',
      ownerRef: 'Project APP',
      path: '.conexus/brain/realization.json',
      version: 'v1',
    },
    {
      class: 'PLATFORM-CONTRACT',
      ownerRef: 'PRJ-11/12',
      path: '.conexus/project/brain-binding.json',
      version: 'v1',
    },
    {
      class: 'PLATFORM-CONTRACT',
      ownerRef: 'PRJ-14/15',
      path: '.conexus/project/connection-bindings.json',
      version: 'v1',
    },
  ])

  const receipt = readJson(repositoryRoot, receiptPath)
  assert.equal(receipt.kind, 'conexus.r2-project-binding-ownership-receipt/v1')
  assert.match(receipt.inputDigest, /^[a-f0-9]{64}$/)
  assert.match(receipt.generatorDigest, /^[a-f0-9]{64}$/)
  assert.match(receipt.outputDigest, /^[a-f0-9]{64}$/)
  assert.equal(Object.hasOwn(receipt, 'receiptDigest'), false)
  const check = runCheck(repositoryRoot)
  assert.equal(check.status, 0, `${check.stdout}${check.stderr}`)
})

test('ownership generation rejects changed input shape, entries and class', () => {
  const mutations = [
    (input) => { delete input.entries },
    (input) => { input.entries = input.entries.slice(0, 1) },
    (input) => { input.entries[0].class = 'PLATFORM-CONTRACT' },
    (input) => { input.entries[1].class = 'APP-OWNED' },
    (input) => { input.entries[2].class = 'APP-OWNED' },
    (input) => { input.entries[0].path = '.conexus/project/not-a-binding.json' },
    (input) => { input.entries[0].ownerRef = 'PRJ-03' },
    (input) => { input.extra = true },
  ]

  for (const mutate of mutations) {
    const root = copyFixture()
    try {
      const input = readJson(root, inputPath)
      mutate(input)
      writeFileSync(resolve(root, inputPath), `${JSON.stringify(input, null, 2)}\n`)
      assertRejected(root, /R2_PROJECT_BINDING_OWNERSHIP_INPUT_/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('ownership generation rejects missing input, output and receipt', () => {
  for (const missing of [inputPath, outputPath, receiptPath]) {
    const root = copyFixture()
    try {
      rmSync(resolve(root, missing))
      assertRejected(root, /R2_PROJECT_BINDING_OWNERSHIP_(INPUT|OUTPUT|RECEIPT)_MISSING/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('ownership generation rejects drifted generated output and receipt', () => {
  for (const target of [outputPath, receiptPath]) {
    const root = copyFixture()
    try {
      const path = resolve(root, target)
      writeFileSync(path, `${readFileSync(path, 'utf8')}drift\n`)
      assertRejected(root, target === outputPath
        ? /R2_PROJECT_BINDING_OWNERSHIP_GENERATED_DRIFT/
        : /R2_PROJECT_BINDING_OWNERSHIP_RECEIPT_(PARSE|DRIFT)/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('ownership check does not mutate the input, generated output or receipt', () => {
  const preservedPaths = [
    inputPath,
    outputPath,
    receiptPath,
    'runtime/r1/.conexus/s2-generation-receipt.json',
    'runtime/r1/.conexus/s2-ownership-manifest.json',
    'apps/hub/src/generated/r1-new-project-seed.ts',
  ]
  const before = Object.fromEntries(preservedPaths.map((path) => [path, readFileSync(resolve(repositoryRoot, path))]))
  assert.doesNotThrow(() => checkR2ProjectBindingOwnership(repositoryRoot))
  for (const [path, bytes] of Object.entries(before)) assert.deepEqual(readFileSync(resolve(repositoryRoot, path)), bytes)
  assert.equal(existsSync(resolve(repositoryRoot, 'runtime/r1/.conexus/s2-generation-receipt.json')), true)
})

test('production ownership composition uses own entries and permits identical generated overlap', async () => {
  const { outputRoot, built } = compileHub()
  try {
    const { composeProjectSourceOwnership } = await import(`file://${built('project/module.js')}`)
    const input = Object.create({
      '.conexus/project/brain-binding.json': 'APP-OWNED',
      '.conexus/project/inherited-only.json': 'APP-OWNED',
    })
    input['app/config.json'] = 'APP-OWNED'
    input['.conexus/brain/realization.json'] = 'APP-OWNED'
    input['.conexus/project/connection-bindings.json'] = 'PLATFORM-CONTRACT'
    const ownership = composeProjectSourceOwnership(input)
    assert.equal(ownership['app/config.json'], 'APP-OWNED')
    assert.equal(ownership['.conexus/brain/realization.json'], 'APP-OWNED')
    assert.equal(ownership['.conexus/project/brain-binding.json'], 'PLATFORM-CONTRACT')
    assert.equal(ownership['.conexus/project/connection-bindings.json'], 'PLATFORM-CONTRACT')
    assert.equal(Object.hasOwn(ownership, '.conexus/project/inherited-only.json'), false)
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('production ownership composition rejects conflicting overlap, invalid class and noncanonical paths', async () => {
  const { outputRoot, built } = compileHub()
  try {
    const { composeProjectSourceOwnership } = await import(`file://${built('project/module.js')}`)
    assert.throws(() => composeProjectSourceOwnership({
      '.conexus/project/brain-binding.json': 'APP-OWNED',
    }), /PROJECT_SOURCE_OWNERSHIP_REFUSED/)
    assert.throws(() => composeProjectSourceOwnership({
      '.conexus/brain/realization.json': 'PLATFORM-CONTRACT',
    }), /PROJECT_SOURCE_OWNERSHIP_REFUSED/)
    assert.throws(() => composeProjectSourceOwnership({ 'app/config.json': 'UNKNOWN' }), /PROJECT_SOURCE_OWNERSHIP_REFUSED/)
    for (const path of [
      '/absolute/path.json', 'app/../config.json', 'app//config.json', 'app/./config.json',
      'app\\config.json', 'app\nconfig.json', '../outside.json',
    ]) {
      assert.throws(() => composeProjectSourceOwnership({ [path]: 'APP-OWNED' }), /PROJECT_SOURCE_OWNERSHIP_REFUSED/)
    }
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})
