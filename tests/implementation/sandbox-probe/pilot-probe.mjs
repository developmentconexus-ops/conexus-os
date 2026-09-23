import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir, networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { hubModuleUrl } from '../hub-build.mjs'
import { probeOperations, probeServerTree } from './server-tree.mjs'

// Runs the reviewed arena cases through the real runner path on a pilot host, with Node's permission
// layer off, against the pilot's actual secret paths, the runner's and Hub's /proc entries, the
// operator home and the pilot's listeners. Prints, per path, only whether it exists, whether it
// was readable and its size; the cases never return contents. Rerun:
//
//   CONEXUS_APP_DB_HOST=127.0.0.1 CONEXUS_APP_DB_PORT=5433 CONEXUS_APP_DB_NAME=conexus_apps \
//   CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE=... CONEXUS_APP_RELAY_TLS_DIR=... \
//   CONEXUS_PROBE_PIDS="<runner pid> <hub pids>" node tests/implementation/sandbox-probe/pilot-probe.mjs
//
// It allocates one fixed probe Project in the application database, the same one on every run.

const { createSupervisor } = await import(hubModuleUrl('app-runner/supervisor.js'))
const { DEFAULT_SANDBOX, stageWorkerRuntime } = await import(hubModuleUrl('app-runner/sandbox.js'))

const PROBE_PROJECT = '00000000-0000-4000-8000-0000000000be'
const required = (name) => process.env[name] || (() => { throw new Error(`MISSING_CONFIG_${name}`) })()
const home = homedir()
const tlsDir = required('CONEXUS_APP_RELAY_TLS_DIR')
const children = (directory) => (existsSync(directory) ? readdirSync(directory).map((name) => join(directory, name)) : [directory])
const deep = (paths) => paths.flatMap((path) => (existsSync(path) && statSync(path).isDirectory() ? [path, ...deep(children(path))] : [path]))
const pids = [String(process.pid), ...(process.env.CONEXUS_PROBE_PIDS ?? '').split(/\s+/).filter((pid) => /^\d+$/.test(pid))]
const paths = [
  home,
  ...deep(children(join(home, '.config/conexus/secrets'))),
  ...deep(children(join(home, '.local/share/conexus/pilot/slice7/secrets'))),
  join(home, 'wt-rmmc/.audit/slice7/hub.env'),
  ...pids.flatMap((pid) => [`/proc/${pid}/environ`, `/proc/${pid}/cmdline`]),
]
const hostAddress = Object.values(networkInterfaces()).flat().find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address
const targets = [3443, 3444, 5433, 8443, 55432].flatMap((port) => [{ host: '127.0.0.1', port }, ...(hostAddress ? [{ host: hostAddress, port }] : [])])

const stateDir = join(tmpdir(), 'conexus-sandbox-probe')
const supervisor = createSupervisor({
  stateDir,
  runtimeDir: stageWorkerRuntime(join(stateDir, 'runtime')),
  cluster: { host: required('CONEXUS_APP_DB_HOST'), port: Number(required('CONEXUS_APP_DB_PORT')) },
  database: required('CONEXUS_APP_DB_NAME'),
  provisionerPassword: readFileSync(required('CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE'), 'utf8').trim(),
  relayTls: { ca: readFileSync(join(tlsDir, 'ca.pem'), 'utf8'), cert: readFileSync(join(tlsDir, 'relay.pem'), 'utf8'), key: readFileSync(join(tlsDir, 'relay-key.pem'), 'utf8') },
  sandbox: { ...DEFAULT_SANDBOX, nodePermission: false },
})
try {
  const files = probeServerTree()
  const prepared = await supervisor.prepare({ projectId: PROBE_PROJECT, files })
  if (prepared.state !== 'READY') throw new Error(`PROBE_PREPARE_FAILED: ${JSON.stringify(prepared)}`)
  const run = async (name, input) => {
    const answer = await supervisor.invoke({ projectId: PROBE_PROJECT, operation: probeOperations[name], input, files })
    if (answer.status !== 200) throw new Error(`PROBE_${name}_FAILED: ${JSON.stringify(answer.body)}`)
    return JSON.parse(answer.body.text)
  }
  const tilde = (path) => path.replace(home, '~')
  const secrets = await run('read_secrets', { paths })
  const walk = await run('walk_fs', { home })
  const proc = await run('read_proc', {})
  const egress = await run('network_egress', { targets })
  const report = {
    probe: 'namespace root, Node permission layer off',
    at: new Date().toISOString(),
    permissionLayerOff: typeof walk.probes['/'] === 'number',
    paths: secrets.results.map((entry) => ({ path: tilde(entry.path), exists: entry.exists, readable: entry.readable, bytes: entry.bytes, ...(entry.err ? { err: entry.err } : {}) })),
    walk: Object.fromEntries(Object.entries(walk.probes).map(([path, value]) => [tilde(path), value])),
    proc,
    network: egress.results,
    breach: secrets.BREACH || walk.BREACH || proc.BREACH || egress.BREACH,
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.breach || !report.permissionLayerOff) process.exitCode = 1
} finally {
  await supervisor.close()
}
