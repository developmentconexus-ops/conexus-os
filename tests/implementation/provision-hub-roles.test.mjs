import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { test } from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { censusRoles, provisionRoles, readRegister } from '../../scripts/provision-hub-roles.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every(name => process.env[name])

const secretFile = (root, name, value) => {
  const path = resolve(root, name)
  writeFileSync(path, `${value}\n`)
  chmodSync(path, 0o600)
  return path
}

test('a missing password file is reported without a write', async () => {
  const roles = readRegister(repositoryRoot).filter(row => row.role === 'hub_rb_executor')
  const rows = await censusRoles({ host: '127.0.0.1', port: 1, database: 'unreachable' }, {}, roles)
  assert.deepEqual(rows, [{ role: 'hub_rb_executor', capability: 'builder-run-execution', state: 'unconfigured' }])
})

test('the register every provisioning run reads is the one the Hub projects', () => {
  const roles = readRegister(repositoryRoot)
  assert.equal(roles.length, 12)
  assert.ok(roles.every(row => row.role.startsWith('hub_') && row.passwordFileVariable.startsWith('CONEXUS_DB_')))
})

test('provisioning repairs a role with no password and then writes nothing', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  await refuseProtectedCluster()
  const admin = { host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT), database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD }
  const database = `conexus_provision_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const ownerClient = new pg.Client(admin)
  await ownerClient.connect()
  await ownerClient.query(`CREATE DATABASE "${database}"`)

  const secretRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/provision-secret-'))
  t.after(async () => {
    rmSync(secretRoot, { recursive: true, force: true })
    await ownerClient.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await ownerClient.end()
  })

  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = admin.host
  connectionString.port = String(admin.port)
  connectionString.pathname = `/${database}`
  connectionString.username = admin.user
  connectionString.password = admin.password
  await runCurrentHubMigrations({ connectionString: connectionString.toString() })

  const executorPassword = `provision-executor-${randomUUID().slice(0, 8)}`
  const ingressPassword = `provision-ingress-${randomUUID().slice(0, 8)}`
  const environment = {
    CONEXUS_DB_HOST: admin.host,
    CONEXUS_DB_PORT: String(admin.port),
    CONEXUS_DB_NAME: database,
    CONEXUS_PROVISION_USER: admin.user,
    CONEXUS_PROVISION_PASSWORD_FILE: secretFile(secretRoot, 'provision-admin', admin.password),
    CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE: secretFile(secretRoot, 'db-rb-executor', executorPassword),
    CONEXUS_DB_RB_INGRESS_PASSWORD_FILE: secretFile(secretRoot, 'db-rb-ingress', ingressPassword),
  }
  const roles = readRegister(repositoryRoot).filter(row => row.role === 'hub_rb_executor' || row.role === 'hub_rb_ingress')
  const target = { host: admin.host, port: admin.port, database }

  const before = await censusRoles(target, environment, roles)
  assert.deepEqual(before.map(row => [row.role, row.state, row.sqlstate]), [
    ['hub_rb_ingress', 'invalid', '28P01'],
    ['hub_rb_executor', 'invalid', '28P01'],
  ])

  const first = await provisionRoles(target, environment, roles)
  assert.equal(first.verdict, 'REPAIRED')
  assert.deepEqual([...first.repaired].sort(), ['hub_rb_executor', 'hub_rb_ingress'])
  assert.deepEqual(first.invalid, [])

  const second = await provisionRoles(target, environment, roles)
  assert.deepEqual(second, { verdict: 'CURRENT', checked: 2, repaired: [], invalid: [], unconfigured: [], errors: [] })

  const executorClient = new pg.Client({ ...target, user: 'hub_rb_executor', password: executorPassword })
  await executorClient.connect()
  const { rows } = await executorClient.query('select current_user')
  assert.equal(rows[0].current_user, 'hub_rb_executor')
  await executorClient.end()
})

test('a password file with loose permissions is refused', async (t) => {
  const secretRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/provision-loose-'))
  t.after(() => rmSync(secretRoot, { recursive: true, force: true }))
  const path = resolve(secretRoot, 'db-rb-executor')
  writeFileSync(path, 'world-readable\n')
  chmodSync(path, 0o644)
  const roles = readRegister(repositoryRoot).filter(row => row.role === 'hub_rb_executor')
  await assert.rejects(
    censusRoles({ host: '127.0.0.1', port: 1, database: 'unreachable' }, { CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE: path }, roles),
    /SECRET_FILE_PERMISSIONS/,
  )
})
