import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p5-connection-qualification-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P5_CONNECTION_QUALIFICATION_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))

const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createConnectionStore } = await import(built('connections/store.js'))
const {
  createSankhyaProductionQualifier,
} = await import(built('connections/qualification.js'))
const {
  sankhyaProductionResponseAdmission,
  selectSankhyaProductionResponseAdmission,
} = await import(built('connections/module.js'))

const CONNECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REVISION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const QUALIFICATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const credentialBytes = () => Uint8Array.from(Buffer.from(JSON.stringify({
  clientId: 'local-client', clientSecret: 'local-secret', xToken: 'local-token',
}), 'utf8'))

const createCredentialBackend = (materializations) => ({
  keyGeneration: '1',
  idempotencyDigest: () => 'a'.repeat(64),
  publishOrMatch: async () => 'PUBLISHED',
  write: async () => undefined,
  materialize: async (coordinate) => {
    materializations.push({ ...coordinate })
    return credentialBytes()
  },
})

const startProductionStandIn = async (t) => {
  const requests = []
  const nativeFetch = globalThis.fetch
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    requests.push({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') })
    response.setHeader('content-type', 'application/json; charset=utf-8')
    if (request.url === '/authenticate') {
      return response.end(JSON.stringify({
        access_token: 'local-bearer', expires_in: 1800, 'not-before-policy': 0,
        refresh_expires_in: 0, token_type: 'Bearer', scope: 'gateway',
      }))
    }
    const companyCode = Number(new URL(request.url, 'https://local.invalid').pathname.split('/').at(-1))
    return response.end(JSON.stringify({ empresas: { codigoEmpresa: companyCode } }))
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('LOCAL_STAND_IN_ADDRESS_INVALID')
  const localOrigin = `http://127.0.0.1:${address.port}`
  const fetchImpl = async (input, init) => {
    const requested = new URL(String(input))
    assert.equal(requested.origin, 'https://api.sankhya.com.br')
    return nativeFetch(`${localOrigin}${requested.pathname}${requested.search}`, init)
  }
  return { requests, fetchImpl }
}

const productionInput = (companyCode, materializations, fetchImpl) => ({
  configuration: { environment: 'PRODUCTION', companyCode },
  connectionId: CONNECTION_ID,
  credentialGeneration: '7',
  credentialBackend: createCredentialBackend(materializations),
  fetchImpl,
})

test('R2-P5 closed selector admits only production companies 1 and 2', () => {
  const admitted = selectSankhyaProductionResponseAdmission({ environment: 'PRODUCTION', companyCode: 1 })
  assert.equal(admitted, sankhyaProductionResponseAdmission)
  assert.equal(selectSankhyaProductionResponseAdmission({ environment: 'PRODUCTION', companyCode: 2 }), admitted)
  for (const configuration of [
    { environment: 'SANDBOX', companyCode: 1 },
    { environment: 'SANDBOX', companyCode: 2 },
    { environment: 'PRODUCTION', companyCode: 3 },
    { environment: 'PRODUCTION', companyCode: 1, responseAdmission: sankhyaProductionResponseAdmission },
    { environment: 'PRODUCTION', companyCode: '1' },
    { environment: 'PRODUCTION', companyCode: 0 },
    null,
  ]) assert.equal(selectSankhyaProductionResponseAdmission(configuration), undefined)
})

test('R2-P5 production qualifier proves companies 1 and 2 through local HTTP', async (t) => {
  const standIn = await startProductionStandIn(t)
  const configuredQualifier = createSankhyaProductionQualifier(standIn.fetchImpl)
  for (const companyCode of [1, 2]) {
    const materializations = []
    const result = await configuredQualifier(productionInput(companyCode, materializations, standIn.fetchImpl))
    assert.equal(result.outcome, 'PASSED')
    assert.equal(result.qualificationState, 'PROVIDER_CONFIRMED')
    assert.deepEqual(materializations, [{ connectionId: CONNECTION_ID, generation: '7' }])
  }
  assert.deepEqual(standIn.requests.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: '/authenticate' },
    { method: 'GET', url: '/v1/empresas/1' },
    { method: 'POST', url: '/authenticate' },
    { method: 'GET', url: '/v1/empresas/2' },
  ])
  assert.equal(JSON.stringify(standIn.requests).includes('local-secret'), true)
  assert.equal(JSON.stringify(standIn.requests).includes('local-bearer'), true)
})

test('R2-P5 non-admitted and malformed reserved configurations stop before materialization or egress', async (t) => {
  const standIn = await startProductionStandIn(t)
  for (const configuration of [
    { environment: 'SANDBOX', companyCode: 1 },
    { environment: 'SANDBOX', companyCode: 2 },
    { environment: 'PRODUCTION', companyCode: 3 },
    { environment: 'PRODUCTION', companyCode: 1, parser: 'caller-choice' },
    { environment: 'PRODUCTION', companyCode: 1.5 },
  ]) {
    const materializations = []
    const result = await createSankhyaProductionQualifier(async () => {
      throw new Error('EGRESS_MUST_NOT_BE_REACHED')
    })({ ...productionInput(1, materializations, standIn.fetchImpl), configuration })
    assert.equal(result.outcome, 'INDETERMINATE')
    assert.equal(result.qualificationState, 'PROVIDER_SCHEMA_UNPROVEN')
    assert.deepEqual(materializations, [])
  }
  assert.deepEqual(standIn.requests, [])
  assert.equal(JSON.stringify(sankhyaProductionResponseAdmission).includes('local'), false)
  t.diagnostic('the production selector is closed before credential and HTTP boundaries')
})

test('R2-P5 default Connection store qualifier uses reserved configuration and replay does not retry provider', async (t) => {
  const standIn = await startProductionStandIn(t)
  const materializations = []
  const backend = createCredentialBackend(materializations)
  let reservation = 'NEW'
  const client = {
    query: async (statement) => {
      if (statement.includes('reserve_connection_qualification')) {
        if (reservation === 'NEW') return { rows: [{
          qualification_id: QUALIFICATION_ID, connection_revision_id: REVISION_ID,
          credential_generation: '7', environment: 'PRODUCTION',
          configuration: { environment: 'PRODUCTION', companyCode: 1 }, settlement_state: 'NEW',
        }] }
        return { rows: [{
          qualification_id: QUALIFICATION_ID, connection_id: CONNECTION_ID,
          connection_revision_id: REVISION_ID, credential_generation: '7', environment: 'PRODUCTION',
          configuration: { environment: 'PRODUCTION', companyCode: 1 }, settlement_state: 'SETTLED',
          qualification_state: 'PROVIDER_CONFIRMED', outcome: 'PASSED',
          diagnostic: { title: 'Connection test passed', message: 'Exact local production basis passed.' },
          evidence_refs: ['connector:sankhya-om@1.0.0', 'company:confirmed'],
          tested_at: new Date().toISOString(),
        }] }
      }
      if (statement.includes('settle_connection_qualification')) {
        reservation = 'SETTLED'
        return { rows: [] }
      }
      return { rows: [] }
    },
    release: () => undefined,
  }
  const store = createConnectionStore({
    pool: { connect: async () => client },
    credentialBackend: backend,
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = standIn.fetchImpl
  try {
    const first = await store.qualifyConnection({
      accountId: '11111111-1111-4111-8111-111111111111', connectionId: CONNECTION_ID,
      idempotencyKey: 'qualification-1',
      // This request value cannot replace the reserved revision configuration.
      body: { connectionRevisionId: REVISION_ID, environment: 'SANDBOX' },
    })
    assert.equal(first.status, 'FOUND')
    assert.equal(first.value.environment, 'PRODUCTION')
    assert.equal(first.value.outcome, 'PASSED')
    assert.equal(materializations.length, 1)
    assert.equal(standIn.requests.length, 2)

    const replay = await store.qualifyConnection({
      accountId: '11111111-1111-4111-8111-111111111111', connectionId: CONNECTION_ID,
      idempotencyKey: 'qualification-1',
      body: { connectionRevisionId: REVISION_ID, environment: 'SANDBOX' },
    })
    assert.equal(replay.status, 'FOUND')
    assert.equal(replay.reentry, 'SETTLED')
    assert.equal(materializations.length, 1)
    assert.equal(standIn.requests.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
  t.diagnostic('normal store qualification uses its reserved production basis and settled replay is provider-free')
})

test('R2-P5 low-level qualifier still requires explicit admission injection', async () => {
  const materializations = []
  const result = await (await import(built('connections/qualification.js'))).qualifySankhyaOm({
    configuration: { environment: 'PRODUCTION', companyCode: 1 },
    credentialCoordinate: { connectionId: CONNECTION_ID, generation: '7' },
    credentialBackend: createCredentialBackend(materializations),
    fetchImpl: async () => { throw new Error('EGRESS_MUST_NOT_BE_REACHED') },
  })
  assert.equal(result.qualificationState, 'PROVIDER_SCHEMA_UNPROVEN')
  assert.deepEqual(materializations, [])
})
