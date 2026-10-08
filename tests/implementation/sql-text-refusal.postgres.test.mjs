import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { sql } = await import(hubModuleUrl('platform/db.js'))
const { admitAccount } = await import(hubModuleUrl('identity-access/admission.js'))
const Value = z.object({ value: z.number() })

test('a closed read gate exposes queries only through an admitted proof', async (t) => {
  const { database } = await setupProjects(t, 'conexus_closed_read_gate')
  await database.read(ID.member, async (gate) => {
    assert.equal(gate.rows, undefined)
    assert.equal(gate.one, undefined)
    assert.equal(gate.maybe, undefined)
    const proof = await admitAccount(gate)
    assert.deepEqual(await proof.tx.rows(Value, sql`SELECT 1 AS value`), [{ value: 1 }])
  })
})

test('a read proof refuses write and row-lock statements before PostgreSQL sees them', async (t) => {
  const { database } = await setupProjects(t, 'conexus_read_statement_refusal')
  await database.read(ID.member, async (gate) => {
    const proof = await admitAccount(gate)
    await assert.rejects(proof.tx.maybe(Value, sql`UPDATE iam.account SET email = email WHERE account_id = ${ID.member} RETURNING 1 AS value`), { id: 'INTERNAL_UNEXPECTED' })
    await assert.rejects(proof.tx.maybe(Value, sql`SELECT 1 AS value FOR SHARE`), { id: 'INTERNAL_UNEXPECTED' })
    await assert.rejects(proof.tx.rows(Value, sql`SELECT 1 AS value; SELECT 2 AS value`), { id: 'INTERNAL_UNEXPECTED' })
  })
})

test('transactions remain non-nestable across read and command entries', async (t) => {
  const { database } = await setupProjects(t, 'conexus_non_nested_transaction')
  const nested = { id: 'INTERNAL_UNEXPECTED', details: { reason: 'NESTED_TRANSACTION' } }
  await assert.rejects(database.read(ID.member, () => database.read(ID.member, async () => 1)), nested)
  await assert.rejects(database.transaction(ID.member, () => database.read(ID.member, async () => 1)), nested)
  await assert.rejects(database.read(ID.member, () => database.transaction(ID.member, async () => 1)), nested)
  assert.equal(await database.read(ID.member, async () => 1), 1)
})
