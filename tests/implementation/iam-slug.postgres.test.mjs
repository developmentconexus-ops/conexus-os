import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, withClient } from './hub-database.mjs'

const { parseApplicationSlug } = await import(hubModuleUrl('platform/application-slug.js'))

const SAMPLES = [
  'hub', 'www', 'api', 'auth', 'admin', 'keycloak', 'static', 'app', 'preview',
  'preview-x', 'a--b', 'a'.repeat(41), 'a'.repeat(40), '9estoque', 'estoque-parado', 'estoque-', 'Estoque', 'e', 'app-www',
]

test('ApplicationSlug and the CHECK on iam.application agree on every sample', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_iam_slug')
  const accepted = await withClient(connectionString, async (client) => {
    const accountId = randomUUID()
    await client.query("INSERT INTO iam.account (account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'slug', 'Slug')", [accountId])
    await client.query("INSERT INTO workspace.workspace (workspace_id, name) VALUES ($1, 'W')", [accountId])
    const verdicts = []
    for (const slug of SAMPLES) {
      const projectId = randomUUID()
      await client.query("INSERT INTO project.project (project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'P', 'NEW', $3, $4)", [projectId, accountId, 'a'.repeat(40), randomUUID()])
      const admitted = await client.query('INSERT INTO iam.application (project_id, slug, created_by) VALUES ($1, $2, $3)', [projectId, slug, accountId]).then(() => true, (error) => {
        if (error.code !== '23514') throw error
        return false
      })
      verdicts.push([slug, admitted])
    }
    return verdicts
  })
  assert.deepEqual(SAMPLES.map((slug) => [slug, parseApplicationSlug(slug) !== null]), accepted)
  assert.deepEqual(accepted.filter(([, admitted]) => admitted).map(([slug]) => slug), ['a'.repeat(40), 'estoque-parado', 'e', 'app-www'])
})
