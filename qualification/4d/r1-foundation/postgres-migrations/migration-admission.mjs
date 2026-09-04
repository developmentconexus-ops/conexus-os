import { readdirSync } from 'node:fs'

export const assertLinearMigrationOrder = async (pool, directory) => {
  const applied = await pool.query('SELECT version FROM atlas_schema_revisions.atlas_schema_revisions ORDER BY version')
  const appliedVersions = new Set(applied.rows.map(row => String(row.version)))
  const maximumApplied = [...appliedVersions].sort().at(-1)
  const directoryVersions = readdirSync(directory)
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .map(name => name.slice(0, name.indexOf('_')))
    .sort()
  if (maximumApplied) {
    const outOfOrder = directoryVersions.find(version => !appliedVersions.has(version) && version < maximumApplied)
    if (outOfOrder) throw new Error(`OUT_OF_ORDER_MIGRATION:${outOfOrder}`)
  }
  return { appliedVersions: [...appliedVersions].sort(), directoryVersions }
}

export const assertMigrationTarget = async pool => {
  const schema = await pool.query(`
    SELECT r.rolname AS owner
    FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
    WHERE n.nspname = 'app'
  `)
  if (schema.rowCount !== 1 || schema.rows[0].owner !== 'migration_owner') throw new Error('SCHEMA_OWNER_DRIFT')

  const table = await pool.query(`
    SELECT r.rolname AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE n.nspname = 'app' AND c.relname = 'items' AND c.relkind = 'r'
  `)
  if (table.rowCount !== 1 || table.rows[0].owner !== 'migration_owner') throw new Error('TABLE_OWNER_DRIFT')

  const columns = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'items'
    ORDER BY ordinal_position
  `)
  const actual = columns.rows.map(row => [row.column_name, row.data_type, row.is_nullable])
  const expected = [
    ['item_id', 'text', 'NO'],
    ['name', 'text', 'NO'],
    ['revision', 'integer', 'NO'],
  ]
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('TABLE_SCHEMA_DRIFT')
  return { schemaOwner: 'migration_owner', tableOwner: 'migration_owner', columns: expected }
}
