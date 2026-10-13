import assert from 'node:assert/strict'
import { test } from 'node:test'
import { testListener } from './access/test-listener.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID } from './project-fixture.mjs'
import { DIGEST_2, F, P, SOURCE_2, fileOf, payloadOf, seedRevision, world } from './registry-fixture.mjs'

const { createHostingModule } = await import(hubModuleUrl('hosting/module.js'))
const { checkApplication } = await import(hubModuleUrl('identity-access/admission.js'))

const HUB = 'https://hub.conexus.localhost:3443'
const APPLICATION = Object.freeze({ port: 3445, domain: 'conexus.localhost' })
const HOST = 'caderno-de-compras.conexus.localhost:3445'
const TOKEN = 't'.repeat(43)
const SERVER_MANIFEST = fileOf('conexus-server/manifest.json', 'application/json; charset=utf-8', '{}')

async function hostOver(t, { registry, database, projectId, runnerCalls }) {
  const caller = { accountId: ID.outsider, email: 'funcionaria@example.test', displayName: 'Funcionária' }
  const sessions = {
    withApplicationRequest: async ({ slug, token }, serve) => {
      if (slug !== 'caderno-de-compras' || token !== TOKEN) return { kind: 'SIGN_IN_REQUIRED' }
      return { kind: 'SERVED', value: await database.transaction(caller.accountId, async (gate) =>
        serve({ caller, checked: await checkApplication(gate, projectId) })) }
    },
    redeem: async () => null,
    signOut: async () => undefined,
  }
  const hosting = createHostingModule({
    sessions: { redeem: async () => null, withPreviewRequest: async () => ({ kind: 'SIGN_IN_REQUIRED' }) },
    registry,
    applicationRunner: { invoke: async (input) => { runnerCalls.push(input); return { ok: true, result: { ok: true } } } },
    exactHubOrigin: HUB,
    previewPort: 3444,
    applicationHost: { sessions, application: APPLICATION },
  })
  const { app } = await testListener({ policy: hosting.applicationHost.policy, registerRoutes: (server) => hosting.applicationHost.registerRoutes(server) })
  t.after(() => app.close())
  return app
}

test('a ready Registry Preview never serves or invokes for an admitted employee, and revocation still refuses before readiness', async (t) => {
  const { connection, database, registry, seedBuilderProject, grant, point } = await world(t, 'conexus_host_preview_nonexposure')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  await grant(projectId)
  const revision = await seedRevision(connection, projectId, { sourceRevision: SOURCE_2, digest: DIGEST_2, payload: payloadOf([F, SERVER_MANIFEST]) })
  await point(projectId, revision, SOURCE_2, DIGEST_2)
  const runnerCalls = []
  const app = await hostOver(t, { registry, database, projectId, runnerCalls })
  const call = () => app.inject({
    method: 'POST', url: '/__conexus/api/addNote', cookies: { '__Host-conexus_app': TOKEN }, payload: {},
    headers: { host: HOST, 'content-type': 'application/json', origin: `https://${HOST}` },
  })
  const response = await call()
  assert.deepEqual([response.statusCode, response.json().code, runnerCalls], [503, 'APPLICATION_NOT_READY', []])
  for (const url of ['/', '/assets/app.js', '/orders/1']) {
    const page = await app.inject({ method: 'GET', url, headers: { host: HOST }, cookies: { '__Host-conexus_app': TOKEN } })
    assert.equal(page.statusCode, 503)
    assert.equal(page.body.includes('<html></html>'), false)
  }
  const forbidden = await app.inject({ method: 'GET', url: '/conexus-server/manifest.json', headers: { host: HOST }, cookies: { '__Host-conexus_app': TOKEN } })
  assert.equal(forbidden.statusCode, 404)
  await query(connection, 'UPDATE iam.application_grant SET revoked_at = now(), revoked_by = $2 WHERE project_id = $1', [projectId, ID.owner])
  const revoked = await call()
  assert.deepEqual([revoked.statusCode, revoked.json().code, runnerCalls], [404, 'APPLICATION_NOT_FOUND', []])
})
