import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8')

test('S4-P2 store and routes compose exact PRJ-08/09 authority', () => {
  const store = read('apps/hub/src/project/store.ts')
  const routes = read('apps/hub/src/project/routes.ts')
  assert.match(store, /getApprovedBaseline/)
  assert.match(store, /approveBaseline/)
  assert.match(store, /BEGIN READ ONLY/)
  assert.match(store, /project\.get_approved_baseline/)
  assert.match(store, /project\.approve_baseline_revision/)
  assert.match(store, /iam\.admit_project_manage/)
  assert.match(routes, /S3_GENERATED_ROUTES\['PRJ-08'\]/)
  assert.match(routes, /S3_GENERATED_ROUTES\['PRJ-09'\]/)
  assert.match(routes, /request-authenticity-denied/)
  assert.match(routes, /baseline-candidate-stale/)
})

test('S4-P2 browser distinguishes Candidate from approved Baseline and never approves optimistically', () => {
  const api = read('apps/web/src/features/project/api.ts')
  const component = read('apps/web/src/features/project/components/baseline-candidate.tsx')
  assert.match(api, /getApprovedBaseline/)
  assert.match(api, /approveBaseline/)
  assert.match(component, /Baseline aprovada atual/)
  assert.match(component, /Aprovar este Candidate/)
  assert.match(component, /candidateBaselineDigest/)
  assert.match(component, /isPending/)
  assert.match(component, /status === 412/)
  assert.doesNotMatch(component, /onMutate/)
})
