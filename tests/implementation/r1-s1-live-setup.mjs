import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { provisionKeycloak } from '../../qualification/4d/r1-foundation/http-identity-session/keycloak-provision.mjs'

const { Client } = pg
const repositoryRoot = resolve(import.meta.dirname, '../..')
const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_LIVE_CONFIG_${name}`)
  return value
}

const admin = new Client({ host: 'postgres', port: 5432, database: 'conexus_s1', user: 'postgres', password: required('POSTGRES_ADMIN_PASSWORD') })
await admin.connect()
await admin.query((await import('node:fs')).readFileSync(resolve(repositoryRoot, 'apps/hub/migrations/001_iam_foundation.sql'), 'utf8'))
await admin.query(`ALTER ROLE hub_iam_runtime PASSWORD 'runtime-test-only'`)
await admin.end()

const keycloakBaseUrl = 'http://keycloak:8080'
const tokenResponse = await fetch(`${keycloakBaseUrl}/realms/master/protocol/openid-connect/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: required('KEYCLOAK_ADMIN_PASSWORD') }),
})
if (!tokenResponse.ok) throw new Error(`KEYCLOAK_ADMIN_TOKEN_${tokenResponse.status}`)
const { access_token: accessToken } = await tokenResponse.json()
const existingRealm = await fetch(`${keycloakBaseUrl}/admin/realms/r1f`, { headers: { authorization: `Bearer ${accessToken}` } })
if (existingRealm.ok) {
  const removed = await fetch(`${keycloakBaseUrl}/admin/realms/r1f`, { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } })
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

const usersResponse = await fetch(`${keycloakBaseUrl}/admin/realms/r1f/users?username=r1f-user&exact=true`, { headers: { authorization: `Bearer ${accessToken}` } })
const users = await usersResponse.json()
if (users.length !== 1) throw new Error('KEYCLOAK_BOOTSTRAP_SUBJECT_NOT_UNIQUE')
writeFileSync(required('BOOTSTRAP_SUBJECT_FILE'), `${users[0].id}\n`, { mode: 0o600 })
process.stdout.write(`${JSON.stringify({ realm: 'r1f', clientId: 'r1f-primary', bootstrapSubject: users[0].id })}\n`)
