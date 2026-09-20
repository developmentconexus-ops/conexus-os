// Probes the Factory's own Work engine, not its storage. An earlier version of this file
// called storage.commitTransition() with an `accepted` verdict it wrote itself, which proved
// nothing: FactoryTransitionService is the component that evaluates a requested move against
// the installed board and produces the verdict.
//
// Throwaway and isolated. It runs inside a scratch install of @mastra/factory, writes only
// into a scratch LibSQL file it creates, calls no model and reaches no network.
//
// Usage: node factory-work.mjs [--negative-control]
// Run it from the scratch directory factory-compat.sh printed.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { WorkItemsStorage, createBoardRegistry } from '@mastra/factory'
// The engine is not in the package's public barrel, so it is reached through the subpath
// wildcard the package exports. That is itself a finding, and the report says so.
import { FactoryTransitionService } from '@mastra/factory/rules/transition-service'
import { LibSQLFactoryStorage } from '@mastra/libsql'

const negativeControl = process.argv.includes('--negative-control')
const dir = mkdtempSync(resolve(tmpdir(), 'factory-work-'))
const storage = new LibSQLFactoryStorage({ id: 'probe', url: `file:${resolve(dir, 'work.db')}` })
const work = storage.registerDomain(new WorkItemsStorage())
await work.ensureReady()

const service = new FactoryTransitionService({
  configVersion: 'probe-1', storage: work, boards: createBoardRegistry(),
})

const orgId = 'org-conexus'
const factoryProjectId = 'factory-project-alpha'
const userId = 'user-operator'

const results = []
const claim = (property, statement, ok, detail = '') => results.push({ property, statement, ok, detail })
const stageOf = (item) => (item?.stages ?? []).join(',') || null

// The engine keys idempotency on the ingress identity, per org and project: a second request
// carrying an identity it has already seen is answered with the first request's result. So a
// probe that wants a second decision has to arrive as a different ingress.
const move = ({ item, stage, expectedRevision = item.revision, board = 'work', identity = randomUUID() }) =>
  service.transition({
    orgId, factoryProjectId, workItemId: item.id, board, stage, expectedRevision,
    actor: { type: 'human', id: userId },
    ingress: { type: 'human', identity, transitionId: randomUUID() },
    cause: 'qualification probe',
  })

const { item: created } = await work.upsert({
  orgId, userId, factoryProjectId, input: { title: 'Adicionar um contador ao aplicativo', board: 'work' },
})
claim('work item', 'a work item is created outside the Factory server, against a scratch LibSQL file',
  typeof created?.id === 'string' && created.revision === 1 && stageOf(created) === 'intake',
  `${created?.id} rev ${created?.revision} stage ${stageOf(created)}`)
claim('identity', 'the creating actor is recorded on the row', created?.createdBy === userId, String(created?.createdBy))

const accepted = await move({ item: created, stage: 'triage' })
const afterAccepted = await work.get({ orgId, id: created.id })
claim('evaluation', 'the Factory accepts a legal move and reports the stage and revision it committed',
  accepted?.status === 'accepted' && accepted.stage === 'triage' && accepted.revision === created.revision + 1,
  `status ${accepted?.status} stage ${accepted?.stage} revision ${accepted?.revision}`)
claim('evaluation', 'the accepted move advanced the row exactly one revision and changed its stage',
  afterAccepted?.revision === created.revision + 1 && stageOf(afterAccepted) === 'triage',
  `rev ${created.revision} -> ${afterAccepted?.revision}, stage ${stageOf(created)} -> ${stageOf(afterAccepted)}`)
claim('evaluation', 'the accepted move carried the Factory\'s own decisions rather than the caller\'s',
  Array.isArray(accepted?.decisions) && accepted.decisions.length > 0,
  JSON.stringify(accepted?.decisions ?? []).slice(0, 160))
claim('identity', 'the stage history names who left intake and who entered triage',
  afterAccepted?.stageHistory?.some((e) => e.stage === 'intake' && e.exitedBy === userId)
  && afterAccepted?.stageHistory?.some((e) => e.stage === 'triage' && e.by === userId),
  JSON.stringify(afterAccepted?.stageHistory ?? []))

// The falsifier. The verdict is the Factory's, so a stage its board does not define has to
// come back rejected, with the row untouched.
const beforeUnknown = await work.get({ orgId, id: created.id })
const unknown = await move({ item: beforeUnknown, stage: 'nao-existe-nesta-board' })
const afterUnknown = await work.get({ orgId, id: created.id })
claim('evaluation', 'the Factory rejects a stage its board does not define, with a code and a reason',
  unknown?.status === 'rejected' && Boolean(unknown.code) && Boolean(unknown.reason),
  `status ${unknown?.status} code ${unknown?.code} reason ${unknown?.reason}`)
claim('evaluation', 'the rejected move left the revision and the stage exactly as they were',
  afterUnknown?.revision === beforeUnknown.revision && stageOf(afterUnknown) === stageOf(beforeUnknown),
  `rev ${beforeUnknown.revision} -> ${afterUnknown?.revision}, stage ${stageOf(beforeUnknown)} -> ${stageOf(afterUnknown)}`)

const wrongBoard = await move({ item: afterUnknown, stage: 'review', board: 'review' })
claim('evaluation', 'the Factory refuses to move an item under a board it does not belong to',
  wrongBoard?.status === 'rejected', `status ${wrongBoard?.status} reason ${wrongBoard?.reason}`)

const beforeStale = await work.get({ orgId, id: created.id })
const stale = await move({ item: beforeStale, stage: 'planning', expectedRevision: beforeStale.revision - 1 })
const afterStale = await work.get({ orgId, id: created.id })
claim('concurrency control', 'a move against a stale revision is rejected rather than applied',
  stale?.status === 'rejected', `status ${stale?.status} code ${stale?.code} reason ${stale?.reason}`)
claim('concurrency control', 'the stale move changed nothing',
  afterStale?.revision === beforeStale.revision && stageOf(afterStale) === stageOf(beforeStale),
  `rev ${beforeStale.revision} -> ${afterStale?.revision}`)

// Idempotency is keyed on the ingress identity, which is the property a retry depends on.
const identity = randomUUID()
const first = await move({ item: afterStale, stage: 'planning', identity })
const replay = await move({ item: afterStale, stage: 'execute', identity })
const afterReplay = await work.get({ orgId, id: created.id })
claim('idempotency', 'a second request under an ingress identity already seen replays the first answer',
  replay?.transitionId === first?.transitionId && replay?.stage === first?.stage,
  `first ${first?.stage}/${first?.transitionId}, replay ${replay?.stage}/${replay?.transitionId}`)
claim('idempotency', 'the replayed request did not move the item a second time',
  stageOf(afterReplay) === 'planning', `stage ${stageOf(afterReplay)} rev ${afterReplay?.revision}`)

const foreign = await work.get({ orgId: 'org-other', id: created.id })
claim('isolation between tenants', 'reading the same work item id under another orgId returns nothing',
  foreign === null || foreign === undefined, String(foreign?.id ?? 'null'))

claim('privacy within a project', 'listing work items takes no user, so every member of a project sees them all',
  (await work.list({ orgId, factoryProjectId })).some((row) => row.id === created.id),
  'WorkItemsStorage.list({orgId, factoryProjectId}) has no userId parameter')

if (negativeControl) {
  claim('negative control', 'the rejected move was reported as accepted', unknown?.status === 'accepted',
    'this claim is false on purpose')
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.property}] ${r.statement}${r.detail ? `  (${r.detail})` : ''}`)
process.exit(results.some((r) => !r.ok) ? 1 : 0)
