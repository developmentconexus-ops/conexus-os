import pg from 'pg'

// These suites ALTER ROLE on hub_* roles. Roles are cluster-global, so creating a
// throwaway database does not contain the change: running them against a cluster that
// also hosts a live Hub replaces that Hub's credentials with test fixture values.
// docs/reference/release-deployment-and-operations.md states the rule in prose. This
// turns it into a check.

const PROTECTED_DATABASES = (process.env.CONEXUS_PROTECTED_DATABASES ?? 'conexus_s7')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean)

const TEST_CONNECTION_VARIABLES = [
  'CONEXUS_TEST_DB_HOST',
  'CONEXUS_TEST_DB_PORT',
  'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER',
  'CONEXUS_TEST_DB_PASSWORD',
]

export const refuseProtectedCluster = async () => {
  if (!TEST_CONNECTION_VARIABLES.every(name => process.env[name])) return
  if (PROTECTED_DATABASES.length === 0) return

  const client = new pg.Client({
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  })

  let present
  try {
    await client.connect()
    const { rows } = await client.query('select datname from pg_database where datname = any($1)', [PROTECTED_DATABASES])
    present = rows.map(row => row.datname)
  } catch {
    // An unreachable or unauthenticated cluster is not a protected one. Stay out of the
    // way and let the suite report its own connection failure, which names the real cause.
    return
  } finally {
    await client.end().catch(() => {})
  }

  if (present.length === 0) return

  throw new Error(
    [
      `PROTECTED_CLUSTER_REFUSED: ${process.env.CONEXUS_TEST_DB_HOST}:${process.env.CONEXUS_TEST_DB_PORT} hosts ${present.join(', ')}.`,
      'This suite alters cluster-global hub_* role passwords, which would replace the live Hub credentials there.',
      'Point CONEXUS_TEST_DB_* at a disposable cluster, or set CONEXUS_PROTECTED_DATABASES when this cluster is genuinely disposable.',
    ].join(' '),
  )
}
