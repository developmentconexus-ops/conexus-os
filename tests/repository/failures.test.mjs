import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { failureProblems, failureTargets, failuresDrift, readFailures, renderFailureTargets } from '../../scripts/generate-failures.mjs'

const root = resolve(import.meta.dirname, '../..')
const committed = () => Object.fromEntries(Object.values(failureTargets).map((target) => [target, readFileSync(join(root, target), 'utf8')]))
const row = (overrides) => ({ code: 'SAMPLE_FAILURE', category: 'USER', status: 400, audience: 'person', message: 'Algo aconteceu.', action: 'NONE', ...overrides })
const withRow = (table, overrides) => ({ ...table, failures: [...table.failures, row(overrides)] })

test('the failure table and both generated files agree', () => {
  assert.deepEqual(failuresDrift(readFailures(), committed()), [])
  assert.equal(committed()[failureTargets.hub].includes("'NOT_FOUND': { category: 'USER', status: 404 },"), true)
  assert.equal(committed()[failureTargets.contract].includes("'NOT_FOUND': { message: 'Não encontramos o que você procurou.', action: 'NONE', status: 404 },"), true)
})

test('a row added to the table fails naming every generated file it reaches, until they are regenerated', () => {
  const added = withRow(readFailures(), {})
  const stale = (target) => `FAILURES_STALE: ${target} is not generated from contracts/technical/failures.json; run node scripts/generate-failures.mjs`
  assert.deepEqual(failuresDrift(added, committed()), [stale(failureTargets.hub), stale(failureTargets.contract), stale(failureTargets.text)])
  assert.deepEqual(failuresDrift(added, renderFailureTargets(added)), [])
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

const COMMANDS = [
  ['Peça ajuda.', 'peça'], ['Peca ajuda.', 'peca'], ['Escolha outro modelo.', 'escolha'], ['Conecte a conta.', 'conecte'], ['Entre na conta.', 'entre'],
  ['Confira os dados.', 'confira'], ['Corrija o erro.', 'corrija'], ['Envie o pedido.', 'envie'], ['Tente depois.', 'tente'], ['Verifique o e-mail.', 'verifique'],
  ['Refaça o pedido novamente.', 'novamente'], ['Abra o app de novo.', 'de novo'],
]

test('a message never tells the person what to do: each command word is refused, and the action carries the sentence', () => {
  const table = readFailures()
  for (const [message, word] of COMMANDS) {
    assert.deepEqual(failureProblems(withRow(table, { message })), [`FAILURES_INVALID: SAMPLE_FAILURE says "${word}" in its message; what the person does is the action's sentence, never the message's`], message)
  }
  for (const message of ['O app entregue não abriu.', 'Os dados ficam dentre 1 e 5 itens.', 'O pedido não chegou.']) {
    assert.deepEqual(failureProblems(withRow(table, { message })), [], message)
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
