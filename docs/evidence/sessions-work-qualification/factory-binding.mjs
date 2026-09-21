// Probes the step that binds a work item to a run, which is where the two compositions
// actually differ. A conversation needs nothing from source control; starting Work goes
// through FactoryStartCoordinator, which refuses without a source-control handle.
//
// Throwaway and isolated. Scratch LibSQL file, no integrations, no sandbox, no model call,
// no network. Run it from the scratch directory factory-compat.sh printed.
//
// Usage: node factory-binding.mjs [--negative-control]
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { MastraFactory, WorkItemsStorage, FactoryProjectsStorage, createBoardRegistry } from '@mastra/factory'
import { FactoryStartCoordinator } from '@mastra/factory/rules/start-coordinator'
import { FactoryTransitionService } from '@mastra/factory/rules/transition-service'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLFactoryStorage } from '@mastra/libsql'

const negativeControl = process.argv.includes('--negative-control')
const dir = mkdtempSync(resolve(tmpdir(), 'factory-binding-'))
const storage = new LibSQLFactoryStorage({ id: 'probe', url: `file:${resolve(dir, 'binding.db')}` })

const results = []
const claim = (property, statement, ok, detail = '') => results.push({ property, statement, ok, detail })
const refusal = async (attempt) => {
  try { return { refused: false, detail: `completed: ${String(JSON.stringify(await attempt())).slice(0, 120)}` } }
  catch (error) { return { refused: true, detail: error?.message ?? String(error) } }
}

const factory = new MastraFactory({ storage, auth: null })
const args = await factory.prepare()
const mastra = new Mastra(args)
await factory.finalize()
const controller = args.agentControllers[Object.keys(args.agentControllers)[0]]

const orgId = 'org-conexus'
const userId = 'user-operator'
// The Factory registers its own domains during prepare(); getDomain throws when one is
// missing, so the probe reuses what is there and registers only what is not.
const domain = (name, make) => {
  try { return storage.getDomain(name) } catch { return storage.registerDomain(make()) }
}
const projects = domain('projects', () => new FactoryProjectsStorage())
await projects.ensureReady()
const project = await projects.create({ orgId, userId, input: { name: 'Conexus Project A' } })
claim('project', 'a Factory project is created with no repository attached',
  typeof project?.id === 'string' && !('repositoryId' in project), `${project?.id} keys ${Object.keys(project ?? {}).length}`)

// A conversation costs nothing beyond a resourceId the host chooses.
const conversation = await controller.createSession({ resourceId: `conexus-project:${project.id}` })
const first = await conversation.thread.create({ title: 'Conversa um' })
const second = await conversation.thread.create({ title: 'Conversa dois' })
claim('conversations under the Factory', 'the Factory\'s own controller opens two conversations for a project with no repository and no sandbox',
  first.id !== second.id, `${first.id} and ${second.id}`)
const workspace = await refusal(() => conversation.getWorkspace())
claim('conversations under the Factory', 'such a session has no workspace and does not fail for the lack of one',
  !workspace.refused, workspace.detail)
claim('conversations under the Factory', 'the host chose the resourceId, so its own Project identity is what the session is keyed on',
  controller.getSessionByResource(`conexus-project:${project.id}`) !== undefined,
  `resourceId conexus-project:${project.id}`)

// Work is where it stops. The coordinator is the only path that binds a work item to a run.
const work = domain('work-items', () => new WorkItemsStorage())
await work.ensureReady()
const coordinator = new FactoryStartCoordinator(
  controller, work, new FactoryTransitionService({ configVersion: 'probe-1', storage: work, boards: createBoardRegistry() }),
)
const start = await refusal(() => coordinator.prepare({
  orgId, userId, factoryProjectId: project.id, sessionId: conversation.id ?? 'probe-session',
  threadTitle: 'Adicionar um contador', kickoffKey: 'probe-1',
  workItem: { role: 'execute', input: { title: 'Adicionar um contador ao aplicativo', board: 'work' } },
}))
claim('starting Work', 'starting Work without a source-control handle is refused by the Factory itself',
  start.refused, start.detail)

await factory.shutdown()

if (negativeControl) {
  claim('negative control', 'starting Work without source control succeeded', !start.refused, 'this claim is false on purpose')
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.property}] ${r.statement}${r.detail ? `  (${r.detail})` : ''}`)
process.exitCode = results.some((r) => !r.ok) ? 1 : 0
