import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl as built } from './hub-build.mjs'
import { hubJsonWrite, opaque, testListener } from './access/test-listener.mjs'
import { query } from './hub-database.mjs'
import { setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'
import { completed, harness, projectId, conversationId } from './builder-run-harness.mjs'

const { createBuilderStore } = await import(built('builder/store.js'))
const { registerBuilderRoutes } = await import(built('builder/routes.js'))

const HUB = '0f000000-0000-4000-8000-000000000a01'
const SUSPENDED = { reason: 'suspended', userMessageId: 'user-message', toolCallId: 'c1' }
const TOKENS = { outsider: opaque('outsider'), removed: opaque('removed'), grantee: opaque('grantee') }
const CALLERS = { outsider: ID.outsider, removed: ID.member, grantee: ID.administrator }

test('sendBuilderMessage answers the same Project 404 to an outsider, a removed member and an application grantee while the run waits', async (t) => {
  const { connection, database, seedBuilderProject } = await setupBuilder(t, 'conexus_bld24_waiting')
  const store = createBuilderStore({ database, ownerId: HUB })
  const visible = await seedBuilderProject('Atlas')
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'atlas', $2)", [visible, ID.owner])
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [visible, ID.administrator, ID.owner])
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])

  const sessions = Object.fromEntries(Object.entries(TOKENS).map(([name, token]) => [token, { account: { accountId: CALLERS[name], displayName: name }, issuer: 'https://issuer.test', subject: name }]))
  let app
  const outcomes = []
  const afterEach = []
  const denied = async (service) => {
    for (const name of ['outsider', 'removed', 'grantee']) {
      const response = await app.inject({
        method: 'POST', url: `/api/control/projects/${projectId}/builder-session/messages`,
        headers: { ...hubJsonWrite, 'idempotency-key': randomUUID() }, cookies: { '__Host-conexus_session': TOKENS[name] },
        payload: { content: `intruso ${name}`, conversationId },
      })
      outcomes.push([name, response.statusCode, response.json().type])
      afterEach.push(service.pendingCalls(projectId, conversationId))
    }
    const taken = await service.sendBuilderMessage({ accountId: ID.owner, projectId, conversationId, idempotencyKey: randomUUID(), content: 'Use verde' })
    outcomes.push(['owner', taken.created])
  }
  let turns = 0
  const run = await harness(t, {
    admit: ({ accountId }) => store.admitBuilder({ accountId, projectId: visible }),
    answers: [denied],
    turn: async () => (turns++ === 0 ? SUSPENDED : completed()),
  })
  ;({ app } = await testListener({ sessions, registerRoutes: (instance) => registerBuilderRoutes(instance, { store: {}, service: run.service, session: {} }) }))
  t.after(() => app.close())
  await run.service.sendBuilderMessage({ accountId: ID.owner, projectId, conversationId, idempotencyKey: randomUUID(), content: 'Mostre' })
  await run.untilEnded()

  assert.deepEqual(outcomes, [
    ['outsider', 404, 'urn:conexus:problem:PROJECT_NOT_FOUND'],
    ['removed', 404, 'urn:conexus:problem:PROJECT_NOT_FOUND'],
    ['grantee', 404, 'urn:conexus:problem:PROJECT_NOT_FOUND'],
    ['owner', false],
  ])
  assert.deepEqual(afterEach, [['c1'], ['c1'], ['c1']], 'the question still waits after each refusal')
  assert.equal(run.events.filter((event) => event === 'turn').length, 2, 'only the owner message became a second turn: the refused ones reached no inbox')
})
