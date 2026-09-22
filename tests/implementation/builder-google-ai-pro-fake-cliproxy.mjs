#!/usr/bin/env node
// Stands in for CLIProxyAPI v7.3.12 with the shapes the probe of 2026-09-22 recorded: the OpenAI
// routes behind the config's api key, and the three management routes behind MANAGEMENT_PASSWORD.
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

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
const authFiles = () => readdirSync(authDir).filter((name) => !name.startsWith('.'))
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
    return json(response, 404, { error: 'not found' })
  }
  if (request.headers.authorization !== `Bearer ${apiKey}`) return json(response, 401, { error: 'Invalid API key' })
  if (url.pathname === '/v1/models') return json(response, 200, { object: 'list', pid: process.pid, data: authFiles().map((name) => ({ id: 'gemini-3.1-pro-low', owned_by: name })) })
  if (url.pathname === '/v1/chat/completions') {
    const body = await readBody(request)
    if (body.model === 'unauthorized') return json(response, 401, { error: { message: 'google refused the refresh token' } })
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write(`data: ${JSON.stringify({ files: authFiles() })}\n\n`)
    setTimeout(() => response.end('data: [DONE]\n\n'), 600)
    return
  }
  json(response, 404, { error: 'not found' })
}).listen(port, '127.0.0.1')

process.on('SIGTERM', () => process.exit(0))
