import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import pg from 'pg'
import { resolvePgDump } from '../../scripts/generate-hub-baseline.mjs'
import { adminConnection, buildHubDatabase, createEmptyDatabase, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { APPLICATION_SIGN_IN_COOKIE_SECONDS, OIDC_TRANSACTION_SECONDS } = await import(hubModuleUrl('platform/lifetimes.js'))

const SECOND = 1_000_000n
const MINUTE = 60n * SECOND
const HOUR = 60n * MINUTE
const SEALED = 'mastra:factory-secret:v1:token'
const T0 = BigInt(Date.UTC(2031, 0, 1)) * 1000n

const SHIPPED = Object.freeze({ hubAbsolute: 8n * HOUR, hubIdle: 30n * MINUTE, applicationAbsolute: 8n * HOUR, providerRecheck: 5n * MINUTE, preview: 15n * MINUTE, applicationHandoff: 60n * SECOND, previewHandoff: 30n * SECOND })
const VECTOR = Object.freeze({ hubAbsolute: 6n * HOUR, hubIdle: 20n * MINUTE, applicationAbsolute: 6n * HOUR, providerRecheck: 3n * MINUTE, preview: 10n * MINUTE, applicationHandoff: 45n * SECOND, previewHandoff: 20n * SECOND })

const ts = (micros) => {
  const whole = new Date(Number(micros / 1000n)).toISOString().slice(0, 19)
  return `${whole}.${String(((micros % 1_000_000n) + 1_000_000n) % 1_000_000n).padStart(6, '0')}Z`
}
const epoch = (column) => `(extract(epoch from ${column}) * 1000000)::bigint::text`
const interval = (micros) => `interval '${micros} microseconds'`
const replaceOwner = (lifetime) => `CREATE OR REPLACE FUNCTION iam.session_lifetimes() RETURNS iam.session_lifetime LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT ROW(${Object.values(lifetime).map(interval).join(', ')})::iam.session_lifetime $$`

let counter = 0
const digest = (label) => createHash('sha256').update(`${label}-${counter++}`).digest()

const seeded = async (t, prefix) => {
  const database = await buildHubDatabase(t, prefix)
  const client = new pg.Client({ connectionString: database.connectionString })
  await client.connect()
  database.onCleanup(() => client.end())
  await client.query("SET TIME ZONE 'UTC'")
  const owner = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  await client.query("INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://lifetimes.test', $2, 'Owner')", [owner, owner])
  await client.query("INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Lifetimes')", [workspaceId])
  await client.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [owner, workspaceId])
  await client.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'p', 'NEW', $3, 'p')", [projectId, workspaceId, 'a'.repeat(40)])
  await client.query("INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'lifetimes-app', $2)", [projectId, owner])
  const one = async (sql, values = []) => (await client.query(sql, values)).rows[0]
  const sessionOf = (token) => one(`SELECT kind, ${epoch('started_at')} AS started, ${epoch('absolute_expires_at')} AS absolute, ${epoch('idle_expires_at')} AS idle, ${epoch('provider_checked_at')} AS checked, ended_reason, provider_refresh_token FROM iam.host_session WHERE token_digest = $1`, [token])

  const openHub = async (now) => {
    const token = digest('hub')
    const outcome = (await one('SELECT iam.open_hub_session($1, $2, $3, $4) AS outcome', [token, owner, SEALED, ts(now)])).outcome
    return { token, outcome }
  }
  const insertHub = async ({ token = digest('hub-row'), started, absolute, idle, checked = started }) => {
    await client.query(`INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, idle_expires_at, provider_refresh_token, provider_checked_at)
      VALUES ($1, 'HUB', $2, $3, $4, $5, $6, $7)`, [token, owner, ts(started), ts(absolute), ts(idle), SEALED, ts(checked)])
    return token
  }
  const insertApplication = async ({ token = digest('app-row'), started, absolute, checked = started }) => {
    await client.query(`INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, project_id, provider_refresh_token, provider_checked_at)
      VALUES ($1, 'APPLICATION', $2, $3, $4, $5, $6, $7)`, [token, owner, ts(started), ts(absolute), projectId, SEALED, ts(checked)])
    return token
  }
  const insertPreview = async ({ opened, expires }) => {
    const previewId = randomUUID()
    const revision = randomUUID()
    const exactHost = `preview-${revision}.conexus.localhost`
    await client.query(`INSERT INTO iam.preview(preview_id, account_id, project_id, source_revision, artifact_revision_id, artifact_digest, exact_host, manifest, opened_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, '{"entryPath":"index.html","files":[]}', $8, $9)`, [previewId, owner, projectId, 'b'.repeat(40), revision, 'f'.repeat(64), exactHost, ts(opened), ts(expires)])
    return { previewId, exactHost }
  }
  const insertPreviewSession = async ({ started, absolute, previewId, parent }) => {
    const token = digest('preview-session')
    await client.query(`INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, preview_id, parent_digest)
      VALUES ($1, 'PREVIEW', $2, $3, $4, $5, $6)`, [token, owner, ts(started), ts(absolute), previewId, parent])
    return token
  }
  const mint = async (authenticatedAt) => {
    const handoff = digest('app-handoff')
    const binding = digest('binding')
    const minted = (await one('SELECT iam.mint_application_handoff($1, $2, $3, $4, $5, $6) AS minted', [owner, projectId, handoff, binding, SEALED, ts(authenticatedAt)])).minted
    return { handoff, binding, minted }
  }
  const handoffOf = (handoff) => one(`SELECT ${epoch('minted_at')} AS minted, ${epoch('expires_at')} AS expires FROM iam.handoff WHERE handoff_digest = $1`, [handoff])
  const launch = async (hub, now) => {
    const revision = randomUUID()
    const exactHost = `preview-${revision}.conexus.localhost`
    const handoff = digest('preview-handoff')
    const deadline = (await one(`SELECT ${epoch('iam.open_preview($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)')} AS deadline`,
      [hub, owner, projectId, 'b'.repeat(40), revision, 'f'.repeat(64), exactHost, '{"entryPath":"index.html","files":[]}', handoff, ts(now)])).deadline
    const preview = await one(`SELECT preview_id, ${epoch('opened_at')} AS opened, ${epoch('expires_at')} AS expires FROM iam.preview WHERE exact_host = $1`, [exactHost])
    return { handoff, exactHost, deadline, preview }
  }
  const redeem = async (kind, handoff, { exactHost = 'unused.conexus.localhost', binding = null, now }) => {
    const token = digest('redeemed')
    const deadline = (await one(`SELECT ${epoch('iam.redeem_handoff($1, $2, $3, $4, $5, $6, $7)')} AS deadline`, [kind, handoff, projectId, exactHost, binding, token, ts(now)])).deadline
    return { token, deadline }
  }
  const resolveHub = (token, now) => client.query('SELECT account_id, due_provider_refresh_token FROM iam.resolve_hub_session($1, $2)', [token, ts(now)]).then((result) => result.rows)
  const resolveApplication = (token, now) => client.query('SELECT account_id, due_provider_refresh_token FROM iam.resolve_application_session($1, $2, $3)', [token, projectId, ts(now)]).then((result) => result.rows)
  const resolvePreview = (token, exactHost, now) => client.query('SELECT account_id, due_hub_refresh_token FROM iam.resolve_preview_session($1, $2, $3)', [token, exactHost, ts(now)]).then((result) => result.rows)
  return { ...database, client, owner, projectId, one, sessionOf, openHub, insertHub, insertApplication, insertPreview, insertPreviewSession, mint, handoffOf, launch, redeem, resolveHub, resolveApplication, resolvePreview }
}

const oracle = async (t, db, L, at) => {
  const now = T0 + at
  const equal = (actual, expected, message) => assert.equal(actual, String(expected), message)

  await t.test('open_hub_session stores now + hub_absolute and now + hub_idle', async () => {
    const opened = await db.openHub(now)
    assert.equal(opened.outcome, 'OPENED')
    const row = await db.sessionOf(opened.token)
    equal(row.started, now)
    equal(row.absolute, now + L.hubAbsolute)
    equal(row.idle, now + L.hubIdle)
    equal(row.checked, now)
  })

  await t.test('resolve_hub_session slides the idle limit to least(now + hub_idle, absolute)', async () => {
    const opened = await db.openHub(now)
    const later = now + MINUTE
    assert.equal((await db.resolveHub(opened.token, later)).length, 1)
    equal((await db.sessionOf(opened.token)).idle, later + L.hubIdle)
    const capped = await db.insertHub({ started: now, absolute: now + L.hubIdle / 2n, idle: now + L.hubIdle / 2n })
    assert.equal((await db.resolveHub(capped, now + 1n)).length, 1)
    equal((await db.sessionOf(capped)).idle, now + L.hubIdle / 2n)
  })

  for (const [name, idle, absolute] of [['idle limit', now + HOUR, now + 2n * HOUR], ['absolute limit', now + HOUR, now + HOUR]]) {
    await t.test(`resolve_hub_session ends a session at its ${name}, and not one microsecond before`, async () => {
      for (const [offset, expected] of [[-1n, 'live'], [0n, 'EXPIRED'], [1n, 'EXPIRED']]) {
        const token = await db.insertHub({ started: now, absolute, idle })
        const rows = await db.resolveHub(token, idle + offset)
        const row = await db.sessionOf(token)
        if (expected === 'live') {
          assert.equal(rows.length, 1, `live at ${offset}`)
          assert.equal(row.ended_reason, null)
        } else {
          assert.equal(rows.length, 0, `ended at ${offset}`)
          assert.equal(row.ended_reason, 'EXPIRED')
          assert.equal(row.provider_refresh_token, null)
        }
      }
    })
  }

  await t.test('the provider recheck is due at equality, in the Hub, application and Preview readers', async () => {
    for (const [offset, due] of [[-1n, true], [0n, true], [1n, false]]) {
      const checked = now - L.providerRecheck + offset
      const hub = await db.insertHub({ started: now - 10n * HOUR, absolute: now + 3n * HOUR, idle: now + HOUR, checked })
      assert.equal((await db.resolveHub(hub, now))[0].due_provider_refresh_token === SEALED, due, `Hub at ${offset}`)

      const application = await db.insertApplication({ started: now - HOUR, absolute: now + HOUR, checked })
      assert.equal((await db.resolveApplication(application, now))[0].due_provider_refresh_token === SEALED, due, `application at ${offset}`)

      const parent = await db.insertHub({ started: now - 10n * HOUR, absolute: now + 3n * HOUR, idle: now + HOUR, checked })
      const { previewId, exactHost } = await db.insertPreview({ opened: now - MINUTE, expires: now + HOUR })
      const session = await db.insertPreviewSession({ started: now - MINUTE, absolute: now + HOUR, previewId, parent })
      assert.equal((await db.resolvePreview(session, exactHost, now))[0].due_hub_refresh_token === SEALED, due, `Preview at ${offset}`)
    }
  })

  await t.test('mint_application_handoff stores authenticated_at and authenticated_at + application_handoff', async () => {
    const { handoff, minted } = await db.mint(now)
    assert.equal(minted, true)
    const row = await db.handoffOf(handoff)
    equal(row.minted, now)
    equal(row.expires, now + L.applicationHandoff)
  })

  await t.test('open_preview stores now + preview, now + preview_handoff and returns now + preview', async () => {
    const hub = (await db.openHub(now)).token
    const launched = await db.launch(hub, now)
    equal(launched.deadline, now + L.preview)
    equal(launched.preview.opened, now)
    equal(launched.preview.expires, now + L.preview)
    const handoff = await db.handoffOf(launched.handoff)
    equal(handoff.minted, now)
    equal(handoff.expires, now + L.previewHandoff)
  })

  await t.test('redeem_handoff redeems strictly before the handoff expires', async () => {
    const expires = now + L.applicationHandoff
    for (const [offset, redeemable] of [[-1n, true], [0n, false], [1n, false]]) {
      const { handoff, binding } = await db.mint(now)
      const redeemed = await db.redeem('APPLICATION', handoff, { binding, now: expires + offset })
      assert.equal(redeemed.deadline !== null, redeemable, `application at ${offset}`)
    }
    const previewExpires = now + L.previewHandoff
    for (const [offset, redeemable] of [[-1n, true], [0n, false], [1n, false]]) {
      const hub = (await db.openHub(now)).token
      const launched = await db.launch(hub, now)
      const redeemed = await db.redeem('PREVIEW', launched.handoff, { exactHost: launched.exactHost, now: previewExpires + offset })
      assert.equal(redeemed.deadline !== null, redeemable, `Preview at ${offset}`)
    }
  })

  await t.test('redeem_handoff APPLICATION starts the session at minted_at and lasts application_absolute', async () => {
    const { handoff, binding } = await db.mint(now)
    const redeemed = await db.redeem('APPLICATION', handoff, { binding, now: now + 10n * SECOND })
    equal(redeemed.deadline, now + L.applicationAbsolute)
    const row = await db.sessionOf(redeemed.token)
    equal(row.started, now)
    equal(row.absolute, now + L.applicationAbsolute)
    equal(row.checked, now)
  })

  await t.test('redeem_handoff PREVIEW starts the session now and ends at least(now + preview, the Preview deadline)', async () => {
    const hub = (await db.openHub(now)).token
    const launched = await db.launch(hub, now)
    const redeemedAt = now + 10n * SECOND
    const capped = await db.redeem('PREVIEW', launched.handoff, { exactHost: launched.exactHost, now: redeemedAt })
    equal(capped.deadline, now + L.preview)
    const cappedRow = await db.sessionOf(capped.token)
    equal(cappedRow.started, redeemedAt)
    equal(cappedRow.absolute, now + L.preview)

    const longPreview = await db.insertPreview({ opened: now, expires: now + 24n * HOUR })
    const handoff = digest('direct-preview-handoff')
    await db.client.query("INSERT INTO iam.handoff(handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at) VALUES ($1, 'PREVIEW', $2, $3, $4, $5, $6)",
      [handoff, db.owner, longPreview.previewId, hub, ts(now), ts(now + 1n)])
    const free = await db.redeem('PREVIEW', handoff, { exactHost: longPreview.exactHost, now })
    equal(free.deadline, now + L.preview)
  })
}

test('every writer of a session lifetime stores the deadline of the oracle table', async (t) => {
  const db = await seeded(t, 'conexus_lifetimes_oracle')
  assert.equal((await db.one('SELECT iam.session_lifetimes()::text AS lifetimes')).lifetimes, '(08:00:00,00:30:00,08:00:00,00:05:00,00:15:00,00:01:00,00:00:30)')
  await oracle(t, db, SHIPPED, 0n)
})

test('the checks hold shape only, and iam.end_host_session ends an expired open row under them', async (t) => {
  const db = await seeded(t, 'conexus_lifetimes_shape')

  await t.test('no check on the three tables reads a duration or a function', async () => {
    const definitions = (await db.client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid IN ('iam.host_session'::regclass, 'iam.preview'::regclass, 'iam.handoff'::regclass) AND contype = 'c' ORDER BY conname`)).rows
    assert.deepEqual(definitions.map((row) => row.conname), [
      'handoff_application_check', 'handoff_kind_check', 'handoff_preview_check', 'handoff_token_sealed_check', 'handoff_ttl_check',
      'host_session_application_check', 'host_session_end_check', 'host_session_hub_check', 'host_session_kind_check',
      'host_session_preview_check', 'host_session_reason_check', 'host_session_token_sealed_check', 'preview_host_check',
      'preview_lifetime_check', 'preview_manifest_check'])
    for (const { conname, definition } of definitions) {
      if (!/ttl|lifetime|hub_check|application_check|preview_check/.test(conname)) continue
      assert.doesNotMatch(definition, /interval|session_lifetimes|\(\)/, conname)
    }
  })

  await t.test('a row of any length passes, and a row out of order does not', async () => {
    await db.insertHub({ started: T0, absolute: T0 + 40n * HOUR, idle: T0 + HOUR })
    await db.insertApplication({ started: T0, absolute: T0 + 40n * HOUR })
    const parent = await db.insertHub({ started: T0, absolute: T0 + HOUR, idle: T0 + HOUR })
    const preview = await db.insertPreview({ opened: T0, expires: T0 + 40n * HOUR })
    await db.insertPreviewSession({ started: T0, absolute: T0 + 40n * HOUR, previewId: preview.previewId, parent })
    await assert.rejects(db.insertHub({ started: T0, absolute: T0 + HOUR, idle: T0 + HOUR + 1n }), /host_session_hub_check/)
    await assert.rejects(db.insertHub({ started: T0, absolute: T0, idle: T0 }), /host_session_hub_check/)
    await assert.rejects(db.insertApplication({ started: T0, absolute: T0 }), /host_session_application_check/)
    await assert.rejects(db.insertPreview({ opened: T0, expires: T0 }), /preview_lifetime_check/)
    const lateHandoff = db.client.query("INSERT INTO iam.handoff(handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at) VALUES ($1, 'PREVIEW', $2, $3, $4, $5, $5)",
      [digest('flat'), db.owner, preview.previewId, parent, ts(T0)])
    await assert.rejects(lateHandoff, /handoff_ttl_check/)
  })

  await t.test('iam.end_host_session ends an expired open Hub, application and Preview row', async () => {
    const hub = await db.insertHub({ started: T0, absolute: T0 + 3n * HOUR, idle: T0 + HOUR })
    const application = await db.insertApplication({ started: T0, absolute: T0 + 5n * HOUR })
    const { previewId } = await db.insertPreview({ opened: T0, expires: T0 + 7n * HOUR })
    const child = await db.insertPreviewSession({ started: T0, absolute: T0 + 7n * HOUR, previewId, parent: hub })
    for (const token of [hub, application]) {
      await db.client.query("SELECT iam.end_host_session($1, 'EXPIRED')", [token])
      const row = await db.sessionOf(token)
      assert.equal(row.ended_reason, 'EXPIRED')
      assert.equal(row.provider_refresh_token, null)
    }
    assert.equal((await db.sessionOf(child)).ended_reason, 'PARENT_ENDED')
  })

  await t.test('the CSRF column and the old signatures are gone, the new ones answer', async () => {
    const columns = (await db.client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'iam' AND table_name = 'host_session'")).rows.map((row) => row.column_name)
    assert.equal(columns.includes('csrf_digest'), false)
    const signatures = (await db.client.query(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid) AS signature
      FROM pg_proc AS p WHERE p.pronamespace = 'iam'::regnamespace AND p.proname IN ('open_hub_session', 'resolve_hub_session', 'end_hub_session', 'session_lifetimes') ORDER BY 1`)).rows.map((row) => row.signature)
    assert.deepEqual(signatures, [
      'end_hub_session(p_session_digest bytea) -> text',
      'open_hub_session(p_session_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone) -> text',
      'resolve_hub_session(p_session_digest bytea, p_now timestamp with time zone) -> TABLE(account_id uuid, issuer text, subject text, display_name text, email text, provider_checked_at timestamp with time zone, due_provider_refresh_token text)',
      'session_lifetimes() -> iam.session_lifetime',
    ])
    const owner = await db.one("SELECT provolatile, pg_get_userbyid(proowner) AS owner, has_function_privilege('hub_iam_runtime', oid, 'EXECUTE') AS runtime, has_function_privilege('public', oid, 'EXECUTE') AS everyone FROM pg_proc WHERE oid = 'iam.session_lifetimes()'::regprocedure")
    assert.deepEqual(owner, { provolatile: 's', owner: 'iam_owner', runtime: false, everyone: false })
  })

  await t.test('end_hub_session hands the sealed token back once', async () => {
    const { token } = await db.openHub(T0)
    assert.equal((await db.one('SELECT iam.end_hub_session($1) AS sealed', [token])).sealed, SEALED)
    assert.equal((await db.one('SELECT iam.end_hub_session($1) AS sealed', [token])).sealed, null)
    assert.equal((await db.sessionOf(token)).ended_reason, 'SIGNED_OUT')
  })
})

const COMPARED = ['iam.host_session', 'iam.preview', 'iam.handoff']
const contentsOf = async (client) => {
  const contents = {}
  for (const table of COMPARED) contents[table] = (await client.query(`SELECT row_to_json(row_of)::text AS row FROM ${table} AS row_of ORDER BY 1`)).rows.map((row) => row.row)
  return contents
}

const databaseTool = (tool, serverMajor) => {
  const container = process.env.CONEXUS_TEST_DB_CONTAINER
  if (container) return { command: 'docker', prefix: ['exec', '-i', container, tool] }
  const dump = resolvePgDump(serverMajor)
  return { command: tool === 'pg_dump' ? dump : dump.replace(/pg_dump$/, tool), prefix: [] }
}
const run = ({ command, prefix }, args, input) => {
  const done = spawnSync(command, [...prefix, ...args], { input, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PGPASSWORD: adminConnection().password } })
  assert.equal(done.status, 0, `${command} ${args[0]}: ${done.stderr?.toString().slice(0, 400)}`)
  return done.stdout
}

test('a replaced owner reaches a warm connection, leaves old rows working, and survives pg_dump and pg_restore', async (t) => {
  const db = await seeded(t, 'conexus_lifetimes_replace')
  await oracle(t, db, SHIPPED, 0n)

  const hub = (await db.openHub(T0 + 100n * HOUR)).token
  const application = await db.mint(T0 + 100n * HOUR)
  const applicationSession = (await db.redeem('APPLICATION', application.handoff, { binding: application.binding, now: T0 + 100n * HOUR + SECOND })).token
  const launched = await db.launch(hub, T0 + 100n * HOUR)
  const previewSession = (await db.redeem('PREVIEW', launched.handoff, { exactHost: launched.exactHost, now: T0 + 100n * HOUR + SECOND })).token
  const pending = await db.mint(T0 + 100n * HOUR)

  const admin = new pg.Client({ connectionString: db.connectionString })
  await admin.connect()
  try {
    await admin.query(replaceOwner(VECTOR))
  } finally {
    await admin.end()
  }
  assert.equal((await db.one('SELECT iam.session_lifetimes()::text AS lifetimes')).lifetimes, '(06:00:00,00:20:00,06:00:00,00:03:00,00:10:00,00:00:45,00:00:20)')

  await oracle(t, db, VECTOR, 1_000n * HOUR)

  await t.test('rows written before the change still slide, recheck and end', async () => {
    const slideAt = T0 + 100n * HOUR + 4n * MINUTE
    const [slid] = await db.resolveHub(hub, slideAt)
    assert.equal(slid.due_provider_refresh_token, SEALED, 'due at 3 minutes under the new owner, not yet at the old 5')
    assert.equal((await db.sessionOf(hub)).idle, String(slideAt + VECTOR.hubIdle))
    assert.equal((await db.sessionOf(hub)).absolute, String(T0 + 100n * HOUR + SHIPPED.hubAbsolute), 'the old deadline stays')
    assert.equal((await db.resolveApplication(applicationSession, slideAt))[0].due_provider_refresh_token, SEALED)
    assert.equal((await db.resolvePreview(previewSession, launched.exactHost, slideAt))[0].due_hub_refresh_token, SEALED)
    assert.equal((await db.one('SELECT iam.end_hub_session($1) AS sealed', [hub])).sealed, SEALED)
    assert.equal((await db.sessionOf(previewSession)).ended_reason, 'PARENT_ENDED')
    await db.client.query("SELECT iam.end_host_session($1, 'EXPIRED')", [applicationSession])
    assert.equal((await db.sessionOf(applicationSession)).ended_reason, 'EXPIRED')
    assert.equal((await db.handoffOf(pending.handoff)).expires, String(T0 + 100n * HOUR + SHIPPED.applicationHandoff), 'a pending handoff keeps its deadline')
  })

  await t.test('pg_dump then pg_restore gives equal counts and contents', async () => {
    const before = await contentsOf(db.client)
    for (const table of COMPARED) assert.ok(before[table].length > 0, `${table} has rows to compare`)
    const serverMajor = Number((await db.one("SELECT current_setting('server_version_num')::int / 10000 AS major")).major)
    const connection = adminConnection()
    const target = await createEmptyDatabase(t, 'conexus_lifetimes_restored')
    const source = new URL(db.connectionString).pathname.slice(1)
    const restoreTarget = new URL(target.connectionString).pathname.slice(1)
    const where = process.env.CONEXUS_TEST_DB_CONTAINER ? [] : ['-h', connection.host, '-p', String(connection.port), '--no-password']
    const dump = run(databaseTool('pg_dump', serverMajor), ['-Fc', ...where, '-U', connection.user, '-d', source])
    run(databaseTool('pg_restore', serverMajor), [...where, '-U', connection.user, '--exit-on-error', '-d', restoreTarget], dump)
    const restored = new pg.Client({ connectionString: target.connectionString })
    await restored.connect()
    target.onCleanup(() => restored.end())
    const after = await contentsOf(restored)
    for (const table of COMPARED) assert.equal(after[table].length, before[table].length, `${table} row count`)
    assert.deepEqual(after, before)
    assert.equal((await restored.query('SELECT iam.session_lifetimes()::text AS lifetimes')).rows[0].lifetimes, '(06:00:00,00:20:00,06:00:00,00:03:00,00:10:00,00:00:45,00:00:20)')
  })
})

test('the window and Keycloak relations hold against iam.session_lifetimes()', async (t) => {
  const database = await buildHubDatabase(t, 'conexus_lifetimes_relations')
  const seconds = (await query(database.connectionString, `SELECT extract(epoch from l.hub_absolute)::int AS hub_absolute, extract(epoch from l.hub_idle)::int AS hub_idle,
      extract(epoch from l.application_absolute)::int AS application_absolute, extract(epoch from l.provider_recheck)::int AS provider_recheck,
      extract(epoch from l.application_handoff)::int AS application_handoff FROM (SELECT (iam.session_lifetimes()).*) AS l`)).rows[0]
  assert.deepEqual(seconds, { hub_absolute: 28800, hub_idle: 1800, application_absolute: 28800, provider_recheck: 300, application_handoff: 60 })

  await t.test('AC-18: the sign-in cookie outlives the OIDC transaction by the application handoff', () => {
    assert.ok(APPLICATION_SIGN_IN_COOKIE_SECONDS >= OIDC_TRANSACTION_SECONDS + seconds.application_handoff)
  })

  await t.test('AC-19: the realm outlives every session it backs', () => {
    const realm = JSON.parse(readFileSync(new URL('../../infra/keycloak/realm-conexus.json', import.meta.url), 'utf8'))
    assert.ok(realm.ssoSessionIdleTimeout > seconds.hub_idle + seconds.provider_recheck, 'ssoSessionIdleTimeout')
    assert.ok(realm.ssoSessionMaxLifespan >= seconds.hub_absolute, 'ssoSessionMaxLifespan against the Hub')
    assert.ok(realm.ssoSessionMaxLifespan >= seconds.application_absolute, 'ssoSessionMaxLifespan against applications')
    assert.ok(realm.accessTokenLifespan <= seconds.provider_recheck, 'accessTokenLifespan')
  })
})
