import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const admittedGit = process.env.CONEXUS_R2_P4_GIT_LIVE === 'true'
const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])

const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}

const query = async (connection, statement, values = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}

const compileHub = () => {
  const outputRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-brain-composed-build-'))
  const result = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', outputRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    rmSync(outputRoot, { recursive: true, force: true })
    throw new Error(`R2_P4_BRAIN_COMPOSED_HUB_COMPILE_FAILED\n${result.stdout}\n${result.stderr}`)
  }
  return { outputRoot, built: (path) => pathToFileURL(resolve(outputRoot, path)).href }
}

const createSourceRepository = ({ storageRoot, projectId, manifest, connectionDeclaration }) => {
  const repository = resolve(storageRoot, 'projects', projectId)
  mkdirSync(repository, { recursive: true })
  const git = (args, input) => {
    const result = spawnSync('git', ['--git-dir', repository, ...args], {
      cwd: repositoryRoot, input, encoding: Buffer.isBuffer(input) ? null : 'utf8', env: {
        ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Conexus composed proof', GIT_AUTHOR_EMAIL: 'proof@conexus.invalid',
        GIT_COMMITTER_NAME: 'Conexus composed proof', GIT_COMMITTER_EMAIL: 'proof@conexus.invalid',
      },
    })
    assert.equal(result.status, 0, result.stderr?.toString() ?? '')
    return result.stdout.toString().trim()
  }
  git(['init', '--bare'])
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
  const manifestBlob = git(['hash-object', '-w', '--stdin'], canonicalBytes(manifest))
  const brainTree = git(['mktree'], `100644 blob ${manifestBlob}\trealization.json\n`)
  const connectionBlob = git(['hash-object', '-w', '--stdin'], canonicalBytes(connectionDeclaration))
  const projectTree = git(['mktree'], `100644 blob ${connectionBlob}\tconnection-bindings.json\n`)
  const conexusTree = git(['mktree'], `040000 tree ${brainTree}\tbrain\n040000 tree ${projectTree}\tproject\n`)
  const rootTree = git(['mktree'], `040000 tree ${conexusTree}\t.conexus\n`)
  const sourceRevision = git(['commit-tree', rootTree, '-m', 'Admitted composed proof source'])
  git(['update-ref', 'refs/heads/main', sourceRevision])
  return { repository, sourceRevision }
}

const brainSource = (label) => ({
  schemaVersion: 'conexus-brain/v2',
  reviewText: `Reviewed ${label} meaning.`,
  knowledgeBrowse: { domains: [{
    domainRef: 'finance', label: 'Finance', concepts: [{
      conceptRef: 'budget.amount', label, summary: `${label} for one budget line.`,
      contentClasses: ['SEMANTIC'], sections: [{ kind: 'DEFINITION', text: `${label} definition.` }],
      provenanceRefs: [`brain://proof/${label.toLowerCase().replaceAll(' ', '-')}`], itemRef: 'budget',
    }],
  }] },
  items: [{ itemId: 'budget', kind: 'SEMANTIC', dependsOn: [] }],
  assertions: [],
})

const manifest = {
  schemaVersion: 'conexus-project-brain-realization/v1',
  selectedRoots: ['budget'], mappings: [], sourceInputs: [],
}

const digestOf = (value) => sha256(canonicalBytes(value))

const proofCandidate = ({ workspaceId, projectId, connectionId, connectionRevisionId,
  qualificationId, brainRevisionId, brainDigest, sourceRevision }) => {
  const inputDigest = 'd'.repeat(64)
  const registration = {
    queryId: 'composed-budget-keys', queryVersion: '1', workspaceId, projectId,
    connectionId, environment: 'SANDBOX', datasetId: 'budget', grainId: 'budget-line',
    mappingDigest: 'e'.repeat(64),
  }
  const subject = {
    workspaceId, projectId, connectionId, connectionRevisionId, qualificationId,
    credentialGeneration: '1', environment: 'SANDBOX', sourceScopeId: '8'.repeat(64),
    sourceRevision, inputDigest,
  }
  const registrationDigest = digestOf(registration)
  const subjectDigest = digestOf(subject)
  const counts = { totalRows: '1', nullKeyRows: '0', duplicateKeyGroups: '0' }
  const proofDigest = digestOf({
    registrationDigest, subjectDigest, observationId: 'composed-budget-observation',
    coherence: 'SINGLE_STATEMENT', ...counts, outcome: 'PASS',
  })
  return {
    schemaVersion: 'conexus-brain-binding-validation/v1', validationState: 'VALID',
    projectId, workspaceId, brainRevisionId, brainDigest, sourceRevision, inputDigest,
    manifestDigest: 'c'.repeat(64), applicableItemIds: ['budget'], proofs: [{
      assertionId: 'budget-keys', itemId: 'budget', predicateVersion: '1', outcome: 'PASS',
      registration, registrationDigest, subject, subjectDigest,
      observationId: 'composed-budget-observation', coherence: 'SINGLE_STATEMENT',
      counts, empty: false, proofDigest,
    }],
  }
}

const assertedBrainSource = (label) => ({
  schemaVersion: 'conexus-brain/v2', reviewText: `Reviewed ${label} meaning.`,
  knowledgeBrowse: { domains: [] },
  items: [{ itemId: 'budget', kind: 'DATASET', grainId: 'budget-line', dependsOn: [] }],
  assertions: [{
    assertionId: 'budget-keys', itemId: 'budget', kind: 'KEY_CONFORMANCE',
    predicateVersion: '1', scope: 'SELECTED',
  }],
})

test('R2-P4 composed BRAIN store proves replacement, revocation, restart and qualification-drift recovery', {
  skip: admittedGit && databaseConfigured ? false :
    'requires CONEXUS_R2_P4_GIT_LIVE=true and real PostgreSQL configuration',
  timeout: 900_000,
}, async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_p4_brain_composed_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  const fresh = { ...admin, database }
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = fresh.host
  connectionString.port = String(fresh.port)
  connectionString.pathname = `/${database}`
  connectionString.username = fresh.user
  connectionString.password = fresh.password
  const { outputRoot, built } = compileHub()
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p4-brain-composed-')
  const pools = []
  const passwords = new Map()
  t.after(async () => {
    for (const pool of pools) await pool.end().catch(() => {})
    for (const role of passwords.keys()) await query(admin, `ALTER ROLE ${role} PASSWORD NULL`).catch(() => {})
    await query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`).catch(() => {})
    rmSync(storageRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  })

  await runR2HubMigrations({ connectionString: connectionString.toString() })
  const [{ createProjectBrainBindingStore, projectBrainBindingRepresentationDigest },
    { createProjectBrainBindingDatabasePorts }, { createProjectBindingRecovery },
    { createOciProjectBindingGitCapability },
    { createProjectSourceSnapshot }, { composeProjectSourceOwnership, createProjectBrainRealizationPort },
    { createBrainBindingValidator }, { createProjectBrainContextBasisPort },
    { createProjectBrainContextResolver }] = await Promise.all([
    import(built('project/brain-binding.js')),
    import(built('project/brain-binding-postgres.js')),
    import(built('project/binding-recovery.js')),
    import(built('project/git-execution.js')),
    import(built('project/source-snapshot.js')),
    import(built('project/module.js')),
    import(built('brain/binding-validation.js')),
    import(built('brain/context-store.js')),
    import(built('brain/context.js')),
  ])

  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const artifactId = randomUUID()
  const connectionId = randomUUID()
  const connectionRevisionId = randomUUID()
  const qualificationId = randomUUID()
  const firstRevisionId = randomUUID()
  const secondRevisionId = randomUUID()
  const thirdRevisionId = randomUUID()
  const restartRevisionId = randomUUID()
  const staleQualificationRevisionId = randomUUID()
  const connectionDeclaration = { bindings: [{
    connectionId, connectionRevisionId, environment: 'SANDBOX', qualificationId,
  }] }
  const source = createSourceRepository({ storageRoot, projectId, manifest, connectionDeclaration })
  const revisions = [
    { id: firstRevisionId, digest: '1'.repeat(64), source: brainSource('Budget amount v1') },
    { id: secondRevisionId, digest: '2'.repeat(64), source: brainSource('Budget amount v2') },
    { id: thirdRevisionId, digest: '3'.repeat(64), source: brainSource('Budget amount v3') },
    { id: restartRevisionId, digest: '4'.repeat(64), source: assertedBrainSource('Budget amount restart') },
    { id: staleQualificationRevisionId, digest: '5'.repeat(64), source: assertedBrainSource('Budget amount stale') },
  ]

  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', $2, 'Composed Brain actor')
  `, [accountId, `composed-${accountId}`])
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Composed Brain workspace')`, [workspaceId])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project, can_read_brain)
    VALUES ($1, $2, false, true)
  `, [accountId, workspaceId])
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Composed Brain Project', 'EXISTING_GIT', $3, 'composed-project')
  `, [projectId, workspaceId, source.sourceRevision])
  await query(fresh, `
    INSERT INTO iam.account_project_grant(
      account_id, project_id, can_read, can_manage, can_bind_brain, can_use_connection
    ) VALUES ($1, $2, true, true, true, true)
  `, [accountId, projectId])
  const connectionConfiguration = { environment: 'SANDBOX', companyCode: 1 }
  await query(fresh, `
    INSERT INTO con.connection(
      connection_id, owner_scope_kind, workspace_id, name,
      credential_generation, credential_generation_high_watermark
    ) VALUES ($1, 'WORKSPACE', $2, 'Composed Brain connection', 1, 1)
  `, [connectionId, workspaceId])
  await query(fresh, `
    INSERT INTO con.connection_revision(
      connection_revision_id, connection_id, connector_definition_id,
      connector_version, configuration, configuration_digest
    ) VALUES ($1, $2, 'composed-fixture', '1.0.0', $3::jsonb, $4)
  `, [connectionRevisionId, connectionId, JSON.stringify(connectionConfiguration), digestOf(connectionConfiguration)])
  await query(fresh, 'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1',
    [connectionId, connectionRevisionId])
  await query(fresh, `
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id, credential_generation,
      environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4::jsonb,
      ARRAY['fixture:r2-p4-brain-composed'], clock_timestamp())
  `, [qualificationId, connectionId, connectionRevisionId,
    JSON.stringify({ title: 'Composed qualification', message: 'Controlled fixture; no provider claim.' })])
  await query(fresh, `
    INSERT INTO project.connection_binding(
      project_id, connection_id, connection_revision_id, qualification_id,
      environment, binding_digest, project_source_revision
    ) VALUES ($1, $2, $3, $4, 'SANDBOX', $5, $6)
  `, [projectId, connectionId, connectionRevisionId, qualificationId,
    digestOf({ connectionId, connectionRevisionId, qualificationId, environment: 'SANDBOX' }),
    source.sourceRevision])
  await query(fresh, `
    INSERT INTO reg.artifact(artifact_id, workspace_id, kind, semantic_name)
    VALUES ($1, $2, 'brain', 'Composed Brain')
  `, [artifactId, workspaceId])
  for (const [index, revision] of revisions.entries()) {
    await query(fresh, `
      INSERT INTO reg.artifact_revision(
        artifact_revision_id, artifact_id, source_revision, digest, payload, availability
      ) VALUES ($1, $2, $3, $4, $5::jsonb, 'AVAILABLE')
    `, [revision.id, artifactId, String(index + 4).repeat(40), revision.digest, JSON.stringify(revision.source)])
  }
  await query(fresh, 'UPDATE reg.artifact SET published_revision_id = $2 WHERE artifact_id = $1',
    [artifactId, firstRevisionId])

  for (const role of ['hub_r2_project_binding', 'hub_r2_brain_attester', 'hub_r2_brain_read']) {
    const password = `${role}-${randomUUID()}`
    passwords.set(role, password)
    await query(fresh, `ALTER ROLE ${role} PASSWORD '${password}'`)
  }
  const bindingPool = new pg.Pool({ ...fresh, user: 'hub_r2_project_binding', password: passwords.get('hub_r2_project_binding') })
  const attesterPool = new pg.Pool({ ...fresh, user: 'hub_r2_brain_attester', password: passwords.get('hub_r2_brain_attester') })
  const brainReadPool = new pg.Pool({ ...fresh, user: 'hub_r2_brain_read', password: passwords.get('hub_r2_brain_read') })
  pools.push(bindingPool, attesterPool, brainReadPool)
  for (const revision of revisions) {
    await query(fresh, 'SELECT brn.bootstrap_brain_health($1,$2,$3,$4::jsonb)', [
      sha256(canonicalBytes({ revision: revision.id, state: 'VALID' })), revision.id, revision.digest,
      JSON.stringify([{ semanticRef: 'budget', state: 'VALID', critical: true }]),
    ])
  }

  const ownership = composeProjectSourceOwnership({ '.conexus/brain/realization.json': 'APP-OWNED' })
  const sourceSnapshot = ({ projectId: inputProjectId, sourceRevision }) => createProjectSourceSnapshot({
    storageRoot, projectId: inputProjectId, sourceRevision, ownership,
  })
  const databasePorts = createProjectBrainBindingDatabasePorts({
    bindingPool,
    brainAuthorityPool: attesterPool,
  })
  const validator = createBrainBindingValidator({
    conformance: { execute: async () => { throw new Error('NO_PHYSICAL_ASSERTION_IN_CONTROLLED_PROOF') } },
  })
  const realGit = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
  const storeWith = (git) => createProjectBrainBindingStore({
    ...databasePorts, sourceSnapshot, validator,
    recovery: createProjectBindingRecovery({ pool: bindingPool, git }),
  })
  const store = storeWith(realGit)
  const contextResolver = createProjectBrainContextResolver({
    basis: createProjectBrainContextBasisPort(brainReadPool),
    project: createProjectBrainRealizationPort(sourceSnapshot),
  })
  const currentHead = () => readFileSync(resolve(source.repository, 'refs/heads/main'), 'utf8').trim()
  const databaseHead = async () => (await query(fresh,
    'SELECT source_revision FROM project.project WHERE project_id = $1', [projectId])).rows[0].source_revision

  const first = await store.set({
    accountId, projectId, brainRevisionId: firstRevisionId, expectedCurrent: { state: 'ABSENT' },
  })
  assert.equal(first.status, 'FOUND')
  assert.equal(first.created, true)
  assert.equal(first.value.brainRevisionId, firstRevisionId)
  assert.equal(await databaseHead(), currentHead())

  await query(fresh, 'UPDATE reg.artifact SET published_revision_id = $2 WHERE artifact_id = $1',
    [artifactId, secondRevisionId])
  const beforeReplacement = await store.get({ accountId, projectId })
  assert.equal(beforeReplacement.status, 'FOUND')
  assert.equal(beforeReplacement.value.updateAvailable, true)
  const replacement = await store.set({
    accountId, projectId, brainRevisionId: secondRevisionId,
    expectedCurrent: { state: 'PRESENT', representationDigest: projectBrainBindingRepresentationDigest(beforeReplacement.value) },
  })
  assert.equal(replacement.status, 'FOUND')
  assert.equal(replacement.created, false)
  assert.equal(replacement.value.brainRevisionId, secondRevisionId)
  assert.equal(await databaseHead(), currentHead())
  const contextAfterReplacement = await contextResolver.resolve({ accountId, projectId, purpose: 'READ' })
  assert.equal(contextAfterReplacement.status, 'FOUND')
  assert.equal(contextAfterReplacement.value.brainRevisionId, secondRevisionId)
  assert.equal(contextAfterReplacement.value.domains[0].concepts[0].label, 'Budget amount v2')

  await query(fresh, 'UPDATE reg.artifact SET published_revision_id = $2 WHERE artifact_id = $1',
    [artifactId, thirdRevisionId])
  const beforeRevokedReplacement = await store.get({ accountId, projectId })
  assert.equal(beforeRevokedReplacement.status, 'FOUND')
  const sourceBeforeRevocation = await databaseHead()
  let revokedAfterApply = false
  const revokingGit = {
    ...realGit,
    applyProjectBindingIntent: async (input) => {
      const applied = await realGit.applyProjectBindingIntent(input)
      if (applied.status === 'APPLIED') {
        revokedAfterApply = true
        await query(fresh, `
          UPDATE iam.account_project_grant SET can_bind_brain = false
          WHERE account_id = $1 AND project_id = $2
        `, [accountId, projectId])
      }
      return applied
    },
  }
  const refused = await storeWith(revokingGit).set({
    accountId, projectId, brainRevisionId: thirdRevisionId,
    expectedCurrent: {
      state: 'PRESENT',
      representationDigest: projectBrainBindingRepresentationDigest(beforeRevokedReplacement.value),
    },
  })
  assert.equal(revokedAfterApply, true)
  assert.deepEqual(refused, { status: 'DENIED' })
  assert.notEqual(currentHead(), sourceBeforeRevocation)
  assert.equal(await databaseHead(), currentHead())
  const retained = await query(fresh, `
    SELECT brain_revision_id, project_source_revision FROM project.brain_binding WHERE project_id = $1
  `, [projectId])
  assert.deepEqual(retained.rows, [{ brain_revision_id: secondRevisionId, project_source_revision: sourceBeforeRevocation }])
  const retainedContext = await contextResolver.resolve({ accountId, projectId, purpose: 'READ' })
  assert.equal(retainedContext.status, 'FOUND')
  assert.equal(retainedContext.value.brainRevisionId, secondRevisionId)
  assert.equal(retainedContext.value.domains[0].concepts[0].label, 'Budget amount v2')
  assert.deepEqual((await query(fresh, `
    SELECT state, refusal_code FROM project.binding_source_intent
    WHERE project_id = $1 AND operation_kind = 'BRAIN' ORDER BY created_at DESC LIMIT 1
  `, [projectId])).rows[0], { state: 'ABORTED', refusal_code: '42501' })
  const revocationCancellation = currentHead()

  await query(fresh, `
    UPDATE iam.account_project_grant SET can_bind_brain = true
    WHERE account_id = $1 AND project_id = $2
  `, [accountId, projectId])
  const recoveryInput = async ({ revisionId, digest, sourceRevision, bindingDigest }) => {
    const candidate = proofCandidate({
      workspaceId, projectId, connectionId, connectionRevisionId, qualificationId,
      brainRevisionId: revisionId, brainDigest: digest, sourceRevision,
    })
    const projectBindingDigest = digestOf(candidate)
    const bindingValidationId = randomUUID()
    await databasePorts.attester.persist({
      bindingValidationId, projectId, brainRevisionId: revisionId, brainDigest: digest,
      projectBindingDigest, candidate,
    })
    return {
      accountId, projectId, brainRevisionId: revisionId, brainDigest: digest,
      expectedCurrent: { state: 'PRESENT', projectBindingDigest: bindingDigest },
      candidate, projectBindingDigest, bindingValidationId,
    }
  }

  const bindingBeforeRestart = (await query(fresh, `
    SELECT project_binding_digest, project_source_revision FROM project.brain_binding WHERE project_id = $1
  `, [projectId])).rows[0]
  const restartInput = await recoveryInput({
    revisionId: restartRevisionId, digest: '4'.repeat(64),
    sourceRevision: await databaseHead(),
    bindingDigest: bindingBeforeRestart.project_binding_digest,
  })
  let interruptedAfterApply = false
  const interruptedGit = {
    ...realGit,
    applyProjectBindingIntent: async (input) => {
      const applied = await realGit.applyProjectBindingIntent(input)
      if (applied.status === 'APPLIED') {
        interruptedAfterApply = true
        throw new Error('CONTROLLED_PROCESS_LOSS_AFTER_APPLY')
      }
      return applied
    },
  }
  await assert.rejects(
    () => createProjectBindingRecovery({ pool: bindingPool, git: interruptedGit }).executeBrain(restartInput),
    /CONTROLLED_PROCESS_LOSS_AFTER_APPLY/,
  )
  assert.equal(interruptedAfterApply, true)
  const pendingRestart = (await query(fresh, `
    SELECT state, source_revision, apply_source_revision FROM project.binding_source_intent
    WHERE intent_id = $1
  `, [restartInput.bindingValidationId])).rows[0]
  assert.equal(pendingRestart.state, 'APPLYING')
  assert.equal(await databaseHead(), pendingRestart.source_revision)
  assert.equal(currentHead(), pendingRestart.apply_source_revision)

  const restartedRecovery = createProjectBindingRecovery({ pool: bindingPool, git: realGit })
  await restartedRecovery.reconcile(accountId, projectId)
  const completedRestart = (await query(fresh, `
    SELECT state, terminal_source_revision, apply_source_revision FROM project.binding_source_intent
    WHERE intent_id = $1
  `, [restartInput.bindingValidationId])).rows[0]
  assert.deepEqual(completedRestart, {
    state: 'COMPLETED', terminal_source_revision: pendingRestart.apply_source_revision,
    apply_source_revision: pendingRestart.apply_source_revision,
  })
  assert.equal(await databaseHead(), pendingRestart.apply_source_revision)
  assert.equal(currentHead(), pendingRestart.apply_source_revision)
  const bindingAfterRestart = (await query(fresh, `
    SELECT brain_revision_id, project_binding_digest, project_source_revision
    FROM project.brain_binding WHERE project_id = $1
  `, [projectId])).rows[0]
  assert.deepEqual(bindingAfterRestart, {
    brain_revision_id: restartRevisionId,
    project_binding_digest: restartInput.projectBindingDigest,
    project_source_revision: pendingRestart.apply_source_revision,
  })

  const staleQualificationInput = await recoveryInput({
    revisionId: staleQualificationRevisionId, digest: '5'.repeat(64),
    sourceRevision: bindingAfterRestart.project_source_revision,
    bindingDigest: bindingAfterRestart.project_binding_digest,
  })
  const newerQualificationId = randomUUID()
  let qualificationChangedAfterApply = false
  const qualificationChangingGit = {
    ...realGit,
    applyProjectBindingIntent: async (input) => {
      const applied = await realGit.applyProjectBindingIntent(input)
      if (applied.status === 'APPLIED') {
        await query(fresh, `
          INSERT INTO con.connection_qualification(
            qualification_id, connection_id, connection_revision_id, credential_generation,
            environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at
          ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4::jsonb,
            ARRAY['fixture:r2-p4-brain-composed-newer'], clock_timestamp() + interval '1 second')
        `, [newerQualificationId, connectionId, connectionRevisionId,
          JSON.stringify({ title: 'Newer composed qualification', message: 'Controlled drift fixture.' })])
        qualificationChangedAfterApply = true
      }
      return applied
    },
  }
  const staleQualification = await createProjectBindingRecovery({
    pool: bindingPool, git: qualificationChangingGit,
  }).executeBrain(staleQualificationInput)
  assert.equal(qualificationChangedAfterApply, true)
  assert.equal(staleQualification.state, 'ABORTED')
  assert.equal(staleQualification.refusal_code, 'P0412')
  assert.notEqual(staleQualification.apply_source_revision, currentHead())
  assert.equal(staleQualification.terminal_source_revision, currentHead())
  assert.equal(await databaseHead(), currentHead())
  const bindingAfterQualificationDrift = (await query(fresh, `
    SELECT brain_revision_id, project_binding_digest FROM project.brain_binding WHERE project_id = $1
  `, [projectId])).rows[0]
  assert.deepEqual(bindingAfterQualificationDrift, {
    brain_revision_id: restartRevisionId,
    project_binding_digest: restartInput.projectBindingDigest,
  })

  await query(fresh, `
    UPDATE iam.account_project_grant SET can_bind_brain = false
    WHERE account_id = $1 AND project_id = $2
  `, [accountId, projectId])
  const beforeRemoval = await store.get({ accountId, projectId })
  assert.equal(beforeRemoval.status, 'FOUND')
  const removalBaseBlob = spawnSync('git', [
    '--git-dir', source.repository, 'cat-file', 'blob',
    `${currentHead()}:.conexus/project/brain-binding.json`,
  ])
  assert.equal(removalBaseBlob.status, 0, removalBaseBlob.stderr.toString())
  assert.equal(sha256(removalBaseBlob.stdout), bindingAfterQualificationDrift.project_binding_digest)
  let removalInterruptedAfterApply = false
  const interruptedRemovalGit = {
    ...realGit,
    applyProjectBindingIntent: async (input) => {
      const applied = await realGit.applyProjectBindingIntent(input)
      if (applied.status === 'APPLIED') {
        removalInterruptedAfterApply = true
        throw new Error('CONTROLLED_PROCESS_LOSS_AFTER_BRAIN_REMOVAL_APPLY')
      }
      return applied
    },
  }
  let removalAttempt
  let removalFailure
  try {
    removalAttempt = await createProjectBindingRecovery({ pool: bindingPool, git: interruptedRemovalGit }).executeBrainRemoval({
      accountId,
      projectId,
      expectedCurrent: { state: 'PRESENT', projectBindingDigest: bindingAfterQualificationDrift.project_binding_digest },
    })
  } catch (error) {
    removalFailure = error
  }
  assert.equal(removalInterruptedAfterApply, true,
    `removal returned ${JSON.stringify(removalAttempt)}; failure=${String(removalFailure)}`)
  assert.match(String(removalFailure), /CONTROLLED_PROCESS_LOSS_AFTER_BRAIN_REMOVAL_APPLY/)
  const pendingRemoval = (await query(fresh, `
    SELECT intent_id, state, source_revision, apply_source_revision, declaration_digest
    FROM project.binding_source_intent
    WHERE project_id = $1 AND operation_kind = 'BRAIN' AND remove_binding
    ORDER BY created_at DESC LIMIT 1
  `, [projectId])).rows[0]
  assert.equal(pendingRemoval.state, 'APPLYING')
  assert.equal(pendingRemoval.source_revision, await databaseHead())
  assert.equal(pendingRemoval.apply_source_revision, currentHead())
  assert.equal(pendingRemoval.declaration_digest, bindingAfterQualificationDrift.project_binding_digest)
  assert.equal((await query(fresh,
    'SELECT count(*)::int AS count FROM project.brain_binding WHERE project_id = $1', [projectId])).rows[0].count, 1)
  assert.notEqual(spawnSync('git', [
    '--git-dir', source.repository, 'cat-file', '-e',
    `${pendingRemoval.apply_source_revision}:.conexus/project/brain-binding.json`,
  ]).status, 0)

  await createProjectBindingRecovery({ pool: bindingPool, git: realGit }).reconcile(accountId, projectId)
  const completedRemoval = (await query(fresh, `
    SELECT state, terminal_source_revision, terminal_result
    FROM project.binding_source_intent WHERE intent_id = $1
  `, [pendingRemoval.intent_id])).rows[0]
  assert.deepEqual(completedRemoval, {
    state: 'COMPLETED', terminal_source_revision: pendingRemoval.apply_source_revision, terminal_result: null,
  })
  assert.equal(await databaseHead(), pendingRemoval.apply_source_revision)
  assert.equal(currentHead(), pendingRemoval.apply_source_revision)
  assert.equal((await query(fresh,
    'SELECT count(*)::int AS count FROM project.brain_binding WHERE project_id = $1', [projectId])).rows[0].count, 0)
  assert.deepEqual(await store.get({ accountId, projectId }), { status: 'ABSENT' })
  assert.equal((await contextResolver.resolve({ accountId, projectId, purpose: 'READ' })).status, 'NOT_FOUND')

  t.diagnostic('controlled validator/attestation fixtures prove composition only; no live Sankhya/provider claim')
  t.diagnostic(`PRESENT replacement=${sourceBeforeRevocation}; revocation cancellation=${revocationCancellation}`)
  t.diagnostic(`restart reused deterministic child=${pendingRestart.apply_source_revision}; qualification drift cancelled=${staleQualification.terminal_source_revision}`)
  t.diagnostic(`PRJ-12 restart settled delete child=${pendingRemoval.apply_source_revision} with brain.bind revoked`)
})
