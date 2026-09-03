import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import { finalizeResult } from '../../qualification/4d/r1-git-source-custody/finalize-result.mjs'
import { canonicalJson } from '../../qualification/4d/r1-git-source-custody/product-census.mjs'
import { createHash } from 'node:crypto'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'docs/evidence/4d/4d-r1-foundation-pin-manifest-r1c14-native-successor.json'), 'utf8'))
const candidateFixture = JSON.parse(readFileSync(resolve(repositoryRoot, manifest.evidence.resultPath.replace(/results\.json$/, 'candidate-results.json')), 'utf8'))
const censusFixture = JSON.parse(readFileSync(resolve(repositoryRoot, manifest.evidence.resultPath.replace(/results\.json$/, 'product-census-before.json')), 'utf8'))
const expectedCheckIds = manifest.evidence.expectedCheckIds
const secret = 'R1C14_SYNTHETIC_FINALIZER_TEST_SECRET'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const writeJson = (path, value) => writeFileSync(path, `${canonicalJson(value)}\n`)

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-finalizer-'))
  const paths = {
    candidatePath: resolve(root, 'candidate.json'),
    finalPath: resolve(root, 'final.json'),
    preCensusPath: resolve(root, 'pre.json'),
    postCensusPath: resolve(root, 'post.json'),
  }
  writeJson(paths.candidatePath, structuredClone(candidateFixture))
  writeJson(paths.preCensusPath, structuredClone(censusFixture))
  writeJson(paths.postCensusPath, structuredClone(censusFixture))
  return { root, paths }
}

function expectRefusal(code, mutate) {
  const { root, paths } = fixture()
  const previous = process.env.R1C14_SYNTHETIC_SECRET
  process.env.R1C14_SYNTHETIC_SECRET = secret
  try {
    mutate(paths)
    assert.throws(
      () => finalizeResult({ ...paths, expectedCheckIds }),
      error => error instanceof Error && error.message.startsWith(code),
    )
  } finally {
    if (previous === undefined) delete process.env.R1C14_SYNTHETIC_SECRET
    else process.env.R1C14_SYNTHETIC_SECRET = previous
    rmSync(root, { recursive: true, force: true })
  }
}

test('finalizer refuses a changed Product census', () => {
  expectRefusal('R1C14_FINALIZER_PRODUCT_CENSUS_CHANGED', ({ postCensusPath }) => {
    const changed = structuredClone(censusFixture)
    changed.records[0].digest = '0'.repeat(64)
    changed.digest = sha256(Buffer.from(canonicalJson(changed.records)))
    writeJson(postCensusPath, changed)
  })
})

test('finalizer refuses an incomplete check census', () => {
  expectRefusal('R1C14_FINALIZER_CHECK_CENSUS_MISMATCH', ({ candidatePath }) => {
    const changed = structuredClone(candidateFixture)
    changed.checks.pop()
    writeJson(candidatePath, changed)
  })
})

test('finalizer refuses incomplete cleanup', () => {
  expectRefusal('R1C14_FINALIZER_CLEANUP_INCOMPLETE', ({ candidatePath }) => {
    const changed = structuredClone(candidateFixture)
    changed.cleanup.serverStopped = false
    writeJson(candidatePath, changed)
  })
})

test('finalizer refuses disclosure of the synthetic secret', () => {
  expectRefusal('R1C14_FINALIZER_SECRET_DISCLOSURE', ({ candidatePath }) => {
    const changed = structuredClone(candidateFixture)
    changed.syntheticDisclosure = secret
    writeJson(candidatePath, changed)
  })
})
