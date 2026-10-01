import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { previewAllocation, releasePreviewAllocation } = await import(hubModuleUrl('app-runner/data-plane.js'))

// Postgres 16+ lets DROP OWNED BY clear a role only for a session holding that role's privileges,
// and the provisioner holds a Project's migration role with INHERIT FALSE and its runtime role with
// none (ensurePreviewAllocation). A fake provisioner applies that rule: it starts with no privileges
// and gains them only through a GRANT ... WITH INHERIT TRUE, as the live cluster did when releasing
// 8 Projects failed with "permission denied to drop objects".
const fakeProvisioner = (existingRoles) => {
  const inherited = new Set()
  const dropped = []
  return {
    dropped,
    query: async (sql, values) => {
      if (sql.startsWith('SELECT 1 FROM pg_roles')) return { rows: existingRoles.includes(values[0]) ? [{ '?column?': 1 }] : [] }
      const grant = /^GRANT "(\w+)" TO "app_provisioner" WITH INHERIT TRUE/.exec(sql)
      if (grant) { inherited.add(grant[1]); return { rows: [] } }
      const owned = /^DROP OWNED BY "(\w+)"/.exec(sql)
      if (owned) {
        if (!inherited.has(owned[1])) throw Object.assign(new Error('permission denied to drop objects'), { code: '42501' })
        return { rows: [] }
      }
      const role = /^DROP ROLE "(\w+)"/.exec(sql)
      if (role) dropped.push(role[1])
      return { rows: [] }
    },
  }
}

test('releasing a Project clears and drops both of its roles although the provisioner does not inherit them', async () => {
  const allocation = previewAllocation('30000000-0000-8000-8000-000000000004')
  const provisioner = fakeProvisioner([allocation.migrationRole, allocation.runtimeRole])

  await releasePreviewAllocation(provisioner, allocation)
  assert.deepEqual(provisioner.dropped, [allocation.migrationRole, allocation.runtimeRole])
})
