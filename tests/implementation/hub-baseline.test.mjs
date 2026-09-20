import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { assertRoleInvariants, catalogDigest, describeCatalogDrift, readCommittedSnapshot } from '../../scripts/hub-catalog.mjs'
import { OWNER_ROLES, SUPERSEDED_ROLES, baselinePath, readLoginRoles, regenerateBaseline, resolvePgDump } from '../../scripts/generate-hub-baseline.mjs'
import { adminConnection, buildHubDatabase, catalogOf, withClient } from './hub-database.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const baselineSource = readFileSync(resolve(repositoryRoot, baselinePath), 'utf8')

test('the baseline names none of the roles or schemas the history left behind', () => {
  assert.equal(SUPERSEDED_ROLES.length, 18)
  for (const role of SUPERSEDED_ROLES) {
    assert.doesNotMatch(baselineSource, new RegExp(`\\b${role}\\b`), `baseline names the superseded role ${role}`)
  }
  for (const identifier of ['brn', 'con', 'mar', 'claude_connection']) {
    assert.doesNotMatch(baselineSource, new RegExp(`\\b${identifier}\\b`), `baseline names the superseded identifier ${identifier}`)
  }
})

// Roles are cluster-global, so a shared cluster already holds names an earlier database created and
// pg_roles cannot answer "what does a fresh install create". The file can, and it is the only
// writer of roles in the product.
test('the baseline creates exactly the register roles and the six owners', () => {
  const created = [...baselineSource.matchAll(/CREATE ROLE "([a-z0-9_]+)"/g)].map(([, role]) => role)
  assert.deepEqual([...created].sort(), [...readLoginRoles(), ...OWNER_ROLES].sort())
  assert.equal(created.length, 14)
})

test('a database built from the baseline and forward migrations is exactly the committed catalog', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_baseline')
  const snapshot = readCommittedSnapshot()
  const catalog = await catalogOf(connectionString)
  assert.equal(describeCatalogDrift(catalog, snapshot.catalog), null)
  assert.equal(catalogDigest(catalog), '7ebd7387b8c51cdbaa2f74c3c8adc70942f800976479d7b1b6ba8a51c9b83365')
})

test('a database built from the baseline satisfies the role and PUBLIC-execute invariants', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_baseline')
  await withClient(connectionString, assertRoleInvariants)
})

// The committed file is a fixed point of its own generator: applying it and dumping the result
// reproduces its bytes. That is what stops it drifting by hand.
test('the generator reproduces the committed baseline byte for byte', async () => {
  assert.equal(await regenerateBaseline(adminConnection()), baselineSource)
})

// A machine can hold several pg_dump versions, and PATH order is not the one that can read this
// server. A client too old is a named refusal that says what it found, never a silent wrong dump.
test('the generator refuses a pg_dump older than the server', () => {
  assert.throws(() => resolvePgDump(999), /BASELINE_PG_DUMP_UNAVAILABLE:need pg_dump 999 or newer; found/)
})
