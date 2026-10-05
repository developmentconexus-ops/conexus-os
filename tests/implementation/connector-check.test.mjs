import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createConnectionCheck } = await import(hubModuleUrl('connectors/module.js'))

const input = { accountId: '10000000-0000-4000-8000-000000000004', workspaceId: '20000000-0000-4000-8000-000000000001', connectionId: '33333333-3333-4333-8333-333333333333' }

const outcomeOf = ({ result }) => {
  const seen = []
  const store = { readCredentialForCheck: async () => ({ connectorId: 'sankhya', sealed: 'sealed-value' }) }
  const broker = { checkCredential: async (connectorId, sealed) => { seen.push([connectorId, sealed]); return result } }
  return createConnectionCheck({ store, broker })(input).then((outcome) => ({ outcome, seen }))
}

test('each broker answer of the authentication check becomes one literal outcome', async () => {
  const cases = [
    [{ ok: true }, 'OK'],
    [{ ok: false, code: 'CREDENTIAL_REFUSED' }, 'CREDENTIAL_REFUSED'],
    [{ ok: false, code: 'CONNECTOR_UNCONFIGURED' }, 'CONNECTOR_UNCONFIGURED'],
    [{ ok: false, code: 'PROVIDER_TIMEOUT' }, 'PROVIDER_TIMEOUT'],
    [{ ok: false, code: 'PROVIDER_UNAVAILABLE' }, 'PROVIDER_UNAVAILABLE'],
    [{ ok: false, code: 'PROVIDER_ERROR' }, 'PROVIDER_ERROR'],
    [{ ok: false, code: 'RESPONSE_REFUSED' }, 'PROVIDER_ERROR'],
  ]
  for (const [result, expected] of cases) {
    assert.deepEqual(await outcomeOf({ result }), { outcome: expected, seen: [['sankhya', 'sealed-value']] }, JSON.stringify(result))
  }
})

test('a platform failure is a 500 Failure, and every code that is no provider outcome is the same', async () => {
  for (const code of ['CONNECTOR_PLATFORM_FAILED', 'NOT_GRANTED', 'CALL_LIMIT']) {
    await assert.rejects(outcomeOf({ result: { ok: false, code } }), { id: 'CONNECTOR_PLATFORM_FAILED' }, code)
  }
})
