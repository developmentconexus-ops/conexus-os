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
  if (platform !== 'linux' && entries.some(entry => entry.npmScript === 'verify')) {
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
  return ['run', entry.npmScript, ...(entry.npmArgs.length ? ['--', ...entry.npmArgs] : [])]
}

export function formatCommand(entry) {
  return ['npm', ...commandArguments(entry)].join(' ')
}

function defaultClock() {
  return Date.now()
}

export function runNpmScript(entry, { root = repositoryRoot, spawn = spawnSync } = {}) {
  const args = commandArguments(entry)
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return spawn(executable, args, { cwd: root, encoding: 'utf8', windowsHide: true })
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
  const entries = resolveScopes(scopes, scripts)
  assertExecutionEnvironment(entries, { platform, dryRun })
  const records = []

  for (const entry of entries) {
    const command = formatCommand(entry)
    if (dryRun) {
      records.push({
        scope: entry.scope,
        command,
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
