import assert from 'node:assert/strict'
import test from 'node:test'
import { recordApplicationApi, summarizeBody } from '../../scripts/builder-eval/api-summary.mjs'

const answer = {
  orders: [{ number: 22790, supplier: 'Fornecedor Exemplo Ltda', total: '1234.50', date: null, items: [{ quantity: '2' }, { quantity: '3' }] }],
  notes: [],
}

test('an application API answer is reduced to paths, types and array lengths', () => {
  const summary = summarizeBody(answer)
  assert.deepEqual(summary.fields, {
    '$': 'object',
    '$.notes': 'array',
    '$.orders': 'array',
    '$.orders[]': 'object',
    '$.orders[].date': 'null',
    '$.orders[].items': 'array',
    '$.orders[].items[]': 'object',
    '$.orders[].items[].quantity': 'string',
    '$.orders[].number': 'number',
    '$.orders[].supplier': 'string',
    '$.orders[].total': 'string',
  })
  assert.deepEqual(summary.counts, { '$.notes': 0, '$.orders': 1, '$.orders[].items': 2 })
})

test('the summary holds no value of the answer', () => {
  const printed = JSON.stringify(summarizeBody({ ...answer, byName: { 'Fornecedor Exemplo Ltda': 1 } }))
  for (const value of ['22790', 'Fornecedor Exemplo', '1234.50']) assert.equal(printed.includes(value), false, value)
  assert.equal(summarizeBody({ 'Fornecedor Exemplo Ltda': 1 }).fields['$.*'], 'number')
})

test('the digest ignores key order and changes with any value', () => {
  const reordered = { notes: [], orders: [{ items: [{ quantity: '2' }, { quantity: '3' }], date: null, total: '1234.50', supplier: 'Fornecedor Exemplo Ltda', number: 22790 }] }
  const changed = { ...answer, orders: [{ ...answer.orders[0], total: '1234.51' }] }
  assert.match(summarizeBody(answer).digest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(summarizeBody(reordered).digest, summarizeBody(answer).digest)
  assert.notEqual(summarizeBody(changed).digest, summarizeBody(answer).digest)
})

test('the recorder settles when an answer body never arrives', async () => {
  let listener
  const context = { on: (event, handler) => { if (event === 'response') listener = handler } }
  const api = recordApplicationApi(context, { bodyReadMs: 50 })
  const answer = (path, status, json) => ({ url: () => `https://preview.example${path}`, status: () => status, json })
  listener(answer('/__conexus/api/listNotes', 429, () => new Promise(() => {})))
  listener(answer('/__conexus/api/readOrder', 200, async () => ({ orders: [] })))
  listener(answer('/other', 200, async () => ({})))
  const outcome = await Promise.race([api.settled().then(() => 'settled'), new Promise((resolve) => { setTimeout(() => resolve('hung'), 2_000).unref() })])
  assert.equal(outcome, 'settled')
  assert.deepEqual(api.entries.map(({ operation, status, summary }) => [operation, status, summary?.counts ?? null]), [
    ['listNotes', 429, null],
    ['readOrder', 200, { '$.orders': 0 }],
  ])
})
