import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
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
  resolve(repositoryRoot, 'apps/hub/src/platform/postgres.ts'), resolve(repositoryRoot, 'apps/hub/src/platform/config.ts'), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (result.status !== 0) throw new Error(result.stdout || result.stderr)
const { createPostgresPool } = await import(pathToFileURL(resolve(buildRoot, 'postgres.js')).href)
const { readHubConfig } = await import(pathToFileURL(resolve(buildRoot, 'config.js')).href)

test.after(() => rm(buildRoot, { recursive: true, force: true }))

test('the register holds every role the Hub connects as, with the capability an operator reads', () => {
  assert.deepEqual(register.roles.map((row) => [row.role, row.capability]), [
    ['hub_iam_runtime', 'identity-and-access'],
    ['hub_workspace_read', 'workspace-read'],
    ['hub_workspace_command', 'workspace-command'],
    ['hub_project_read', 'project-read'],
    ['hub_project_command', 'project-command'],
    ['hub_builder_ingress', 'builder-request'],
    ['hub_builder_executor', 'builder-run-execution'],
    ['hub_factory', 'factory-storage'],
    ['hub_model_account', 'model-account'],
  ])
})

test('a connection labels itself with the capability the register gives its role', async () => {
  const labels = []
  for (const role of ['hub_builder_ingress', 'hub_project_command', 'hub_workspace_read', 'postgres', undefined]) {
    const pool = createPostgresPool({ host: '127.0.0.1', port: 1, database: 'unreachable', user: role, password: 'unused' })
    labels.push(pool.options.application_name)
    await pool.end()
  }
  assert.deepEqual(labels, ['conexus-hub:builder-request', 'conexus-hub:project-command', 'conexus-hub:workspace-read', 'conexus-hub:postgres', 'conexus-hub:unlabelled'])
})

test('every pool carries its capability into application_name', async () => {
  const pool = createPostgresPool({ host: '127.0.0.1', port: 1, database: 'unreachable', user: 'hub_builder_executor', password: 'unused' })
  assert.equal(pool.options.application_name, 'conexus-hub:builder-run-execution')
  await pool.end()
})

test('the Hub config reads the password file and the role of every registered role from its variable', () => {
  const environment = {
    CONEXUS_ORIGIN: 'https://hub.conexus.localhost:3443',
    CONEXUS_BOOTSTRAP_SUBJECT: 'bootstrap-subject',
    CONEXUS_FACTORY_SECRET_KEY_FILE: '/secrets/key',
    CONEXUS_DB_HOST: 'db.internal',
    CONEXUS_DB_PORT: '5432',
    CONEXUS_DB_NAME: 'hub',
    CONEXUS_DB_USER: 'hub_iam_runtime',
    CONEXUS_BUILDER_E2B_API_KEY_FILE: '/secrets/e2b',
    CONEXUS_BUILDER_E2B_TEMPLATE_ID: 'template',
    CONEXUS_OIDC_ISSUER: 'https://issuer.example',
    CONEXUS_OIDC_CLIENT_ID: 'client',
    CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
    ...Object.fromEntries(register.roles.map((row) => [row.passwordFileVariable, `/secrets/${row.role}`])),
  }
  const config = readHubConfig(environment)
  assert.equal(config.database.user, 'hub_iam_runtime')
  assert.deepEqual(
    [config.database.passwordFile, config.database.workspace.readPasswordFile, config.database.workspace.commandPasswordFile,
      config.project.readPasswordFile, config.project.commandPasswordFile, config.builder.ingressPasswordFile,
      config.builder.executorPasswordFile, config.factory.databasePasswordFile, config.builder.modelAccountPasswordFile],
    register.roles.map((row) => `/secrets/${row.role}`),
  )
})

test('the register refuses a second role claiming one capability', () => {
  const roles = [...register.roles, { ...register.roles[0], role: 'hub_second_claimant', passwordFileVariable: 'CONEXUS_DB_SECOND_CLAIMANT_PASSWORD_FILE' }]
  assert.throws(() => renderRegister({ digest: 'unused', roles }), /ROLE_REGISTER_DUPLICATE_CAPABILITY/)
})

test('a drifted projection is reported by the role that drifted', () => {
  const rendered = generateRegister()
  assert.equal(describeDrift(rendered, rendered), null)
})

test('--check on a register edited after generation names the role that drifted, not the digest line', async () => {
  const stageRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/hub-role-register-check-'))
  try {
    const stagedContractDir = resolve(stageRoot, 'contracts/technical')
    const stagedGeneratedDir = resolve(stageRoot, 'apps/hub/src/platform')
    const stagedScriptDir = resolve(stageRoot, 'scripts')
    const { mkdir, writeFile, copyFile } = await import('node:fs/promises')
    await Promise.all([
      mkdir(stagedContractDir, { recursive: true }),
      mkdir(stagedGeneratedDir, { recursive: true }),
      mkdir(stagedScriptDir, { recursive: true }),
    ])
    const registerPath = resolve(stagedContractDir, 'hub-database-roles.json')
    const generatedPath = resolve(stagedGeneratedDir, 'hub-roles.generated.ts')
    const stagedScriptPath = resolve(stagedScriptDir, 'generate-hub-role-register.mjs')
    await copyFile(resolve(repositoryRoot, 'contracts/technical/hub-database-roles.json'), registerPath)
    await copyFile(resolve(repositoryRoot, 'scripts/generate-hub-role-register.mjs'), stagedScriptPath)
    await writeFile(generatedPath, generateRegister())

    const staged = JSON.parse(readFileSync(registerPath, 'utf8'))
    const target = staged.roles.find((row) => row.role === 'hub_builder_executor')
    target.capability = 'builder-run-exec-DRIFT'
    await writeFile(registerPath, JSON.stringify(staged, null, 2))

    const checkResult = spawnSync(process.execPath, [stagedScriptPath, '--check'], {
      cwd: stageRoot,
      encoding: 'utf8',
    })
    assert.notEqual(checkResult.status, 0)
    assert.match(checkResult.stderr, /hub_builder_executor/)
    assert.doesNotMatch(checkResult.stderr, /line 3\b/)
  } finally {
    await rm(stageRoot, { recursive: true, force: true })
  }
})

test('the register refuses a role with no module that connects as it', () => {
  const roles = [{ role: 'hub_orphan', capability: 'orphan', passwordFileVariable: 'CONEXUS_DB_ORPHAN_PASSWORD_FILE', connectsFrom: [] }]
  assert.throws(() => renderRegister({ digest: 'unused', roles }), /ROLE_REGISTER_CONNECTS_FROM_MISSING/)
})
