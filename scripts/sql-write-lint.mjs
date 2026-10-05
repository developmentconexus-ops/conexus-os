// The write lint of spec 0015 (admission, section 5): the filter of a write is visible in the template that writes.
const PLACEHOLDER = '$'

// One left to right pass, so a comment opener inside a literal is not a comment and a quote inside a comment is not a literal.
const normalizeSql = (text) => text
  .replace(/'(?:[^']|'')*'|\/\*[\s\S]*?\*\/|--[^\n]*/g, (token) => (token.startsWith("'") ? "''" : ' '))
  .toLowerCase()
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

const predicateProblem = (predicate) => {
  const text = predicate.replace(/\breturning\b[\s\S]*$/, '').trim()
  if (text === '') return 'an empty where'
  if (CONSTANT_PREDICATE.test(text) || CONSTANT_DISJUNCT.test(text)) return 'a where whose predicate is a constant'
  if (!COLUMN_COMPARISON.test(text)) return 'a where with no comparison of a column written in the template'
  return null
}

const article = (word) => (word === 'update' ? 'an' : 'a')

const analyzeStatement = (statement, problems) => {
  const { top, groups } = groupsOf(statement)
  const first = /^[a-z]+/.exec(top)?.[0]
  if (first === 'with') {
    const segments = top.split('()')
    const isBody = (index) => /\bas\s*(?:(?:not\s+)?materialized\s*)?$/.test(segments[index])
    let last = -1
    groups.forEach((group, index) => {
      if (!isBody(index)) return
      analyzeStatement(group.body.trim(), problems)
      last = index
    })
    const main = segments.slice(last + 1).join('()').replace(/^[\s,]+/, '').trim()
    if (last >= 0 && main !== '') analyzeStatement(main, problems)
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
    }
    return
  }
  if (first === 'insert') {
    const conflict = /\bon conflict\b[\s\S]*?\bdo update\b([\s\S]*)$/.exec(top)
    if (conflict && !/\bwhere\b/.test(conflict[1])) problems.push('an insert ... on conflict do update with no where')
  }
}

// Returns the problems of one template text; an empty list means the template is clean.
export const writeProblems = (joined) => {
  const problems = []
  for (const statement of normalizeSql(joined).split(';')) if (statement.trim() !== '') analyzeStatement(statement.trim(), problems)
  return problems
}
