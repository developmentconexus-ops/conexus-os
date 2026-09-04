import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { before, test } from 'node:test'
import * as oidc from 'openid-client'
import { authorizeConexus } from './conexus-authority.mjs'
import { provisionKeycloak } from './keycloak-provision.mjs'

const required = name => {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
const readSecret = name => readFileSync(required(name), 'utf8').trim()
const issuer = new URL(`${required('R1F_KEYCLOAK_BASE_URL')}/realms/r1f`)
const redirectUri = required('R1F_OIDC_REDIRECT_URI')
const username = 'r1f-user'
const password = readSecret('R1F_OIDC_USER_PASSWORD_FILE')
const primarySecret = readSecret('R1F_OIDC_PRIMARY_SECRET_FILE')
const otherSecret = readSecret('R1F_OIDC_OTHER_SECRET_FILE')

before(async () => {
  await provisionKeycloak({
    baseUrl: required('R1F_KEYCLOAK_BASE_URL'),
    adminUsername: required('R1F_KEYCLOAK_ADMIN_USERNAME'),
    adminPasswordFile: required('R1F_KEYCLOAK_ADMIN_PASSWORD_FILE'),
    primarySecretFile: required('R1F_OIDC_PRIMARY_SECRET_FILE'),
    otherSecretFile: required('R1F_OIDC_OTHER_SECRET_FILE'),
    userPasswordFile: required('R1F_OIDC_USER_PASSWORD_FILE'),
    redirectUri,
  })
})

const discover = (server, clientId, secret, custom, nonRepudiation = true) => oidc.discovery(
  server,
  clientId,
  undefined,
  oidc.ClientSecretBasic(secret),
  {
    execute: [oidc.allowInsecureRequests, ...(nonRepudiation ? [oidc.enableNonRepudiationChecks] : [])],
    ...(custom ? { [oidc.customFetch]: custom } : {}),
  },
)

const decodeHtml = value => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&#x2F;', '/')

const login = async authorizationUrl => {
  const cookies = new Map()
  const request = async (url, init = {}) => {
    const headers = new Headers(init.headers)
    if (cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    const response = await fetch(url, { ...init, headers, redirect: 'manual' })
    const setCookies = response.headers.getSetCookie?.() ?? []
    for (const value of setCookies) {
      const pair = value.split(';', 1)[0]
      const separator = pair.indexOf('=')
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
    }
    return response
  }

  let current = authorizationUrl
  let response = await request(current)
  let submissions = 0
  for (let steps = 0; steps < 20; steps += 1) {
    if (response.status >= 300 && response.status < 400) {
      const location = new URL(response.headers.get('location'), current)
      if (location.href.startsWith(redirectUri)) return location
      current = location
      response = await request(current)
      continue
    }
    if (response.status !== 200) throw new Error(`Keycloak login failed: ${response.status}`)
    const html = await response.text()
    const feedback = html.match(/class="[^"]*kc-feedback-text[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1]
      ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const inputNames = [...html.matchAll(/<input[^>]*name="([^"]+)"[^>]*>/gi)].map(match => match[1]).sort()
    if (feedback && submissions > 0) {
      throw new Error(`Keycloak login failed: 200 ${feedback}; inputs=${inputNames.join(',')}`)
    }
    const form = html.match(/<form[^>]+id="kc-form-login"[^>]*>[\s\S]*?<\/form>/i)?.[0]
    assert.ok(form, 'Keycloak login form missing')
    const action = decodeHtml(form.match(/<form[^>]+action="([^"]+)"/i)?.[1] ?? '')
    assert.ok(action, 'Keycloak login action missing')
    const fields = { username, password, credentialId: '', login: 'Log In' }
    for (const input of form.matchAll(/<input[^>]*>/gi)) {
      const type = input[0].match(/type="([^"]+)"/i)?.[1]
      const name = input[0].match(/name="([^"]+)"/i)?.[1]
      const value = input[0].match(/value="([^"]*)"/i)?.[1]
      if (type?.toLowerCase() === 'hidden' && name) fields[name] = decodeHtml(value ?? '')
    }
    current = new URL(action, current)
    response = await request(current, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    })
    submissions += 1
  }
  throw new Error('Keycloak callback not reached')
}

const begin = async (config, nonce = oidc.randomNonce()) => {
  const verifier = oidc.randomPKCECodeVerifier()
  const challenge = await oidc.calculatePKCECodeChallenge(verifier)
  const state = oidc.randomState()
  const url = oidc.buildAuthorizationUrl(config, {
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  })
  return { callback: await login(url), verifier, state, nonce }
}

const grant = (config, flow, overrides = {}) => oidc.authorizationCodeGrant(config, overrides.callback ?? flow.callback, {
  pkceCodeVerifier: overrides.verifier ?? flow.verifier,
  expectedState: overrides.state ?? flow.state,
  expectedNonce: overrides.nonce ?? flow.nonce,
  idTokenExpected: true,
})

const expectClientError = promise => assert.rejects(promise, error => {
  assert.ok(error instanceof oidc.ClientError)
  assert.match(error.code ?? error.cause?.code ?? '', /^OAUTH_/)
  return true
})

const expectInvalidGrant = promise => assert.rejects(promise, error => {
  assert.ok(error instanceof oidc.ResponseBodyError)
  assert.equal(error.error, 'invalid_grant')
  assert.equal(error.status, 400)
  return true
})

const mutateClaim = (jwt, claim, value) => {
  const parts = jwt.split('.')
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  claims[claim] = value
  parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return parts.join('.')
}

const mutateSignature = jwt => {
  const parts = jwt.split('.')
  parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith('A') ? 'B' : 'A'}`
  return parts.join('.')
}

const forgedConfig = async (forge, nonRepudiation = true) => {
  let tokenEndpoint
  let jwksUri
  const counts = { token: 0, jwks: 0 }
  const custom = async (url, init) => {
    const href = String(url)
    if (jwksUri && href === jwksUri) counts.jwks += 1
    const upstream = await fetch(url, init)
    if (tokenEndpoint && href === tokenEndpoint && String(init?.method ?? 'GET').toUpperCase() === 'POST') {
      counts.token += 1
      const body = await upstream.json()
      const headers = new Headers(upstream.headers)
      headers.set('content-type', 'application/json')
      return new Response(JSON.stringify({ ...body, id_token: forge(body.id_token) }), { status: upstream.status, headers })
    }
    return upstream
  }
  const config = await discover(issuer, 'r1f-primary', primarySecret, custom, nonRepudiation)
  tokenEndpoint = config.serverMetadata().token_endpoint
  jwksUri = config.serverMetadata().jwks_uri
  return { config, counts }
}

test('R1F-P06 real Keycloak Authorization Code + PKCE validates state/nonce and role is not Conexus authority', async () => {
  const config = await discover(issuer, 'r1f-primary', primarySecret)
  const flow = await begin(config)
  assert.equal(config.serverMetadata().authorization_response_iss_parameter_supported, true)
  assert.equal(flow.callback.searchParams.get('iss'), issuer.href.replace(/\/$/, ''))
  const tokens = await grant(config, flow)
  const claims = tokens.claims()
  assert.equal(claims.iss, issuer.href.replace(/\/$/, ''))
  assert.equal(claims.aud, 'r1f-primary')
  assert.ok(claims.roles.includes('admin'))
  assert.equal(authorizeConexus({ claims, accountMapped: true, currentGrant: false }), false)
  assert.equal(authorizeConexus({ claims, accountMapped: true, currentGrant: true }), true)
})

test('R1F-P06 wrong state, nonce, PKCE verifier and redirect URI all fail against real Keycloak', async () => {
  const config = await discover(issuer, 'r1f-primary', primarySecret)

  await expectClientError(grant(config, await begin(config), { state: oidc.randomState() }))

  const responseIssuer = await begin(config)
  const wrongResponseIssuer = new URL(responseIssuer.callback)
  wrongResponseIssuer.searchParams.set('iss', 'http://wrong.invalid/issuer')
  await expectClientError(grant(config, responseIssuer, { callback: wrongResponseIssuer }))

  await expectClientError(grant(config, await begin(config), { nonce: oidc.randomNonce() }))
  await expectInvalidGrant(grant(config, await begin(config), { verifier: oidc.randomPKCECodeVerifier() }))

  const redirectFlow = await begin(config)
  const wrongRedirect = new URL(redirectFlow.callback)
  wrongRedirect.port = String(Number(wrongRedirect.port) + 1)
  await expectInvalidGrant(grant(config, redirectFlow, { callback: wrongRedirect }))
})

test('R1F-P06 forged audience, signature and issuer fail openid-client validation', async () => {
  const audience = await forgedConfig(jwt => mutateClaim(jwt, 'aud', 'wrong-client'))
  await expectClientError(grant(audience.config, await begin(audience.config)))

  const wrongIssuer = await forgedConfig(jwt => mutateClaim(jwt, 'iss', 'http://wrong.invalid/issuer'))
  await expectClientError(grant(wrongIssuer.config, await begin(wrongIssuer.config)))

  const signature = await forgedConfig(mutateSignature)
  await expectClientError(grant(signature.config, await begin(signature.config)))
  assert.equal(signature.counts.token, 1)
  assert.ok(signature.counts.jwks >= 1)

  const withoutNonRepudiation = await forgedConfig(mutateSignature, false)
  const insecureTokens = await grant(withoutNonRepudiation.config, await begin(withoutNonRepudiation.config))
  assert.ok(insecureTokens.claims())
  assert.equal(withoutNonRepudiation.counts.jwks, 0)
})
