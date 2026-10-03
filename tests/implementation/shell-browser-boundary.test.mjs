import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { hubModuleUrl } from './hub-build.mjs'
import { startWebServer } from './web-dev-server.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')

test('the SPA page carries its own style nonce, the same one its CSP allows, fresh per response', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const staticRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/shell-static-'))
  t.after(() => rmSync(staticRoot, { recursive: true, force: true }))
  writeFileSync(resolve(staticRoot, 'index.html'), '<!doctype html><html><head><title>Conexus</title></head><body></body></html>')
  const app = await createHttpApp({ staticRoot, registerRoutes: async () => [] })
  t.after(() => app.close())

  const nonces = []
  for (let i = 0; i < 2; i += 1) {
    const response = await app.inject({ method: 'GET', url: '/settings/models' })
    assert.equal(response.statusCode, 200)
    const page = response.body.match(/<meta name="csp-nonce" content="([0-9a-f]{32})">/)?.[1]
    assert.ok(page, response.body)
    const styleSrc = response.headers['content-security-policy'].split(';').find((d) => d.trim().startsWith('style-src '))
    assert.ok(styleSrc.includes(`'nonce-${page}'`), styleSrc)
    assert.ok(!styleSrc.includes("'unsafe-inline'"), styleSrc)
    nonces.push(page)
  }
  assert.notEqual(nonces[0], nonces[1])
})

test('every SPA path answers with the shell page', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const staticRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/shell-static-'))
  t.after(() => rmSync(staticRoot, { recursive: true, force: true }))
  writeFileSync(resolve(staticRoot, 'index.html'), '<!doctype html><html><head><title>Conexus</title></head><body></body></html>')
  const app = await createHttpApp({ staticRoot, registerRoutes: async () => [] })
  t.after(() => app.close())

  const id = '10000000-0000-4000-8000-000000000001'
  for (const url of [
    '/', '/setup', '/workspaces', '/workspaces/new', `/workspaces/${id}/projects`, `/workspaces/${id}/projects/new`,
    `/workspaces/${id}/settings/people`, `/projects/${id}`, `/projects/${id}/c/${id}`, `/projects/${id}/settings`,
    `/projects/${id}/settings/access`, `/projects/${id}/integrations`, '/settings', '/settings/account', '/settings/models',
    '/settings/installation/admins', '/signed-out', '/no-access',
  ]) {
    const response = await app.inject({ method: 'GET', url })
    assert.equal(response.statusCode, 200, url)
    assert.match(response.body, /<title>Conexus<\/title>/, url)
  }
})

test('a double click on Criar Workspace sends one request', { timeout: 120_000 }, async (t) => {
  const origin = await startWebServer(t, { logLevel: 'error' })
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await (await browser.newContext()).newPage()
  const accountId = '10000000-0000-4000-8000-000000000001'
  const workspaceId = '20000000-0000-4000-8000-000000000002'
  let creates = 0
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/control/access-context') return json(200, { account: { accountId, displayName: 'Marina Alves', email: 'marina@empresa.com.br' }, workspaces: [], projects: [] })
    if (path === '/api/control/workspaces' && request.method() === 'POST') {
      creates += 1
      await new Promise((settle) => setTimeout(settle, 300))
      return json(201, { workspaceId, name: 'Comercial', initialAccessEstablished: true, creatorAccountId: accountId })
    }
    return json(404, { type: 'not-mocked' })
  })
  await page.goto(`${origin}/workspaces/new`)
  await page.getByLabel('Nome do Workspace').fill('Comercial')
  await page.getByRole('button', { name: 'Criar Workspace' }).dblclick()
  await page.waitForURL(`${origin}/workspaces/${workspaceId}/projects`)
  assert.equal(creates, 1)
})

test('fingerprinted assets under assets/ are cached immutably for a year; other static files are not', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const tempDir = mkdtempSync(resolve(repositoryRoot, 'apps/hub/test-tmp-'))
  t.after(() => rmSync(tempDir, { recursive: true, force: true }))
  const staticRoot = resolve(tempDir, 'assets', 'public')
  mkdirSync(staticRoot, { recursive: true })
  writeFileSync(resolve(staticRoot, 'index.html'), '<!doctype html><html><head><title>Conexus</title></head><body></body></html>')
  mkdirSync(resolve(staticRoot, 'assets'))
  writeFileSync(resolve(staticRoot, 'assets/app-abc123.js'), 'console.log(1)')
  writeFileSync(resolve(staticRoot, 'favicon.svg'), '<svg></svg>')
  const app = await createHttpApp({ staticRoot, registerRoutes: async () => [] })
  t.after(() => app.close())

  const fingerprinted = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' })
  assert.equal(fingerprinted.statusCode, 200)
  assert.equal(fingerprinted.headers['cache-control'], 'public, max-age=31536000, immutable')

  const favicon = await app.inject({ method: 'GET', url: '/favicon.svg' })
  assert.equal(favicon.statusCode, 200)
  assert.notEqual(favicon.headers['cache-control'], 'public, max-age=31536000, immutable')

  const index = await app.inject({ method: 'GET', url: '/index.html' })
  assert.equal(index.statusCode, 200)
  assert.notEqual(index.headers['cache-control'], 'public, max-age=31536000, immutable')
})

