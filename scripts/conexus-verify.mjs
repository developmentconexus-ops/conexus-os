import { randomUUID } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptFile = fileURLToPath(import.meta.url)

/**
 * The aliases are deliberately small and static.  They are routing names, not
 * a second verification implementation or a claim about the state of a gate.
 */
export const SCOPE_MANIFEST = Object.freeze({
  preflight: Object.freeze({ npmScript: 'conexus:preflight', npmArgs: Object.freeze([]) }),
  repository: Object.freeze({ npmScript: 'repository:check', npmArgs: Object.freeze([]) }),
  final: Object.freeze({ npmScript: 'verify', npmArgs: Object.freeze([]) }),
})

const POSTGRES_ENV_DEFAULTS = Object.freeze({
  CONEXUS_TEST_DB_HOST: '127.0.0.1',
  CONEXUS_TEST_DB_PORT: '5432',
  CONEXUS_TEST_DB_NAME: 'conexus_test',
  CONEXUS_TEST_DB_USER: 'postgres',
  CONEXUS_TEST_DB_PASSWORD: 's6-ci-test-only',
})

// A class names what a step needs. Postgres and browser steps get a PostgreSQL; only a step of a
// browser class may launch one.
const POSTGRES_CLASSES = new Set(['postgres', 'browser'])
export const BROWSER_CLASSES = new Set(['browser', 'live'])

const candidateStep = (scope, command, environmentClass = 'static') => Object.freeze({
  scope,
  command,
  environmentClass,
  graph: 'candidate',
})

// Groups run side by side on one machine each need their own directory: the build starts by emptying it.
const HUB_BUILD_DIRECTORY = process.env.CONEXUS_VERIFY_HUB_BUILD_DIRECTORY ?? 'node_modules/.cache/conexus-hub-build'

// The hub typecheck also emits, once, the compiled Hub every Hub suite imports, and the bundle of the
// application check the Hub sends to each VM. It runs first and publishes the directory to the steps
// after it, so no suite compiles the Hub again.
const hubBuildStep = Object.freeze({
  ...candidateStep('hub-typecheck', `rm -rf ${HUB_BUILD_DIRECTORY} && node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --pretty false --noEmit false --outDir ${HUB_BUILD_DIRECTORY} && node scripts/build-app-check.mjs ${HUB_BUILD_DIRECTORY}`),
  publishes: Object.freeze({ CONEXUS_HUB_BUILD: HUB_BUILD_DIRECTORY }),
})

const TEST_GROUP_GLOBS = Object.freeze({
  repository: Object.freeze(['tests/repository/!(*.browser|*.postgres).test.mjs']),
  implementation: Object.freeze(['tests/implementation/!(*.browser|*.postgres|*.network|conexus-backup).test.mjs', 'tests/implementation/access/*.test.mjs']),
  backup: Object.freeze(['tests/implementation/conexus-backup.test.mjs']),
  postgres: Object.freeze(['tests/implementation/*.postgres.test.mjs']),
  browser: Object.freeze(['tests/implementation/*.browser.test.mjs', 'tests/implementation/*.network.test.mjs']),
  live: Object.freeze(['tests/live/*.test.mjs']),
})

const testCommand = (group, flags, shard) =>
  `node --test ${flags}${shard ? `--test-shard=${shard} ` : ''}${TEST_GROUP_GLOBS[group].map(glob => `'${glob}'`).join(' ')}`

// A shardable step can run as one slice of a group on its own machine: node splits the test files
// by position, so a new file lands in a slice without a list to keep.
const testStep = (scope, group, environmentClass, flags = '', { shardable = false } = {}) =>
  Object.freeze({
    ...candidateStep(scope, testCommand(group, flags), environmentClass),
    ...(shardable ? { shardCommand: (shard) => testCommand(group, flags, shard) } : {}),
  })

/**
 * The candidate profile is the review-lane composition: the static checks first, so a run that is
 * going to fail on them fails in seconds, then the test suites by group. Historical npm scripts
 * remain available for explicit invocation, but are not part of this graph.
 */
const GRAPH_STEPS = Object.freeze([
  hubBuildStep,
  candidateStep('web-typecheck', 'node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --pretty false'),
  candidateStep('biome', 'npx --no-install biome ci . --error-on-warnings'),
  candidateStep('knip', 'npx --no-install knip'),
  candidateStep('repository-check', 'npm run repository:check'),
  candidateStep('import-law-check', 'node scripts/check-import-law.mjs'),
  candidateStep('access-owner-check', 'node scripts/check-access-owner.mjs'),
  candidateStep('census-builder-run', 'node scripts/census-builder-run.mjs'),
  candidateStep('census-boundaries', 'node scripts/census-boundaries.mjs'),
  candidateStep('contract-dist-check', 'npm run contract:dist:check'),
  candidateStep('generators', 'npm run generate'),
  candidateStep('contract-check', 'npm run contract:check'),
  candidateStep('e2b-template-check', 'node scripts/builder-e2b-template.mjs --check'),
  candidateStep('web-style', 'node scripts/check-web-style.mjs'),
  candidateStep('wire-openapi-lint', 'npm run wire:lint'),
  candidateStep('wire-bijection', 'npm run wire:bijection'),
  candidateStep('wire-technical-lint', 'npm run wire:technical-lint'),
  candidateStep('web-build', 'node node_modules/vite/bin/vite.js build --config apps/web/vite.config.mjs apps/web --outDir ../../node_modules/.cache/conexus-candidate-web-build --emptyOutDir'),
  testStep('repository-tests', 'repository', 'static'),
  testStep('implementation-tests', 'implementation', 'static'),

  candidateStep('db-catalog-snapshot', 'npm run db:catalog:check', 'postgres'),
  candidateStep('function-callers', 'npm run db:callers:check', 'postgres'),
  candidateStep('db-baseline-file', 'npm run db:baseline:check', 'postgres'),
  testStep('postgres-tests', 'postgres', 'postgres', '--test-concurrency=1 '),

  testStep('browser-tests', 'browser', 'browser', '--test-concurrency=1 ', { shardable: true }),

  // The backup suite boots its own PostgreSQL and Keycloak containers and runs the real backup and
  // restore scripts, about as long as every other suite of the rest group together, so it is a group.
  testStep('backup-tests', 'backup', 'backup'),

  // One Hub, one Chromium and a scripted model for the whole suite, so the flows share one boot.
  candidateStep('live-builder', 'npm run test:live', 'live'),

  candidateStep('only-opt-in-skips', 'node scripts/check-test-skips.mjs'),
])

export const CANDIDATE_GRAPH = GRAPH_STEPS

// CI runs the graph as jobs, each on its own machine with its own PostgreSQL and CPU. A step's
// group follows from its class: rest (static checks and the suites that need nothing), postgres,
// browser, live, backup. Two steps belong to every group: the Hub build, which publishes the compiled Hub
// the suites import, and the skip check, which reads the ledger of the job it runs in.
export const VERIFY_GROUPS = Object.freeze(['browser', 'postgres', 'rest', 'live', 'backup'])
const GROUP_OF_CLASS = Object.freeze({ browser: 'browser', postgres: 'postgres', static: 'rest', live: 'live', backup: 'backup' })
const EVERY_GROUP = new Set([hubBuildStep.scope, 'only-opt-in-skips'])

export const groupsOf = (step) => {
  if (EVERY_GROUP.has(step.scope)) return VERIFY_GROUPS
  return [GROUP_OF_CLASS[step.environmentClass]]
}
export const graphForGroup = (graph, group) => graph.filter(step => groupsOf(step).includes(group))

// A change that touches only documentation runs these steps: every step that reads a Markdown file,
// the repository tests, the bijection check, and the skip check that
// closes every run. The path test lives in scripts/ci-change-scope.mjs.
export const DOCS_CHECK_SCOPES = Object.freeze([
  'repository-check',
  'wire-bijection',
  'repository-tests',
  'only-opt-in-skips',
])

export const DOCS_GRAPH = Object.freeze(CANDIDATE_GRAPH.filter(step => DOCS_CHECK_SCOPES.includes(step.scope)))

export const QUICK_CHECK_SCOPES = Object.freeze(['web-typecheck', 'hub-typecheck', 'repository-check', 'contract-dist-check', 'generators', 'contract-check', 'web-style', 'knip', 'biome', 'import-law-check', 'access-owner-check', 'census-builder-run', 'census-boundaries'])

export const QUICK_GRAPH = Object.freeze(CANDIDATE_GRAPH.filter(step => QUICK_CHECK_SCOPES.includes(step.scope)))


const GRAPHS = Object.freeze({ candidate: CANDIDATE_GRAPH, 'candidate-docs': DOCS_GRAPH, 'candidate-quick': QUICK_GRAPH })

// Descriptive aliases make the manifest easy to discover for tests and small
// callers without creating another mutable allowlist.
export const ALLOWED_ALIASES = Object.freeze(Object.keys(SCOPE_MANIFEST))
export const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))

class VerificationCliError extends Error {
  constructor(message, exitCode = 2) {
    super(message)
    this.name = 'VerificationCliError'
    this.exitCode = exitCode
  }
}

function own(object, key) {
  return Object.hasOwn(object, key)
}

export function loadPackageScripts(root = repositoryRoot) {
  const packagePath = resolve(root, 'package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (packageJson.scripts === null || typeof packageJson.scripts !== 'object' || Array.isArray(packageJson.scripts)) {
    throw new Error('package.json scripts must be an object')
  }
  return packageJson.scripts
}

export function parseArguments(argv = process.argv.slice(2)) {
  const options = { scopes: [], list: false, dryRun: false, json: false, help: false, group: null, shard: null }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (argument === '--list') {
      options.list = true
      continue
    }
    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (argument === '--json') {
      options.json = true
      continue
    }

    if (argument === '--group' || argument.startsWith('--group=')) {
      if (argument === '--group') index += 1
      const value = argument === '--group' ? argv[index] : argument.slice('--group='.length)
      if (!VERIFY_GROUPS.includes(value)) throw new VerificationCliError(`--group must be one of ${VERIFY_GROUPS.join(', ')}`)
      options.group = value
      continue
    }

    if (argument === '--shard' || argument.startsWith('--shard=')) {
      if (argument === '--shard') index += 1
      const value = argument === '--shard' ? argv[index] : argument.slice('--shard='.length)
      const [position, total] = (value ?? '').split('/').map(Number)
      if (!/^[1-9]\d*\/[1-9]\d*$/.test(value ?? '') || position > total) throw new VerificationCliError('--shard must be <position>/<total>, for example 2/4')
      options.shard = value
      continue
    }

    let scopeValue
    if (argument === '--scope') {
      index += 1
      scopeValue = argv[index]
      if (scopeValue === undefined || scopeValue.startsWith('--')) {
        throw new VerificationCliError('--scope requires a non-empty value')
      }
    } else if (argument.startsWith('--scope=')) {
      scopeValue = argument.slice('--scope='.length)
      if (!scopeValue) throw new VerificationCliError('--scope requires a non-empty value')
    } else {
      throw new VerificationCliError(`unknown option: ${argument}`)
    }

    const scopes = scopeValue.split(',').map(scope => scope.trim())
    if (scopes.some(scope => !scope)) throw new VerificationCliError('--scope contains an empty value')
    options.scopes.push(...scopes)
  }

  if (!options.help && !options.list && options.scopes.length === 0) {
    throw new VerificationCliError('--scope is required (use --list to inspect available scopes)')
  }

  return options
}

function manifestEntry(scope) {
  const entry = SCOPE_MANIFEST[scope]
  if (!entry) return null
  return {
    scope,
    npmScript: entry.npmScript,
    npmArgs: [...entry.npmArgs],
    alias: true,
  }
}

export function resolveScope(scope, packageScripts = loadPackageScripts()) {
  if (typeof scope !== 'string' || !scope.trim()) {
    throw new VerificationCliError('scope must be a non-empty string')
  }

  const normalized = scope.trim()
  if (own(GRAPHS, normalized)) {
    return { scope: normalized, command: null, graph: normalized }
  }
  const alias = manifestEntry(normalized)
  if (alias) return alias

  if (own(packageScripts, normalized)) {
    if (isMutationScript(normalized)) {
      throw new VerificationCliError(
        `npm script is not permitted as a verification scope: ${normalized} (generation/recording scripts may mutate repository state)`,
      )
    }
    return { scope: normalized, npmScript: normalized, npmArgs: [], alias: false }
  }

  const allowedScripts = Object.keys(packageScripts).sort()
  const suffix = allowedScripts.length ? `; npm scripts: ${allowedScripts.join(', ')}` : ''
  throw new VerificationCliError(
    `unknown verification scope: ${normalized}; aliases: ${ALLOWED_ALIASES.join(', ')}${suffix}`,
  )
}

export function resolveScopes(scopes, packageScripts = loadPackageScripts()) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new VerificationCliError('at least one verification scope is required')
  }
  return scopes.map(scope => resolveScope(scope, packageScripts))
}

export function assertExecutionEnvironment(entries, { platform = process.platform, dryRun = false } = {}) {
  if (dryRun) return
  if (platform !== 'linux' && entries.some(entry => entry.npmScript === 'verify' || own(GRAPHS, entry.graph ?? ''))) {
    throw new VerificationCliError(
      'final verification requires Linux; local Conexus proof must run in WSL Ubuntu with the pinned Node/npm toolchain',
    )
  }
}

export function listScopes(packageScripts = loadPackageScripts()) {
  const allScripts = Object.keys(packageScripts).sort()
  const rejectedScripts = allScripts.filter(isMutationScript)
  const scripts = allScripts.filter(script => !rejectedScripts.includes(script))
  const scopes = [...ALLOWED_ALIASES, ...scripts.filter(script => !ALLOWED_ALIASES.includes(script))]
  return {
    aliases: ALLOWED_ALIASES.map(scope => ({
      scope,
      npmScript: SCOPE_MANIFEST[scope].npmScript,
      npmArgs: [...SCOPE_MANIFEST[scope].npmArgs],
    })),
    scripts,
    rejectedScripts,
    scopes,
  }
}

function isMutationScript(script) {
  return /(?:^|[:_-])(?:generate|record)(?:$|[:_-])/i.test(script)
}

export function commandArguments(entry) {
  if (entry.command) return ['-lc', entry.command]
  return ['run', entry.npmScript, ...(entry.npmArgs.length ? ['--', ...entry.npmArgs] : [])]
}

const LEDGER_REPORTER = resolve(repositoryRoot, 'scripts/test-ledger-reporter.mjs')
const LEDGER_REPORTER_OPTIONS = `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=${LEDGER_REPORTER} --test-reporter-destination=stdout`

// Every step records its skipped tests for the only-opt-in-skips leaf. A fresh ledger per run keeps
// apart two runs that share node_modules through a worktree symlink, and a test that calls
// runVerification in-process cannot clear the ledger of the run it is part of.
export const newTestLedger = (root = repositoryRoot) => Object.freeze({
  root,
  file: resolve(tmpdir(), `conexus-test-ledger-${randomUUID()}.jsonl`),
})

// The step's class travels with it, so a helper that launches a browser can refuse in a step that has none.
export const executionEnvironment = (entry, processEnvironment = process.env, testLedger = null) => ({
  ...stepEnvironment(entry, processEnvironment, testLedger),
  CONEXUS_VERIFY_STEP_CLASS: entry.environmentClass,
})

function stepEnvironment(entry, processEnvironment, testLedger) {
  const nodeOptions = processEnvironment.NODE_OPTIONS ?? ''
  const instrumented = testLedger ? {
    ...processEnvironment,
    CONEXUS_TEST_LEDGER_ROOT: testLedger.root,
    CONEXUS_TEST_LEDGER: testLedger.file,
    NODE_OPTIONS: nodeOptions.includes(LEDGER_REPORTER) ? nodeOptions : `${nodeOptions} ${LEDGER_REPORTER_OPTIONS}`.trim(),
  } : processEnvironment
  if (!POSTGRES_CLASSES.has(entry.environmentClass)) return instrumented

  const names = Object.keys(POSTGRES_ENV_DEFAULTS)
  const selected = names.filter(name => processEnvironment[name])
  if (selected.length !== 0 && selected.length !== names.length) {
    throw new VerificationCliError('PostgreSQL verification requires either all CONEXUS_TEST_DB_* values or none')
  }

  return {
    ...instrumented,
    ...(selected.length === names.length ? {} : POSTGRES_ENV_DEFAULTS),
  }
}

export function formatCommand(entry) {
  if (entry.command) return entry.command
  return ['npm', ...commandArguments(entry)].join(' ')
}

function defaultClock() {
  return Date.now()
}

// A step that never exits burned a whole CI run on 2026-09-19 and left no evidence of which
// command it was. Two rules stop that repeating: no step inherits stdin, so nothing can block
// waiting for input that will never come, and every step is killed after this long and reported
// as a failure naming the command. The bound is far above the slowest honest step, which is a
// few minutes.
export const STEP_TIMEOUT_MS = 10 * 60 * 1000

export function runNpmScript(entry, { root = repositoryRoot, spawn = spawnSync, processEnvironment = process.env, testLedger = null } = {}) {
  const args = commandArguments(entry)
  const executable = entry.command ? (process.platform === 'win32' ? 'bash.exe' : 'bash') : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  return spawn(executable, args, {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: STEP_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: executionEnvironment(entry, processEnvironment, testLedger),
  })
}

function normalizeExitCode(result) {
  if (Number.isInteger(result)) return result
  if (result && Number.isInteger(result.status)) return result.status
  if (result && result.status === null) return null
  if (result?.error) return null
  return 0
}

export function timedOut(result) {
  return result?.error?.code === 'ETIMEDOUT' || (result?.signal === 'SIGKILL' && Boolean(result?.error))
}

function errorMessage(result) {
  if (timedOut(result)) return `step exceeded ${STEP_TIMEOUT_MS / 1000}s and was killed`
  if (!result?.error) return undefined
  return result.error instanceof Error ? result.error.message : String(result.error)
}

/**
 * Run already-resolved npm commands in input order.  The injected runner is
 * intentionally synchronous so a caller cannot accidentally overlap checks.
 */
export function runVerification({
  scopes,
  packageScripts,
  root = repositoryRoot,
  dryRun = false,
  group = null,
  shard = null,
  platform = process.platform,
  runCommand = runNpmScript,
  clock = defaultClock,
  processEnvironment = process.env,
  } = {}) {
  const scripts = packageScripts ?? loadPackageScripts(root)
  const requestedEntries = resolveScopes(scopes, scripts)
  assertExecutionEnvironment(requestedEntries, { platform, dryRun })
  const graphEntries = requestedEntries.flatMap(entry => own(GRAPHS, entry.graph ?? '') ? GRAPHS[entry.graph] : [entry])
  const grouped = group ? graphForGroup(graphEntries, group) : graphEntries
  if (shard && !grouped.some(entry => entry.shardCommand)) throw new VerificationCliError(`--shard needs a group with a shardable step; ${group ?? 'the selected scope'} has none`)
  const entries = shard ? grouped.map(entry => entry.shardCommand ? { ...entry, command: entry.shardCommand(shard) } : entry) : grouped
  const records = []
  const published = {}
  const testLedger = newTestLedger(root)

  for (const entry of entries) {
    const command = formatCommand(entry)
    if (dryRun) {
      records.push({
        scope: entry.scope,
        command,
        ...(entry.environmentClass ? { environmentClass: entry.environmentClass } : {}),
        status: 'dry-run',
        exitCode: null,
        durationMs: 0,
      })
      continue
    }

    const startedAt = clock()
    let result
    try {
      result = runCommand(entry, { root, command, args: commandArguments(entry), processEnvironment: { ...processEnvironment, ...published }, testLedger })
    } catch (error) {
      result = { status: null, error }
    }
    const durationMs = Math.max(0, Math.round(clock() - startedAt))
    const exitCode = normalizeExitCode(result)
    const record = {
      scope: entry.scope,
      command,
      ...(entry.environmentClass ? { environmentClass: entry.environmentClass } : {}),
      status: exitCode === 0 ? 'succeeded' : 'failed',
      exitCode,
      durationMs,
    }
    const detail = errorMessage(result)
    if (detail) record.error = detail
    if (result?.signal) record.signal = result.signal
    records.push(record)

    if (exitCode !== 0) break
    for (const [name, path] of Object.entries(entry.publishes ?? {})) published[name] = resolve(root, path)
  }

  const failed = records.find(record => record.status === 'failed')
  return {
    scopes: entries.map(entry => entry.scope),
    records,
    stopped: Boolean(failed),
    exitCode: failed ? (Number.isInteger(failed.exitCode) ? failed.exitCode : 1) : 0,
  }
}

function helpText() {
  return [
    'Usage: node scripts/conexus-verify.mjs --scope <name[,name...]> [--group browser|postgres|rest|live|backup] [--shard <position>/<total>] [--dry-run] [--json]',
    '       node scripts/conexus-verify.mjs --list [--json]',
    '',
    'Aliases: preflight, repository, final. Other scopes must be explicit npm scripts in package.json.',
  ].join('\n')
}

export function renderStepSummary(records) {
  const total = records.reduce((sum, record) => sum + record.durationMs, 0)
  const rows = [...records]
    .sort((a, b) => b.durationMs - a.durationMs)
    .map(record => {
      const share = total === 0 ? 0 : (record.durationMs / total) * 100
      return `| ${record.scope} | ${record.status} | ${(record.durationMs / 1000).toFixed(1)} | ${share.toFixed(1)}% |`
    })
  return [
    '### Verification step timings',
    '',
    `${records.length} steps, ${(total / 1000).toFixed(1)} s in total, slowest first.`,
    '',
    '| Step | Status | Seconds | Share |',
    '| --- | --- | ---: | ---: |',
    ...rows,
    '',
  ].join('\n')
}

function writeStepSummary(result, env = process.env) {
  if (!env.GITHUB_STEP_SUMMARY || result.records.length === 0) return
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${renderStepSummary(result.records)}\n`)
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  for (const record of result.records) {
    if (record.status === 'skipped') {
      console.log(`skipped: ${record.command} (${record.reason})`)
      continue
    }
    const exitCode = record.exitCode === null ? 'n/a' : String(record.exitCode)
    console.log(`${record.status}: ${record.command} (exit=${exitCode}, durationMs=${record.durationMs})`)
  }
  if (result.stopped) console.error('verification stopped after the first failed command')
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv)
    if (options.help) {
      console.log(helpText())
      return 0
    }

    const packageScripts = loadPackageScripts()
    if (options.list) {
      const available = listScopes(packageScripts)
      if (options.json) process.stdout.write(`${JSON.stringify(available)}\n`)
      else {
        console.log('Aliases:')
        for (const alias of available.aliases) {
          const suffix = alias.npmArgs.length ? ` -- ${alias.npmArgs.join(' ')}` : ''
          console.log(`  ${alias.scope} -> ${alias.npmScript}${suffix}`)
        }
        console.log('npm scripts:')
        for (const script of available.scripts) console.log(`  ${script}`)
      }
      return 0
    }

    const result = runVerification({
      scopes: options.scopes,
      packageScripts,
      dryRun: options.dryRun,
      group: options.group,
      shard: options.shard,
    })
    printResult(result, options.json)
    writeStepSummary(result)
    return result.exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (argv.includes('--json')) process.stdout.write(`${JSON.stringify({ error: message })}\n`)
    else console.error(message)
    return error instanceof VerificationCliError ? error.exitCode : 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptFile)) {
  process.exitCode = main()
}
