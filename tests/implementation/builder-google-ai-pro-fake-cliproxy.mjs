#!/usr/bin/env node
// Stands in for CLIProxyAPI v7.3.12 with the shapes the probe of 2026-09-22 recorded: the OpenAI
// routes behind the config's api key as a bearer, Gemini's own routes (`/v1beta`, probed 2026-10-01)
// behind it as `x-goog-api-key`, and the management routes behind MANAGEMENT_PASSWORD.
// A record with `unavailableForMs` behaves like a stored token that has expired: the proxy refreshes
// it after that many milliseconds (-1: never), and until then reports the account unavailable.
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const config = readFileSync(process.argv[process.argv.indexOf('-config') + 1], 'utf8')
const port = Number(/^port: (\d+)$/m.exec(config)[1])
const authDir = JSON.parse(/^auth-dir: (.+)$/m.exec(config)[1])
const apiKey = JSON.parse(/^ {2}- (.+)$/m.exec(config)[1])
const managementKey = process.env.MANAGEMENT_PASSWORD
const sessions = new Map()
const startedAt = Date.now()

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
const authFiles = () => readdirSync(authDir).filter((name) => !name.startsWith('.'))
const unavailableFor = (name) => {
  try { return JSON.parse(readFileSync(join(authDir, name), 'utf8')).unavailableForMs ?? 0 } catch { return 0 }
}
const accountUnavailable = (name) => {
  const wait = unavailableFor(name)
  return wait === -1 || Date.now() - startedAt < wait
}
const readBody = async (request) => {
  let text = ''
  for await (const chunk of request) text += chunk
  return text ? JSON.parse(text) : {}
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`)
  if (url.pathname.startsWith('/v0/management/')) {
    if (!managementKey || request.headers['x-management-key'] !== managementKey) return json(response, 401, { error: 'missing management key' })
    if (url.pathname === '/v0/management/antigravity-auth-url') {
      const state = randomBytes(16).toString('hex')
      sessions.set(state, 'wait')
      return json(response, 200, { status: 'ok', state, url: `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2Flocalhost%3A51121%2Foauth-callback&state=${state}` })
    }
    if (url.pathname === '/v0/management/oauth-callback') {
      const { redirect_url: redirect } = await readBody(request)
      const callback = new URL(redirect)
      const state = callback.searchParams.get('state')
      if (!state) return json(response, 400, { status: 'error', error: 'state is required' })
      if (!sessions.has(state)) return json(response, 404, { status: 'error', error: 'unknown or expired state' })
      if (callback.searchParams.get('code') === 'good') {
        writeFileSync(join(authDir, 'antigravity-person@example.com.json'), JSON.stringify({ type: 'antigravity', refresh_token: 'refresh-from-google' }))
        sessions.delete(state)
      } else {
        sessions.set(state, 'Failed to exchange token')
      }
      return json(response, 200, { status: 'ok' })
    }
    if (url.pathname === '/v0/management/get-auth-status') {
      const state = url.searchParams.get('state')
      if (!state) return json(response, 200, { status: 'ok' })
      const status = sessions.get(state)
      if (status === undefined) return json(response, 200, { status: 'error', error: 'unknown or expired state' })
      return json(response, 200, status === 'wait' ? { status: 'wait' } : { status: 'error', error: status })
    }
    if (url.pathname === '/v0/management/auth-files') {
      return json(response, 200, { files: authFiles().map((name) => ({ name, provider: 'antigravity', status: accountUnavailable(name) ? 'error' : 'active', unavailable: accountUnavailable(name) })) })
    }
    return json(response, 404, { error: 'not found' })
  }
  if (url.pathname.startsWith('/v1beta/')) {
    if (request.headers['x-goog-api-key'] !== apiKey) return json(response, 401, { error: { code: 401, message: 'Invalid API key', status: 'UNAUTHENTICATED' } })
    if (url.pathname === '/v1beta/models') return json(response, 200, { pid: process.pid, models: authFiles().map((name) => ({ name: 'models/gemini-3.1-pro-low', displayName: name })) })
    const generate = /^\/v1beta\/models\/([^:]+):streamGenerateContent$/.exec(url.pathname)
    if (!generate) return json(response, 404, { error: { code: 404, message: 'not found', status: 'NOT_FOUND' } })
    if (authFiles().some(accountUnavailable)) return json(response, 503, { error: { code: 503, message: 'auth_unavailable: no auth available', status: 'UNAVAILABLE' } })
    if (generate[1] === 'unauthorized') return json(response, 401, { error: { code: 401, message: 'google refused the refresh token', status: 'UNAUTHENTICATED' } })
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write(`data: ${JSON.stringify({ files: authFiles() })}\n\n`)
    setTimeout(() => response.end(`data: ${JSON.stringify({ candidates: [{ finishReason: 'STOP' }] })}\n\n`), 600)
    return
  }
  if (request.headers.authorization !== `Bearer ${apiKey}`) return json(response, 401, { error: 'Invalid API key' })
  if (url.pathname === '/v1/models') return json(response, 200, { object: 'list', pid: process.pid, data: authFiles().map((name) => ({ id: 'gemini-3.1-pro-low', owned_by: name })) })
  json(response, 404, { error: 'not found' })
}).listen(port, '127.0.0.1')

process.on('SIGTERM', () => process.exit(0))
