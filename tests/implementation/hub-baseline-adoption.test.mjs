import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { catalogDigest, readCommittedSnapshot } from '../../scripts/hub-catalog.mjs'
import { adoptHubBaseline, baselineDigest, baselineVersion } from '../../scripts/run-hub-migrations.mjs'
import { catalogOf, createEmptyDatabase, query } from './hub-database.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')

// The history this baseline replaced, read out of git rather than committed as a fixture. This is
// the commit the baseline was generated from, and it is an ancestor of every branch that carries
// the baseline, so it is always reachable. The bytes are the ones the pilot actually applied,
// which a re-rendered dump would not be. This suite is deleted with the adopt path once the last
// installation has been adopted.
const historyCommit = '400b38866d9d43ab023ce0f028c2c468e20bb7ce'
const git = (...args) =>
  execFileSync('git', args, { cwd: repositoryRoot, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 64 * 1024 * 1024 })
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const historyCorpus = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-history-corpus-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const names = git('ls-tree', '--name-only', historyCommit, 'apps/hub/migrations/')
    .toString('utf8').split('\n')
    .map((path) => path.split('/').at(-1))
    .filter((name) => name?.endsWith('.sql'))
    .sort()
  for (const name of names) writeFileSync(resolve(root, name), git('show', `${historyCommit}:apps/hub/migrations/${name}`))
  return names.map((name) => ({ name, version: name.slice(0, 3), bytes: readFileSync(resolve(root, name)) }))
}

const buildHistoryDatabase = async (t, prefix = 'conexus_adopt') => {
  const fixture = await createEmptyDatabase(t, prefix)
  const files = historyCorpus(t)
  assert.equal(files.length, 57)
  assert.equal(files.at(-1).version, '059')
  for (const file of files) {
    await query(fixture.connectionString, file.bytes.toString('utf8'))
    await query(fixture.connectionString, 'INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', [file.version, sha256(file.bytes)])
  }
  return fixture
}

const plantPilotData = async (connectionString) => {
  await query(connectionString, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email)
    VALUES ('10000000-0000-4000-8000-000000000099', 'https://issuer.test', 'pilot', 'Pilot', 'pilot@example.test')
  `)
  await query(connectionString, `INSERT INTO workspace.workspace(workspace_id, name) VALUES ('20000000-0000-4000-8000-000000000099', 'Pilot Workspace')`)
}

const pilotDataIntact = async (connectionString) => (await query(connectionString, `
  SELECT (SELECT count(*)::integer FROM iam.account) AS accounts,
         (SELECT count(*)::integer FROM workspace.workspace) AS workspaces
`)).rows[0]

const ledgerOf = async (connectionString) =>
  (await query(connectionString, 'SELECT version, checksum_sha256 FROM iam.schema_migration ORDER BY version')).rows

test('a database on the replaced history is adopted onto the baseline without touching its data', async (t) => {
  const { connectionString } = await buildHistoryDatabase(t)
  await plantPilotData(connectionString)

  assert.deepEqual(await adoptHubBaseline({ connectionString }), { verdict: 'ADOPTED', from: '059', to: baselineVersion })
  assert.deepEqual(await ledgerOf(connectionString), [{ version: baselineVersion, checksum_sha256: baselineDigest }])
  assert.deepEqual(await pilotDataIntact(connectionString), { accounts: 1, workspaces: 1 })

  assert.equal(catalogDigest(await catalogOf(connectionString)), catalogDigest(readCommittedSnapshot().catalog))
})

test('adoption run a second time changes nothing', async (t) => {
  const { connectionString } = await buildHistoryDatabase(t)
  await adoptHubBaseline({ connectionString })
  const before = await ledgerOf(connectionString)
  assert.deepEqual(await adoptHubBaseline({ connectionString }), { verdict: 'ALREADY_ADOPTED', head: baselineVersion })
  assert.deepEqual(await ledgerOf(connectionString), before)
})

test('adoption interrupted after the revokes converges on a rerun', async (t) => {
  const { connectionString } = await buildHistoryDatabase(t)
  await query(connectionString, 'DROP OWNED BY brain_owner, connections_owner, claude_connection_owner')
  assert.equal((await ledgerOf(connectionString)).length, 57)
  assert.deepEqual(await adoptHubBaseline({ connectionString }), { verdict: 'ADOPTED', from: '059', to: baselineVersion })
  assert.deepEqual(await ledgerOf(connectionString), [{ version: baselineVersion, checksum_sha256: baselineDigest }])
})

test('adoption refuses a ledger that is not the full replaced history', async (t) => {
  const { connectionString } = await buildHistoryDatabase(t)
  await query(connectionString, `DELETE FROM iam.schema_migration WHERE version = '059'`)
  await assert.rejects(adoptHubBaseline({ connectionString }), /BASELINE_ADOPT_HEAD_REFUSED:56 rows, head 058/)
  assert.equal((await ledgerOf(connectionString)).length, 56)
})

test('adoption refuses a catalog that drifted and leaves the ledger alone', async (t) => {
  const { connectionString } = await buildHistoryDatabase(t)
  await query(connectionString, 'DROP FUNCTION iam.account_is_active(uuid) CASCADE')
  await assert.rejects(adoptHubBaseline({ connectionString }), /BASELINE_ADOPT_CATALOG_REFUSED:.*iam\.account_is_active/)
  assert.equal((await ledgerOf(connectionString)).length, 57)
})

test('adoption refuses a database with no ledger at all', async (t) => {
  const { connectionString } = await createEmptyDatabase(t, 'conexus_adopt')
  await assert.rejects(adoptHubBaseline({ connectionString }), /BASELINE_ADOPT_NO_LEDGER/)
})
