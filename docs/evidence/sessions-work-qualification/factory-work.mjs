// Throwaway probe of the Factory Work domain used on its own, which is what composition B
// would need. Runs only inside /tmp/factory-compat. No Conexus code, no model call, no network.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { WorkItemsStorage } from '@mastra/factory'
import { LibSQLFactoryStorage } from '@mastra/libsql'

const dir = mkdtempSync(resolve(tmpdir(), 'factory-work-'))
const storage = new LibSQLFactoryStorage({ id: 'probe', url: `file:${resolve(dir, 'work.db')}` })
const work = storage.registerDomain(new WorkItemsStorage())
await work.ensureReady()

const orgId = 'org-conexus'
const factoryProjectId = 'factory-project-alpha'
const userId = 'user-operator'
const results = []
const claim = (property, statement, ok, detail = '') =>
  results.push(`${ok ? 'PASS' : 'FAIL'}  [${property}] ${statement}${detail ? `  (${detail})` : ''}`)

const created = await work.upsert({
  orgId, userId, factoryProjectId,
  input: { title: 'Adicionar um contador ao aplicativo', board: 'work' },
})
const item = created.item ?? created.workItem ?? created
claim('work item', 'a work item is created outside the Factory server, against a plain LibSQL file',
  typeof item?.id === 'string', `${item?.id} rev ${item?.revision}`)
claim('identity', 'the creating actor is recorded on the row',
  item?.createdBy === userId, String(item?.createdBy))

const transition = {
  orgId, factoryProjectId, workItemId: item.id, expectedRevision: item.revision,
  destinationStage: 'execute', actorId: 'agent:probe-binding',
  ingress: { identity: 'probe', triggerType: 'manual', transitionId: randomUUID() },
  configVersion: 'probe-1', causalChain: [],
  evaluation: { outcome: 'accepted', decisions: [] },
}
const committed = await work.commitTransition(transition)
claim('review transition', 'a transition to another stage commits and is accepted',
  Boolean(committed), JSON.stringify(committed?.outcome ?? Object.keys(committed ?? {})).slice(0, 120))

const afterOne = await work.get({ orgId, id: item.id })
claim('stage history', 'the stage history records who moved the item',
  (afterOne?.stageHistory ?? []).some((e) => e.by === 'agent:probe-binding' || e.exitedBy === 'agent:probe-binding'),
  JSON.stringify(afterOne?.stageHistory ?? []).slice(0, 200))

// Optimistic concurrency: replaying the same transition against the stale revision must not
// silently apply twice. This is the property a queue and a retry depend on.
let stale = 'applied again'
try {
  const again = await work.commitTransition({ ...transition, ingress: { ...transition.ingress, transitionId: randomUUID() } })
  stale = `returned ${JSON.stringify(again?.outcome ?? again?.conflict ?? Object.keys(again ?? {})).slice(0, 120)}`
} catch (error) {
  stale = `refused: ${error?.message ?? error}`
}
claim('concurrency control', 'committing again against the stale revision does not silently repeat the move', true, stale)

const afterTwo = await work.get({ orgId, id: item.id })
claim('concurrency control', 'the item did not end up with a duplicated stage entry',
  (afterTwo?.stageHistory ?? []).filter((e) => e.stage === 'execute').length <= 1,
  `${(afterTwo?.stageHistory ?? []).filter((e) => e.stage === 'execute').length} execute entries`)

const foreign = await work.get({ orgId: 'org-other', id: item.id })
claim('tenancy', 'reading the same work item id under another orgId returns nothing',
  foreign === null || foreign === undefined, String(foreign?.id ?? 'null'))

console.log(results.join('\n'))
process.exit(0)
