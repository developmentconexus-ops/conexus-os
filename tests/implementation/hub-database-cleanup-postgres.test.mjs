import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDatabase, testPool } from './hub-database.mjs'

test('database fixture closes idle pool connections before dropping the database', async (t) => {
  const fixture = await createEmptyDatabase(t, 'conexus_cleanup')
  const pool = testPool({ connectionString: fixture.connectionString })

  // Cleanups run in reverse registration order, so inspect the database after pool.end().
  fixture.onCleanup(async () => {
    assert.equal(pool.ending, true)
    const { rows } = await fixture.admin.query(
      'SELECT count(*)::integer AS open FROM pg_stat_activity WHERE datname = $1',
      [fixture.database],
    )
    assert.equal(rows[0].open, 0)
  })
  fixture.onCleanup(() => pool.end())
  await pool.query('SELECT 1')
})
