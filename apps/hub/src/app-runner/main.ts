import { chmodSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createApplicationRunnerApp } from './http.js'
import { logLine } from '../platform/logger.js'
import { readRelayTls } from './pg-relay.js'
import { assertUserNamespaces, stageWorkerRuntime } from './sandbox.js'
import { createSupervisor } from './supervisor.js'

/**
 * The application runner: a process of its own, outside the Hub, that owns the application data
 * plane. The Hub reaches it only through a unix socket only their shared OS user can open, and sends
 * it platform-issued facts (Project id, admitted server tree, operation, input, caller); generated code runs
 * only in the per-invocation sandbox this process starts.
 */
const required = (name: string): string => {
  // biome-ignore lint/style/noProcessEnv: debt: owning wave
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  return value
}
const secret = (name: string): string => readFileSync(required(name), 'utf8').trim()

assertUserNamespaces()
const stateDir = required('CONEXUS_APP_RUNNER_STATE_DIR')
const socketPath = required('CONEXUS_APP_RUNNER_SOCKET')
// biome-ignore lint/style/noProcessEnv: debt: owning wave
const connectorSocketDir = process.env.CONEXUS_CONNECTOR_SOCKET_DIR
if (connectorSocketDir !== undefined && !connectorSocketDir.startsWith('/')) throw new Error('INVALID_CONFIG_CONEXUS_CONNECTOR_SOCKET_DIR')
mkdirSync(stateDir, { recursive: true, mode: 0o700 })
chmodSync(stateDir, 0o700)
rmSync(join(stateDir, 'i'), { recursive: true, force: true })
const startedAt = performance.now()
const supervisor = createSupervisor({
  stateDir,
  runtimeDir: stageWorkerRuntime(join(stateDir, 'runtime')),
  cluster: { host: required('CONEXUS_APP_DB_HOST'), port: Number(required('CONEXUS_APP_DB_PORT')) },
  database: required('CONEXUS_APP_DB_NAME'),
  provisionerPassword: secret('CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE'),
  relayTls: readRelayTls(required('CONEXUS_APP_RELAY_TLS_DIR')),
  ...(connectorSocketDir ? { connectorSocketDir } : {}),
})

await supervisor.checkProvisioner()

const app = createApplicationRunnerApp({ supervisor, log: (line) => logLine(line) })

rmSync(socketPath, { force: true })
await app.listen({ path: socketPath })
chmodSync(socketPath, 0o600)
process.stderr.write(`${JSON.stringify({ event: 'ready', socketPath, startMs: Math.round(performance.now() - startedAt) })}\n`)

let closing = false
const close = async (): Promise<void> => {
  if (closing) return
  closing = true
  await app.close()
  await supervisor.close()
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
