// Probe: with the Builder's own modes and no Conexus model connection anywhere, does a session
// arrive holding a model, and does that model come from Mastra Code's own credential store?
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibSQLStore } from '@mastra/libsql'
import { RequestContext } from '@mastra/core/request-context'
import { prepareAgentControllerMount } from '@mastra/code-sdk'
import { Mastra } from '@mastra/core/mastra'
import { BUILDER_MODE_DEFINITIONS, BUILDER_BASE_AGENT_INSTRUCTIONS } from '../../../apps/hub/src/builder/application-starter.ts'

const assert = (ok, claim) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${claim}`)
  if (!ok) process.exitCode = 1
}

const root = mkdtempSync(join(tmpdir(), 'conv-model-'))
const storage = new LibSQLStore({ id: 'conexus-builder-session', url: `file:${join(root, 'builder-session.db')}` })
const prepared = await prepareAgentControllerMount({
  controllerId: 'conexus-builder-controller',
  storage,
  storageBackend: 'libsql',
  cwd: root,
  configDir: '.conexus-builder',
  disableMcp: true,
  disableHooks: true,
  disablePlugins: true,
  disableGithubSignals: true,
  disableSettingsOmSeed: true,
  initialState: { yolo: true },
  modes: BUILDER_MODE_DEFINITIONS.map((mode) => ({ ...mode, availableTools: [...mode.availableTools] })),
  hostInstructions: BUILDER_BASE_AGENT_INSTRUCTIONS,
  workspace: () => undefined,
})
const mastra = new Mastra({ ...prepared.mastraArgs, logger: false })
await prepared.finalize()
const controller = prepared.base.controller

console.log('effectiveDefaults=', JSON.stringify(prepared.base.effectiveDefaults))
const credentials = prepared.base.authStorage.list()
console.log('credential store holds=', JSON.stringify(Array.isArray(credentials) ? credentials : Object.keys(credentials ?? {})))

const caller = new RequestContext()
caller.set('user', { id: 'account-under-test', organizationId: 'conexus' })
const session = await controller.createSession({ resourceId: 'project-under-test', ownerId: 'project-under-test', requestContext: caller })

const modeId = session.mode.get()
assert(modeId === 'build', `a new session starts in the Builder's own build mode (got ${modeId})`)
const modelId = session.model.get()
console.log(`session model=${JSON.stringify(modelId)} hasSelection=${session.model.hasSelection()}`)

const buildTools = session.mode.resolve()?.availableTools ?? []
assert(buildTools.includes('write_file'), `build mode carries Mastra Code's own tools (got ${buildTools.join(',')})`)

// What the browser's model control will do: save the operator's choice for the mode, then check
// that a conversation opened later in the same Project arrives already holding it.
await session.model.saveForMode({ modeId: 'build', modelId: 'openai/gpt-5.5' })
assert(session.model.get() === '', 'framework property: saveForMode persists the choice without moving the live session, which also needs set()')
session.model.set({ modelId: 'openai/gpt-5.5' })
assert(session.model.get() === 'openai/gpt-5.5', `set() moves the session that saved it (got ${session.model.get()})`)

const later = await controller.createSession({ resourceId: 'project-under-test', scope: 'a-later-run', requestContext: caller })
console.log(`later session model=${JSON.stringify(later.model.get())} hasSelection=${later.model.hasSelection()}`)
assert(later.model.get() === 'openai/gpt-5.5', `a run opened afterwards inherits that choice (got ${later.model.get()})`)

const other = await controller.createSession({ resourceId: 'another-project', requestContext: caller })
assert(other.model.get() === '', `the choice does not leak to another Project (got ${other.model.get()})`)

await controller.destroy()
await storage.close()
await mastra.shutdown?.().catch(() => undefined)
