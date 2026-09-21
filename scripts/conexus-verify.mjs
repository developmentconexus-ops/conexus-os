import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptFile = fileURLToPath(import.meta.url)

/**
 * The aliases are deliberately small and static.  They are routing names, not
 * a second verification implementation or a claim about the state of a gate.
 */
export const SCOPE_MANIFEST = Object.freeze({
  preflight: Object.freeze({ npmScript: 'conexus:preflight', npmArgs: Object.freeze(['--no-network']) }),
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

const candidateStep = (scope, command, environmentClass = 'static') => Object.freeze({
  scope,
  command,
  environmentClass,
  graph: 'candidate',
})

/**
 * The candidate profile is the review-lane composition. Each entry is an
 * objective leaf or an intentionally distinct environment/selection proof.
 * Historical npm scripts remain available for explicit invocation, but are not
 * part of this current graph. Composite aliases are not used here because
 * they would repeat equivalent leaves. Candidate-freeze custody is invoked
 * explicitly by its own repository command; it is not a required-main CI
 * property while the candidate remains unadmitted.
 */
export const CANDIDATE_GRAPH = Object.freeze([
  candidateStep('hub-baseline', 'node --test --test-concurrency=1 tests/implementation/hub-baseline.test.mjs', 'postgres'),
  candidateStep('c020-migration-selection', 'node --test tests/implementation/hub-migration-selection.test.mjs && npx --no-install biome check tests/implementation/hub-migration-selection.test.mjs tests/implementation/hub-migration-postgres.test.mjs'),
  candidateStep('c020-migration-postgres', 'node --test --test-concurrency=1 tests/implementation/hub-migration-postgres.test.mjs', 'postgres'),
  candidateStep('iam-membership-authority', 'node --test --test-concurrency=1 tests/implementation/membership-authority-postgres.test.mjs', 'postgres'),
  candidateStep('iam-grant-surface-excision', 'node --test --test-concurrency=1 tests/implementation/grant-surface-excision-postgres.test.mjs', 'postgres'),
  candidateStep('hub-call-site-privileges', 'node --test --test-concurrency=1 tests/implementation/hub-call-site-privileges-postgres.test.mjs && npx --no-install biome check tests/implementation/hub-call-site-privileges-postgres.test.mjs', 'postgres'),
  candidateStep('c020-builder-postgres', 'node --test --test-concurrency=1 tests/implementation/builder-run-invariants-postgres.test.mjs tests/implementation/builder-run-execution-postgres.test.mjs tests/implementation/builder-c020-source-inspection-postgres.test.mjs', 'postgres'),
  candidateStep('c020-builder-request-text-postgres', 'node --test --test-concurrency=1 tests/implementation/builder-run-request-text-postgres.test.mjs', 'postgres'),
  candidateStep('factory-binding-postgres', 'node --test --test-concurrency=1 tests/implementation/builder-factory-binding-postgres.test.mjs', 'postgres'),
  candidateStep('c020-mastra-lifecycle', 'node --test --test-concurrency=1 tests/implementation/builder-plan-starter.test.mjs tests/implementation/builder-mastra-session-routes.test.mjs tests/implementation/builder-workspace-tools.test.mjs qualification/4d/mastra-builder-capability/probe.test.mjs && npx --no-install biome check tests/implementation/builder-mastra-session-routes.test.mjs tests/implementation/builder-workspace-tools.test.mjs'),
  candidateStep('factory-dependency-tree', 'node --test tests/implementation/builder-factory-dependency-tree.test.mjs'),
  candidateStep('foundation-postgres', 'node --test --test-concurrency=1 tests/implementation/identity-access-postgres.test.mjs tests/implementation/workspace-postgres.test.mjs tests/implementation/project-postgres.test.mjs && npx --no-install biome check tests/implementation/identity-access-postgres.test.mjs tests/implementation/workspace-postgres.test.mjs tests/implementation/project-postgres.test.mjs', 'postgres'),
  candidateStep('c020-registry', 'node --test --test-concurrency=1 tests/implementation/builder-application-registry.test.mjs tests/implementation/builder-application-registry-postgres.test.mjs', 'postgres'),
  candidateStep('c020-source-runtime', 'node --test --test-concurrency=1 tests/implementation/builder-working-source-runtime.test.mjs tests/implementation/builder-run-dispatch.test.mjs'),
  candidateStep('c020-failure-vocabulary', 'node --test --test-concurrency=1 tests/implementation/builder-failure-vocabulary.test.mjs'),
  candidateStep('c020-compiler-runtime', 'node --test --test-concurrency=1 tests/implementation/builder-application-runtime.test.mjs tests/implementation/builder-application-starter.test.mjs'),
  candidateStep('c020-browser', 'node --test --test-concurrency=1 tests/implementation/builder-browser.test.mjs', 'browser'),
  candidateStep('c020-e2b-template', 'node scripts/builder-e2b-template.mjs --check && node --test --test-concurrency=1 tests/implementation/builder-e2b-template.test.mjs tests/implementation/builder-compiler-template-recipe.test.mjs'),
  candidateStep('c020-hub-typecheck', 'node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --pretty false'),
  candidateStep('c020-web-typecheck', 'node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --pretty false'),
  candidateStep('c020-web-build', 'node node_modules/vite/bin/vite.js build --config apps/web/vite.config.mjs apps/web --outDir ../../node_modules/.cache/conexus-candidate-web-build --emptyOutDir'),

  candidateStep('db-catalog-snapshot', 'npm run db:catalog:check', 'postgres'),
  candidateStep('db-baseline-file', 'npm run db:baseline:check', 'postgres'),
  candidateStep('db-role-register', 'npm run db:roles:check'),
  candidateStep('db-role-provision-postgres', 'npm run db:roles:postgres', 'postgres'),
  candidateStep('repository-check', 'npm run repository:check'),
  candidateStep('repository-import-law', 'node --test tests/repository/import-law.test.mjs'),
  candidateStep('contract-projection-check-iam', 'node scripts/generate-r1-s1-contracts.mjs --check'),
  candidateStep('contract-projection-check-workspace', 'node scripts/generate-r1-s2-contracts.mjs --check'),
  candidateStep('contract-projection-check-project', 'node scripts/generate-r1-s3-contracts.mjs --check'),
  candidateStep('repository-hygiene', 'node scripts/check-repository-hygiene.mjs'),
  candidateStep('repository-doc-index', 'node scripts/check-doc-index.mjs'),
  candidateStep('repository-contract-checks', 'node --test tests/repository/repository-contract.test.mjs'),
  candidateStep('biome-current', 'npx --no-install biome check apps/hub/src apps/web/src packages/canonical-json/src scripts/run-hub-migrations.mjs scripts/hub-catalog.mjs scripts/generate-hub-catalog-snapshot.mjs scripts/generate-hub-baseline.mjs tests/implementation/hub-database.mjs tests/implementation/hub-baseline.test.mjs tests/implementation/grant-surface-excision-postgres.test.mjs tests/implementation/workspace-postgres.test.mjs tests/implementation/builder-*.mjs tests/implementation/project-browser.test.mjs tests/implementation/preview-form-policy.test.mjs tests/repository/conexus-verify.test.mjs'),

  candidateStep('identity-access-http', 'node --test tests/implementation/identity-access-http.test.mjs'),
  candidateStep('workspace-membership-http', 'node --test tests/implementation/workspace-membership-http.test.mjs && npx --no-install biome check tests/implementation/workspace-membership-http.test.mjs'),
  candidateStep('workspace-http', 'node --test tests/implementation/workspace-http.test.mjs'),
  candidateStep('workspace-reads', 'node --test --test-concurrency=1 tests/implementation/workspace-reads.test.mjs', 'postgres'),
  candidateStep('project-disclosure', 'node --test tests/implementation/project-disclosure.test.mjs'),
  candidateStep('project-source-recovery', 'node --test tests/implementation/project-source-recovery.test.mjs'),
  candidateStep('project-git-execution', 'node --test --test-concurrency=1 tests/implementation/project-git-execution.test.mjs'),
  candidateStep('project-command-postgres', 'node --test --test-concurrency=1 tests/implementation/project-command.test.mjs', 'postgres'),
  candidateStep('project-browser', 'node --test --test-concurrency=1 tests/implementation/project-browser.test.mjs', 'browser'),
  candidateStep('shell-browser-boundary', 'node --test tests/implementation/shell-browser-boundary.test.mjs'),
  candidateStep('preview-form-policy', 'node --test tests/implementation/preview-form-policy.test.mjs', 'browser'),
  candidateStep('builder-credential-generation', 'node --test tests/implementation/builder-credential-generation.test.mjs'),
  candidateStep('builder-first-operational-delivery', 'node --test tests/implementation/builder-first-operational-delivery.test.mjs'),
  candidateStep('builder-planning-free-boot', 'node --test tests/implementation/builder-planning-free-boot.test.mjs'),
  candidateStep('protected-cluster-coverage', 'node --test tests/implementation/protected-cluster-coverage.test.mjs'),

  candidateStep('wire-openapi-lint', 'npm run wire:lint'),
  candidateStep('wire-openapi-bundle', 'npm run wire:bundle'),
  candidateStep('wire-bijection', 'npm run wire:bijection'),
  candidateStep('wire-bijection-gate', 'node --test tests/repository/wire-bijection-gate.test.mjs'),
  candidateStep('wire-carriers', 'npm run wire:carriers'),
  candidateStep('wire-identity-workspace', 'npm run wire:identity-workspace'),
  candidateStep('wire-project', 'npm run wire:project'),
  candidateStep('wire-builder', 'npm run wire:builder'),
  candidateStep('wire-technical-lint', 'npm run wire:technical-lint'),
  candidateStep('wire-technical-ingress', 'npm run wire:technical-ingress'),
])

// Descriptive aliases make the manifest easy to discover for tests and small
// callers without creating another mutable allowlist.
export const VERIFICATION_MANIFEST = SCOPE_MANIFEST
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
  const options = { scopes: [], list: false, dryRun: false, json: false, help: false }

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
  if (normalized === 'candidate') {
    return { scope: normalized, command: null, graph: 'candidate' }
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
  if (platform !== 'linux' && entries.some(entry => entry.npmScript === 'verify' || entry.graph === 'candidate')) {
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

export function executionEnvironment(entry, processEnvironment = process.env) {
  if (entry.environmentClass !== 'postgres') return processEnvironment

  const names = Object.keys(POSTGRES_ENV_DEFAULTS)
  const selected = names.filter(name => processEnvironment[name])
  if (selected.length !== 0 && selected.length !== names.length) {
    throw new VerificationCliError('PostgreSQL verification requires either all CONEXUS_TEST_DB_* values or none')
  }

  return {
    ...processEnvironment,
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

export function runNpmScript(entry, { root = repositoryRoot, spawn = spawnSync, processEnvironment = process.env } = {}) {
  const args = commandArguments(entry)
  const executable = entry.command ? (process.platform === 'win32' ? 'bash.exe' : 'bash') : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  return spawn(executable, args, {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: STEP_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: executionEnvironment(entry, processEnvironment),
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
  platform = process.platform,
  runCommand = runNpmScript,
  clock = defaultClock,
  } = {}) {
  const scripts = packageScripts ?? loadPackageScripts(root)
  const requestedEntries = resolveScopes(scopes, scripts)
  assertExecutionEnvironment(requestedEntries, { platform, dryRun })
  const entries = requestedEntries.flatMap(entry => entry.graph === 'candidate' ? CANDIDATE_GRAPH : [entry])
  const records = []

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
      result = runCommand(entry, { root, command, args: commandArguments(entry) })
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
    'Usage: node scripts/conexus-verify.mjs --scope <name[,name...]> [--dry-run] [--json]',
    '       node scripts/conexus-verify.mjs --list [--json]',
    '',
    'Aliases: preflight, repository, final. Other scopes must be explicit npm scripts in package.json.',
  ].join('\n')
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  for (const record of result.records) {
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
    })
    printResult(result, options.json)
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
