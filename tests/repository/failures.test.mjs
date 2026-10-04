import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { failureProblems, failureTargets, failuresDrift, readFailures, renderHubFailures, renderWebFailures } from '../../scripts/generate-failures.mjs'

const root = resolve(import.meta.dirname, '../..')
const committed = () => Object.fromEntries(Object.values(failureTargets).map((target) => [target, readFileSync(join(root, target), 'utf8')]))
const row = (overrides) => ({ code: 'SAMPLE_FAILURE', category: 'USER', status: 400, audience: 'person', message: 'Algo aconteceu.', action: 'NONE', ...overrides })
const withRow = (table, overrides) => ({ ...table, failures: [...table.failures, row(overrides)] })

test('the failure table and both generated files agree', () => {
  assert.deepEqual(failuresDrift(readFailures(), committed()), [])
  assert.equal(committed()[failureTargets.hub].includes("'NOT_FOUND': { category: 'USER', status: 404 },"), true)
  assert.equal(committed()[failureTargets.web].includes("'NOT_FOUND': { message: 'Não encontramos o que você procurou.', action: 'NONE' },"), true)
})

test('a row added to the table only fails naming both generated files', () => {
  const added = withRow(readFailures(), {})
  assert.deepEqual(failuresDrift(added, committed()), [
    'FAILURES_STALE: apps/hub/src/platform/failures.generated.ts is not generated from contracts/technical/failures.json; run node scripts/generate-failures.mjs',
    'FAILURES_STALE: apps/web/src/generated/failures.ts is not generated from contracts/technical/failures.json; run node scripts/generate-failures.mjs',
  ])
  assert.deepEqual(failuresDrift(added, { ...committed(), [failureTargets.hub]: renderHubFailures(added), [failureTargets.web]: renderWebFailures(added) }), [])
})

test('a SYSTEM row cannot ask the person to retry, and must say it was recorded', () => {
  const table = readFailures()
  assert.deepEqual(failureProblems(withRow(table, { category: 'SYSTEM', status: 500, message: 'O Conexus falhou. A falha foi registrada.', action: 'RETRY_LATER' })), [
    'FAILURES_INVALID: SAMPLE_FAILURE is a SYSTEM row with RETRY_LATER; Conexus failures are fixed in code, not retried',
  ])
  assert.deepEqual(failureProblems(withRow(table, { category: 'SYSTEM', status: 500, message: 'O Conexus falhou.' })), [
    'FAILURES_INVALID: SAMPLE_FAILURE is a SYSTEM row whose message does not say the failure was recorded',
  ])
})

test('a message cannot say "try again"; the RETRY_LATER action is the one way', () => {
  const table = readFailures()
  for (const message of ['Tente de novo.', 'Envie novamente o pedido.', 'Você pode tentar de novo.']) {
    assert.deepEqual(failureProblems(withRow(table, { message })), ['FAILURES_INVALID: SAMPLE_FAILURE says "try again" in its message; the RETRY_LATER action is the only way'])
  }
  assert.deepEqual(failureProblems(withRow(table, { category: 'THIRD_PARTY', status: 503, message: 'O provedor está fora do ar.', action: 'RETRY_LATER' })), [])
})

test('a row with a malformed code, a duplicate code, an unknown action or an operator message is refused', () => {
  const table = readFailures()
  assert.deepEqual(failureProblems(withRow(table, { code: 'not_snake' })), ['FAILURES_INVALID: not_snake is not UPPER_SNAKE'])
  assert.deepEqual(failureProblems(withRow(table, { code: 'NOT_FOUND' })), ['FAILURES_INVALID: NOT_FOUND appears twice'])
  assert.deepEqual(failureProblems(withRow(table, { action: 'PRAY' })), ['FAILURES_INVALID: SAMPLE_FAILURE has action PRAY'])
  assert.deepEqual(failureProblems(withRow(table, { audience: 'operator', action: undefined })), ['FAILURES_INVALID: SAMPLE_FAILURE is an operator row and has no message or action'])
})

test('an event code that is also a failure row is refused: a failure goes through logFailure', () => {
  const table = readFailures()
  assert.deepEqual(failureProblems({ ...table, events: [...table.events, 'NOT_FOUND'] }), ['LOG_EVENTS_INVALID: NOT_FOUND is a failure row; a failure is logged through logFailure, not as an event'])
  assert.deepEqual(failureProblems({ ...table, events: [...table.events, 'bad_event', table.events[0]] }), [
    'LOG_EVENTS_INVALID: bad_event is not UPPER_SNAKE',
    `LOG_EVENTS_INVALID: ${table.events[0]} appears twice`,
  ])
})
