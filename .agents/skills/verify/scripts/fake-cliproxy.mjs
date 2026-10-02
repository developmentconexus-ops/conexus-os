#!/usr/bin/env node
// Verification stand-in for CLIProxyAPI, the binary the Hub runs for a Google AI Pro account
// (CONEXUS_CLIPROXY_BIN). It is the provider boundary: nothing in the Hub is stubbed, and no request
// leaves this machine, because the verify browser cannot resolve accounts.google.com. It serves the
// sign-in and readiness routes only. The Hub calls models on Gemini's /v1beta API, which this does not
// answer, and no turn reaches a model while E2B is closed. With CONEXUS_FAKE_MODEL_URL set (tests/live
// does, through a wrapper, because the Hub spawns this with a scrubbed environment) it forwards
// `streamGenerateContent` and `generateContent` there, so a scripted model answers as Gemini would.
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, request as forward } from 'node:http'
import { join } from 'node:path'

const AUTH_FILE = 'antigravity-verify@conexus.test.json'

const config = readFileSync(process.argv[process.argv.indexOf('-config') + 1], 'utf8')
const port = Number(/^port: (\d+)$/m.exec(config)[1])
const authDir = JSON.parse(/^auth-dir: (.+)$/m.exec(config)[1])
const apiKey = JSON.parse(/^ {2}- (.+)$/m.exec(config)[1])
const managementKey = process.env.MANAGEMENT_PASSWORD
const modelUrl = process.env.CONEXUS_FAKE_MODEL_URL ? new URL(process.env.CONEXUS_FAKE_MODEL_URL) : undefined
const pending = new Set()

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
const readBody = async (request) => {
  let text = ''
  for await (const piece of request) text += piece
  return text ? JSON.parse(text) : {}
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`)
  if (url.pathname.startsWith('/v0/management/')) {
    if (!managementKey || request.headers['x-management-key'] !== managementKey) return json(response, 401, { error: 'missing management key' })
    if (url.pathname === '/v0/management/antigravity-auth-url') {
      const state = randomBytes(16).toString('hex')
      pending.add(state)
      return json(response, 200, { status: 'ok', state, url: `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2Flocalhost%3A51121%2Foauth-callback&state=${state}` })
    }
    if (url.pathname === '/v0/management/oauth-callback') {
      const state = new URL((await readBody(request)).redirect_url).searchParams.get('state')
      if (!state || !pending.delete(state)) return json(response, 404, { status: 'error', error: 'unknown or expired state' })
      writeFileSync(join(authDir, AUTH_FILE), JSON.stringify({ type: 'antigravity', refresh_token: 'verify-fake-refresh' }))
      return json(response, 200, { status: 'ok' })
    }
    if (url.pathname === '/v0/management/get-auth-status') {
      const state = url.searchParams.get('state')
      return json(response, 200, state && pending.has(state) ? { status: 'wait' } : { status: 'error', error: 'unknown or expired state' })
    }
    if (url.pathname === '/v0/management/auth-files') {
      return json(response, 200, { files: readdirSync(authDir).filter((name) => !name.startsWith('.')).map((name) => ({ name, provider: 'antigravity', status: 'active', unavailable: false })) })
    }
    return json(response, 404, { error: 'not found' })
  }
  if (modelUrl && /^\/v1beta\/models\/[^:/]+:(?:stream)?[gG]enerateContent$/.test(url.pathname)) {
    if (request.headers['x-goog-api-key'] !== apiKey) return json(response, 401, { error: { code: 401, message: 'Invalid API key', status: 'UNAUTHENTICATED' } })
    const outgoing = forward({ hostname: modelUrl.hostname, port: modelUrl.port, method: request.method, path: request.url, headers: { ...request.headers, host: modelUrl.host } }, (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(response)
    })
    outgoing.once('error', () => { if (response.headersSent) response.destroy(); else json(response, 502, { error: { code: 502, message: 'model server unreachable', status: 'UNAVAILABLE' } }) })
    response.once('close', () => { if (!response.writableFinished) outgoing.destroy() })
    request.pipe(outgoing)
    return
  }
  if (request.headers.authorization !== `Bearer ${apiKey}`) return json(response, 401, { error: 'Invalid API key' })
  if (url.pathname === '/v1/models') return json(response, 200, { object: 'list', data: [{ id: 'gemini-3-flash', owned_by: AUTH_FILE }] })
  json(response, 404, { error: 'not found' })
}).listen(port, '127.0.0.1')

process.on('SIGTERM', () => process.exit(0))
