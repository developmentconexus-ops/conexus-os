import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { bootstrapInstallationAdministrator } from '../../scripts/bootstrap-installation-administrator.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase } from './hub-database.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const { createInstallationAdministration } = await import(hubModuleUrl('identity-access/installation-administration.js'))
const { isLastInstallationAdministrator, isNotAdmitted } = await import(hubModuleUrl('identity-access/current-session.js'))

const ACTIONS = ['workspace.read', 'members.manage', 'project.create', 'project.build']

const refusal = async (run) => {
  try {
    await run()
  } catch (error) {
    return { code: error.code ?? null, message: error.message }
  }
  return { code: null, message: null }
}

test('installation administration is its own fact, bootstrapped by the operator and kept by administrators', async (t) => {
  await refuseProtectedCluster()
  const fixture = await buildHubDatabase(t, 'conexus_install_admin')
  const owner = new pg.Client({ connectionString: fixture.connectionString })
  await owner.connect()
  // The Hub connects as hub_iam_runtime. Setting that role on the session, rather than giving the
  // cluster-global role a password, proves the grants without touching any other database's login.
  const runtimePool = new pg.Pool({ connectionString: fixture.connectionString, options: '-c role=hub_iam_runtime', max: 4 })
  fixture.onCleanup(() => owner.end())
  fixture.onCleanup(() => runtimePool.end())
  const administration = createInstallationAdministration({ pool: runtimePool })

  const account = async (label, { active = true, email = `${label}@install-admin.test` } = {}) => {
    const accountId = randomUUID()
    await owner.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,$6)',
      [accountId, 'https://install-admin.test', accountId, label, email, active])
    return accountId
  }
  const deactivate = (accountId) => owner.query('UPDATE iam.account SET active = false WHERE account_id = $1', [accountId])
  const tenures = async (accountId) => (await owner.query(`
    SELECT granted_via, granted_by, revoked_by, granted_at, revoked_at
    FROM iam.installation_administrator WHERE account_id = $1 ORDER BY granted_at`, [accountId])).rows
  const openAdministrators = async () => (await owner.query(
    'SELECT account_id FROM iam.installation_administrator WHERE revoked_at IS NULL ORDER BY account_id')).rows.map(row => row.account_id)

  await t.test('the Hub runtime can neither bootstrap nor read the tenure table', async () => {
    const someone = await account('runtime-probe')
    const bootstrap = await refusal(() => runtimePool.query('SELECT iam.bootstrap_installation_administrator($1)', [someone]))
    assert.equal(bootstrap.code, '42501')
    assert.match(bootstrap.message, /permission denied for function bootstrap_installation_administrator/)
    const read = await refusal(() => runtimePool.query('SELECT 1 FROM iam.installation_administrator'))
    assert.equal(read.code, '42501')
    assert.match(read.message, /permission denied for table installation_administrator/)
    assert.deepEqual(await openAdministrators(), [])
  })

  const first = await account('first-admin')

  await t.test('before any bootstrap nobody is an administrator and nobody can grant', async () => {
    assert.equal(await administration.isInstallationAdministrator(first), false)
    const granted = await refusal(() => administration.grant({ actor: first, account: first }))
    assert.deepEqual(granted, { code: '42501', message: 'NOT_ADMITTED' })
  })

  await t.test('the operator shell sets the first administrator by email, and only once', async () => {
    assert.deepEqual(await bootstrapInstallationAdministrator(owner, { email: '  First-Admin@install-admin.test ' }),
      { verdict: 'GRANTED', accountId: first })
    assert.deepEqual(await bootstrapInstallationAdministrator(owner, { accountId: first }),
      { verdict: 'ALREADY_ADMINISTRATOR', accountId: first })
    assert.equal(await administration.isInstallationAdministrator(first), true)

    const [tenure] = await tenures(first)
    assert.deepEqual({ ...tenure, granted_at: undefined }, {
      granted_via: 'OPERATOR_BOOTSTRAP', granted_by: null, revoked_by: null, granted_at: undefined, revoked_at: null,
    })

    const second = await account('would-be-second')
    const refused = await refusal(() => bootstrapInstallationAdministrator(owner, { accountId: second }))
    assert.deepEqual(refused, { code: '42501', message: 'INSTALLATION_ADMINISTRATOR_EXISTS' })
    assert.deepEqual(await refusal(() => bootstrapInstallationAdministrator(owner, { email: 'nobody@install-admin.test' })),
      { code: null, message: 'BOOTSTRAP_ACCOUNT_NOT_FOUND' })
  })

  const second = await account('second-admin')

  await t.test('an administrator grants and revokes, and each tenure records who and when', async () => {
    const before = new Date()
    await administration.grant({ actor: first, account: second })
    await administration.grant({ actor: first, account: second })
    assert.equal(await administration.isInstallationAdministrator(second), true)

    await administration.revoke({ actor: second, account: first })
    await administration.revoke({ actor: second, account: first })
    assert.equal(await administration.isInstallationAdministrator(first), false)

    await administration.grant({ actor: second, account: first })
    const after = new Date()

    const secondTenures = await tenures(second)
    assert.equal(secondTenures.length, 1)
    assert.deepEqual({ ...secondTenures[0], granted_at: undefined },
      { granted_via: 'ADMINISTRATOR', granted_by: first, revoked_by: null, granted_at: undefined, revoked_at: null })
    assert.ok(secondTenures[0].granted_at >= before && secondTenures[0].granted_at <= after)

    const firstTenures = await tenures(first)
    assert.deepEqual(firstTenures.map(({ granted_via, granted_by, revoked_by }) => ({ granted_via, granted_by, revoked_by })), [
      { granted_via: 'OPERATOR_BOOTSTRAP', granted_by: null, revoked_by: second },
      { granted_via: 'ADMINISTRATOR', granted_by: second, revoked_by: null },
    ])
    assert.ok(firstTenures[0].revoked_at >= before && firstTenures[0].revoked_at <= after)
    assert.deepEqual(await openAdministrators(), [first, second].sort())
  })

  await t.test('an account that is not an administrator, or no longer active, can neither grant nor revoke', async () => {
    const plain = await account('plain')
    const target = await account('target')
    assert.deepEqual(await refusal(() => administration.grant({ actor: plain, account: target })), { code: '42501', message: 'NOT_ADMITTED' })
    assert.deepEqual(await refusal(() => administration.revoke({ actor: plain, account: first })), { code: '42501', message: 'NOT_ADMITTED' })

    const dormant = await account('dormant-admin')
    await administration.grant({ actor: first, account: dormant })
    await deactivate(dormant)
    assert.equal(await administration.isInstallationAdministrator(dormant), false)
    assert.deepEqual(await refusal(() => administration.grant({ actor: dormant, account: target })), { code: '42501', message: 'NOT_ADMITTED' })
    await administration.revoke({ actor: first, account: dormant })
    assert.deepEqual(await openAdministrators(), [first, second].sort())
  })

  await t.test('granting an account that is unknown or inactive is refused', async () => {
    const inactive = await account('inactive-target', { active: false })
    assert.deepEqual(await refusal(() => administration.grant({ actor: first, account: inactive })), { code: 'P0002', message: 'ACCOUNT_NOT_FOUND' })
    assert.deepEqual(await refusal(() => administration.grant({ actor: first, account: randomUUID() })), { code: 'P0002', message: 'ACCOUNT_NOT_FOUND' })
  })

  await t.test('the last active administrator cannot be revoked, even by themselves', async () => {
    await administration.revoke({ actor: first, account: second })
    const refused = await refusal(() => administration.revoke({ actor: first, account: first }))
    assert.deepEqual(refused, { code: '42501', message: 'LAST_INSTALLATION_ADMINISTRATOR' })
    assert.equal(isLastInstallationAdministrator(refused), true)
    assert.equal(isNotAdmitted(refused), false)

    const lapsed = await account('lapsed-admin')
    await administration.grant({ actor: first, account: lapsed })
    await deactivate(lapsed)
    assert.deepEqual(await refusal(() => administration.revoke({ actor: first, account: first })),
      { code: '42501', message: 'LAST_INSTALLATION_ADMINISTRATOR' })
    assert.equal(await administration.isInstallationAdministrator(first), true)
  })

  await t.test('two administrators revoking each other at once leave exactly one', async () => {
    await administration.grant({ actor: first, account: second })
    const left = await runtimePool.connect()
    const right = await runtimePool.connect()
    try {
      await left.query('BEGIN')
      await right.query('BEGIN')
      await left.query('SELECT iam.revoke_installation_administrator($1, $2)', [first, second])
      const racing = refusal(() => right.query('SELECT iam.revoke_installation_administrator($1, $2)', [second, first]))
      const waitingOnLock = async () => (await owner.query(
        "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'")).rows[0].waiting
      for (let attempt = 0; await waitingOnLock() === 0; attempt += 1) {
        assert.ok(attempt < 100, 'the second revocation never waited on the first')
        await delay(20)
      }
      await left.query('COMMIT')
      assert.deepEqual(await racing, { code: '42501', message: 'NOT_ADMITTED' })
      await right.query('ROLLBACK')
    } finally {
      left.release()
      right.release()
    }
    assert.equal(await administration.isInstallationAdministrator(first), true)
    assert.equal(await administration.isInstallationAdministrator(second), false)
  })

  await t.test('administration grants no Workspace and no Project', async () => {
    const workspaceOwner = await account('workspace-owner')
    const workspaceId = randomUUID()
    const projectId = randomUUID()
    await owner.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, 'not-the-admins'])
    await owner.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,'owner')", [workspaceOwner, workspaceId])
    await owner.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1,$2,'p','NEW',$3,'p')",
      [projectId, workspaceId, 'a'.repeat(40)])

    assert.equal(await administration.isInstallationAdministrator(first), true)
    assert.deepEqual((await owner.query('SELECT * FROM iam.visible_workspaces($1)', [first])).rows, [])
    assert.deepEqual((await owner.query('SELECT * FROM iam.visible_projects($1)', [first])).rows, [])
    const observed = []
    for (const action of ACTIONS) {
      observed.push(`${action} workspace ${(await refusal(() => owner.query('SELECT iam.admit_workspace($1,$2,$3)', [first, workspaceId, action]))).message}`)
      observed.push(`${action} project ${(await refusal(() => owner.query('SELECT iam.admit_project($1,$2,$3)', [first, projectId, action]))).message}`)
    }
    assert.deepEqual(observed, ACTIONS.flatMap(action => [`${action} workspace NOT_ADMITTED`, `${action} project NOT_ADMITTED`]))
  })

  await t.test('list is refused for a non-administrator', async () => {
    const plain = await account('list-plain')
    assert.deepEqual(await refusal(() => administration.list(plain)), { code: '42501', message: 'NOT_ADMITTED' })
  })

  await t.test('list orders open tenures by grant time and names each tenure\'s kind and grantor', async () => {
    const before = await administration.list(first)
    assert.deepEqual(before.map((row) => row.accountId), [first])

    const third = await account('third-admin')
    await administration.grant({ actor: first, account: third })
    const afterGrant = await administration.list(first)
    assert.deepEqual(afterGrant.map((row) => row.accountId), [first, third])
    const granted = afterGrant[1]
    assert.equal(granted.grantedVia, 'ADMINISTRATOR')
    assert.deepEqual(granted.grantedBy, { accountId: first, displayName: 'first-admin' })
    assert.ok(granted.grantedAt >= before[0].grantedAt)
    await administration.revoke({ actor: first, account: third })
    assert.deepEqual((await administration.list(first)).map((row) => row.accountId), [first])
  })

  await t.test('grant by email is case- and whitespace-insensitive, and refuses an unknown, ambiguous, or inactive address', async () => {
    const targetEmail = `  Grant-Target@Install-Admin.TEST  `
    const target = await account('grant-target', { email: 'grant-target@install-admin.test' })
    const grantedId = await administration.grantByEmail({ actor: first, email: targetEmail })
    assert.equal(grantedId, target)
    assert.equal(await administration.isInstallationAdministrator(target), true)
    const again = await administration.grantByEmail({ actor: first, email: targetEmail })
    assert.equal(again, target)
    await administration.revoke({ actor: first, account: target })
    assert.equal(await administration.isInstallationAdministrator(target), false)

    assert.deepEqual(await refusal(() => administration.grantByEmail({ actor: first, email: 'nobody@install-admin.test' })),
      { code: 'P0002', message: 'ACCOUNT_NOT_FOUND' })

    const inactiveEmail = 'grant-inactive@install-admin.test'
    await account('grant-inactive-target', { email: inactiveEmail, active: false })
    assert.deepEqual(await refusal(() => administration.grantByEmail({ actor: first, email: inactiveEmail })),
      { code: 'P0002', message: 'ACCOUNT_NOT_FOUND' })

    const sharedEmail = 'grant-shared@install-admin.test'
    await account('grant-shared-a', { email: sharedEmail })
    await account('grant-shared-b', { email: sharedEmail })
    assert.deepEqual(await refusal(() => administration.grantByEmail({ actor: first, email: sharedEmail })),
      { code: 'P0003', message: 'ACCOUNT_EMAIL_AMBIGUOUS' })

    assert.deepEqual(await refusal(() => administration.grantByEmail({ actor: target, email: sharedEmail })),
      { code: '42501', message: 'NOT_ADMITTED' })
  })

  await t.test('the last-administrator refusal still holds after list and grant-by-email were added', async () => {
    const refused = await refusal(() => administration.revoke({ actor: first, account: first }))
    assert.deepEqual(refused, { code: '42501', message: 'LAST_INSTALLATION_ADMINISTRATOR' })
    assert.deepEqual((await administration.list(first)).map((row) => row.accountId), [first])
  })

  await t.test('the tenure table refuses a record that does not say who acted', async () => {
    const nobody = await account('shape-probe')
    const unattributedGrant = await refusal(() => owner.query(
      "INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'ADMINISTRATOR')", [nobody]))
    assert.equal(unattributedGrant.code, '23514')
    const unattributedRevoke = await refusal(() => owner.query(
      "INSERT INTO iam.installation_administrator(account_id, granted_via, revoked_at) VALUES ($1, 'OPERATOR_BOOTSTRAP', clock_timestamp())", [nobody]))
    assert.equal(unattributedRevoke.code, '23514')
    await owner.query("INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [nobody])
    const twoOpen = await refusal(() => owner.query(
      "INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [nobody]))
    assert.equal(twoOpen.code, '23505')
  })
})
