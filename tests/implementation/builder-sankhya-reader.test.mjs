import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { loadAllRecords, queryRows } = await import(hubModuleUrl('builder/handler-kit/sankhya.js'))

const FIELDS = { field: [{ name: 'CODPROD' }, { name: 'DESCRPROD' }, { name: 'VLRVENDA' }] }
const row = (code, description, price) => ({ f0: { $: code }, f1: description === null ? {} : { $: description }, f2: price === null ? {} : { $: price } })
const page = (entity, more, offsetPage) => ({
  serviceName: 'CRUDServiceProvider.loadRecords', status: '1',
  responseBody: { entities: { total: String(entity === undefined ? 0 : Array.isArray(entity) ? entity.length : 1), hasMoreResult: String(more), offsetPage: String(offsetPage), metadata: { fields: FIELDS }, ...(entity === undefined ? {} : { entity }) } },
})

// A Conexão that answers each page in turn and keeps the page numbers it was asked for.
const connectorsAnswering = (answers) => {
  const asked = []
  return {
    asked,
    connectors: {
      fetch: async (request) => {
        asked.push(request.body.requestBody.dataSet?.offsetPage ?? request.body.requestBody.sql)
        const answer = answers[asked.length - 1]
        return answer.ok === false ? answer : { ok: true, status: 200, bytes: 1, body: answer }
      },
    },
  }
}

const DATA_SET = { rootEntity: 'Produto', entity: [{ path: '', fieldset: { list: 'CODPROD,DESCRPROD,VLRVENDA' } }] }

test('reads a list to the end, three pages, the last one a single object, and decodes every row', async () => {
  const { connectors, asked } = connectorsAnswering([
    page([row('1', 'Parafuso', '1.50'), row('2', 'Arruela', null)], true, 0),
    page([row('3', null, '0')], true, 1),
    page(row('4', 'Porca', '2.10'), false, 2),
  ])
  assert.deepEqual(await loadAllRecords(connectors, 'erp', DATA_SET), {
    ok: true,
    complete: true,
    rows: [
      { CODPROD: '1', DESCRPROD: 'Parafuso', VLRVENDA: '1.50' },
      { CODPROD: '2', DESCRPROD: 'Arruela', VLRVENDA: null },
      { CODPROD: '3', DESCRPROD: null, VLRVENDA: '0' },
      { CODPROD: '4', DESCRPROD: 'Porca', VLRVENDA: '2.10' },
    ],
  })
  assert.deepEqual(asked, ['0', '1', '2'])
})

test('sends the native loadRecords request with the caller\'s dataSet and the page number', async () => {
  const requests = []
  const connectors = { fetch: async (request) => { requests.push(request); return { ok: true, status: 200, bytes: 1, body: page(undefined, false, 0) } } }
  await loadAllRecords(connectors, 'erp', DATA_SET)
  assert.deepEqual(requests, [{
    connection: 'erp', method: 'POST', path: '/gateway/v1/mge/service.sbr',
    query: { serviceName: 'CRUDServiceProvider.loadRecords', outputType: 'json' },
    body: { serviceName: 'CRUDServiceProvider.loadRecords', requestBody: { dataSet: { ...DATA_SET, offsetPage: '0' } } },
  }])
})

test('a list with no rows is an empty, complete read', async () => {
  const { connectors } = connectorsAnswering([page(undefined, false, 0)])
  assert.deepEqual(await loadAllRecords(connectors, 'erp', DATA_SET), { ok: true, rows: [], complete: true })
})

test('stops at maxPages and says the list is not complete', async () => {
  const { connectors, asked } = connectorsAnswering([page(row('1', 'A', '1'), true, 0), page(row('2', 'B', '2'), true, 1)])
  assert.deepEqual(await loadAllRecords(connectors, 'erp', DATA_SET, { maxPages: 2 }), {
    ok: true, complete: false, rows: [{ CODPROD: '1', DESCRPROD: 'A', VLRVENDA: '1' }, { CODPROD: '2', DESCRPROD: 'B', VLRVENDA: '2' }],
  })
  assert.deepEqual(asked, ['0', '1'])
})

test('a refused page ends the read with its code, and an unreadable answer is RESPONSE_UNREADABLE', async () => {
  const refused = connectorsAnswering([page(row('1', 'A', '1'), true, 0), { ok: false, code: 'CALL_LIMIT' }])
  assert.deepEqual(await loadAllRecords(refused.connectors, 'erp', DATA_SET), { ok: false, code: 'CALL_LIMIT' })
  const unreadable = connectorsAnswering([{ serviceName: 'CRUDServiceProvider.loadRecords', status: '1', responseBody: {} }])
  assert.deepEqual(await loadAllRecords(unreadable.connectors, 'erp', DATA_SET), { ok: false, code: 'RESPONSE_UNREADABLE' })
})

test('decodes an executeQuery answer into rows keyed by column name, keeping each JSON type', async () => {
  const { connectors, asked } = connectorsAnswering([{
    serviceName: 'DbExplorerSP.executeQuery', status: '1',
    responseBody: { fieldsMetadata: [{ name: 'CODPROD', order: 1 }, { name: 'PRECO', order: 2 }], rows: [[501, '10.00'], [502, null]], burstLimit: false },
  }])
  assert.deepEqual(await queryRows(connectors, 'erp', 'SELECT CODPROD, PRECO FROM TGFPRO'), {
    ok: true, complete: true, rows: [{ CODPROD: 501, PRECO: '10.00' }, { CODPROD: 502, PRECO: null }],
  })
  assert.deepEqual(asked, ['SELECT CODPROD, PRECO FROM TGFPRO'])
})

test('an executeQuery answer cut by the burst limit is not complete, and a refusal keeps its code', async () => {
  const cut = connectorsAnswering([{ responseBody: { fieldsMetadata: [{ name: 'N' }], rows: [[1]], burstLimit: true } }])
  assert.deepEqual(await queryRows(cut.connectors, 'erp', 'SELECT 1 N FROM DUAL'), { ok: true, complete: false, rows: [{ N: 1 }] })
  const refused = connectorsAnswering([{ ok: false, code: 'INPUT_REFUSED' }])
  assert.deepEqual(await queryRows(refused.connectors, 'erp', 'DELETE FROM X'), { ok: false, code: 'INPUT_REFUSED' })
})
