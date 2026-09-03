import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { request as requestHttp } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { chromium, firefox, webkit } from '@playwright/test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const webBuild = mkdtempSync('/tmp/conexus-s5-web-')
const hubBuild = mkdtempSync('/tmp/conexus-s5-hub-')
const tlsBuild = mkdtempSync('/tmp/conexus-s5-tls-')
process.once('exit', () => {
  rmSync(webBuild, { recursive: true, force: true })
  rmSync(hubBuild, { recursive: true, force: true })
  rmSync(tlsBuild, { recursive: true, force: true })
})

const run = (arguments_, environment = {}) => {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  })
  if (result.status !== 0) {
    throw new Error(`S5_SUBPROCESS_FAILED\n${result.stdout}\n${result.stderr}`)
  }
}

const secretCanaries = [
  's5-db-password-must-not-bundle',
  's5-cookie-value-must-not-bundle',
  's5-private-key-must-not-bundle',
]
run([
  resolve(repositoryRoot, 'node_modules/vite/bin/vite.js'),
  'build',
  resolve(repositoryRoot, 'apps/web'),
  '--config',
  resolve(repositoryRoot, 'apps/web/vite.config.mjs'),
  '--configLoader',
  'native',
  '--outDir',
  webBuild,
  '--emptyOutDir',
], {
  CONEXUS_DB_PASSWORD: secretCanaries[0],
  CONEXUS_COOKIE_SECRET: secretCanaries[1],
  CONEXUS_OIDC_CLIENT_SECRET: secretCanaries[2],
})
run([
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project',
  resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit',
  'false',
  '--outDir',
  hubBuild,
])
symlinkSync(resolve(repositoryRoot, 'node_modules'), resolve(hubBuild, 'node_modules'), 'dir')
const keyFile = resolve(tlsBuild, 'key.pem')
const certFile = resolve(tlsBuild, 'cert.pem')
const certificate = spawnSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
  '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
  '-keyout', keyFile, '-out', certFile,
], { encoding: 'utf8' })
if (certificate.status !== 0) {
  throw new Error(`S5_TLS_CERTIFICATE_FAILED\n${certificate.stdout}\n${certificate.stderr}`)
}

const collectFiles = (directory) => readdirSync(directory).flatMap((entry) => {
  const candidate = resolve(directory, entry)
  return statSync(candidate).isDirectory() ? collectFiles(candidate) : [candidate]
})
const bundleText = collectFiles(webBuild)
  .filter((file) => /\.(?:html|css|js|map)$/.test(file))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

const { createHttpApp } = await import(pathToFileURL(resolve(hubBuild, 'http/app.js')).href)

const workspaceId = '20000000-0000-4000-8000-000000000095'
const projectId = '30000000-0000-4000-8000-000000000095'
const digest = 'c'.repeat(64)
const sourceText = 'Exact S5 immutable candidate truth'
const account = {
  accountId: '10000000-0000-4000-8000-000000000095',
  displayName: 'S5 Operator',
  email: 's5@example.test',
}
const workspace = { workspaceId, name: 'S5 Workspace' }
const project = { projectId, workspaceId, name: 'S5 Project', projectRevision: 'revision-s5', archived: false }
const candidate = {
  candidateBaselineDigest: digest,
  sourceRevision: 'revision-s5',
  sourceText,
  applicationRuntimeProfile: 'MANAGED',
}
const approvedBaseline = {
  baselineDigest: digest,
  sourceRevision: candidate.sourceRevision,
  sourceText,
  applicationRuntimeProfile: 'MANAGED',
}

const selectedBrowser = process.env.CONEXUS_S5_BROWSER
const browserTypes = [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
].filter(([name]) => !selectedBrowser || name === selectedBrowser)

test('S5-P1 production browser boundary is exact across Chromium, Firefox and WebKit', async (t) => {
  for (const secret of secretCanaries) assert.doesNotMatch(bundleText, new RegExp(secret))
  assert.doesNotMatch(bundleText, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/)

  const state = {
    accessStatus: 200,
    projectStatus: 200,
    candidateStatus: 200,
    approved: false,
    decisionCount: 0,
    releaseDecision: undefined,
  }
  const app = await createHttpApp({
    staticRoot: webBuild,
    registerRoutes: async (server) => {
      server.get('/api/control/access-context', (_request, reply) => {
        if (state.accessStatus !== 200) return reply.code(state.accessStatus).send({ title: 'unavailable' })
        return reply.send({ account, workspaces: [workspace], projects: [{ ...project }] })
      })
      server.get('/api/control/workspaces/:workspaceId', (request, reply) =>
        request.params.workspaceId === workspaceId
          ? reply.send(workspace)
          : reply.code(404).send({ title: 'not found' }),
      )
      server.get('/api/control/workspaces/:workspaceId/projects', (request, reply) =>
        request.params.workspaceId === workspaceId
          ? reply.send([{ ...project }])
          : reply.code(404).send({ title: 'not found' }),
      )
      server.get('/api/control/projects/:projectId', (request, reply) => {
        if (state.projectStatus !== 200 || request.params.projectId !== projectId) {
          return reply.code(state.projectStatus === 200 ? 404 : state.projectStatus).send({ title: 'not found' })
        }
        return reply.send(project)
      })
      server.get('/api/control/projects/:projectId/baseline-candidates/:digest', (request, reply) => {
        if (
          state.candidateStatus !== 200 ||
          request.params.projectId !== projectId ||
          request.params.digest !== digest
        ) {
          return reply.code(state.candidateStatus === 200 ? 404 : state.candidateStatus).send({ title: 'not found' })
        }
        return reply.send(candidate)
      })
      server.get('/api/control/projects/:projectId/baseline', (_request, reply) =>
        state.approved ? reply.send(approvedBaseline) : reply.code(404).send({ title: 'not found' }),
      )
      server.post('/api/control/projects/:projectId/baseline/decisions', async (_request, reply) => {
        state.decisionCount += 1
        await new Promise((resolveDecision) => {
          state.releaseDecision = resolveDecision
        })
        state.approved = true
        return reply.send(approvedBaseline)
      })
      return []
    },
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const address = app.server.address()
  assert(address && typeof address === 'object')
  const tlsServer = createHttpsServer({
    key: readFileSync(keyFile),
    cert: readFileSync(certFile),
  }, (incoming, outgoing) => {
    const upstream = requestHttp({
      hostname: '127.0.0.1',
      port: address.port,
      path: incoming.url,
      method: incoming.method,
      headers: incoming.headers,
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 500, response.headers)
      response.pipe(outgoing)
    })
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502)
      outgoing.end()
    })
    incoming.pipe(upstream)
  })
  await new Promise((resolveListen) => tlsServer.listen(0, '127.0.0.1', resolveListen))
  t.after(() => {
    tlsServer.closeAllConnections()
    return new Promise((resolveClose) => tlsServer.close(resolveClose))
  })
  const tlsAddress = tlsServer.address()
  assert(tlsAddress && typeof tlsAddress === 'object')
  const origin = `https://127.0.0.1:${tlsAddress.port}`

  const deepResponse = await app.inject({ method: 'GET', url: `/projects/${projectId}` })
  assert.equal(deepResponse.statusCode, 200)
  assert.match(deepResponse.headers['content-security-policy'], /default-src 'self'/)
  assert.equal(deepResponse.headers['x-content-type-options'], 'nosniff')
  const forgedApi = await app.inject({ method: 'GET', url: '/api/control/forged' })
  assert.equal(forgedApi.statusCode, 404)
  assert.doesNotMatch(String(forgedApi.headers['content-type']), /text\/html/)

  for (const [browserName, browserType] of browserTypes) {
    await t.test(browserName, async () => {
      state.accessStatus = 200
      state.projectStatus = 200
      state.candidateStatus = 200
      state.approved = false
      state.decisionCount = 0
      state.releaseDecision = undefined
      const browser = await browserType.launch({ headless: true })
      let context
      try {
        context = await browser.newContext({
          viewport: { width: 1280, height: 900 },
          reducedMotion: 'reduce',
          ignoreHTTPSErrors: true,
        })
      await context.addInitScript(() => {
        localStorage.setItem('conexus-project', 'FORGED LOCAL PROJECT')
        sessionStorage.setItem('conexus-baseline', 'FORGED SESSION BASELINE')
      })
      const page = await context.newPage()
      const diagnostics = []
      page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error') diagnostics.push(`console: ${message.text()}`)
      })

      const projectsResponse = await page.goto(`${origin}/workspaces/${workspaceId}/projects`)
      assert.equal(projectsResponse?.status(), 200)
      try {
        await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor()
      } catch (error) {
        throw new Error(`${browserName} did not render Projects\n${diagnostics.join('\n')}\n${await page.locator('body').innerText()}`, { cause: error })
      }
      assert.equal(await page.getByRole('navigation', { name: 'Navegação principal' }).count(), 1)
      await page.getByRole('navigation', { name: 'Contexto atual' }).getByText('S5 Workspace').waitFor()
      assert.equal(await page.getByRole('button', { name: 'Navegação' }).isVisible(), false)

      const accountTrigger = page.getByRole('button', { name: 'S5 Operator' })
      await accountTrigger.click()
      const accountDialog = page.getByRole('dialog', { name: 'Conta atual' })
      await accountDialog.waitFor()
      assert.equal(await accountDialog.evaluate((element) => element === document.activeElement), true)
      await page.keyboard.press('Escape')
      assert.equal(await accountTrigger.evaluate((element) => element === document.activeElement), true)
      await accountTrigger.click()
      await page.getByRole('heading', { name: 'Projects', exact: true }).click()
      assert.equal(await accountDialog.count(), 0)

      const reducedMotion = await page.locator('.navigation-drawer').evaluate((element) => ({
        transition: getComputedStyle(element).transitionDuration,
        animation: getComputedStyle(element).animationDuration,
      }))
      assert.equal(reducedMotion.transition, '0s')
      assert.equal(reducedMotion.animation, '0s')

      state.accessStatus = 401
      await page.goto(`${origin}/setup`)
      const accountName = page.getByLabel('Nome de exibição')
      await accountName.fill('   ')
      await page.getByRole('button', { name: 'Criar minha conta' }).click()
      assert.equal(await accountName.evaluate((element) => element === document.activeElement), true)

      state.accessStatus = 200
      await page.goto(`${origin}/workspaces/new`)
      const workspaceName = page.getByLabel('Nome do Workspace')
      await workspaceName.fill('   ')
      await page.getByRole('button', { name: 'Criar Workspace' }).click()
      assert.equal(await workspaceName.evaluate((element) => element === document.activeElement), true)

      await page.goto(`${origin}/workspaces/${workspaceId}/projects/new`)
      await page.getByLabel('Nome do Project').fill('Project with invalid source')
      await page.getByLabel('Repositório Git existente').check()
      const repositoryLocator = page.getByLabel('Localizador do repositório')
      await repositoryLocator.fill('   ')
      await page.getByRole('button', { name: 'Criar Project' }).click()
      assert.equal(await repositoryLocator.evaluate((element) => element === document.activeElement), true)

      for (const route of [
        '/workspaces/new',
        `/workspaces/${workspaceId}/projects/new`,
        `/projects/${projectId}`,
        `/projects/${projectId}/baseline-candidates/${digest}`,
      ]) {
        const response = await page.goto(`${origin}${route}`)
        assert.equal(response?.status(), 200, `${browserName} ${route}`)
        await page.getByRole('main').waitFor()
      }
      await page.getByText(sourceText, { exact: true }).waitFor()
      await page.getByText('Nenhuma Baseline aprovada existe para este Project.').waitFor()

      await page.setViewportSize({ width: 360, height: 800 })
      const navigationTrigger = page.getByRole('button', { name: 'Navegação' })
      await navigationTrigger.click()
      const navigationDrawer = page.locator('#primary-navigation')
      assert.equal(await navigationDrawer.evaluate((element) => element === document.activeElement), true)
      await page.keyboard.press('Escape')
      assert.equal(await navigationTrigger.evaluate((element) => element === document.activeElement), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)

      const approve = page.getByRole('button', { name: 'Aprovar este Candidate' })
      await approve.evaluate((element) => {
        element.click()
        element.click()
      })
      await page.waitForFunction(() => document.querySelector('button[disabled]') !== null)
      assert.equal(state.decisionCount, 1, `${browserName} double command`)
      state.releaseDecision?.()
      await page.getByText('Baseline aprovada pelo servidor.').waitFor()

      state.candidateStatus = 404
      await page.reload()
      await page.getByRole('heading', { name: 'Candidate indisponível' }).waitFor()
      assert.equal(await page.getByText('FORGED LOCAL PROJECT').count(), 0)
      assert.equal(await page.getByText('FORGED SESSION BASELINE').count(), 0)

      state.candidateStatus = 200
      state.accessStatus = 401
      await page.reload()
      await page.getByRole('heading', { name: 'Entre no Conexus' }).waitFor()
      assert.equal(await page.getByText(sourceText, { exact: true }).count(), 0)

      state.accessStatus = 200
      state.projectStatus = 404
      await page.goto(`${origin}/projects/30000000-0000-4000-8000-000000000999`)
      await page.getByRole('heading', { name: 'Project indisponível' }).waitFor()
      assert.equal(await page.getByText('S5 Project', { exact: true }).count(), 0)

      } finally {
        state.releaseDecision?.()
        await context?.close()
        await browser.close()
      }
    })
  }
})
