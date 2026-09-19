import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/connection-census-build-'))
const build = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/platform/connection-census.ts'), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (build.status !== 0) throw new Error(build.stdout || build.stderr)
const { censusConnections, reportConnectionCensus } = await import(pathToFileURL(resolve(buildRoot, 'connection-census.js')).href)
const registeredRoleCount = JSON.parse(readFileSync(resolve(repositoryRoot, 'contracts/technical/hub-database-roles.json'), 'utf8')).roles.length

const secretRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/connection-census-secret-'))
const secretFile = resolve(secretRoot, 'db-rb-executor')
writeFileSync(secretFile, 'not-the-real-password\n')
chmodSync(secretFile, 0o600)

test.after(() => {
  rmSync(buildRoot, { recursive: true, force: true })
  rmSync(secretRoot, { recursive: true, force: true })
})

test('a role with no password file is unconfigured, not invalid', async () => {
  const rows = await censusConnections({ host: '127.0.0.1', port: 1, database: 'unreachable' }, {})
  assert.equal(rows.length, registeredRoleCount)
  assert.deepEqual([...new Set(rows.map(row => row.state))], ['unconfigured'])
  assert.deepEqual(rows[0], { role: 'hub_iam_runtime', capability: 'identity-and-access', state: 'unconfigured' })
})

test('a configured role the cluster refuses is invalid and carries its SQLSTATE', async () => {
  const rows = await censusConnections(
    { host: '127.0.0.1', port: 1, database: 'unreachable' },
    { CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE: secretFile },
  )
  const executor = rows.find(row => row.role === 'hub_rb_executor')
  assert.equal(executor.state, 'invalid')
  assert.equal(executor.capability, 'builder-run-execution')
  assert.ok(executor.sqlstate)
})

test('no census row carries the password it read', async () => {
  const rows = await censusConnections(
    { host: '127.0.0.1', port: 1, database: 'unreachable' },
    { CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE: secretFile },
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
    { role: 'hub_rb_ingress', capability: 'builder-request', state: 'invalid', sqlstate: '28P01' },
    { role: 'hub_r2_connections', capability: 'connections', state: 'unconfigured' },
  ], line => lines.push(line))
  assert.deepEqual(lines, [
    'HUB_CONNECTION_CENSUS:ok=1:invalid=1:unconfigured=1\n',
    'HUB_CONNECTION_CENSUS:invalid:hub_rb_ingress:builder-request:28P01\n',
    'HUB_CONNECTION_CENSUS:unconfigured:hub_r2_connections:connections:\n',
  ])
})
