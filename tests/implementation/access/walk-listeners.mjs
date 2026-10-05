import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { hubModuleUrl } from '../hub-build.mjs'
import { testConversations } from '../builder-conversation-fixture.mjs'
import { HUB_ORIGIN, opaque, testListener } from './test-listener.mjs'

const module = (path) => import(hubModuleUrl(path))
const { registerIdentityAccessRoutes } = await module('identity-access/routes.js')
const { registerMembershipRoutes } = await module('identity-access/membership.js')
const { registerApplicationAccessRoutes } = await module('identity-access/application-access.js')
const { registerInstallationRoutes } = await module('identity-access/installation-routes.js')
const { registerWorkspaceRoutes } = await module('workspace/routes.js')
const { registerProjectRoutes } = await module('project/routes.js')
const { registerBuilderRoutes } = await module('builder/routes.js')
const { registerBuilderSessionRoutes } = await module('builder/mastra-session-routes.js')
const { registerModelAccountRoutes } = await module('builder/model-accounts.js')
const { registerConnectorRoutes } = await module('connectors/routes.js')
const { createBuilderController } = await module('builder/harness/controller.js')
const { createMarModule } = await module('mar/module.js')

const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const CONVERSATION = '77777777-7777-4777-8777-777777777777'
const ARTIFACT = '0f8fad5b-d9cb-469f-a165-70867728950e'
export const PREVIEW_PORT = 8444
const APPLICATION_PORT = 8445
const APPLICATION_SLUG = 'caderno'
export const PREVIEW_HOST = `preview-${ARTIFACT}.conexus.localhost:${PREVIEW_PORT}`
export const PREVIEW_ORIGIN = `https://${PREVIEW_HOST}`
export const APPLICATION_HOST = `${APPLICATION_SLUG}.conexus.localhost:${APPLICATION_PORT}`
export const APPLICATION_ORIGIN = `https://${APPLICATION_HOST}`
export const SESSION_TOKEN = opaque('walk session')
export const BOOTSTRAP_TOKEN = opaque('walk bootstrap')
export const ENTRY_GRANT = opaque('walk entry grant')
const SESSION = Object.freeze({ account: { accountId: ACCOUNT, displayName: 'Walker' }, issuer: 'https://issuer.test', subject: 'walker' })

const spy = (owner, calls, answers = {}) => new Proxy({}, {
  get: (_target, key) => key === 'then' ? undefined : (...args) => {
    if (Object.hasOwn(answers, key)) {
      calls.push(`${owner}.${String(key)}`)
      return answers[key](...args)
    }
    calls.push(`${owner}.${String(key)}`)
    throw new Error(`stub ${owner}.${String(key)} ${JSON.stringify(args).slice(0, 80)}`)
  },
})

const staticRootOf = (root) => {
  const staticRoot = join(root, 'public')
  mkdirSync(join(staticRoot, 'assets'), { recursive: true })
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><html><head><title>Conexus</title></head><body></body></html>')
  writeFileSync(join(staticRoot, 'assets', 'app.js'), 'console.log(1)')
  return staticRoot
}

const builderMount = async (root, calls) => {
  const storage = new LibSQLStore({ id: `walk-${randomUUID()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const model = {
    specificationVersion: 'v2', provider: 'walk', modelId: 'walk', supportedUrls: {},
    async doGenerate() { throw new Error('the walk never reaches the model') },
    async doStream() { throw new Error('the walk never reaches the model') },
  }
  const controller = createBuilderController({ id: 'conexus-builder', model, storage, memory, modelRetryDelayMs: () => 1, skillsPath: resolve(import.meta.dirname, '../../../builder-skills') })
  const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
  await controller.init()
  const sessions = testConversations(controller, () => undefined, { now: () => 0 })
  const register = (server) => registerBuilderSessionRoutes(server, {
    mastra, controllerId: 'conexus-builder', controller, conversations: sessions,
    admitProject: async () => { calls.push('mount.admitProject'); return true },
    conversationOwner: ({ conversationId }) => { calls.push('mount.conversationOwner'); return conversationId === CONVERSATION ? 'PROJECT' : 'NONE' },
    projectBusy: async () => { calls.push('mount.projectBusy'); return false },
    answerQuestion: () => { calls.push('mount.answerQuestion'); return 'UNKNOWN_CALL' },
  })
  const close = async () => {
    await sessions.close()
    await controller.destroy()
    await storage.close()
  }
  return { register, close }
}

export const walkListeners = async () => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-route-walk-'))
  const calls = []
  const records = []
  const record = (listener, server) => server.addHook('onRoute', (route) => {
    records.push({ listener, route })
    const handler = route.handler
    route.handler = function marked(request, reply) {
      calls.push(`handler ${listener} ${request.method} ${route.url}`)
      return handler.call(this, request, reply)
    }
  })
  const mount = await builderMount(root, calls)
  const applicationAddress = { port: APPLICATION_PORT, domain: 'conexus.localhost' }
  const hub = await testListener({
    sessions: { [SESSION_TOKEN]: () => { calls.push('hub.resolveHubSession'); return SESSION } },
    staticRoot: staticRootOf(root),
    previewCspSource: `https://*.conexus.localhost:${PREVIEW_PORT}`,
    registerRoutes: async (server) => {
      record('hub', server)
      await registerIdentityAccessRoutes(server, {
        store: spy('identityStore', calls, { createOidcTransaction: async () => undefined }),
        workspaceReader: spy('workspaceReader', calls),
        oidc: { begin: async () => { calls.push('oidc.begin'); return { state: 'walk', nonce: 'walk', pkceVerifier: 'walk', location: 'https://issuer.test/auth' } } },
        config: { origin: HUB_ORIGIN, bootstrapIssuer: 'https://issuer.test', bootstrapSubject: 'walker' },
        hubSessions: spy('hubSessions', calls),
        applications: { sessions: spy('applicationSessions', calls), origin: (slug) => `https://${slug}.conexus.localhost:${APPLICATION_PORT}` },
      })
      await registerMembershipRoutes(server, { store: spy('membership', calls) })
      await registerApplicationAccessRoutes(server, { store: spy('applicationAccess', calls), config: { applicationAddress: () => null } })
      await registerInstallationRoutes(server, { installationAdministration: spy('installationAdministration', calls) })
      await registerWorkspaceRoutes(server, { store: spy('workspace', calls) })
      await registerProjectRoutes(server, { store: spy('project', calls), thumbnailReader: spy('thumbnails', calls) })
      await registerBuilderRoutes(server, { store: spy('builderStore', calls), service: spy('builderService', calls), session: spy('builderSession', calls), launchPreview: async () => { calls.push('launchPreview'); throw new Error('stub launchPreview') } })
      await mount.register(server)
      await registerModelAccountRoutes(server, {
        isInstallationAdministrator: async () => { calls.push('isInstallationAdministrator'); return false },
        modelAccounts: spy('modelAccounts', calls),
        openaiCodexDevice: spy('openaiCodexDevice', calls),
        claudeAuthorization: spy('claudeAuthorization', calls),
        googleAiPro: spy('googleAiPro', calls),
        googleAiProAccounts: spy('googleAiProAccounts', calls),
      })
      await registerConnectorRoutes(server, {
        store: spy('connectors', calls), isInstallationAdministrator: async () => { calls.push('isInstallationAdministrator'); return false },
        checkConnection: async () => { calls.push('checkConnection'); throw new Error('stub checkConnection') }, credentialSchemas: {},
      })
      return []
    },
  })
  const mar = createMarModule({
    sessions: {
      redeem: async ({ handoff }) => { calls.push('previewSessions.redeem'); return handoff === ENTRY_GRANT ? { sessionToken: opaque('walk preview'), maxAgeSeconds: 900 } : null },
      previewAuthority: async () => { calls.push('previewSessions.previewAuthority'); return { kind: 'SIGN_IN_REQUIRED' } },
    },
    registryReader: async () => { calls.push('registryReader'); return null },
    applicationRunner: { invoke: spy('runner', calls).invoke, readFile: async () => { calls.push('runner.readFile'); return null } },
    exactHubOrigin: HUB_ORIGIN,
    previewPort: PREVIEW_PORT,
    applicationHost: {
      sessions: {
        applicationBySlug: async (slug) => { calls.push('applicationHost.applicationBySlug'); return slug === APPLICATION_SLUG ? PROJECT : null },
        applicationAuthority: async () => { calls.push('applicationHost.applicationAuthority'); return { kind: 'SIGN_IN_REQUIRED' } },
        redeem: async () => { calls.push('applicationHost.redeem'); return null },
        signOut: async () => { calls.push('applicationHost.signOut') },
      },
      reader: spy('applicationReader', calls),
      application: applicationAddress,
    },
  })
  const preview = await testListener({ policy: mar.previewPolicy, registerRoutes: (server) => { record('preview', server); return mar.registerPreviewRoutes(server) } })
  const application = await testListener({ policy: mar.applicationHost.policy, registerRoutes: (server) => { record('application', server); return mar.applicationHost.registerRoutes(server) } })
  return {
    listeners: { hub: hub.app, preview: preview.app, application: application.app },
    calls,
    routes: () => records.flatMap(({ listener, route }) => [route.method].flat().map((method) => ({ listener, method, url: route.url, kind: route.config?.access }))),
    close: async () => {
      await Promise.all([hub.app.close(), preview.app.close(), application.app.close()])
      await mar.close()
      await mount.close()
      rmSync(root, { recursive: true, force: true })
    },
  }
}
