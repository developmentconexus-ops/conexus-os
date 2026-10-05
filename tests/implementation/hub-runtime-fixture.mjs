import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, givePasswordToHubRuntime, query } from './hub-database.mjs'

const { openDatabase } = await import(hubModuleUrl('platform/db.js'))

const PASSWORD = 'hub-runtime-fixture-test-only'

// A migrated database with a Hub `Database` connected as hub_runtime, as the Hub connects.
export const openRuntimeFixture = async (t, prefix, { max = 3, accounts = [] } = {}) => {
  const fixture = await buildHubDatabase(t, prefix)
  await givePasswordToHubRuntime(fixture.connection, fixture.onCleanup, PASSWORD)
  const directory = mkdtempSync(resolve(tmpdir(), 'hub-runtime-'))
  fixture.onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const passwordFile = resolve(directory, 'password')
  writeFileSync(passwordFile, PASSWORD)
  chmodSync(passwordFile, 0o600)
  const database = openDatabase({ host: fixture.connection.host, port: fixture.connection.port, database: fixture.database, user: 'hub_runtime', passwordFile, max })
  fixture.onCleanup(() => database.close())
  for (const [accountId, subject] of accounts) {
    await query(fixture.connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', $2, $2)", [accountId, subject])
  }
  return { ...fixture, database, runtime: { ...fixture.connection, user: 'hub_runtime', password: PASSWORD } }
}
