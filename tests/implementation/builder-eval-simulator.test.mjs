import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadCases } from '../../scripts/builder-eval/experiment.mjs'
import { SALES_V1, salesFigures } from '../../scripts/builder-eval/fixtures/sales-v1.mjs'
import { SIM_CREDENTIAL, startSimulator } from '../../scripts/builder-eval/sankhya-sim.mjs'

const GRAND_TOTAL_CENTS = 97_156_194

const note = (NUNOTA, CODVEND, DTNEG, TIPMOV, STATUSNOTA, VLRNOTA) => ({ NUNOTA, CODVEND, DTNEG, ...(TIPMOV === null ? {} : { TIPMOV }), STATUSNOTA, VLRNOTA })

test('salesFigures counts confirmed sales minus confirmed returns in the first half of 2026, and prices each wrong reading', () => {
  const notes = [
    note('1', '1', '31/12/2025', 'V', 'L', '700.00'),
    note('2', '1', '05/01/2026', 'V', 'L', '1000.10'),
    note('3', '1', '10/01/2026', 'V', 'L', '250.25'),
    note('4', '1', '20/01/2026', 'D', 'L', '100.00'),
    note('5', '2', '02/02/2026', 'V', 'A', '999.99'),
    note('6', '2', '03/02/2026', 'P', 'L', '500.00'),
    note('7', '2', '04/02/2026', 'V', 'L', '2000.50'),
    note('8', '2', '05/02/2026', 'Z', 'L', '300.00'),
    note('9', '2', '06/02/2026', null, 'L', '400.00'),
    note('10', '1', '01/07/2026', 'V', 'L', '800.00'),
  ]
  const sellers = [
    { CODVEND: '1', APELIDO: 'ANA' },
    { CODVEND: '2', APELIDO: 'BRUNO' },
  ]
  const figures = salesFigures({ notes, sellers, pageSize: 50 })
  assert.deepEqual(figures.cells, [
    { codvend: '1', apelido: 'ANA', month: '2026-01', cents: 115035 },
    { codvend: '2', apelido: 'BRUNO', month: '2026-02', cents: 200050 },
  ])
  assert.equal(figures.grandTotalCents, 315085)
  assert.deepEqual(
    figures.mistakes.map(({ id, grandTotalCents }) => [id, grandTotalCents]),
    [
      ['includes-provisional', 415084],
      ['includes-orders', 365085],
      ['ignores-returns', 325085],
      ['adds-returns', 335085],
      ['includes-unknown-types', 385085],
      ['ignores-period', 465085],
    ],
  )
  const firstPages = salesFigures({ notes, sellers, pageSize: 2 }).mistakes.slice(0, 2)
  assert.deepEqual(firstPages, [
    { id: 'first-page-only', label: 'o total de quem lê só a primeira página', grandTotalCents: 125035 },
    { id: 'unfiltered-first-page', label: 'o total de quem lê só a primeira página, sem filtro', grandTotalCents: 100010 },
  ])
})

const monthOf = (row) => `${row.DTNEG.slice(6, 10)}-${row.DTNEG.slice(3, 5)}`

test('sales-v1 keeps its traps: a perfect filter spans four pages, April is empty and every month holds each wrong kind of note', () => {
  const notes = SALES_V1.entities.CabecalhoNota.rows
  const inPeriod = notes.filter((row) => monthOf(row) >= '2026-01' && monthOf(row) <= '2026-06')
  assert.equal(inPeriod.filter((row) => row.TIPMOV === 'V' && row.STATUSNOTA === 'L').length, 177)
  assert.equal(inPeriod.filter((row) => ['V', 'D'].includes(row.TIPMOV) && row.STATUSNOTA === 'L').length, 192)
  assert.deepEqual(
    [...new Set(notes.map(monthOf))],
    ['2025-12', '2026-01', '2026-02', '2026-03', '2026-05', '2026-06', '2026-07'],
  )
  const kinds = (row) => [
    ...(row.STATUSNOTA !== 'L' ? ['provisional'] : []),
    ...(row.TIPMOV === 'P' ? ['order'] : []),
    ...(row.TIPMOV === 'D' && row.STATUSNOTA === 'L' ? ['return'] : []),
    ...(row.TIPMOV === 'Z' ? ['unknown type'] : []),
    ...(row.TIPMOV === undefined ? ['no type'] : []),
  ]
  const kindsByMonth = Object.groupBy(notes, monthOf)
  assert.deepEqual(
    Object.entries(kindsByMonth).map(([month, rows]) => [month, [...new Set(rows.flatMap(kinds))].sort()]),
    Object.keys(kindsByMonth).map((month) => [month, ['no type', 'order', 'provisional', 'return', 'unknown type']]),
  )
  assert.deepEqual([...new Set(notes.map((row) => row.CODEMP))].sort(), ['1', '2'])
  const edges = ['31/12/2025', '01/01/2026', '30/06/2026', '01/07/2026']
  assert.deepEqual(
    edges.filter((day) => notes.some((row) => row.DTNEG === day && row.TIPMOV === 'V' && row.STATUSNOTA === 'L')),
    edges,
  )
})

test('sales-v1 known answers can be told apart on a page: large, with cents, distinct at cents and whole reais, no mistake among them', () => {
  const { fixture, figures, screen } = SALES_V1.truth()
  assert.equal(fixture, 'sales-v1')
  assert.equal(figures.grandTotalCents, GRAND_TOTAL_CENTS)
  assert.deepEqual(screen.amounts.at(-1), { cents: GRAND_TOTAL_CENTS, label: 'total geral' })
  assert.deepEqual(screen.names, ['ALICE', 'BRUNO', 'CAMILA', 'DIEGO', 'ELISA'])
  assert.equal(screen.amounts.length, 26)
  assert.deepEqual(screen.amounts[0], { cents: 3_586_695, label: 'ALICE · jan/2026' })
  assert.deepEqual(
    screen.mistakes.map((mistake) => [mistake.label, mistake.cents]),
    [
      ['o total de quem lê só a primeira página', 25_847_143],
      ['o total de quem lê só a primeira página, sem filtro', 10_078_436],
      ['o total de quem soma notas não confirmadas', 98_799_188],
      ['o total de quem soma pedidos', 99_682_840],
      ['o total de quem ignora devoluções', 98_041_322],
      ['o total de quem soma devoluções como vendas', 98_926_450],
      ['o total de quem soma tipos de movimento desconhecidos', 101_635_599],
      ['o total de quem ignora o período', 114_058_239],
    ],
  )
  const required = screen.amounts.map((amount) => amount.cents)
  const reais = (cents) => Math.round(cents / 100)
  const failures = [
    ...required.filter((cents) => cents < 1_000_000).map((cents) => `required ${cents} under R$ 10.000`),
    ...required.filter((cents) => cents % 100 === 0).map((cents) => `required ${cents} has no cents`),
    ...(new Set(required).size === required.length ? [] : ['required amounts repeat at cents']),
    ...(new Set(required.map(reais)).size === required.length ? [] : ['required amounts repeat at whole reais']),
    ...figures.cells.filter((cell) => cell.cents <= 0).map((cell) => `cell ${cell.apelido} ${cell.month} is not positive`),
    ...screen.mistakes.filter((mistake) => mistake.cents < 1_000_000).map((mistake) => `mistake ${mistake.label} under R$ 10.000`),
    ...screen.mistakes
      .filter((mistake) => required.includes(mistake.cents) || required.map(reais).includes(reais(mistake.cents)))
      .map((mistake) => `mistake ${mistake.label} equals a required amount`),
  ]
  assert.deepEqual(failures, [])
})

const SERVICE_PATH = '/gateway/v1/mge/service.sbr'

const authenticate = (origin, { clientId, clientSecret, xToken }) =>
  fetch(`${origin}/authenticate`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(xToken === undefined ? {} : { 'x-token': xToken }) },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }).toString(),
  })

async function simulator(t) {
  const sim = await startSimulator({ port: 0 })
  t.after(() => sim.close())
  const { access_token: token } = await (await authenticate(sim.origin, SIM_CREDENTIAL)).json()
  const call = async (serviceName, dataSet) => {
    const response = await fetch(`${sim.origin}${SERVICE_PATH}?serviceName=${serviceName}&outputType=json`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ serviceName, requestBody: { dataSet } }),
    })
    return response.json()
  }
  return { ...sim, call, loadRecords: (dataSet) => call('CRUDServiceProvider.loadRecords', dataSet) }
}

/** The rows of a loadRecords answer by column name, as a Builder app decodes f0..fN. */
const decode = ({ entities }) =>
  [entities.entity ?? []].flat().map((row) => Object.fromEntries(entities.metadata.fields.field.map(({ name }, index) => [name, row[`f${index}`].$])))

test('the simulator admits only its credential and the tokens it issued', async (t) => {
  const sim = await simulator(t)
  const wrongSecret = await authenticate(sim.origin, { ...SIM_CREDENTIAL, clientSecret: 'not-the-secret' })
  assert.deepEqual([wrongSecret.status, await wrongSecret.json()], [401, { error: 'invalid_client', error_description: 'credencial recusada' }])
  const noToken = await authenticate(sim.origin, { ...SIM_CREDENTIAL, xToken: undefined })
  assert.equal(noToken.status, 401)
  const good = await authenticate(sim.origin, SIM_CREDENTIAL)
  assert.deepEqual([good.status, (await good.json()).expires_in], [200, 3600])
  const unsigned = await fetch(`${sim.origin}${SERVICE_PATH}?serviceName=CRUDServiceProvider.loadRecords&outputType=json`, {
    method: 'POST',
    headers: { authorization: 'Bearer sim-token-99', 'content-type': 'application/json' },
    body: JSON.stringify({ serviceName: 'CRUDServiceProvider.loadRecords', requestBody: { dataSet: { rootEntity: 'Vendedor' } } }),
  })
  assert.deepEqual([unsigned.status, await unsigned.json()], [401, { error: 'invalid_token' }])
})

const RIGHT_CRITERIA = Object.freeze({
  expression: { $: "this.DTNEG BETWEEN ? AND ? AND this.STATUSNOTA = 'L' AND this.TIPMOV IN ('V', 'D')" },
  parameter: [
    { $: '01/01/2026', type: 'D' },
    { $: '30/06/2026', type: 'D' },
  ],
})
const NOTE_FIELDS = { fieldset: { list: 'NUNOTA,CODVEND,DTNEG,TIPMOV,STATUSNOTA,VLRNOTA' } }
const centsOf = (text) => Number(text.replace('.', ''))

test('reading every page of the right criteria and applying the rule gives the known grand total', async (t) => {
  const sim = await simulator(t)
  const pages = []
  for (let page = 0; page === 0 || pages.at(-1).responseBody.entities.hasMoreResult === 'true'; page += 1) {
    pages.push(await sim.loadRecords({ rootEntity: 'CabecalhoNota', offsetPage: String(page), criteria: RIGHT_CRITERIA, entity: NOTE_FIELDS }))
  }
  assert.deepEqual(
    pages.map(({ status, responseBody: { entities } }) => [status, entities.offsetPage, entities.total, entities.hasMoreResult]),
    [
      ['1', '0', '50', 'true'],
      ['1', '1', '50', 'true'],
      ['1', '2', '50', 'true'],
      ['1', '3', '42', 'false'],
    ],
  )
  const signedCents = (rows) => rows.reduce((total, row) => total + (row.TIPMOV === 'D' ? -1 : 1) * centsOf(row.VLRNOTA), 0)
  assert.equal(signedCents(pages.flatMap((page) => decode(page.responseBody))), GRAND_TOTAL_CENTS)
  assert.equal(signedCents(decode(pages[0].responseBody)), 25_847_143)
  assert.deepEqual(sim.counters(), { loadRecords: 4, refusals: 0, writes: 0 })
})

test('a reference column reads through its reference, a missing value is {}, and one row answers an object entity', async (t) => {
  const sim = await simulator(t)
  const answer = await sim.loadRecords({
    rootEntity: 'CabecalhoNota',
    criteria: { expression: { $: 'this.NUNOTA IN (?, ?)' }, parameter: [{ $: '10001', type: 'I' }, { $: '10141', type: 'I' }] },
    entity: [{ fieldset: { list: 'NUNOTA,TIPMOV,VLRNOTA' } }, { path: 'Vendedor', fieldset: { list: 'APELIDO' } }],
  })
  assert.deepEqual(answer.responseBody.entities, {
    total: '2',
    hasMoreResult: 'false',
    offsetPage: '0',
    offset: '0',
    metadata: { fields: { field: [{ name: 'NUNOTA' }, { name: 'TIPMOV' }, { name: 'VLRNOTA' }, { name: 'Vendedor_APELIDO' }] } },
    entity: [
      { f0: { $: '10001' }, f1: { $: 'V' }, f2: { $: '5955.43' }, f3: { $: 'DIEGO' } },
      { f0: { $: '10141' }, f1: {}, f2: { $: '7716.76' }, f3: { $: 'ELISA' } },
    ],
  })
  const one = await sim.loadRecords({ rootEntity: 'Vendedor', criteria: { expression: 'this.CODVEND = ?', parameter: { $: '12', type: 'I' } }, entity: { fieldset: { list: '*' } } })
  assert.deepEqual(one.responseBody.entities.entity, { f0: { $: '12' }, f1: { $: 'BRUNO' } })
  const april = await sim.loadRecords({
    rootEntity: 'CabecalhoNota',
    criteria: { expression: 'this.DTNEG BETWEEN ? AND ?', parameter: [{ $: '01/04/2026', type: 'D' }, { $: '30/04/2026', type: 'D' }] },
    entity: NOTE_FIELDS,
  })
  assert.deepEqual([april.status, april.responseBody.entities.total, april.responseBody.entities.hasMoreResult, 'entity' in april.responseBody.entities], ['1', '0', 'false', false])
})

test('wrong requests answer status 0 like Sankhya, unmodelled reads carry the [simulador] marker, and writes are refused and counted', async (t) => {
  const sim = await simulator(t)
  const statusOf = ({ status, statusMessage }) => [status, statusMessage]
  const notes = (criteria, entity = NOTE_FIELDS) => sim.loadRecords({ rootEntity: 'CabecalhoNota', criteria, entity })
  assert.deepEqual(
    [
      statusOf(await notes({ expression: { $: 'this.NOPE = ?' }, parameter: [{ $: 'V', type: 'S' }] })),
      statusOf(await notes(undefined, [NOTE_FIELDS, { path: 'Vendedor', fieldset: { list: 'NOME' } }])),
      statusOf(await sim.loadRecords({ rootEntity: 'Pedido', entity: NOTE_FIELDS })),
      statusOf(await notes({ expression: { $: 'EXTRACT(MONTH FROM this.DTNEG) = ?' }, parameter: [{ $: '3', type: 'I' }] })),
      statusOf(await sim.loadRecords({ rootEntity: 'CabecalhoNota', entity: NOTE_FIELDS, modifiedSince: '01/01/2026' })),
      statusOf(await sim.call('CRUDServiceProvider.loadRecord', { rootEntity: 'CabecalhoNota', rows: { row: { NUNOTA: { $: '10001' } } } })),
      statusOf(await sim.call('CRUDServiceProvider.saveRecord', { rootEntity: 'CabecalhoNota' })),
    ],
    [
      ['0', 'campo inexistente: NOPE'],
      ['0', 'campo inexistente: Vendedor.NOME'],
      ['0', 'entidade inexistente: "Pedido"'],
      ['0', '[simulador] função não suportada: EXTRACT'],
      ['0', '[simulador] modifiedSince não simulado'],
      ['0', '[simulador] serviço não simulado: CRUDServiceProvider.loadRecord'],
      ['3', 'serviço não autorizado para esta credencial'],
    ],
  )
  const health = await (await fetch(`${sim.origin}/__sim/health`)).json()
  assert.deepEqual(health, { fixtures: ['sales-v1'], counters: { loadRecords: 5, refusals: 3, writes: 1 } })
})

test('loadCases computes the committed sales-dashboard case truth from sales-v1 and binds nothing for the refusal case', () => {
  const cases = loadCases(fileURLToPath(new URL('../../scripts/builder-eval/cases/erp', import.meta.url)))
  assert.deepEqual(cases.map((entry) => entry.id), ['sales-dashboard', 'sankhya-not-connected'])
  const [sales, refusal] = cases
  assert.deepEqual([sales.input.fixture, sales.truth.fixture, sales.truth.figures.grandTotalCents], ['sales-v1', 'sales-v1', GRAND_TOTAL_CENTS])
  assert.deepEqual(
    sales.truth.screen.amounts.filter((amount) => amount.cents === GRAND_TOTAL_CENTS),
    [{ cents: GRAND_TOTAL_CENTS, label: 'total geral' }],
  )
  assert.deepEqual([Object.keys(refusal.input), refusal.truth], [['request'], { missingSystem: 'Sankhya' }])
})

test('loadCases refuses a case that both binds a fixture and expects a refusal', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'builder-eval-cases-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'mixed.json'), '{ "fixture": "sales-v1", "missingSystem": "Sankhya", "request": "Mostre o pedido." }')
  assert.throws(() => loadCases(dir), { message: 'builder-eval: cases/erp/mixed.json has both "fixture" and "missingSystem"; a refusal case binds nothing' })
})
