import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import pg from 'pg'
import { catalogDigest, catalogSnapshotPath, describeCatalogDrift, readCatalog } from './hub-catalog.mjs'
import { loadCurrentHubMigrationFiles, runSelectedHubMigrations } from './run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')

const fail = (code, detail) => {
  throw new Error(detail ? `${code}: ${detail}` : code)
}

const required = (name) => process.env[name] ?? fail(`MISSING_CONFIG_${name}`)

const readAdmin = () => ({
  host: required('CONEXUS_TEST_DB_HOST'),
  port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'),
  user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
})

// Replaying migrations creates roles, and roles belong to the cluster, not the database. The
// same refusal tests/implementation/protected-cluster.mjs applies keeps this off a live Hub.
const refuseProtectedCluster = async (client) => {
  const protectedNames = (process.env.CONEXUS_PROTECTED_DATABASES ?? 'conexus_s7').split(',').map(name => name.trim()).filter(Boolean)
  const found = (await client.query('SELECT datname FROM pg_database WHERE datname = ANY($1)', [protectedNames])).rows.map(row => row.datname)
  if (found.length > 0) fail('CATALOG_SNAPSHOT_PROTECTED_CLUSTER_REFUSED', found.join(','))
}

const connectionStringFor = (admin, database) => {
  const url = new URL('postgresql://localhost')
  url.hostname = admin.host
  url.port = String(admin.port)
  url.pathname = `/${database}`
  url.username = admin.user
  url.password = admin.password
  return url.toString()
}

export const buildSnapshot = async (admin = readAdmin()) => {
  const owner = new pg.Client(admin)
  await owner.connect()
  const database = `conexus_catalog_snapshot_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  try {
    await refuseProtectedCluster(owner)
    await owner.query(`CREATE DATABASE "${database}"`)
    const migrations = loadCurrentHubMigrationFiles()
    const connectionString = connectionStringFor(admin, database)
    const digests = {}
    let catalog
    for (let index = 0; index < migrations.length; index += 1) {
      await runSelectedHubMigrations({ connectionString, migrations: migrations.slice(0, index + 1), recognizedMigrations: migrations, catalogSnapshot: null })
      const client = new pg.Client({ connectionString })
      await client.connect()
      try {
        catalog = await readCatalog(client)
      } finally {
        await client.end()
      }
      digests[migrations[index].version] = catalogDigest(catalog)
    }
    return { format: 1, head: migrations.at(-1).version, digests, catalog }
  } finally {
    await owner.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await owner.end()
  }
}

export const renderSnapshot = (snapshot) => `${JSON.stringify(snapshot, null, 1)}\n`

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const target = resolve(repositoryRoot, catalogSnapshotPath)
  const snapshot = await buildSnapshot()
  if (process.argv.includes('--check')) {
    const committed = JSON.parse(readFileSync(target, 'utf8'))
    if (committed.head !== snapshot.head) fail('CATALOG_SNAPSHOT_HEAD_DRIFT', `${committed.head} committed, ${snapshot.head} replayed`)
    for (const [version, digest] of Object.entries(snapshot.digests)) {
      if (committed.digests[version] !== digest) fail('CATALOG_SNAPSHOT_DIGEST_DRIFT', `version ${version}; ${describeCatalogDrift(snapshot.catalog, committed.catalog) ?? 'head catalog unchanged'}`)
    }
    process.stdout.write(`${JSON.stringify({ verdict: 'CURRENT', head: snapshot.head, versions: Object.keys(snapshot.digests).length })}\n`)
  } else {
    writeFileSync(target, renderSnapshot(snapshot))
    process.stdout.write(`${JSON.stringify({ verdict: 'WRITTEN', head: snapshot.head, versions: Object.keys(snapshot.digests).length })}\n`)
  }
}
