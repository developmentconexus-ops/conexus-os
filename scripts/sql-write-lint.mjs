// The write lint of spec 0015 (admission, section 5): the filter of a write is visible in the template that writes.
const PLACEHOLDER = '$'

// One left to right pass, so a comment opener inside a literal is not a comment and a quote inside a comment is not a literal.
const normalizeSql = (text) => text
  .replace(/'(?:[^']|'')*'|\/\*[\s\S]*?\*\/|--[^\n]*/g, (token) => (token.startsWith("'") ? "''" : ' '))
  .toLowerCase()
  .replaceAll('"', '')
  .replace(/\s+/g, ' ')
  .trim()

// Joins the literal parts of a template with one placeholder per interpolation.
export const joinTemplate = (parts) => parts.join(PLACEHOLDER)

const groupsOf = (text) => {
  let depth = 0
  let top = ''
  const groups = []
  let start = -1
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '(') {
      if (depth === 0) start = index + 1
      depth += 1
      if (depth === 1) top += '('
    } else if (char === ')') {
      depth -= 1
      if (depth === 0) {
        groups.push({ body: text.slice(start, index), before: top })
        top += ')'
      }
    } else if (depth === 0) top += char
  }
  return { top, groups }
}

const COLUMN_COMPARISON = /(?<![\w$.])[a-z_][\w]*(?:\.[a-z_][\w]*)*\s*(?:=|<>|!=|<=|>=|<|>|\bin\b|\bis\b|\blike\b|\bilike\b|\bbetween\b)/
const CONSTANT_PREDICATE = /^\(?\s*(?:true|not\s+false|(\d+)\s*=\s*\1|''\s*=\s*'')\s*\)?$/

const CONSTANT_DISJUNCT = /\bor\s+\(?\s*(?:true|(\d+)\s*=\s*\1)\b/

const article = (word) => (word === 'update' ? 'an' : 'a')

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The target of an update or a delete, and the name it goes by in the where: its alias, or the table.
const UPDATE_TARGET = /^update\s+(?:only\s+)?([\w.]+)(?:\s+(?:as\s+)?(?!set\b)(\w+))?\s+set\b/
const DELETE_TARGET = /^delete\s+from\s+(?:only\s+)?([\w.]+)(?:\s+(?:as\s+)?(?!using\b|where\b|returning\b)(\w+))?(?=\s|$)/

// A key or tenant column compared with a value the template names: a placeholder, a list or a subquery.
const keyComparison = (column, qualifiers) => new RegExp(`(?<![\\w$.])(?:(?:${qualifiers.map(escapeRegExp).join('|')})\\.)?${escapeRegExp(column)}\\s*(?:=\\s*(?:\\$|any\\s*\\(\\)|\\(\\))|\\bin\\s*\\(\\))`)

const keyProblem = (first, top, where, splitTables) => {
  const target = (first === 'update' ? UPDATE_TARGET : DELETE_TARGET).exec(top)
  const keys = target ? splitTables[target[1]] : undefined
  if (!keys) return null
  const qualifiers = [target[1], target[1].split('.').at(-1), ...(target[2] ? [target[2]] : [])]
  if (keys.some((column) => keyComparison(column, qualifiers).test(where))) return null
  return `${article(first)} ${first} of ${target[1]} whose where compares none of its key columns (${keys.join(', ') || 'none registered'})`
}

const predicateProblem = (predicate) => {
  const text = predicate.replace(/\breturning\b[\s\S]*$/, '').trim()
  if (text === '') return 'an empty where'
  if (CONSTANT_PREDICATE.test(text) || CONSTANT_DISJUNCT.test(text)) return 'a where whose predicate is a constant'
  if (!COLUMN_COMPARISON.test(text)) return 'a where with no comparison of a column written in the template'
  return null
}

const analyzeStatement = (statement, problems, splitTables) => {
  const { top, groups } = groupsOf(statement)
  const first = /^[a-z]+/.exec(top)?.[0]
  if (first === 'with') {
    const segments = top.split('()')
    const isBody = (index) => /\bas\s*(?:(?:not\s+)?materialized\s*)?$/.test(segments[index])
    let last = -1
    groups.forEach((group, index) => {
      if (!isBody(index)) return
      analyzeStatement(group.body.trim(), problems, splitTables)
      last = index
    })
    const main = segments.slice(last + 1).join('()').replace(/^[\s,]+/, '').trim()
    if (last >= 0 && main !== '') analyzeStatement(main, problems, splitTables)
    return
  }
  if (first === 'merge') {
    problems.push('a merge')
    return
  }
  if (first === 'update' || first === 'delete') {
    const where = /\bwhere\b([\s\S]*)$/.exec(top)
    if (!where) problems.push(`${article(first)} ${first} with no where outside parentheses`)
    else {
      const problem = predicateProblem(where[1])
      if (problem) problems.push(`${article(first)} ${first} with ${problem}`)
      else {
        const keyed = keyProblem(first, top, where[1], splitTables)
        if (keyed) problems.push(keyed)
      }
    }
    return
  }
  if (first === 'insert') {
    const conflict = /\bon conflict\b[\s\S]*?\bdo update\b([\s\S]*)$/.exec(top)
    if (conflict && !/\bwhere\b/.test(conflict[1])) problems.push('an insert ... on conflict do update with no where')
  }
}

// Returns the problems of one template text; an empty list means the template is clean. splitTables maps
// a split table to the key and tenant columns its register row names: an update or a delete of one must
// compare one of them in its where.
export const writeProblems = (joined, splitTables = {}) => {
  const problems = []
  for (const statement of normalizeSql(joined).split(';')) if (statement.trim() !== '') analyzeStatement(statement.trim(), problems, splitTables)
  return problems
}
