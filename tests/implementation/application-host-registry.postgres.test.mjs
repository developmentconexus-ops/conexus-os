import assert from 'node:assert/strict'
import { test } from 'node:test'
import { testListener } from './access/test-listener.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID } from './project-fixture.mjs'
import { DIGEST_2, F, P, SOURCE_2, deferred, fileOf, payloadOf, seedRevision, world } from './registry-fixture.mjs'

const { createHostingModule } = await import(hubModuleUrl('hosting/module.js'))

const HUB = 'https://hub.conexus.localhost:3443'
const APPLICATION = Object.freeze({ port: 3445, domain: 'conexus.localhost' })
const HOST = 'caderno-de-compras.conexus.localhost:3445'
const TOKEN = 't'.repeat(43)
const SERVER_MANIFEST = fileOf('conexus-server/manifest.json', 'application/json; charset=utf-8', '{}')

async function hostOver(t, { registry, projectId, runnerCalls }) {
  const caller = { accountId: ID.outsider, email: 'funcionaria@example.test', displayName: 'Funcionária' }
  const sessions = {
    applicationBySlug: async (slug) => (slug === 'caderno-de-compras' ? projectId : null),
    applicationAuthority: async ({ sessionToken }) => (sessionToken === TOKEN ? { kind: 'SIGNED_IN', accountId: caller.accountId, caller } : { kind: 'SIGN_IN_REQUIRED' }),
    redeem: async () => null,
    signOut: async () => undefined,
  }
  const hosting = createHostingModule({
    sessions: { redeem: async () => null, previewAuthority: async () => ({ kind: 'SIGN_IN_REQUIRED' }) },
    registry,
    applicationRunner: { invoke: async (input) => { runnerCalls.push(input); return { status: 200, body: { ok: true } } } },
    exactHubOrigin: HUB,
    previewPort: 3444,
    applicationHost: { sessions, application: APPLICATION },
  })
  const { app } = await testListener({ policy: hosting.applicationHost.policy, registerRoutes: (server) => hosting.applicationHost.registerRoutes(server) })
  t.after(() => app.close())
  return app
}

test('a grant revoked between the host manifest read and its pinned server file read answers 404 APPLICATION_NOT_FOUND and the runner receives nothing', async (t) => {
  const { connection, registry, seedBuilderProject, grant, point } = await world(t, 'conexus_host_revoke')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  await grant(projectId)
  const revision = await seedRevision(connection, projectId, { sourceRevision: SOURCE_2, digest: DIGEST_2, payload: payloadOf([F, SERVER_MANIFEST]) })
  await point(projectId, revision, SOURCE_2, DIGEST_2)

  const manifestRead = deferred()
  const revoked = deferred()
  const barrier = {
    ...registry,
    readServedManifest: async (accountId, id) => {
      const manifest = await registry.readServedManifest(accountId, id)
      manifestRead.resolve()
      await revoked.promise
      return manifest
    },
  }
  const runnerCalls = []
  const app = await hostOver(t, { registry: barrier, projectId, runnerCalls })
  const answering = app.inject({
    method: 'POST', url: '/__conexus/api/addNote', cookies: { '__Host-conexus_app': TOKEN }, payload: {},
    headers: { host: HOST, 'content-type': 'application/json', origin: `https://${HOST}` },
  })
  await manifestRead.promise
  await query(connection, 'UPDATE iam.application_grant SET revoked_at = now(), revoked_by = $2 WHERE project_id = $1', [projectId, ID.owner])
  revoked.resolve()
  const response = await answering
  assert.deepEqual([response.statusCode, response.json().code, runnerCalls.length], [404, 'APPLICATION_NOT_FOUND', 0])
})

test('the same request with the grant intact reaches the runner with the pinned server file', async (t) => {
  const { connection, registry, seedBuilderProject, grant, point } = await world(t, 'conexus_host_granted')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  await grant(projectId)
  const revision = await seedRevision(connection, projectId, { sourceRevision: SOURCE_2, digest: DIGEST_2, payload: payloadOf([F, SERVER_MANIFEST]) })
  await point(projectId, revision, SOURCE_2, DIGEST_2)
  const runnerCalls = []
  const app = await hostOver(t, { registry, projectId, runnerCalls })
  const response = await app.inject({
    method: 'POST', url: '/__conexus/api/addNote', cookies: { '__Host-conexus_app': TOKEN }, payload: {},
    headers: { host: HOST, 'content-type': 'application/json', origin: `https://${HOST}` },
  })
  assert.deepEqual([response.statusCode, runnerCalls.length, runnerCalls[0]?.files.map((file) => file.path)], [200, 1, ['conexus-server/manifest.json']])
})
