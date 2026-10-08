import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '../..')

// Two segments below the repository root, not three: `tsc` preserves each source file's relative
// import specifiers verbatim, and an outDir at the wrong depth breaks every "../"-chain import Hub
// sources use to reach shared packages (for example
// `../../../../packages/canonical-json/src/index.mjs`); see hub-build.test.mjs's depth regression
// test. Exported so `hub-build.test.mjs` can assert this never collides with the directory
// `npm run build:hub` uses.
export const DEFAULT_HUB_BUILD_CACHE_DIR = resolve(repositoryRoot, 'node_modules/.cache-hub')

// Every suite that imports the Hub reads one compiled copy, keyed by a hash of the Hub source and
// its typecheck config. The first process to ask for a given hash compiles it; every other process,
// in this run or a later one, finds the directory already there and reads it. A source change
// changes the hash, so no suite ever reads a stale build, and no two processes compile the same
// hash at once: an atomic `mkdir` lock decides who compiles, and a lock left by a dead process is
// taken over instead of wedging every waiter.
const DEFAULT_KEEP_COUNT = 3
const DEFAULT_LOCK_POLL_MS = 100
const DEFAULT_LOCK_WAIT_MS = 5 * 60 * 1000

function collectFilesSorted(dir) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  const files = []
  for (const entry of entries) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectFilesSorted(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

function readTypescriptVersion(tscBin) {
  const packageJsonPath = resolve(dirname(tscBin), '../package.json')
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version
}

function computeHash({ sourceDir, tsconfigPath, baseTsconfigPath, typescriptVersion }) {
  const hash = createHash('sha256')
  const sourceFiles = existsSync(sourceDir) ? collectFilesSorted(sourceDir) : []
  for (const file of sourceFiles) {
    hash.update(relative(sourceDir, file))
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  hash.update(readFileSync(tsconfigPath))
  hash.update('\0')
  hash.update(readFileSync(baseTsconfigPath))
  hash.update('\0')
  hash.update(typescriptVersion)
  // The build also holds the application check's bundle, which these two decide.
  hash.update(readFileSync(resolve(repositoryRoot, 'scripts/build-app-check.mjs')))
  hash.update(JSON.parse(readFileSync(resolve(repositoryRoot, 'node_modules/rolldown/package.json'), 'utf8')).version)
  return hash.digest('hex').slice(0, 20)
}

function compileWithTsc(tmpDir, { tscBin, tsconfigPath, bundle }) {
  const compiled = spawnSync(process.execPath, [
    tscBin,
    '--project', tsconfigPath,
    '--noEmit', 'false', '--outDir', tmpDir,
  ], { encoding: 'utf8' })
  if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
  if (!bundle) return
  const bundled = spawnSync(process.execPath, [resolve(repositoryRoot, 'scripts/build-app-check.mjs'), tmpDir], { encoding: 'utf8' })
  if (bundled.status !== 0) throw new Error(`HUB_APP_CHECK_BUNDLE_FAILED\n${bundled.stdout}\n${bundled.stderr}`)
}

function readLockPid(lockDir) {
  try {
    return Number.parseInt(readFileSync(resolve(lockDir, 'pid'), 'utf8'), 10)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const HASH_NAME_PATTERN = /^[0-9a-f]{20}$/

function pruneOldBuilds(baseDir, currentHash, keepCount) {
  let entries
  try {
    entries = readdirSync(baseDir, { withFileTypes: true })
  } catch {
    return
  }
  const buildDirs = entries
    .filter(entry => entry.isDirectory() && HASH_NAME_PATTERN.test(entry.name))
    .map(entry => entry.name)
  const withMtime = buildDirs.map(name => {
    let mtimeMs = 0
    try {
      mtimeMs = statSync(resolve(baseDir, name)).mtimeMs
    } catch {
      mtimeMs = 0
    }
    return { name, mtimeMs }
  })
  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const keep = new Set(withMtime.slice(0, keepCount).map(entry => entry.name))
  keep.add(currentHash)
  for (const { name } of withMtime) {
    if (keep.has(name)) continue
    if (existsSync(resolve(baseDir, `${name}.lock`))) continue
    rmSync(resolve(baseDir, name), { recursive: true, force: true })
  }
}

// Node has no synchronous sleep primitive; Atomics.wait blocks this thread on a SharedArrayBuffer
// that nothing else writes to, so it always times out after `ms` without spinning a CPU core.
function blockingSleepSync(ms) {
  const signal = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(signal, 0, 0, ms)
}

/**
 * Resolves the directory holding one compiled copy of the Hub, compiling it if nobody has yet.
 * Every option carries a production default so `hubBuildDirectory()` needs none; tests override
 * `sourceDir`/`tsconfigPath`/`baseTsconfigPath`/`cacheDir` to point at a tiny fixture project, or
 * `compile` to skip `tsc` entirely.
 */
export function resolveHubBuild(options = {}) {
  const env = options.env ?? process.env
  const shared = env.CONEXUS_HUB_BUILD
  if (shared) {
    if (!existsSync(resolve(shared, 'server.js'))) throw new Error(`HUB_BUILD_MISSING:${shared}`)
    return shared
  }

  const tscBin = options.tscBin ?? resolve(repositoryRoot, 'node_modules/typescript/bin/tsc')
  const sourceDir = options.sourceDir ?? resolve(repositoryRoot, 'apps/hub/src')
  const tsconfigPath = options.tsconfigPath ?? resolve(repositoryRoot, 'apps/hub/tsconfig.json')
  const baseTsconfigPath = options.baseTsconfigPath ?? resolve(repositoryRoot, 'tsconfig.base.json')
  const cacheDir = options.cacheDir ?? DEFAULT_HUB_BUILD_CACHE_DIR
  const typescriptVersion = options.typescriptVersion ?? readTypescriptVersion(tscBin)
  // A fixture project has no application check to bundle; only the Hub's own source has.
  const compile = options.compile ?? ((tmpDir) => compileWithTsc(tmpDir, { tscBin, tsconfigPath, bundle: options.sourceDir === undefined }))
  const keepCount = options.keepCount ?? DEFAULT_KEEP_COUNT
  const lockPollMs = options.lockPollMs ?? DEFAULT_LOCK_POLL_MS
  const lockWaitMs = options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? blockingSleepSync

  const hash = computeHash({ sourceDir, tsconfigPath, baseTsconfigPath, typescriptVersion })
  mkdirSync(cacheDir, { recursive: true })
  const finalDir = resolve(cacheDir, hash)
  const serverEntry = resolve(finalDir, 'server.js')
  const lockDir = `${finalDir}.lock`
  const deadline = now() + lockWaitMs

  while (true) {
    if (existsSync(serverEntry)) return finalDir

    let acquired = false
    try {
      mkdirSync(lockDir)
      acquired = true
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }

    if (acquired) {
      try {
        writeFileSync(resolve(lockDir, 'pid'), String(process.pid))
        const tmpDir = mkdtempSync(resolve(cacheDir, '.tmp-'))
        try {
          compile(tmpDir)
        } catch (error) {
          rmSync(tmpDir, { recursive: true, force: true })
          throw error
        }
        rmSync(finalDir, { recursive: true, force: true })
        renameSync(tmpDir, finalDir)
        pruneOldBuilds(cacheDir, hash, keepCount)
      } finally {
        rmSync(lockDir, { recursive: true, force: true })
      }
      return finalDir
    }

    const lockPid = readLockPid(lockDir)
    if (lockPid !== null && !isProcessAlive(lockPid)) {
      rmSync(lockDir, { recursive: true, force: true })
      continue
    }
    if (now() >= deadline) throw new Error(`HUB_BUILD_LOCK_TIMEOUT:${finalDir}`)
    sleep(lockPollMs)
  }
}

let cachedDirectory = null

export const hubBuildDirectory = () => {
  if (cachedDirectory) return cachedDirectory
  cachedDirectory = resolveHubBuild()
  return cachedDirectory
}

export const hubModuleUrl = (path) => pathToFileURL(resolve(hubBuildDirectory(), path)).href
