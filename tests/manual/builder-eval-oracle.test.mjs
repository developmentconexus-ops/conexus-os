import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compareToOracle, loadOracle, main, parseNumber, parseOracle, readTable } from '../../scripts/builder-eval/oracle.mjs'

const oracleFile = {
  case: 'h1',
  table: { key: 'cliente', fields: { cliente: 'Cliente', aberto: 'Total devido', dias: 'Dias em atraso' } },
  expected: {
    rows: 3,
    filled: { cliente: 3, aberto: 3, dias: 3 },
    sums: [
      { name: 'linhas somam o total do topo', field: 'aberto', equalsLabel: 'Total em atraso' },
      { name: 'linhas somam o valor do oráculo', field: 'aberto', equals: 1000 },
    ],
    spotKeys: [{ key: 'Cliente B', values: { aberto: '300,00', dias: '45' } }],
    sources: [{ item: 'cliente', source: 'TGFPAR.NOMEPARC' }, { item: 'valor em aberto', source: 'TGFFIN.VLRDESDOB' }],
  },
}

const goodPreview = [
  'Inadimplência', 'Total em atraso\tR$ 1.000,00', '',
  'Cliente\tTotal devido\tDias em atraso',
  'Cliente A\tR$ 500,00\t10',
  'Cliente B\tR$ 300,00\t45',
  'Cliente C\tR$ 200,00\t90',
  'Total geral\tR$ 1.000,00\t',
  'Fim',
].join('\n')

const oracle = parseOracle(oracleFile)

test('a Preview that matches the oracle passes with every count equal and no defects', () => {
  const result = compareToOracle(oracle, { previewText: goodPreview, planText: 'Fontes: TGFPAR.NOMEPARC para o cliente' })
  assert.deepEqual(result, {
    tableFound: true,
    rows: { expected: 3, actual: 3, equal: true },
    filled: [
      { field: 'Cliente', expected: 3, actual: 3, equal: true },
      { field: 'Total devido', expected: 3, actual: 3, equal: true },
      { field: 'Dias em atraso', expected: 3, actual: 3, equal: true },
    ],
    sums: [{ name: 'linhas somam o total do topo', equal: true }, { name: 'linhas somam o valor do oráculo', equal: true }],
    spotKeys: [{ index: 0, found: true, equal: true, wrongFields: [] }],
    sources: [{ item: 'cliente', present: true }, { item: 'valor em aberto', present: false }],
    defects: [],
    passed: true,
  })
})

test('a missing row, an unavailable column, a wrong sum and a wrong spot value each become one defect', () => {
  const preview = [
    'Total em atraso\tR$ 1.000,00',
    'Cliente\tTotal devido\tDias em atraso',
    'Cliente A\tR$ 500,00\tNão disponível',
    'Cliente B\tR$ 350,00\tNão disponível',
  ].join('\n')
  const result = compareToOracle(oracle, { previewText: preview })
  assert.deepEqual(result.rows, { expected: 3, actual: 2, equal: false })
  assert.deepEqual(result.defects, [
    { kind: 'rows', expected: 3, actual: 2 },
    { kind: 'filled', field: 'Cliente', expected: 3, actual: 2 },
    { kind: 'filled', field: 'Total devido', expected: 3, actual: 2 },
    { kind: 'filled', field: 'Dias em atraso', expected: 3, actual: 0 },
    { kind: 'sum', name: 'linhas somam o total do topo' },
    { kind: 'sum', name: 'linhas somam o valor do oráculo' },
    { kind: 'spot', field: 'Total devido' },
    { kind: 'spot', field: 'Dias em atraso' },
  ])
  assert.equal(result.passed, false)
})

test('a Preview with no table is a failed comparison, not an error', () => {
  const result = compareToOracle(oracle, { previewText: 'Erro ao carregar', planText: null })
  assert.equal(result.tableFound, false)
  assert.deepEqual(result.rows, { expected: 3, actual: 0, equal: false })
  assert.equal(result.passed, false)
  assert.deepEqual(result.sources.map((source) => source.present), [false, false])
})

test('the comparison copies no cell, key or expected value into its record', () => {
  const record = JSON.stringify(compareToOracle(oracle, { previewText: goodPreview.replace('300,00', '350,00') }))
  for (const secret of ['Cliente A', 'Cliente B', '500,00', '350,00', '1000', 'TGFPAR']) assert.ok(!record.includes(secret), secret)
})

test('the table reader skips total rows and stops at the first line that is not a row', () => {
  assert.deepEqual(readTable(goodPreview, oracle.table).map((row) => row.cliente), ['Cliente A', 'Cliente B', 'Cliente C'])
})

test('Brazilian numbers parse with thousands dots and a decimal comma', () => {
  assert.deepEqual(['R$ 1.234,56', '1.234', '12,5%', '-3,00', 'abc'].map(parseNumber), [1234.56, 1234, 12.5, -3, null])
})

test('an oracle file with a sum on an unknown field is refused', () => {
  const broken = { ...oracleFile, expected: { ...oracleFile.expected, sums: [{ name: 'x', field: 'nada', equals: 1 }] } }
  assert.throws(() => parseOracle(broken), /names the field "nada"/)
})

test('the oracle folder comes from the environment and no folder means no oracle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
  try {
    writeFileSync(join(dir, 'h1.json'), JSON.stringify(oracleFile))
    assert.equal(loadOracle('h1', { CONEXUS_EVAL_ORACLE_DIR: dir }).expected.rows, 3)
    assert.equal(loadOracle('h2', { CONEXUS_EVAL_ORACLE_DIR: dir }), null)
    assert.equal(loadOracle('h1', {}), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the command line writes the comparison and exits 0 only when the Preview passes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
  try {
    writeFileSync(join(dir, 'h1.json'), JSON.stringify(oracleFile))
    writeFileSync(join(dir, 'preview.txt'), goodPreview)
    writeFileSync(join(dir, 'bad.txt'), 'Cliente\tTotal devido\tDias em atraso\nCliente A\t1,00\t1')
    const written = []
    const stdout = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk) => { written.push(String(chunk)); return true }
    let good
    let bad
    try {
      good = main(['--case', 'h1', '--preview', join(dir, 'preview.txt'), '--out', join(dir, 'out.json')], { CONEXUS_EVAL_ORACLE_DIR: dir })
      bad = main(['--case', 'h1', '--preview', join(dir, 'bad.txt')], { CONEXUS_EVAL_ORACLE_DIR: dir })
    } finally {
      process.stdout.write = stdout
    }
    assert.deepEqual([good, bad], [0, 1])
    assert.equal(JSON.parse(written[0]).passed, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
