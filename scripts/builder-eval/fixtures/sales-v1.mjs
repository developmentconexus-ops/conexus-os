// sales-v1: a synthetic Sankhya with five sellers' notes from December 2025 to July 2026, and the
// known answers of the sales dashboard case computed from those same rows. Every name and value is
// invented; nothing here comes from a real company.
import { parseDate } from '../sankhya-criteria.mjs'

/** @typedef {'sales-v1'} FixtureId  grows by one literal per fixture file */
/** @typedef {'int' | 'decimal' | 'date' | 'text'} FieldType   date text is dd/mm/yyyy, decimal text is 1520.50 */
/** @typedef {Readonly<Record<string, string>>} WireRow        an absent key is a missing value ({} on the wire) */
/** @typedef {Readonly<{ entity: string, from: string, to: string }>} Reference   e.g. Vendedor via CODVEND */
/**
 * @typedef {Readonly<{ key: string, fields: Readonly<Record<string, FieldType>>,
 *   references: Readonly<Record<string, Reference>>, rows: readonly WireRow[] }>} EntityTable
 *  rows are stored in key order; the simulator never reorders them (known mistakes depend on it).
 */
/** @typedef {import('../scorers.mjs').ScreenTruth} ScreenTruth */
/** @typedef {import('../scorers.mjs').Cents} Cents */
/** @typedef {Readonly<{ codvend: string, apelido: string, month: string, cents: Cents }>} SalesCell  month 'YYYY-MM' */
/**
 * @typedef {Readonly<{ period: { from: string, to: string }, cells: readonly SalesCell[], grandTotalCents: Cents,
 *   mistakes: readonly { id: string, label: string, grandTotalCents: Cents }[] }>} SalesFigures
 */
/** @typedef {Readonly<{ fixture: FixtureId, figures: SalesFigures, screen: ScreenTruth }>} CaseTruth */
/** @typedef {Readonly<{ id: FixtureId, entities: Readonly<Record<string, EntityTable>>, truth: () => CaseTruth }>} Fixture */

/** The simulator's loadRecords page; the first-page mistakes assume it (sankhya-sim.mjs pages by the same 50). */
const PAGE_SIZE = 50
const PERIOD = Object.freeze({ from: '01/01/2026', to: '30/06/2026' })

const FROM = parseDate(PERIOD.from)
const TO = parseDate(PERIOD.to)
const inPeriod = (note) => {
  const day = parseDate(note.DTNEG)
  return day >= FROM && day <= TO
}

/** Integer cents of decimal text; never parseFloat, so 1520.50 is exactly 152050. */
const cents = (text) => {
  const [whole, fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/**
 * A note's sign under one reading of the request: +1 counts as a sale, -1 discounts, 0 ignores.
 * Only confirmed notes (STATUSNOTA 'L') count unless anyStatus; a TIPMOV not in signs, absent included, counts as other.
 */
const signed =
  (signs, { other = 0, anyStatus = false } = {}) =>
  (note) =>
    anyStatus || note.STATUSNOTA === 'L' ? (Object.hasOwn(signs, note.TIPMOV ?? '') ? signs[note.TIPMOV] : other) : 0

/** The business rule: confirmed sales count, confirmed returns are discounted, nothing else counts. */
const RIGHT = signed({ V: 1, D: -1 })
const periodRows = (notes) => notes.filter(inPeriod)

/** Each known wrong reading: which rows an app takes and how it signs them. Labels finish "aparece R$ X, …". */
const MISTAKES = Object.freeze([
  { id: 'first-page-only', label: 'o total de quem lê só a primeira página', take: (notes, pageSize) => notes.filter((note) => inPeriod(note) && RIGHT(note) !== 0).slice(0, pageSize), sign: RIGHT },
  { id: 'unfiltered-first-page', label: 'o total de quem lê só a primeira página, sem filtro', take: (notes, pageSize) => notes.slice(0, pageSize).filter(inPeriod), sign: RIGHT },
  { id: 'includes-provisional', label: 'o total de quem soma notas não confirmadas', take: periodRows, sign: signed({ V: 1, D: -1 }, { anyStatus: true }) },
  { id: 'includes-orders', label: 'o total de quem soma pedidos', take: periodRows, sign: signed({ V: 1, D: -1, P: 1 }) },
  { id: 'ignores-returns', label: 'o total de quem ignora devoluções', take: periodRows, sign: signed({ V: 1 }) },
  { id: 'adds-returns', label: 'o total de quem soma devoluções como vendas', take: periodRows, sign: signed({ V: 1, D: 1 }) },
  { id: 'includes-unknown-types', label: 'o total de quem soma tipos de movimento desconhecidos', take: periodRows, sign: signed({ V: 1, D: -1, P: 0 }, { other: 1 }) },
  { id: 'ignores-period', label: 'o total de quem ignora o período', take: (notes) => notes, sign: RIGHT },
])

const sum = (notes, sign) => notes.reduce((total, note) => total + sign(note) * cents(note.VLRNOTA), 0)
const monthOf = (note) => `${note.DTNEG.slice(6, 10)}-${note.DTNEG.slice(3, 5)}`

/**
 * Pure. The business rule and every known mistake over any notes in key order.
 * @param {{ notes: readonly WireRow[], sellers: readonly WireRow[], pageSize: number }} input
 * @returns {SalesFigures}
 */
export function salesFigures({ notes, sellers, pageSize }) {
  const apelido = new Map(sellers.map((seller) => [seller.CODVEND, seller.APELIDO]))
  const cells = new Map()
  for (const note of periodRows(notes).filter((row) => RIGHT(row) !== 0)) {
    const key = `${note.CODVEND.padStart(9, '0')} ${monthOf(note)}`
    const cell = cells.get(key) ?? { codvend: note.CODVEND, apelido: apelido.get(note.CODVEND), month: monthOf(note), cents: 0 }
    cells.set(key, { ...cell, cents: cell.cents + RIGHT(note) * cents(note.VLRNOTA) })
  }
  const grandTotalCents = sum(periodRows(notes), RIGHT)
  const mistakes = MISTAKES.map(({ id, label, take, sign }) => ({ id, label, grandTotalCents: sum(take(notes, pageSize), sign) }))
  return {
    period: PERIOD,
    cells: [...cells.keys()].sort().map((key) => cells.get(key)),
    grandTotalCents,
    // A reading that lands on the right total cannot be told apart on screen.
    mistakes: mistakes.filter((mistake) => mistake.grandTotalCents !== grandTotalCents),
  }
}

/** mulberry32: a small seeded generator, so the fixture is the same rows on every machine. */
function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const SELLERS = Object.freeze(['ALICE', 'BRUNO', 'CAMILA', 'DIEGO', 'ELISA'].map((APELIDO, index) => Object.freeze({ CODVEND: String(11 + index), APELIDO })))
const PARTNERS = Object.freeze(
  [
    'Mercearia Bom Preço Ltda',
    'Padaria Trigo Dourado',
    'Distribuidora Vale Verde',
    'Açougue Três Irmãos',
    'Farmácia Nova Esperança',
    'Papelaria Ponto Final',
    'Hortifruti Sol Nascente',
    'Materiais de Construção Alicerce',
  ].map((NOMEPARC, index) => Object.freeze({ CODPARC: String(301 + index), NOMEPARC })),
)

/**
 * Months with notes and the confirmed sales per seller in each. April 2026 has no note at all, and
 * December 2025 and July 2026 sit just outside the period.
 */
const MONTHS = Object.freeze([
  ['2025-12', 3],
  ['2026-01', 7],
  ['2026-02', 7],
  ['2026-03', 7],
  ['2026-05', 7],
  ['2026-06', 7],
  ['2026-07', 3],
])
/** Pinned days on the period's edges: a sale on each side of both boundaries. */
const EDGE_DAY = Object.freeze({ '2025-12': 31, '2026-01': 1, '2026-06': 30, '2026-07': 1 })
/** Every month's traps besides the returns: [TIPMOV (null: absent), STATUSNOTA]. */
const TRAPS = Object.freeze([
  ['V', 'A'],
  ['V', 'P'],
  ['D', 'A'],
  ['P', 'L'],
  ['P', 'A'],
  ['Z', 'L'],
  [null, 'L'],
])

const two = (value) => String(value).padStart(2, '0')

/**
 * The CabecalhoNota rows in NUNOTA order, which is date order. Seven confirmed sales of R$ 2.000 to
 * R$ 9.000 per seller and month against at most three returns of at most R$ 1.200 keep every cell
 * above R$ 10.000.
 * @returns {WireRow[]}
 */
function generateNotes(random) {
  const pick = (items) => items[Math.floor(random() * items.length)]
  const money = (from, to) => {
    const value = from * 100 + Math.floor(random() * (to - from) * 100)
    return `${Math.floor(value / 100)}.${two(value % 100)}`
  }
  const drafts = []
  for (const [month, salesPerSeller] of MONTHS) {
    const [year, monthNumber] = month.split('-').map(Number)
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const draft = (seller, TIPMOV, STATUSNOTA, VLRNOTA, day = 1 + Math.floor(random() * days)) =>
      drafts.push({ DTNEG: `${two(day)}/${two(monthNumber)}/${year}`, seller, TIPMOV, STATUSNOTA, VLRNOTA })
    for (const seller of SELLERS) {
      for (let sale = 0; sale < salesPerSeller; sale += 1) draft(seller, 'V', 'L', money(2000, 9000))
    }
    for (let count = 0; count < 3; count += 1) draft(pick(SELLERS), 'D', 'L', money(150, 1200))
    for (const [TIPMOV, STATUSNOTA] of TRAPS) draft(pick(SELLERS), TIPMOV, STATUSNOTA, money(1000, 8000))
    if (EDGE_DAY[month]) draft(pick(SELLERS), 'V', 'L', money(2000, 9000), EDGE_DAY[month])
  }
  // Array sort is stable, so notes of one day keep their draft order.
  drafts.sort((a, b) => parseDate(a.DTNEG) - parseDate(b.DTNEG))
  return drafts.map(({ DTNEG, seller, TIPMOV, STATUSNOTA, VLRNOTA }, index) =>
    Object.freeze({
      NUNOTA: String(10_001 + index),
      NUMNOTA: String(52_001 + index),
      CODEMP: random() < 0.5 ? '1' : '2',
      CODPARC: pick(PARTNERS).CODPARC,
      CODVEND: seller.CODVEND,
      DTNEG,
      ...(TIPMOV === null ? {} : { TIPMOV }),
      STATUSNOTA,
      VLRNOTA,
    }),
  )
}

const NOTES = Object.freeze(generateNotes(mulberry32(2026)))

const MONTH_LABEL = Object.freeze(['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'])

/** @returns {ScreenTruth} what a right dashboard shows, and the totals only a wrong one shows */
function screenOf(figures) {
  return Object.freeze({
    names: [...new Set(figures.cells.map((cell) => cell.apelido))],
    amounts: [
      ...figures.cells
        .filter((cell) => cell.cents !== 0)
        .map((cell) => ({ cents: cell.cents, label: `${cell.apelido} · ${MONTH_LABEL[Number(cell.month.slice(5)) - 1]}/${cell.month.slice(0, 4)}` })),
      { cents: figures.grandTotalCents, label: 'total geral' },
    ],
    mistakes: figures.mistakes.map((mistake) => ({ cents: mistake.grandTotalCents, label: mistake.label })),
  })
}

const FIGURES = Object.freeze(salesFigures({ notes: NOTES, sellers: SELLERS, pageSize: PAGE_SIZE }))
const TRUTH = Object.freeze({ fixture: 'sales-v1', figures: FIGURES, screen: screenOf(FIGURES) })

/** @type {Fixture} */
export const SALES_V1 = Object.freeze({
  id: 'sales-v1',
  entities: Object.freeze({
    CabecalhoNota: {
      key: 'NUNOTA',
      fields: { NUNOTA: 'int', NUMNOTA: 'int', CODEMP: 'int', CODPARC: 'int', CODVEND: 'int', DTNEG: 'date', TIPMOV: 'text', STATUSNOTA: 'text', VLRNOTA: 'decimal' },
      references: {
        Vendedor: { entity: 'Vendedor', from: 'CODVEND', to: 'CODVEND' },
        Parceiro: { entity: 'Parceiro', from: 'CODPARC', to: 'CODPARC' },
      },
      rows: NOTES,
    },
    Vendedor: { key: 'CODVEND', fields: { CODVEND: 'int', APELIDO: 'text' }, references: {}, rows: SELLERS },
    Parceiro: { key: 'CODPARC', fields: { CODPARC: 'int', NOMEPARC: 'text' }, references: {}, rows: PARTNERS },
  }),
  truth: () => TRUTH,
})
