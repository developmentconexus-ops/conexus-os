import pg from 'pg'

// These suites run ALTER ROLE on hub_* roles to prove their grants. Roles belong to the
// PostgreSQL instance, not to a database, so the throwaway database each suite creates
// does not contain the change. Running them against a cluster that also hosts a live Hub
// replaces that Hub's credentials with test fixture values, and the cleanup paths then set
// some of them to NULL. docs/reference/release-deployment-and-operations.md states the rule
// in prose. This makes it a check.

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

  const target = `${process.env.CONEXUS_TEST_DB_HOST}:${process.env.CONEXUS_TEST_DB_PORT}`
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
  } catch (error) {
    // Failing to establish that a cluster is disposable is not establishing that it is.
    // Refuse, and name the underlying failure so it reads as the connection problem it is.
    throw new Error(
      `PROTECTED_CLUSTER_UNVERIFIED: could not inspect ${target} to establish it is disposable, so this suite refuses to alter roles there. Underlying failure: ${error.message}`,
    )
  } finally {
    await client.end().catch(() => {})
  }

  if (present.length === 0) return

  throw new Error(
    `PROTECTED_CLUSTER_REFUSED: ${target} hosts ${present.join(', ')}. This suite alters cluster-global hub_* role passwords, which would replace the live Hub credentials there. Point CONEXUS_TEST_DB_* at a disposable cluster, or set CONEXUS_PROTECTED_DATABASES when this cluster is genuinely disposable.`,
  )
}
