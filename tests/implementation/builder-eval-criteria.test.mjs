import assert from 'node:assert/strict'
import test from 'node:test'
import { compileCriteria } from '../../scripts/builder-eval/sankhya-criteria.mjs'

const FIELDS = Object.freeze({ DTNEG: 'date', TIPMOV: 'text', STATUSNOTA: 'text', VLRNOTA: 'decimal', CODVEND: 'int' })
const ROW = Object.freeze({ DTNEG: '15/03/2026', TIPMOV: 'V', STATUSNOTA: 'L', VLRNOTA: '1520.50', CODVEND: '3' })
const NO_TIPMOV = Object.freeze({ DTNEG: '15/03/2026', STATUSNOTA: 'L', VLRNOTA: '1520.50', CODVEND: '3' })

const S = (value) => ({ $: value, type: 'S' })
const D = (value) => ({ $: value, type: 'D' })

const judge = (expression, parameter, row = ROW) => {
  const compiled = compileCriteria({ expression: { $: expression }, parameter }, FIELDS)
  return compiled.ok ? compiled.matches(row) : compiled.error
}

test('criteria match the row exactly when the whole expression is true', () => {
  const cases = [
    ['this.TIPMOV = ?', [S('V')], true],
    ['this.DTNEG BETWEEN ? AND ?', [D('01/01/2026'), D('30/06/2026')], true],
    ['this.DTNEG BETWEEN ? AND ?', [D('01/04/2026'), D('30/04/2026')], false],
    ['this.DTNEG NOT BETWEEN ? AND ?', [D('01/04/2026'), D('30/04/2026')], true],
    ["this.TIPMOV IN ('V','D') AND this.STATUSNOTA = 'L'", [], true],
    ["this.TIPMOV NOT IN ('P', 'Z')", [], true],
    ['this.VLRNOTA > ?', [{ $: '1000', type: 'F' }], true],
    ['this.VLRNOTA = 1520.5', [], true],
    ['this.CODVEND = ?', [{ $: '3', type: 'I' }], true],
    ["this.CODVEND = '3'", [], true],
    ['NOT (this.CODVEND = 3)', [], false],
    ["this.TIPMOV = 'P' OR this.TIPMOV = 'V' AND this.STATUSNOTA = 'X'", [], false],
    ["(this.TIPMOV = 'P' OR this.TIPMOV = 'V') AND this.STATUSNOTA = 'L'", [], true],
    ["this.DTNEG >= TO_DATE(?, 'DD/MM/YYYY')", [S('01/03/2026')], true],
    ["this.DTNEG < TO_DATE('2026-03-15', 'YYYY-MM-DD')", [], false],
    ["TRUNC(this.DTNEG) <= TO_DATE('15/03/2026 23:59:59', 'DD/MM/YYYY HH24:MI:SS')", [], true],
    ["this.DTNEG >= '01/03/2026'", [], true],
    ['this.DTNEG > ?', [S('2026-03-15')], false],
    ["this.STATUSNOTA LIKE 'L%'", [], true],
    ["this.STATUSNOTA LIKE 'l%'", [], false],
    ["this.DTNEG LIKE '__/03/2026'", [], true],
    ["UPPER(this.TIPMOV) = 'V' AND LOWER(this.STATUSNOTA) = 'l'", [], true],
    ['tipmov = ? and this.codvend <> 4', [S('V')], true],
    ["this.TIPMOV = 'it''s'", [], false],
  ]
  assert.deepEqual(
    cases.map(([expression, parameter]) => [expression, judge(expression, parameter)]),
    cases.map(([expression, , expected]) => [expression, expected]),
  )
})

test('a comparison with a missing value is unknown, so neither it nor its negation matches', () => {
  const cases = [
    ["this.TIPMOV <> 'P'", false],
    ["NOT (this.TIPMOV = 'P')", false],
    ["this.TIPMOV NOT IN ('P', 'D')", false],
    ["this.TIPMOV IN ('P', 'D') OR this.STATUSNOTA = 'L'", true],
    ["NOT (this.TIPMOV = 'P' AND this.STATUSNOTA = 'X')", true],
    ["this.TIPMOV NOT LIKE 'P%'", false],
    ['this.TIPMOV IS NULL', true],
    ['this.TIPMOV IS NOT NULL', false],
    ['this.CODVEND = NULL', false],
    ['NOT (this.CODVEND = NULL)', false],
  ]
  assert.deepEqual(
    cases.map(([expression]) => [expression, judge(expression, [], NO_TIPMOV)]),
    cases.map(([expression, expected]) => [expression, expected]),
  )
})

test('criteria come as { $ } or a bare string, parameters as one object or a list, and no criteria match every row', () => {
  const bare = compileCriteria({ expression: 'this.TIPMOV = ?', parameter: S('V') }, FIELDS)
  const other = { ...ROW, TIPMOV: 'D' }
  assert.deepEqual([bare.ok, bare.matches(ROW), bare.matches(other)], [true, true, false])
  const none = compileCriteria(undefined, FIELDS)
  assert.deepEqual([none.ok, none.matches(ROW), none.matches(NO_TIPMOV)], [true, true, true])
})

test("the Builder's mistakes are query errors and valid SQL the simulator does not model is a simulator limit", () => {
  const query = (message) => ({ kind: 'query', message })
  const limit = (message) => ({ kind: 'simulator-limit', message })
  const cases = [
    ['this.NOPE = ?', [S('V')], query('campo inexistente: NOPE')],
    ['this.TIPMOV = ?', [], query('a expressão tem 1 parâmetro(s) e vieram 0')],
    ['this.TIPMOV = ?', [S('V'), S('D')], query('a expressão tem 1 parâmetro(s) e vieram 2')],
    ["this.TIPMOV = 'V'; DELETE", [], query('sintaxe inválida perto de ";"')],
    ["this.TIPMOV = 'V' -- tudo", [], query('sintaxe inválida perto de "--"')],
    ["this.TIPMOV = 'V' AND", [], query('sintaxe inválida: a expressão termina antes da hora')],
    ["this.TIPMOV 'V'", [], query('sintaxe inválida perto de "\'V\'"')],
    ["this.TIPMOV = 'V", [], query('texto sem o apóstrofo de fechamento')],
    ['this.DTNEG >= ?', [D('31/02/2026')], query('parâmetro 1 não é uma data dd/mm/aaaa: "31/02/2026"')],
    ['this.CODVEND = ?', [{ $: 'três', type: 'I' }], query('parâmetro 1 não é um número do tipo I: "três"')],
    ['this.CODVEND = ?', [{ $: '3', type: 'X' }], query('parâmetro 1 tem tipo inválido: "X" (use I, F, S ou D)')],
    ["this.DTNEG >= 'ontem'", [], query("'ontem' não é uma data")],
    ['this.DTNEG = this.CODVEND', [], query('tipos incompatíveis: data e número')],
    ['EXTRACT(MONTH FROM this.DTNEG) = ?', [{ $: '3', type: 'I' }], limit('função não suportada: EXTRACT')],
    ["this.DTNEG >= DATE '2026-01-01'", [], limit('literal DATE não suportado (use TO_DATE ou um parâmetro do tipo D)')],
    ["Vendedor.APELIDO = 'ANA'", [], limit('caminho de junção não suportado: Vendedor.APELIDO')],
    ['this.CODVEND = :vendedor', [], limit('parâmetro nomeado não suportado: :vendedor (use ?)')],
    ['this.CODVEND IN (SELECT CODVEND FROM TGFVEN)', [], limit('subconsulta não suportada')],
    ['this.VLRNOTA * 2 > ?', [{ $: '1000', type: 'F' }], limit('operador não suportado: *')],
    ["this.DTNEG >= TO_DATE(?, 'MON-YYYY')", [S('MAR-2026')], limit('formato de data não suportado em TO_DATE: MON-YYYY')],
    ['this.DTNEG > SYSDATE', [], limit('SYSDATE não suportado (use um parâmetro do tipo D)')],
  ]
  assert.deepEqual(
    cases.map(([expression, parameter]) => [expression, judge(expression, parameter)]),
    cases.map(([expression, , expected]) => [expression, expected]),
  )
})
