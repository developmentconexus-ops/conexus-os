import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const sourcePath = 'contracts/technical/failures.json'
const eventsPath = 'contracts/technical/log-events.json'
export const failureTargets = Object.freeze({
  hub: 'apps/hub/src/platform/failures.generated.ts',
  contract: 'packages/contract/src/failures.generated.ts',
  events: 'apps/hub/src/platform/log-events.generated.ts',
  text: 'apps/hub/src/platform/failure-text.generated.ts',
})

const CATEGORIES = Object.freeze(['USER', 'SYSTEM', 'THIRD_PARTY'])
const AUDIENCES = Object.freeze(['operator', 'person', 'person+app'])
const IMPERATIVES = ['peça', 'peca', 'escolha', 'conecte', 'entre', 'confira', 'corrija', 'envie', 'tente', 'verifique', 'novamente', 'de novo']
const COMMAND_WORD = new RegExp(`(?<!\\p{L})(${IMPERATIVES.join('|')})(?!\\p{L})`, 'u')

export const readFailures = (root = repositoryRoot) => {
  const table = JSON.parse(readFileSync(resolve(root, sourcePath), 'utf8'))
  return { ...table, events: JSON.parse(readFileSync(resolve(root, eventsPath), 'utf8')).events }
}

/** Every rule a row of the table must keep, each as one sentence naming the code. */
export const failureProblems = ({ actions, failures, events = [] }) => {
  const problems = []
  const seen = new Set()
  const rowCodes = new Set(failures.map((row) => row.code))
  const eventSeen = new Set()
  for (const event of events) {
    if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(event)) problems.push(`LOG_EVENTS_INVALID: ${event} is not UPPER_SNAKE`)
    if (eventSeen.has(event)) problems.push(`LOG_EVENTS_INVALID: ${event} appears twice`)
    eventSeen.add(event)
    if (rowCodes.has(event)) problems.push(`LOG_EVENTS_INVALID: ${event} is a failure row; a failure is logged through logFailure, not as an event`)
  }
  for (const row of failures) {
    const where = `FAILURES_INVALID: ${row.code}`
    if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(row.code)) problems.push(`${where} is not UPPER_SNAKE`)
    if (seen.has(row.code)) problems.push(`${where} appears twice`)
    seen.add(row.code)
    if (!CATEGORIES.includes(row.category)) problems.push(`${where} has category ${row.category}`)
    if (!AUDIENCES.includes(row.audience)) problems.push(`${where} has audience ${row.audience}`)
    if (row.status !== undefined && !(Number.isInteger(row.status) && row.status >= 400 && row.status <= 599)) problems.push(`${where} has status ${row.status}`)
    if (row.audience === 'operator') {
      if (row.message !== undefined || row.action !== undefined) problems.push(`${where} is an operator row and has no message or action`)
      continue
    }
    if (typeof row.message !== 'string' || row.message === '') problems.push(`${where} has no message`)
    else {
      const command = COMMAND_WORD.exec(row.message.toLowerCase())?.[1]
      if (command) problems.push(`${where} says "${command}" in its message; what the person does is the action's sentence, never the message's`)
      if (row.category === 'SYSTEM' && !/registrad/.test(row.message)) problems.push(`${where} is a SYSTEM row whose message does not say the failure was recorded`)
    }
    if (!Object.hasOwn(actions, row.action)) problems.push(`${where} has action ${row.action}`)
    if (row.category === 'SYSTEM' && row.action === 'RETRY_LATER') problems.push(`${where} is a SYSTEM row with RETRY_LATER; Conexus failures are fixed in code, not retried`)
  }
  return problems
}

const header = `// GENERATED from ${sourcePath} by scripts/generate-failures.mjs. Do not edit.`
const quoted = (value) => JSON.stringify(value).replaceAll('"', "'")

const renderHubFailures = ({ failures }) => [
  header,
  '',
  "type FailureCategory = 'USER' | 'SYSTEM' | 'THIRD_PARTY'",
  'type FailureRow = Readonly<{ category: FailureCategory; status: number }>',
  '',
  'export const FAILURES = {',
  ...failures.map((row) => `  ${quoted(row.code)}: { category: ${quoted(row.category)}, status: ${row.status ?? 500} },`),
  '} as const satisfies Readonly<Record<string, FailureRow>>',
  '',
  'export type FailureCode = keyof typeof FAILURES',
  '',
].join('\n')

const renderFailureText = ({ actions, failures }) => [
  header,
  '',
  '/** What a page the Hub renders itself says for a row that reaches a person: the message, then its action. */',
  'export const FAILURE_TEXT = {',
  ...failures.filter((row) => row.audience !== 'operator').map((row) => `  ${quoted(row.code)}: ${quoted([row.message, actions[row.action]].filter(Boolean).join(' '))},`),
  '} as const satisfies Readonly<Record<string, string>>',
  '',
].join('\n')

const renderContractFailureTables = ({ actions, failures, rows = failures }) => [
  'export const FAILURE_STATUS = {',
  ...Array.from({ length: Math.ceil(failures.length / 4) }, (_entry, index) =>
    `  ${failures.slice(index * 4, index * 4 + 4).map((row) => `${quoted(row.code)}: ${row.status ?? 500},`).join(' ')}`),
  '} as const',
  '',
  'export const FAILURE_CODES = [',
  ...Array.from({ length: Math.ceil(failures.length / 4) }, (_entry, index) =>
    `  ${failures.slice(index * 4, index * 4 + 4).map((row) => `${quoted(row.code)},`).join(' ')}`),
  '] as const',
  '',
  'export type FailureCode = (typeof FAILURE_CODES)[number]',
  '',
  "export type FailureCategory = 'USER' | 'SYSTEM' | 'THIRD_PARTY'",
  '',
  'export const FAILURE_ACTIONS = {',
  ...Object.entries(actions).map(([action, sentence]) => `  ${quoted(action)}: ${sentence === null ? 'null' : quoted(sentence)},`),
  '} as const',
  '',
  'export type FailureAction = keyof typeof FAILURE_ACTIONS',
  '',
  'export const FAILURES = {',
  ...rows.filter((row) => row.audience !== 'operator').map((row) => `  ${quoted(row.code)}: { category: ${quoted(row.category)}, audience: ${quoted(row.audience)}, message: ${quoted(row.message)}, action: ${quoted(row.action)}, status: ${row.status ?? 500} },`),
  "} as const satisfies Readonly<Record<string, Readonly<{ category: FailureCategory; audience: 'person' | 'person+app'; message: string; action: FailureAction; status: number }>>>",
  '',
].join('\n')

const renderAppFailureClientSource = (table) => {
  const appRows = table.failures.filter((row) =>
    row.audience === 'person+app' || ['INTERNAL_UNEXPECTED', 'HUB_UNREACHABLE', 'HUB_RESPONSE_UNREADABLE'].includes(row.code))
  const appTable = renderContractFailureTables({ ...table, rows: appRows })
  const problem = readFileSync(resolve(repositoryRoot, 'packages/contract/src/problem.ts'), 'utf8')
    .replace(/^import \{ FAILURE_CODES, FAILURE_STATUS \} from '\.\/failures\.generated\.js'\n/m, '')
  const client = readFileSync(resolve(repositoryRoot, 'packages/contract/src/failure-client.ts'), 'utf8')
    .replace(/^import .*\n/gm, '')
  return `// Generated by Conexus from @conexus/contract failure-client and Problem. Never edit.\n${appTable}\n${problem}\n${client}`
}

const renderContractFailures = (table) => `${renderContractFailureTables(table)}export const APP_FAILURE_CLIENT_SOURCE = ${JSON.stringify(renderAppFailureClientSource(table)).replaceAll('${', '\\u0024{')}\n`

const renderLogEvents = ({ events }) => [
  header.replace(sourcePath, eventsPath),
  '',
  'const LOG_EVENTS = [',
  ...events.map((event) => `  ${quoted(event)},`),
  '] as const',
  '',
  'export type EventCode = (typeof LOG_EVENTS)[number]',
  '',
].join('\n')

/** Every problem in the table and every generated file that is not what the table renders. */
/** Every generated file as the table renders it, by path. */
export const renderFailureTargets = (table) => ({
  [failureTargets.hub]: renderHubFailures(table),
  [failureTargets.contract]: renderContractFailures(table),
  [failureTargets.events]: renderLogEvents(table),
  [failureTargets.text]: renderFailureText(table),
})

export const failuresDrift = (table, generated) => {
  const drift = failureProblems(table)
  for (const [target, rendered] of Object.entries(renderFailureTargets(table))) {
    if (generated[target] !== rendered) drift.push(`FAILURES_STALE: ${target} is not generated from ${sourcePath}; run node scripts/generate-failures.mjs`)
  }
  return drift
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const table = readFailures()
  if (process.argv.includes('--check')) {
    const generated = Object.fromEntries(Object.values(failureTargets).map((target) => [target, readFileSync(resolve(repositoryRoot, target), 'utf8')]))
    const drift = failuresDrift(table, generated)
    if (drift.length > 0) {
      process.stderr.write(`${drift.join('\n')}\n`)
      process.exit(1)
    }
  } else {
    const problems = failureProblems(table)
    if (problems.length > 0) {
      process.stderr.write(`${problems.join('\n')}\n`)
      process.exit(1)
    }
    for (const [target, rendered] of Object.entries(renderFailureTargets(table))) writeFileSync(resolve(repositoryRoot, target), rendered)
  }
}
