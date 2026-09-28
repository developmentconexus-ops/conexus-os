// The criteria language of the simulated Sankhya's loadRecords: the SQL subset a Builder writes in
// criteria.expression, bound to criteria.parameter and evaluated per row with SQL three-valued logic.

/** @typedef {import('./fixtures/sales-v1.mjs').FieldType} FieldType */
/** @typedef {import('./fixtures/sales-v1.mjs').WireRow} WireRow */
/**
 * @typedef {Readonly<{ kind: 'query', message: string }>
 *   | Readonly<{ kind: 'simulator-limit', message: string }>} CriteriaError
 *  query: the Builder's mistake, a real ERP refuses too. simulator-limit: valid SQL the simulator does not model.
 */
/**
 * A value's static type. A date is days since 1970-01-01 (a fraction carries the time of day).
 * @typedef {'num' | 'date' | 'text' | 'null'} ValueType
 */
/** @typedef {number | string | null} Value  null is SQL NULL */
/** true, false, or null for UNKNOWN. @typedef {boolean | null} Truth */
/**
 * @typedef {Readonly<{ type: ValueType, constant: boolean, value: (row: WireRow) => Value }>} Operand
 *  constant: reads no row, so it is evaluated and coerced once, at compile time.
 */

class CriteriaFailure extends Error {
  /** @param {CriteriaError['kind']} kind */
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}

const refuse = (message) => {
  throw new CriteriaFailure('query', message)
}
const unsupported = (message) => {
  throw new CriteriaFailure('simulator-limit', message)
}

/**
 * Compiles a loadRecords criteria ({ expression: { $ } | string, parameter: P | P[] }) against the
 * root entity's field types. Parse once per request, test per row. Absent criteria match every row.
 * @param {unknown} criteria
 * @param {Readonly<Record<string, FieldType>>} fields
 * @returns {{ ok: true, matches: (row: WireRow) => boolean } | { ok: false, error: CriteriaError }}
 */
export function compileCriteria(criteria, fields) {
  try {
    const expression = typeof criteria?.expression === 'string' ? criteria.expression : criteria?.expression?.$
    if (typeof expression !== 'string' || expression.trim() === '') return { ok: true, matches: () => true }
    const raw = criteria.parameter ?? []
    const parameters = (Array.isArray(raw) ? raw : [raw]).map(bindParameter)
    const predicate = parse(tokenize(expression), parameters, fields)
    return { ok: true, matches: (row) => predicate(row) === true }
  } catch (error) {
    if (!(error instanceof CriteriaFailure)) throw error
    return { ok: false, error: { kind: error.kind, message: error.message } }
  }
}

const DAY_MS = 86_400_000
const DMY = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/
const YMD = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/

/**
 * Days since 1970-01-01 for dd/mm/yyyy or yyyy-mm-dd text, each with an optional HH:MI[:SS]; null
 * when the text is neither or names no real day (31/02/2026).
 * @param {'dmy' | 'ymd' | 'any'} order
 */
export function parseDate(text, order = 'any') {
  const dmy = order !== 'ymd' && DMY.exec(text)
  const ymd = !dmy && order !== 'dmy' && YMD.exec(text)
  if (!dmy && !ymd) return null
  const [day, month, year] = dmy ? [dmy[1], dmy[2], dmy[3]] : [ymd[3], ymd[2], ymd[1]]
  const [hour = '0', minute = '0', second = '0'] = (dmy || ymd).slice(4).map((part) => part ?? '0')
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day))
  const date = new Date(ms)
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1 || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null
  return ms / DAY_MS + (Number(hour) * 3600 + Number(minute) * 60 + Number(second)) / 86_400
}

const two = (value) => String(value).padStart(2, '0')

/** The text a value converts to where SQL wants text (LIKE, UPPER): dates as dd/mm/yyyy. */
const toText = (type, value) => {
  if (value === null || type === 'text') return value
  if (type === 'num') return String(value)
  const date = new Date(Math.floor(value) * DAY_MS)
  return `${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`
}

const NUMBER_TEXT = /^-?\d+(?:\.\d+)?$/

/** A field's wire text as a value of its FieldType; an absent key is NULL. */
const fieldValue = (type, text) => {
  if (text === undefined) return null
  if (type === 'date') return parseDate(text)
  if (type === 'int' || type === 'decimal') return NUMBER_TEXT.test(text) ? Number(text) : null
  return text
}

const FIELD_VALUE_TYPE = Object.freeze({ int: 'num', decimal: 'num', date: 'date', text: 'text' })

const constant = (type, value) => Object.freeze({ type, constant: true, value: () => value })

/** criteria.parameter entry { $, type } as a constant: I and F numbers, S text, D a dd/mm/yyyy date. */
function bindParameter(parameter, index) {
  const text = parameter?.$
  const label = `parâmetro ${index + 1}`
  if (text === undefined || text === null) return constant('null', null)
  if (typeof text !== 'string') refuse(`${label}: o valor vem como texto em "$"`)
  switch (parameter.type) {
    case 'I':
    case 'F':
      if (!NUMBER_TEXT.test(text.trim()) || (parameter.type === 'I' && text.includes('.'))) refuse(`${label} não é um número do tipo ${parameter.type}: "${text}"`)
      return constant('num', Number(text))
    case 'S':
      return constant('text', text)
    case 'D': {
      const days = parseDate(text.trim(), 'dmy')
      if (days === null) refuse(`${label} não é uma data dd/mm/aaaa: "${text}"`)
      return constant('date', days)
    }
    default:
      return refuse(`${label} tem tipo inválido: ${JSON.stringify(parameter.type ?? null)} (use I, F, S ou D)`)
  }
}

/**
 * @typedef {Readonly<{ k: 'word' | 'num' | 'str' | 'param' | 'sym' | 'end', v: string, raw?: string, at: number }>} Token
 *  a word's v is upper case (unquoted SQL names ignore case); raw is the source text where it differs from v.
 */

const SYMBOLS = ['<>', '!=', '<=', '>=', '||', '=', '<', '>', '(', ')', ',', '.', '+', '-', '*', '/']

/** @returns {Token[]} ending in one 'end' token */
function tokenize(text) {
  const tokens = []
  let at = 0
  while (at < text.length) {
    const rest = text.slice(at)
    const space = /^\s+/.exec(rest)
    if (space) {
      at += space[0].length
      continue
    }
    if (rest.startsWith('--') || rest.startsWith('/*') || rest.startsWith(';')) refuse(`sintaxe inválida perto de "${rest.slice(0, 2).trim()}"`)
    const word = /^[A-Za-z_][A-Za-z0-9_$#]*/.exec(rest)
    const number = /^\d+(?:\.\d+)?/.exec(rest)
    if (word) tokens.push({ k: 'word', v: word[0].toUpperCase(), raw: word[0], at })
    else if (number) tokens.push({ k: 'num', v: number[0], at })
    else if (rest[0] === "'") {
      const quoted = /^'((?:[^']|'')*)'/.exec(rest)
      if (!quoted) refuse('texto sem o apóstrofo de fechamento')
      tokens.push({ k: 'str', v: quoted[1].replaceAll("''", "'"), raw: quoted[0], at })
      at += quoted[0].length
      continue
    } else if (rest[0] === '?') tokens.push({ k: 'param', v: '?', at })
    else if (rest[0] === ':' && /^:[A-Za-z_]/.test(rest)) unsupported(`parâmetro nomeado não suportado: ${/^:\w+/.exec(rest)[0]} (use ?)`)
    else if (rest[0] === '"') unsupported('identificador entre aspas duplas não suportado')
    else {
      const symbol = SYMBOLS.find((candidate) => rest.startsWith(candidate))
      if (!symbol) refuse(`sintaxe inválida perto de "${rest[0]}"`)
      tokens.push({ k: 'sym', v: symbol, at })
    }
    at += (tokens.at(-1).raw ?? tokens.at(-1).v).length
  }
  tokens.push({ k: 'end', v: '', at })
  return tokens
}

const and3 = (a, b) => (a === false || b === false ? false : a === null || b === null ? null : true)
const or3 = (a, b) => (a === true || b === true ? true : a === null || b === null ? null : false)
const not3 = (a) => (a === null ? null : !a)
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

const COMPARATORS = new Map([
  ['=', (c) => c === 0],
  ['<>', (c) => c !== 0],
  ['!=', (c) => c !== 0],
  ['<', (c) => c < 0],
  ['<=', (c) => c <= 0],
  ['>', (c) => c > 0],
  ['>=', (c) => c >= 0],
])
const TYPE_LABEL = Object.freeze({ num: 'número', date: 'data', text: 'texto' })

/** A text constant as a number or date constant, the implicit conversion a database makes. */
function coerce(operand, type) {
  const text = operand.value({})
  const value = type === 'date' ? parseDate(text.trim()) : NUMBER_TEXT.test(text.trim()) ? Number(text) : null
  if (value === null) refuse(`'${text}' não é ${type === 'date' ? 'uma data' : 'um número'}`)
  return constant(type, value)
}

/** @returns {[Operand, Operand]} both of one type, or one of them NULL */
function unify(left, right) {
  if (left.type === right.type || left.type === 'null' || right.type === 'null') return [left, right]
  if (left.type === 'text' && left.constant) return [coerce(left, right.type), right]
  if (right.type === 'text' && right.constant) return [left, coerce(right, left.type)]
  return refuse(`tipos incompatíveis: ${TYPE_LABEL[left.type]} e ${TYPE_LABEL[right.type]}`)
}

/** @returns {(row: WireRow) => Truth} */
function comparison(operator, left, right) {
  const [a, b] = unify(left, right)
  const test = COMPARATORS.get(operator)
  return (row) => {
    const x = a.value(row)
    const y = b.value(row)
    return x === null || y === null ? null : test(order(x, y))
  }
}

const likeRegex = (pattern) =>
  new RegExp(`^${[...pattern].map((c) => (c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`, 's')

/** A constant when every argument is, so a bad literal fails at compile time, not per row. */
const derived = (type, args, compute) => {
  const value = (row) => compute(...args.map((arg) => arg.value(row)))
  return args.every((arg) => arg.constant) ? constant(type, value({})) : Object.freeze({ type, constant: false, value })
}

const arity = (name, args, ...counts) => {
  if (!counts.includes(args.length)) refuse(`${name} recebe ${counts.join(' ou ')} argumento(s) e vieram ${args.length}`)
}

const DATE_FORMAT = /^(DD\/MM\/YYYY|YYYY-MM-DD)(?: HH24:MI(?::SS)?)?$/i

/** @type {Readonly<Record<string, (args: Operand[]) => Operand>>} */
const FUNCTIONS = Object.freeze({
  TO_DATE(args) {
    arity('TO_DATE', args, 1, 2)
    const [input, format] = args
    let dateOrder = 'any'
    if (format) {
      const text = format.constant && format.type === 'text' ? format.value({}) : null
      const known = text === null ? null : DATE_FORMAT.exec(text)
      if (!known) unsupported(`formato de data não suportado em TO_DATE: ${text ?? '(não constante)'}`)
      dateOrder = known[1].toUpperCase() === 'DD/MM/YYYY' ? 'dmy' : 'ymd'
    }
    if (input.type === 'date' || input.type === 'null') return input
    if (input.type !== 'text') refuse('TO_DATE espera um texto')
    if (input.constant && parseDate(input.value({}).trim(), dateOrder) === null) refuse(`TO_DATE não reconhece '${input.value({})}' como data`)
    return derived('date', [input], (text) => (text === null ? null : parseDate(text.trim(), dateOrder)))
  },
  TRUNC(args) {
    if (args.length === 2) unsupported('TRUNC com formato não suportado')
    arity('TRUNC', args, 1)
    const [input] = args
    if (input.type !== 'date' && input.type !== 'num' && input.type !== 'null') refuse('TRUNC espera uma data ou um número')
    return derived(input.type, args, (value) => (value === null ? null : input.type === 'date' ? Math.floor(value) : Math.trunc(value)))
  },
  UPPER(args) {
    arity('UPPER', args, 1)
    return derived('text', args, (value) => toText(args[0].type, value)?.toUpperCase() ?? null)
  },
  LOWER(args) {
    arity('LOWER', args, 1)
    return derived('text', args, (value) => toText(args[0].type, value)?.toLowerCase() ?? null)
  },
})

/** @typedef {{ tokens: Token[], index: number, used: number, parameters: Operand[], fields: Readonly<Record<string, FieldType>> }} Parser */

const peek = (p) => p.tokens[p.index]
const next = (p) => p.tokens[p.index++]
const isWord = (p, v) => peek(p).k === 'word' && peek(p).v === v
const isSym = (p, v) => peek(p).k === 'sym' && peek(p).v === v
const syntaxError = (token) => refuse(token.k === 'end' ? 'sintaxe inválida: a expressão termina antes da hora' : `sintaxe inválida perto de "${token.raw ?? token.v}"`)
/** Consumes the next token when it is that word or symbol. */
const acceptWord = (p, v) => isWord(p, v) && Boolean(next(p))
const acceptSym = (p, v) => isSym(p, v) && Boolean(next(p))
const expectSym = (p, v) => (isSym(p, v) ? next(p) : syntaxError(peek(p)))
const expectWord = (p, v) => (isWord(p, v) ? next(p) : syntaxError(peek(p)))

/** @returns {(row: WireRow) => Truth} */
function parse(tokens, parameters, fields) {
  const p = { tokens, index: 0, used: 0, parameters, fields }
  const predicate = orExpr(p)
  if (peek(p).k !== 'end') syntaxError(peek(p))
  if (p.used !== parameters.length) refuse(`a expressão tem ${p.used} parâmetro(s) e vieram ${parameters.length}`)
  return predicate
}

function orExpr(p) {
  const items = [andExpr(p)]
  while (acceptWord(p, 'OR')) items.push(andExpr(p))
  return items.length === 1 ? items[0] : (row) => items.reduce((truth, item) => or3(truth, item(row)), false)
}

function andExpr(p) {
  const items = [notExpr(p)]
  while (acceptWord(p, 'AND')) items.push(notExpr(p))
  return items.length === 1 ? items[0] : (row) => items.reduce((truth, item) => and3(truth, item(row)), true)
}

function notExpr(p) {
  if (!acceptWord(p, 'NOT')) return predicate(p)
  const inner = notExpr(p)
  return (row) => not3(inner(row))
}

function predicate(p) {
  if (acceptSym(p, '(')) {
    const inner = orExpr(p)
    expectSym(p, ')')
    return inner
  }
  const left = operand(p)
  const token = peek(p)
  if (token.k === 'sym' && COMPARATORS.has(token.v)) {
    next(p)
    return comparison(token.v, left, operand(p))
  }
  if (acceptWord(p, 'IS')) {
    const negated = acceptWord(p, 'NOT')
    expectWord(p, 'NULL')
    return (row) => (left.value(row) === null) !== negated
  }
  const negated = acceptWord(p, 'NOT')
  const outcome = negated ? not3 : (truth) => truth
  if (acceptWord(p, 'IN')) {
    expectSym(p, '(')
    if (isWord(p, 'SELECT')) unsupported('subconsulta não suportada')
    const tests = [comparison('=', left, operand(p))]
    while (acceptSym(p, ',')) tests.push(comparison('=', left, operand(p)))
    expectSym(p, ')')
    return (row) => outcome(tests.reduce((truth, test) => or3(truth, test(row)), false))
  }
  if (acceptWord(p, 'BETWEEN')) {
    const above = comparison('>=', left, operand(p))
    expectWord(p, 'AND')
    const below = comparison('<=', left, operand(p))
    return (row) => outcome(and3(above(row), below(row)))
  }
  if (acceptWord(p, 'LIKE')) {
    const pattern = operand(p)
    if (isWord(p, 'ESCAPE')) unsupported('LIKE com ESCAPE não suportado')
    if (pattern.type !== 'text' && pattern.type !== 'null') refuse('o padrão de LIKE precisa ser um texto')
    return (row) => {
      const text = toText(left.type, left.value(row))
      const shape = pattern.value(row)
      return text === null || shape === null ? null : outcome(likeRegex(shape).test(text))
    }
  }
  return syntaxError(peek(p))
}

const ARITHMETIC = new Set(['+', '-', '*', '/', '||'])
const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'IS', 'LIKE', 'ESCAPE', 'FROM', 'WHERE', 'THEN', 'ELSE', 'END'])
const UNSUPPORTED_WORDS = Object.freeze({
  SELECT: 'subconsulta não suportada',
  EXISTS: 'EXISTS não suportado',
  CASE: 'CASE não suportado',
  SYSDATE: 'SYSDATE não suportado (use um parâmetro do tipo D)',
  CURRENT_DATE: 'CURRENT_DATE não suportado (use um parâmetro do tipo D)',
  CURRENT_TIMESTAMP: 'CURRENT_TIMESTAMP não suportado (use um parâmetro do tipo D)',
})

/** @returns {Operand} */
function operand(p) {
  const token = next(p)
  let result
  if (token.k === 'num') result = constant('num', Number(token.v))
  else if (token.k === 'sym' && token.v === '-' && peek(p).k === 'num') result = constant('num', -Number(next(p).v))
  else if (token.k === 'str') result = constant('text', token.v)
  else if (token.k === 'param') result = p.parameters[p.used++] ?? constant('null', null)
  else if (token.k === 'word') result = wordOperand(p, token)
  else syntaxError(token)
  if (peek(p).k === 'sym' && ARITHMETIC.has(peek(p).v)) unsupported(`operador não suportado: ${peek(p).v}`)
  return result
}

/** NULL, a function call, this.FIELD or FIELD; anything else a word can start is refused. */
function wordOperand(p, token) {
  if (token.v === 'NULL') return constant('null', null)
  if (token.v === 'DATE' && peek(p).k === 'str') unsupported('literal DATE não suportado (use TO_DATE ou um parâmetro do tipo D)')
  if (Object.hasOwn(UNSUPPORTED_WORDS, token.v)) unsupported(UNSUPPORTED_WORDS[token.v])
  if (isSym(p, '(')) {
    const fn = FUNCTIONS[token.v]
    if (!fn) unsupported(`função não suportada: ${token.v}`)
    next(p)
    const args = isSym(p, ')') ? [] : [operand(p)]
    while (acceptSym(p, ',')) args.push(operand(p))
    expectSym(p, ')')
    return fn(args)
  }
  const path = [token]
  while (acceptSym(p, '.')) {
    const part = next(p)
    if (part.k !== 'word') syntaxError(part)
    path.push(part)
  }
  const names = path[0].v === 'THIS' && path.length > 1 ? path.slice(1) : path
  if (names.length > 1) unsupported(`caminho de junção não suportado: ${names.map((part) => part.raw).join('.')}`)
  const [name] = names
  if (KEYWORDS.has(name.v)) syntaxError(name)
  const type = p.fields[name.v]
  if (!type) refuse(`campo inexistente: ${name.v}`)
  return Object.freeze({ type: FIELD_VALUE_TYPE[type], constant: false, value: (row) => fieldValue(type, row[name.v]) })
}
