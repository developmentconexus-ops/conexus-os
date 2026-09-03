import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import { provisionKeycloak } from '../../qualification/4d/r1-foundation/http-identity-session/keycloak-provision.mjs'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const { Client } = pg
const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_LIVE_CONFIG_${name}`)
  return value
}
const secret = (name) => readFileSync(required(name), 'utf8').trim()
const writeSecret = (name, value) => writeFileSync(required(name), `${value}\n`, { mode: 0o600 })

const databaseName = 'conexus_s1'
const adminPassword = required('POSTGRES_ADMIN_PASSWORD')
const connectionString = `postgresql://postgres:${encodeURIComponent(adminPassword)}@postgres:5432/${databaseName}`
const migration = await runHubMigrations({ connectionString })

const admin = new Client({ host: 'postgres', port: 5432, database: databaseName, user: 'postgres', password: adminPassword })
await admin.connect()
try {
  for (const [role, passwordFile] of [
    ['hub_iam_runtime', 'IAM_RUNTIME_PASSWORD_FILE'],
    ['hub_ws01_command', 'WS01_COMMAND_PASSWORD_FILE'],
    ['hub_s2_read', 'S2_READ_PASSWORD_FILE'],
  ]) {
    const { rows: [{ statement }] } = await admin.query(
      'SELECT format(\'ALTER ROLE %I PASSWORD %L\', $1::text, $2::text) AS statement',
      [role, secret(passwordFile)],
    )
    await admin.query(statement)
  }
} finally {
  await admin.end()
}

const keycloakBaseUrl = 'http://keycloak:8080'
const tokenResponse = await fetch(`${keycloakBaseUrl}/realms/master/protocol/openid-connect/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: required('KEYCLOAK_ADMIN_PASSWORD') }),
})
if (!tokenResponse.ok) throw new Error(`KEYCLOAK_ADMIN_TOKEN_${tokenResponse.status}`)
const { access_token: accessToken } = await tokenResponse.json()
const masterHeaders = { authorization: `Bearer ${accessToken}` }
const existingRealm = await fetch(`${keycloakBaseUrl}/admin/realms/r1f`, { headers: masterHeaders })
if (existingRealm.ok) {
  const removed = await fetch(`${keycloakBaseUrl}/admin/realms/r1f`, { method: 'DELETE', headers: masterHeaders })
  if (removed.status !== 204) throw new Error(`KEYCLOAK_REALM_DELETE_${removed.status}`)
} else if (existingRealm.status !== 404) throw new Error(`KEYCLOAK_REALM_LOOKUP_${existingRealm.status}`)

await provisionKeycloak({
  baseUrl: keycloakBaseUrl,
  adminUsername: 'admin',
  adminPasswordFile: required('KEYCLOAK_ADMIN_PASSWORD_FILE'),
  primarySecretFile: required('OIDC_CLIENT_SECRET_FILE'),
  otherSecretFile: required('OIDC_OTHER_SECRET_FILE'),
  userPasswordFile: required('OIDC_USER_PASSWORD_FILE'),
  redirectUri: 'http://localhost:3000/protocol/oidc/callback',
})

const realmHeaders = { ...masterHeaders, 'content-type': 'application/json' }
const primaryUsersResponse = await fetch(`${keycloakBaseUrl}/admin/realms/r1f/users?username=r1f-user&exact=true`, { headers: realmHeaders })
if (!primaryUsersResponse.ok) throw new Error(`KEYCLOAK_PRIMARY_LOOKUP_${primaryUsersResponse.status}`)
const primaryUsers = await primaryUsersResponse.json()
if (primaryUsers.length !== 1) throw new Error('KEYCLOAK_BOOTSTRAP_SUBJECT_NOT_UNIQUE')

const secondaryUsername = 'r1f-secondary'
const secondaryPassword = required('OIDC_SECONDARY_USER_PASSWORD')
const createSecondary = await fetch(`${keycloakBaseUrl}/admin/realms/r1f/users`, {
  method: 'POST', headers: realmHeaders,
  body: JSON.stringify({
    username: secondaryUsername,
    enabled: true,
    emailVerified: true,
    email: 'r1f-secondary@example.invalid',
    firstName: 'R1F',
    lastName: 'Secondary',
    credentials: [{ type: 'password', value: secondaryPassword, temporary: false }],
  }),
})
if (createSecondary.status !== 201) throw new Error(`KEYCLOAK_SECONDARY_CREATE_${createSecondary.status}`)
const secondaryUsersResponse = await fetch(`${keycloakBaseUrl}/admin/realms/r1f/users?username=${secondaryUsername}&exact=true`, { headers: realmHeaders })
if (!secondaryUsersResponse.ok) throw new Error(`KEYCLOAK_SECONDARY_LOOKUP_${secondaryUsersResponse.status}`)
const secondaryUsers = await secondaryUsersResponse.json()
if (secondaryUsers.length !== 1) throw new Error('KEYCLOAK_SECONDARY_SUBJECT_NOT_UNIQUE')

writeSecret('BOOTSTRAP_SUBJECT_FILE', primaryUsers[0].id)
writeSecret('SECONDARY_SUBJECT_FILE', secondaryUsers[0].id)
process.stdout.write(`${JSON.stringify({
  migration,
  realm: 'r1f',
  clientId: 'r1f-primary',
  bootstrapSubject: primaryUsers[0].id,
  secondarySubject: secondaryUsers[0].id,
})}\n`)
