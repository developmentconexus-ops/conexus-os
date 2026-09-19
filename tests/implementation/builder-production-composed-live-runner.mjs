import { access, constants, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
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

const READINESS_REQUEST_TIMEOUT_MS = 5_000
const READINESS_WAIT_TIMEOUT_MS = 60_000
const READINESS_BODY_LIMIT = 128 * 1024
const SAFE_READINESS_CODES = new Set([
  'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'SELF_SIGNED_CERT_IN_CHAIN',
  'RB_COMPOSED_CA_UNREADABLE',
  'RB_COMPOSED_HUB_RESPONSE_REFUSED', 'RB_COMPOSED_HUB_RESPONSE_TOO_LARGE',
  'RB_COMPOSED_HUB_REQUEST_TIMEOUT', 'RB_COMPOSED_HUB_RESPONSE_ABORTED',
])

export const readinessErrorCode = (error) => {
  if (typeof error?.code === 'string' && SAFE_READINESS_CODES.has(error.code)) return error.code
  return 'RB_COMPOSED_HUB_REQUEST_FAILED'
}

const readinessError = (code) => Object.assign(new Error(code), { code })

const readConfiguredCa = () => {
  const path = process.env.NODE_EXTRA_CA_CERTS
  if (!path) return undefined
  try { return readFileSync(path) } catch { throw readinessError('RB_COMPOSED_CA_UNREADABLE') }
}

export const requestHubShell = (origin, {
  requestImplementation = request,
  timeoutMs = READINESS_REQUEST_TIMEOUT_MS,
  maxBodyBytes = READINESS_BODY_LIMIT,
} = {}) => new Promise((resolveRequest, rejectRequest) => {
  let settled = false
  let timeoutHandle
  const settle = (settler, value) => {
    if (settled) return
    settled = true
    clearTimeout(timeoutHandle)
    settler(value)
  }
  const fail = (error) => settle(rejectRequest, error)
  let requestHandle
  try {
    requestHandle = requestImplementation(origin, {
    method: 'GET',
    headers: { accept: 'text/html' },
    servername: origin.hostname,
    ca: readConfiguredCa(),
    // Keep the configured URL/SNI/certificate validation while resolving the
    // local loopback binding without mutating the host's resolver globally.
    lookup: (_hostname, options, callback) => options?.all
      ? callback(null, [{ address: '127.0.0.1', family: 4 }])
      : callback(null, '127.0.0.1', 4),
    }, (response) => {
      const chunks = []
      let bodyBytes = 0
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        const text = String(chunk)
        bodyBytes += Buffer.byteLength(text)
        if (bodyBytes > maxBodyBytes) {
          fail(readinessError('RB_COMPOSED_HUB_RESPONSE_TOO_LARGE'))
          response.destroy?.()
          requestHandle.destroy?.()
          return
        }
        chunks.push(text)
      })
      response.on('aborted', () => fail(readinessError('RB_COMPOSED_HUB_RESPONSE_ABORTED')))
      response.on('error', fail)
      response.on('end', () => settle(resolveRequest, {
        status: response.statusCode,
        location: response.headers.location,
        contentType: response.headers['content-type'],
        body: chunks.join(''),
      }))
    })
  } catch (error) {
    fail(error)
    return
  }
  requestHandle.on('error', fail)
  if (settled) return
  timeoutHandle = setTimeout(() => {
    const error = readinessError('RB_COMPOSED_HUB_REQUEST_TIMEOUT')
    fail(error)
    requestHandle.destroy?.(error)
  }, timeoutMs)
  requestHandle.end()
})

export const waitForHub = async (origin, server, {
  requestImplementation = request,
  maxAttempts = 60,
  requestTimeoutMs = READINESS_REQUEST_TIMEOUT_MS,
  totalTimeoutMs = READINESS_WAIT_TIMEOUT_MS,
  sleep = (delayMs) => new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs)),
} = {}) => {
  const deadline = Date.now() + totalTimeoutMs
  let lastError = 'RB_COMPOSED_HUB_REQUEST_FAILED'
  for (let attempt = 0; attempt < maxAttempts && Date.now() < deadline; attempt += 1) {
    if (server.exitCode !== null) throw new Error('RB_COMPOSED_SERVER_EXITED')
    try {
      const response = await requestHubShell(origin, { requestImplementation, timeoutMs: requestTimeoutMs })
      if (response.status !== 200 || response.location || !response.contentType?.includes('text/html') ||
        !response.body.includes('id="root"') || !response.body.includes('/assets/')) {
        throw readinessError('RB_COMPOSED_HUB_RESPONSE_REFUSED')
      }
      return
    } catch (error) {
      lastError = readinessErrorCode(error)
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) break
      await sleep(Math.min(1_000, remainingMs))
    }
  }
  throw new Error(`RB_COMPOSED_SERVER_NOT_READY: ${lastError}`)
}

const runComposedLive = async () => {
  const config = await readComposedProofConfig()
  if (!config) return 0
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
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', resolve(repositoryRoot, 'tests/implementation/builder-production-composed-live.test.mjs')], {
      cwd: repositoryRoot, env: process.env, stdio: 'inherit',
    })
    exitCode = result.status ?? 1
  } finally {
    stopServer()
    if (server && server.exitCode === null) await new Promise((resolveExit) => server.once('exit', resolveExit))
    if (buildRoot) await rm(buildRoot, { recursive: true, force: true })
  }
  return exitCode
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = await runComposedLive()
}
