import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { OTHER_OWNER, OWNER, setupBuilder } from './builder-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID } from './project-fixture.mjs'
import { CURRENT_PIN as CURRENT, seedRevision, seedRevisionThumbnail } from './registry-fixture.mjs'

const { createRegistryModule } = await import(hubModuleUrl('registry/module.js'))
const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))
const { admitProject, admitRun, admitSystem, checkApplication } = await import(hubModuleUrl('identity-access/admission.js'))
const { readServedFileOf } = await import(hubModuleUrl('registry/served.js'))
const { sql } = await import(hubModuleUrl('platform/db.js'))

const OLD = { profile: 'REACT_VITE_V1', templateRef: '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189', recipeSha256: '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf' }
const SOURCE_1 = 'a'.repeat(40)
const SOURCE_2 = 'b'.repeat(40)
const SOURCE_OLD = 'f'.repeat(40)
const SOURCE_E = 'e'.repeat(40)
const DIGEST_1 = 'c'.repeat(64)
const DIGEST_2 = 'd'.repeat(64)
const D_E = '6f54e6f0ca33c0e20da4dd7fdd7ed10b89cb6a282d38768aed2c64329c11e36b'
const SHA_F = 'b633a587c652d02386c4f16f8c6f6aab7352d97f16367c3c40576214372dd628'
const PNG_T2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const SHA_T2 = '4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6'
const PNG_T1 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])

const fileOf = (path, mediaType, text) => {
  const bytes = Buffer.from(text)
  return { path, mediaType, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const F = fileOf('index.html', 'text/html; charset=utf-8', '<html></html>')
const payloadOf = (files, pin = CURRENT) => ({
  format: 'application-payload-v1', ...pin, entryPath: 'index.html',
  files: files.map((file) => ({ path: file.path, mediaType: file.mediaType, byteLength: file.bytes.byteLength, sha256: file.sha256, base64: Buffer.from(file.bytes).toString('base64') })),
})

const world = async (t, prefix) => {
  const fixture = await setupBuilder(t, prefix)
  const { database, connection, seedRun } = fixture
  const registry = createRegistryModule({ database })
  const store = createBuilderStore({ database, ownerId: OWNER, registry })
  const grant = async (projectId, accountId = ID.outsider) => {
    await query(connection, 'INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [projectId, `app-${projectId.slice(0, 8)}`, ID.owner])
    await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, accountId, ID.owner])
  }
  const point = (projectId, revisionId, sourceRevision, digest) => query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1', [projectId, sourceRevision, revisionId, digest])
  const served = async (projectId) => {
    await grant(projectId)
    const first = await seedRevision(connection, projectId, { sourceRevision: SOURCE_1, digest: DIGEST_1, payload: payloadOf([F]) })
    const second = await seedRevision(connection, projectId, { sourceRevision: SOURCE_2, digest: DIGEST_2, payload: payloadOf([F]) })
    await point(projectId, second, SOURCE_2, DIGEST_2)
    return { first, second }
  }
  const rows = async (projectId) => (await query(connection, `SELECT
    (SELECT count(*)::integer FROM reg.artifact_revision WHERE project_id = $1) AS revisions,
    (SELECT count(*)::integer FROM reg.application_thumbnail WHERE artifact_revision_id IN (SELECT artifact_revision_id FROM reg.artifact_revision WHERE project_id = $1)) AS thumbnails`, [projectId])).rows[0]
  const pointer = async (projectId) => (await query(connection, 'SELECT last_preview_source_revision AS source, last_preview_artifact_revision_id AS revision, last_preview_artifact_digest AS digest FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0]
  const sealFor = (projectId, builderRunId, files, { sourceRevision = SOURCE_E, thumbnail = null } = {}) => registry.seal(
    { compiledApplication: { projectId, executionId: builderRunId, sourceRevision, templateRef: CURRENT.templateRef, recipeSha256: CURRENT.recipeSha256, files }, thumbnail },
    { projectId, builderRunId, sourceRevision },
  )
  const runFor = (projectId, options = {}) => seedRun(projectId, { state: 'RUNNING', candidate: SOURCE_E, result: SOURCE_E, ...options })
  const settle = (projectId, builderRunId, files = [F], { sourceRevision = SOURCE_E, thumbnail = null } = {}) =>
    store.settleBuilderRunBuild({ builderRunId, sourceRevision, kind: 'BUILT', sealed: sealFor(projectId, builderRunId, files, { sourceRevision, thumbnail }) })
  return { ...fixture, registry, store, grant, point, served, rows, pointer, sealFor, runFor, settle }
}

const invariant = (name) => (error) => {
  assert.equal(error.id, 'INTERNAL_UNEXPECTED')
  assert.equal(error.details?.invariant, name)
  return true
}

test('a member reads the source revisions on the current pin, a grantee reads only what is served, and nobody else reads either', async (t) => {
  const { database, connection, seedBuilderProject, registry, served, point } = await world(t, 'conexus_registry_reads')
  const projectId = await seedBuilderProject('Atlas')
  const { first, second } = await served(projectId)
  const old = await seedRevision(connection, projectId, { sourceRevision: SOURCE_OLD, digest: 'e'.repeat(64), payload: payloadOf([F], OLD) })
  const at = (artifactRevisionId, sourceRevision) => ({ projectId, sourceRevision, artifactRevisionId, path: 'index.html' })

  const file = await registry.readPreviewFile(ID.member, at(first, SOURCE_1))
  assert.deepEqual({ ...file, bytes: Buffer.from(file.bytes).toString() }, { path: 'index.html', mediaType: 'text/html; charset=utf-8', sha256: SHA_F, bytes: '<html></html>' })
  assert.equal((await registry.readPreviewFile(ID.member, at(second, SOURCE_2))).sha256, SHA_F)
  assert.equal(await registry.readPreviewFile(ID.member, at(old, SOURCE_OLD)), null, 'a revision retained on an older template pin is not a Preview source')
  assert.equal(await registry.readPreviewFile(ID.member, at(first, SOURCE_2)), null, 'the pair of ids must match')
  assert.equal(await registry.readPreviewFile(ID.outsider, at(second, SOURCE_2)), null, 'a grantee reads no registry row directly')
  assert.equal(await registry.readPreviewFile(ID.administrator, at(second, SOURCE_2)), null)
  const Count = z.object({ n: z.number() })
  const direct = (accountId, statement) => database.read(accountId, (tx) => tx.one(Count, statement, 'INTERNAL_UNEXPECTED'))
  assert.deepEqual(await direct(ID.outsider, sql`SELECT count(*)::integer AS n FROM reg.artifact_revision`), { n: 0 })
  assert.deepEqual(await direct(ID.outsider, sql`SELECT count(*)::integer AS n FROM reg.application_thumbnail`), { n: 0 })
  assert.deepEqual(await direct(ID.member, sql`SELECT count(*)::integer AS n FROM reg.artifact_revision`), { n: 3 })

  const launch = await database.transaction(ID.member, async (gate) => registry.readLaunch(await admitProject(gate, projectId, 'project.build')))
  assert.deepEqual(launch, { sourceRevision: SOURCE_2, artifactRevisionId: second, digest: DIGEST_2, entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8' }] })
  await point(projectId, old, SOURCE_OLD, 'e'.repeat(64))
  assert.equal(await database.transaction(ID.member, async (gate) => registry.readLaunch(await admitProject(gate, projectId, 'project.build'))), null, 'an old template pin is not launched')
  assert.equal((await registry.readServedManifest(ID.outsider, projectId)).artifactRevisionId, old, 'an old revision still serves to its grantee')
})

test('the served reads answer the manifest, a file, a missing path, a stale pin and a project that serves nothing', async (t) => {
  const { connection, seedBuilderProject, registry, served, point } = await world(t, 'conexus_registry_served')
  const projectId = await seedBuilderProject('Atlas')
  const { first, second } = await served(projectId)
  const bare = await seedBuilderProject('Bare')
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'bare', $2)", [bare, ID.owner])
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [bare, ID.outsider, ID.owner])

  assert.deepEqual(await registry.readServedManifest(ID.outsider, projectId), { artifactRevisionId: second, files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8' }] })
  const read = await registry.readServedFile(ID.outsider, projectId, 'index.html')
  assert.deepEqual({ ...read, file: { ...read.file, bytes: Buffer.from(read.file.bytes).toString() } }, { ok: true, artifactRevisionId: second, file: { path: 'index.html', mediaType: 'text/html; charset=utf-8', sha256: SHA_F, bytes: '<html></html>' } })
  assert.deepEqual(await registry.readServedFile(ID.outsider, projectId, 'missing.js'), { ok: false, reason: 'NOT_FOUND' })
  assert.deepEqual(await registry.readPinnedServedFile(ID.outsider, projectId, first, 'index.html'), { ok: false, reason: 'STALE_PIN' })
  assert.equal((await registry.readPinnedServedFile(ID.outsider, projectId, second, 'index.html')).ok, true)
  assert.deepEqual(await registry.readPinnedServedFile(ID.outsider, projectId, second, 'missing.js'), { ok: false, reason: 'NOT_FOUND' })
  assert.equal(await registry.readServedManifest(ID.outsider, bare), null)
  assert.deepEqual(await registry.readServedFile(ID.outsider, bare, 'index.html'), { ok: false, reason: 'NOT_SERVED' })

  await seedRevisionThumbnail(connection, first, PNG_T1)
  assert.equal(await registry.readProjectThumbnail(ID.member, projectId), null, 'a picture of a revision that is not served is not the thumbnail')
  await seedRevisionThumbnail(connection, second, PNG_T2)
  const thumbnail = await registry.readProjectThumbnail(ID.member, projectId)
  assert.deepEqual({ revision: thumbnail.artifactRevisionId, sha256: createHash('sha256').update(thumbnail.bytes).digest('hex') }, { revision: second, sha256: SHA_T2 })

  await point(projectId, second, SOURCE_2, DIGEST_1)
  await assert.rejects(registry.readServedManifest(ID.outsider, projectId), invariant('SERVED_POINTER_BROKEN'))
  await assert.rejects(registry.readServedFile(ID.outsider, projectId, 'index.html'), invariant('SERVED_POINTER_BROKEN'))
  await assert.rejects(registry.readProjectThumbnail(ID.member, projectId), invariant('SERVED_POINTER_BROKEN'))
  await assert.rejects(registry.readPinnedServedFile(ID.outsider, projectId, second, 'index.html'), invariant('SERVED_POINTER_BROKEN'))
})

test('a purge that commits between the access check and the read answers NOT_SERVED, never a broken pointer', async (t) => {
  const { connection, database, seedBuilderProject, served } = await world(t, 'conexus_registry_purge_race')
  const projectId = await seedBuilderProject('Atlas')
  await served(projectId)
  const answer = await database.transaction(ID.outsider, async (gate) => {
    const { tx } = await checkApplication(gate, projectId)
    const purger = new pg.Client(connection)
    await purger.connect()
    try {
      await purger.query('BEGIN')
      await purger.query('DELETE FROM reg.artifact_revision WHERE project_id = $1', [projectId])
      await purger.query('DELETE FROM builder.project_working_state WHERE project_id = $1', [projectId])
      await purger.query('COMMIT')
    } finally {
      await purger.end()
    }
    return readServedFileOf(tx, projectId, 'index.html')
  })
  assert.deepEqual(answer, { ok: false, reason: 'NOT_SERVED' })
})

test('the application check refuses a revoked grant, a removed membership, a deletion and an inactive account, and a member of another workspace reads nothing', async (t) => {
  const { connection, seedBuilderProject, registry, served } = await world(t, 'conexus_registry_access')
  const projectId = await seedBuilderProject('Atlas')
  const other = await seedBuilderProject('Borealis', ID.otherWorkspace)
  await served(projectId)
  await served(other)
  const refused = (accountId, id = projectId) => assert.rejects(registry.readServedFile(accountId, id, 'index.html'), { id: 'APPLICATION_NOT_FOUND' })

  await refused(ID.member, other)
  await refused(ID.administrator)
  assert.equal((await registry.readServedFile(ID.member, projectId, 'index.html')).ok, true)
  assert.equal(await registry.readProjectThumbnail(ID.member, other), null)

  await query(connection, 'UPDATE iam.application_grant SET revoked_at = now(), revoked_by = $2 WHERE project_id = $1', [projectId, ID.owner])
  await refused(ID.outsider)
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  await refused(ID.member)
  await query(connection, 'UPDATE iam.account SET active = true WHERE account_id = $1', [ID.member])
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  await refused(ID.member)
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)", [projectId, ID.workspace, ID.administrator])
  await refused(ID.owner)
  await refused(ID.administrator)
})

test('retention writes one revision for one source, returns it again to every run that seals the same bytes, and refuses different bytes', async (t) => {
  const { database, connection, seedBuilderProject, registry, rows, pointer, runFor, settle, sealFor, runRow } = await world(t, 'conexus_registry_retain')
  const projectId = await seedBuilderProject('Atlas')

  const first = await runFor(projectId)
  assert.equal(sealFor(projectId, first, [F]).digest, D_E)
  await settle(projectId, first)
  const stored = await pointer(projectId)
  assert.deepEqual({ source: stored.source, digest: stored.digest, rows: await rows(projectId), state: (await runRow(first)).state }, { source: SOURCE_E, digest: D_E, rows: { revisions: 1, thumbnails: 0 }, state: 'SUCCEEDED' })

  const second = await runFor(projectId)
  await settle(projectId, second)
  assert.deepEqual(await pointer(projectId), stored, 'a second run of the same bytes gets the same revision')
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 0 })

  const third = await runFor(projectId)
  await assert.rejects(settle(projectId, third, [F, fileOf('app.js', 'text/javascript; charset=utf-8', 'x')]), invariant('ARTIFACT_IDENTITY_CONFLICT'))
  assert.deepEqual(await pointer(projectId), stored)
  assert.deepEqual({ rows: await rows(projectId), state: (await runRow(third)).state }, { rows: { revisions: 1, thumbnails: 0 }, state: 'RUNNING' })
  await query(connection, "UPDATE builder.builder_run SET state = 'FAILED', result_kind = NULL, failure_code = 'INTERNAL_UNEXPECTED', finished_at = now() WHERE builder_run_id = $1", [third])

  await assert.rejects(settle(projectId, first), { id: 'BUILDER_RUN_NOT_ADMITTED' })
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 0 })

  const open = async (builderRunId, work) => database.system('builder-executor', async (gate) => work(await admitRun(gate, builderRunId, { ownerId: OWNER })))
  const again = await runFor(projectId)
  const sealed = sealFor(projectId, again, [F])
  const twice = await open(again, async (proof) => [await registry.retain(proof, sealed), await registry.retain(proof, sealed)])
  assert.deepEqual(twice[0], twice[1])
  assert.equal(twice[0].digest, D_E)
  assert.equal((await query(connection, 'SELECT count(*)::integer AS n FROM reg.artifact_revision WHERE project_id = $1', [projectId])).rows[0].n, 1)

  const other = 'c'.repeat(40)
  await query(connection, "UPDATE builder.builder_run SET state = 'FAILED', result_kind = NULL, failure_code = 'INTERNAL_UNEXPECTED', finished_at = now() WHERE builder_run_id = $1", [again])
  const rollbackRun = await runFor(projectId, { candidate: other, result: other })
  await assert.rejects(open(rollbackRun, async (proof) => {
    await registry.retain(proof, sealFor(projectId, rollbackRun, [F], { sourceRevision: other, thumbnail: { bytes: PNG_T2 } }))
    throw new Error('ROLLBACK_AFTER_THUMBNAIL')
  }), /ROLLBACK_AFTER_THUMBNAIL/)
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 0 })
  assert.deepEqual(await pointer(projectId), stored)
})

test('two sessions that retain the same build at once converge on one revision, and a rollback of the first lets the second insert', async (t) => {
  const { database, seedBuilderProject, registry, rows, runFor, sealFor } = await world(t, 'conexus_registry_concurrent')
  const projectId = await seedBuilderProject('Atlas')
  const builderRunId = await runFor(projectId)
  const sealed = sealFor(projectId, builderRunId, [F], { thumbnail: { bytes: PNG_T2 } })
  const session = (after) => database.system('builder-executor', async (gate) => {
    const retained = await registry.retain(await admitRun(gate, builderRunId, { ownerId: OWNER }), sealed)
    await after()
    return retained
  })
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const both = await Promise.all([session(() => pause(300)), session(async () => {})])
  assert.deepEqual(both[0], both[1])
  assert.equal(both[0].digest, D_E)
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 1 })

  const rolledBack = await world(t, 'conexus_registry_concurrent_rollback')
  const second = await rolledBack.seedBuilderProject('Borealis')
  const secondRun = await rolledBack.runFor(second)
  const secondSealed = rolledBack.sealFor(second, secondRun, [F])
  const racing = (after) => rolledBack.database.system('builder-executor', async (gate) => {
    const retained = await rolledBack.registry.retain(await admitRun(gate, secondRun, { ownerId: OWNER }), secondSealed)
    await after()
    return retained
  })
  const outcomes = await Promise.allSettled([racing(async () => { await pause(300); throw new Error('FIRST_ROLLS_BACK') }), racing(async () => {})])
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ['rejected', 'fulfilled'])
  assert.deepEqual(await rolledBack.rows(second), { revisions: 1, thumbnails: 0 })
})

test('a settlement is refused for an ended run, a run another owner holds, a run whose source differs, and leaves no registry row', async (t) => {
  const { seedBuilderProject, rows, runFor, settle, runRow } = await world(t, 'conexus_registry_refusals')
  const own = async (name, options) => {
    const owned = await seedBuilderProject(name)
    return { projectId: owned, builderRunId: await runFor(owned, options) }
  }
  const stopped = await own('Stopped', { state: 'INTERRUPTED' })
  await assert.rejects(settle(stopped.projectId, stopped.builderRunId), { id: 'BUILDER_RUN_NOT_ADMITTED' })
  const foreign = await own('Foreign', { owner: OTHER_OWNER })
  await assert.rejects(settle(foreign.projectId, foreign.builderRunId), { id: 'BUILDER_RUN_NOT_ADMITTED' })
  const unsourced = await own('Unsourced', { result: null })
  await assert.rejects(settle(unsourced.projectId, unsourced.builderRunId), (error) => error.id === 'BUILDER_RUN_TRANSITION_REFUSED' && error.details?.transition === 'build settlement')
  const moved = await own('Moved', { result: 'd'.repeat(40) })
  await assert.rejects(settle(moved.projectId, moved.builderRunId), { id: 'BUILDER_RUN_TRANSITION_REFUSED' })
  for (const { projectId: refusedProject } of [stopped, foreign, unsourced, moved]) assert.deepEqual(await rows(refusedProject), { revisions: 0, thumbnails: 0 })
  assert.equal((await runRow(moved.builderRunId)).state, 'RUNNING')
})

test('a stop requested after the source was admitted does not stop the settlement', async (t) => {
  const { connection, seedBuilderProject, rows, pointer, runFor, settle, runRow } = await world(t, 'conexus_registry_stop')
  const projectId = await seedBuilderProject('Atlas')
  const builderRunId = await runFor(projectId)
  await query(connection, "UPDATE builder.builder_run SET cancellation_requested_at = now(), cancellation_reason = 'USER_CANCELLED' WHERE builder_run_id = $1", [builderRunId])
  await settle(projectId, builderRunId, [F], { thumbnail: { bytes: PNG_T2 } })
  assert.equal((await runRow(builderRunId)).state, 'SUCCEEDED')
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 1 })
  assert.equal((await pointer(projectId)).digest, D_E)
})

test('the settlement of a build of 12 MiB holds the run row for less than the heartbeat lock timeout', async (t) => {
  const { seedBuilderProject, runFor, settle } = await world(t, 'conexus_registry_size')
  const projectId = await seedBuilderProject('Atlas')
  const builderRunId = await runFor(projectId)
  const chunk = 'x'.repeat(1024 * 1024)
  const small = fileOf('index.html', 'text/html; charset=utf-8', '<html></html>')
  const files = [small, ...Array.from({ length: 11 }, (_, number) => fileOf(`part-${number}.txt`, 'text/plain; charset=utf-8', chunk))]
  const filler = fileOf('part-11.txt', 'text/plain; charset=utf-8', 'x'.repeat(1024 * 1024 - small.bytes.byteLength))
  const started = performance.now()
  await settle(projectId, builderRunId, [...files, filler])
  assert.ok(performance.now() - started < 5000)
})

test('the project purge removes every revision and thumbnail of the project and no other, twice, and rolls back as one', async (t) => {
  const { connection, database, seedBuilderProject, registry, served, rows } = await world(t, 'conexus_registry_purge')
  const projectId = await seedBuilderProject('Atlas')
  const other = await seedBuilderProject('Borealis')
  const { second } = await served(projectId)
  await served(other)
  await seedRevisionThumbnail(connection, second, PNG_T2)
  const purge = (id, after) => database.system('project-purge', async (gate) => {
    await registry.purge(await admitSystem(gate, 'project-purge'), id)
    after?.()
  })
  await assert.rejects(purge(projectId, () => { throw new Error('FAIL_AFTER_FIRST_DELETE') }), /FAIL_AFTER_FIRST_DELETE/)
  assert.deepEqual(await rows(projectId), { revisions: 2, thumbnails: 1 })
  await purge(projectId)
  await purge(projectId)
  assert.deepEqual(await rows(projectId), { revisions: 0, thumbnails: 0 })
  assert.deepEqual(await rows(other), { revisions: 2, thumbnails: 0 })
})

test('the roles hold only the privileges the registry grants them', async (t) => {
  const { connection, seedBuilderProject, served } = await world(t, 'conexus_registry_privileges')
  const projectId = await seedBuilderProject('Atlas')
  const { second } = await served(projectId)
  await seedRevisionThumbnail(connection, second, PNG_T2)
  const as = async (role, statement) => {
    const client = new pg.Client(connection)
    await client.connect()
    try {
      await client.query(`SET ROLE ${role}`)
      await client.query(statement)
      return null
    } catch (error) {
      return error.code
    } finally {
      await client.end()
    }
  }
  const refusals = [
    ['hub_command', 'UPDATE reg.artifact_revision SET digest = digest'],
    ['hub_command', 'UPDATE reg.application_thumbnail SET byte_length = byte_length'],
    ['hub_command', 'DELETE FROM reg.application_thumbnail'],
    ['hub_reader', 'SELECT 1 FROM reg.artifact_revision FOR SHARE'],
    ['hub_reader', 'SELECT 1 FROM reg.application_thumbnail FOR SHARE'],
    ['hub_reader', "INSERT INTO reg.application_thumbnail(artifact_revision_id, media_type, bytes, byte_length, sha256) VALUES (gen_random_uuid(), 'image/png', '\\x01', 1, repeat('a', 64))"],
    ['hub_reader', 'UPDATE reg.artifact_revision SET digest = digest'],
    ['hub_reader', 'DELETE FROM reg.artifact_revision'],
    ['hub_runtime', 'SELECT 1 FROM reg.artifact_revision'],
    ['hub_runtime', 'SELECT 1 FROM reg.application_thumbnail'],
  ]
  for (const [role, statement] of refusals) assert.equal(await as(role, statement), '42501', `${role}: ${statement}`)
})
