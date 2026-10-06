import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { buildHubDatabase, givePasswordToHubRuntime, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { openDatabase } = await import(hubModuleUrl('platform/db.js'))
const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { applicationOrigin } = await import(hubModuleUrl('platform/config.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
const { configuredIdentity } = await import(hubModuleUrl('identity-access/admission.js'))
const { parseSignInClaims } = await import(hubModuleUrl('identity-access/oidc.js'))
const { createSessions } = await import(hubModuleUrl('identity-access/sessions.js'))
const { createSignIn } = await import(hubModuleUrl('identity-access/sign-in.js'))
const { registerRosterRoutes } = await import(hubModuleUrl('identity-access/roster.js'))
const { createApplicationAccess } = await import(hubModuleUrl('identity-access/application-access.js'))
const { registerAdministratorRoutes } = await import(hubModuleUrl('identity-access/administrators.js'))
const { createWorkspaceModule } = await import(hubModuleUrl('workspace/module.js'))

export const ISSUER = 'https://keycloak.test/realms/conexus'
export const CONFIGURED_SUBJECT = '00000000-0000-4000-8000-000000000001'
export const HUB_ORIGIN = 'https://hub.conexus.test'
export const APPLICATIONS = Object.freeze({ port: 443, domain: 'apps.conexus.test' })
export const W = '55555555-5555-4555-8555-555555555555'
export const P = '33333333-3333-4333-8333-333333333333'
export const Q = '44444444-4444-4444-8444-444444444444'
const PASSWORD = 'iam-test-only'
const KEY = '1'.repeat(64)

export const hubWrite = Object.freeze({ origin: HUB_ORIGIN, 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' })
export const hubJsonWrite = Object.freeze({ ...hubWrite, 'content-type': 'application/json' })
export const sessionCookie = (token) => `__Host-conexus_session=${token}`
export const digestOf = (token) => createHash('sha256').update(token).digest()

/** The raw ID token claims of a person; `parseSignInClaims` reads them as the real adapter does. */
export const person = (subject, { email, verified = true, name = `Person ${subject}`, issuer = ISSUER, ...rest } = {}) => ({
  iss: issuer, sub: subject, ...(name === null ? {} : { name }), ...(email ? { email, email_verified: verified } : {}), ...rest,
})

/** Keycloak as the Hub sees it: a sign in completes with the claims a test queued for its state, and refresh and logout are scripted. */
const fakeOidc = () => {
  const pending = new Map()
  const refreshes = []
  const logouts = []
  const queued = []
  return {
    queue: (claims) => { queued.push(claims) },
    pending,
    refreshes,
    logouts,
    refreshCalls: 0,
    begin: async () => {
      const state = randomUUID().replaceAll('-', '').padEnd(43, 'a').slice(0, 43)
      pending.set(state, queued.shift())
      return { state, nonce: `nonce-${state}`, pkceVerifier: `verifier-${state}`, location: `https://keycloak.test/auth?state=${state}` }
    },
    complete: async ({ expectedState }) => {
      const claims = pending.get(expectedState)
      if (claims instanceof Error || !claims) throw claims ?? new Error('NO_CLAIMS_QUEUED')
      return parseSignInClaims(claims, claims.refresh === undefined ? `refresh-${claims.sub}` : claims.refresh)
    },
    async refresh(input) {
      this.refreshCalls += 1
      const answer = refreshes.shift()
      if (typeof answer === 'function') return answer(input)
      return answer ?? { kind: 'ACTIVE', refreshToken: input.refreshToken }
    },
    endProviderSession: async ({ refreshToken }) => { logouts.push(refreshToken); return 'ENDED' },
    close: async () => undefined,
  }
}

/** An empty migrated database, the identity owner wired as the Hub wires it, and a fake Keycloak. */
export const iamHub = async (t, prefix) => {
  const fixture = await buildHubDatabase(t, prefix)
  await givePasswordToHubRuntime(fixture.connection, fixture.onCleanup, PASSWORD)
  const directory = mkdtempSync(resolve(tmpdir(), 's1-iam-'))
  fixture.onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const passwordFile = resolve(directory, 'password')
  writeFileSync(passwordFile, PASSWORD)
  chmodSync(passwordFile, 0o600)
  const database = openDatabase({ host: fixture.connection.host, port: fixture.connection.port, database: fixture.database, user: 'hub_runtime', passwordFile, max: 8 })
  fixture.onCleanup(() => database.close())
  const envelope = createSecretEnvelope(KEY)
  const oidc = fakeOidc()
  const sessions = createSessions({ database, envelope, provider: oidc })
  const originOf = (slug) => applicationOrigin(APPLICATIONS, slug)
  const applicationAccess = createApplicationAccess({ database, addressOf: originOf })
  const signIn = createSignIn({ database, oidc, sessions, configured: configuredIdentity({ issuer: ISSUER, subject: CONFIGURED_SUBJECT }), origin: HUB_ORIGIN, applicationOrigin: originOf })
  const workspace = createWorkspaceModule({ database })
  const app = await createHttpApp({
    policy: { listener: 'hub', hubOrigin: HUB_ORIGIN, resolveHubSession: sessions.resolveHub },
    registerRoutes: async (server) => {
      await signIn.registerRoutes(server)
      return [
        ...await sessions.registerRoutes(server, workspace),
        ...await registerRosterRoutes(server, database),
        ...await applicationAccess.registerRoutes(server),
        ...await registerAdministratorRoutes(server, database),
        ...await workspace.registerWorkspaceRoutes(server),
      ]
    },
  })
  fixture.onCleanup(() => app.close())
  const sql = (statement, values) => query(fixture.connection, statement, values).then((result) => result.rows)

  /** Begins and completes one sign in with these claims; the begin's query names an application when one is given. */
  const signInWith = async (claims, { application, binding, error } = {}) => {
    oidc.queue(claims)
    const search = application ? `?application=${application}&binding=${binding}` : ''
    const begin = await app.inject({ method: 'GET', url: `/protocol/oidc/login${search}` })
    if (begin.statusCode !== 302) return begin
    const state = new URL(begin.headers.location).searchParams.get('state')
    return app.inject({
      method: 'GET', url: `/protocol/oidc/callback?state=${state}&code=code${error ? `&error=${error}` : ''}`,
      headers: { cookie: `__Host-conexus_oidc_state=${state}` },
    })
  }

  /** The Hub session token a callback set, or null. */
  const sessionOf = (response) => {
    const header = [response.headers['set-cookie'] ?? []].flat().find((value) => value.startsWith('__Host-conexus_session='))
    return header ? header.split(';')[0].slice('__Host-conexus_session='.length) : null
  }

  /** A signed in Hub session of a seeded account, opened straight in the table as a sign in would. */
  const seedAccount = async (accountId, { subject = accountId, name = `Account ${accountId.slice(0, 4)}`, email = null, origin = 'CONTROL_PLANE' } = {}) => {
    await sql('INSERT INTO iam.account (account_id, issuer, external_subject, display_name, email, origin) VALUES ($1, $2, $3, $4, $5, $6)', [accountId, ISSUER, subject, name, email, origin])
    return accountId
  }
  const openHubSession = async (accountId) => {
    const token = randomUUID().replaceAll('-', '').padEnd(43, 'b').slice(0, 43)
    await sql(`INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, idle_expires_at, provider_refresh_token, provider_checked_at)
      VALUES ($1, 'HUB', $2, now(), now() + interval '8 hours', now() + interval '30 minutes', $3, now())`, [digestOf(token), accountId, await envelope.seal(`refresh-${accountId}`)])
    return token
  }
  const seedWorkspace = async (workspaceId, name, members) => {
    await sql('INSERT INTO workspace.workspace (workspace_id, name) VALUES ($1, $2)', [workspaceId, name])
    for (const [accountId, role] of members) await sql('INSERT INTO iam.workspace_membership (account_id, workspace_id, role) VALUES ($1, $2, $3)', [accountId, workspaceId, role])
  }
  const seedProject = async (projectId, workspaceId, name) => {
    await sql(`INSERT INTO project.project (project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, 'NEW', $4, $5)`,
      [projectId, workspaceId, name, 'a'.repeat(40), randomUUID()])
    await sql('INSERT INTO builder.project_working_state (project_id) VALUES ($1)', [projectId])
    await sql('INSERT INTO builder.project_repository (project_id) VALUES ($1)', [projectId])
  }
  const call = (token, method, url, payload, headers = {}) => app.inject({
    method, url, headers: { ...(method === 'GET' ? {} : payload === undefined ? hubWrite : hubJsonWrite), cookie: sessionCookie(token), ...headers },
    ...(payload === undefined ? {} : { payload }),
  })
  return { ...fixture, database, envelope, oidc, sessions, applicationAccess, signIn, app, sql, signInWith, sessionOf, seedAccount, openHubSession, seedWorkspace, seedProject, call }
}

export const problemOf = (response) => `${response.statusCode} ${response.json().code}`

const { logger } = await import(hubModuleUrl('platform/logger.js'))

/** Every line the Hub writes while the test runs, as `{ code, fields }`. */
export const captureLines = (t) => {
  const lines = []
  for (const level of ['info', 'warn', 'error']) t.mock.method(logger, level, (fields, code) => { lines.push({ code: typeof code === 'string' ? code : String(fields?.msg ?? ''), fields }) })
  return { lines, of: (code) => lines.filter((line) => line.code === code).map((line) => line.fields) }
}
