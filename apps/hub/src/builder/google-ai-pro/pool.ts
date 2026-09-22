import { type ChildProcess, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { decodeKey, type GoogleAiProKey, type InstanceId, instanceIdOf } from './credential.js'

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

export type Lease = Readonly<{ url: string; proxyKey: string; release(): void }>
export type LoginInstance = Readonly<{ url: string; managementKey: string; authDir: string; close(): Promise<void> }>
export type CliproxyPool = Readonly<{
  acquire(key: GoogleAiProKey): Promise<Lease>
  startLogin(): Promise<LoginInstance>
  // Boot only, before anything is acquired: kills what a crashed Hub left and empties the state dir.
  sweepOrphans(): Promise<void>
  close(): Promise<void>
}>

const START_ATTEMPTS = 3
const STOP_GRACE_MS = 5_000

export const defaultCliproxyStateDir = (): string =>
  join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'conexus', 'cliproxy')

export const verifyCliproxyBinary = async (binary: string, sha256: string): Promise<void> => {
  const hash = createHash('sha256')
  try {
    for await (const chunk of createReadStream(binary)) hash.update(chunk as Buffer)
  } catch {
    throw new Error('GOOGLE_AI_PRO_BINARY_REFUSED')
  }
  if (hash.digest('hex') !== sha256) throw new Error('GOOGLE_AI_PRO_BINARY_REFUSED')
}

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    server.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Error('GOOGLE_AI_PRO_PORT_UNAVAILABLE')))
  })
})

const configYaml = ({ port, authDir, proxyKey }: Readonly<{ port: number; authDir: string; proxyKey: string }>): string => [
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
].join('\n')

const exited = (child: ChildProcess): boolean => child.exitCode !== null || child.signalCode !== null

const waitExit = (child: ChildProcess, ms: number): Promise<boolean> => exited(child)
  ? Promise.resolve(true)
  : new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    child.once('exit', () => { clearTimeout(timer); resolve(true) })
  })

const terminate = async (child: ChildProcess): Promise<void> => {
  if (exited(child)) return
  child.kill('SIGTERM')
  if (await waitExit(child, STOP_GRACE_MS)) return
  child.kill('SIGKILL')
  await waitExit(child, STOP_GRACE_MS)
}

const processGone = async (pid: number, ms: number): Promise<boolean> => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await delay(50)) {
    try { process.kill(pid, 0) } catch { return true }
  }
  return false
}

export const createCliproxyPool = ({ binary, stateDir, idleMs = 10 * 60_000, sweepEveryMs = 60_000, readyTimeoutMs = 10_000 }: Readonly<{
  binary: string
  stateDir: string
  idleMs?: number
  sweepEveryMs?: number
  readyTimeoutMs?: number
}>): CliproxyPool => {
  const instances = new Map<InstanceId, Instance>()
  const logins = new Set<LoginInstance>()
  let closed = false

  const waitReady = async (child: ChildProcess, url: string, proxyKey: string): Promise<boolean> => {
    for (const deadline = Date.now() + readyTimeoutMs; Date.now() < deadline; await delay(100)) {
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

  // The port is free when read and may be taken before the child binds it; a retry covers that.
  const launch = async (dir: string, authDir: string, environment: Readonly<Record<string, string>>) => {
    const config = join(dir, 'config.yaml')
    for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
      const port = await freePort()
      const proxyKey = randomBytes(24).toString('base64url')
      await writeFile(config, configYaml({ port, authDir, proxyKey }), { mode: 0o600 })
      // pdeathsig ends the child with the Hub even when the Hub dies without cleaning up.
      const child = spawn('setpriv', ['--pdeathsig', 'SIGTERM', '--', binary, '-config', config], {
        cwd: dir,
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dir, ...environment },
        stdio: 'ignore',
      })
      child.once('error', () => undefined)
      if (child.pid !== undefined) await writeFile(join(dir, 'pid'), String(child.pid), { mode: 0o600 })
      const url = `http://127.0.0.1:${port}`
      if (await waitReady(child, url, proxyKey)) return { child, url, proxyKey }
      await terminate(child)
    }
    throw new Error('GOOGLE_AI_PRO_PROXY_START_FAILED')
  }

  const start = async (id: InstanceId, key: GoogleAiProKey): Promise<Ready> => {
    const dir = join(stateDir, id)
    try {
      await rm(dir, { recursive: true, force: true })
      await mkdir(join(dir, 'auth'), { recursive: true, mode: 0o700 })
      const record = decodeKey(key)
      await writeFile(join(dir, 'auth', record.fileName), record.bytes, { mode: 0o600 })
      const { child, url, proxyKey } = await launch(dir, join(dir, 'auth'), {})
      const ready: Ready = { state: 'ready', dir, url, proxyKey, child, leases: 0, idleSince: Date.now() }
      child.once('exit', () => {
        if (instances.get(id) !== ready) return
        instances.delete(id)
        void rm(dir, { recursive: true, force: true })
      })
      instances.set(id, ready)
      return ready
    } catch (error) {
      instances.delete(id)
      await rm(dir, { recursive: true, force: true })
      throw error
    }
  }

  const stop = async (id: InstanceId, ready: Ready): Promise<void> => {
    const done = (async () => {
      await terminate(ready.child)
      await rm(ready.dir, { recursive: true, force: true })
    })()
    const stopping = { state: 'stopping', done } as const
    instances.set(id, stopping)
    try {
      await done
    } finally {
      if (instances.get(id) === stopping) instances.delete(id)
    }
  }

  const sweepIdle = (): void => {
    const now = Date.now()
    for (const [id, instance] of instances) {
      if (instance.state === 'ready' && instance.leases === 0 && now - instance.idleSince >= idleMs) void stop(id, instance)
    }
  }
  const sweeper = setInterval(sweepIdle, sweepEveryMs)
  sweeper.unref()

  const acquire = async (key: GoogleAiProKey): Promise<Lease> => {
    const id = instanceIdOf(key)
    for (;;) {
      if (closed) throw new Error('GOOGLE_AI_PRO_POOL_CLOSED')
      const instance = instances.get(id)
      if (instance === undefined) {
        instances.set(id, { state: 'starting', ready: start(id, key) })
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

  const startLogin = async (): Promise<LoginInstance> => {
    if (closed) throw new Error('GOOGLE_AI_PRO_POOL_CLOSED')
    const dir = join(stateDir, `login-${randomBytes(8).toString('hex')}`)
    const authDir = join(dir, 'auth')
    await mkdir(authDir, { recursive: true, mode: 0o700 })
    const managementKey = randomBytes(24).toString('base64url')
    try {
      // The management key reaches the child through its environment, so the binary never rewrites
      // the config file to hash a secret written there.
      const { child, url } = await launch(dir, authDir, { MANAGEMENT_PASSWORD: managementKey })
      const login: LoginInstance = Object.freeze({
        url,
        managementKey,
        authDir,
        close: async () => {
          logins.delete(login)
          await terminate(child)
          await rm(dir, { recursive: true, force: true })
        },
      })
      logins.add(login)
      return login
    } catch (error) {
      await rm(dir, { recursive: true, force: true })
      throw error
    }
  }

  const sweepOrphans = async (): Promise<void> => {
    await mkdir(stateDir, { recursive: true, mode: 0o700 })
    for (const name of await readdir(stateDir)) {
      const dir = join(stateDir, name)
      const pid = Number((await readFile(join(dir, 'pid'), 'utf8').catch(() => '')).trim())
      if (Number.isSafeInteger(pid) && pid > 1) {
        const argv = (await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')).split('\0')
        if (argv.includes(binary) && argv.includes(join(dir, 'config.yaml'))) {
          try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
          await processGone(pid, STOP_GRACE_MS)
        }
      }
      await rm(dir, { recursive: true, force: true })
    }
  }

  const close = async (): Promise<void> => {
    closed = true
    clearInterval(sweeper)
    const pending = [...instances.entries()].map(async ([id, instance]) => {
      if (instance.state === 'starting') {
        const ready = await instance.ready.catch(() => null)
        if (ready) await stop(id, ready)
      } else if (instance.state === 'ready') {
        await stop(id, instance)
      } else {
        await instance.done
      }
    })
    await Promise.all([...pending, ...[...logins].map((login) => login.close())])
  }

  return Object.freeze({ acquire, startLogin, sweepOrphans, close })
}
