import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { censusNamedMechanisms, censusNamedSource, censusSource, violations } from '../../scripts/check-error-model.mjs'

const root = resolve(import.meta.dirname, '../..')
const targets = [
  'resultReplyAlias',
  'manifestThrowHelpers',
  'admissionMessageDecoders',
  'workerCodeFilter',
  'failureProblemCalls',
  'failureBodyHelpers',
  'hubFailureClass',
  'oldWebFailureImportFiles',
  'embeddedConexusError',
  'generatedFailureDecoder',
  'generatedHttpFallback',
  'generatedFailureFallback',
  'starterFailureWrappers',
]

const astCases = [
  { name: 'resultReplyAlias', source: 'type Result = Reply<string>', lines: [1] },
  { name: 'manifestThrowHelpers', source: 'function refuseManifest() { throw new Error() }\nfunction refuseTree() { throw new Error() }', lines: [1, 2] },
  { name: 'admissionMessageDecoders', source: 'const ADMISSION_ROW = 1\nconst admissionFailure = 1', lines: [1, 2] },
  { name: 'workerCodeFilter', source: 'const workerCodeOf = () => null', lines: [1] },
  { name: 'failureProblemCalls', source: 'failureProblem(failure)', lines: [1] },
  { name: 'failureBodyHelpers', source: 'const failureProblem = 1\nconst problemBody = 1\nconst sendFailure = 1\nconst sendInternal = 1', lines: [1, 2, 3, 4] },
  { name: 'hubFailureClass', source: 'class HubFailure {}', lines: [1] },
  { name: 'oldWebFailureImportFiles', source: "import { failure } from '../app/failure'", lines: [1] },
  { name: 'embeddedConexusError', source: "const APP_FAILURES_SOURCE = 'export class ConexusError extends Error {}'", lines: [1] },
]

for (const { name, source, lines } of astCases) {
  test(`${name} has present and absent source fixtures`, () => {
    const path = resolve(root, `tests/fixtures/error-model-census/${name}.ts`)
    const expected = lines.map((line) => `tests/fixtures/error-model-census/${name}.ts:${line}`)
    assert.deepEqual(censusSource(path, source)[name], expected)
    assert.deepEqual(censusSource(path, 'const unrelated = true')[name], [])
  })
}

const markerCases = [
  {
    name: 'generatedFailureDecoder',
    path: 'apps/hub/compiler-template/generate-client.mjs',
    source: 'const failure = (status: number, body: string): ConexusError => {',
  },
  {
    name: 'generatedHttpFallback',
    path: 'apps/hub/compiler-template/generate-client.mjs',
    source: String.raw`return new ConexusError(\`HTTP_\${status}\`, body.slice(0, 500))`,
  },
  {
    name: 'generatedFailureFallback',
    path: 'scripts/generate-failures.mjs',
    source: 'const FALLBACK = \'message\'',
  },
  {
    name: 'starterFailureWrappers',
    path: 'apps/hub/starter-template/files/app/src/lib/errors.ts',
    source: 'export function errorMessage(error: unknown): string {',
  },
]

for (const { name, path, source } of markerCases) {
  test(`${name} has present and absent marker fixtures`, () => {
    assert.deepEqual(censusNamedSource(name, `tests/fixtures/error-model-census/${name}.ts`, source), [
      `tests/fixtures/error-model-census/${name}.ts:1`,
    ])
    const absent = name === 'generatedHttpFallback' ? '// HTTP_ is unrelated text' : 'const unrelated = true'
    assert.deepEqual(censusNamedSource(name, path, absent), [])
  })
}

test('every restored named mechanism is refused without a historical allowance', () => {
  for (const name of targets) {
    assert.deepEqual(violations({ [name]: ['bad.ts:1'] }), [`${name}: legacy mechanism at bad.ts:1`])
  }
  assert.deepEqual(violations({}), [])
})

test('a deleted starter wrapper is zero, restoring it is prohibited, and other read errors surface', () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'error-model-census-'))
  const markerFiles = markerCases.map(({ name, path }) => ({ name, path }))
  const starterPath = resolve(fixtureRoot, markerFiles.find(({ name }) => name === 'starterFailureWrappers').path)

  try {
    for (const { path } of markerFiles.filter(({ name }) => name !== 'starterFailureWrappers')) {
      const file = resolve(fixtureRoot, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, 'const unrelated = true')
    }
    mkdirSync(dirname(starterPath), { recursive: true })
    writeFileSync(starterPath, 'export function errorMessage() {}\nexport function connectionMessage() {}\n')
    rmSync(starterPath)

    assert.deepEqual(violations(censusNamedMechanisms(fixtureRoot)), [])

    writeFileSync(starterPath, 'export function errorMessage() {}\nexport function connectionMessage() {}\n')
    assert.deepEqual(violations(censusNamedMechanisms(fixtureRoot)), [
      'starterFailureWrappers: legacy mechanism at apps/hub/starter-template/files/app/src/lib/errors.ts:1',
      'starterFailureWrappers: legacy mechanism at apps/hub/starter-template/files/app/src/lib/errors.ts:2',
    ])

    const requiredPath = resolve(fixtureRoot, markerFiles.find(({ name }) => name === 'generatedFailureFallback').path)
    rmSync(requiredPath)
    mkdirSync(requiredPath)
    assert.throws(() => censusNamedMechanisms(fixtureRoot), { code: 'EISDIR' })
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('lawful manifest refusal values are not throwing helpers', () => {
  const source = "function refuseManifest() { return Object.freeze({ code: 'MANIFEST_REFUSED' }) }"
  assert.deepEqual(censusSource(resolve(root, 'apps/hub/src/app-runner/server-manifest.ts'), source).manifestThrowHelpers, [])
})
