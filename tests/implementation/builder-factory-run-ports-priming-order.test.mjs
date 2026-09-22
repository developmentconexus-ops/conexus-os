import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { GithubIntegration } from '@mastra/factory/integrations/github/integration'

// Kept in its own process (its own file): the vendored custom-providers primer caches one
// snapshot per org for the process's lifetime, bound to whatever storage first primed it — a
// second test reusing that org after an earlier `configure()` call would see the earlier test's
// (usually absent) custom-providers storage, not this file's. See builder-factory-run-ports.test.mjs
// for the rest of createMastraFactoryRunPorts' coverage.

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-factory-run-ports-priming-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createMastraFactoryRunPorts } = await import(built('builder/factory-runtime.js'))
const { createFactorySandbox } = await import(built('builder/factory.js'))

const ORG = 'conexus-installation'
const conversationId = '44444444-4444-4444-8444-444444444444'
const accountId = '33333333-3333-4333-8333-333333333333'
const githubApp = {
  appId: '1', clientId: 'client', clientSecret: 'secret', slug: 'conexus-probe',
  privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }),
}

const fakeSession = (events) => {
  const listeners = new Set()
  const models = { observer: 'google/gemini-3.5-flash', reflector: 'google/gemini-3.5-flash' }
  const role = (name) => ({ modelId: () => models[name], switchModel: async ({ modelId }) => { events.push(`switch-${name}`); models[name] = modelId } })
  const stateWrites = []
  let state = {}
  return {
    models,
    stateWrites,
    getWorkspace: () => ({ sandbox: createFactorySandbox({ apiKey: 'unused', templateId: 'conexus:tpl' })({ sessionId: conversationId }) }),
    state: { get: () => state, set: async (updates) => { stateWrites.push(updates); state = { ...state, ...updates } } },
    om: { observer: role('observer'), reflector: role('reflector') },
    mode: { switch: async () => undefined },
    model: { hasSelection: () => true },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    abort: () => undefined,
    sendMessage: async () => {
      for (const listener of listeners) listener({ type: 'message_end', message: { id: 'user-1', role: 'user' } })
      for (const listener of listeners) listener({ type: 'agent_end', reason: 'complete' })
    },
    thread: { listActiveMessages: async () => [] },
  }
}

const memoryRow = (userId, modelId) => ({ orgId: ORG, userId, observerModelId: modelId, reflectorModelId: modelId, observationThreshold: null, reflectionThreshold: null, observeAttachments: null })

// A stored memory row can name a custom-provider model (e.g. Google AI Pro's
// `mastracode/google-ai-pro/<model>` gateway id). Per factory-runtime.ts's own comment, the model
// gateway reads its credential and custom-provider snapshots synchronously, and only an awaited
// priming call fills them. `configure` switches the observer and reflector onto the stored row —
// if that switch runs before this run's own priming call, a custom-provider OM model resolves
// against an empty snapshot and only fails later, when observation actually calls it.
test('a custom-provider memory model is not switched onto before its credential and custom-provider snapshots are primed', async () => {
  const events = []
  const session = fakeSession(events)
  const ports = createMastraFactoryRunPorts({
    orgId: ORG,
    log: () => undefined,
    composition: {
      controller: {
        createSession: async () => session,
        deleteSession: async () => true,
        getSessionByResource: async () => null,
      },
      github: new GithubIntegration(githubApp),
      storage: {
        getDomain: (name) => {
          if (name === 'memory-settings') return { get: async ({ userId }) => (userId === accountId ? memoryRow(accountId, 'mastracode/google-ai-pro/gemini-3.5-flash-lite') : null) }
          if (name === 'model-credentials') return { ensureReady: async () => { events.push('prime-credentials') }, listCredentials: async () => [] }
          if (name === 'custom-providers') return { ensureReady: async () => { events.push('prime-custom-providers') }, list: async () => [] }
          return undefined
        },
      },
    },
  })
  const run = await ports.openSession({ conversationId, builderRunId: '11111111-1111-4111-8111-111111111111', projectId: '22222222-2222-4222-8222-222222222222', accountId })
  await run.configure({ mode: 'BUILD', instructions: 'Edit the checkout.' })

  const switchIndex = events.indexOf('switch-observer')
  assert.notEqual(switchIndex, -1, 'the observer model was switched')
  assert.ok(events.indexOf('prime-credentials') !== -1 && events.indexOf('prime-credentials') < switchIndex, `credentials must prime before the switch, got ${JSON.stringify(events)}`)
  assert.ok(events.indexOf('prime-custom-providers') !== -1 && events.indexOf('prime-custom-providers') < switchIndex, `custom providers must prime before the switch, got ${JSON.stringify(events)}`)
})
