import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { WorkerJob, WorkerResult } from './worker.js'

/**
 * The per-invocation boundary: a rootless bubblewrap sandbox with unprivileged user, pid, network,
 * ipc, uts and cgroup namespaces, no capabilities, an empty environment, an allowlisted root that
 * never contains the operator's home, and one unix socket as its only way to the database. The root
 * holds the shared libraries Node links against and no other executable than Node itself. Node's
 * permission model inside it refuses child processes, workers, addons and file writes; that is
 * defense in depth, not the boundary.
 */
export type SandboxConfig = Readonly<{
  bwrap: string
  prlimit: string
  node: string
  heapMb: number
  addressSpaceMb: number
}>

export const DEFAULT_SANDBOX: SandboxConfig = Object.freeze({
  bwrap: '/usr/bin/bwrap',
  prlimit: '/usr/bin/prlimit',
  node: process.execPath,
  heapMb: 128,
  // Measured on the pilot host: V8 does not start at 1 GiB of address space and a SCRAM login aborts at
  // 1.25 GiB; 1.75 GiB serves the note flow and still refuses a 2 GiB Buffer.
  addressSpaceMb: 1792,
})

export const SANDBOX_DATABASE_HOST = '/run/conexus/pg'
const SANDBOX_SOCKET = `${SANDBOX_DATABASE_HOST}/.s.PGSQL.5432`
const STREAM_LIMIT = 64 * 1024

export type WorkerOutcome =
  | Readonly<{ kind: 'RESULT'; result: WorkerResult; ms: number; logs: string }>
  | Readonly<{ kind: 'TIMEOUT' | 'RESULT_TOO_LARGE'; ms: number; logs: string }>
  | Readonly<{ kind: 'CRASHED'; exitCode: number | null; signal: string | null; ms: number; logs: string }>

const rootFilesystem = (config: SandboxConfig): string[] => [
  '--ro-bind', '/usr/lib', '/usr/lib',
  '--ro-bind-try', '/usr/lib64', '/usr/lib64',
  '--symlink', 'usr/lib', '/lib',
  '--symlink', 'usr/lib64', '/lib64',
  '--proc', '/proc',
  '--dev', '/dev',
  '--size', String(1024 * 1024), '--tmpfs', '/tmp',
  '--ro-bind', config.node, '/runtime/node',
]

const isolation = [
  '--unshare-user', '--unshare-pid', '--unshare-net', '--unshare-ipc', '--unshare-uts', '--unshare-cgroup-try',
  '--disable-userns', '--cap-drop', 'ALL', '--die-with-parent', '--new-session', '--clearenv', '--chdir', '/',
]

/**
 * The runner refuses to serve on a host where an unprivileged process cannot create the namespaces the
 * boundary is made of, rather than degrading to an unsandboxed worker.
 */
export const assertUserNamespaces = (config: SandboxConfig = DEFAULT_SANDBOX): void => {
  const maxNamespaces = Number(readFileSync('/proc/sys/user/max_user_namespaces', 'utf8').trim())
  const cloneSwitch = '/proc/sys/kernel/unprivileged_userns_clone'
  const cloneAllowed = !existsSync(cloneSwitch) || readFileSync(cloneSwitch, 'utf8').trim() === '1'
  const probe = spawnSync(config.bwrap, [...isolation, ...rootFilesystem(config), '/runtime/node', '-e', 'process.exit(process.getuid() === 0 ? 1 : 0)'], {
    env: {}, timeout: 10_000, stdio: 'ignore',
  })
  if (!(maxNamespaces > 0) || !cloneAllowed || probe.status !== 0) throw new Error('RUNNER_USER_NAMESPACES_UNAVAILABLE')
}

// pg and everything it depends on, found through each package.json; the sandbox receives a copy.
const dependencyClosure = (entry: string): ReadonlyMap<string, string> => {
  const found = new Map<string, string>()
  const locate = (name: string, from: string): string | null => {
    for (let directory = from; ; directory = dirname(directory)) {
      const candidate = join(directory, 'node_modules', name)
      if (existsSync(join(candidate, 'package.json'))) return candidate
      if (dirname(directory) === directory) return null
    }
  }
  const visit = (name: string, from: string, optional: boolean): void => {
    if (found.has(name)) return
    const directory = locate(name, from)
    if (!directory) {
      if (optional) return
      throw new Error(`RUNNER_DEPENDENCY_MISSING:${name}`)
    }
    found.set(name, directory)
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
    for (const dependency of Object.keys(manifest.dependencies ?? {})) visit(dependency, directory, false)
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) visit(dependency, directory, true)
  }
  visit(entry, import.meta.dirname, false)
  return found
}

/**
 * Builds the read-only tree mounted at /runner: the worker, the one runner module it imports, and a
 * copy of pg's dependency closure. Nothing else from the Hub's tree or the operator's home is in it.
 */
export const stageWorkerRuntime = (runtimeDir: string): string => {
  rmSync(runtimeDir, { recursive: true, force: true })
  mkdirSync(join(runtimeDir, 'node_modules'), { recursive: true, mode: 0o700 })
  writeFileSync(join(runtimeDir, 'package.json'), '{"type":"module"}\n')
  for (const file of ['worker.js', 'data-plane.js']) cpSync(join(import.meta.dirname, file), join(runtimeDir, file))
  for (const [name, directory] of dependencyClosure('pg')) cpSync(directory, join(runtimeDir, 'node_modules', name), { recursive: true, dereference: true })
  return runtimeDir
}

export const runWorker = (input: Readonly<{
  config?: SandboxConfig
  runtimeDir: string
  appDir?: string
  databaseSocket: string
  job: WorkerJob
  timeoutMs: number
  resultLimit: number
}>): Promise<WorkerOutcome> => {
  const config = input.config ?? DEFAULT_SANDBOX
  const started = performance.now()
  const readable = ['--allow-fs-read=/runner/*', ...(input.appDir ? ['--allow-fs-read=/app/*'] : [])]
  const args = [
    `--as=${config.addressSpaceMb * 1024 * 1024}`, '--core=0', '--nofile=256', '--',
    config.bwrap, ...isolation, ...rootFilesystem(config),
    '--ro-bind', input.runtimeDir, '/runner',
    ...(input.appDir ? ['--ro-bind', input.appDir, '/app'] : []),
    '--dir', SANDBOX_DATABASE_HOST, '--bind', input.databaseSocket, SANDBOX_SOCKET,
    '/runtime/node', '--permission', ...readable, `--max-old-space-size=${config.heapMb}`, '/runner/worker.js',
  ]
  return new Promise((resolve) => {
    const child = spawn(config.prlimit, args, { env: {}, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] })
    let logs = ''
    let result = Buffer.alloc(0)
    let verdict: 'TIMEOUT' | 'RESULT_TOO_LARGE' | null = null
    const keepLogs = (chunk: Buffer): void => { if (logs.length < STREAM_LIMIT) logs += chunk.toString('utf8').slice(0, STREAM_LIMIT - logs.length) }
    const stop = (reason: 'TIMEOUT' | 'RESULT_TOO_LARGE'): void => {
      verdict ??= reason
      child.kill('SIGKILL')
    }
    const timer = setTimeout(() => stop('TIMEOUT'), input.timeoutMs)
    child.stdout.on('data', keepLogs)
    child.stderr.on('data', keepLogs)
    const resultStream = child.stdio[3] as NodeJS.ReadableStream
    resultStream.on('data', (chunk: Buffer) => {
      result = Buffer.concat([result, chunk])
      if (result.byteLength > input.resultLimit + 1024) stop('RESULT_TOO_LARGE')
    })
    resultStream.on('error', () => undefined)
    child.stdin.on('error', () => undefined)
    child.stdin.end(JSON.stringify(input.job))
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      const ms = Math.round(performance.now() - started)
      if (verdict) return resolve({ kind: verdict, ms, logs })
      const line = result.toString('utf8').split('\n', 1)[0] ?? ''
      try {
        const parsed = JSON.parse(line) as WorkerResult
        if (parsed?.ok === true || (parsed?.ok === false && typeof parsed.code === 'string')) return resolve({ kind: 'RESULT', result: parsed, ms, logs })
      } catch {
        // no result line: the worker died first
      }
      resolve({ kind: 'CRASHED', exitCode, signal, ms, logs })
    })
  })
}
