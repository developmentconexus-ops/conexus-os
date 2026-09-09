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
 * The candidate profile is the one required CI composition.  Each entry is an
 * objective leaf or an intentionally distinct environment/selection proof.
 * Historical npm aliases remain available below, but composite aliases are not
 * used here because they would repeat equivalent leaves.
 */
export const CANDIDATE_GRAPH = Object.freeze([
  candidateStep('a0-g0-admission', 'npm run r1:a0:g0:verify'),
  candidateStep('4f-project-cognition-admission', 'npm ci --prefix qualification/4f/r1-project-cognition-admission --ignore-scripts && npm test --prefix qualification/4f/r1-project-cognition-admission'),
  candidateStep('r1-s2-generate', 'npm run r1:s2:generate'),
  candidateStep('r1-s2-generated-drift', 'git diff --exit-code -- apps/hub/src/generated/s2-routes.ts apps/web/src/generated/workspace-client.ts'),
  candidateStep('r1-s2-http', 'npm run r1:s2:http'),
  candidateStep('r1-s2-reads', 'node --test --test-concurrency=1 tests/implementation/r1-s2-reads.test.mjs'),
  candidateStep('import-law', 'npm run r1:s2:import-law'),
  candidateStep('verification-tool-regressions', 'node --test --test-concurrency=1 tests/repository/conexus-preflight.test.mjs tests/repository/conexus-verify.test.mjs'),
  candidateStep('r1-s2-live-syntax', 'bash -n tests/implementation/r1-s2-live-runner.sh && node --check tests/implementation/r1-s2-live-setup.mjs && node --check tests/implementation/r1-s2-live-browser.spec.mjs'),
  candidateStep('biome-union', 'npx --no-install biome check apps/hub/src apps/web/src packages/canonical-json/src packages/profile-compiler/src scripts/check-import-law.mjs scripts/generate-r1-s2-contracts.mjs scripts/bootstrap-r2-brain.mjs scripts/run-hub-migrations.mjs scripts/generate-r2-contracts.mjs scripts/rb-builder-e2b-template.mjs tests/implementation/r1-s2-http.test.mjs tests/implementation/r1-s2-reads.test.mjs tests/implementation/r2-p2-brain.test.mjs tests/implementation/r2-p2-brain-bootstrap.test.mjs tests/implementation/r2-p3-connections.test.mjs tests/implementation/r2-p5-connection-qualification.test.mjs tests/implementation/r2-p5-sankhya-key-conformance.test.mjs tests/implementation/r2-p5-production-composition.test.mjs tests/implementation/r2-p5-production-composed-postgres.test.mjs tests/implementation/r2-p6-brain-revision-selection.test.mjs tests/implementation/r2-p6-web-api.test.mjs tests/implementation/r2-p6-workspace-surfaces.test.mjs tests/implementation/r2-p6-project-surfaces.test.mjs tests/implementation/rb-builder-first-vertical.test.mjs tests/implementation/rb-builder-browser.test.mjs tests/implementation/rb-builder-e2b-template.test.mjs tests/implementation/rb-builder-e2b-live.test.mjs tests/implementation/rb-builder-mastra-e2b-live.test.mjs tests/implementation/rb-builder-production-composed-live.test.mjs tests/repository/import-law.test.mjs'),
  candidateStep('r1c14-native', 'npm run r1:r1c14:native:check', 'custody'),

  candidateStep('rb-first-postgres-migration-selection', 'npm run rb:first:postgres', 'postgres'),
  candidateStep('r2-p1-postgres', 'npm run r2:p1:postgres', 'postgres'),
  candidateStep('r2-p2-postgres', 'npm run r2:p2:postgres', 'postgres'),
  candidateStep('r2-p3-postgres', 'npm run r2:p3:postgres', 'postgres'),
  candidateStep('r1-s4-p2-postgres', 'npm run r1:s4:p2:postgres', 'postgres'),

  candidateStep('r2-p0-check', 'node scripts/generate-r2-contracts.mjs --check && node --test --test-concurrency=1 tests/implementation/r2-p0-contract-projection.test.mjs'),
  candidateStep('r2-p1-check', 'node --test --test-concurrency=1 tests/implementation/r2-p1-foundation.test.mjs'),
  candidateStep('r2-p2-check', 'node --check scripts/bootstrap-r2-brain.mjs && node --test --test-concurrency=1 tests/implementation/r2-p2-brain.test.mjs tests/implementation/r2-p2-brain-bootstrap.test.mjs'),
  candidateStep('r2-p3-check', 'node --test --test-concurrency=1 tests/implementation/r2-p3-connections.test.mjs'),
  candidateStep('r2-p4-check', 'node scripts/generate-r2-project-binding-ownership.mjs --check && node --test --test-concurrency=1 tests/implementation/r2-project-binding-ownership.test.mjs tests/implementation/r2-project-binding-migration.test.mjs tests/implementation/r2-project-binding-git-recovery.test.mjs tests/implementation/r2-p4-key-conformance.test.mjs tests/implementation/r2-p4-key-conformance-subject.test.mjs tests/implementation/r2-p4-key-conformance-subject-composed.test.mjs tests/implementation/r2-p4-brain-inputs.test.mjs tests/implementation/r2-p4-brain-source.test.mjs tests/implementation/r2-p4-brain-binding-validation.test.mjs tests/implementation/r2-p4-brain-settlement-recovery.test.mjs tests/implementation/r2-p4-brain-binding-removal.test.mjs tests/implementation/r2-p4-brain-context.test.mjs tests/implementation/r2-p4-brain-context-http.test.mjs tests/implementation/r2-p4-postgres-adapters.test.mjs tests/implementation/r2-p4-project-brain-binding-routes.test.mjs tests/implementation/r2-p4-project-brain-binding-store.test.mjs tests/implementation/r2-p4-brain-composed-postgres.test.mjs'),
  candidateStep('r2-p4-authority-postgres', 'npm run r2:p4:authority', 'postgres'),
  candidateStep('r2-p5-check', 'node --test --test-concurrency=1 tests/implementation/r2-p5-connection-qualification.test.mjs tests/implementation/r2-p5-sankhya-key-conformance.test.mjs tests/implementation/r2-p5-production-composition.test.mjs tests/implementation/r2-p5-production-composed-postgres.test.mjs'),
  candidateStep('r2-p6-brain-revision', 'node --test --test-concurrency=1 tests/implementation/r2-p6-brain-revision-selection.test.mjs'),
  candidateStep('r2-p6-brain-revision-postgres', 'npm run r2:p6:a:postgres', 'postgres'),
  candidateStep('r2-p6-web-api', 'node --test --test-concurrency=1 tests/implementation/r2-p6-web-api.test.mjs'),
  candidateStep('r2-p6-ui-surfaces', 'node --test --test-concurrency=1 tests/implementation/r2-p6-workspace-surfaces.test.mjs tests/implementation/r2-p6-project-surfaces.test.mjs'),
  candidateStep('r2-p6-browser', 'node --test --test-concurrency=1 tests/implementation/r2-p6-control-plane-browser.test.mjs', 'browser'),
  candidateStep('r2-p6-composed-postgres', 'node --test --test-concurrency=1 tests/implementation/r2-p6-production-composed-postgres.test.mjs'),

  candidateStep('r1-s6-contract-generation', 'node scripts/generate-r1-s3-contracts.mjs --check'),
  candidateStep('r1-s6-project-inception', 'node --test --test-concurrency=1 tests/implementation/r1-s6-project-inception.test.mjs'),
  candidateStep('r1-s6-project-refinement', 'node --test --test-concurrency=1 tests/implementation/r1-s6-project-refinement.test.mjs'),
  candidateStep('r1-s6-baseline-explanation', 'node --test --test-concurrency=1 tests/implementation/r1-s6-baseline-explanation.test.mjs'),
  candidateStep('r1-s6-p0-postgres', 'npm run r1:s6:p0:postgres', 'postgres'),
  candidateStep('r1-s6-p1-postgres', 'npm run r1:s6:p1:postgres', 'postgres'),
  candidateStep('r1-s6-browser-baseline', 'node --test --test-concurrency=1 tests/implementation/r1-s6-baseline-explanation-browser.test.mjs', 'browser'),
  candidateStep('r1-s6-browser-inception', 'node --test --test-concurrency=1 tests/implementation/r1-s6-project-inception-browser.test.mjs', 'browser'),
  candidateStep('r1-s6-browser-refinement', 'node --test --test-concurrency=1 tests/implementation/r1-s6-project-refinement-browser.test.mjs', 'browser'),
  candidateStep('r1-s6-composed', 'node --test --test-concurrency=1 tests/implementation/r1-s6-composed-journey.test.mjs tests/implementation/r1-s6-production-cognition.test.mjs', 'postgres'),
  candidateStep('r1-rc01-walkthrough', 'npm run r1:rc01:walkthrough:verify', 'postgres'),

  candidateStep('rb-e2b-template', 'node scripts/rb-builder-e2b-template.mjs --check'),
  candidateStep('rb-first-source-checks', 'node --check scripts/run-hub-migrations.mjs && node --test --test-concurrency=1 tests/implementation/rb-builder-e2b-template.test.mjs tests/implementation/rb-builder-e2b-live.test.mjs tests/implementation/rb-builder-first-vertical.test.mjs tests/implementation/rb-builder-browser.test.mjs tests/implementation/rb-builder-mastra-e2b-live.test.mjs tests/implementation/rb-builder-production-composed-live.test.mjs', 'browser'),
  candidateStep('rb-first-hub-typecheck', 'npm run r1:s2:hub:typecheck'),
  candidateStep('rb-first-web-typecheck', 'npm run r1:a0:web:typecheck'),
  candidateStep('web-build', 'vite build --config apps/web/vite.config.mjs apps/web --outDir ../../node_modules/.cache/conexus-candidate-web-build --emptyOutDir'),

  candidateStep('repository-check', 'npm run repository:check'),
  candidateStep('r1-rc01-custody', 'npm run r1:rc01:custody:check', 'custody'),
  candidateStep('repository-hygiene', 'npm run repository:check:extended'),

  candidateStep('wire-openapi-lint', 'npm run wire:lint'),
  candidateStep('wire-openapi-bundle', 'npm run wire:bundle'),
  candidateStep('wire-schema', 'npm run wire:schema'),
  candidateStep('wire-bijection', 'npm run wire:bijection'),
  candidateStep('wire-carriers', 'npm run wire:carriers'),
  candidateStep('wire-identity-workspace', 'npm run wire:identity-workspace'),
  candidateStep('wire-project', 'npm run wire:project'),
  candidateStep('wire-builder', 'npm run wire:builder'),
  candidateStep('wire-brain', 'npm run wire:brain'),
  candidateStep('wire-connections', 'npm run wire:connections'),
  candidateStep('wire-release', 'npm run wire:release'),
  candidateStep('wire-par', 'npm run wire:par'),
  candidateStep('wire-gateway', 'npm run wire:gateway'),
  candidateStep('wire-mar', 'npm run wire:mar'),
  candidateStep('wire-observability', 'npm run wire:observability'),
  candidateStep('wire-technical-lint', 'npm run wire:technical-lint'),
  candidateStep('wire-technical-ingress', 'npm run wire:technical-ingress'),
  candidateStep('wire-projections', 'npm run wire:projections'),
  candidateStep('wire-budget', 'npm run wire:budget-verify'),
  candidateStep('wire-whole-4b', 'npm run wire:whole-4b'),
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

export function runNpmScript(entry, { root = repositoryRoot, spawn = spawnSync, processEnvironment = process.env } = {}) {
  const args = commandArguments(entry)
  const executable = entry.command ? (process.platform === 'win32' ? 'bash.exe' : 'bash') : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  return spawn(executable, args, {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
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

function errorMessage(result) {
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
