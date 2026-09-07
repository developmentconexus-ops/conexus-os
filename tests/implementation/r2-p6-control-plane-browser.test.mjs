import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const path = (relative) => resolve(repositoryRoot, relative)

const json = (route, status, body, headers = {}) => route.fulfill({
  status,
  contentType: 'application/json',
  headers,
  body: JSON.stringify(body),
})

test('R2-P6-E real Chromium exercises the four bounded Control Plane journeys', async (t) => {
  const workspaceId = '20000000-0000-4000-8000-000000000806'
  const sessionLossWorkspaceId = '20000000-0000-4000-8000-000000000807'
  const projectId = '30000000-0000-4000-8000-000000000806'
  const workspaceConnectionId = '40000000-0000-4000-8000-000000000806'
  const eligibleConnectionId = '40000000-0000-4000-8000-000000000807'
  const privateConnectionId = '40000000-0000-4000-8000-000000000808'
  const createdConnectionId = '40000000-0000-4000-8000-000000000809'
  const qualificationId = '50000000-0000-4000-8000-000000000806'
  const server = await createServer({
    configFile: path('apps/web/vite.config.mjs'),
    root: path('apps/web'),
    server: { host: '127.0.0.1', port: 0, watch: null },
  })
  await server.listen()
  t.after(() => server.close())
  const address = server.httpServer?.address()
  assert.ok(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })

  const connector = {
    connectorDefinitionId: 'sankhya-om',
    connectorVersion: '1.0.0',
    provider: 'Sankhya OM',
    configurationSchema: {},
    credentialInputSchema: {},
    operationIds: ['LoadRecords'],
    environments: ['PRODUCTION', 'SANDBOX'],
  }
  const summary = (overrides) => ({
    connectionId: workspaceConnectionId,
    name: 'ERP Matriz em uso',
    ownerScopeKind: 'WORKSPACE',
    ownerId: workspaceId,
    connectorDefinitionId: 'sankhya-om',
    connectorVersion: '1.0.0',
    currentRevisionId: 'connection-r17',
    credentialConfigured: true,
    connectionTest: {
      state: 'PASSED',
      qualificationId: 'qualification-r17',
      environment: 'PRODUCTION',
      testedAt: '2026-09-07T12:00:00.000Z',
    },
    ...overrides,
  })
  const detail = (connection) => ({
    ...connection,
    configuration: { environment: 'PRODUCTION', companyCode: 1 },
  })
  const workspaceConnection = summary({})
  const eligibleConnection = summary({
    connectionId: eligibleConnectionId,
    name: 'ERP Filial pronta',
    currentRevisionId: 'connection-r42',
    connectionTest: {
      state: 'PASSED',
      qualificationId: 'qualification-r42',
      environment: 'PRODUCTION',
      testedAt: '2026-09-07T12:30:00.000Z',
    },
  })
  const privateConnection = summary({
    connectionId: privateConnectionId,
    name: 'ERP privado do Project',
    ownerScopeKind: 'PROJECT',
    ownerId: projectId,
    currentRevisionId: 'connection-private-r1',
    credentialConfigured: false,
    connectionTest: { state: 'NOT_TESTED' },
  })
  const createdConnection = detail(summary({
    connectionId: createdConnectionId,
    name: 'ERP criado no navegador',
    currentRevisionId: 'connection-created-r1',
    credentialConfigured: false,
    connectionTest: { state: 'NOT_TESTED' },
  }))
  const needsRetest = (previous) => ({
    state: 'NEEDS_RETEST',
    ...(previous.qualificationId ? {
      qualificationId: previous.qualificationId,
      environment: previous.environment,
      testedAt: previous.testedAt,
    } : {}),
  })

  let created = false
  let brainRevision = 'brain-r41'
  let brainBindingEtag = '"binding-r41"'
  let brainBindingPresent = true
  let sessionMustBeRejected = false
  let projectBindings = [{
    connectionId: workspaceConnectionId,
    connectionRevisionId: 'connection-r17',
    environment: 'PRODUCTION',
    connectionName: workspaceConnection.name,
  }]
  const createRequests = []
  const revisionRequests = []
  const credentialRequests = []
  const qualificationRequests = []
  let qualificationReads = 0
  const brainBindingRequests = []
  const brainClearRequests = []
  const setConnectionRequests = []
  const removeConnectionRequests = []
  const unexpectedRequests = []

  await page.route('**/api/control/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const problem = { type: 'about:blank', title: 'not found', status: 404 }

    if (url.pathname === '/api/control/access-context' && method === 'GET') {
      return json(route, 200, {
        account: { accountId: '10000000-0000-4000-8000-000000000806', displayName: 'P6 Operator' },
        workspaces: [
          { workspaceId, name: 'Workspace P6' },
          { workspaceId: sessionLossWorkspaceId, name: 'Workspace sessão expirada' },
        ],
        projects: [{ projectId, workspaceId, name: 'Project P6', archived: false }],
      })
    }
    if (url.pathname === `/api/control/workspaces/${workspaceId}` && method === 'GET') {
      return json(route, 200, { workspaceId, name: 'Workspace P6' })
    }
    if (url.pathname === `/api/control/projects/${projectId}` && method === 'GET') {
      return json(route, 200, {
        projectId,
        workspaceId,
        name: 'Project P6',
        projectRevision: 'project-r8',
        archived: false,
      })
    }
    if (url.pathname === `/api/control/workspaces/${sessionLossWorkspaceId}/brain`) {
      return json(route, sessionMustBeRejected ? 401 : 200, sessionMustBeRejected
        ? { ...problem, title: 'authentication required', status: 401 }
        : { workspaceId: sessionLossWorkspaceId, publishedBrainRevisionId: null })
    }
    if (url.pathname === `/api/control/workspaces/${sessionLossWorkspaceId}/brain/revisions`) {
      return json(route, 200, [])
    }
    if (url.pathname === `/api/control/workspaces/${workspaceId}/brain` && method === 'GET') {
      return json(route, 200, { workspaceId, publishedBrainRevisionId: 'brain-r42' })
    }
    if (url.pathname === `/api/control/workspaces/${workspaceId}/brain/revisions` && method === 'GET') {
      return json(route, 200, [
        { brainRevisionId: 'brain-r42', brainDigest: 'b'.repeat(64), sourceRevision: 'source-r42', availability: 'AVAILABLE', reviewText: 'Revisão publicada e revisada' },
        { brainRevisionId: 'brain-r41', brainDigest: 'a'.repeat(64), sourceRevision: 'source-r41', availability: 'AVAILABLE', reviewText: 'Revisão adotada anteriormente' },
      ])
    }
    if (url.pathname === `/api/control/workspaces/${workspaceId}/brain/revisions/brain-r42` && method === 'GET') {
      return json(route, 200, {
        brainRevisionId: 'brain-r42',
        brainDigest: 'b'.repeat(64),
        sourceRevision: 'source-r42',
        availability: 'AVAILABLE',
        reviewText: 'Revisão publicada e revisada',
        knowledgeBrowse: { domains: [{
          domainRef: 'finance',
          label: 'Financeiro',
          concepts: [{
            conceptRef: 'net-revenue',
            label: 'Receita líquida',
            summary: 'Receita após deduções admitidas.',
            contentClasses: ['SEMANTIC', 'KNOWLEDGE'],
            sections: [{ kind: 'DEFINITION', text: 'Valor reconhecido após impostos e devoluções.' }],
            provenanceRefs: ['knowledge/finance/net-revenue.md'],
          }],
        }] },
      })
    }
    if (url.pathname === `/api/control/workspaces/${workspaceId}/brain/health` && method === 'GET') {
      return json(route, 200, {
        brainRevisionId: 'brain-r42',
        brainDigest: 'b'.repeat(64),
        healthSnapshotDigest: 'c'.repeat(64),
        items: [{ semanticRef: 'net-revenue', state: 'VALID', critical: true }],
      })
    }
    if (url.pathname === `/api/control/projects/${projectId}/brain-context` && method === 'GET') {
      if (!brainBindingPresent) return json(route, 404, problem)
      return json(route, 200, {
        projectId,
        brainRevisionId: brainRevision,
        brainDigest: brainRevision === 'brain-r42' ? 'b'.repeat(64) : 'a'.repeat(64),
        projectBindingDigest: brainRevision === 'brain-r42' ? 'd'.repeat(64) : 'e'.repeat(64),
        validationState: 'VALID',
        updateAvailable: brainRevision !== 'brain-r42',
        domains: [{
          domainRef: 'finance',
          label: 'Financeiro aplicável',
          concepts: [{
            conceptRef: 'net-revenue',
            authoringRef: 'knowledge/finance/net-revenue',
            label: 'Receita do Project',
            summary: brainRevision === 'brain-r42' ? 'Significado adotado r42.' : 'Significado ainda adotado r41.',
            contentClasses: ['SEMANTIC'],
            detailDisclosed: true,
            sections: [{ kind: 'BUSINESS_MEANING', text: 'Contexto autorizado para este Project.' }],
            provenanceRefs: ['project-binding/finance'],
          }],
        }],
      })
    }
    if (url.pathname === `/api/control/projects/${projectId}/brain-binding` && method === 'GET') {
      if (!brainBindingPresent) return json(route, 404, problem)
      return json(route, 200, {
        brainRevisionId: brainRevision,
        brainDigest: brainRevision === 'brain-r42' ? 'b'.repeat(64) : 'a'.repeat(64),
        projectBindingDigest: brainRevision === 'brain-r42' ? 'd'.repeat(64) : 'e'.repeat(64),
        validationState: 'VALID',
        updateAvailable: brainRevision !== 'brain-r42',
      }, { etag: brainBindingEtag })
    }
    if (url.pathname === `/api/control/projects/${projectId}/brain-binding` && method === 'PUT') {
      brainBindingRequests.push({ body: request.postDataJSON(), headers: request.headers() })
      brainBindingPresent = true
      brainRevision = request.postDataJSON().brainRevisionId
      brainBindingEtag = '"binding-r42"'
      return json(route, 200, {
        brainRevisionId: brainRevision,
        brainDigest: 'b'.repeat(64),
        projectBindingDigest: 'd'.repeat(64),
        validationState: 'VALID',
        updateAvailable: false,
      }, { etag: brainBindingEtag })
    }
    if (url.pathname === `/api/control/projects/${projectId}/brain-binding` && method === 'DELETE') {
      brainClearRequests.push({ headers: request.headers() })
      brainBindingPresent = false
      return route.fulfill({ status: 204, body: '' })
    }
    if (url.pathname === '/api/control/connectors' && method === 'GET') {
      return json(route, 200, [{ connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0', provider: 'Sankhya OM' }])
    }
    if (url.pathname === '/api/control/connectors/sankhya-om' && method === 'GET') {
      return json(route, 200, connector)
    }
    const workspaceScopePath = `/api/control/connection-scopes/WORKSPACE/${workspaceId}/connections`
    if (url.pathname === workspaceScopePath && method === 'GET') {
      return json(route, 200, [workspaceConnection, eligibleConnection, ...(created ? [createdConnection] : [])])
    }
    if (url.pathname === workspaceScopePath && method === 'POST') {
      createRequests.push({ body: request.postDataJSON(), headers: request.headers() })
      if (createRequests.length === 1) {
        return json(route, 503, { ...problem, title: 'connection unavailable', status: 503 })
      }
      created = true
      return json(route, 201, createdConnection)
    }
    const projectScopePath = `/api/control/connection-scopes/PROJECT/${projectId}/connections`
    if (url.pathname === projectScopePath && method === 'GET') return json(route, 200, [privateConnection])
    if (url.pathname === `/api/control/connections/${createdConnectionId}` && method === 'GET') {
      return json(route, 200, createdConnection)
    }
    if (url.pathname === `/api/control/connections/${workspaceConnectionId}` && method === 'GET') {
      return json(route, 200, detail(workspaceConnection))
    }
    if (url.pathname === `/api/control/connections/${createdConnectionId}/revisions` && method === 'POST') {
      revisionRequests.push(request.postDataJSON())
      createdConnection.currentRevisionId = `connection-created-r${revisionRequests.length + 1}`
      createdConnection.configuration = request.postDataJSON().configuration
      createdConnection.connectionTest = needsRetest(createdConnection.connectionTest)
      return json(route, 201, {
        connectionId: createdConnectionId,
        connectionRevisionId: createdConnection.currentRevisionId,
        connectorDefinitionId: 'sankhya-om',
        connectorVersion: '1.0.0',
      })
    }
    if (url.pathname === `/api/control/connections/${createdConnectionId}/credential` && method === 'PUT') {
      credentialRequests.push({ body: request.postDataJSON(), headers: request.headers() })
      if (credentialRequests.length === 1) {
        return json(route, 503, { ...problem, title: 'credential settlement unavailable', status: 503 })
      }
      createdConnection.credentialConfigured = true
      createdConnection.connectionTest = needsRetest(createdConnection.connectionTest)
      return route.fulfill({ status: 204, body: '' })
    }
    if (url.pathname === `/api/control/connections/${createdConnectionId}/qualifications` && method === 'POST') {
      qualificationRequests.push({ body: request.postDataJSON(), headers: request.headers() })
      if (qualificationRequests.length === 1) {
        return json(route, 503, { ...problem, title: 'qualification unavailable', status: 503 })
      }
      createdConnection.connectionTest = {
        state: 'PASSED',
        qualificationId,
        environment: 'PRODUCTION',
        testedAt: '2026-09-07T13:00:00.000Z',
      }
      return json(route, 201, {
        qualificationId,
        connectionId: createdConnectionId,
        connectionRevisionId: createdConnection.currentRevisionId,
        credentialGeneration: null,
        environment: 'PRODUCTION',
        qualificationState: 'PROVIDER_CONFIRMED',
        outcome: 'PASSED',
        testedAt: '2026-09-07T13:00:00.000Z',
        diagnostic: { title: 'Sankhya confirmou o acesso', message: 'A revisão e o ambiente exatos responderam ao teste.' },
        evidenceRefs: ['qualification/local-browser-proof'],
      })
    }
    if (url.pathname === `/api/control/connections/${createdConnectionId}/qualifications/${qualificationId}` && method === 'GET') {
      qualificationReads += 1
      return json(route, 200, {
        qualificationId,
        connectionId: createdConnectionId,
        connectionRevisionId: createdConnection.currentRevisionId,
        credentialGeneration: null,
        environment: 'PRODUCTION',
        qualificationState: 'PROVIDER_CONFIRMED',
        outcome: 'PASSED',
        testedAt: '2026-09-07T13:00:00.000Z',
        diagnostic: { title: 'Sankhya confirmou o acesso', message: 'A revisão e o ambiente exatos responderam ao teste.' },
        evidenceRefs: ['qualification/local-browser-proof'],
      })
    }
    if (url.pathname === `/api/control/projects/${projectId}/connection-bindings` && method === 'GET') {
      return json(route, 200, projectBindings)
    }
    if (url.pathname === `/api/control/projects/${projectId}/commands/set-connection-binding` && method === 'POST') {
      const body = request.postDataJSON()
      setConnectionRequests.push(body)
      const connection = body.connectionId === eligibleConnectionId ? eligibleConnection : privateConnection
      const binding = {
        connectionId: body.connectionId,
        connectionRevisionId: body.connectionRevisionId,
        environment: body.environment,
        connectionName: connection.name,
      }
      projectBindings = [...projectBindings.filter((item) => item.connectionId !== body.connectionId), binding]
      return json(route, 200, binding)
    }
    if (url.pathname === `/api/control/projects/${projectId}/commands/remove-connection-binding` && method === 'POST') {
      const body = request.postDataJSON()
      removeConnectionRequests.push(body)
      projectBindings = projectBindings.filter((item) => item.connectionId !== body.connectionId)
      return route.fulfill({ status: 204, body: '' })
    }

    unexpectedRequests.push(`${method} ${url.pathname}${url.search}`)
    return json(route, 404, problem)
  })

  await page.goto(`${origin}/workspaces/${workspaceId}/brain`)
  await page.getByRole('heading', { name: 'Brain', exact: true }).waitFor()
  await page.getByText('Receita líquida', { exact: true }).waitFor()
  assert.equal(await page.getByText('Valor reconhecido após impostos e devoluções.').isVisible(), false)
  await page.getByText('Receita líquida', { exact: true }).click()
  await page.getByText('Valor reconhecido após impostos e devoluções.').waitFor()
  await page.getByRole('tab', { name: 'Revisões' }).click()
  await page.getByText('Revisão publicada e revisada').waitFor()
  await page.getByRole('tab', { name: 'Saúde' }).click()
  await page.getByText('Dependência crítica').waitFor()
  await page.getByText('Válido', { exact: true }).waitFor()

  await page.goto(`${origin}/workspaces/${workspaceId}/connections`)
  await page.getByRole('heading', { name: 'Connections', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Nova Connection' }).click()
  let createDialog = page.getByRole('dialog', { name: 'Criar Connection' })
  await createDialog.waitFor()
  assert.equal(await createDialog.evaluate((element) => element === document.activeElement), true)
  await createDialog.getByRole('button', { name: 'Cancelar' }).click()
  const createTriggerBeforeCreation = page.getByRole('button', { name: 'Nova Connection' })
  await page.waitForFunction(() => document.activeElement?.textContent === 'Nova Connection')
  assert.equal(await createTriggerBeforeCreation.evaluate((element) => element === document.activeElement), true)
  await createTriggerBeforeCreation.click()
  createDialog = page.getByRole('dialog', { name: 'Criar Connection' })
  await createDialog.waitFor()
  await createDialog.getByLabel('Nome da Connection').fill(createdConnection.name)
  await createDialog.getByLabel('Código da empresa').fill('1')
  await createDialog.getByRole('button', { name: 'Criar Connection', exact: true }).click()
  await createDialog.getByRole('alert').waitFor()
  await createDialog.getByRole('button', { name: 'Criar Connection', exact: true }).click()
  const connectionPanel = page.getByRole('dialog', { name: createdConnection.name })
  await connectionPanel.waitFor()
  assert.equal(createRequests.length, 2)
  assert.deepEqual(createRequests.map((request) => request.body), Array(2).fill({
    name: createdConnection.name,
    connectorDefinitionId: 'sankhya-om',
    connectorVersion: '1.0.0',
    configuration: { environment: 'PRODUCTION', companyCode: 1 },
  }))
  assert.match(createRequests[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/)
  assert.equal(createRequests[1].headers['idempotency-key'], createRequests[0].headers['idempotency-key'])
  assert.equal(await connectionPanel.evaluate((element) => element === document.activeElement), true)
  await connectionPanel.getByRole('button', { name: 'Editar' }).click()
  await connectionPanel.getByLabel('Código da empresa').fill('2')
  await connectionPanel.getByRole('button', { name: 'Salvar configuração' }).click()
  await connectionPanel.getByText('Empresa').waitFor()
  assert.equal(await connectionPanel.getByText('Resultado: PASSED', { exact: true }).count(), 0)
  assert.deepEqual(revisionRequests, [{
    expectedCurrentRevisionId: 'connection-created-r1',
    configuration: { environment: 'PRODUCTION', companyCode: 2 },
  }])
  await connectionPanel.getByRole('button', { name: 'Substituir credencial' }).click()
  const credentials = {
    clientId: 'browser-client-id-secret',
    clientSecret: 'browser-client-secret',
    xToken: 'browser-x-token-secret',
  }
  await connectionPanel.getByLabel('Client ID').fill(credentials.clientId)
  await connectionPanel.getByLabel('Client Secret').fill(credentials.clientSecret)
  await connectionPanel.getByLabel('X-Token').fill(credentials.xToken)
  for (const secret of Object.values(credentials)) assert.equal((await page.locator('body').innerText()).includes(secret), false)
  await connectionPanel.getByRole('button', { name: 'Salvar nova credencial' }).click()
  await connectionPanel.getByText('O teste não pôde ser executado agora. Isso não significa que a conexão falhou.').waitFor()
  await connectionPanel.getByLabel('Client ID').fill(credentials.clientId)
  await connectionPanel.getByLabel('Client Secret').fill(credentials.clientSecret)
  await connectionPanel.getByLabel('X-Token').fill(credentials.xToken)
  await connectionPanel.getByRole('button', { name: 'Salvar nova credencial' }).click()
  await connectionPanel.getByText('Credencial configurada. O valor permanece protegido e não é exibido.').waitFor()
  assert.deepEqual(credentialRequests.map((request) => request.body), Array(2).fill({ credential: credentials }))
  assert.match(credentialRequests[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/)
  assert.equal(credentialRequests[1].headers['idempotency-key'], credentialRequests[0].headers['idempotency-key'])
  for (const secret of Object.values(credentials)) assert.equal((await page.locator('body').innerText()).includes(secret), false)
  await connectionPanel.getByRole('button', { name: 'Substituir credencial' }).click()
  assert.equal(await connectionPanel.getByLabel('Client ID').inputValue(), '')
  assert.equal(await connectionPanel.getByLabel('Client Secret').inputValue(), '')
  assert.equal(await connectionPanel.getByLabel('X-Token').inputValue(), '')
  await connectionPanel.getByRole('button', { name: 'Cancelar' }).click()
  await connectionPanel.getByRole('button', { name: 'Testar Connection' }).click()
  await connectionPanel.getByText('O teste não pôde ser executado agora. Isso não significa que a conexão falhou.').waitFor()
  await connectionPanel.getByRole('button', { name: 'Testar Connection' }).click()
  await connectionPanel.getByText('Sankhya confirmou o acesso').waitFor()
  await connectionPanel.getByText('Teste aprovado').waitFor()
  assert.deepEqual(qualificationRequests.map((request) => request.body), Array(2).fill({
    connectionRevisionId: 'connection-created-r2',
    environment: 'PRODUCTION',
  }))
  assert.equal(qualificationRequests[1].headers['idempotency-key'], qualificationRequests[0].headers['idempotency-key'])
  assert.equal(qualificationReads, 1)
  await connectionPanel.getByRole('button', { name: 'Editar' }).click()
  await connectionPanel.getByLabel('Código da empresa').fill('3')
  await connectionPanel.getByRole('button', { name: 'Salvar configuração' }).click()
  await connectionPanel.getByText('Precisa de novo teste', { exact: true }).waitFor()
  assert.equal(await connectionPanel.getByText('Resultado: PASSED', { exact: true }).count(), 0)
  await connectionPanel.getByRole('button', { name: 'Testar Connection' }).click()
  await connectionPanel.getByText('Resultado: PASSED', { exact: true }).waitFor()
  await connectionPanel.getByRole('button', { name: 'Substituir credencial' }).click()
  await connectionPanel.getByLabel('Client ID').fill('replacement-client-id')
  await connectionPanel.getByLabel('Client Secret').fill('replacement-client-secret')
  await connectionPanel.getByLabel('X-Token').fill('replacement-x-token')
  await connectionPanel.getByRole('button', { name: 'Salvar nova credencial' }).click()
  await connectionPanel.getByText('Precisa de novo teste', { exact: true }).waitFor()
  assert.equal(await connectionPanel.getByText('Resultado: PASSED', { exact: true }).count(), 0)
  await page.setViewportSize({ width: 360, height: 800 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.equal(await connectionPanel.evaluate((element) => element.getBoundingClientRect().width <= window.innerWidth), true)
  await connectionPanel.getByRole('button', { name: 'Fechar' }).click()
  const createTrigger = page.getByRole('button', { name: 'Nova Connection' })
  await page.waitForFunction(() => document.activeElement?.textContent === 'Nova Connection')
  assert.equal(await createTrigger.evaluate((element) => element === document.activeElement), true)

  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto(`${origin}/projects/${projectId}/brain`)
  await page.getByRole('heading', { name: 'Brain do Project' }).waitFor()
  await page.getByText('Significado ainda adotado r41.').waitFor()
  await page.getByText('Sim — não adotada automaticamente').waitFor()
  assert.equal(brainBindingRequests.length, 0)
  await page.getByRole('button', { name: 'Administrar vínculo do Brain' }).click()
  await page.getByText('brain-r41', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Escolher revisão imutável' }).click()
  const revisionDialog = page.getByRole('dialog', { name: 'Escolher revisão do Brain' })
  await revisionDialog.waitFor()
  assert.equal(await revisionDialog.evaluate((element) => element === document.activeElement), true)
  await revisionDialog.getByLabel('Revisão disponível para adoção explícita').selectOption('brain-r42')
  await revisionDialog.getByRole('button', { name: 'Trocar revisão adotada' }).click()
  await page.getByText('A adoção explícita foi confirmada pelo servidor.').waitFor()
  await page.getByText('Significado adotado r42.').waitFor()
  const revisionTrigger = page.getByRole('button', { name: 'Escolher revisão imutável' })
  await page.waitForFunction(() => document.activeElement?.textContent === 'Escolher revisão imutável')
  assert.equal(await revisionTrigger.evaluate((element) => element === document.activeElement), true)
  assert.deepEqual(brainBindingRequests.map((request) => request.body), [{ brainRevisionId: 'brain-r42' }])
  assert.equal(brainBindingRequests[0].headers['if-match'], '"binding-r41"')
  await page.getByRole('button', { name: 'Remover vínculo atual' }).click()
  await page.getByText('A remoção do vínculo foi confirmada pelo servidor. O Workspace Brain não foi alterado.').waitFor()
  await page.getByText('Contexto do Brain não divulgado').waitFor()
  await page.getByText('Nenhum vínculo foi divulgado').waitFor()
  assert.equal(await page.getByText('Revisão adotada').count(), 0)
  assert.equal(await page.getByText('Significado adotado r42.').count(), 0)
  assert.equal(brainClearRequests[0].headers['if-match'], '"binding-r42"')
  await page.getByRole('button', { name: 'Escolher revisão imutável' }).click()
  const replacementDialog = page.getByRole('dialog', { name: 'Escolher revisão do Brain' })
  await replacementDialog.getByLabel('Revisão disponível para adoção explícita').selectOption('brain-r41')
  await replacementDialog.getByRole('button', { name: 'Adotar revisão' }).click()
  await page.getByText('Significado ainda adotado r41.').waitFor()
  assert.equal(brainBindingRequests[1].headers['if-none-match'], '*')

  await page.goto(`${origin}/projects/${projectId}/integrations`)
  await page.getByRole('heading', { name: 'Sistemas usados por este Project' }).waitFor()
  await page.getByRole('heading', { name: workspaceConnection.name }).waitFor()
  assert.equal(setConnectionRequests.length, 0)
  const connectionDetailTrigger = page.getByRole('button', { name: 'Consultar detalhes da Connection' })
  await connectionDetailTrigger.click()
  const connectionDetailDialog = page.getByRole('dialog', { name: 'Detalhes da Connection' })
  await connectionDetailDialog.waitFor()
  assert.equal(await connectionDetailDialog.evaluate((element) => element === document.activeElement), true)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.activeElement?.textContent === 'Consultar detalhes da Connection')
  assert.equal(await connectionDetailTrigger.evaluate((element) => element === document.activeElement), true)
  await page.getByRole('button', { name: 'Remover uso do Project' }).click()
  await page.getByText('A remoção do uso foi confirmada; a Connection permanece inalterada.').waitFor()
  assert.deepEqual(removeConnectionRequests[0], {
    connectionId: workspaceConnectionId,
    expectedConnectionRevisionId: 'connection-r17',
    expectedEnvironment: 'PRODUCTION',
  })
  const choiceTrigger = page.getByRole('button', { name: 'Usar Connection' })
  await choiceTrigger.click()
  const choiceDialog = page.getByRole('dialog', { name: 'Connections elegíveis' })
  await choiceDialog.waitFor()
  const eligibleCard = choiceDialog.getByRole('heading', { name: eligibleConnection.name }).locator('..')
  await eligibleCard.getByRole('button', { name: 'Usar no Project' }).click()
  await page.getByText('O uso da revisão e do ambiente exatos foi confirmado pelo servidor.').waitFor()
  await page.getByRole('heading', { name: eligibleConnection.name }).waitFor()
  assert.deepEqual(setConnectionRequests, [{
    connectionId: eligibleConnectionId,
    connectionRevisionId: 'connection-r42',
    environment: 'PRODUCTION',
    expectedCurrent: { state: 'ABSENT' },
  }])
  await page.getByRole('heading', { name: 'Connections privadas deste Project' }).waitFor()
  await page.getByRole('heading', { name: privateConnection.name }).waitFor()
  await page.setViewportSize({ width: 360, height: 800 })
  await choiceTrigger.click()
  await choiceDialog.waitFor()
  assert.equal(await choiceDialog.evaluate((element) => element === document.activeElement), true)
  assert.equal(await choiceDialog.evaluate((element) => element.getBoundingClientRect().width <= window.innerWidth), true)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.activeElement?.textContent === 'Usar Connection')
  assert.equal(await choiceTrigger.evaluate((element) => element === document.activeElement), true)
  await page.getByRole('button', { name: 'Remover uso do Project' }).click()
  await page.getByText('Nenhum uso atual').waitFor()
  assert.deepEqual(removeConnectionRequests[1], {
    connectionId: eligibleConnectionId,
    expectedConnectionRevisionId: 'connection-r42',
    expectedEnvironment: 'PRODUCTION',
  })

  sessionMustBeRejected = true
  await page.goto(`${origin}/workspaces/${sessionLossWorkspaceId}/brain`)
  await page.getByRole('heading', { name: 'Entre no Conexus' }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Entrar' }).getAttribute('href'), '/protocol/oidc/login')
  assert.deepEqual(unexpectedRequests, [])
})
