import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import { describeDrift, generateRegister, renderRegister } from '../../scripts/generate-hub-role-register.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const register = JSON.parse(readFileSync(resolve(repositoryRoot, 'contracts/technical/hub-database-roles.json'), 'utf8'))

const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/hub-role-register-build-'))
const result = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/platform/postgres.ts'), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (result.status !== 0) throw new Error(result.stdout || result.stderr)
const { capabilityFor, createPostgresPool } = await import(pathToFileURL(resolve(buildRoot, 'postgres.js')).href)

test.after(() => rm(buildRoot, { recursive: true, force: true }))

test('the register holds every role the Hub connects as, with the capability an operator reads', () => {
  assert.deepEqual(register.roles.map((row) => [row.role, row.capability]), [
    ['hub_iam_runtime', 'identity-and-access'],
    ['hub_s2_read', 'workspace-read'],
    ['hub_ws01_command', 'workspace-command'],
    ['hub_s3_read', 'project-read'],
    ['hub_prj03_command', 'project-command'],
    ['hub_r2_project_binding', 'project-binding'],
    ['hub_r2_brain_read', 'brain-read'],
    ['hub_r2_brain_attester', 'brain-attester'],
    ['hub_r2_key_conformance_subject', 'key-conformance-subject'],
    ['hub_r2_connections', 'connections'],
    ['hub_rb_ingress', 'builder-request'],
    ['hub_rb_executor', 'builder-run-execution'],
  ])
})

test('a connection labels itself with the capability the register gives its role', () => {
  assert.equal(capabilityFor('hub_rb_ingress'), 'builder-request')
  assert.equal(capabilityFor('hub_prj03_command'), 'project-command')
  assert.equal(capabilityFor('hub_r2_brain_attester'), 'brain-attester')
  assert.equal(capabilityFor('postgres'), 'postgres')
  assert.equal(capabilityFor(undefined), 'unlabelled')
})

test('every pool carries its capability into application_name', async () => {
  const pool = createPostgresPool({ host: '127.0.0.1', port: 1, database: 'unreachable', user: 'hub_rb_executor', password: 'unused' })
  assert.equal(pool.options.application_name, 'conexus-hub:builder-run-execution')
  await pool.end()
})

test('the generated module is the current projection of the register', async () => {
  const committed = await readFile(resolve(repositoryRoot, 'apps/hub/src/generated/hub-roles.ts'), 'utf8')
  assert.equal(committed, generateRegister())
})

test('every password file variable in the register is read by the Hub config', () => {
  const config = readFileSync(resolve(repositoryRoot, 'apps/hub/src/platform/config.ts'), 'utf8')
  for (const row of register.roles) {
    assert.ok(config.includes(row.passwordFileVariable), `${row.passwordFileVariable} is registered for ${row.role} but nothing in config.ts reads it`)
  }
})

test('every registered role is the user of a pool in the module the register names', () => {
  for (const row of register.roles) {
    const sources = row.connectsFrom.map((path) => readFileSync(resolve(repositoryRoot, path), 'utf8'))
    const expected = row.roleVariable ? `required(environment, '${row.roleVariable}')` : `user: '${row.role}'`
    const searched = row.roleVariable ? [readFileSync(resolve(repositoryRoot, 'apps/hub/src/platform/config.ts'), 'utf8')] : sources
    assert.ok(searched.some((source) => source.includes(expected)), `${row.role} is registered but no module the register names connects as it`)
  }
})

test('the register refuses a second role claiming one capability', () => {
  const roles = [...register.roles, { ...register.roles[0], role: 'hub_second_claimant', passwordFileVariable: 'CONEXUS_DB_SECOND_CLAIMANT_PASSWORD_FILE' }]
  assert.throws(() => renderRegister({ digest: 'unused', roles }), /ROLE_REGISTER_DUPLICATE_CAPABILITY/)
})

test('a drifted projection is reported by the role that drifted', () => {
  const rendered = generateRegister()
  assert.equal(describeDrift(rendered, rendered), null)
  const editedRow = rendered.replace('capability: "builder-run-execution"', 'capability: "builder-run-exec-DRIFT"')
  assert.equal(describeDrift(editedRow, rendered), 'apps/hub/src/generated/hub-roles.ts line 25, role hub_rb_executor')
  const editedLabel = rendered.replace('hub_prj03_command: "project-command"', 'hub_prj03_command: "project-DRIFT"')
  assert.equal(describeDrift(editedLabel, rendered), 'apps/hub/src/generated/hub-roles.ts line 33, role hub_prj03_command')
})

test('the register refuses a role with no module that connects as it', () => {
  const roles = [{ role: 'hub_orphan', capability: 'orphan', passwordFileVariable: 'CONEXUS_DB_ORPHAN_PASSWORD_FILE', connectsFrom: [] }]
  assert.throws(() => renderRegister({ digest: 'unused', roles }), /ROLE_REGISTER_CONNECTS_FROM_MISSING/)
})
