import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const register = JSON.parse(readFileSync(resolve(repositoryRoot, 'contracts/technical/hub-database-roles.json'), 'utf8'))
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/connection-census-build-'))
const build = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/platform/connection-census.ts'), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (build.status !== 0) throw new Error(build.stdout || build.stderr)
const { censusConnections, reportConnectionCensus } = await import(pathToFileURL(resolve(buildRoot, 'connection-census.js')).href)

const secretRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/connection-census-secret-'))
const secretFile = resolve(secretRoot, 'db-builder-executor')
writeFileSync(secretFile, 'not-the-real-password\n')
chmodSync(secretFile, 0o600)

test.after(() => {
  rmSync(buildRoot, { recursive: true, force: true })
  rmSync(secretRoot, { recursive: true, force: true })
})

test('a Hub without the Factory configured leaves hub_factory out of the census instead of reporting it unconfigured', async () => {
  const rows = await censusConnections({ host: '127.0.0.1', port: 1, database: 'unreachable' }, {})
  assert.deepEqual(register.roles.filter(row => row.optional).map(row => row.role), ['hub_factory'])
  assert.equal(rows.some(row => row.role === 'hub_factory'), false)
})

test('a Hub with the Factory configured censuses hub_factory like any other role', async () => {
  const rows = await censusConnections(
    { host: '127.0.0.1', port: 1, database: 'unreachable' },
    { CONEXUS_DB_FACTORY_PASSWORD_FILE: secretFile },
  )
  const factory = rows.find(row => row.role === 'hub_factory')
  assert.equal(factory.state, 'unreachable')
  assert.equal(factory.capability, 'factory-storage')
})

test('a role with no password file is unconfigured, not invalid', async () => {
  const rows = await censusConnections({ host: '127.0.0.1', port: 1, database: 'unreachable' }, {})
  assert.equal(rows.length, register.roles.length - 1)
  assert.deepEqual([...new Set(rows.map(row => row.state))], ['unconfigured'])
  assert.deepEqual(rows[0], { role: 'hub_iam_runtime', capability: 'identity-and-access', state: 'unconfigured' })
})

test('a configured role the cluster refuses the connection to (not the credential) is unreachable, not invalid', async () => {
  const rows = await censusConnections(
    { host: '127.0.0.1', port: 1, database: 'unreachable' },
    { CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: secretFile },
  )
  const executor = rows.find(row => row.role === 'hub_builder_executor')
  assert.equal(executor.state, 'unreachable')
  assert.equal(executor.capability, 'builder-run-execution')
  assert.ok(executor.sqlstate === undefined || !/^28(P01|000)$/.test(executor.sqlstate))
})

test('an unreadable password file is reported as unreadable, without aborting the census', async () => {
  const unreadableRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/connection-census-unreadable-'))
  const emptyFile = resolve(unreadableRoot, 'db-builder-executor')
  writeFileSync(emptyFile, '')
  chmodSync(emptyFile, 0o600)
  try {
    const rows = await censusConnections(
      { host: '127.0.0.1', port: 1, database: 'unreachable' },
      { CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: emptyFile },
    )
    assert.equal(rows.length, register.roles.length - 1)
    const executor = rows.find(row => row.role === 'hub_builder_executor')
    assert.deepEqual(executor, { role: 'hub_builder_executor', capability: 'builder-run-execution', state: 'unreadable' })
  } finally {
    rmSync(unreadableRoot, { recursive: true, force: true })
  }
})

test('no census row carries the password it read', async () => {
  const rows = await censusConnections(
    { host: '127.0.0.1', port: 1, database: 'unreachable' },
    { CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: secretFile },
  )
  assert.doesNotMatch(JSON.stringify(rows), /not-the-real-password/)
})

test('the configured role name overrides the registered one for the main pool', async () => {
  const rows = await censusConnections({ host: '127.0.0.1', port: 1, database: 'unreachable' }, { CONEXUS_DB_USER: 'hub_iam_runtime_renamed' })
  assert.equal(rows[0].role, 'hub_iam_runtime_renamed')
})

test('the report names every unhealthy connection and counts the rest', () => {
  const lines = []
  reportConnectionCensus([
    { role: 'hub_iam_runtime', capability: 'identity-and-access', state: 'ok' },
    { role: 'hub_builder_ingress', capability: 'builder-request', state: 'invalid', sqlstate: '28P01' },
    { role: 'hub_project_read', capability: 'project-read', state: 'unreachable', sqlstate: 'ECONNREFUSED' },
    { role: 'hub_project_command', capability: 'project-command', state: 'unreadable' },
    { role: 'hub_workspace_read', capability: 'workspace-read', state: 'unconfigured' },
  ], line => lines.push(line))
  assert.deepEqual(lines, [
    'HUB_CONNECTION_CENSUS:ok=1:invalid=1:unreachable=1:unreadable=1:unconfigured=1\n',
    'HUB_CONNECTION_CENSUS:invalid:hub_builder_ingress:builder-request:28P01\n',
    'HUB_CONNECTION_CENSUS:unreachable:hub_project_read:project-read:ECONNREFUSED\n',
    'HUB_CONNECTION_CENSUS:unreadable:hub_project_command:project-command:\n',
    'HUB_CONNECTION_CENSUS:unconfigured:hub_workspace_read:workspace-read:\n',
  ])
})
