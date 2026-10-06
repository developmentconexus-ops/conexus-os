import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { FAILURE_STATUS, OPERATIONS } from '@conexus/contract'
import { hubModuleUrl } from './hub-build.mjs'
import { hubJsonWrite, opaque, testListener } from './access/test-listener.mjs'

const { routes } = await import(hubModuleUrl('http/access.js'))
const token = opaque('contract-malformed')
const UUID = '33333333-3333-4333-8333-333333333333'
const withParams = Object.values(OPERATIONS).filter((op) => op.params !== null)

const wellFormed = (schema) => (schema instanceof z.ZodEnum ? schema.options[0] : UUID)
const malformedValue = (schema) => (schema instanceof z.ZodEnum ? 'not-an-option' : 'not-a-uuid')
const urlOf = (op, values) => op.path.replace(/:(\w+)/g, (_match, name) => values[name])

const listener = async (t) => {
  const { app } = await testListener({
    sessions: { [token]: { account: { accountId: '11111111-1111-4111-8111-111111111111', displayName: 'Test' }, issuer: 'test', subject: 'test' } },
    registerRoutes: async (server) => {
      const declare = routes(server)
      for (const op of withParams) declare.operation(op, async () => { throw new Error('HANDLER_NOT_REACHED') })
      return withParams.map((op) => op.id)
    },
  })
  t.after(() => app.close())
  return app
}

test('a malformed value of each path param answers the code its operation names, before the handler', async (t) => {
  const app = await listener(t)
  assert.equal(withParams.length, 23)
  for (const op of withParams) {
    const good = Object.fromEntries(Object.entries(op.params.shape).map(([name, schema]) => [name, wellFormed(schema)]))
    for (const [name, schema] of Object.entries(op.params.shape)) {
      const code = op.malformed[name]
      assert.ok(Object.hasOwn(FAILURE_STATUS, code), `${op.id}.${name} names ${code}, which is not a failure code`)
      const response = await app.inject({
        method: op.method, url: urlOf(op, { ...good, [name]: malformedValue(schema) }),
        headers: op.method === 'GET' ? undefined : hubJsonWrite, cookies: { '__Host-conexus_session': token },
      })
      assert.deepEqual([response.statusCode, response.json().code], [FAILURE_STATUS[code], code], `${op.id}.${name}`)
    }
  }
})

test('a refused body field and a missing Idempotency-Key answer the codes the operation names', async (t) => {
  const app = await listener(t)
  const write = (op, values, payload, headers = {}) => app.inject({
    method: op.method, url: urlOf(op, values), headers: { ...hubJsonWrite, ...headers }, cookies: { '__Host-conexus_session': token }, payload,
  })
  const answer = async (response) => [response.statusCode, response.json().code]
  const credential = { clientId: 'id', clientSecret: 'secret', xToken: 'token' }
  const connection = { connectionId: UUID, connectorId: 'sankhya', label: 'ERP', credential }
  const connect = (payload) => write(OPERATIONS.createWorkspaceConnection, { workspaceId: UUID }, { ...connection, ...payload })
  assert.deepEqual(await answer(await connect({ label: '   ' })), [FAILURE_STATUS.CONNECTOR_LABEL_REFUSED, 'CONNECTOR_LABEL_REFUSED'])
  assert.deepEqual(await answer(await connect({ credential: {} })), [FAILURE_STATUS.CONNECTOR_CREDENTIAL_REFUSED, 'CONNECTOR_CREDENTIAL_REFUSED'])

  const send = (payload, headers) => write(OPERATIONS.sendBuilderMessage, { projectId: UUID }, payload, headers)
  const keyed = { 'idempotency-key': 'key-1' }
  assert.deepEqual(await answer(await send({ content: '   ', conversationId: UUID }, keyed)), [FAILURE_STATUS.BUILDER_MESSAGE_REFUSED, 'BUILDER_MESSAGE_REFUSED'])
  assert.deepEqual(await answer(await send({ content: 'oi', conversationId: 'not-a-uuid' }, keyed)), [FAILURE_STATUS.CONVERSATION_NOT_FOUND, 'CONVERSATION_NOT_FOUND'])
  assert.deepEqual(await answer(await send({ content: 'oi', conversationId: UUID })), [FAILURE_STATUS.IDEMPOTENCY_KEY_REQUIRED, 'IDEMPOTENCY_KEY_REQUIRED'])
  assert.deepEqual(await answer(await send({ content: 'oi', conversationId: UUID }, { 'idempotency-key': '' })), [FAILURE_STATUS.IDEMPOTENCY_KEY_REQUIRED, 'IDEMPOTENCY_KEY_REQUIRED'])
})
