import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONFIGURED_SUBJECT, captureLines, iamHub, person, problemOf } from './iam-fixture.mjs'

const BIA = '10000000-0000-4000-8000-000000000002'
const CAIO = '10000000-0000-4000-8000-000000000003'
const TWIN = '10000000-0000-4000-8000-000000000004'
const administrators = '/api/control/installation/administrators'

test('administrators: listed with how each became one, added by one active email, removed while another stays', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_administrators')
  const lines = captureLines(t)
  const founder = hub.sessionOf(await hub.signInWith(person(CONFIGURED_SUBJECT, { name: 'Leandro' })))
  const [{ account_id: leandro }] = await hub.sql('SELECT account_id FROM iam.account')
  await hub.seedAccount(BIA, { name: 'Bia', email: 'bia@x.com' })
  await hub.seedAccount(CAIO, { name: 'Caio', email: 'caio@x.com' })
  await hub.seedAccount(TWIN, { name: 'Caio 2', email: 'caio@x.com' })
  const bia = await hub.openHubSession(BIA)
  await hub.sql("INSERT INTO workspace.workspace (workspace_id, name) VALUES ('55555555-5555-4555-8555-555555555555', 'W')")
  await hub.sql("INSERT INTO iam.workspace_membership (account_id, workspace_id, role) VALUES ($1, '55555555-5555-4555-8555-555555555555', 'member')", [BIA])

  assert.equal((await hub.call(bia, 'GET', '/api/session')).json().administrator, false)
  assert.equal(problemOf(await hub.call(bia, 'GET', administrators)), '403 INSTALLATION_ADMINISTRATOR_REQUIRED')
  const listed = (await hub.call(founder, 'GET', administrators)).json().administrators
  assert.deepEqual(listed.map(({ grantedAt, ...entry }) => entry), [{ accountId: leandro, displayName: 'Leandro', grantedVia: 'OPERATOR_BOOTSTRAP' }])

  const add = (token, email, key) => hub.call(token, 'POST', administrators, { email }, { 'idempotency-key': key })
  assert.equal(problemOf(await add(founder, 'nobody@x.com', 'a1')), '404 ACCOUNT_NOT_FOUND')
  assert.equal(problemOf(await add(founder, 'caio@x.com', 'a2')), '409 ACCOUNT_EMAIL_AMBIGUOUS')
  const added = await add(founder, 'bia@x.com', 'a3')
  assert.equal(added.statusCode, 201)
  assert.deepEqual({ ...added.json(), grantedAt: undefined }, { accountId: BIA, displayName: 'Bia', email: 'bia@x.com', grantedVia: 'ADMINISTRATOR', grantedBy: { accountId: leandro, displayName: 'Leandro' }, grantedAt: undefined })
  assert.equal((await add(founder, 'bia@x.com', 'a3')).body, added.body)
  assert.equal(problemOf(await add(founder, 'caio@x.com', 'a3')), '409 IDEMPOTENCY_CONFLICT')
  assert.deepEqual(lines.of('INSTALLATION_ADMINISTRATOR_GRANTED').map((fields) => fields.grantedVia), ['OPERATOR_BOOTSTRAP', 'ADMINISTRATOR'])

  assert.equal(problemOf(await hub.call(founder, 'DELETE', `${administrators}/${CAIO}`)), '404 INSTALLATION_ADMINISTRATOR_NOT_FOUND')
  const removals = await Promise.all([hub.call(founder, 'DELETE', `${administrators}/${BIA}`), hub.call(bia, 'DELETE', `${administrators}/${leandro}`)])
  assert.deepEqual(removals.map((answer) => answer.statusCode).sort(), [204, 403])
  const remaining = (await hub.sql('SELECT account_id FROM iam.installation_administrator WHERE revoked_at IS NULL')).map((row) => row.account_id)
  assert.equal(remaining.length, 1)
  const survivor = remaining[0] === leandro ? founder : bia
  assert.equal(problemOf(await hub.call(survivor, 'DELETE', `${administrators}/${remaining[0]}`)), '409 LAST_INSTALLATION_ADMINISTRATOR')
  const removed = survivor === founder ? bia : founder
  assert.equal(problemOf(await add(removed, 'caio@x.com', 'a9')), '403 INSTALLATION_ADMINISTRATOR_REQUIRED')
  assert.equal(lines.of('INSTALLATION_ADMINISTRATOR_REVOKED').length, 1)
})

test('two administrators each stepping down at once: one 204, one 409', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_administrators_race')
  const founder = hub.sessionOf(await hub.signInWith(person(CONFIGURED_SUBJECT, { name: 'Leandro' })))
  const [{ account_id: leandro }] = await hub.sql('SELECT account_id FROM iam.account')
  await hub.seedAccount(BIA, { name: 'Bia', email: 'bia@x.com' })
  await hub.sql("INSERT INTO iam.installation_administrator (account_id, granted_via, granted_by) VALUES ($1, 'ADMINISTRATOR', $2)", [BIA, leandro])
  const bia = await hub.openHubSession(BIA)
  const answers = await Promise.all([hub.call(founder, 'DELETE', `${administrators}/${leandro}`), hub.call(bia, 'DELETE', `${administrators}/${BIA}`)])
  assert.deepEqual(answers.map((answer) => answer.statusCode).sort(), [204, 409])
})
