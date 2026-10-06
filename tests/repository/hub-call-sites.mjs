import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubSourceRoot = resolve(repositoryRoot, 'apps/hub/src')
const roleRegister = JSON.parse(readFileSync(resolve(repositoryRoot, 'contracts/technical/hub-database-roles.json'), 'utf8'))
export const registeredRoles = new Set([...roleRegister.roles, ...roleRegister.transactionRoles].map(({ role }) => role))

// A pool is a local variable, so no parse of the Hub's TypeScript tells a reader which login role
// reaches a given function. This table declares it. A call site missing from it fails, which is
// what stops a new call being added without saying who runs it, and a row here with no call site
// fails too, so the table cannot outlive the code it describes.
export const ROLE_BY_CALL_SITE = Object.freeze({
  'identity-access/admission.ts': Object.freeze({
    'iam.lock_administrators': 'hub_command',
    'rls.acting_installation_administrator': 'hub_reader',
  }),
})

const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name)
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : []
})

// A database call is `schema.function(` behind a SQL keyword. A TypeScript method call such as
// `workspace.register(app)` has the same shape, so the keyword is what separates them. Arguments
// are counted by balancing parentheses because real call sites nest and carry casts.
const argumentsAt = (text, open) => {
  let depth = 0
  let start = open + 1
  const args = []
  for (let at = open; at < text.length; at += 1) {
    const character = text[at]
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) {
        const last = text.slice(start, at).trim()
        if (last !== '') args.push(last)
        return args
      }
    } else if (character === ',' && depth === 1) {
      args.push(text.slice(start, at).trim())
      start = at + 1
    }
  }
  return null
}

const CALL_PATTERN = /\b(SELECT|FROM|JOIN)\s+(iam|workspace|project|builder|reg|rls|claude_connection|model_connection)\.([a-z_][a-z0-9_]*)\s*\(/g

export const hubCallSites = () => {
  const found = []
  for (const path of sourceFiles(hubSourceRoot)) {
    const file = path.slice(hubSourceRoot.length + 1).replaceAll('\\', '/')
    const raw = readFileSync(path, 'utf8')
    const lineStarts = [0]
    for (let at = 0; at < raw.length; at += 1) if (raw[at] === '\n') lineStarts.push(at + 1)
    const lineOf = (offset) => {
      let line = 0
      while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line += 1
      return line + 1
    }
    // Offsets stay usable across a statement broken over several lines by collapsing runs of
    // whitespace to a single space in place rather than removing them.
    const flat = raw.replace(/\s/g, ' ')
    for (const match of flat.matchAll(CALL_PATTERN)) {
      const args = argumentsAt(flat, match.index + match[0].length - 1)
      if (args === null) continue
      found.push({ file, line: lineOf(match.index), name: `${match[2]}.${match[3]}`, arity: args.length })
    }
  }
  return found.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`))
}
