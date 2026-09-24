// The rerunnable Keycloak probe of the single session qualification (step S0). It signs a probe user in
// through the realm's real authorization-code flow and asks Keycloak, with the same openid-client call
// the Hub uses, what a refresh token may do while `revokeRefreshToken` is false.
//
//   PROBE_CLIENT_SECRET=… PROBE_USER_PASSWORD=… PROBE_ADMIN_PASSWORD=… \
//   node scripts/keycloak-refresh-probe.mjs --issuer <realm issuer URL> --username <probe user> \
//     --admin-user <admin> --sso-idle-seconds <realm ssoSessionIdleTimeout> --out <file.json>
//     [--client-id conexus-hub] [--redirect-uri <the client's registered redirect URI>]
//     [--loopback-host hub.conexus.localhost]   resolves this name to 127.0.0.1, as the Hub does
//     [--case concurrent,disabled,logout,idle,clients]   default: all
//
// Cases (Keycloak 26.7, rotation off):
//   concurrent  four refreshes of one token, at once, all succeed; the original token still works
//   disabled    the user is disabled in Keycloak: refresh is refused with "User disabled"
//   logout      four refreshes of one token, then the user signs out in Keycloak: refresh is refused with
//               "Session not active", for the original token and every token the refreshes returned
//               (the falsifier: an old token accepted after the SSO session ended)
//   idle        a session refreshed at two thirds of the SSO idle limit is alive after the limit; a
//               second session, never refreshed, is refused. Takes 4/3 of --sso-idle-seconds.
//   clients     account-console and security-admin-console still complete a sign-in and a refresh
//
// The probe user must exist, be enabled, have a non-temporary password and a verified email. The
// admin account disables and re-enables it. The secrets come from the environment and are never printed.
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import * as oidc from 'openid-client'
import { Agent, fetch as undiciFetch } from 'undici'

const { values } = parseArgs({
  options: {
    issuer: { type: 'string' },
    username: { type: 'string' },
    'admin-user': { type: 'string' },
    'sso-idle-seconds': { type: 'string' },
    out: { type: 'string' },
    'client-id': { type: 'string', default: 'conexus-hub' },
    'redirect-uri': { type: 'string' },
    'loopback-host': { type: 'string' },
    case: { type: 'string', default: 'concurrent,disabled,logout,idle,clients' },
  },
})
const need = (name) => values[name] ?? (() => { throw new Error(`--${name} is required`) })()
const issuer = new URL(need('issuer'))
const realm = issuer.pathname.split('/').at(-1)
const origin = issuer.origin
const username = need('username')
const ssoIdle = Number(need('sso-idle-seconds'))
const secretOf = (name) => process.env[name] ?? (() => { throw new Error(`${name} is required`) })()
const clientSecret = secretOf('PROBE_CLIENT_SECRET')
const userPassword = secretOf('PROBE_USER_PASSWORD')
const adminPassword = secretOf('PROBE_ADMIN_PASSWORD')
const selected = new Set(values.case.split(','))

const dispatcher = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      if (hostname === values['loopback-host']) {
        return options.all ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4)
      }
      return import('node:dns').then(({ lookup }) => lookup(hostname, options, callback))
    },
  },
})
const transport = (url, init) => undiciFetch(url, { ...init, dispatcher })
const allowHttp = issuer.protocol === 'http:'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const cases = []
const record = (name, held, detail) => {
  cases.push({ case: name, held, at: new Date().toISOString(), ...detail })
  console.log(`${held ? 'HELD  ' : 'FAILED'} ${name} ${JSON.stringify(detail)}`)
}

const discover = async (clientId, secret) => {
  const options = { [oidc.customFetch]: transport, ...(allowHttp ? { execute: [oidc.allowInsecureRequests] } : {}) }
  return oidc.discovery(issuer, clientId, secret, secret ? undefined : oidc.None(), options)
}

// A browser cookie jar, just enough for Keycloak's login form.
const jar = () => {
  const cookies = new Map()
  return {
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    store: (response) => {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(';')
        const at = pair.indexOf('=')
        const name = pair.slice(0, at)
        const value = pair.slice(at + 1)
        if (value === '' || /Max-Age=0/i.test(line)) cookies.delete(name)
        else cookies.set(name, value)
      }
    },
  }
}

// Signs in through the login form and returns the tokens. `clientId` may be public (PKCE only).
const signIn = async ({ clientId, secret, redirectUri, cookies = jar() }) => {
  const configuration = await discover(clientId, secret)
  const pkceCodeVerifier = oidc.randomPKCECodeVerifier()
  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const authorization = oidc.buildAuthorizationUrl(configuration, {
    redirect_uri: redirectUri,
    scope: 'openid email',
    code_challenge: await oidc.calculatePKCECodeChallenge(pkceCodeVerifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  })
  let response = await transport(authorization.href, { redirect: 'manual', headers: { cookie: cookies.header() } })
  cookies.store(response)
  for (let hop = 0; hop < 5 && response.status === 302 && !response.headers.get('location').startsWith(redirectUri); hop += 1) {
    response = await transport(new URL(response.headers.get('location'), origin), { redirect: 'manual', headers: { cookie: cookies.header() } })
    cookies.store(response)
  }
  if (response.status !== 302) {
    const html = await response.text()
    const action = /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(html)?.[1]
    if (!action) throw new Error('LOGIN_FORM_NOT_FOUND')
    response = await transport(action.replaceAll('&amp;', '&'), {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: cookies.header(), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password: userPassword, credentialId: '' }),
    })
    cookies.store(response)
  }
  const location = response.headers.get('location')
  if (response.status !== 302 || !location?.startsWith(redirectUri)) throw new Error(`SIGN_IN_REFUSED status=${response.status}`)
  const tokens = await oidc.authorizationCodeGrant(configuration, new URL(location), { pkceCodeVerifier, expectedState: state, expectedNonce: nonce, idTokenExpected: true })
  return { configuration, tokens, cookies }
}

// What the Hub's refresh sees: the person is still signed in, or Keycloak's own description of the refusal.
const refresh = async (configuration, refreshToken) => {
  try {
    const tokens = await oidc.refreshTokenGrant(configuration, refreshToken)
    return { ok: true, refreshToken: tokens.refresh_token ?? refreshToken, rotated: tokens.refresh_token !== undefined && tokens.refresh_token !== refreshToken }
  } catch (error) {
    if (error instanceof oidc.ResponseBodyError) return { ok: false, error: error.error, description: error.error_description }
    return { ok: false, error: 'TRANSPORT', description: String(error) }
  }
}

const admin = async () => {
  const master = await discoverMaster()
  const grant = await oidc.genericGrantRequest(master, 'password', { username: values['admin-user'], password: adminPassword })
  const call = async (method, path, body) => {
    const response = await transport(`${origin}/admin/realms/${realm}${path}`, {
      method,
      headers: { authorization: `Bearer ${grant.access_token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) throw new Error(`ADMIN_${method}_${path}_${response.status}`)
    return response.status === 204 ? null : response.json()
  }
  return call
}
const discoverMaster = () => oidc.discovery(new URL(`${origin}/realms/master`), 'admin-cli', undefined, oidc.None(), { [oidc.customFetch]: transport, ...(allowHttp ? { execute: [oidc.allowInsecureRequests] } : {}) })

const primary = { clientId: values['client-id'], secret: clientSecret, redirectUri: values['redirect-uri'] ?? need('redirect-uri') }
const rotation = async () => {
  const call = await admin()
  const found = await call('GET', '')
  return { revokeRefreshToken: found.revokeRefreshToken, refreshTokenMaxReuse: found.refreshTokenMaxReuse, ssoSessionIdleTimeout: found.ssoSessionIdleTimeout }
}

const setup = await rotation()
record('realm-settings', setup.revokeRefreshToken === false && setup.ssoSessionIdleTimeout === ssoIdle, setup)

if (selected.has('concurrent')) {
  const { configuration, tokens } = await signIn(primary)
  const original = tokens.refresh_token
  const answers = await Promise.all([1, 2, 3, 4].map(() => refresh(configuration, original)))
  const again = await refresh(configuration, original)
  record('concurrent-refresh', answers.every((answer) => answer.ok) && again.ok, { answers: answers.map(({ ok, rotated, error, description }) => ({ ok, rotated, error, description })), originalStillWorks: again.ok })
}

if (selected.has('disabled')) {
  const { configuration, tokens } = await signIn(primary)
  const call = await admin()
  const [user] = await call('GET', `/users?username=${encodeURIComponent(username)}&exact=true`)
  await call('PUT', `/users/${user.id}`, { ...user, enabled: false })
  let refused
  try { refused = await refresh(configuration, tokens.refresh_token) } finally { await call('PUT', `/users/${user.id}`, { ...user, enabled: true }) }
  record('disabled-refresh-refused', !refused.ok && refused.description === 'User disabled', { error: refused.error, description: refused.description })
}

if (selected.has('logout')) {
  const { configuration, tokens } = await signIn(primary)
  const returned = await Promise.all([1, 2, 3, 4].map(() => refresh(configuration, tokens.refresh_token)))
  const endpoint = new URL(configuration.serverMetadata().end_session_endpoint)
  endpoint.searchParams.set('id_token_hint', tokens.id_token)
  endpoint.searchParams.set('client_id', primary.clientId)
  const ended = await transport(endpoint.href, { redirect: 'manual' })
  const candidates = [tokens.refresh_token, ...returned.map((answer) => answer.refreshToken)]
  const answers = await Promise.all(candidates.map((token) => refresh(configuration, token)))
  record('logout-refresh-refused', answers.every((answer) => !answer.ok && answer.description === 'Session not active'),
    { logoutStatus: ended.status, tokensTried: candidates.length, answers: answers.map(({ ok, error, description }) => ({ ok, error, description })) })
}

if (selected.has('idle')) {
  const refreshed = await signIn(primary)
  const control = await signIn(primary)
  await sleep((ssoIdle * 2 / 3) * 1000)
  const middle = await refresh(refreshed.configuration, refreshed.tokens.refresh_token)
  await sleep((ssoIdle * 2 / 3) * 1000)
  const alive = await refresh(refreshed.configuration, middle.refreshToken)
  const dead = await refresh(control.configuration, control.tokens.refresh_token)
  record('refresh-resets-sso-idle', middle.ok && alive.ok && !dead.ok,
    { ssoIdleSeconds: ssoIdle, refreshedAtSeconds: Math.round(ssoIdle * 2 / 3), checkedAtSeconds: Math.round(ssoIdle * 4 / 3), refreshedSession: { middle: middle.ok, afterLimit: alive.ok }, neverRefreshedSession: { ok: dead.ok, description: dead.description } })
}

if (selected.has('clients')) {
  const clients = [
    { clientId: 'account-console', redirectUri: `${origin}/realms/${realm}/account/` },
    { clientId: 'security-admin-console', redirectUri: `${origin}/admin/${realm}/console/` },
  ]
  for (const client of clients) {
    try {
      const { configuration, tokens } = await signIn(client)
      const answer = await refresh(configuration, tokens.refresh_token)
      record(`client-${client.clientId}`, answer.ok, { signedIn: true, refreshed: answer.ok, error: answer.error, description: answer.description })
    } catch (error) {
      record(`client-${client.clientId}`, false, { signedIn: false, error: String(error.message) })
    }
  }
}

writeFileSync(need('out'), `${JSON.stringify({ keycloakIssuer: issuer.href, probedAt: new Date().toISOString(), cases }, null, 2)}\n`)
await dispatcher.close()
process.exit(cases.every((entry) => entry.held) ? 0 : 1)
