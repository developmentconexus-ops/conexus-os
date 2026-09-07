import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const root = resolve(import.meta.dirname, '../..')
const admittedGit = process.env.CONEXUS_R2_P4_GIT_LIVE === 'true'
const databaseConfigured = ['HOST', 'PORT', 'NAME', 'USER', 'PASSWORD']
  .every((key) => process.env[`CONEXUS_TEST_DB_${key}`])
const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}
const connect = async (configuration) => {
  const client = new pg.Client(configuration)
  await client.connect()
  return client
}
const query = async (configuration, statement, values = []) => {
  const client = await connect(configuration)
  try { return await client.query(statement, values) } finally { await client.end() }
}
const compileHub = () => {
  const output = mkdtempSync(resolve(root, 'apps/hub/r2-p4-subject-composed-build-'))
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', output], { encoding: 'utf8' })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  return { output, built: (file) => pathToFileURL(resolve(output, file)).href }
}

const createSourceRepository = ({ storageRoot, projectId, manifest, binding }) => {
  const repository = resolve(storageRoot, 'projects', projectId)
  mkdirSync(repository, { recursive: true })
  const git = (args, input) => {
    const result = spawnSync('git', ['--git-dir', repository, ...args], {
      cwd: root, input, encoding: Buffer.isBuffer(input) ? null : 'utf8', env: {
        ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Conexus subject proof', GIT_AUTHOR_EMAIL: 'proof@conexus.invalid',
        GIT_COMMITTER_NAME: 'Conexus subject proof', GIT_COMMITTER_EMAIL: 'proof@conexus.invalid',
      },
    })
    assert.equal(result.status, 0, result.stderr?.toString() ?? '')
    return result.stdout.toString().trim()
  }
  git(['init', '--bare'])
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
  const realization = git(['hash-object', '-w', '--stdin'], canonicalBytes(manifest))
  const brain = git(['mktree'], `100644 blob ${realization}\trealization.json\n`)
  const declaration = git(['hash-object', '-w', '--stdin'], canonicalBytes(binding))
  const project = git(['mktree'], `100644 blob ${declaration}\tconnection-bindings.json\n`)
  const conexus = git(['mktree'], `040000 tree ${brain}\tbrain\n040000 tree ${project}\tproject\n`)
  const tree = git(['mktree'], `040000 tree ${conexus}\t.conexus\n`)
  const revision = git(['commit-tree', tree, '-m', 'R2-P4 composed subject proof'])
  git(['update-ref', 'refs/heads/main', revision])
  return { repository, revision }
}

test('R2-P4 composed production subject resolves trusted Project/Connections facts and refuses declaration drift', {
  skip: admittedGit && databaseConfigured ? false :
    'requires CONEXUS_R2_P4_GIT_LIVE=true and CONEXUS_TEST_DB_*',
  timeout: 900_000,
}, async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_p4_subject_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  const fresh = { ...admin, database }
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = fresh.host; connectionString.port = String(fresh.port)
  connectionString.pathname = `/${database}`; connectionString.username = fresh.user; connectionString.password = fresh.password
  const { output, built } = compileHub()
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p4-subject-composed-')
  let runtime
  t.after(async () => {
    await runtime?.end().catch(() => {})
    await query(admin, 'ALTER ROLE hub_r2_key_conformance_subject PASSWORD NULL').catch(() => {})
    await query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`).catch(() => {})
    rmSync(storageRoot, { recursive: true, force: true }); rmSync(output, { recursive: true, force: true })
  })
  await runR2HubMigrations({ connectionString: connectionString.toString() })

  const [{ createProjectSourceSnapshot }, { composeProjectSourceOwnership },
    { createProjectKeyConformanceBasisResolver }, { createSankhyaKeyConformanceSubjectResolver,
      sankhyaSourceScopeId }, { createRegisteredKeyConformance }] = await Promise.all([
    import(built('project/source-snapshot.js')), import(built('project/module.js')),
    import(built('project/key-conformance-basis.js')), import(built('gateway/module.js')),
    import(built('gateway/module.js')),
  ])
  const accountId = randomUUID(), workspaceId = randomUUID(), projectId = randomUUID()
  const connectionId = randomUUID(), revisionId = randomUUID(), qualificationId = randomUUID()
  const mappingDigest = 'b'.repeat(64)
  const manifest = { schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: ['budget'],
    mappings: [{ itemId: 'budget', queryId: 'budget.keys', mappingDigest }], sourceInputs: [] }
  const binding = { bindings: [{ connectionId, connectionRevisionId: revisionId,
    environment: 'SANDBOX', qualificationId }] }
  const source = createSourceRepository({ storageRoot, projectId, manifest, binding })
  const manifestDigest = sha256(canonicalBytes(manifest))
  const bindingDigest = sha256(canonicalBytes(binding))

  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', $2, 'Composed subject actor')`, [accountId, `subject-${accountId}`])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'Subject workspace'])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Subject project', 'EXISTING_GIT', $3, 'subject-v1')`, [projectId, workspaceId, source.revision])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, false)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage,
    can_bind_brain, can_use_connection) VALUES ($1, $2, true, true, true, true)`, [accountId, projectId])
  await query(fresh, `INSERT INTO con.connection(connection_id, owner_scope_kind, workspace_id, name,
    credential_generation, credential_generation_high_watermark) VALUES ($1, 'WORKSPACE', $2, 'Sankhya SANDBOX', 7, 7)`, [connectionId, workspaceId])
  await query(fresh, `INSERT INTO con.connection_revision(connection_revision_id, connection_id,
    connector_definition_id, connector_version, configuration, configuration_digest)
    VALUES ($1, $2, 'sankhya-om', '1.0.0', $3::jsonb, $4)`, [revisionId, connectionId,
    JSON.stringify({ environment: 'SANDBOX', companyCode: 1 }), 'c'.repeat(64)])
  await query(fresh, 'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1', [connectionId, revisionId])
  await query(fresh, `INSERT INTO con.connection_qualification(qualification_id, connection_id, connection_revision_id,
    credential_generation, environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at)
    VALUES ($1, $2, $3, 7, 'SANDBOX', 'COMPLETE', 'PASSED', '{}'::jsonb, ARRAY['controlled-local'], clock_timestamp())`,
  [qualificationId, connectionId, revisionId])
  await query(fresh, `INSERT INTO project.connection_binding(project_id, connection_id, connection_revision_id,
    qualification_id, environment, binding_digest, project_source_revision) VALUES ($1, $2, $3, $4, 'SANDBOX', $5, $6)`,
  [projectId, connectionId, revisionId, qualificationId, bindingDigest, source.revision])

  const password = `subject-${randomUUID()}`
  await query(admin, `ALTER ROLE hub_r2_key_conformance_subject PASSWORD '${password}'`)
  runtime = new pg.Pool({ ...fresh, user: 'hub_r2_key_conformance_subject', password, max: 2 })
  const ownership = composeProjectSourceOwnership({
    '.conexus/brain/realization.json': 'APP-OWNED',
    '.conexus/project/connection-bindings.json': 'PLATFORM-CONTRACT',
  })
  const sourceSnapshot = ({ projectId: inputProjectId, sourceRevision }) => createProjectSourceSnapshot({
    storageRoot, projectId: inputProjectId, sourceRevision, ownership,
  })
  const basis = createProjectKeyConformanceBasisResolver({ pool: runtime, sourceSnapshot })
  const resolveSubject = createSankhyaKeyConformanceSubjectResolver({ resolveBasis: basis })
  let observations = 0
  const registration = { queryId: 'budget.keys', queryVersion: '1', workspaceId, projectId,
    connectionId, environment: 'SANDBOX', datasetId: 'budget', grainId: 'budget-line', mappingDigest,
    observe: async ({ registrationDigest, subjectDigest, subject }) => {
      observations++
      assert.equal(subject.sourceRevision, source.revision)
      assert.equal(subject.inputDigest, manifestDigest)
      return { registrationDigest, subjectDigest, observationId: 'controlled-no-network-observation', complete: true,
        coherence: 'SINGLE_STATEMENT', totalRows: '1', nullKeyRows: '0', duplicateKeyGroups: '0' }
    } }
  const conformance = createRegisteredKeyConformance({ registrations: [registration], resolveSubject })
  const request = { accountId, projectId, queryId: registration.queryId,
    expectedSourceRevision: source.revision, expectedInputDigest: manifestDigest }
  const expectedMapping = { datasetId: 'budget', grainId: 'budget-line', mappingDigest }
  const result = await conformance.execute(request, expectedMapping)
  assert.equal(result.status, 'PROVEN'); assert.equal(result.outcome, 'PASS')
  assert.equal(observations, 1)
  assert.equal(result.subject.sourceScopeId, sankhyaSourceScopeId({ connectorDefinitionId: 'sankhya-om',
    connectorVersion: '1.0.0', connectionId, companyCode: 1, environment: 'SANDBOX' }))
  assert.equal('provider' in result, false); assert.equal('sankhya' in result, false)

  // A DB binding declaration that no longer matches the source becomes
  // indeterminate before observation; no provider or live Sankhya execution is involved.
  const driftQualificationId = randomUUID()
  await query(fresh, `INSERT INTO con.connection_qualification(qualification_id, connection_id, connection_revision_id,
    credential_generation, environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at)
    VALUES ($1, $2, $3, 7, 'SANDBOX', 'COMPLETE', 'PASSED', '{}'::jsonb, ARRAY['controlled-drift'], clock_timestamp() + interval '1 second')`,
  [driftQualificationId, connectionId, revisionId])
  await query(fresh, 'UPDATE project.connection_binding SET qualification_id = $1 WHERE project_id = $2 AND connection_id = $3',
    [driftQualificationId, projectId, connectionId])
  const drifted = await conformance.execute(request, expectedMapping)
  assert.equal(drifted.status, 'INDETERMINATE'); assert.equal(observations, 1)
})
