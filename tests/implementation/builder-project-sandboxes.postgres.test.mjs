import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { setupBuilder } from './builder-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'

const { createConfiguredBuilderModule } = await import(hubModuleUrl('builder/module.js'))

const FACTORY_PASSWORD = 'factory-test-only'

async function openBuilderModule(t, prefix, killRecorded) {
  const fixture = await setupBuilder(t, prefix)
  const { connection, database } = fixture
  await query(connection, `ALTER ROLE hub_factory LOGIN PASSWORD '${FACTORY_PASSWORD}'`)
  const directory = mkdtempSync(resolve(tmpdir(), 'builder-sandboxes-'))
  fixture.onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const passwordFile = resolve(directory, 'factory-password')
  writeFileSync(passwordFile, FACTORY_PASSWORD)
  chmodSync(passwordFile, 0o600)
  const builder = createConfiguredBuilderModule({
    data: database,
    database: { host: connection.host, port: connection.port, database: connection.database },
    builder: { e2bApiKeyFile: resolve(directory, 'unused'), e2bTemplateId: 'unused', gitRoot: resolve(directory, 'git'), questionWaitMs: 1000, modelRetryDelayMs: undefined, sandboxIdleMs: 1000 },
    factory: { databasePasswordFile: passwordFile },
    models: { readDefault: async () => null },
    registry: {},
    readProjectName: async () => 'Atlas',
    conversationSandboxes: { killRecorded },
  })
  fixture.onCleanup(() => builder.close())
  return { ...fixture, builder }
}

const recordSandbox = (connection, projectId, providerSandboxId) =>
  query(connection, 'INSERT INTO builder.conversation_session(conversation_id, project_id, provider_sandbox_id) VALUES ($1, $2, $3)', [randomUUID(), projectId, providerSandboxId])

test('a recorded VM that survives the kill fails the kill step with BUILDER_SANDBOX_KILL_FAILED', async (t) => {
  const asked = []
  const { builder, connection, seedProject } = await openBuilderModule(t, 'conexus_project_sandboxes_refused', async (ids) => { asked.push([...ids]); return ids.filter((id) => id !== 'ivm-stuck') })
  const projectId = await seedProject('Atlas')
  await recordSandbox(connection, projectId, 'ivm-gone')
  await recordSandbox(connection, projectId, 'ivm-stuck')
  await assert.rejects(builder.killProjectSandboxes(projectId), { id: 'BUILDER_SANDBOX_KILL_FAILED' })
  assert.deepEqual(asked, [['ivm-gone', 'ivm-stuck']])
})

test('a Project whose recorded VMs were all killed, and a Project with none, pass the kill', async (t) => {
  const asked = []
  const { builder, connection, seedProject } = await openBuilderModule(t, 'conexus_project_sandboxes_killed', async (ids) => { asked.push([...ids]); return ids })
  const withVms = await seedProject('Atlas')
  const withNone = await seedProject('Empty')
  await recordSandbox(connection, withVms, 'ivm-one')
  await recordSandbox(connection, withVms, 'ivm-two')
  await builder.killProjectSandboxes(withVms)
  await builder.killProjectSandboxes(withNone)
  assert.deepEqual(asked, [['ivm-one', 'ivm-two'], []])
})
