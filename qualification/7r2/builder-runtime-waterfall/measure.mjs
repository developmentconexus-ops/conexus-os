import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { createServer as createTcpServer } from 'node:net'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const outputArg = process.argv.find((value) => value.startsWith('--output='))
const outputPath = resolve(repositoryRoot, outputArg?.slice('--output='.length) ?? 'qualification/7r2/builder-runtime-waterfall/baseline.json')
const live = process.argv.includes('--live')
const now = () => process.hrtime.bigint()
const elapsedMs = (start, end = now()) => Number(end - start) / 1e6
const uuid = () => randomUUID()

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const runProcess = (observations) => (executable, args, timeoutMs = 120_000) => new Promise((complete) => {
  const started = now()
  const child = spawn(executable, [...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  let timedOut = false
  let settled = false
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8').slice(0, 65_536 - stdout.length) })
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8').slice(0, 65_536 - stderr.length) })
  child.once('error', () => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    observations.push({ executable, operation: args[0] ?? null, argsCount: args.length, timeoutMs, durationMs: elapsedMs(started), exitCode: null, signal: null, timedOut, spawnError: true })
    complete({ exitCode: null, signal: null, stdout, stderr, overflow: false, spawnError: true })
  })
  child.once('close', (exitCode, signal) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    observations.push({ executable, operation: args[0] ?? null, argsCount: args.length, timeoutMs, durationMs: elapsedMs(started), exitCode, signal, timedOut, spawnError: false })
    complete({ exitCode, signal, stdout, stderr, overflow: false, spawnError: false })
  })
})

const span = async (name, operation, input = {}) => {
  const startedAt = now()
  try {
    const value = await operation()
    return { name, status: 'SUCCEEDED', startedAt: startedAt.toString(), endedAt: now().toString(), durationMs: elapsedMs(startedAt), input, value }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failureCode = /^[A-Z0-9_:-]{1,120}$/.test(message) ? message : 'OPERATION_FAILED'
    return { name, status: 'FAILED', startedAt: startedAt.toString(), endedAt: now().toString(), durationMs: elapsedMs(startedAt), input, failureCode }
  }
}

const compileHub = async (root) => {
  const buildRoot = await mkdtemp(join(repositoryRoot, 'apps/hub/.conexus-build-7r2-'))
  const result = spawn('node', [resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot], { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  result.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  const exitCode = await new Promise((complete) => result.once('close', complete))
  if (exitCode !== 0) throw new Error(`7R2_HUB_COMPILE_FAILED:${stderr.slice(0, 1000)}`)
  root.cleanup.push(() => rm(buildRoot, { recursive: true, force: true }))
  return (file) => pathToFileURL(resolve(buildRoot, file)).href
}

const createFixture = async (root) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'conexus-7r2-fixture-'))
  root.cleanup.push(() => rm(fixtureRoot, { recursive: true, force: true }))
  const work = join(fixtureRoot, 'work')
  const storage = join(fixtureRoot, 'storage')
  const projectId = uuid()
  await writeFile(join(fixtureRoot, 'marker'), 'fixture')
  execFileSync('mkdir', ['-p', join(work, 'app')])
  await writeFile(join(work, 'app', 'index.html'), '<div id="root">7R2</div>\n')
  await writeFile(join(work, 'app', 'main.jsx'), 'document.querySelector("#root").textContent = "7R2"\n')
  git(fixtureRoot, 'init', '--initial-branch=main', work)
  git(work, 'config', 'user.name', 'Conexus 7R2 measurement')
  git(work, 'config', 'user.email', '7r2@conexus.invalid')
  git(work, 'add', 'app')
  git(work, 'commit', '-m', '7R2 fixture')
  const sourceRevision = git(work, 'rev-parse', 'HEAD')
  execFileSync('mkdir', ['-p', join(storage, 'projects')])
  execFileSync('git', ['clone', '--bare', work, join(storage, 'projects', projectId)], { stdio: 'ignore' })
  return { fixtureRoot, storage, projectId, sourceRevision, work }
}

const measureGit = async (modules, root, fixture) => {
  const observations = []
  const gitPort = modules.createOciGitExecutionPort({ projectStorageRoot: fixture.storage }, runProcess(observations))
  const samples = []
  for (let index = 0; index < 3; index += 1) {
    const projectId = uuid()
    const attemptId = uuid()
    const sample = { sampleId: `p1-${index + 1}`, class: index === 0 ? 'first-observation' : 'warm-in-process', projectId, attemptId }
    sample.spans = []
    sample.spans.push(await span('verify_admitted_image', () => gitPort.verifyAdmittedImage(), { cached: index > 0 }))
    if (sample.spans.at(-1).value?.status !== 'VERIFIED') {
      sample.processes = observations.splice(0)
      samples.push(sample)
      return { scenario: 'P1_REAL_HARDENED_GIT_CONTROL', status: 'FAILED', samples, unresolved: ['the admitted Git image operation failed or reached the Product timeout; later custody operations were not inferred'] }
    }
    sample.spans.push(await span('stage_new_project_source', () => gitPort.stageNewProjectSource({ projectId, attemptId }), { sourceBootstrap: 'NEW' }))
    const staged = sample.spans.at(-1).value
    if (staged?.status !== 'STAGED') {
      sample.processes = observations.splice(0)
      sample.result = staged?.status ?? 'NO_RESULT'
      samples.push(sample)
      return { scenario: 'P1_REAL_HARDENED_GIT_CONTROL', status: 'FAILED', samples, unresolved: ['the real Product Git stage did not complete; no later custody operation was inferred'] }
    }
    if (staged?.sourceRevision) {
      sample.spans.push(await span('promote_staged_project_source', () => gitPort.promoteStagedProjectSource({ projectId, attemptId, sourceRevision: staged.sourceRevision })))
      if (sample.spans.at(-1).value?.status !== 'PROMOTED') {
        sample.processes = observations.splice(0)
        sample.result = sample.spans.at(-1).value?.status ?? 'NO_RESULT'
        samples.push(sample)
        return { scenario: 'P1_REAL_HARDENED_GIT_CONTROL', status: 'FAILED', samples, unresolved: ['the real Product Git promotion did not complete; canonical verification was not inferred'] }
      }
      sample.spans.push(await span('verify_canonical_project_source', () => gitPort.verifyCanonicalProjectSource({ projectId, attemptId, sourceRevision: staged.sourceRevision })))
      if (sample.spans.at(-1).value?.status !== 'VERIFIED') {
        sample.processes = observations.splice(0)
        sample.result = sample.spans.at(-1).value?.status ?? 'NO_RESULT'
        samples.push(sample)
        return { scenario: 'P1_REAL_HARDENED_GIT_CONTROL', status: 'FAILED', samples, unresolved: ['the real Product canonical verification did not complete'] }
      }
    }
    sample.processes = observations.splice(0)
    samples.push(sample)
  }
  return { scenario: 'P1_REAL_HARDENED_GIT_CONTROL', status: 'PASS', samples, unresolved: ['P1 isolates the exact hardened Git process port; full S1 HTTP/DB transaction timing is measured separately'] }
}

const measureCompiler = async (modules, root) => {
  const apiKeyFile = process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE
  if (!apiKeyFile) return { scenario: 'S6_COMPILER_E2B', status: 'INCONCLUSIVE', samples: [], unresolved: ['CONEXUS_BUILDER_E2B_API_KEY_FILE is not admitted to this process'] }
  const apiKey = (await readFile(apiKeyFile, 'utf8')).trim()
  const created = []
  const compiler = modules.createE2BApplicationCompiler({ apiKey, onSandboxCreated: (id) => created.push(id) })
  const samples = []
  for (let index = 0; index < 3; index += 1) {
    const started = now()
    const sample = { sampleId: `compiler-${index + 1}`, class: index === 0 ? 'first-observation' : 'repeat-observation', createdBefore: created.length }
    try {
      const result = await compiler.compile({ projectId: uuid(), sourceRevision: 'a'.repeat(40), executionId: uuid(), files: [
        { path: 'index.html', content: '<div id="root"></div>\n' },
        { path: 'main.jsx', content: 'document.querySelector("#root").textContent = "7R2"\n' },
      ] })
      sample.status = 'SUCCEEDED'
      sample.outputFileCount = result.files.length
      sample.outputBytes = result.files.reduce((total, file) => total + file.bytes.byteLength, 0)
    } catch (error) {
      sample.status = 'FAILED'
      const message = error instanceof Error ? error.message : String(error)
      sample.failureCode = /^[A-Z0-9_:-]{1,120}$/.test(message) ? message : 'COMPILER_SAMPLE_FAILED'
    }
    sample.durationMs = elapsedMs(started)
    sample.createdAfter = created.length
    samples.push(sample)
  }
  return { scenario: 'S6_COMPILER_E2B', status: samples.some((sample) => sample.status === 'SUCCEEDED') ? 'MEASURED' : 'FAILED', samples, e2b: { sandboxCreateCount: created.length }, unresolved: ['source write/link, Vite build, output collection are not separately exposed by the current E2B adapter'] }
}

const reservePort = async () => {
  const server = createTcpServer()
  await new Promise((complete, fail) => server.once('error', fail).listen(0, '127.0.0.1', complete))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('PORT_RESERVATION_FAILED')
  await new Promise((complete, fail) => server.close((error) => error ? fail(error) : complete()))
  return address.port
}

const startDockerEventMonitor = async (imageDigest) => {
  const child = spawn('docker', ['events', '--filter', 'type=container', '--filter', `image=${imageDigest}`, '--format', '{{json .}}'], {
    shell: false, stdio: ['ignore', 'pipe', 'ignore'],
  })
  const events = []
  let output = ''
  let available = true
  child.stdout.on('data', (chunk) => {
    output += chunk.toString('utf8')
    for (;;) {
      const newline = output.indexOf('\n')
      if (newline < 0) break
      const line = output.slice(0, newline)
      output = output.slice(newline + 1)
      try {
        const event = JSON.parse(line)
        const id = event.id ?? event.ID ?? event.Actor?.ID
        const action = event.Action ?? event.status ?? event.action
        const timestamp = Number(event.timeNano ?? event.TimeNano)
        if (typeof id === 'string' && typeof action === 'string' && Number.isFinite(timestamp)) events.push({ id, action, timestamp })
      } catch { available = false }
    }
  })
  child.once('error', () => { available = false })
  try {
    await new Promise((complete, fail) => {
      child.once('spawn', complete)
      child.once('error', fail)
    })
  } catch { available = false }
  await new Promise((complete) => setTimeout(complete, 150))
  return Object.freeze({
    mark: () => events.length,
    summarize: (startIndex) => {
      const sample = events.slice(startIndex)
      const started = new Map()
      const durations = []
      for (const event of sample) {
        if (event.action === 'start') started.set(event.id, event.timestamp)
        if (event.action === 'die' && started.has(event.id)) durations.push(Number(event.timestamp - started.get(event.id)) / 1e6)
      }
      return {
        status: available ? 'OBSERVED' : 'INCONCLUSIVE',
        eventCount: sample.length,
        containerStartCount: sample.filter((event) => event.action === 'start').length,
        completedContainerCount: durations.length,
        aggregateContainerDurationMs: durations.reduce((total, duration) => total + duration, 0),
        containerDurationsMs: durations,
      }
    },
    close: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGTERM')
      await new Promise((complete) => child.once('close', complete))
    },
  })
}

const measureProductJourneys = async (built, modules, root) => {
  if (!live) return {
    scenario: 'S1_S2_S3_S4_S5_S6_CURRENT_PRODUCT_JOURNEYS', status: 'INCONCLUSIVE', samples: [],
    unresolved: ['live Product BUILD/PLAN execution requires explicit --live authority'],
  }
  const requiredEnvironment = [
    'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER',
    'CONEXUS_DB_RB_INGRESS_PASSWORD_FILE', 'CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE',
    'CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE', 'CONEXUS_DB_S3_READ_PASSWORD_FILE',
    'CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE', 'CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE',
    'CONEXUS_BUILDER_E2B_API_KEY_FILE', 'CONEXUS_BUILDER_E2B_TEMPLATE_ID',
    'CONEXUS_PROJECT_MODEL_CATALOG_FILE', 'CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE',
    'CONEXUS_BUILDER_MODEL_ADMISSION_ID',
  ]
  const missing = requiredEnvironment.filter((name) => !process.env[name])
  if (!process.env.CONEXUS_TEST_DB_PASSWORD_FILE && !process.env.CONEXUS_TEST_DB_PASSWORD) missing.push('CONEXUS_TEST_DB_PASSWORD_FILE or CONEXUS_TEST_DB_PASSWORD')
  if (missing.length) return {
    scenario: 'S1_S2_S3_S4_S5_S6_CURRENT_PRODUCT_JOURNEYS', status: 'INCONCLUSIVE', samples: [],
    unresolved: [`measurement configuration missing: ${missing.join(', ')}`],
  }

  const adminPassword = process.env.CONEXUS_TEST_DB_PASSWORD_FILE
    ? (await readFile(process.env.CONEXUS_TEST_DB_PASSWORD_FILE, 'utf8')).trim()
    : process.env.CONEXUS_TEST_DB_PASSWORD
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: adminPassword,
  }
  const connectionString = (config) => {
    const url = new URL('postgresql://localhost')
    url.hostname = config.host
    url.port = String(config.port)
    url.pathname = `/${config.database}`
    url.username = config.user
    url.password = config.password
    return url.toString()
  }
  const database = `conexus_7r2_measure_${uuid().replaceAll('-', '')}`
  const owner = new pg.Client(admin)
  let ownerConnected = false
  let setup
  let executor
  let app
  let builder
  let vite
  let browser
  let dockerMonitor
  const projectPools = []
  const storageRoot = await mkdtemp(join(tmpdir(), 'conexus-7r2-product-'))
  root.cleanup.push(() => rm(storageRoot, { recursive: true, force: true }))
  const accountId = uuid()
  const workspaceId = uuid()
  const originPort = await reservePort()
  const origin = `http://localhost:${originPort}`
  const samples = { s1: [], s2: [], s3: null, s4: null, s5: null, s6: null }
  const network = []
  const sourcePayloads = []
  const requestRecords = new WeakMap()
  let phase = 'connect-disposable-database'
  let projectProcesses = []
  let runRows = []
  let workingRows = []

  const terminalUiStatus = async (page, timeout = 900_000) => page.waitForFunction(() => {
    const values = [...document.querySelectorAll('[role="status"]')].map((element) => element.textContent?.trim())
    return values.some((value) => ['Build concluído', 'Resposta somente', 'Build falhou; o Preview anterior continua disponível', 'Execução falhou', 'Execução interrompida'].includes(value))
  }, null, { timeout })

  try {
    await owner.connect()
    ownerConnected = true
    phase = 'create-disposable-database'
    await owner.query(`CREATE DATABASE "${database}"`)
    const current = { ...admin, database }
    phase = 'apply-current-hub-migrations'
    const migration = await runCurrentHubMigrations({ connectionString: connectionString(current) })
    phase = 'seed-disposable-account-and-workspace'
    setup = new pg.Client(current)
    await setup.connect()
    const { createPostgresPool } = await import(built('platform/postgres.js'))
    const { createProjectStore } = await import(built('project/store.js'))
    const { createProjectSourceRecovery } = await import(built('project/source-recovery.js'))
    const { registerProjectRoutes } = await import(built('project/routes.js'))
    const { createBuilderProjectGitCapability } = await import(built('project/module.js'))
    const { createOciGitExecutionPort } = await import(built('project/git-execution.js'))
    const { createConfiguredBuilderModule } = await import(built('builder/module.js'))
    const { createApplicationArtifactStore } = await import(built('registry/application-artifact-store.js'))
    const { createHttpApp } = await import(built('http/app.js'))

    await setup.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, $2, $3, $4)', [accountId, 'https://conexus.7r2.invalid', accountId, '7R2 disposable measurement'])
    await setup.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, '7R2 disposable measurement'])
    await setup.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project, role) VALUES ($1, $2, true, 'owner')", [accountId, workspaceId])
    await mkdir(join(storageRoot, 'projects'), { recursive: true })
    await mkdir(join(storageRoot, 'staging'), { recursive: true })
    await mkdir(join(storageRoot, 'quarantine'), { recursive: true })
    await mkdir(join(storageRoot, 'bundles'), { recursive: true })

    const projectPassword = async (key) => (await readFile(process.env[key], 'utf8')).trim()
    const projectPool = async (user, key) => {
      const pool = createPostgresPool({ ...current, user, password: await projectPassword(key) })
      projectPools.push(pool)
      return pool
    }
    const projectGitProcesses = []
    phase = 'compose-current-project-and-builder-modules'
    const projectGit = createOciGitExecutionPort({ projectStorageRoot: storageRoot }, runProcess(projectGitProcesses))
    const projectStore = createProjectStore({
      commandPool: await projectPool('hub_prj03_command', 'CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE'),
      readPool: await projectPool('hub_s3_read', 'CONEXUS_DB_S3_READ_PASSWORD_FILE'),
      baselineReadPool: await projectPool('hub_s4_baseline_read', 'CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE'),
      baselineCommandPool: await projectPool('hub_s4_baseline_command', 'CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE'),
      git: projectGit,
      recovery: createProjectSourceRecovery(storageRoot),
    })

    const admission = modules.resolveModelAdmission({
      catalogFile: process.env.CONEXUS_PROJECT_MODEL_CATALOG_FILE,
      credentialSlotsFile: process.env.CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE,
      admissionId: process.env.CONEXUS_BUILDER_MODEL_ADMISSION_ID,
      requiredCapabilities: ['BUILDER_CODING'],
    })
    const artifacts = createApplicationArtifactStore()
    const executorPassword = (await readFile(process.env.CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE, 'utf8')).trim()
    executor = new pg.Pool({ ...current, user: 'hub_rb_executor', password: executorPassword })
    builder = createConfiguredBuilderModule({
      database: { host: admin.host, port: admin.port, database },
      builder: {
        ingressPasswordFile: process.env.CONEXUS_DB_RB_INGRESS_PASSWORD_FILE,
        executorPasswordFile: process.env.CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE,
        e2bApiKeyFile: process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE,
        e2bTemplateId: process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID,
        modelAdmissionId: admission.admissionId,
      },
      applicationArtifacts: artifacts,
      projectSource: { storageRoot, git: createBuilderProjectGitCapability(storageRoot) },
      model: admission.model,
      modelIdentity: { admissionId: admission.admissionId, providerId: admission.providerId, modelId: admission.modelId },
      validateModelCredential: admission.validateCredential,
      origin,
      resolveCurrentSession: async () => ({ account: { accountId } }),
    })
    app = await createHttpApp({ staticRoot: null, registerRoutes: async (server) => {
      await registerProjectRoutes(server, {
        store: projectStore, inception: {}, explanation: {}, origin,
        resolveCurrentSession: async () => ({ account: { accountId } }),
      })
      return builder.registerBuilderRoutes(server)
    } })
    phase = 'listen-hub-and-web-harness'
    await app.listen({ host: '127.0.0.1', port: 0 })
    const hubAddress = app.server.address()
    if (!hubAddress || typeof hubAddress === 'string') throw new Error('HUB_LISTEN_FAILED')
    const hubOrigin = `http://127.0.0.1:${hubAddress.port}`
    dockerMonitor = await startDockerEventMonitor(modules.gitIdentity.ociIndexDigest)
    vite = await createServer({
      configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'),
      root: resolve(repositoryRoot, 'apps/web'),
      server: {
        host: '127.0.0.1', port: originPort, strictPort: true,
        proxy: { '/api/control': { target: hubOrigin, changeOrigin: false } },
      },
    })
    await vite.listen()
    phase = 'launch-browser'
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await context.addCookies([{ name: '__Host-conexus_csrf', value: '7r2-measurement', domain: 'localhost', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' }])
    const page = await context.newPage()
    page.setDefaultTimeout(900_000)
    page.on('request', (request) => {
      const parsed = new URL(request.url())
      if (!parsed.pathname.startsWith('/api/control/')) return
      const startedAt = now()
      const record = { path: parsed.pathname, method: request.method(), startedAt: startedAt.toString() }
      requestRecords.set(request, { startedAt, record })
      network.push(record)
    })
    page.on('response', (response) => {
      const observation = requestRecords.get(response.request())
      const record = observation?.record
      if (!record) return
      record.status = response.status()
      record.durationMs = elapsedMs(observation.startedAt)
      if (record.path.endsWith('/source/tree') || record.path.endsWith('/source/file')) {
        const payload = response.json().then((body) => {
          if (record.path.endsWith('/source/tree')) sourcePayloads.push({ kind: 'tree', entryCount: Array.isArray(body.entries) ? body.entries.length : null, durationMs: record.durationMs })
          else if (typeof body.content === 'string') sourcePayloads.push({ kind: 'file', byteLength: Buffer.byteLength(body.content), durationMs: record.durationMs })
        }).catch(() => {})
        sourcePayloads.push(payload)
      }
    })
    await page.route('**/api/control/access-context', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ account: { accountId, displayName: '7R2 Measurement' }, workspaces: [{ workspaceId, name: '7R2 measurement' }], projects: [] }),
    }))

    const gitSamples = []
    const projectSampleCount = process.argv.includes('--journey-smoke') ? 1 : 3
    for (let index = 0; index < projectSampleCount; index += 1) {
      phase = `s1-project-create-${index + 1}`
      const projectName = `7R2 New Project ${index + 1}`
      const processStart = projectGitProcesses.length
      const dockerStart = dockerMonitor.mark()
      await page.goto(`${origin}/workspaces/${workspaceId}/projects/new`)
      await page.getByLabel('Nome do Project').fill(projectName)
      const actionStarted = now()
      const createResponsePromise = page.waitForResponse((response) => {
        const request = response.request()
        return request.method() === 'POST' && new URL(response.url()).pathname === `/api/control/workspaces/${workspaceId}/projects`
      })
      await page.getByRole('button', { name: 'Criar Project' }).click()
      const createResponse = await createResponsePromise
      const body = await createResponse.json()
      const projectId = body.projectId
      await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
      const requestRecord = network.findLast((entry) => entry.path === `/api/control/workspaces/${workspaceId}/projects` && entry.method === 'POST')
      const sourceState = (await setup.query('SELECT working_source_revision, current_state FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0]
      const row = {
        sampleId: `s1-new-${index + 1}`, class: index === 0 ? 'first-observation' : 'warm-in-process',
        responseStatus: createResponse.status(), projectId,
        requestToResponseMs: requestRecord?.durationMs ?? elapsedMs(actionStarted),
        actionToBuildUiMs: elapsedMs(actionStarted), sourceRevision: sourceState?.working_source_revision ?? null,
        workingState: sourceState?.current_state ?? null,
        input: { starterFileCount: modules.FIXED_APPLICATION_STARTER_FILES.length,
          starterBytes: modules.FIXED_APPLICATION_STARTER_FILES.reduce((total, file) => total + Buffer.byteLength(file.content), 0) },
        processObservations: projectGitProcesses.slice(processStart).map(({ executable, operation, argsCount, timeoutMs, durationMs, exitCode, signal, timedOut, spawnError }) => ({ executable, operation, argsCount, timeoutMs, durationMs, exitCode, signal, timedOut, spawnError })),
        dockerProcessCount: projectGitProcesses.length - processStart,
        dockerRunCount: projectGitProcesses.slice(processStart).filter((item) => item.operation === 'run').length,
        dockerProcessAggregateMs: projectGitProcesses.slice(processStart).reduce((total, item) => total + item.durationMs, 0),
        docker: dockerMonitor.summarize(dockerStart),
      }
      if (row.responseStatus !== 201 || !row.sourceRevision || row.workingState !== 'IDLE') throw new Error('S1_PRODUCT_CREATE_ASSERTION_FAILED')
      samples.s1.push(row)
      gitSamples.push({ sourceRevision: row.sourceRevision, projectId })
    }

    if (process.argv.includes('--journey-smoke')) return {
      scenario: 'S1_CREATE_NEW_PROJECT', status: 'MEASURED', samples: samples.s1,
      note: 'bounded route/browser smoke only; no baseline artifact written',
    }

    const measureBuild = async (index, projectId) => {
      phase = `s2-source-changing-build-${index + 1}`
      await page.goto(`${origin}/projects/${projectId}/build`)
      await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
      const content = 'Crie um contador interativo até 100 em app/src/main.tsx, com valor inicial 0 e botões para avançar, voltar e reiniciar. Altere apenas app/** e não instale dependências.'
      const processStart = projectGitProcesses.length
      const networkStart = network.length
      const dockerStart = dockerMonitor.mark()
      const sourcePayloadStart = sourcePayloads.length
      await page.getByLabel('O que o Project precisa fazer?').fill(content)
      const actionStarted = now()
      await page.evaluate(() => {
        const root = document.querySelector('.builder-conversation')
        if (!root) return
        const data = { start: performance.now(), assistants: root.querySelectorAll('.builder-message-assistant').length, activities: root.querySelectorAll('.builder-activity').length, firstAssistantMs: null, firstActivityMs: null }
        Object.defineProperty(window, '__conexus7r2LiveTiming', { configurable: true, value: data })
        const observer = new MutationObserver(() => {
          const elapsed = performance.now() - data.start
          if (data.firstAssistantMs === null && root.querySelectorAll('.builder-message-assistant').length > data.assistants) data.firstAssistantMs = elapsed
          if (data.firstActivityMs === null && root.querySelectorAll('.builder-activity').length > data.activities) data.firstActivityMs = elapsed
        })
        observer.observe(root, { childList: true, subtree: true })
        Object.defineProperty(window, '__conexus7r2LiveObserver', { configurable: true, value: observer })
      })
      await page.getByRole('button', { name: 'Enviar mensagem' }).click()
      const ackResponse = await page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/control/projects/${projectId}/builder-session/messages`)
      const ack = await ackResponse.json()
      const runId = ack.builderRun?.builderRunId
      if (!runId || ackResponse.status() !== 201) throw new Error('S2_BUILDER_POST_NOT_ACCEPTED')
      const postToAckMs = elapsedMs(actionStarted)
      await page.waitForFunction(() => {
        const values = [...document.querySelectorAll('[role="status"]')].map((element) => element.textContent?.trim())
        return values.includes('Trabalhando…')
      }, null, { timeout: 30_000 })
      await terminalUiStatus(page)
      await page.getByText('Último Preview bom disponível.', { exact: true }).waitFor()
      const uiTerminalMs = elapsedMs(actionStarted)
      const previewObservedAt = Date.now()
      const liveDom = await page.evaluate(() => {
        const timing = window.__conexus7r2LiveTiming
        window.__conexus7r2LiveObserver?.disconnect()
        return timing ? { firstAssistantMs: timing.firstAssistantMs, firstActivityMs: timing.firstActivityMs } : null
      })
      const runRow = (await setup.query(`SELECT builder_run_id, state, mode, base_source_revision, result_source_revision,
        result_kind, failure_code, sandbox_id, trigger_message_id, model_provider_id, model_id, created_at, started_at, finished_at
        FROM builder.builder_run WHERE builder_run_id = $1`, [runId])).rows[0]
      if (!runRow || !['SUCCEEDED', 'FAILED', 'INTERRUPTED'].includes(runRow.state)) throw new Error('S2_TERMINAL_RUN_ROW_MISSING')
      const working = (await setup.query(`SELECT working_source_revision, current_state, last_preview_source_revision,
        last_preview_artifact_revision_id, last_preview_artifact_digest FROM builder.project_working_state WHERE project_id = $1`, [projectId])).rows[0]
      const artifact = runRow.result_source_revision
        ? await artifacts.getApplicationBySource(executor, { accountId, projectId, sourceRevision: runRow.result_source_revision })
        : null
      const apiRequests = network.slice(networkStart).map(({ path, method, status, durationMs }) => ({ path, method, status, durationMs }))
      const sourceOps = apiRequests.filter((item) => item.path.endsWith('/source/tree') || item.path.endsWith('/source/file'))
      const streamOps = apiRequests.filter((item) => item.path.endsWith('/stream'))
      return {
        sampleId: `s2-counter-${index + 1}`, class: index === 0 ? 'first-live-sample' : 'repeat-live-sample', projectId, builderRunId: runId,
        model: { providerId: runRow.model_provider_id, modelId: runRow.model_id },
        input: { id: 'fixed-bounded-counter', utf8Bytes: Buffer.byteLength(content) },
        responseStatus: ackResponse.status(), postActionToAckMs: postToAckMs, postActionToTerminalUiMs: uiTerminalMs,
        postActionToLastGoodCoordinatesVisibleMs: uiTerminalMs,
        firstLiveAssistantMs: liveDom?.firstAssistantMs ?? null, firstLiveActivityMs: liveDom?.firstActivityMs ?? null,
        source: { baseRevision: runRow.base_source_revision, resultRevision: runRow.result_source_revision,
          changed: runRow.result_source_revision !== runRow.base_source_revision, workingRevision: working?.working_source_revision },
        builderRun: { state: runRow.state, mode: runRow.mode, resultKind: runRow.result_kind, failureCode: runRow.failure_code,
          sandboxBound: Boolean(runRow.sandbox_id), triggerMessageBound: Boolean(runRow.trigger_message_id),
          createdAt: runRow.created_at, startedAt: runRow.started_at, finishedAt: runRow.finished_at,
          queueToClaimMs: runRow.started_at && runRow.created_at ? new Date(runRow.started_at).valueOf() - new Date(runRow.created_at).valueOf() : null,
          activeToTerminalMs: runRow.started_at && runRow.finished_at ? new Date(runRow.finished_at).valueOf() - new Date(runRow.started_at).valueOf() : null,
          settlementToLastGoodCoordinatesVisibleMs: runRow.finished_at ? previewObservedAt - new Date(runRow.finished_at).valueOf() : null },
        compilerAndRegistry: { previewState: working?.current_state ?? null, artifactRetained: Boolean(artifact),
          artifactRevisionId: artifact?.artifactRevisionId ?? null, artifactDigest: artifact?.artifactDigest ?? null,
          lastGoodMatches: Boolean(artifact && working?.last_preview_source_revision === runRow.result_source_revision &&
            working.last_preview_artifact_revision_id === artifact.artifactRevisionId && working.last_preview_artifact_digest === artifact.artifactDigest) },
        live: { streamResponseCount: streamOps.length, streamStatuses: streamOps.map((item) => item.status), sessionRequestCount: apiRequests.filter((item) => item.path.endsWith('/builder-session') && item.method === 'GET').length },
        sourceReads: { requestCount: sourceOps.length, treeCount: sourceOps.filter((item) => item.path.endsWith('/source/tree')).length,
          fileCount: sourceOps.filter((item) => item.path.endsWith('/source/file')).length,
          fileBytes: sourcePayloads.slice(sourcePayloadStart).filter((item) => item?.kind === 'file').reduce((total, item) => total + item.byteLength, 0) },
        docker: dockerMonitor.summarize(dockerStart),
        projectGitPortProcesses: projectGitProcesses.slice(processStart).map(({ executable, operation, argsCount, timeoutMs, durationMs, exitCode, signal, timedOut, spawnError }) => ({ executable, operation, argsCount, timeoutMs, durationMs, exitCode, signal, timedOut, spawnError })),
      }
    }

    for (let index = 0; index < gitSamples.length; index += 1) {
      const row = await measureBuild(index, gitSamples[index].projectId)
      samples.s2.push(row)
      if (row.builderRun.state !== 'SUCCEEDED' || row.builderRun.resultKind !== 'SOURCE_CHANGED' ||
        !row.source.changed || !row.compilerAndRegistry.lastGoodMatches) throw new Error('S2_PRODUCT_BUILD_ASSERTION_FAILED')
    }

    const selectedProject = gitSamples[0].projectId
    phase = 's3-response-only-plan'
    const beforePlan = (await setup.query('SELECT working_source_revision, current_state, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest FROM builder.project_working_state WHERE project_id = $1', [selectedProject])).rows[0]
    await page.goto(`${origin}/projects/${selectedProject}/build`)
    await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
    await page.getByRole('button', { name: 'Plan' }).click()
    const planText = 'Explique resumidamente como o contador atual funciona. Apenas inspecione; não edite arquivos.'
    const planStarted = now()
    const planNetworkStart = network.length
    await page.getByLabel('O que o Project precisa fazer?').fill(planText)
    await page.getByRole('button', { name: 'Enviar mensagem' }).click()
    const planResponse = await page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/control/projects/${selectedProject}/builder-session/messages`)
    const planAck = await planResponse.json()
    const planAckMs = elapsedMs(planStarted)
    await page.getByText('Resposta somente', { exact: true }).waitFor()
    const planTerminalMs = elapsedMs(planStarted)
    const planRow = (await setup.query(`SELECT state, mode, result_kind, base_source_revision, result_source_revision,
      failure_code, created_at, started_at, finished_at FROM builder.builder_run WHERE builder_run_id = $1`, [planAck.builderRun.builderRunId])).rows[0]
    const afterPlan = (await setup.query('SELECT working_source_revision, current_state, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest FROM builder.project_working_state WHERE project_id = $1', [selectedProject])).rows[0]
    samples.s3 = {
      sampleId: 's3-plan-same-project', projectId: selectedProject, builderRunId: planAck.builderRun.builderRunId,
      postActionToAckMs: planAckMs, postActionToTerminalUiMs: planTerminalMs,
      builderRun: planRow,
      unchangedWorkingAndPreview: JSON.stringify(beforePlan) === JSON.stringify(afterPlan),
      compilerNotInvoked: planRow?.result_kind === 'RESPONSE_ONLY' && planRow?.result_source_revision === null,
      network: network.slice(planNetworkStart).map(({ path, method, status, durationMs }) => ({ path, method, status, durationMs })),
    }
    if (planResponse.status() !== 201 || planRow?.state !== 'SUCCEEDED' || planRow?.mode !== 'PLAN' ||
      !samples.s3.compilerNotInvoked || !samples.s3.unchangedWorkingAndPreview) throw new Error('S3_PLAN_ASSERTION_FAILED')

    const codeStartIndex = network.length
    phase = 's4-code-lens'
    const codeDockerStart = dockerMonitor.mark()
    const codePayloadStart = sourcePayloads.length
    const codeStarted = now()
    await page.getByRole('button', { name: 'Código' }).click()
    await page.getByRole('button', { name: /^app\// }).first().waitFor()
    await Promise.all(sourcePayloads.filter((item) => item instanceof Promise))
    const codeReads = network.slice(codeStartIndex).filter((item) => item.path.endsWith('/source/tree') || item.path.endsWith('/source/file'))
    const codeReadTimingComplete = codeReads.length > 0 && codeReads.every((item) => Number.isFinite(item.durationMs))
    samples.s4 = {
      sampleId: 's4-code-lens', projectId: selectedProject, clickToVisibleMs: elapsedMs(codeStarted),
      status: codeReadTimingComplete ? 'MEASURED' : 'MEASURED_PARTIAL',
      requests: codeReads
        .map(({ path, method, status, durationMs }) => ({ path, method, status, durationMs })),
      sourceFileCount: sourcePayloads.slice(codePayloadStart).filter((item) => item?.kind === 'tree').at(-1)?.entryCount ?? null,
      sourceBytesReturned: sourcePayloads.slice(codePayloadStart).filter((item) => item?.kind === 'file').reduce((total, item) => total + item.byteLength, 0),
      docker: dockerMonitor.summarize(codeDockerStart),
      ...(codeReadTimingComplete ? {} : { unresolved: ['one or more source-read requests remained in flight when the Code view became visible; click-to-visible is retained but source-read aggregate is partial'] }),
    }
    const diffStartIndex = network.length
    phase = 's5-diff-lens'
    const diffDockerStart = dockerMonitor.mark()
    const diffPayloadStart = sourcePayloads.length
    const diffStarted = now()
    await page.getByRole('button', { name: 'Diff' }).click()
    await page.waitForFunction(() => {
      const section = document.querySelector('[aria-labelledby="build-diff-title"]')
      if (!section) return false
      return Boolean(section.querySelector('.source-diff-list li') ||
        [...section.querySelectorAll('p')].some((element) => {
          const text = element.textContent ?? ''
          return text.includes('Não há arquivos diferentes') || text.includes('Não foi possível comparar') ||
            text.includes('O Diff aparecerá quando houver uma alteração')
        }))
    }, null, { timeout: 300_000 })
    await Promise.all(sourcePayloads.filter((item) => item instanceof Promise))
    const diffReads = network.slice(diffStartIndex).filter((item) => item.path.endsWith('/source/tree') || item.path.endsWith('/source/file'))
    const diffSectionText = await page.locator('[aria-labelledby="build-diff-title"]').innerText()
    const diffResolved = diffSectionText.includes('MODIFIED') || diffSectionText.includes('ADDED') || diffSectionText.includes('REMOVED') ||
      diffSectionText.includes('Não há arquivos diferentes')
    const diffReadTimingComplete = diffReads.length > 0 && diffReads.every((item) => Number.isFinite(item.durationMs))
    const diffStatus = diffResolved && diffReadTimingComplete ? 'MEASURED' : 'INCONCLUSIVE'
    samples.s5 = {
      sampleId: 's5-diff-lens', projectId: selectedProject, clickToVisibleMs: elapsedMs(diffStarted),
      status: diffStatus,
      treeRequestCount: diffReads.filter((item) => item.path.endsWith('/source/tree')).length,
      fileRequestCount: diffReads.filter((item) => item.path.endsWith('/source/file')).length,
      sourceBytesRead: sourcePayloads.slice(diffPayloadStart).filter((item) => item?.kind === 'file').reduce((total, item) => total + item.byteLength, 0),
      requests: diffReads.map(({ path, method, status, durationMs }) => ({ path, method, status, durationMs })),
      diffEntryCount: await page.locator('.source-diff-list li').count(),
      docker: dockerMonitor.summarize(diffDockerStart),
      ...(diffStatus === 'MEASURED' ? {} : { unresolved: [
        ...(diffResolved ? [] : ['current Diff view returned an error or no comparison basis; no visual Diff result is claimed']),
        ...(diffReadTimingComplete ? [] : ['one or more source-read requests remained in flight when the Diff view became visible; click-to-visible is retained but source-read aggregate is partial']),
      ] }),
    }

    const sessionResponse = network.findLast((item) => item.path === `/api/control/projects/${selectedProject}/builder-session` && item.method === 'GET')
    const finalWorking = (await setup.query('SELECT working_source_revision, current_state, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest FROM builder.project_working_state WHERE project_id = $1', [selectedProject])).rows[0]
    samples.s6 = {
      sampleId: 's6-preview-readiness', projectId: selectedProject,
      settlementState: finalWorking?.current_state,
      lastGoodCoordinatesPresent: Boolean(finalWorking?.last_preview_source_revision && finalWorking?.last_preview_artifact_revision_id && finalWorking?.last_preview_artifact_digest),
      clientBuilderSessionRequestObserved: Boolean(sessionResponse),
      launchPreview: { status: 'INCONCLUSIVE', reason: 'the qualification app uses the real Builder module but does not compose current IdentityAccess.issuePreviewEntry + MAR; those authorities are not replaced by a probe stub' },
      iframeApplicationReady: { status: 'INCONCLUSIVE', reason: 'no authorized real Preview entry/grant was composed' },
    }

    const runs = await setup.query(`SELECT state, mode, result_kind, base_source_revision, result_source_revision,
      failure_code, sandbox_id, model_provider_id, model_id, created_at, started_at, finished_at
      FROM builder.builder_run ORDER BY created_at`)
    runRows = runs.rows.map((row) => ({ state: row.state, mode: row.mode, resultKind: row.result_kind,
      sourceChanged: row.result_source_revision !== null && row.result_source_revision !== row.base_source_revision,
      failureCode: row.failure_code, sandboxBound: Boolean(row.sandbox_id), providerId: row.model_provider_id,
      modelId: row.model_id, createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at }))
    workingRows = (await setup.query('SELECT current_state, count(*)::int AS count FROM builder.project_working_state GROUP BY current_state ORDER BY current_state')).rows
    projectProcesses = projectGitProcesses

    return {
      scenario: 'S1_S2_S3_S4_S5_S6_CURRENT_PRODUCT_JOURNEYS', status: 'MEASURED_PARTIAL',
      migrations: migration.versions.length,
      projectCreate: { scenario: 'S1_CREATE_NEW_PROJECT', status: 'MEASURED', samples: samples.s1, unresolved: [
        'auth identity resolution uses a deterministic qualified account; external OIDC/authentication overhead is excluded',
        'recovery, reservation/idempotency DB, lock/final transaction and canonical DB owners are inside the actual route total but not individually timed',
      ] },
      build: { scenario: 'S2_SOURCE_CHANGING_BUILD', status: 'MEASURED', samples: samples.s2, unresolved: [
        'runtime-internal Sandbox.create/start, agent/model subspans and source materialization are not separately exposed by the current Product composition',
        'compiler E2B lifecycle and individual Vite/output-collection spans are represented by separate direct compiler calibration, not attributed to these composed runs',
      ] },
      plan: { scenario: 'S3_RESPONSE_ONLY_PLAN', status: 'MEASURED', samples: [samples.s3] },
      code: { scenario: 'S4_CODE_LENS', status: samples.s4.status, samples: [samples.s4], unresolved: ['Docker CLI process count is not exposed by this source port; matching daemon container events are reported separately', ...(samples.s4.unresolved ?? [])] },
      diff: { scenario: 'S5_DIFF_LENS', status: samples.s5.status, samples: [samples.s5], unresolved: ['browser-local comparison is not separately timed from click-to-visible wall time; matching daemon container events are reported separately', ...(samples.s5.unresolved ?? [])] },
      preview: { scenario: 'S6_PREVIEW_READINESS', status: 'MEASURED_PARTIAL', samples: [samples.s6] },
      productRuns: runRows,
      projectWorkingStates: workingRows,
      gitProcessCensus: projectProcesses.map(({ executable, operation, timeoutMs, durationMs, exitCode, signal, timedOut }) => ({ executable, operation, timeoutMs, durationMs, exitCode, signal, timedOut })),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    let safeMessage = message
    for (const key of Object.keys(process.env).filter((name) => /(?:PASSWORD|SECRET|API_KEY)_FILE$/.test(name))) {
      const path = process.env[key]
      if (!path) continue
      const secret = await readFile(path, 'utf8').then((value) => value.trim(), () => '')
      if (secret) safeMessage = safeMessage.replaceAll(secret, '[redacted]')
    }
    safeMessage = safeMessage
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://[redacted]')
      .replace(/((?:password|secret|token|api[_ -]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null
    const productFailureCode = /^[A-Z0-9_:-]{1,120}$/.test(message) ? message : 'PRODUCT_JOURNEY_MEASUREMENT_FAILED'
    return {
      scenario: 'S1_S2_S3_S4_S5_S6_CURRENT_PRODUCT_JOURNEYS', status: 'FAILED',
      failureCode: productFailureCode,
      failurePhase: phase,
      failureName: error instanceof Error ? error.name : 'UnknownError',
      errorCode,
      failureMessage: safeMessage.slice(0, 240),
      partial: { projectCreate: samples.s1, build: samples.s2, plan: samples.s3, code: samples.s4, diff: samples.s5, preview: samples.s6 },
      unresolved: ['journey did not satisfy its current Product assertions; partial samples are diagnostic only and cannot be used as a complete baseline'],
    }
  } finally {
    await browser?.close().catch(() => {})
    await vite?.close().catch(() => {})
    await app?.close().catch(() => {})
    await builder?.close().catch(() => {})
    await dockerMonitor?.close().catch(() => {})
    for (const pool of projectPools.reverse()) await pool.end().catch(() => {})
    await executor?.end().catch(() => {})
    await setup?.end().catch(() => {})
    if (ownerConnected) {
      await owner.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {})
      await owner.end().catch(() => {})
    }
  }
}

const probeProductComposition = async (built, modules, root) => {
  const inconclusive = (reason) => ({ scenario: 'P3_EXACT_C020_PRODUCT_COMPOSITION', status: 'INCONCLUSIVE', reason })
  if (!live) return inconclusive('live provider/model execution requires explicit --live')
  const required = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER']
  if (required.some((name) => !process.env[name]) ||
    (!process.env.CONEXUS_TEST_DB_PASSWORD && !process.env.CONEXUS_TEST_DB_PASSWORD_FILE) ||
    !process.env.CONEXUS_DB_RB_INGRESS_PASSWORD_FILE || !process.env.CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE) {
    return inconclusive('disposable PostgreSQL admin connection is not configured')
  }
  const apiKeyFile = process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE
  const catalogFile = process.env.CONEXUS_PROJECT_MODEL_CATALOG_FILE
  const slotsFile = process.env.CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE
  const admissionId = process.env.CONEXUS_BUILDER_MODEL_ADMISSION_ID
  const templateRef = process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID
  if (!apiKeyFile || !catalogFile || !slotsFile || !admissionId || !templateRef) {
    return inconclusive('live model/E2B admission configuration is incomplete')
  }

  const password = process.env.CONEXUS_TEST_DB_PASSWORD_FILE
    ? (await readFile(process.env.CONEXUS_TEST_DB_PASSWORD_FILE, 'utf8')).trim()
    : process.env.CONEXUS_TEST_DB_PASSWORD
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password,
  }
  const connectionString = (config) => {
    const url = new URL('postgresql://localhost')
    url.hostname = config.host
    url.port = String(config.port)
    url.pathname = `/${config.database}`
    url.username = config.user
    url.password = config.password
    return url.toString()
  }
  const database = `conexus_7r2_p3_${uuid().replaceAll('-', '')}`
  const owner = new pg.Client(admin)
  let setup
  let executor
  let module
  let app
  let sessionStorage
  let ownerConnected = false
  const rootPath = await mkdtemp(join(tmpdir(), 'conexus-7r2-p3-'))
  root.cleanup.push(() => rm(rootPath, { recursive: true, force: true }))
  const projectId = uuid()
  const accountId = uuid()
  const workspaceId = uuid()
  const intent = 'Create exactly one file named app/BUILDER_RESULT.txt containing exactly governed-by-conexus followed by a newline. Do not modify any other file.'
  const sample = {
    scenario: 'P3_EXACT_C020_PRODUCT_COMPOSITION',
    status: 'FAILED',
    sampleId: 'p3-live-product-composition-1',
    mode: 'BUILD',
    modelId: null,
    projectSource: { baseRevision: null, resultRevision: null },
    timing: {},
    gitProcesses: [],
    assertions: {},
    failureCode: null,
  }
  const started = now()
  try {
    await owner.connect()
    ownerConnected = true
    await owner.query(`CREATE DATABASE "${database}"`)
    const current = { ...admin, database }
    const migration = await runCurrentHubMigrations({ connectionString: connectionString(current) })
    sample.migrationVersions = migration.versions
    setup = new pg.Client(current)
    await setup.connect()
    const { createConfiguredBuilderModule } = await import(built('builder/module.js'))
    const { createOciGitExecutionPort } = await import(built('project/git-execution.js'))
    const { createApplicationArtifactStore } = await import(built('registry/application-artifact-store.js'))
    const { createHttpApp } = await import(built('http/app.js'))
    const { FIXED_APPLICATION_STARTER_FILES } = await import(built('builder/application-starter.js'))
    const admission = modules.resolveModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId, requiredCapabilities: ['BUILDER_CODING'],
    })
    sample.modelId = admission.modelId
    const work = join(rootPath, 'work')
    const storageRoot = join(rootPath, 'storage')
    const repository = join(storageRoot, 'projects', projectId)
    await mkdir(join(work, 'app', 'src'), { recursive: true })
    await mkdir(join(storageRoot, 'projects'), { recursive: true })
    for (const file of FIXED_APPLICATION_STARTER_FILES) {
      await writeFile(join(work, file.path), file.content)
    }
    git(rootPath, 'init', '--initial-branch=main', work)
    git(work, 'config', 'user.name', 'Conexus 7R2 Product probe')
    git(work, 'config', 'user.email', '7r2-product-probe@conexus.invalid')
    git(work, 'add', 'app')
    git(work, 'commit', '-m', '7R2 exact Product composition fixture')
    const sourceRevision = git(work, 'rev-parse', 'HEAD')
    execFileSync('git', ['clone', '--bare', work, repository], { stdio: 'ignore' })
    sample.projectSource.baseRevision = sourceRevision

    await setup.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, $2, $3, $4)', [accountId, 'https://conexus.7r2.invalid', accountId, '7R2 disposable Product probe'])
    await setup.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, '7R2 disposable Product probe'])
    await setup.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project, role) VALUES ($1, $2, true, 'owner')", [accountId, workspaceId])
    await setup.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, '7R2 Product probe', 'NEW', $3, '7r2-product-probe')", [projectId, workspaceId, sourceRevision])
    await setup.query('INSERT INTO iam.project_builder_grant(account_id, project_id, can_build, can_read_source) VALUES ($1, $2, true, true)', [accountId, projectId])
    await setup.query('INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1, $2)', [projectId, sourceRevision])

    const processes = []
    const gitPort = createOciGitExecutionPort({ projectStorageRoot: storageRoot }, runProcess(processes))
    module = createConfiguredBuilderModule({
      database: { host: admin.host, port: admin.port, database },
      builder: {
        ingressPasswordFile: process.env.CONEXUS_DB_RB_INGRESS_PASSWORD_FILE,
        executorPasswordFile: process.env.CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE,
        e2bApiKeyFile: apiKeyFile,
        e2bTemplateId: templateRef,
        modelAdmissionId: admissionId,
      },
      applicationArtifacts: createApplicationArtifactStore(),
      projectSource: { storageRoot, git: gitPort },
      model: admission.model,
      modelIdentity: { admissionId: admission.admissionId, providerId: admission.providerId, modelId: admission.modelId },
      validateModelCredential: admission.validateCredential,
      origin: 'https://conexus-7r2.invalid',
      resolveCurrentSession: async () => ({ account: { accountId } }),
    })
    app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => module.registerBuilderRoutes(server) })
    const postStarted = now()
    const response = await app.inject({
      method: 'POST',
      url: `/api/control/projects/${projectId}/builder-session/messages`,
      headers: {
        origin: 'https://conexus-7r2.invalid',
        cookie: '__Host-conexus_csrf=7r2-p3',
        'x-conexus-csrf': '7r2-p3',
        'idempotency-key': uuid(),
        'content-type': 'application/json',
      },
      payload: { content: intent, mode: 'BUILD' },
    })
    sample.timing.postAckMs = elapsedMs(postStarted)
    sample.httpStatus = response.statusCode
    sample.builderRunIdPresent = Boolean(response.json()?.builderRun?.builderRunId)
    sample.gitProcesses = processes
    await module.close()
    module = null
    sample.timing.postToTerminalMs = elapsedMs(postStarted)

    const row = (await setup.query(`SELECT builder_run_id, state, mode, base_source_revision, result_source_revision,
      result_kind, failure_code, sandbox_id, trigger_message_id, model_provider_id, model_id,
      created_at, started_at, finished_at
      FROM builder.builder_run WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, [projectId])).rows[0]
    const working = (await setup.query(`SELECT working_source_revision, current_state,
      last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest
      FROM builder.project_working_state WHERE project_id = $1`, [projectId])).rows[0]
    sample.builderRun = row ? {
      builderRunId: row.builder_run_id,
      state: row.state,
      mode: row.mode,
      resultKind: row.result_kind,
      failureCode: row.failure_code,
      sourceChanged: row.result_source_revision !== sourceRevision,
      sandboxBound: Boolean(row.sandbox_id),
      messageBound: Boolean(row.trigger_message_id),
      providerId: row.model_provider_id,
      modelId: row.model_id,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    } : null
    sample.projectSource.resultRevision = row?.result_source_revision ?? null
    sample.projectWorkingState = working
    sample.timing.queuedAtToStartedMs = row?.started_at && row?.created_at ? new Date(row.started_at).valueOf() - new Date(row.created_at).valueOf() : null
    sample.timing.startedToFinishedMs = row?.started_at && row?.finished_at ? new Date(row.finished_at).valueOf() - new Date(row.started_at).valueOf() : null

    executor = new pg.Pool({ ...current, user: 'hub_rb_executor', password: (await readFile(process.env.CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE, 'utf8')).trim() })
    const artifacts = createApplicationArtifactStore()
    const artifact = row?.result_source_revision
      ? await artifacts.getApplicationBySource(executor, { accountId, projectId, sourceRevision: row.result_source_revision })
      : null
    const threadId = `conexus-builder:${projectId}`
    sessionStorage = new LibSQLStore({ id: `7r2-p3-inspection-${uuid()}`, url: `file:${join(storageRoot, 'builder-session.db')}` })
    const memory = new Memory({ storage: sessionStorage, options: { lastMessages: 20 } })
    const thread = await memory.getThreadById({ threadId })
    const messages = thread ? (await memory.recall({ threadId, resourceId: projectId, page: 0, perPage: 50 })).messages : []
    const exactUserMessage = messages.some((message) => message.role === 'signal' && message.type === 'user' &&
      message.content.parts?.some((part) => part.type === 'text' && part.text === intent))
    const assistantTextReadable = messages.some((message) => message.role === 'assistant' &&
      message.content.parts?.some((part) => part.type === 'text' && typeof part.text === 'string' && part.text.trim()))
    sample.assertions = {
      currentConfiguredModuleAndRoute: sample.httpStatus === 201 && sample.builderRunIdPresent,
      buildMode: row?.mode === 'BUILD',
      sourceChanged: row?.result_kind === 'SOURCE_CHANGED' && row.result_source_revision !== sourceRevision,
      compilerAndRegistryRetain: Boolean(artifact && working?.current_state === 'PREVIEW_READY' &&
        working.last_preview_source_revision === row?.result_source_revision &&
        working.last_preview_artifact_revision_id === artifact.artifactRevisionId &&
        working.last_preview_artifact_digest === artifact.artifactDigest),
      builderRunSucceeded: row?.state === 'SUCCEEDED',
      projectThreadOwnedAndPersisted: Boolean(thread && thread.resourceId === projectId),
      exactUserMessagePersisted: exactUserMessage,
      assistantResultReadable: assistantTextReadable,
    }
    sample.artifact = artifact ? { artifactRevisionId: artifact.artifactRevisionId, artifactDigest: artifact.artifactDigest } : null
    sample.gitProcesses = processes.map(({ executable, operation, argsCount, durationMs, exitCode, signal }) => ({ executable, operation, argsCount, durationMs, exitCode, signal }))
    sample.status = Object.values(sample.assertions).every(Boolean) ? 'PASS' : 'FAIL'
    return sample
  } catch (error) {
    sample.failureCode = error instanceof Error && /^[A-Z0-9_:-]{1,120}$/.test(error.message)
      ? error.message
      : 'P3_PRODUCT_PROBE_FAILED'
    sample.timing.totalMs = elapsedMs(started)
    return sample
  } finally {
    await app?.close().catch(() => {})
    await module?.close().catch(() => {})
    await sessionStorage?.close().catch(() => {})
    await executor?.end().catch(() => {})
    await setup?.end().catch(() => {})
    if (ownerConnected) {
      await owner.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {})
      await owner.end().catch(() => {})
    }
  }
}

const summarize = (values) => {
  const sorted = values.filter(Number.isFinite).toSorted((left, right) => left - right)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return {
    count: sorted.length,
    minMs: sorted[0],
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    maxMs: sorted.at(-1),
  }
}

const buildBoundaryCensus = (journeys, compiler) => {
  const census = []
  const add = (scenario, boundary, durations, relation, extra = {}) => {
    const measured = durations.filter(Number.isFinite)
    census.push({
      scenario, boundary, invocationCount: extra.observedInvocationCount ?? measured.length,
      measuredInvocationCount: measured.length,
      aggregateDurationMs: measured.reduce((total, value) => total + value, 0),
      distribution: summarize(measured), relation, ...extra,
    })
  }
  const p1Samples = journeys.p1.samples ?? []
  for (const name of ['verify_admitted_image', 'stage_new_project_source', 'promote_staged_project_source', 'verify_canonical_project_source']) {
    const spans = p1Samples.flatMap((sample) => (sample.spans ?? []).filter((item) => item.name === name))
    add('P1_REAL_HARDENED_GIT_CONTROL', name, spans.map((item) => item.durationMs), 'serial within each P1 sample', {
      outcomes: spans.map((item) => item.value?.status ?? item.failureCode ?? item.status),
    })
  }
  const p1Processes = p1Samples.flatMap((sample) => sample.processes ?? [])
  for (const operation of ['image', 'run']) {
    const processes = p1Processes.filter((item) => item.operation === operation)
    add('P1_REAL_HARDENED_GIT_CONTROL', `docker_process:${operation}`, processes.map((item) => item.durationMs), 'observed child process duration; operation ordering retained per sample', {
      timeoutMs: processes.map((item) => item.timeoutMs),
      exitCodes: processes.map((item) => item.exitCode),
      timeoutCount: processes.filter((item) => item.timedOut).length,
    })
  }
  const creations = journeys.projectCreate.samples ?? []
  add('S1_CREATE_NEW_PROJECT', 'browser_click_to_201', creations.map((sample) => sample.requestToResponseMs), 'one-request-wall-time', {
    coldWarm: creations.map(({ sampleId, class: sampleClass }) => ({ sampleId, class: sampleClass })),
  })
  const gitOperations = ['image', 'run']
  for (const operation of gitOperations) {
    const observations = creations.flatMap((sample) => sample.processObservations.filter((item) => item.operation === operation))
    add('S1_CREATE_NEW_PROJECT', `docker_process:${operation}`, observations.map((item) => item.durationMs), 'serial within each PRJ-03 request', {
      exitCodes: observations.map((item) => item.exitCode), timeoutMs: observations.map((item) => item.timeoutMs),
      invocationCountPerProject: creations.map((sample) => ({ sampleId: sample.sampleId, count: sample.processObservations.filter((item) => item.operation === operation).length })),
    })
  }
  const builds = journeys.build.samples ?? []
  add('S2_SOURCE_CHANGING_BUILD', 'POST_action_to_ack', builds.map((sample) => sample.postActionToAckMs), 'one HTTP request')
  add('S2_SOURCE_CHANGING_BUILD', 'BuilderRun_queue_to_claim', builds.map((sample) => sample.builderRun.queueToClaimMs), 'database timestamps')
  add('S2_SOURCE_CHANGING_BUILD', 'BuilderRun_active_to_terminal', builds.map((sample) => sample.builderRun.activeToTerminalMs), 'database timestamps; internal phases unclassified')
  add('S2_SOURCE_CHANGING_BUILD', 'POST_action_to_last_good_coordinates_visible', builds.map((sample) => sample.postActionToLastGoodCoordinatesVisibleMs), 'browser UI wall time')
  add('S2_SOURCE_CHANGING_BUILD', 'first_safe_live_assistant_visible', builds.map((sample) => sample.firstLiveAssistantMs).filter((value) => value !== null), 'browser DOM observation')
  add('S2_SOURCE_CHANGING_BUILD', 'first_safe_live_tool_visible', builds.map((sample) => sample.firstLiveActivityMs).filter((value) => value !== null), 'browser DOM observation')
  add('S2_SOURCE_CHANGING_BUILD', 'docker_container_lifetime', builds.flatMap((sample) => sample.docker.containerDurationsMs), 'daemon event start→die; no relation inferred between concurrent containers')
  add('S2_SOURCE_CHANGING_BUILD', 'bound_coding_sandbox_per_run', builds.filter((sample) => sample.builderRun.sandboxBound).map(() => 1), 'BuilderRun binding evidence; not an inferred E2B API invocation count')
  const plan = journeys.plan.samples ?? []
  add('S3_RESPONSE_ONLY_PLAN', 'POST_action_to_terminal_visible', plan.map((sample) => sample.postActionToTerminalUiMs), 'browser UI wall time')
  add('S4_CODE_LENS', 'Code_click_to_file_visible', (journeys.code.samples ?? []).map((sample) => sample.clickToVisibleMs), 'browser UI wall time')
  add('S4_CODE_LENS', 'source_read_http', (journeys.code.samples ?? []).flatMap((sample) => sample.requests.map((request) => request.durationMs)), 'tree then selected file', {
    observedInvocationCount: (journeys.code.samples ?? []).reduce((total, sample) => total + sample.requests.length, 0),
  })
  add('S4_CODE_LENS', 'docker_container_lifetime', (journeys.code.samples ?? []).flatMap((sample) => sample.docker.containerDurationsMs), 'daemon event start→die')
  add('S5_DIFF_LENS', 'Diff_click_to_visible', (journeys.diff.samples ?? []).map((sample) => sample.clickToVisibleMs), 'browser UI wall time')
  add('S5_DIFF_LENS', 'source_tree_and_file_http', (journeys.diff.samples ?? []).flatMap((sample) => sample.requests.map((request) => request.durationMs)), 'current UI launches independent snapshot reads concurrently', {
    observedInvocationCount: (journeys.diff.samples ?? []).reduce((total, sample) => total + sample.requests.length, 0),
  })
  add('S5_DIFF_LENS', 'docker_container_lifetime', (journeys.diff.samples ?? []).flatMap((sample) => sample.docker.containerDurationsMs), 'daemon event start→die')
  add('S6_COMPILER_E2B_ISOLATED_CALIBRATION', 'compiler_total', (compiler.samples ?? []).map((sample) => sample.durationMs), 'separate direct compiler calibration; not attributed to composed S2 runs')
  return census
}

const main = async () => {
  const root = { cleanup: [] }
  try {
    const built = await compileHub(root)
    const modules = {
      createOciGitExecutionPort: (await import(built('project/git-execution.js'))).createOciGitExecutionPort,
      createE2BApplicationCompiler: (await import(built('builder/application-artifact-runtime.js'))).createE2BApplicationCompiler,
      resolveModelAdmission: (await import(built('model-connection/model-catalog.js'))).resolveModelAdmission,
      createConfiguredBuilderModule: (await import(built('builder/module.js'))).createConfiguredBuilderModule,
      createApplicationArtifactStore: (await import(built('registry/application-artifact-store.js'))).createApplicationArtifactStore,
      createHttpApp: (await import(built('http/app.js'))).createHttpApp,
      FIXED_APPLICATION_STARTER_FILES: (await import(built('builder/application-starter.js'))).FIXED_APPLICATION_STARTER_FILES,
      createOciGitExecutionPort: (await import(built('project/git-execution.js'))).createOciGitExecutionPort,
      gitIdentity: (await import(built('generated/r1c14-git-identity.js'))).R1C14_GIT_IDENTITY,
    }
    if (process.argv.includes('--probe-only')) {
      const gatePath = resolve(repositoryRoot, 'qualification/7r2/builder-runtime-waterfall/pre-baseline-probe.json')
      const previous = JSON.parse(await readFile(gatePath, 'utf8'))
      const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
      if (previous.subject?.head !== currentHead || previous.p2?.status !== 'PASS') throw new Error('P2_PROOF_REQUIRED_FOR_P3_REFRESH')
      const sample = await probeProductComposition(built, modules, root)
      const artifact = {
        schemaVersion: 'conexus.7r2.pre-baseline-probe.v1',
        subject: { repository: 'developmentconexus-ops/conexus-os', head: currentHead, branch: execFileSync('git', ['branch', '--show-current'], { cwd: repositoryRoot, encoding: 'utf8' }).trim() },
        environment: { node: process.version, platform: process.platform, arch: process.arch, mastraCore: '1.63.2', e2bSdk: '2.46.1' },
        p2: previous.p2,
        p3: sample,
        disposition: sample.status === 'PASS' ? 'PRE-BASELINE GATE PASS' : sample.status,
      }
      const probeOutput = process.argv.find((value) => value.startsWith('--output='))?.slice('--output='.length) ?? 'qualification/7r2/builder-runtime-waterfall/pre-baseline-probe.json'
      await writeFile(resolve(repositoryRoot, probeOutput), `${JSON.stringify(artifact, null, 2)}\n`)
      process.stdout.write(`${JSON.stringify({ outputPath: resolve(repositoryRoot, probeOutput), p2: artifact.p2.status, p3: sample.status, disposition: artifact.disposition, assertions: sample.assertions ?? {}, failureCode: sample.failureCode }, null, 2)}\n`)
      return
    }
    if (process.argv.includes('--p1-only')) {
      const fixture = await createFixture(root)
      const result = await measureGit(modules, root, fixture)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return
    }
    const gatePath = resolve(repositoryRoot, 'qualification/7r2/builder-runtime-waterfall/pre-baseline-probe.json')
    const gate = JSON.parse(await readFile(gatePath, 'utf8'))
    const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
    const currentBranch = execFileSync('git', ['branch', '--show-current'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
    if (gate.subject?.head !== currentHead || gate.subject?.branch !== currentBranch || gate.p2?.status !== 'PASS' ||
      gate.p3?.status !== 'PASS' || gate.disposition !== 'PRE-BASELINE GATE PASS' ||
      !Object.values(gate.p3.assertions ?? {}).every(Boolean)) throw new Error('PRE_BASELINE_GATE_PROOF_REFUSED')
    if (await readFile(outputPath).then(() => true, () => false)) throw new Error('BASELINE_ARTIFACT_ALREADY_EXISTS')

    if (process.argv.includes('--journey-smoke')) {
      const journeys = await measureProductJourneys(built, modules, root)
      process.stdout.write(`${JSON.stringify({ p2: gate.p2.status, p3: gate.p3.status, journeys }, null, 2)}\n`)
      if (journeys.status !== 'MEASURED' || journeys.samples?.length !== 1) process.exitCode = 1
      return
    }

    const measurementStartedAt = now()
    const measurementStartedWallClock = new Date().toISOString()
    const p1Fixture = await createFixture(root)
    const p1 = await measureGit(modules, root, p1Fixture)
    if (p1.status !== 'PASS') {
      process.stdout.write(`${JSON.stringify({ disposition: 'P1_REAL_HARDENED_GIT_CONTROL_FAILED', p1 }, null, 2)}\n`)
      process.exitCode = 1
      return
    }
    const journeys = await measureProductJourneys(built, modules, root)
    if (journeys.status !== 'MEASURED_PARTIAL' || journeys.projectCreate?.samples?.length !== 3 ||
      journeys.build?.samples?.length !== 3 || journeys.plan?.samples?.length !== 1 ||
      journeys.code?.samples?.length !== 1 || journeys.diff?.samples?.length !== 1 ||
      journeys.preview?.samples?.length !== 1) {
      process.stdout.write(`${JSON.stringify({ disposition: 'PRODUCT_JOURNEY_MEASUREMENT_INCOMPLETE', p1Status: p1.status, journeyStatus: journeys.status, failureCode: journeys.failureCode, failurePhase: journeys.failurePhase, failureName: journeys.failureName, errorCode: journeys.errorCode, failureMessage: journeys.failureMessage, partialCounts: Object.fromEntries(Object.entries(journeys.partial ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : value ? 1 : 0])) }, null, 2)}\n`)
      process.exitCode = 1
      return
    }
    const compiler = await measureCompiler(modules, root)
    if (compiler.status !== 'MEASURED' || compiler.samples.length !== 3 || compiler.samples.some((sample) => sample.status !== 'SUCCEEDED')) {
      process.stdout.write(`${JSON.stringify({ disposition: 'COMPILER_E2B_CALIBRATION_INCOMPLETE', p1, journeys, compiler }, null, 2)}\n`)
      process.exitCode = 1
      return
    }
    const scenarios = [p1, journeys.projectCreate, journeys.build, journeys.plan, journeys.code, journeys.diff, journeys.preview, compiler]
    const census = buildBoundaryCensus({ ...journeys, p1 }, compiler)
    const rawSampleCount = scenarios.reduce((total, scenario) => total + (scenario.samples?.length ?? 0), 0)
    const measurementEndedAt = now()
    const changedFiles = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repositoryRoot, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }))
    const untrackedPaths = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: repositoryRoot, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
    const trackedDiff = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 })
    const untrackedDigests = await Promise.all(untrackedPaths.map(async (path) => ({
      path, sha256: createHash('sha256').update(await readFile(resolve(repositoryRoot, path))).digest('hex'),
    })))
    const workingTreeFingerprint = createHash('sha256').update(trackedDiff).update(JSON.stringify(untrackedDigests)).digest('hex')
    const artifact = {
      schemaVersion: 'conexus.7r2.builder-runtime-waterfall.v1',
      subject: { repository: 'developmentconexus-ops/conexus-os', head: currentHead, branch: currentBranch, workingTreeFingerprint, changedFiles, untrackedDigests },
      measurement: { startedAt: measurementStartedWallClock, endedAt: new Date().toISOString(), monotonicStartedAt: measurementStartedAt.toString(), monotonicEndedAt: measurementEndedAt.toString(), durationMs: elapsedMs(measurementStartedAt, measurementEndedAt) },
      environment: { node: process.version, npm: execFileSync('npm', ['--version'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(), platform: process.platform, arch: process.arch, docker: (() => { try { return execFileSync('docker', ['--version'], { encoding: 'utf8' }).trim() } catch { return 'unavailable' } })(), gitImage: p1.samples[0]?.spans?.[0]?.value ? { ociIndexDigest: modules.gitIdentity.ociIndexDigest, gitVersion: modules.gitIdentity.gitVersion, gitExecutableSha256: modules.gitIdentity.gitExecutableSha256 } : null, mastraCore: '1.63.2', e2bSdk: '2.46.1', executionMode: 'explicit-live-product-composition' },
      controls: { p2: gate.p2, p3: gate.p3, p1 },
      inputs: { projectSource: { mode: 'NEW', fixture: 'fixed-small-app-counter-request', starterFileCount: journeys.projectCreate.samples[0].input.starterFileCount, starterBytes: journeys.projectCreate.samples[0].input.starterBytes }, codeDiff: { fileCount: journeys.code.samples[0].sourceFileCount ?? null, bytes: journeys.code.samples[0].sourceBytesReturned ?? null }, model: journeys.build.samples[0].model },
      scenarios,
      expensiveBoundaryCensus: census,
      rawSampleCount,
      interpretation: { laterStrategyFamilies: ['UNDECIDED'], unsupportedClaims: ['No bottleneck is declared from this artifact alone.'], unclassifiedRemainder: scenarios.flatMap((scenario) => (scenario.unresolved ?? []).map((reason) => ({ scenario: scenario.scenario, reason }))) },
    }
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' })
    process.stdout.write(`${JSON.stringify({ outputPath, scenarios: scenarios.map(({ scenario, status, samples }) => ({ scenario, status, samples: samples.length })) }, null, 2)}\n`)
  } finally {
    for (const cleanup of root.cleanup.reverse()) await cleanup()
  }
}

await main()
