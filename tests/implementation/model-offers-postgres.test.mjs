import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

// What the Builder may offer is decided against a real database, because the decision is
// model_connection.admit_for_project's: ownership, the workspace share, ACTIVE state and the
// account's own preference. The regression this file exists for is a ChatGPT connection that could
// never run, because the offer named Mastra's registry key `openai` while admission compares the
// connection's own `openai-codex`.

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])
const repositoryRoot = resolve(import.meta.dirname, '../..')
const connect = async (connection) => { const client = new pg.Client(connection); await client.connect(); return client }

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/model-offers-postgres-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

test('an id nobody offered is refused with 422 model-choice-unavailable, and no offers at all with model-connection-required', async (t) => {
  const built = compileHub(t)
  const { createHttpApp } = await import(built('http/app.js'))
  const { registerBuilderRoutes } = await import(built('builder/routes.js'))
  const { createBuilderService } = await import(built('builder/service.js'))
  const { resolveBuilderModelChoice } = await import(built('builder/model-choice.js'))

  const offer = {
    choiceId: 'openai-codex/gpt-5.5', label: 'gpt-5.5',
    providerId: 'openai-codex', modelId: 'gpt-5.5',
    connectionId: randomUUID(), connectionLabel: 'Meu ChatGPT', credentialKind: 'OAUTH_TOKEN_SET',
  }
  assert.equal(resolveBuilderModelChoice([offer], undefined).identity.providerId, 'openai-codex')
  assert.equal(resolveBuilderModelChoice([offer], undefined).identity.admissionId, 'openai-codex-gpt-5.5')
  assert.throws(() => resolveBuilderModelChoice([offer], 'anthropic/claude-opus-4-5'), /BUILDER_MODEL_CHOICE_REFUSED/)
  assert.throws(() => resolveBuilderModelChoice([], undefined), /MODEL_CONNECTION_REQUIRED/)

  const projectId = randomUUID()
  const appFor = (offers) => createHttpApp({
    registerRoutes: (app) => registerBuilderRoutes(app, {
      store: {},
      service: createBuilderService({
        store: { createBuilderRun: async () => { throw new Error('must not reach the database') }, close: async () => {} },
        source: {}, compiler: {}, applicationArtifacts: {},
        runtime: { kind: 'REMOTE_E2B', execute: async () => { throw new Error('must not execute') } },
        listModelOffers: async () => offers,
      }),
      origin: 'https://hub.test',
      resolveCurrentSession: async () => ({ account: { accountId: randomUUID() } }),
    }),
    staticRoot: null,
  })
  const post = (app, modelChoiceId) => app.inject({
    method: 'POST', url: `/api/control/projects/${projectId}/builder-session/messages`,
    headers: { origin: 'https://hub.test', 'x-conexus-csrf': 'csrf-1', 'idempotency-key': randomUUID(), 'content-type': 'application/json' },
    cookies: { '__Host-conexus_csrf': 'csrf-1' },
    payload: JSON.stringify({ content: 'crie um contador', mode: 'BUILD', ...(modelChoiceId ? { modelChoiceId } : {}) }),
  })

  const offering = await appFor([offer])
  t.after(() => offering.close())
  const refused = await post(offering, 'anthropic/claude-opus-4-5')
  assert.equal(refused.statusCode, 422)
  assert.equal(refused.json().type, 'urn:conexus:problem:model-choice-unavailable')

  const empty = await appFor([])
  t.after(() => empty.close())
  const unconnected = await post(empty, undefined)
  assert.equal(unconnected.statusCode, 422)
  assert.equal(unconnected.json().type, 'urn:conexus:problem:model-connection-required')
})

test('a ChatGPT connection the account selected yields openai-codex offers, and a run created with one is admitted', {
  skip: configured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  await refuseProtectedCluster()
  const built = compileHub(t)
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_model_offers_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const ownerClient = await connect(admin)
  await ownerClient.query(`CREATE DATABASE "${database}"`)
  const current = { ...admin, database }
  let adminClient
  let ingressClient
  const modules = []
  t.after(async () => {
    for (const module of modules) await module.close().catch(() => {})
    await ingressClient?.end(); await adminClient?.end()
    await ownerClient.query(`DROP DATABASE "${database}" WITH (FORCE)`); await ownerClient.end()
  })
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = current.host; connectionString.port = String(current.port)
  connectionString.pathname = `/${database}`; connectionString.username = current.user; connectionString.password = current.password
  await runHubMigrations({ connectionString: connectionString.toString() })

  const secretRoot = mkdtempSync(resolve(tmpdir(), 'conexus-model-offers-'))
  t.after(() => rmSync(secretRoot, { recursive: true, force: true }))
  const passwordFile = resolve(secretRoot, 'model-connection-password')
  writeFileSync(passwordFile, 'offers-model-connection\n', 'utf8')

  adminClient = await connect(current)
  await adminClient.query("ALTER ROLE hub_model_connection PASSWORD 'offers-model-connection'; ALTER ROLE hub_builder_ingress PASSWORD 'offers-ingress'")

  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID()
  const source = 'a'.repeat(40)
  await adminClient.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1,$2,$3,$4)', [accountId, 'https://offers.test', accountId, 'Leandro'])
  await adminClient.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, 'Oficina'])
  await adminClient.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,'owner')", [accountId, workspaceId])
  await adminClient.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1,$2,'Contador','NEW',$3,'r1')", [projectId, workspaceId, source])
  await adminClient.query('INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1,$2)', [projectId, source])

  const { createModelConnectionModule } = await import(built('model-connection-account/module.js'))
  const module = createModelConnectionModule({
    database: { host: current.host, port: current.port, database },
    passwordFile,
    credentialBackend: {
      publishOrMatch: async () => undefined,
      materialize: async () => { throw new Error('offers never materialize a credential') },
    },
    origin: 'https://hub.test',
    resolveCurrentSession: async () => null,
  })
  modules.push(module)

  const publish = async (connectionId, providerId, kind, label) => {
    assert.equal((await adminClient.query('SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value', [accountId, connectionId, providerId, kind, label, 1])).rows[0].value, true)
  }
  const select = async (connectionId) => {
    assert.equal((await adminClient.query('SELECT model_connection.select_connection($1,$2) AS value', [accountId, connectionId])).rows[0].value, true)
  }

  // Nothing connected, nothing offered. This is the state the composer disables itself in.
  assert.deepEqual(await module.listModelOffers({ accountId, projectId }), [])

  const chatgpt = randomUUID()
  await publish(chatgpt, 'openai-codex', 'OAUTH_TOKEN_SET', 'Meu ChatGPT')
  // Published but not preferred: admit_for_project reads the preference, so there is still nothing.
  assert.deepEqual(await module.listModelOffers({ accountId, projectId }), [])
  await select(chatgpt)

  const offers = await module.listModelOffers({ accountId, projectId })
  assert.deepEqual(offers.map((offer) => offer.choiceId), ['openai-codex/gpt-5.5', 'openai-codex/gpt-5.6-terra'])
  assert.deepEqual(offers[0], {
    choiceId: 'openai-codex/gpt-5.5', label: 'gpt-5.5',
    providerId: 'openai-codex', modelId: 'gpt-5.5',
    connectionId: chatgpt, connectionLabel: 'Meu ChatGPT', credentialKind: 'OAUTH_TOKEN_SET',
  })

  // The regression. The run is created under the offer's own provider id, which is the connection's,
  // and create_builder_run_with_model's credential comparison therefore holds.
  const { createBuilderStore } = await import(built('builder/store.js'))
  const { resolveBuilderModelChoice } = await import(built('builder/model-choice.js'))
  const { createPostgresPool } = await import(built('platform/postgres.js'))
  const ingressPool = createPostgresPool({ ...current, user: 'hub_builder_ingress', password: 'offers-ingress' })
  modules.push({ close: () => ingressPool.end() })
  const store = createBuilderStore({ ingressPool, executorPool: ingressPool })
  const run = await store.createBuilderRun({
    accountId, projectId, idempotencyKey: 'offers-key', content: 'crie um contador', mode: 'BUILD',
    modelIdentity: resolveBuilderModelChoice(offers, 'openai-codex/gpt-5.5').identity,
  })
  assert.equal(run.state, 'QUEUED')
  assert.deepEqual((await adminClient.query('SELECT model_admission_id, model_provider_id, model_id, model_connection_id FROM builder.builder_run WHERE builder_run_id = $1', [run.builderRunId])).rows[0], {
    model_admission_id: 'openai-codex-gpt-5.5',
    model_provider_id: 'openai-codex',
    model_id: 'gpt-5.5',
    model_connection_id: chatgpt,
  })

  // An API key for another registry provider is offered alongside, under its own provider id.
  const groq = randomUUID()
  await publish(groq, 'groq', 'API_KEY', 'Chave Groq')
  await select(groq)
  const both = await module.listModelOffers({ accountId, projectId })
  assert.deepEqual([...new Set(both.map((offer) => offer.providerId))].sort(), ['groq', 'openai-codex'])
  assert.equal(both.some((offer) => offer.credentialKind === 'API_KEY' && offer.connectionLabel === 'Chave Groq'), true)

  // Revoked means it can no longer pay, so it can no longer be offered.
  assert.equal((await adminClient.query('SELECT model_connection.revoke_connection($1,$2) AS value', [accountId, chatgpt])).rows[0].value, true)
  const afterRevoke = await module.listModelOffers({ accountId, projectId })
  assert.deepEqual([...new Set(afterRevoke.map((offer) => offer.providerId))], ['groq'])

  // Somebody else's connection, never shared into a workspace this account can see, is not theirs
  // to spend and is not offered.
  const strangerId = randomUUID(); const stranger = randomUUID()
  await adminClient.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1,$2,$3,$4)', [strangerId, 'https://offers.test', strangerId, 'Outra pessoa'])
  assert.equal((await adminClient.query('SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value', [strangerId, stranger, 'anthropic', 'OAUTH_TOKEN_SET', 'Claude alheio', 1])).rows[0].value, true)
  assert.equal((await adminClient.query('SELECT model_connection.select_connection($1,$2) AS value', [strangerId, stranger])).rows[0].value, true)
  const afterStranger = await module.listModelOffers({ accountId, projectId })
  assert.deepEqual([...new Set(afterStranger.map((offer) => offer.providerId))], ['groq'])
})
