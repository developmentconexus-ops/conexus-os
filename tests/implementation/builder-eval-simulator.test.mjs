import assert from 'node:assert/strict'
import test from 'node:test'
import { SALES_V1, salesFigures } from '../../scripts/builder-eval/fixtures/sales-v1.mjs'

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
