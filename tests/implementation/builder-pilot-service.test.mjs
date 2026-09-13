import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const cache = resolve(root, 'node_modules/.cache')
mkdirSync(cache, { recursive: true })
const build = mkdtempSync(resolve(cache, 'builder-pilot-service-'))
test.after(() => rmSync(build, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build], { cwd: root, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { createBuilderService } = await import(pathToFileURL(resolve(build, 'builder/service.js')).href)

test('a response-only coding turn persists its answer without Git admission, reviewer or compilation', async () => {
  const claim = {
    projectId: '11111111-1111-4111-8111-111111111111',
    changeId: '22222222-2222-4222-8222-222222222222',
    accountId: '33333333-3333-4333-8333-333333333333',
    actorRunId: 'actor', admissionToken: 'token', workUnitId: 'unit',
    intent: 'Explique o aplicativo', baseSourceRevision: 'a'.repeat(40),
    baselineSourceRevision: 'a'.repeat(40), sourceChangeId: null,
  }
  const observed = { responses: [], failures: 0, admissions: 0, reviews: 0, builds: 0 }
  const service = createBuilderService({
    store: {
      createChange: async () => ({ ...claim, state: 'QUEUED' }),
      claimChange: async () => claim,
      settleResponse: async (input) => { observed.responses.push(input.summary) },
      failRun: async () => { observed.failures += 1 },
      close: async () => {},
    },
    source: {
      prepareSource: async () => Buffer.from('controlled source'),
      admitCandidate: async () => { observed.admissions += 1; throw new Error('Unexpected source admission') },
    },
    runtime: {
      kind: 'REMOTE_E2B',
      execute: async () => ({ ...claim, kind: 'RESPONSE_ONLY', sandboxId: 'sandbox', summary: 'Este aplicativo conta cliques.' }),
    },
    verifier: { kind: 'REMOTE_E2B', verify: async () => { observed.reviews += 1 } },
    compiler: { kind: 'REMOTE_E2B', compile: async () => { observed.builds += 1 } },
    applicationArtifacts: {},
  })
  await service.createChange({ accountId: claim.accountId, projectId: claim.projectId, intent: claim.intent, idempotencyKey: 'one' })
  await service.close()
  assert.deepEqual(observed, {
    responses: ['Este aplicativo conta cliques.'], failures: 0, admissions: 0, reviews: 0, builds: 0,
  })
})
