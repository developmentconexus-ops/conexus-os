import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { verifyR3CandidateFreeze } from '../../scripts/check-r3-candidate-freeze.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const freezePath = resolve(repositoryRoot, 'docs/evidence/4f/4f-r3-rf05-rf08-candidate-freeze.md')
const gateOnly = (name, fn) => test(name, { skip: !process.env.CONEXUS_R3_CANDIDATE_GATE }, fn)

gateOnly('R3 candidate freeze binds every custody digest and the complete migration corpus', () => {
  const result = verifyR3CandidateFreeze({ root: repositoryRoot, freezePath })
  assert.equal(result.verdict, 'PASS')
  assert.equal(result.custodyEntries, 52)
  assert.deepEqual(result.transactionOwnerPaths, [
    'apps/hub/src/brain/store.ts',
    'apps/hub/src/connections/store.ts',
    'apps/hub/src/identity-access/store.ts',
    'apps/hub/src/mar/admission.ts',
    'apps/hub/src/project/binding-recovery.ts',
    'apps/hub/src/project/inception.ts',
    'apps/hub/src/project/read-model.ts',
    'apps/hub/src/project/store.ts',
    'apps/hub/src/workspace/store.ts',
  ])
  assert.equal(result.migrationCount, 25)
  assert.match(result.candidateManifestDigest, /^[0-9a-f]{64}$/)
  assert.match(result.migrationCorpusDigest, /^[0-9a-f]{64}$/)
  assert.equal(result.projectMigrationCount, 2)
  assert.match(result.projectMigrationCorpusDigest, /^[0-9a-f]{64}$/)
})

gateOnly('R3 candidate freeze rejects a changed base commit', () => {
  const source = readFileSync(freezePath, 'utf8')
  const forged = source.replace(/(\*\*Base:\*\* `)[0-9a-f]{40}(`)/, '$1' + '0'.repeat(40) + '$2')
  assert.throws(
    () => verifyR3CandidateFreeze({ root: repositoryRoot, freezePath, text: forged }),
    /R3_CANDIDATE_FREEZE_BASE_DRIFT/,
  )
})

gateOnly('migration catalog exclusion is bound to the migration actually applied', () => {
  const runner = readFileSync(resolve(repositoryRoot, 'scripts/run-hub-migrations.mjs'), 'utf8')
  assert.match(runner, /after023: applied\.has\('023'\)/)
  assert.match(runner, /if \(applied\.has\('024'\)\) await assert024Catalog\(client\)/)
  assert.match(runner, /if \(applied\.has\('025'\)\) await assert025Catalog\(client\)/)
  assert.doesNotMatch(runner, /after022: true, after023: true/)
})

gateOnly('R3 candidate freeze rejects a custody digest drift', () => {
  const source = readFileSync(freezePath, 'utf8')
  const forged = source.replace(
    /(`docs\/roadmap\.md` \| `)[0-9a-f]{64}(` \|)/,
    '$1' + '0'.repeat(64) + '$2',
  )
  assert.throws(
    () => verifyR3CandidateFreeze({ root: repositoryRoot, freezePath, text: forged }),
    /R3_CANDIDATE_FREEZE_CUSTODY_DIGEST_DRIFT:docs\/roadmap\.md/,
  )
  assert.notEqual(forged, source)
})
