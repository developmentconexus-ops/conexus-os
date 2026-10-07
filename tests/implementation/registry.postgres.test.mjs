import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { OTHER_OWNER, OWNER } from './builder-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { waitUntilBlocked } from './race.mjs'
import { ID } from './project-fixture.mjs'
import { B, DIGEST_1, DIGEST_2, D_E, F, OLD, PNG_T1, P, PNG_T2, SHA_F, SHA_T2, SOURCE_1, SOURCE_2, SOURCE_E, SOURCE_OLD, deferred, fileOf, invariant, payloadOf, seedRevision, seedRevisionThumbnail, world } from './registry-fixture.mjs'

const { createRegistryModule } = await import(hubModuleUrl('registry/module.js'))
const { admitProject, admitRun, admitSystem, checkApplication, checkProject } = await import(hubModuleUrl('identity-access/admission.js'))
const { readServedFileOf } = await import(hubModuleUrl('registry/served.js'))
const { sql } = await import(hubModuleUrl('platform/db.js'))

const servedManifest = (database, accountId, projectId) => database.transaction(accountId, async (gate) => createRegistryModule({ database }).readServedManifest(await checkApplication(gate, projectId)))
const servedFile = (database, accountId, projectId, path) => database.transaction(accountId, async (gate) => createRegistryModule({ database }).readServedFile(await checkApplication(gate, projectId), path))
const previewFile = (database, accountId, { projectId, ...at }) => database.transaction(accountId, async (gate) => createRegistryModule({ database }).readPreviewRevisionFile(await checkProject(gate, projectId), at))

test('a member reads the source revisions on the current pin, a grantee reads only what is served, and nobody else reads either', async (t) => {
  const { database, connection, seedBuilderProject, registry, served, point } = await world(t, 'conexus_registry_reads')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const { first, second } = await served(projectId)
  const old = await seedRevision(connection, projectId, { sourceRevision: SOURCE_OLD, digest: 'e'.repeat(64), payload: payloadOf([F], OLD) })
  const at = (artifactRevisionId, sourceRevision) => ({ projectId, sourceRevision, artifactRevisionId, path: 'index.html' })

  const file = await previewFile(database, ID.member, at(first, SOURCE_1))
  assert.deepEqual({ ...file, bytes: Buffer.from(file.bytes).toString() }, { path: 'index.html', mediaType: 'text/html; charset=utf-8', sha256: SHA_F, bytes: '<html></html>' })
  assert.equal((await previewFile(database, ID.member, at(second, SOURCE_2))).sha256, SHA_F)
  assert.equal(await previewFile(database, ID.member, at(old, SOURCE_OLD)), null, 'a revision retained on an older template pin is not a Preview source')
  assert.equal(await previewFile(database, ID.member, at(first, SOURCE_2)), null, 'the pair of ids must match')
  await assert.rejects(previewFile(database, ID.outsider, at(second, SOURCE_2)), { id: 'PROJECT_NOT_FOUND' }, 'a grantee is no member of the Project')
  await assert.rejects(previewFile(database, ID.administrator, at(second, SOURCE_2)), { id: 'PROJECT_NOT_FOUND' })
  const Count = z.object({ n: z.number() })
  const direct = (accountId, statement) => database.read(accountId, (tx) => tx.one(Count, statement, 'INTERNAL_UNEXPECTED'))
  assert.deepEqual(await direct(ID.outsider, sql`SELECT count(*)::integer AS n FROM reg.artifact_revision`), { n: 0 })
  assert.deepEqual(await direct(ID.outsider, sql`SELECT count(*)::integer AS n FROM reg.application_thumbnail`), { n: 0 })
  assert.deepEqual(await direct(ID.member, sql`SELECT count(*)::integer AS n FROM reg.artifact_revision`), { n: 3 })

  const launch = await database.transaction(ID.member, async (gate) => registry.readLaunch(await admitProject(gate, { projectId: projectId, action: 'project.build' })))
  assert.deepEqual(launch, { sourceRevision: SOURCE_2, artifactRevisionId: second, digest: DIGEST_2, entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8' }] })
  await point(projectId, old, SOURCE_OLD, 'e'.repeat(64))
  assert.equal(await database.transaction(ID.member, async (gate) => registry.readLaunch(await admitProject(gate, { projectId: projectId, action: 'project.build' }))), null, 'an old template pin is not launched')
  assert.equal((await servedManifest(database, ID.outsider, projectId)).artifactRevisionId, old, 'an old revision still serves to its grantee')
})

test('the served reads answer the manifest, a file, a missing path with its revision, and a project that serves nothing', async (t) => {
  const { connection, database, seedBuilderProject, registry, served, point } = await world(t, 'conexus_registry_served')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const { first, second } = await served(projectId)
  const bare = await seedBuilderProject('Bare')
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'bare', $2)", [bare, ID.owner])
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [bare, ID.outsider, ID.owner])

  assert.deepEqual(await servedManifest(database, ID.outsider, projectId), { artifactRevisionId: second, files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8' }] })
  const read = await servedFile(database, ID.outsider, projectId, 'index.html')
  assert.deepEqual({ ...read, file: { ...read.file, bytes: Buffer.from(read.file.bytes).toString() } }, { ok: true, artifactRevisionId: second, file: { path: 'index.html', mediaType: 'text/html; charset=utf-8', sha256: SHA_F, bytes: '<html></html>' } })
  assert.deepEqual(await servedFile(database, ID.outsider, projectId, 'missing.js'), { ok: false, reason: 'NOT_FOUND', artifactRevisionId: second })
  assert.equal(await servedManifest(database, ID.outsider, bare), null)
  assert.deepEqual(await servedFile(database, ID.outsider, bare, 'index.html'), { ok: false, reason: 'NOT_SERVED' })

  await seedRevisionThumbnail(connection, first, PNG_T1)
  assert.equal(await registry.readProjectThumbnail(ID.member, projectId), null, 'a picture of a revision that is not served is not the thumbnail')
  await seedRevisionThumbnail(connection, second, PNG_T2)
  const thumbnail = await registry.readProjectThumbnail(ID.member, projectId)
  assert.deepEqual({ revision: thumbnail.artifactRevisionId, sha256: createHash('sha256').update(thumbnail.bytes).digest('hex') }, { revision: second, sha256: SHA_T2 })

  await point(projectId, second, SOURCE_2, DIGEST_1)
  await assert.rejects(servedManifest(database, ID.outsider, projectId), invariant('SERVED_POINTER_BROKEN'))
  await assert.rejects(servedFile(database, ID.outsider, projectId, 'index.html'), invariant('SERVED_POINTER_BROKEN'))
  await assert.rejects(registry.readProjectThumbnail(ID.member, projectId), invariant('SERVED_POINTER_BROKEN'))
  await assert.rejects(database.transaction(ID.member, async (gate) => registry.readLaunch(await admitProject(gate, { projectId: projectId, action: 'project.build' }))), invariant('SERVED_POINTER_BROKEN'))
})

test('a purge that commits between the access check and the read answers NOT_SERVED, never a broken pointer', async (t) => {
  const { connection, database, seedBuilderProject, served } = await world(t, 'conexus_registry_purge_race')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
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
  const { connection, database, seedBuilderProject, registry, served } = await world(t, 'conexus_registry_access')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const other = await seedBuilderProject('Borealis', ID.otherWorkspace, B)
  const { second } = await served(projectId)
  await served(other)
  const refused = (accountId, id = projectId) => assert.rejects(servedFile(database, accountId, id, 'index.html'), { id: 'APPLICATION_NOT_FOUND' })

  await refused(ID.member, other)
  await refused(ID.administrator)
  assert.equal((await servedFile(database, ID.member, projectId, 'index.html')).ok, true)
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
  await assert.rejects(previewFile(database, ID.owner, { projectId, sourceRevision: SOURCE_2, artifactRevisionId: second, path: 'index.html' }), { id: 'PROJECT_NOT_FOUND' }, 'the Preview check refuses a Project in deletion')
})

test('a subclass of the sealed build that seal did not make is refused by retention and leaves no row', async (t) => {
  const { store, seedBuilderProject, runFor, runRow, rows } = await world(t, 'conexus_registry_forged')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const builderRunId = await runFor(projectId)
  const { SealedApplication } = await import(hubModuleUrl('platform/sealed-application.js'))
  class Forged extends SealedApplication {}
  const forged = new Forged(projectId, SOURCE_E, D_E)
  await assert.rejects(store.settleBuilderRunBuild({ builderRunId, kind: 'BUILT', sealed: forged }), invariant('SEALED_APPLICATION_NOT_SEALED'))
  assert.deepEqual(await rows(projectId), { revisions: 0, thumbnails: 0 })
  assert.equal((await runRow(builderRunId)).state, 'RUNNING')
})

test('retention writes one revision for one source, returns it again to every run that seals the same bytes, and refuses different bytes', async (t) => {
  const { database, connection, seedBuilderProject, registry, rows, pointer, runFor, settle, sealFor, runRow } = await world(t, 'conexus_registry_retain')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)

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

  await assert.rejects(settle(projectId, first), { id: 'BUILDER_RUN_TRANSITION_REFUSED' })
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 0 })

  const open = async (builderRunId, work) => database.system('builder-executor', async (gate) => work(await admitRun(gate, builderRunId, { ownerId: OWNER })))
  const again = await runFor(projectId)
  const sealed = sealFor(projectId, again, [F])
  const twice = await open(again, async (proof) => {
    const input = { builderRunId: again, projectId, owner: { ownerId: OWNER }, sealed }
    return [await registry.retain(proof, input), await registry.retain(proof, input)]
  })
  assert.deepEqual(twice[0], twice[1])
  assert.equal(twice[0].digest, D_E)
  assert.equal((await query(connection, 'SELECT count(*)::integer AS n FROM reg.artifact_revision WHERE project_id = $1', [projectId])).rows[0].n, 1)

  const other = 'c'.repeat(40)
  await query(connection, "UPDATE builder.builder_run SET state = 'FAILED', result_kind = NULL, failure_code = 'INTERNAL_UNEXPECTED', finished_at = now() WHERE builder_run_id = $1", [again])
  const rollbackRun = await runFor(projectId, { candidate: other, result: other })
  await assert.rejects(open(rollbackRun, async (proof) => {
    const sealed = sealFor(projectId, rollbackRun, [F], { sourceRevision: other, thumbnail: { bytes: PNG_T2 } })
    await registry.retain(proof, { builderRunId: rollbackRun, projectId, owner: { ownerId: OWNER }, sealed })
    throw new Error('ROLLBACK_AFTER_THUMBNAIL')
  }), /ROLLBACK_AFTER_THUMBNAIL/)
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 0 })
  assert.deepEqual(await pointer(projectId), stored)
})

async function retainTwice({ connection, database, registry, builderRunId, sealed, firstEnds }) {
  const inserted = deferred()
  const release = deferred()
  const session = (holding) => database.system('builder-executor', async (gate) => {
    const retained = await registry.retain(await admitRun(gate, builderRunId, { ownerId: OWNER }), {
      builderRunId,
      projectId: sealed.projectId,
      owner: { ownerId: OWNER },
      sealed,
    })
    if (holding) {
      inserted.resolve()
      await release.promise
      if (firstEnds === 'ROLLBACK') throw new Error('FIRST_ROLLS_BACK')
    }
    return retained
  })
  const first = session(true)
  await inserted.promise
  const second = session(false)
  await waitUntilBlocked(connection)
  release.resolve()
  return Promise.allSettled([first, second])
}

test('two sessions that retain the same build serialize on the run, converge on one revision, and a rollback of the first lets the second insert', async (t) => {
  const committed = await world(t, 'conexus_registry_concurrent')
  const projectId = await committed.seedBuilderProject('Atlas', ID.workspace, P)
  const builderRunId = await committed.runFor(projectId)
  const sealed = committed.sealFor(projectId, builderRunId, [F], { thumbnail: { bytes: PNG_T2 } })
  const both = await retainTwice({ ...committed, builderRunId, sealed, firstEnds: 'COMMIT' })
  assert.deepEqual(both.map((outcome) => outcome.status), ['fulfilled', 'fulfilled'])
  assert.deepEqual(both[0].value, both[1].value)
  assert.equal(both[0].value.digest, D_E)
  assert.deepEqual(await committed.rows(projectId), { revisions: 1, thumbnails: 1 })

  const rolledBack = await world(t, 'conexus_registry_concurrent_rollback')
  const second = await rolledBack.seedBuilderProject('Borealis', ID.workspace, B)
  const secondRun = await rolledBack.runFor(second)
  const outcomes = await retainTwice({ ...rolledBack, builderRunId: secondRun, sealed: rolledBack.sealFor(second, secondRun, [F]), firstEnds: 'ROLLBACK' })
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
  await assert.rejects(settle(stopped.projectId, stopped.builderRunId), { id: 'BUILDER_RUN_TRANSITION_REFUSED' })
  const foreign = await own('Foreign', { owner: OTHER_OWNER })
  await assert.rejects(settle(foreign.projectId, foreign.builderRunId), { id: 'BUILDER_RUN_TRANSITION_REFUSED' })
  const unsourced = await own('Unsourced', { result: null })
  await assert.rejects(settle(unsourced.projectId, unsourced.builderRunId), (error) => error.id === 'BUILDER_RUN_TRANSITION_REFUSED' && error.details?.transition === 'build settlement')
  const moved = await own('Moved', { result: 'd'.repeat(40) })
  await assert.rejects(settle(moved.projectId, moved.builderRunId), { id: 'BUILDER_RUN_TRANSITION_REFUSED' })
  for (const { projectId: refusedProject } of [stopped, foreign, unsourced, moved]) assert.deepEqual(await rows(refusedProject), { revisions: 0, thumbnails: 0 })
  assert.equal((await runRow(moved.builderRunId)).state, 'RUNNING')
})

test('a stop requested after the source was admitted does not stop the settlement', async (t) => {
  const { connection, seedBuilderProject, rows, pointer, runFor, settle, runRow } = await world(t, 'conexus_registry_stop')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const builderRunId = await runFor(projectId)
  await query(connection, "UPDATE builder.builder_run SET cancellation_requested_at = now(), cancellation_reason = 'USER_CANCELLED' WHERE builder_run_id = $1", [builderRunId])
  await settle(projectId, builderRunId, [F], { thumbnail: { bytes: PNG_T2 } })
  assert.equal((await runRow(builderRunId)).state, 'SUCCEEDED')
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 1 })
  assert.equal((await pointer(projectId)).digest, D_E)
})

test('the settlement of a build of 12 MiB takes less than the heartbeat lock timeout, an upper bound on how long it holds the run row', async (t) => {
  const { seedBuilderProject, runFor, settle } = await world(t, 'conexus_registry_size')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
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
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const other = await seedBuilderProject('Borealis', ID.workspace, B)
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
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
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

test('two raw sessions race the revision insert: the second waits on the unique index, then reads the first row or inserts after its rollback', async (t) => {
  const { connection, seedBuilderProject } = await world(t, 'conexus_registry_index_race')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const insert = "INSERT INTO reg.artifact_revision(artifact_revision_id, project_id, source_revision, digest, payload) VALUES (gen_random_uuid(), $1, $2, $3, '{}'::jsonb) ON CONFLICT (project_id, source_revision) DO NOTHING"
  const reread = 'SELECT digest FROM reg.artifact_revision WHERE project_id = $1 AND source_revision = $2'
  const session = async () => {
    const client = new pg.Client(connection)
    await client.connect()
    await client.query('SET ROLE hub_command')
    await client.query('BEGIN')
    return client
  }
  for (const outcome of ['COMMIT', 'ROLLBACK']) {
    const source = outcome === 'COMMIT' ? SOURCE_1 : SOURCE_2
    const first = await session()
    const second = await session()
    await first.query(insert, [projectId, source, DIGEST_1])
    const waiting = second.query(insert, [projectId, source, DIGEST_2])
    await waitUntilBlocked(connection)
    await first.query(outcome)
    await waiting
    const seen = (await second.query(reread, [projectId, source])).rows
    await second.query('COMMIT')
    await first.end()
    await second.end()
    assert.deepEqual(seen, [{ digest: outcome === 'COMMIT' ? DIGEST_1 : DIGEST_2 }], outcome)
  }
  assert.equal((await query(connection, 'SELECT count(*)::integer AS n FROM reg.artifact_revision WHERE project_id = $1', [projectId])).rows[0].n, 2)
})

test('a build sealed for one Project is refused under the proof of a run of another, and writes nothing in either', async (t) => {
  const { seedBuilderProject, rows, runFor, sealFor, store } = await world(t, 'conexus_registry_foreign_seal')
  const projectA = await seedBuilderProject('Atlas', ID.workspace, P)
  const projectB = await seedBuilderProject('Borealis', ID.workspace, B)
  const runA = await runFor(projectA)
  const runB = await runFor(projectB)
  const sealedForA = sealFor(projectA, runA, [F], { thumbnail: { bytes: PNG_T2 } })
  await assert.rejects(store.settleBuilderRunBuild({ builderRunId: runB, kind: 'BUILT', sealed: sealedForA }), { id: 'BUILDER_RUN_TRANSITION_REFUSED' })
  assert.deepEqual([await rows(projectA), await rows(projectB)], [{ revisions: 0, thumbnails: 0 }, { revisions: 0, thumbnails: 0 }])
})

test('a call with no account, an outsider with no filter and a member of another workspace read none of the registry rows', async (t) => {
  const { connection, database, seedBuilderProject, served } = await world(t, 'conexus_registry_no_account')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const { second } = await served(projectId)
  const stranger = '10000000-0000-4000-8000-0000000000c1'
  await query(connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'stranger', 'Stranger')", [stranger])
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [stranger, ID.otherWorkspace])
  const Count = z.object({ n: z.number() })
  const unfiltered = (accountId) => database.read(accountId, (tx) => tx.one(Count, sql`SELECT (SELECT count(*) FROM reg.artifact_revision)::integer + (SELECT count(*) FROM reg.application_thumbnail)::integer AS n`, 'INTERNAL_UNEXPECTED'))
  assert.deepEqual([await unfiltered(ID.outsider), await unfiltered(stranger), await unfiltered(ID.administrator)], [{ n: 0 }, { n: 0 }, { n: 0 }])
  await seedRevisionThumbnail(connection, second, PNG_T2)
  assert.deepEqual(await unfiltered(ID.member), { n: 3 })
  assert.deepEqual(await unfiltered(stranger), { n: 0 })

  const client = new pg.Client(connection)
  await client.connect()
  try {
    await client.query('SET ROLE hub_reader')
    const none = await client.query('SELECT (SELECT count(*) FROM reg.artifact_revision)::integer AS revisions, (SELECT count(*) FROM reg.application_thumbnail)::integer AS thumbnails')
    assert.deepEqual(none.rows, [{ revisions: 0, thumbnails: 0 }])
  } finally {
    await client.end()
  }
})

test('an application grantee reads the served revision through the registry on the command role, and a registry fault keeps its own code', async (t) => {
  const { database, seedBuilderProject, registry, served } = await world(t, 'conexus_registry_command_read')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const { second } = await served(projectId)
  const manifest = await servedManifest(database, ID.outsider, projectId)
  assert.equal(manifest?.artifactRevisionId, second)
  const file = await servedFile(database, ID.outsider, projectId, 'index.html')
  assert.equal(file.ok && file.artifactRevisionId, second)
  const launch = await database.transaction(ID.member, async (gate) => registry.readLaunch(await admitProject(gate, { projectId: projectId, action: 'project.build' })))
  assert.deepEqual({ source: launch?.sourceRevision, revision: launch?.artifactRevisionId, digest: launch?.digest }, { source: SOURCE_2, revision: second, digest: DIGEST_2 })

  const { Failure } = await import(hubModuleUrl('platform/failure.js'))
  const busy = createRegistryModule({ database: { ...database, transaction: () => Promise.reject(new Failure('DATABASE_BUSY')), read: () => Promise.reject(new Failure('DATABASE_BUSY')) } })
  await assert.rejects(busy.readProjectThumbnail(ID.member, projectId), { id: 'DATABASE_BUSY' })
})

test('a served read takes no table lock beyond ACCESS SHARE and clearing the pointer answers NOT_SERVED while access remains', async (t) => {
  const { connection, database, seedBuilderProject, served } = await world(t, 'conexus_registry_locks')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  await served(projectId)
  const Locks = z.object({ mode: z.string() })
  const held = await database.transaction(ID.outsider, async (gate) => {
    const checked = await checkApplication(gate, projectId)
    await readServedFileOf(checked.tx, projectId, 'index.html')
    return checked.tx.rows(Locks, sql`SELECT DISTINCT mode FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'relation' AND mode <> 'AccessShareLock' ORDER BY 1`)
  })
  assert.deepEqual(held, [])
  await query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = NULL, last_preview_artifact_revision_id = NULL, last_preview_artifact_digest = NULL WHERE project_id = $1', [projectId])
  assert.deepEqual(await servedFile(database, ID.outsider, projectId, 'index.html'), { ok: false, reason: 'NOT_SERVED' })
  assert.equal(await servedManifest(database, ID.outsider, projectId), null)
})

test('a file request of a revision of 12 MiB transfers only the bytes of the requested file', async (t) => {
  const { connection, seedBuilderProject, grant, point } = await world(t, 'conexus_registry_transfer')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  await grant(projectId)
  const chunk = 'x'.repeat(1024 * 1024)
  const small = fileOf('index.html', 'text/html; charset=utf-8', '<html></html>')
  const parts = Array.from({ length: 11 }, (_, number) => fileOf(`part-${number}.txt`, 'text/plain; charset=utf-8', chunk))
  const filler = fileOf('part-11.txt', 'text/plain; charset=utf-8', 'x'.repeat(1024 * 1024 - small.bytes.byteLength))
  const revision = await seedRevision(connection, projectId, { sourceRevision: SOURCE_2, digest: DIGEST_2, payload: payloadOf([small, ...parts, filler]) })
  await point(projectId, revision, SOURCE_2, DIGEST_2)

  const client = new pg.Client(connection)
  await client.connect()
  try {
    const tx = { maybe: async (schema, statement) => {
      const row = (await client.query(statement.text, [...statement.values])).rows[0]
      return row ? schema.parse(row) : null
    } }
    const before = client.connection.stream.bytesRead
    const answer = await readServedFileOf(tx, projectId, 'index.html')
    const transferred = client.connection.stream.bytesRead - before
    assert.equal(answer.ok, true)
    assert.equal(Buffer.from(answer.file.bytes).toString(), '<html></html>')
    assert.ok(transferred < 4096, `${transferred} bytes crossed the wire for a 13 byte file`)
  } finally {
    await client.end()
  }
})
