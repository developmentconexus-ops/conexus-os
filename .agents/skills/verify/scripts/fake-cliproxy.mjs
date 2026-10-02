#!/usr/bin/env node
// Verification stand-in for CLIProxyAPI, the binary the Hub runs for a Google AI Pro account
// (CONEXUS_CLIPROXY_BIN). It is the provider boundary: nothing in the Hub is stubbed, and no request
// leaves this machine: the verify browser cannot resolve accounts.google.com, and every chat
// completion streams the fixed reasoning and answer below.
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const FAKE_REASONING = 'Verificação: o pedido chegou ao modelo simulado.'
const FAKE_ANSWER = 'Resposta do modelo simulado do verify. Nenhum provedor real foi chamado.'
const AUTH_FILE = 'antigravity-verify@conexus.test.json'

const config = readFileSync(process.argv[process.argv.indexOf('-config') + 1], 'utf8')
const port = Number(/^port: (\d+)$/m.exec(config)[1])
const authDir = JSON.parse(/^auth-dir: (.+)$/m.exec(config)[1])
const apiKey = JSON.parse(/^ {2}- (.+)$/m.exec(config)[1])
const managementKey = process.env.MANAGEMENT_PASSWORD
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

const chunk = (delta, extra = {}) => `data: ${JSON.stringify({ id: 'verify', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`

const streamAnswer = (response, model) => {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.write(chunk({ role: 'assistant', reasoning_content: FAKE_REASONING }, { model }))
  for (const word of FAKE_ANSWER.split(' ')) response.write(chunk({ content: `${word} ` }, { model }))
  response.write(`data: ${JSON.stringify({ id: 'verify', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
  response.end('data: [DONE]\n\n')
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
  if (request.headers.authorization !== `Bearer ${apiKey}`) return json(response, 401, { error: 'Invalid API key' })
  if (url.pathname === '/v1/models') return json(response, 200, { object: 'list', data: [{ id: 'gemini-3-flash', owned_by: AUTH_FILE }] })
  if (url.pathname === '/v1/chat/completions') {
    const body = await readBody(request)
    if (body.stream) return streamAnswer(response, body.model)
    return json(response, 200, {
      id: 'verify', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: FAKE_ANSWER, reasoning_content: FAKE_REASONING }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })
  }
  json(response, 404, { error: 'not found' })
}).listen(port, '127.0.0.1')

process.on('SIGTERM', () => process.exit(0))
