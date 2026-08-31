import { readFileSync } from 'node:fs'

const readSecret = path => readFileSync(path, 'utf8').trim()

export const provisionKeycloak = async ({
  baseUrl,
  adminUsername,
  adminPasswordFile,
  primarySecretFile,
  otherSecretFile,
  userPasswordFile,
  redirectUri,
}) => {
  const adminPassword = readSecret(adminPasswordFile)
  const userPassword = readSecret(userPasswordFile)
  const tokenResponse = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: adminUsername,
      password: adminPassword,
    }),
  })
  if (!tokenResponse.ok) throw new Error(`KEYCLOAK_ADMIN_TOKEN_${tokenResponse.status}`)
  const { access_token: accessToken } = await tokenResponse.json()

  const rolesMapper = {
    name: 'fixture realm roles',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-usermodel-realm-role-mapper',
    consentRequired: false,
    config: {
      'claim.name': 'roles',
      'jsonType.label': 'String',
      multivalued: 'true',
      'id.token.claim': 'true',
      'access.token.claim': 'true',
      'userinfo.token.claim': 'true',
    },
  }
  const client = (clientId, secret) => ({
    clientId,
    secret,
    enabled: true,
    publicClient: false,
    clientAuthenticatorType: 'client-secret',
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: [redirectUri],
    webOrigins: [],
    protocol: 'openid-connect',
    attributes: { 'pkce.code.challenge.method': 'S256' },
    protocolMappers: [rolesMapper],
  })
  const realm = {
    realm: 'r1f',
    enabled: true,
    sslRequired: 'NONE',
    registrationAllowed: false,
    resetPasswordAllowed: false,
    rememberMe: false,
    roles: { realm: [{ name: 'admin' }] },
    clients: [
      client('r1f-primary', readSecret(primarySecretFile)),
      client('r1f-other', readSecret(otherSecretFile)),
    ],
    users: [{
      username: 'r1f-user',
      enabled: true,
      emailVerified: true,
      email: 'r1f-user@example.invalid',
      firstName: 'R1F',
      lastName: 'User',
      realmRoles: ['admin'],
      credentials: [{ type: 'password', value: userPassword, temporary: false }],
    }],
  }
  const create = await fetch(`${baseUrl}/admin/realms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(realm),
  })
  if (create.status !== 201) throw new Error(`KEYCLOAK_REALM_CREATE_${create.status}`)

  const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }
  const usersResponse = await fetch(`${baseUrl}/admin/realms/r1f/users?username=r1f-user&exact=true`, { headers })
  if (!usersResponse.ok) throw new Error(`KEYCLOAK_USER_LOOKUP_${usersResponse.status}`)
  const users = await usersResponse.json()
  if (users.length !== 1) throw new Error('KEYCLOAK_USER_NOT_UNIQUE')
  const userId = users[0].id
  const reset = await fetch(`${baseUrl}/admin/realms/r1f/users/${userId}/reset-password`, {
    method: 'PUT', headers, body: JSON.stringify({ type: 'password', value: userPassword, temporary: false }),
  })
  if (reset.status !== 204) throw new Error(`KEYCLOAK_PASSWORD_RESET_${reset.status}`)

  const roleResponse = await fetch(`${baseUrl}/admin/realms/r1f/roles/admin`, { headers })
  if (!roleResponse.ok) throw new Error(`KEYCLOAK_ROLE_LOOKUP_${roleResponse.status}`)
  const role = await roleResponse.json()
  const mapping = await fetch(`${baseUrl}/admin/realms/r1f/users/${userId}/role-mappings/realm`, {
    method: 'POST', headers, body: JSON.stringify([role]),
  })
  if (mapping.status !== 204) throw new Error(`KEYCLOAK_ROLE_MAPPING_${mapping.status}`)
}
