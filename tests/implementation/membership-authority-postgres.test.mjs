import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every(name => process.env[name])
const connect = async (connection) => { const client = new pg.Client(connection); await client.connect(); return client }

const ACTIONS = ['workspace.read', 'members.manage', 'project.create', 'project.read', 'project.change', 'project.build', 'connection.share']

const refusal = async (run) => {
  try {
    await run()
  } catch (error) {
    return { code: error.code, message: error.message }
  }
  return { code: null, message: null }
}

test('the membership authority derives every right from one role row and revokes without a race', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const admin = { host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT), database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD }
  const database = `conexus_membership_authority_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const rootClient = await connect(admin)
  await rootClient.query(`CREATE DATABASE "${database}"`)
  const current = { ...admin, database }
  let client
  t.after(async () => {
    await client?.end()
    await rootClient.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await rootClient.end()
  })
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = current.host
  connectionString.port = String(current.port)
  connectionString.pathname = `/${database}`
  connectionString.username = current.user
  connectionString.password = current.password
  await runCurrentHubMigrations({ connectionString: connectionString.toString() })
  client = await connect(current)

  const account = async (label, { active = true } = {}) => {
    const accountId = randomUUID()
    await client.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,$6)',
      [accountId, 'https://membership.test', accountId, label, `${label}@membership.test`, active])
    return accountId
  }
  const workspace = async (label) => {
    const workspaceId = randomUUID()
    await client.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, label])
    return workspaceId
  }
  const member = (accountId, workspaceId, role) =>
    client.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,$3)', [accountId, workspaceId, role])
  const project = async (workspaceId, label) => {
    const projectId = randomUUID()
    await client.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1,$2,$3,'NEW',$4,$5)",
      [projectId, workspaceId, label, 'a'.repeat(40), label])
    return projectId
  }
  const admits = async (accountId, workspaceId, action) => {
    const outcome = await refusal(() => client.query('SELECT iam.admit_workspace($1,$2,$3)', [accountId, workspaceId, action]))
    if (outcome.code === null) return true
    if (outcome.code === '42501' && outcome.message === 'NOT_ADMITTED') return false
    throw new Error(`unexpected refusal ${outcome.code} ${outcome.message}`)
  }

  await t.test('two roles across seven actions decide admission exactly one way', async () => {
    const workspaceId = await workspace('matrix')
    const owner = await account('matrix-owner')
    const plain = await account('matrix-member')
    await member(owner, workspaceId, 'owner')
    await member(plain, workspaceId, 'member')

    const observed = []
    for (const role of ['owner', 'member']) {
      for (const action of ACTIONS) {
        observed.push(`${role} ${action} ${await admits(role === 'owner' ? owner : plain, workspaceId, action)}`)
      }
    }
    assert.deepEqual(observed, [
      'owner workspace.read true',
      'owner members.manage true',
      'owner project.create true',
      'owner project.read true',
      'owner project.change true',
      'owner project.build true',
      'owner connection.share true',
      'member workspace.read true',
      'member members.manage false',
      'member project.create true',
      'member project.read true',
      'member project.change true',
      'member project.build true',
      'member connection.share true',
    ])
  })

  await t.test('an inactive account is admitted nowhere and sees nothing', async () => {
    const workspaceId = await workspace('inactive')
    const dormant = await account('dormant', { active: false })
    await member(dormant, workspaceId, 'owner')
    const projectId = await project(workspaceId, 'inactive-project')

    assert.deepEqual(await refusal(() => client.query('SELECT iam.admit_workspace($1,$2,$3)', [dormant, workspaceId, 'project.read'])),
      { code: '42501', message: 'NOT_ADMITTED' })
    assert.deepEqual(await refusal(() => client.query('SELECT iam.admit_project($1,$2,$3)', [dormant, projectId, 'project.read'])),
      { code: '42501', message: 'NOT_ADMITTED' })
    assert.deepEqual((await client.query('SELECT * FROM iam.visible_workspaces($1)', [dormant])).rows, [])
    assert.deepEqual((await client.query('SELECT * FROM iam.visible_projects($1)', [dormant])).rows, [])
  })

  await t.test('reads run inside a read-only transaction and effects do not', async () => {
    const workspaceId = await workspace('read-only')
    const owner = await account('read-only-owner')
    await member(owner, workspaceId, 'owner')
    const projectId = await project(workspaceId, 'read-only-project')

    const reader = await connect(current)
    try {
      await reader.query('BEGIN READ ONLY')
      assert.deepEqual((await reader.query('SELECT workspace_id, role FROM iam.visible_workspaces($1)', [owner])).rows,
        [{ workspace_id: workspaceId, role: 'owner' }])
      assert.deepEqual((await reader.query('SELECT project_id, workspace_id FROM iam.visible_projects($1)', [owner])).rows,
        [{ project_id: projectId, workspace_id: workspaceId }])

      const refusedWorkspace = await refusal(() => reader.query('SELECT iam.admit_workspace($1,$2,$3)', [owner, workspaceId, 'project.build']))
      assert.equal(refusedWorkspace.code, '25006')
      assert.match(refusedWorkspace.message, /read-only transaction/)
      await reader.query('ROLLBACK')

      await reader.query('BEGIN READ ONLY')
      const refusedProject = await refusal(() => reader.query('SELECT iam.admit_project($1,$2,$3)', [owner, projectId, 'project.build']))
      assert.equal(refusedProject.code, '25006')
      assert.match(refusedProject.message, /read-only transaction/)
      await reader.query('ROLLBACK')
    } finally {
      await reader.end()
    }
  })

  await t.test('a removal waits for an admitted effect and answers no from the next statement', async () => {
    const workspaceId = await workspace('revocation')
    const owner = await account('revocation-owner')
    const worker = await account('revocation-worker')
    await member(owner, workspaceId, 'owner')
    await member(worker, workspaceId, 'member')
    const projectId = await project(workspaceId, 'revocation-project')

    const running = await connect(current)
    const revoking = await connect(current)
    try {
      await running.query('BEGIN')
      assert.equal((await running.query('SELECT iam.admit_project($1,$2,$3) AS workspace_id', [worker, projectId, 'project.build'])).rows[0].workspace_id, workspaceId)

      let settled = false
      const removal = revoking.query('SELECT iam.remove_workspace_member($1,$2,$3)', [owner, workspaceId, worker])
        .then(() => { settled = true })
      await delay(500)
      assert.equal(settled, false, 'the removal must block while an admitted effect holds its rows')

      await running.query('COMMIT')
      await removal
      assert.equal(settled, true)

      assert.deepEqual(await refusal(() => client.query('SELECT iam.admit_project($1,$2,$3)', [worker, projectId, 'project.build'])),
        { code: '42501', message: 'NOT_ADMITTED' })
    } finally {
      await running.end()
      await revoking.end()
    }
  })

  await t.test('the last owner can be neither removed nor demoted', async () => {
    const workspaceId = await workspace('last-owner')
    const owner = await account('last-owner-owner')
    const plain = await account('last-owner-member')
    await member(owner, workspaceId, 'owner')
    await member(plain, workspaceId, 'member')

    assert.deepEqual(await refusal(() => client.query('SELECT iam.remove_workspace_member($1,$2,$3)', [owner, workspaceId, owner])),
      { code: '42501', message: 'LAST_OWNER' })
    assert.deepEqual(await refusal(() => client.query('SELECT iam.set_workspace_member_role($1,$2,$3,$4)', [owner, workspaceId, owner, 'member'])),
      { code: '42501', message: 'LAST_OWNER' })
    assert.deepEqual((await client.query('SELECT role FROM iam.workspace_membership WHERE workspace_id = $1 AND account_id = $2', [workspaceId, owner])).rows,
      [{ role: 'owner' }])

    await client.query('SELECT iam.remove_workspace_member($1,$2,$3)', [plain, workspaceId, plain])
    assert.deepEqual((await client.query('SELECT count(*)::int AS remaining FROM iam.workspace_membership WHERE workspace_id = $1', [workspaceId])).rows,
      [{ remaining: 1 }])
  })

  await t.test('two owners demoting each other leave exactly one owner and no deadlock', async () => {
    const workspaceId = await workspace('mutual-demotion')
    const first = await account('mutual-first')
    const second = await account('mutual-second')
    await member(first, workspaceId, 'owner')
    await member(second, workspaceId, 'owner')

    const firstClient = await connect(current)
    const secondClient = await connect(current)
    try {
      await firstClient.query('BEGIN')
      await secondClient.query('BEGIN')
      const firstDemotion = refusal(() => firstClient.query('SELECT iam.set_workspace_member_role($1,$2,$3,$4)', [first, workspaceId, second, 'member']))
      await delay(300)
      const secondDemotion = refusal(() => secondClient.query('SELECT iam.set_workspace_member_role($1,$2,$3,$4)', [second, workspaceId, first, 'member']))

      const firstOutcome = await firstDemotion
      await firstClient.query('COMMIT')
      const secondOutcome = await secondDemotion
      await secondClient.query('COMMIT')
      const outcomes = [firstOutcome, secondOutcome]

      assert.equal(outcomes.some(outcome => outcome.code === '40P01'), false, `a deadlock was reported: ${JSON.stringify(outcomes)}`)
      assert.deepEqual(outcomes, [
        { code: null, message: null },
        { code: '42501', message: 'NOT_ADMITTED' },
      ])
      assert.deepEqual((await client.query("SELECT count(*)::int AS owners FROM iam.workspace_membership WHERE workspace_id = $1 AND role = 'owner'", [workspaceId])).rows,
        [{ owners: 1 }])
    } finally {
      await firstClient.end()
      await secondClient.end()
    }
  })

  await t.test('inviting the same email twice keeps one row carrying the second role', async () => {
    const workspaceId = await workspace('invitation')
    const owner = await account('invitation-owner')
    await member(owner, workspaceId, 'owner')
    const expiry = new Date(Date.now() + 86_400_000)

    const firstId = (await client.query('SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6) AS invitation_id',
      [owner, workspaceId, randomUUID(), 'Bruno@Empresa.com', 'member', expiry])).rows[0].invitation_id
    const secondId = (await client.query('SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6) AS invitation_id',
      [owner, workspaceId, randomUUID(), 'bruno@empresa.com', 'owner', expiry])).rows[0].invitation_id

    assert.equal(secondId, firstId)
    assert.deepEqual((await client.query('SELECT email, role FROM iam.workspace_invitation WHERE workspace_id = $1', [workspaceId])).rows,
      [{ email: 'bruno@empresa.com', role: 'owner' }])
  })

  await t.test('a member cannot invite, and an owner can cancel an invitation idempotently', async () => {
    const workspaceId = await workspace('invitation-authority')
    const owner = await account('invitation-authority-owner')
    const plain = await account('invitation-authority-member')
    await member(owner, workspaceId, 'owner')
    await member(plain, workspaceId, 'member')
    const expiry = new Date(Date.now() + 86_400_000)

    assert.deepEqual(await refusal(() => client.query('SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6)',
      [plain, workspaceId, randomUUID(), 'carla@empresa.com', 'member', expiry])), { code: '42501', message: 'NOT_ADMITTED' })

    const invitationId = (await client.query('SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6) AS invitation_id',
      [owner, workspaceId, randomUUID(), 'carla@empresa.com', 'member', expiry])).rows[0].invitation_id
    assert.deepEqual(await refusal(() => client.query('SELECT iam.cancel_workspace_invitation($1,$2)', [plain, invitationId])),
      { code: '42501', message: 'NOT_ADMITTED' })

    await client.query('SELECT iam.cancel_workspace_invitation($1,$2)', [owner, invitationId])
    await client.query('SELECT iam.cancel_workspace_invitation($1,$2)', [owner, invitationId])
    assert.deepEqual((await client.query('SELECT count(*)::int AS pending FROM iam.workspace_invitation WHERE workspace_id = $1', [workspaceId])).rows,
      [{ pending: 0 }])
  })

  await t.test('claiming keeps an existing role and leaves an expired invitation alone', async () => {
    const keptWorkspaceId = await workspace('claim-kept')
    const expiredWorkspaceId = await workspace('claim-expired')
    const freshWorkspaceId = await workspace('claim-fresh')
    const owner = await account('claim-owner')
    const joiner = await account('claim-joiner')
    await member(owner, keptWorkspaceId, 'owner')
    await member(owner, expiredWorkspaceId, 'owner')
    await member(owner, freshWorkspaceId, 'owner')
    await member(joiner, keptWorkspaceId, 'owner')

    const email = 'claim-joiner@membership.test'
    const future = new Date(Date.now() + 86_400_000)
    await client.query('SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6)', [owner, keptWorkspaceId, randomUUID(), email, 'member', future])
    await client.query('SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6)', [owner, freshWorkspaceId, randomUUID(), email, 'member', future])
    await client.query('SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6)', [owner, expiredWorkspaceId, randomUUID(), email, 'member', new Date(Date.now() - 1000)])

    assert.equal((await client.query('SELECT iam.claim_invitations($1,$2) AS claimed', [joiner, 'Claim-Joiner@Membership.test'])).rows[0].claimed, 2)
    assert.deepEqual((await client.query('SELECT workspace_id, role FROM iam.visible_workspaces($1) ORDER BY role, workspace_id', [joiner])).rows.map(row => row.role),
      ['owner', 'member'])
    assert.deepEqual((await client.query('SELECT role FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [joiner, keptWorkspaceId])).rows,
      [{ role: 'owner' }])
    assert.deepEqual((await client.query('SELECT workspace_id FROM iam.workspace_invitation WHERE email = $1', [email])).rows,
      [{ workspace_id: expiredWorkspaceId }])
    assert.equal((await client.query('SELECT iam.claim_invitations($1,$2) AS claimed', [joiner, null])).rows[0].claimed, 0)
  })

  await t.test('a membership written without a role is refused rather than given one', async () => {
    const workspaceId = await workspace('no-default')
    const nameless = await account('no-default-account')
    const refused = await refusal(() => client.query(
      'INSERT INTO iam.workspace_membership(account_id, workspace_id) VALUES ($1,$2)',
      [nameless, workspaceId]))
    assert.equal(refused.code, '23502')
    assert.match(refused.message, /null value in column "role" of relation "workspace_membership"/)
    assert.deepEqual((await client.query('SELECT count(*)::int AS rows FROM iam.workspace_membership WHERE workspace_id = $1', [workspaceId])).rows,
      [{ rows: 0 }])
  })

  await t.test('an unknown project and an unknown workspace are refused in the same words', async () => {
    const stranger = await account('stranger')
    const unknownProject = await refusal(() => client.query('SELECT iam.admit_project($1,$2,$3)', [stranger, randomUUID(), 'project.read']))
    const unknownWorkspace = await refusal(() => client.query('SELECT iam.admit_workspace($1,$2,$3)', [stranger, randomUUID(), 'project.read']))
    assert.deepEqual(unknownProject, { code: '42501', message: 'NOT_ADMITTED' })
    assert.deepEqual(unknownWorkspace, unknownProject)
  })
})
