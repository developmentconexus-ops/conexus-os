// The comparison half of the oracle. A separate oracle agent, with read only access to the ERP,
// writes one file per case outside every Builder workspace (its folder is named by
// CONEXUS_EVAL_ORACLE_DIR, the file is <case>.json). This script reads that file and the Preview
// the Builder produced, and records booleans and counts only: never a value, never a spot key.
//
// Oracle file:
// {
//   "case": "h1",
//   "table": { "key": "cliente", "fields": { "cliente": "Cliente", "aberto": "Total devido" }, "ignoreRows": ["^total"] },
//   "expected": {
//     "rows": 42,
//     "filled": { "cliente": 42, "aberto": 42 },
//     "sums": [ { "name": "faixas somam o total", "field": "aberto", "equals": 1234.56 },
//               { "name": "linhas somam o total do topo", "field": "aberto", "equalsLabel": "Total em atraso" } ],
//     "spotKeys": [ { "key": "CLIENTE A", "values": { "aberto": "1.234,56" } } ],
//     "sources": [ { "item": "cliente", "source": "TGFPAR.NOMEPARC" } ]
//   }
// }
//
// Usage: node scripts/builder-eval/oracle.mjs --case <id> --result <result.json> | --preview <text file> [--plan <text file>] [--out <file>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ORACLE_DIR_ENV = 'CONEXUS_EVAL_ORACLE_DIR'
const EMPTY_CELL = /^(n[ãa]o dispon[íi]vel|[-—–]|null|undefined|nan)?$/i
const TOLERANCE = 0.005

const fail = (message) => {
  throw new Error(`builder-eval oracle: ${message}`)
}

const plain = (value) => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

const object = (value, where) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${where} must be an object`)
  return value
}

const count = (value, where) => {
  if (!Number.isInteger(value) || value < 0) fail(`${where} must be a non-negative integer`)
  return value
}

/** Parses an oracle file's JSON body. */
export function parseOracle(raw) {
  object(raw, 'the oracle')
  const table = object(raw.table, 'table')
  const fields = object(table.fields, 'table.fields')
  if (Object.keys(fields).length === 0 || Object.values(fields).some((header) => typeof header !== 'string' || !header.trim())) fail('table.fields must map each field to its header text')
  if (typeof table.key !== 'string' || !(table.key in fields)) fail('table.key must name one of the fields')
  const ignoreRows = table.ignoreRows ?? ['^total']
  const expected = object(raw.expected, 'expected')
  const known = (field, where) => {
    if (!(field in fields)) fail(`${where} names the field "${field}", which table.fields does not have`)
    return field
  }
  return {
    case: typeof raw.case === 'string' ? raw.case : null,
    table: { key: table.key, fields, ignoreRows: ignoreRows.map((source) => new RegExp(source, 'iu')) },
    expected: {
      rows: count(expected.rows, 'expected.rows'),
      filled: Object.entries(object(expected.filled ?? {}, 'expected.filled')).map(([field, value]) => ({ field: known(field, 'expected.filled'), count: count(value, `expected.filled.${field}`) })),
      sums: (expected.sums ?? []).map((sum, index) => {
        if (typeof sum.name !== 'string' || (typeof sum.equals !== 'number') === (typeof sum.equalsLabel !== 'string')) fail(`expected.sums[${index}] needs a name and exactly one of equals (a number) or equalsLabel (a text)`)
        return { name: sum.name, field: known(sum.field, `expected.sums[${index}].field`), equals: sum.equals ?? null, equalsLabel: sum.equalsLabel ?? null }
      }),
      spotKeys: (expected.spotKeys ?? []).map((spot, index) => ({
        key: String(spot.key),
        values: Object.entries(object(spot.values ?? {}, `expected.spotKeys[${index}].values`)).map(([field, value]) => ({ field: known(field, `expected.spotKeys[${index}].values`), value: String(value) })),
      })),
      sources: (expected.sources ?? []).map((source) => ({ item: String(source.item), source: String(source.source) })),
    },
  }
}

/** Reads `<CONEXUS_EVAL_ORACLE_DIR>/<caseId>.json`; null when the folder is not named or holds no file for the case. */
export function loadOracle(caseId, env = process.env) {
  const dir = env[ORACLE_DIR_ENV]
  if (!dir) return null
  const path = join(dir, `${caseId}.json`)
  return existsSync(path) ? parseOracle(JSON.parse(readFileSync(path, 'utf8'))) : null
}

/** Pure. A Brazilian formatted number ("R$ 1.234,56", "1.234", "12%") as a number; null when it is not one. */
export function parseNumber(text) {
  const cleaned = String(text).replace(/[^\d.,-]/g, '')
  if (!/\d/.test(cleaned)) return null
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : /^-?\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, '') : cleaned
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Pure. The first table in the Preview's text whose header row has every field's header; rows are tab separated lines. */
export function readTable(previewText, table) {
  const lines = previewText.split('\n').map((line) => line.split('\t').map((cell) => cell.trim()))
  const headers = Object.entries(table.fields)
  const headerAt = lines.findIndex((cells) => headers.every(([, header]) => cells.some((cell) => plain(cell).includes(plain(header)))))
  if (headerAt === -1) return null
  const index = Object.fromEntries(headers.map(([field, header]) => [field, lines[headerAt].findIndex((cell) => plain(cell).includes(plain(header)))]))
  const rows = []
  for (const cells of lines.slice(headerAt + 1)) {
    if (cells.length < 2) {
      if (rows.length > 0) break
      continue
    }
    const key = cells[index[table.key]] ?? ''
    if (key === '' || table.ignoreRows.some((pattern) => pattern.test(key))) continue
    rows.push(Object.fromEntries(headers.map(([field]) => [field, cells[index[field]] ?? ''])))
  }
  return rows
}

const numberAfterLabel = (previewText, label) => {
  const match = new RegExp(`${plain(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\d-]{0,40}(-?[\\d.,]*\\d)`, 'u').exec(plain(previewText))
  return match ? parseNumber(match[1]) : null
}

const sameValue = (actual, expected) => {
  const a = parseNumber(actual)
  const e = parseNumber(expected)
  return a !== null && e !== null ? Math.abs(a - e) <= TOLERANCE : plain(actual) === plain(expected)
}

/**
 * Pure. What the Preview got right and wrong against the oracle, as booleans and counts, plus the
 * defects the scripted person can put in words. No cell, key or expected value is copied into it.
 * @returns {{ tableFound: boolean, rows: { expected: number, actual: number, equal: boolean }, filled: readonly object[], sums: readonly object[], spotKeys: readonly object[], sources: readonly object[], defects: readonly object[], passed: boolean }}
 */
export function compareToOracle(oracle, { previewText, planText = null }) {
  const rows = readTable(previewText ?? '', oracle.table)
  const header = (field) => oracle.table.fields[field]
  const actualRows = rows ?? []
  const rowsResult = { expected: oracle.expected.rows, actual: actualRows.length, equal: actualRows.length === oracle.expected.rows }
  const filled = oracle.expected.filled.map(({ field, count: expected }) => {
    const actual = actualRows.filter((row) => !EMPTY_CELL.test(row[field])).length
    return { field: header(field), expected, actual, equal: actual === expected }
  })
  const sums = oracle.expected.sums.map((sum) => {
    const total = actualRows.reduce((acc, row) => acc + (parseNumber(row[sum.field]) ?? 0), 0)
    const target = sum.equals ?? numberAfterLabel(previewText ?? '', sum.equalsLabel)
    return { name: sum.name, equal: rows !== null && target !== null && Math.abs(total - target) <= TOLERANCE }
  })
  const spotKeys = oracle.expected.spotKeys.map((spot, index) => {
    const row = actualRows.find((candidate) => plain(candidate[oracle.table.key]) === plain(spot.key))
    const wrongFields = row === undefined ? [] : spot.values.filter(({ field, value }) => !sameValue(row[field], value)).map(({ field }) => header(field))
    return { index, found: row !== undefined, equal: row !== undefined && wrongFields.length === 0, wrongFields }
  })
  const sources = oracle.expected.sources.map(({ item, source }) => ({ item, present: planText !== null && plain(planText).includes(plain(source)) }))
  const defects = [
    ...(rowsResult.equal ? [] : [{ kind: 'rows', expected: rowsResult.expected, actual: rowsResult.actual }]),
    ...filled.filter((entry) => !entry.equal).map((entry) => ({ kind: 'filled', field: entry.field, expected: entry.expected, actual: entry.actual })),
    ...sums.filter((entry) => !entry.equal).map((entry) => ({ kind: 'sum', name: entry.name })),
    ...[...new Set(spotKeys.flatMap((spot) => spot.wrongFields))].map((field) => ({ kind: 'spot', field })),
  ]
  return { tableFound: rows !== null, rows: rowsResult, filled, sums, spotKeys, sources, defects, passed: defects.length === 0 }
}

const usage = 'Usage: node scripts/builder-eval/oracle.mjs --case <id> (--result <result.json> | --preview <text file>) [--plan <text file>] [--out <file>]'

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) fail(usage)
    args[argv[index].slice(2)] = argv[index + 1]
  }
  if (!args.case || (!args.result && !args.preview)) fail(usage)
  const oracle = loadOracle(args.case, env)
  if (!oracle) fail(`no oracle file for ${args.case}: name the folder in ${ORACLE_DIR_ENV}`)
  const previewText = args.preview ? readFileSync(resolve(args.preview), 'utf8') : JSON.parse(readFileSync(resolve(args.result), 'utf8')).previewText
  if (typeof previewText !== 'string') fail('the result has no previewText (a run with --mask-values keeps digits out of it, so compare from an unmasked text file)')
  const comparison = compareToOracle(oracle, { previewText, planText: args.plan ? readFileSync(resolve(args.plan), 'utf8') : null })
  const body = `${JSON.stringify({ case: args.case, ...comparison }, null, 2)}\n`
  if (args.out) writeFileSync(resolve(args.out), body, 'utf8')
  process.stdout.write(body)
  return comparison.passed ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
