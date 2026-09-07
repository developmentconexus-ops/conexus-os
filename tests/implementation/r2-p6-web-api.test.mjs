import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const generatedTarget = resolve(repositoryRoot, 'apps/web/src/generated/r2-client.ts')
const adapterTargets = [
  resolve(repositoryRoot, 'apps/web/src/features/brain/api.ts'),
  resolve(repositoryRoot, 'apps/web/src/features/connections/api.ts'),
  resolve(repositoryRoot, 'apps/web/src/features/project-resources/api.ts'),
]

test('R2-P6 generated transport executes same-origin requests without consuming Response metadata', async () => {
  const requests = []
  const expected = new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { etag: '"revision-2"' },
  })
  const priorDocument = globalThis.document
  const priorFetch = globalThis.fetch
  globalThis.document = { cookie: '__Host-conexus_csrf=csrf%2Fvalue' }
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return expected
  }

  try {
    const { r2Client } = await import(`${generatedTarget}?p6=${Date.now()}`)
    const response = await r2Client.request('CON-07', {
      params: { connectionId: 'connection/1' },
      headers: { 'idempotency-key': 'idem-1' },
      body: { credential: { username: 'operator', password: 'not-logged' } },
    })
    assert.equal(response, expected)
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('etag'), '"revision-2"')

    await r2Client.request('BRN-02', {
      params: { workspaceId: 'workspace/1' },
      querystring: { forProjectId: 'project + 1' },
    })
    await r2Client.request('PRJ-12', {
      params: { projectId: 'project-1' },
      headers: { 'if-match': 'digest-1' },
    })
  } finally {
    globalThis.fetch = priorFetch
    if (priorDocument === undefined) delete globalThis.document
    else globalThis.document = priorDocument
  }

  assert.equal(requests[0].url, '/api/control/connections/connection%2F1/credential')
  assert.equal(requests[0].init.method, 'PUT')
  assert.equal(requests[0].init.credentials, 'same-origin')
  assert.equal(requests[0].init.headers.get('idempotency-key'), 'idem-1')
  assert.equal(requests[0].init.headers.get('x-conexus-csrf'), 'csrf/value')
  assert.equal(requests[0].init.headers.get('content-type'), 'application/json')
  assert.equal(requests[0].init.body, JSON.stringify({
    credential: { username: 'operator', password: 'not-logged' },
  }))

  assert.equal(requests[1].url, '/api/control/workspaces/workspace%2F1/brain/revisions?forProjectId=project+%2B+1')
  assert.equal(requests[1].init.method, 'GET')
  assert.equal(requests[1].init.headers.has('x-conexus-csrf'), false)

  assert.equal(requests[2].init.method, 'DELETE')
  assert.equal(requests[2].init.headers.get('if-match'), 'digest-1')
  assert.equal(requests[2].init.headers.get('x-conexus-csrf'), 'csrf/value')
  assert.equal(requests[2].init.headers.has('content-type'), false)
  assert.equal(requests[2].init.body, undefined)
})

test('R2-P6 feature adapters consume generated contracts and cover only the exact 20 operations', () => {
  const adapters = adapterTargets.map((path) => readFileSync(path, 'utf8')).join('\n')
  const owners = [...adapters.matchAll(/r2Client\.request\('([^']+)'/g)].map((match) => match[1]).sort()
  assert.deepEqual(owners, [
    'BRN-01', 'BRN-02', 'BRN-03', 'BRN-10', 'BRN-14',
    'CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07', 'CON-08', 'CON-09',
    'PRJ-10', 'PRJ-11', 'PRJ-12', 'PRJ-13', 'PRJ-14', 'PRJ-15',
  ].sort())
  assert.doesNotMatch(adapters, /interface\s+\w+(?:Input|Response|Representation)|fetch\s*\(/)

  const responseAdapter = readFileSync(resolve(repositoryRoot, 'apps/web/src/features/r2-response.ts'), 'utf8')
  assert.match(responseAdapter, /response\.status === 401\) clearAuthorityCache\(\)/)
  assert.match(responseAdapter, /data: await response\.clone\(\)\.json\(\) as T, response/)
  assert.match(responseAdapter, /return \{ response \}/)
})

test('R2-P6 transport is generated and protects every mutating method with CSRF', () => {
  const generated = readFileSync(generatedTarget, 'utf8')
  assert.match(generated, /credentials: 'same-origin'/)
  assert.match(generated, /operation\.method !== 'GET'/)
  assert.match(generated, /headers\.set\('x-conexus-csrf'/)
  assert.match(generated, /return fetch\(/)
  assert.match(generated, /Promise<Response>/)
})
