import { readCliproxyEnvironment } from '../../platform/config.js'
import { isAuthFileName, type GoogleAiProKey } from '../credential.js'
import { type ChildProcess, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { decodeKey, encodeKey, type InstanceId, instanceIdOf } from '../credential.js'
import { Failure } from '../../platform/failure.js'

type Ready = {
  state: 'ready'
  dir: string
  url: string
  proxyKey: string
  child: ChildProcess
  leases: number
  idleSince: number
}
type Instance =
  | Readonly<{ state: 'starting'; ready: Promise<Ready> }>
  | Ready
  | Readonly<{ state: 'stopping'; done: Promise<void> }>

// Called with whatever CLIProxyAPI last wrote to the instance's auth file, just before that copy
// is deleted (AC-22). Google's token refresh happens inside CLIProxyAPI, in that file, while the
// instance runs; nothing else in the Hub ever sees the refreshed bytes.
export type PersistGoogleAiProRefresh = (refreshed: GoogleAiProKey) => Promise<void>

export type Lease = Readonly<{ url: string; proxyKey: string; release(): void }>
export type LoginInstance = Readonly<{ url: string; managementKey: string; authDir: string; close(): Promise<void> }>
export type CliproxyPool = Readonly<{
  // persistRefresh is set on the instance this key resolves to; the caller that knows the owning
  // model_account (or that the account is the shared one) supplies it, so the pool itself stays
  // ignorant of accounts. The most recent caller to supply one wins for that instance.
  acquire(key: GoogleAiProKey, persistRefresh?: PersistGoogleAiProRefresh): Promise<Lease>
  startLogin(): Promise<LoginInstance>
  // Boot only, before anything is acquired: kills what a crashed Hub left and empties the state dir.
  sweepOrphans(): Promise<void>
  // One pass of the `idle-cliproxy` job: stops the instances nobody leased for the idle window.
  sweepIdle(signal: AbortSignal): Promise<void>
  close(): Promise<void>
}>

const START_ATTEMPTS = 3
// The proxy's management answer for its stored sign-ins; one that does not match reads as not available yet.
const authFilesListing = z.looseObject({ files: z.array(z.looseObject({ unavailable: z.boolean().exactOptional() })) })
const STOP_GRACE_MS = 5_000
// Enough for the proxy to refresh an expired access token over the network.
const AUTH_READY_TIMEOUT_MS = 15_000


export async function verifyCliproxyBinary(binary: string, sha256: string): Promise<void> {
  const hash = createHash('sha256')
  try {
    for await (const chunk of createReadStream(binary)) hash.update(chunk)
  } catch {
    throw new Failure('GOOGLE_AI_PRO_BINARY_REFUSED')
  }
  if (hash.digest('hex') !== sha256) throw new Failure('GOOGLE_AI_PRO_BINARY_REFUSED')
}

function freePort(): Promise<number> { return new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    server.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Failure('GOOGLE_AI_PRO_PORT_UNAVAILABLE')))
  })
}) }

function configYaml({ port, authDir, proxyKey }: Readonly<{ port: number; authDir: string; proxyKey: string }>): string { return [
  'host: "127.0.0.1"',
  `port: ${port}`,
  `auth-dir: ${JSON.stringify(authDir)}`,
  'api-keys:',
  `  - ${JSON.stringify(proxyKey)}`,
  'remote-management:',
  '  allow-remote: false',
  '  secret-key: ""',
  '  disable-control-panel: true',
  'usage-statistics-enabled: false',
  'logging-to-file: false',
  '',
].join('\n') }

function exited(child: ChildProcess): boolean { return child.exitCode !== null || child.signalCode !== null }

function waitExit(child: ChildProcess, ms: number): Promise<boolean> { return exited(child)
  ? Promise.resolve(true)
  : new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    child.once('exit', () => { clearTimeout(timer); resolve(true) })
  }) }

async function terminate(child: ChildProcess): Promise<void> {
  if (exited(child)) return
  child.kill('SIGTERM')
  if (await waitExit(child, STOP_GRACE_MS)) return
  child.kill('SIGKILL')
  await waitExit(child, STOP_GRACE_MS)
}

async function processGone(pid: number, ms: number): Promise<boolean> {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await delay(50)) {
    try { process.kill(pid, 0) } catch { return true }
  }
  return false
}
type PoolOptions = Readonly<{
  binary: string
  stateDir: string
  idleMs?: number
  readyTimeoutMs?: number
  authReadyTimeoutMs?: number
}>
type PoolState = Required<PoolOptions> & { instances: Map<InstanceId, Instance>; logins: Set<LoginInstance>; refreshTargets: Map<InstanceId, PersistGoogleAiProRefresh>; closed: boolean }

// Reads back whatever CLIProxyAPI last wrote to the instance's own copy of the record, before
  // that copy is deleted. Best-effort: a record that no longer parses (the instance crashed
  // mid-write, or never signed in) is left alone rather than persisted over a good one.
async function captureRefresh(state: PoolState, id: InstanceId, dir: string): Promise<void> {
    const persistRefresh = state.refreshTargets.get(id)
    if (!persistRefresh) return
    try {
      const authDir = join(dir, 'auth')
      const fileName = (await readdir(authDir)).find(isAuthFileName)
      if (!fileName) return
      const refreshed = encodeKey({ fileName, bytes: new Uint8Array(await readFile(join(authDir, fileName))) })
      await persistRefresh(refreshed)
    } catch {
      // Best-effort: the instance's own stored record, if any, is still the last write-back.
    }
  }


async function waitReady({ state, child, url, proxyKey }: Readonly<{ state: PoolState; child: ChildProcess; url: string; proxyKey: string }>): Promise<boolean> {
    for (const deadline = Date.now() + state.readyTimeoutMs; Date.now() < deadline; await delay(100)) {
      if (exited(child)) return false
      try {
        const answer = await fetch(`${url}/v1/models`, { headers: { authorization: `Bearer ${proxyKey}` }, signal: AbortSignal.timeout(1_000) })
        await answer.body?.cancel()
        if (answer.ok) return true
      } catch {
        // Not listening yet.
      }
    }
    return false
  }

// The proxy answers /v1/models as soon as it listens, before it has loaded the stored sign-in: a
  // token that expired while stored is refreshed after that, and until then the account is
  // unavailable and every call gets 503 auth_unavailable. Its management API says when it is not.
async function waitAccountAvailable({ state, child, url, managementKey }: Readonly<{ state: PoolState; child: ChildProcess; url: string; managementKey: string }>): Promise<boolean> {
    for (const deadline = Date.now() + state.authReadyTimeoutMs; Date.now() < deadline; await delay(100)) {
      if (exited(child)) return false
      try {
        const answer = await fetch(`${url}/v0/management/auth-files`, { headers: { 'x-management-key': managementKey }, signal: AbortSignal.timeout(1_000) })
        const parsed: unknown = answer.ok ? await answer.json() : await answer.body?.cancel().then(() => null)
        const listing = authFilesListing.safeParse(parsed)
        if (listing.success && listing.data.files.length > 0 && listing.data.files.every((file) => file.unavailable === false)) return true
      } catch {
        // Not answering yet.
      }
    }
    return false
  }

// The port is free when read and may be taken before the child binds it; a retry covers that.
async function launch({ state, dir, authDir, environment }: Readonly<{ state: PoolState; dir: string; authDir: string; environment: Readonly<Record<string, string>> }>) {
    const config = join(dir, 'config.yaml')
    for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
      const port = await freePort()
      const proxyKey = randomBytes(24).toString('base64url')
      await writeFile(config, configYaml({ port, authDir, proxyKey }), { mode: 0o600 })
      // pdeathsig ends the child with the Hub even when the Hub dies without cleaning up.
      const child = spawn('setpriv', ['--pdeathsig', 'SIGTERM', '--', state.binary, '-config', config], {
        cwd: dir,
        env: { PATH: readCliproxyEnvironment().path, HOME: dir, ...environment },
        stdio: 'ignore',
      })
      child.once('error', () => undefined)
      if (child.pid !== undefined) await writeFile(join(dir, 'pid'), String(child.pid), { mode: 0o600 })
      const url = `http://127.0.0.1:${port}`
      if (await waitReady({ state, child, url, proxyKey })) return { child, url, proxyKey }
      await terminate(child)
    }
    throw new Failure('GOOGLE_AI_PRO_PROXY_START_FAILED')
  }


async function startInstance(state: PoolState, id: InstanceId, key: GoogleAiProKey): Promise<Ready> {
    const dir = join(state.stateDir, id)
    try {
      await rm(dir, { recursive: true, force: true })
      await mkdir(join(dir, 'auth'), { recursive: true, mode: 0o700 })
      const record = decodeKey(key)
      await writeFile(join(dir, 'auth', record.fileName), record.bytes, { mode: 0o600 })
      const managementKey = randomBytes(24).toString('base64url')
      const { child, url, proxyKey } = await launch({ state, dir, authDir: join(dir, 'auth'), environment: { MANAGEMENT_PASSWORD: managementKey } })
      if (!await waitAccountAvailable({ state, child, url, managementKey })) {
        await terminate(child)
        throw new Failure('GOOGLE_AI_PRO_ACCOUNT_UNAVAILABLE')
      }
      const ready: Ready = { state: 'ready', dir, url, proxyKey, child, leases: 0, idleSince: Date.now() }
      child.once('exit', () => {
        if (state.instances.get(id) !== ready) return
        state.instances.delete(id)
        void captureRefresh(state, id, dir).finally(() => rm(dir, { recursive: true, force: true }))
      })
      state.instances.set(id, ready)
      return ready
    } catch (error) {
      state.instances.delete(id)
      await rm(dir, { recursive: true, force: true })
      throw error
    }
  }


async function stopInstance(state: PoolState, id: InstanceId, ready: Ready): Promise<void> {
    const done = (async () => {
      await terminate(ready.child)
      await captureRefresh(state, id, ready.dir)
      await rm(ready.dir, { recursive: true, force: true })
    })()
    const stopping = { state: 'stopping', done } as const
    state.instances.set(id, stopping)
    try {
      await done
    } finally {
      if (state.instances.get(id) === stopping) state.instances.delete(id)
    }
  }

// Resolves or rejects only once every stop it started has settled, so none outlives the job's drain.
async function sweepIdle(state: PoolState, signal: AbortSignal): Promise<void> {
    const now = Date.now()
    const stops: Promise<void>[] = []
    for (const [id, instance] of state.instances) {
      if (signal.aborted) break
      if (instance.state === 'ready' && instance.leases === 0 && now - instance.idleSince >= state.idleMs) stops.push(stopInstance(state, id, instance))
    }
    const failed = (await Promise.allSettled(stops)).find((outcome) => outcome.status === 'rejected')
    if (failed) throw failed.reason
  }


async function acquire(state: PoolState, key: GoogleAiProKey, persistRefresh?: PersistGoogleAiProRefresh): Promise<Lease> {
    const id = instanceIdOf(key)
    if (persistRefresh) state.refreshTargets.set(id, persistRefresh)
    for (;;) {
      if (state.closed) throw new Failure('GOOGLE_AI_PRO_POOL_CLOSED')
      const instance = state.instances.get(id)
      if (instance === undefined) {
        state.instances.set(id, { state: 'starting', ready: startInstance(state, id, key) })
        continue
      }
      if (instance.state === 'starting') { await instance.ready; continue }
      if (instance.state === 'stopping') { await instance.done; continue }
      instance.leases++
      let released = false
      return Object.freeze({
        url: instance.url,
        proxyKey: instance.proxyKey,
        release: () => {
          if (released) return
          released = true
          instance.leases--
          instance.idleSince = Date.now()
        },
      })
    }
  }


async function startPoolLogin(state: PoolState): Promise<LoginInstance> {
    if (state.closed) throw new Failure('GOOGLE_AI_PRO_POOL_CLOSED')
    const dir = join(state.stateDir, `login-${randomBytes(8).toString('hex')}`)
    const authDir = join(dir, 'auth')
    await mkdir(authDir, { recursive: true, mode: 0o700 })
    const managementKey = randomBytes(24).toString('base64url')
    try {
      // The management key reaches the child through its environment, so the binary never rewrites
      // the config file to hash a secret written there.
      const { child, url } = await launch({ state, dir, authDir, environment: { MANAGEMENT_PASSWORD: managementKey } })
      const login: LoginInstance = Object.freeze({
        url,
        managementKey,
        authDir,
        close: async () => {
          state.logins.delete(login)
          await terminate(child)
          await rm(dir, { recursive: true, force: true })
        },
      })
      state.logins.add(login)
      return login
    } catch (error) {
      await rm(dir, { recursive: true, force: true })
      throw error
    }
  }


async function sweepOrphans(state: PoolState): Promise<void> {
    await mkdir(state.stateDir, { recursive: true, mode: 0o700 })
    for (const name of await readdir(state.stateDir)) {
      const dir = join(state.stateDir, name)
      const pid = Number((await readFile(join(dir, 'pid'), 'utf8').catch(() => '')).trim())
      if (Number.isSafeInteger(pid) && pid > 1) {
        const argv = (await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')).split('\0')
        if (argv.includes(state.binary) && argv.includes(join(dir, 'config.yaml'))) {
          try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
          await processGone(pid, STOP_GRACE_MS)
        }
      }
      await rm(dir, { recursive: true, force: true })
    }
  }


async function closePool(state: PoolState): Promise<void> {
    state.closed = true
    const pending = [...state.instances.entries()].map(async ([id, instance]) => {
      if (instance.state === 'starting') {
        const ready = await instance.ready.catch(() => null)
        if (ready) await stopInstance(state, id, ready)
      } else if (instance.state === 'ready') {
        await stopInstance(state, id, instance)
      } else {
        await instance.done
      }
    })
    await Promise.all([...pending, ...[...state.logins].map((login) => login.close())])
  }

export function createCliproxyPool({ binary, stateDir, idleMs = 10 * 60_000, readyTimeoutMs = 10_000, authReadyTimeoutMs = AUTH_READY_TIMEOUT_MS }: PoolOptions): CliproxyPool {
  const state: PoolState = { binary, stateDir, idleMs, readyTimeoutMs, authReadyTimeoutMs, instances: new Map(), logins: new Set(), refreshTargets: new Map(), closed: false }
  return Object.freeze({ acquire: (key, persist) => acquire(state, key, persist), startLogin: () => startPoolLogin(state), sweepOrphans: () => sweepOrphans(state), sweepIdle: (signal) => sweepIdle(state, signal), close: () => closePool(state) })
}
