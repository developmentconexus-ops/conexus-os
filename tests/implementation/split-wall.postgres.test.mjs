import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { loginPoolOf, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { admitAccount, admitInstallationAdministrator, admitWorkspace } = await import(hubModuleUrl('identity-access/admission.js'))
const { sql } = await import(hubModuleUrl('platform/db.js'))

test('the Hub catalog has no row policies or enabled row security, and the old roles are gone', async (t) => {
  const { connection } = await setupProjects(t, 'conexus_hub_authority_catalog')
  const catalog = await query(connection, `SELECT
    (SELECT count(*)::integer FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('builder','connector','iam','model','platform','project','reg','workspace')) AS policies,
    (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','p') AND c.relrowsecurity AND n.nspname IN ('builder','connector','iam','model','platform','project','reg','workspace')) AS row_security,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY(ARRAY['hub_reader','hub_command','iam_rls','hub_builder_ingress'])) AS retired_roles`)
  assert.deepEqual(catalog.rows, [{ policies: 0, row_security: 0, retired_roles: 0 }])
})

test('hub_runtime can read native rows directly, while business reads require an admitted scope', async (t) => {
  const { database, seedProject } = await setupProjects(t, 'conexus_hub_authority_runtime')
  const projectA = await seedProject('Atlas', ID.workspace)
  const projectB = await seedProject('Elsewhere', ID.otherWorkspace)
  const runtime = await loginPoolOf(database)
  assert.deepEqual((await runtime.query('SELECT project_id FROM project.project ORDER BY project_id')).rows.map((row) => row.project_id).sort(), [projectA, projectB].sort())

  await database.read(ID.member, async (gate) => {
    const proof = await admitWorkspace(gate, { workspaceId: ID.workspace, action: 'workspace.read' })
    assert.deepEqual(await proof.tx.rows(z.object({ project_id: z.string() }),
      sql`SELECT project_id FROM project.project WHERE workspace_id = ${proof.scope.workspaceId}`), [{ project_id: projectA }])
  })
})

test('only the definer lock can take the administrator-set table lock, and a read proof refuses mutation', async (t) => {
  const { database } = await setupProjects(t, 'conexus_hub_authority_lock')
  const runtime = await loginPoolOf(database)
  const client = await runtime.connect()
  try {
    await client.query('BEGIN')
    await assert.rejects(client.query('LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE'), { code: '42501' })
    await client.query('ROLLBACK')
  } finally {
    client.release()
  }
  await database.transaction(ID.administrator, (gate) => admitInstallationAdministrator(gate, { action: 'administrators.manage' }))
  await assert.rejects(database.read(ID.member, async (gate) => {
    const proof = await admitAccount(gate)
    return proof.tx.maybe(z.object({ present: z.literal(1) }), sql`UPDATE iam.account SET email = email WHERE account_id = ${ID.member} RETURNING 1 AS present`)
  }), { id: 'INTERNAL_UNEXPECTED' })
})
