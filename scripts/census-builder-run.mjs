import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const recordPath = join(repo, 'contracts/technical/census-builder-run.json')
const write = process.argv.includes('--write')
const list = process.argv.includes('--list')

const tracked = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
const walk = (dir, accept) => {
  const prefix = `${relative(repo, dir)}/`
  return tracked.filter((path) => path.startsWith(prefix)).map((path) => join(repo, path)).filter(accept)
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

const sessionScopes = [...new Set([...hubSource, ...webSource].flatMap((path) =>
  [...readFileSync(path, 'utf8').matchAll(/[`'^]([a-z]+):\$\{|\^([a-z]+):\(/g)].map((match) => match[1] ?? match[2])))]
  .filter((scope) => scope === 'builder' || scope === 'conversation').sort()

const collectionsAcrossModules = hits(builderSource, /^\s+[A-Za-z0-9_]+\??:\s*(?:Map|Set|WeakMap|WeakSet)</)

const runFiles = builderSource.filter((path) => /^apps\/hub\/src\/builder\/(run\/|service\.ts$|runtime\.ts$)/.test(rel(path)))
const runFunctionLengthSuppressions = hits(runFiles, /biome-ignore lint\/complexity\/noExcessiveLinesPerFunction/, { comments: true })

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
  sessionScopes,
  collectionsAcrossModules,
  runFunctionLengthSuppressions,
  failureCodesWithoutRow,
}
const counts = Object.fromEntries(Object.entries(census).map(([item, found]) => [item, found.length]))

if (write) {
  writeFileSync(recordPath, `${JSON.stringify(counts, null, 2)}\n`)
  console.log(`census-builder-run: recorded ${JSON.stringify(counts)}`)
  process.exit(0)
}
const record = JSON.parse(readFileSync(recordPath, 'utf8'))
let failed = false
for (const [item, count] of Object.entries(counts)) {
  const recorded = record[item]
  const verdict = recorded === undefined ? 'NOT RECORDED' : count > recorded ? 'UP' : count < recorded ? 'down' : 'ok'
  if (verdict === 'UP' || verdict === 'NOT RECORDED') failed = true
  console.log(`census-builder-run: ${item} ${count} (record ${recorded ?? 'none'}) ${verdict}`)
  if (list || verdict === 'UP') for (const found of census[item]) console.log(`    ${found}`)
}
if (failed) {
  console.error('census-builder-run: a count went up. Remove what came back, or record a lower number with --write when the change lowers it.')
  process.exit(1)
}
