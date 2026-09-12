import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { Sandbox, NotFoundError } from 'e2b'
import { readBuilderE2BApiKey } from '../../scripts/rb-builder-e2b-template.mjs'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const admin = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const connect = async (config) => {
  const client = new pg.Client(config)
  await client.connect()
  return client
}
const sourceRevision = 'b'.repeat(40)
const baseRevision = 'a'.repeat(40)
const baselineDigest = 'd'.repeat(64)
const proofDigest = 'e'.repeat(64)

test('Builder preparation retains controlled source and reuses it after service recreation', { timeout: 180_000 }, async (t) => {
  const owner = await connect(admin)
  const database = `builder_preparation_${randomUUID().replaceAll('-', '')}`
  let setup
  let runtime
  const services = []
  await owner.query(`CREATE DATABASE "${database}"`)
  t.after(async () => {
    for (const service of services) await service.close()
    await runtime?.end()
    await setup?.end()
    await owner.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await owner.end()
  })
  const config = { ...admin, database }
  const url = new URL('postgresql://localhost')
  url.hostname = config.host
  url.port = String(config.port)
  url.pathname = `/${database}`
  url.username = config.user
  url.password = config.password
  const migrated = await runCurrentHubMigrations({ connectionString: url.toString() })
  assert.ok(migrated.versions.includes('026'), 'current loader must install Registry application storage')
  assert.ok(!migrated.versions.includes('024') && !migrated.versions.includes('025'))
  const root = resolve(import.meta.dirname, '../..')
  const buildRoot = mkdtempSync(resolve(root, 'apps/hub/registry-postgres-build-'))
  t.after(() => rmSync(buildRoot, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot],
  { cwd: root, encoding: 'utf8' })
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr)
  const { createApplicationArtifactStore } = await import(pathToFileURL(resolve(buildRoot, 'registry/application-artifact-store.js')).href)
  const store = createApplicationArtifactStore()
  setup = await connect(config)
  const ids = Object.fromEntries(['account', 'workspace', 'project', 'change', 'plan', 'item', 'stranger'].map((name) => [name, randomUUID()]))
  await setup.query("INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://registry.test', 'owner', 'Synthetic owner'), ($2, 'https://registry.test', 'stranger', 'Synthetic stranger')", [ids.account, ids.stranger])
  await setup.query("INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Synthetic Registry workspace')", [ids.workspace])
  await setup.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [ids.account, ids.workspace])
  await setup.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'Synthetic app', 'NEW', $3, 'registry-test')", [ids.project, ids.workspace, baseRevision])
  await setup.query("INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile) VALUES ($1, $2, $3, 'Synthetic baseline', 'MANAGED')", [ids.project, baselineDigest, baseRevision])
  await setup.query('INSERT INTO project.baseline_state(project_id, current_candidate_digest, approved_candidate_digest, approval_revision) VALUES ($1, $2, $2, $3)', [ids.project, baselineDigest, ids.plan])
  await setup.query('INSERT INTO iam.project_builder_grant(account_id, project_id, can_build, can_read_source, can_review) VALUES ($1, $2, true, true, true)', [ids.account, ids.project])
  await setup.query("INSERT INTO builder.change(change_id, project_id, created_by_account_id, intent, baseline_digest, base_source_revision, planning_depth, rigor_profile, state, candidate_source_revision, patch, result_summary) VALUES ($1, $2, $3, 'Synthetic retention', $4, $5, 'DIRECT', 'CONTROLLED', 'VERIFIED', $6, 'fixture', 'fixture')", [ids.change, ids.project, ids.account, baselineDigest, baseRevision, sourceRevision])
  await setup.query("INSERT INTO builder.contract_revision(contract_revision, change_id, intent_digest, assertion_ref, required_proof_kind) VALUES ($1, $2, $3, 'change-intent:' || $3, 'INDEPENDENT_COGNITIVE')", [ids.plan, ids.change, proofDigest])
  await setup.query("INSERT INTO builder.plan(change_id, plan_revision, item_id, summary, item_state, assertion_ref) VALUES ($1, $2, $3, 'Synthetic retention', 'COMPLETED', 'change-intent:' || $4)", [ids.change, ids.plan, ids.item, proofDigest])
  await setup.query('INSERT INTO builder.change_acceptance(change_id, candidate_source_revision, baseline_digest, plan_revision, contract_revision, evidence_set_digest) VALUES ($1, $2, $3, $4, $4, $5)', [ids.change, sourceRevision, baselineDigest, ids.plan, proofDigest])
  await setup.query("ALTER ROLE hub_rb_executor PASSWORD 'registry-adapter-test-only'")
  const runtimeConfig = { ...config, user: 'hub_rb_executor', password: 'registry-adapter-test-only' }

  const { createBuilderStore } = await import(pathToFileURL(resolve(buildRoot, 'builder/store.js')).href)
  const { createBuilderService } = await import(pathToFileURL(resolve(buildRoot, 'builder/service.js')).href)
  const { createE2BApplicationCompiler } = await import(pathToFileURL(resolve(buildRoot, 'builder/application-artifact-runtime.js')).href)
  await setup.query("ALTER ROLE hub_rb_ingress PASSWORD 'preparation-ingress-test-only'")
  const request = { accountId: ids.account, projectId: ids.project, changeId: ids.change }
  const coordinates = { ...request, sourceRevision }
  const html = '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><output>0</output><button>Adicionar</button><script type="module" src="/main.js"></script></body></html>'
  const js = 'document.querySelector("button").onclick = () => { const o = document.querySelector("output"); o.textContent = String(Number(o.textContent) + 1) }'
  const sourceFiles = [{ path: 'index.html', content: html }, { path: 'main.js', content: js }]
  const live = process.env.CONEXUS_APPLICATION_PREPARATION_LIVE === 'true'
  const sandboxIds = []
  t.after(() => { if (live) t.diagnostic(JSON.stringify({ sandboxIds })) })
  const apiKey = live ? readBuilderE2BApiKey(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE) : undefined
  const realCompiler = live ? createE2BApplicationCompiler({
    apiKey,
    onSandboxCreated: id => sandboxIds.push(id),
  }) : null
  let compiles = 0
  const compiler = { kind: 'REMOTE_E2B', compile: async input => {
    compiles += 1
    assert.equal(input.projectId, ids.project)
    assert.equal(input.changeId, ids.change)
    assert.equal(input.sourceRevision, sourceRevision)
    assert.deepEqual(input.files, sourceFiles)
    if (realCompiler) return realCompiler.compile(input)
    return {
      projectId: ids.project, changeId: ids.change, sourceRevision,
      templateRef: 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6',
      recipeSha256: '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97',
      files: sourceFiles.map(file => ({
        path: file.path, mediaType: file.path.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
        bytes: Buffer.from(file.content), sha256: createHash('sha256').update(file.content).digest('hex'),
      })),
    }
  } }
  const source = {
    listSourceTree: async input => {
      assert.deepEqual(input, { projectId: ids.project, sourceRevision })
      return { sourceRevision, entries: sourceFiles.map(file => ({ path: `app/${file.path}`, kind: 'FILE' })) }
    },
    readSourceFile: async input => {
      assert.equal(input.projectId, ids.project)
      assert.equal(input.sourceRevision, sourceRevision)
      const file = sourceFiles.find(file => `app/${file.path}` === input.path)
      assert.ok(file)
      return { ...input, content: file.content }
    },
  }
  const makeService = (sourcePort, compilerPort) => {
    const executorPool = new pg.Pool(runtimeConfig)
    const ingressPool = new pg.Pool({ ...config, user: 'hub_rb_ingress', password: 'preparation-ingress-test-only' })
    const service = createBuilderService({
      store: createBuilderStore({ executorPool, ingressPool }), source: sourcePort, compiler: compilerPort,
      runtime: { kind: 'REMOTE_E2B' }, verifier: { kind: 'REMOTE_E2B' },
      applicationArtifacts: {
        getApplication: input => store.getApplication(executorPool, input),
        retainApplication: input => store.retainApplication(executorPool, input),
      },
    })
    services.push(service)
    return service
  }
  const first = makeService(source, compiler)
  assert.equal(typeof first.prepareApplication, 'function', 'Builder must expose retained preparation, not transient compilation')
  const started = Date.now()
  const retained = await first.prepareApplication(request)
  assert.equal(compiles, 1)
  assert.equal(retained.projectId, ids.project)
  assert.equal(retained.sourceRevision, sourceRevision)
  assert.ok(retained.files.some(file => file.path === 'index.html'))
  runtime = await connect(runtimeConfig)
  const bytesBefore = new Map()
  for (const file of retained.files) {
    const read = await store.readApplicationFile(runtime, { ...coordinates, artifactRevisionId: retained.artifactRevisionId, path: file.path })
    assert.ok(read)
    assert.equal(createHash('sha256').update(read.bytes).digest('hex'), file.sha256)
    bytesBefore.set(file.path, Buffer.from(read.bytes))
  }
  await first.close()
  services.splice(services.indexOf(first), 1)
  const forbidden = async () => assert.fail('Retained preparation must not extract source or compile again')
  const second = makeService({ listSourceTree: forbidden, readSourceFile: forbidden }, { kind: 'REMOTE_E2B', compile: forbidden })
  assert.deepEqual(await second.prepareApplication(request), retained)
  assert.equal(compiles, 1)
  for (const [path, bytes] of bytesBefore) {
    const read = await store.readApplicationFile(runtime, { ...coordinates, artifactRevisionId: retained.artifactRevisionId, path })
    assert.deepEqual(Buffer.from(read.bytes), bytes)
  }
  if (live) {
    assert.equal(sandboxIds.length, 1)
    await assert.rejects(Sandbox.getInfo(sandboxIds[0], { apiKey }), error => error instanceof NotFoundError)
    const server = createServer((req, res) => {
      const path = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html'
      store.readApplicationFile(runtime, { ...coordinates, artifactRevisionId: retained.artifactRevisionId, path }).then(file => {
        if (!file) { res.writeHead(404); res.end(); return }
        res.writeHead(200, { 'Content-Type': file.mediaType, 'Cache-Control': 'no-store' })
        res.end(file.bytes)
      }).catch(() => { res.writeHead(403); res.end() })
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    let browser
    try {
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      assert.equal(await page.locator('output').textContent(), '0')
      await page.getByRole('button', { name: 'Adicionar' }).click()
      await page.getByRole('button', { name: 'Adicionar' }).click()
      assert.equal(await page.locator('output').textContent(), '2')
      assert.deepEqual(errors, [])
    } finally {
      await browser?.close()
      await new Promise(resolve => server.close(resolve))
    }
  }
  await setup.query('UPDATE iam.project_builder_grant SET can_build = false WHERE project_id = $1', [ids.project])
  await assert.rejects(second.prepareApplication(request), /APPLICATION_(SUBJECT_REFUSED|SUBJECT_CHANGED)/)
  assert.equal(compiles, 1)
  assert.equal((await setup.query("SELECT count(*)::int AS count FROM reg.artifact_revision")).rows[0].count, 1)
  await second.close()
  services.splice(services.indexOf(second), 1)
  t.diagnostic(JSON.stringify({
    proofClass: live ? 'real Builder service, Registry, PostgreSQL and E2B with controlled source; browser uses a test-only asset server' : 'real Builder service, Registry and PostgreSQL; controlled source and compiler',
    compiles, sandboxIds, elapsedMs: Date.now() - started, artifactRevisionId: retained.artifactRevisionId,
    excludes: 'model generation, Git custody, production module configuration, login, MAR serving and full Hub restart',
  }))
})
