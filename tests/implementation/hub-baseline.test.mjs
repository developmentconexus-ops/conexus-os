import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { assertRoleInvariants, catalogDigest, describeCatalogDrift, readCommittedSnapshot } from '../../scripts/hub-catalog.mjs'
import { SUPERSEDED_ROLES, baselinePath, regenerateBaseline, resolvePgDump } from '../../scripts/generate-hub-baseline.mjs'
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
const createdRoles = (source) => [...source.matchAll(/CREATE ROLE "([a-z0-9_]+)"/g)].map(([, role]) => role)

test('the baseline creates the eight login roles and six owners it was cut with, and a migration creates every register role', () => {
  const created = createdRoles(baselineSource)
  assert.deepEqual(created, [
    'hub_iam_runtime', 'hub_workspace_read', 'hub_workspace_command', 'hub_project_read', 'hub_project_command',
    'hub_model_connection', 'hub_builder_ingress', 'hub_builder_executor',
    'iam_owner', 'workspace_owner', 'project_owner', 'registry_owner', 'builder_owner', 'model_connection_owner',
  ])
  const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
  const forward = readdirSync(migrationsRoot).filter((name) => name.endsWith('.sql') && name !== '0001_baseline.sql').sort()
  const createdForward = forward.flatMap((name) => createdRoles(readFileSync(resolve(migrationsRoot, name), 'utf8')))
  assert.deepEqual(createdForward, ['hub_factory'])
  const register = JSON.parse(readFileSync(resolve(repositoryRoot, 'contracts/technical/hub-database-roles.json'), 'utf8')).roles
  for (const { role } of register) assert.ok([...created, ...createdForward].includes(role), `a migration creates the register role ${role}`)
})

test('a database built from the baseline and forward migrations is exactly the committed catalog', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_baseline')
  const snapshot = readCommittedSnapshot()
  const catalog = await catalogOf(connectionString)
  assert.equal(describeCatalogDrift(catalog, snapshot.catalog), null)
  // The digest a migration must acknowledge by hand is pinned once, in hub-migration-postgres,
  // which every machine can run. This suite needs pg_dump 17, so a second literal here went stale
  // unseen until CI.
  assert.equal(catalogDigest(catalog), catalogDigest(snapshot.catalog))
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
