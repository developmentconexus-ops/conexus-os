import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { z } from 'zod'
import { dirname, join } from 'node:path'
import { workerAnswerSchema } from './wire.js'
import type { WorkerJob } from './wire.js'
import type { WorkerAnswer } from './server-manifest.js'
import { Failure } from '../platform/failure.js'

/**
 * The per-invocation boundary: a rootless bubblewrap sandbox with unprivileged user, pid, network,
 * ipc, uts and cgroup namespaces, no capabilities, an empty environment, an allowlisted root that
 * never contains the operator's home, and one unix socket as its only way to the database. The root
 * holds /usr/lib (shared libraries, and the helper executables packages install there) and Node;
 * no_new_privs keeps any setuid helper inert. Node's permission model inside it refuses child
 * processes, workers, addons and file writes; that is defense in depth, not the boundary, and
 * `nodePermission: false` turns it off so a probe can show what the namespaces alone allow.
 */
export type SandboxConfig = Readonly<{
  bwrap: string
  prlimit: string
  node: string
  heapMb: number
  addressSpaceMb: number
  nodePermission: boolean
}>

const DEFAULT_SANDBOX: SandboxConfig = Object.freeze({
  bwrap: '/usr/bin/bwrap',
  prlimit: '/usr/bin/prlimit',
  node: process.execPath,
  heapMb: 128,
  // Measured on the pilot host: V8 does not start at 1 GiB of address space, and a worker SCRAM login
  // (before the relay took over authentication) aborted at 1.25 GiB; 1.75 GiB serves the note flow and
  // still refuses a 2 GiB Buffer.
  addressSpaceMb: 1792,
  nodePermission: true,
})

export const SANDBOX_DATABASE_HOST = '/run/conexus/pg'
const SANDBOX_SOCKET = `${SANDBOX_DATABASE_HOST}/.s.PGSQL.5432`
// The Hub's connector port for this invocation (worker.ts connects here). Only that one socket is
// bound, never its directory, and only for an invoke job.
const SANDBOX_CONNECTOR_DIR = '/run/conexus/connector'
const SANDBOX_CONNECTOR_SOCKET = `${SANDBOX_CONNECTOR_DIR}/.s.connector`
const STREAM_LIMIT = 64 * 1024

export type WorkerOutcome =
  | Readonly<{ kind: 'RESULT'; result: WorkerAnswer; ms: number; logs: string }>
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
  if (!(maxNamespaces > 0) || !cloneAllowed || probe.status !== 0) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'RUNNER_USER_NAMESPACES_UNAVAILABLE' } })
}

const packageDependencies = z.looseObject({
  dependencies: z.record(z.string(), z.string()).exactOptional(),
  optionalDependencies: z.record(z.string(), z.string()).exactOptional(),
})

/** @public An entry package and everything it depends on, found through each package.json from `from`; the sandbox receives a copy. Tests start it from a temp tree. */
export const dependencyClosure = (entry: string, from: string = import.meta.dirname): ReadonlyMap<string, string> => {
  const found = new Map<string, string>()
  const locate = (name: string, start: string): string | null => {
    for (let directory = start; ; directory = dirname(directory)) {
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
      throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'RUNNER_DEPENDENCY_MISSING', name } })
    }
    found.set(name, directory)
    const manifest = packageDependencies.safeParse(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')))
    if (!manifest.success) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'RUNNER_PACKAGE_JSON_INVALID', name } })
    for (const dependency of Object.keys(manifest.data.dependencies ?? {})) visit(dependency, directory, false)
    for (const dependency of Object.keys(manifest.data.optionalDependencies ?? {})) visit(dependency, directory, true)
  }
  visit(entry, from, false)
  return found
}

const STAGED_FILES = ['app-runner/worker.js', 'app-runner/wire.js', 'app-runner/data-plane.js', 'app-runner/server-manifest.js', 'platform/caller.js']
const STAGED_PACKAGES = ['pg', 'zod']

/**
 * Builds the read-only tree mounted at /runner: the worker, the runner modules it imports, and a
 * copy of each package's dependency closure. Nothing else from the Hub's tree or the operator's home is in it.
 */
export const stageWorkerRuntime = (runtimeDir: string): string => {
  rmSync(runtimeDir, { recursive: true, force: true })
  mkdirSync(join(runtimeDir, 'node_modules'), { recursive: true, mode: 0o700 })
  writeFileSync(join(runtimeDir, 'package.json'), '{"type":"module"}\n')
  for (const file of STAGED_FILES) {
    mkdirSync(dirname(join(runtimeDir, file)), { recursive: true, mode: 0o700 })
    cpSync(join(import.meta.dirname, '..', file), join(runtimeDir, file))
  }
  for (const entry of STAGED_PACKAGES) {
    for (const [name, directory] of dependencyClosure(entry)) cpSync(directory, join(runtimeDir, 'node_modules', name), { recursive: true, dereference: true })
  }
  return runtimeDir
}

export const runWorker = (input: Readonly<{
  config?: SandboxConfig
  runtimeDir: string
  appDir?: string
  databaseSocket: string
  connectorSocket?: string
  job: WorkerJob
  timeoutMs: number
  resultLimit: number
}>): Promise<WorkerOutcome> => {
  const config = input.config ?? DEFAULT_SANDBOX
  const started = performance.now()
  const permission = config.nodePermission ? ['--permission', '--allow-fs-read=/runner/*', ...(input.appDir ? ['--allow-fs-read=/app/*'] : [])] : []
  const args = [
    `--as=${config.addressSpaceMb * 1024 * 1024}`, '--core=0', '--nofile=256', '--',
    config.bwrap, ...isolation, ...rootFilesystem(config),
    '--ro-bind', input.runtimeDir, '/runner',
    ...(input.appDir ? ['--ro-bind', input.appDir, '/app'] : []),
    '--dir', SANDBOX_DATABASE_HOST, '--bind', input.databaseSocket, SANDBOX_SOCKET,
    ...(input.connectorSocket && input.job.kind === 'invoke' ? ['--dir', SANDBOX_CONNECTOR_DIR, '--bind', input.connectorSocket, SANDBOX_CONNECTOR_SOCKET] : []),
    '/runtime/node', ...permission, `--max-old-space-size=${config.heapMb}`, '/runner/app-runner/worker.js',
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
    const resultStream = child.stdio[3]
    if (!(resultStream instanceof Readable)) {
      clearTimeout(timer)
      child.kill('SIGKILL')
      return resolve({ kind: 'CRASHED', exitCode: null, signal: null, ms: Math.round(performance.now() - started), logs })
    }
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
        const parsed = workerAnswerSchema.safeParse(JSON.parse(line))
        if (parsed.success) return resolve({ kind: 'RESULT', result: parsed.data, ms, logs })
      } catch {
        // no result line: the worker died first
      }
      resolve({ kind: 'CRASHED', exitCode, signal, ms, logs })
    })
  })
}
