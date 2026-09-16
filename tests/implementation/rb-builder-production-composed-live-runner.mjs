import { access, constants, rm } from 'node:fs/promises'
import { request } from 'node:https'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { buildHubLocal } from '../../scripts/build-hub-local.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const required = ['CONEXUS_RB_COMPOSED_WORKSPACE_ID', 'CONEXUS_RB_COMPOSED_OPERATOR_STORAGE_STATE', 'CONEXUS_RB_COMPOSED_DENIED_STORAGE_STATE']

const readComposedProofConfig = async () => {
  if (process.env.CONEXUS_RB_COMPOSED_LIVE !== 'true') return null
  const missing = required.filter((name) => !process.env[name])
  const originValue = process.env.CONEXUS_RB_COMPOSED_ORIGIN ?? process.env.CONEXUS_ORIGIN
  if (!originValue) missing.push('CONEXUS_ORIGIN')
  let origin
  try { origin = new URL(originValue) } catch { throw new Error('CONEXUS_RB_COMPOSED_CONFIG_REFUSED') }
  if (origin.protocol !== 'https:' || origin.hostname !== 'hub.conexus.localhost' || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('CONEXUS_RB_COMPOSED_HTTPS_ORIGIN_REFUSED')
  }
  const configuredOrigin = process.env.CONEXUS_ORIGIN ? new URL(process.env.CONEXUS_ORIGIN) : undefined
  if (!configuredOrigin || origin.href !== configuredOrigin.href) throw new Error('CONEXUS_RB_COMPOSED_ORIGIN_MISMATCH')
  const traceStorePath = process.env.CONEXUS_RB_COMPOSED_TRACE_STORE_PATH ??
    (process.env.CONEXUS_PROJECT_STORAGE_ROOT ? resolve(process.env.CONEXUS_PROJECT_STORAGE_ROOT, 'builder-session.db') : undefined)
  if (!traceStorePath) missing.push('CONEXUS_PROJECT_STORAGE_ROOT')
  if (missing.length > 0) throw new Error(`CONEXUS_RB_COMPOSED_LIVE_CONFIG_REFUSED: ${missing.join(',')}`)
  for (const path of [process.env.CONEXUS_RB_COMPOSED_OPERATOR_STORAGE_STATE, process.env.CONEXUS_RB_COMPOSED_DENIED_STORAGE_STATE, traceStorePath]) {
    try { await access(path, constants.R_OK) } catch { throw new Error('CONEXUS_RB_COMPOSED_REFERENCE_UNREADABLE') }
  }
  return Object.freeze({ origin, workspaceId: process.env.CONEXUS_RB_COMPOSED_WORKSPACE_ID, traceStorePath })
}

const requestHubShell = (origin) => new Promise((resolveRequest, rejectRequest) => {
  const requestHandle = request(origin, {
    method: 'GET',
    headers: { accept: 'text/html' },
    servername: origin.hostname,
    // Keep the configured URL/SNI/certificate validation while resolving the
    // local loopback binding without mutating the host's resolver globally.
    lookup: (_hostname, _options, callback) => callback(null, '127.0.0.1', 4),
  }, (response) => {
    const chunks = []
    response.setEncoding('utf8')
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => resolveRequest({ status: response.statusCode, location: response.headers.location, contentType: response.headers['content-type'], body: chunks.join('') }))
  })
  requestHandle.on('error', rejectRequest)
  requestHandle.end()
})

const waitForHub = async (origin, server) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error('RB_COMPOSED_SERVER_EXITED')
    try {
      const response = await requestHubShell(origin)
      if (response.status !== 200 || response.location || !response.contentType?.includes('text/html') ||
        !response.body.includes('id="root"') || !response.body.includes('/assets/')) throw new Error('RB_COMPOSED_HUB_RESPONSE_REFUSED')
      return
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
    }
  }
  throw new Error('RB_COMPOSED_SERVER_NOT_READY')
}

const config = await readComposedProofConfig()
if (!config) {
  process.exitCode = 0
} else {
  let server
  let buildRoot
  const stopServer = () => { if (server && server.exitCode === null) server.kill('SIGTERM') }
  process.once('SIGINT', stopServer)
  process.once('SIGTERM', stopServer)
  let exitCode = 1
  try {
    buildRoot = await buildHubLocal()
    server = spawn(process.execPath, [resolve(buildRoot, 'server.js')], { cwd: repositoryRoot, env: process.env, stdio: 'inherit' })
    await waitForHub(config.origin, server)
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', resolve(repositoryRoot, 'tests/implementation/rb-builder-production-composed-live.test.mjs')], {
      cwd: repositoryRoot, env: process.env, stdio: 'inherit',
    })
    exitCode = result.status ?? 1
  } finally {
    stopServer()
    if (server && server.exitCode === null) await new Promise((resolveExit) => server.once('exit', resolveExit))
    if (buildRoot) await rm(buildRoot, { recursive: true, force: true })
  }
  process.exitCode = exitCode
}
