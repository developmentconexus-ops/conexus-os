import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const recordPath = join(repo, 'contracts/technical/census-builder-run.json')
const write = process.argv.includes('--write')
const list = process.argv.includes('--list')

const tracked = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
const walk = (dir, accept) => {
  const prefix = `${relative(repo, dir)}/`
  return tracked.filter((path) => path.startsWith(prefix)).map((path) => join(repo, path)).filter((path) => existsSync(path) && accept(path))
}
const rel = (path) => relative(repo, path)
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length
const closingParen = (text, open) => {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return text.length
}
const topLevelArguments = (args) => {
  const parts = []
  let depth = 0
  let current = ''
  let quoted = false
  for (const ch of args) {
    if (ch === "'") quoted = !quoted
    if (!quoted && ch === '(') depth++
    if (!quoted && ch === ')') depth--
    if (!quoted && ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += ch
  }
  if (current.trim() !== '') parts.push(current.trim())
  return parts
}
const hits = (paths, pattern, { comments = false } = {}) => paths.flatMap((path) => readFileSync(path, 'utf8').split('\n')
  .flatMap((line, i) => (pattern.test(line) && (comments || !/^\s*(\/\/|\*|\/\*)/.test(line)) ? [`${rel(path)}:${i + 1}`] : [])))

const migrationsDir = join(repo, 'apps/hub/migrations')
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  .map((file) => ({ file, text: readFileSync(join(migrationsDir, file), 'utf8') }))
const functionsInForce = new Map()
for (const { file, text } of migrations) {
  const marker = /^[ \t]*(CREATE[ \t]+(?:OR[ \t]+REPLACE[ \t]+)?FUNCTION|DROP[ \t]+FUNCTION(?:[ \t]+IF[ \t]+EXISTS)?)[ \t]+([a-z_]+\.[a-z_0-9]+)[ \t]*\(/gim
  for (const match of text.matchAll(marker)) {
    const open = match.index + match[0].length - 1
    const close = closingParen(text, open)
    const key = `${match[2]}(${topLevelArguments(text.slice(open + 1, close)).length})`
    if (/^DROP/i.test(match[1])) {
      functionsInForce.delete(key)
      continue
    }
    const tag = /\bAS\s+(\$[a-z_]*\$)/i.exec(text.slice(close))
    if (!tag) continue
    const bodyStart = close + tag.index + tag[0].length
    functionsInForce.set(key, {
      at: `${file}:${lineOf(text, match.index)}`,
      name: key,
      header: text.slice(close, bodyStart),
      body: text.slice(bodyStart, text.indexOf(tag[1], bodyStart)),
    })
  }
}
const functions = [...functionsInForce.values()]

const writesStateOrPhase = (body) => {
  for (const match of body.matchAll(/\bUPDATE\s+builder\.builder_run\b(?:\s+AS\s+\w+)?\s+SET\b/gi)) {
    const rest = body.slice(match.index + match[0].length)
    const end = rest.search(/\bWHERE\b|\bFROM\b|\bRETURNING\b|;/i)
    if (/(^|[\s,])(state|phase)\s*=/i.test(end === -1 ? rest : rest.slice(0, end))) return true
  }
  return /\bINSERT\s+INTO\s+builder\.builder_run\s*\(/i.test(body)
}
const sqlRunWriters = functions.filter((fn) => !/RETURNS\s+trigger/i.test(fn.header) && writesStateOrPhase(fn.body))
const sqlRunWriterTriggers = functions.filter((fn) => /RETURNS\s+trigger/i.test(fn.header) && /\bNEW\.(state|phase)\s*:=/i.test(fn.body))

const summaryLiterals = functions.flatMap((fn) => {
  const found = []
  for (let at = fn.body.indexOf('jsonb_build_object('); at !== -1; at = fn.body.indexOf('jsonb_build_object(', at + 1)) {
    const open = at + 'jsonb_build_object'.length
    const keys = topLevelArguments(fn.body.slice(open + 1, closingParen(fn.body, open))).filter((_, i) => i % 2 === 0)
    if (keys.includes("'builderRunId'") && keys.includes("'failureCode'")) found.push(`${fn.name} ${fn.at}`)
  }
  return found
})

const generatedJson = new Set(['contracts/technical/hub-catalog-snapshot.json'])
const sourceFiles = ['apps/hub', 'apps/web', 'contracts', 'tests', 'scripts']
  .flatMap((root) => walk(join(repo, root), (path) => /\.(ts|tsx|mjs|js|json|sql)$/.test(path)))
  .filter((path) => !rel(path).startsWith('apps/hub/migrations/') && rel(path) !== 'scripts/census-builder-run.mjs')
  .filter((path) => !generatedJson.has(rel(path)) && !readFileSync(path, 'utf8').startsWith('// GENERATED'))
const parkedReferences = sourceFiles.flatMap((path) => readFileSync(path, 'utf8').split('\n')
  .flatMap((line, i) => (/(?<![A-Z0-9_])PARKED(?![A-Z0-9_])|parked_at|parkedAt|\bpark(?:ed|s|ing)?\b|\blegs?\b/i.test(line) ? [`${rel(path)}:${i + 1}`] : [])))

const hubSource = walk(join(repo, 'apps/hub/src'), (path) => /\.tsx?$/.test(path))
const builderSource = hubSource.filter((path) => rel(path).startsWith('apps/hub/src/builder/'))
const webSource = walk(join(repo, 'apps/web/src'), (path) => /\.tsx?$/.test(path))

const abortUndoCalls = hits(hubSource, /\bsuspensions\.(clear|register)\(|\brequestAbort\(|\b(letGoOfParked|deleteSessionLeavingParked)\(/)
  .filter((at) => !/(?:const|function)\s+(letGoOfParked|deleteSessionLeavingParked)\b/.test(readFileSync(join(repo, at.split(':')[0]), 'utf8').split('\n')[Number(at.split(':')[1]) - 1]))
const hubSendMessageCalls = hits(hubSource, /\.sendMessage\(/)
// Mastra's internal registration and its workflow snapshots are released in one module only, the
// documented boundary exception for mastra-ai/mastra#25903.
const mastraInternalsOutsideLeftovers = hits(hubSource.filter((path) => rel(path) !== 'apps/hub/src/builder/mastra-leftovers.ts'), /__unregisterInternalWorkflow|deleteWorkflowRunById/)

const sessionScopes = [...new Set([...hubSource, ...webSource].flatMap((path) =>
  [...readFileSync(path, 'utf8').matchAll(/[`'^]([a-z]+):\$\{|\^([a-z]+):\(/g)].map((match) => match[1] ?? match[2])))]
  .filter((scope) => scope === 'builder' || scope === 'conversation').sort()

const collectionsAcrossModules = hits(builderSource, /^\s+[A-Za-z0-9_]+\??:\s*(?:Map|Set|WeakMap|WeakSet)</)

// An id or a source revision a Builder port or type declares as a plain string, where the contract has a brand: it lets an
// Account id sit in a Project slot. The Application registry's own types and the OAuth vendor's account id are not ours.
const BRANDED_FIELDS = 'projectId|accountId|builderRunId|runId|conversationId|sourceRevision|baseSourceRevision|resultSourceRevision|modelAccountId|executionId|revision|base|candidate|turnStart|parent|expected|next|result|unchangedFrom|sameAs'
const NOT_THE_BUILDER_PORTS = /^apps\/hub\/src\/builder\/(application-build\.ts|application-artifact-runtime\.ts|openai-codex\/credential\.ts)$/
const plainPortIds = hits(builderSource.filter((path) => !NOT_THE_BUILDER_PORTS.test(rel(path))), new RegExp(`\\b(?:${BRANDED_FIELDS})\\??: (?:string|readonly string)\\b`))
  .filter((at) => !readFileSync(join(repo, at.split(':')[0]), 'utf8').split('\n')[Number(at.split(':')[1]) - 1].includes('readApplicationFileBySource'))
// The source reads take one object, so a Project id and a revision cannot swap places.
const positionalSourceReads = hits(builderSource.filter((path) => rel(path) === 'apps/hub/src/builder/source.ts'), /^\s+(?:listSourceTree|readSourceFile|compareRevisions): async \((?!\{)/)

// A run state, phase or result kind list retyped by hand: two values of one vocabulary list on a line. The generated
// vocabulary is the one owner, and an ending is one value of it, so no module spells a second list.
const vocabulary = JSON.parse(readFileSync(join(repo, 'contracts/technical/builder-run-vocabulary.json'), 'utf8'))
const hasTwoOfOneList = (line) => Object.values(vocabulary).some((values) => values.filter((value) => line.includes(`'${value}'`)).length > 1)
const handTypedRunStates = hits(hubSource.filter((path) => /^apps\/hub\/src\/(builder|project|identity-access)\//.test(rel(path))), { test: hasTwoOfOneList })
// The final columns of a run are written once, by `endRun`: every other writer of the finish time is a second ending.
const finishWrites = hits(hubSource, /\bfinished_at\s*=/)
const runEndWriters = finishWrites.filter((at, index) => !(at.startsWith('apps/hub/src/builder/run-lifecycle.ts:') && finishWrites.findIndex((other) => other.startsWith('apps/hub/src/builder/run-lifecycle.ts:')) === index))

// A failure turned into a plain answer: `false`, `null`, an empty list or string where the call failed. A repository or
// store that cannot answer must reach the caller, never read as "absent". Sandbox, vendor-login and check-step probes
// answer about the sandbox or the vendor, not the repository, and are outside this item.
const FAILURE_DEFAULT = /\.catch\(\(\) => (?:false|null|\[\]|'')\)|\.then\(\(\) => \w+, \(\) => (?:false|null)\)|\.then\([^()]*, \(\) => (?:false|null)\)/
const NOT_REPOSITORY_OR_STORE = /^apps\/hub\/src\/builder\/(check\/|google-ai-pro\/|anthropic\/|openai-codex\/|harness\/|egress-log\.ts$)/
// In the Git adapter any failure handler that swallows the error, or renames every failure to a domain code, is the same
// conversion: git's exit code is not the answer, so a failed command is a named Git failure or a read-back, never a guess.
const GIT_ADAPTER_CONVERSION = /\.catch\(\(\) =>|\.catch\((?:async )?\(\w+(?:: unknown)?\) => \{?\s*throw new Failure\(/g
const gitAdapterConversions = builderSource.filter((path) => rel(path) === 'apps/hub/src/builder/conexus-git.ts').flatMap((path) => {
  const text = readFileSync(path, 'utf8')
  return [...text.matchAll(GIT_ADAPTER_CONVERSION)].map((found) => `${rel(path)}:${lineOf(text, found.index)}`)
})
const failureToDefault = [...hits(builderSource.filter((path) => !NOT_REPOSITORY_OR_STORE.test(rel(path))), FAILURE_DEFAULT), ...gitAdapterConversions]

const runFiles = builderSource.filter((path) => /^apps\/hub\/src\/builder\/(run\/|service\.ts$|runtime\.ts$)/.test(rel(path)))
const runFunctionLengthSuppressions = hits(runFiles, /biome-ignore lint\/complexity\/noExcessiveLinesPerFunction/, { comments: true })

// Periodic work is a Job (spec 0013); each timer that stays outside the executor carries a reasoned suppression of the
// `setInterval` ban, and the count may only fall.
const repeatedTimerSuppressions = hits(hubSource, /biome-ignore lint\/style\/noRestrictedGlobals/, { comments: true })

// Every line that names the rule is one of three things. `debt` is owed to the wave that owns the file and the
// count may only fall. `exempt <reason>` is a cast that cannot be removed and must be in the record, with its line.
// Anything else, a suppression under packages/, or a suppression that silences the rule without naming it, fails.
const DEBT = /^\s*\/\/ biome-ignore lint\/nursery\/noUnsafeTypeAssertion: debt\b/
const EXEMPT = /^\s*\/\/ biome-ignore lint\/nursery\/noUnsafeTypeAssertion: exempt (\S.*)$/
// lint/plugin is the category of a Grit plugin diagnostic: it silences only plugin rules, never noUnsafeTypeAssertion.
const UNNAMED = /biome-ignore(?:-all|-start)?\s+lint(?:\/(?!plugin\b)[A-Za-z]+)?(?![/A-Za-z])/
const SOURCE = /\.[cm]?tsx?$/
const sourceLines = (paths) => paths.flatMap((path) => readFileSync(path, 'utf8').split('\n').map((line, i) => ({ at: `${rel(path)}:${i + 1}`, line })))
const appLines = sourceLines(walk(join(repo, 'apps'), (path) => SOURCE.test(path)))
const packageLines = sourceLines(tracked.filter((path) => /^packages\/[^/]+\/src\//.test(path) && SOURCE.test(path)).map((path) => join(repo, path)).filter((path) => existsSync(path)))
const unsafeAssertionDebt = appLines.filter(({ line }) => DEBT.test(line)).map(({ at }) => at)
const exemptions = appLines.flatMap(({ at, line }) => (EXEMPT.test(line) ? [`${at} ${EXEMPT.exec(line)[1].trim()}`] : []))
const refusedSuppressions = [
  ...appLines.filter(({ line }) => line.includes('noUnsafeTypeAssertion') && !DEBT.test(line) && !EXEMPT.test(line)),
  ...packageLines.filter(({ line }) => line.includes('noUnsafeTypeAssertion')),
  ...appLines.concat(packageLines).filter(({ line }) => UNNAMED.test(line)),
].map(({ at }) => at)
const biomePath = join(repo, 'biome.json')
const biomeOverrides = existsSync(biomePath) ? (JSON.parse(readFileSync(biomePath, 'utf8')).overrides ?? []) : []
const rulesOff = biomeOverrides.flatMap((override, index) => {
  const ruleLevel = override.linter?.rules?.nursery?.noUnsafeTypeAssertion
  const off = override.linter?.enabled === false || (ruleLevel !== undefined && ruleLevel !== 'error')
  return off ? [`biome.json overrides[${index}]`] : []
})
const sourceOf = (at) => /^apps\/[^/]+\/src\/([^/:]+)\//.exec(at)?.[1] ?? '(root)'
const bySource = () => {
  const tally = new Map()
  for (const at of unsafeAssertionDebt) tally.set(sourceOf(at), (tally.get(sourceOf(at)) ?? 0) + 1)
  return [...tally].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).map(([name, count]) => `${name} ${count}`).join(', ')
}

const tableCodes = new Set(JSON.parse(readFileSync(join(repo, 'contracts/technical/failures.json'), 'utf8')).failures.map((row) => row.code))
const failureCodesWithoutRow = hubSource.flatMap((path) => [...readFileSync(path, 'utf8')
  .matchAll(/\b(?:failBuilderRun|interruptBuilderRun)\([^,()]+,\s*'([A-Z][A-Z0-9_]+)'|\bfailureCode:\s*'([A-Z][A-Z0-9_]+)'/g)]
  .map((match) => match[1] ?? match[2]).filter((code) => !tableCodes.has(code)).map((code) => `${rel(path)} ${code}`))

const census = {
  sqlRunWriters: sqlRunWriters.map((fn) => `${fn.name} ${fn.at}`),
  sqlRunWriterTriggers: sqlRunWriterTriggers.map((fn) => `${fn.name} ${fn.at}`),
  runSummaryLiterals: summaryLiterals,
  parkedReferences,
  abortUndoCalls,
  hubSendMessageCalls,
  mastraInternalsOutsideLeftovers,
  sessionScopes,
  collectionsAcrossModules,
  plainPortIds,
  failureToDefault,
  handTypedRunStates,
  runEndWriters,
  positionalSourceReads,
  runFunctionLengthSuppressions,
  failureCodesWithoutRow,
  repeatedTimerSuppressions,
  unsafeAssertionDebt,
}
const counts = Object.fromEntries(Object.entries(census).map(([item, found]) => [item, found.length]))

const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : {}
const recordedExemptions = record.unsafeAssertionExemptions ?? []
const unrecorded = exemptions.filter((entry) => !recordedExemptions.includes(entry))
const gone = recordedExemptions.filter((entry) => !exemptions.includes(entry))
const refusals = [
  ...rulesOff.map((at) => `${at} turns noUnsafeTypeAssertion off`),
  ...refusedSuppressions.map((at) => `${at} names noUnsafeTypeAssertion, or silences it without naming it, and is neither debt nor a recorded exemption`),
  ...unrecorded.map((entry) => `exemption not in the record: add "${entry}" to unsafeAssertionExemptions by hand`),
]

if (write) {
  if (refusals.length > 0) {
    for (const message of refusals) console.error(`census-builder-run: ${message}`)
    process.exit(1)
  }
  writeFileSync(recordPath, `${JSON.stringify({ ...counts, unsafeAssertionExemptions: exemptions }, null, 2)}\n`)
  console.log(`census-builder-run: recorded ${JSON.stringify(counts)}, exemptions ${exemptions.length}`)
  process.exit(0)
}
let failed = false
for (const [item, count] of Object.entries(counts)) {
  const recorded = record[item]
  const verdict = recorded === undefined ? 'NOT RECORDED' : count > recorded ? 'UP' : count < recorded ? 'down' : 'ok'
  if (verdict === 'UP' || verdict === 'NOT RECORDED') failed = true
  console.log(`census-builder-run: ${item} ${count} (record ${recorded ?? 'none'}) ${verdict}`)
  if (list || verdict === 'UP') for (const found of census[item]) console.log(`    ${found}`)
  if (list && item === 'unsafeAssertionDebt') console.log(`    by source: ${bySource()}`)
}
if (record.unsafeAssertionExemptions === undefined) {
  failed = true
  console.error('census-builder-run: unsafeAssertionExemptions is not recorded')
}
for (const message of [...refusals, ...gone.map((entry) => `recorded exemption is gone or moved: "${entry}"`)]) {
  failed = true
  console.error(`census-builder-run: ${message}`)
}
if (failed) {
  console.error('census-builder-run: a count went up or an exemption does not match the record. Remove what came back, record a lower number with --write when the change lowers it, and edit the exemption list by hand.')
  process.exit(1)
}
