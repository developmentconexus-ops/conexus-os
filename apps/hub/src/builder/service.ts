import type { BuilderSourcePort } from './source.js'
import type { CodingWorkerRuntime } from './runtime.js'
import type { BuilderStore, ChangeProjection } from './store.js'

export type BuilderService = Readonly<{
  createChange(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; intent: string }>): Promise<ChangeProjection>
  recover(): Promise<void>
  close(): Promise<void>
}>

export const createBuilderService = ({ store, source, runtime }: Readonly<{
  store: BuilderStore
  source: BuilderSourcePort
  runtime: CodingWorkerRuntime
}>): BuilderService => {
  if (runtime.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const active = new Map<string, Promise<void>>()
  const dispatch = (changeId: string): void => {
    if (active.has(changeId)) return
    const work = (async () => {
      const claim = await store.claimChange(changeId, runtime.modelIdentity)
      try {
        const sourceBundle = await source.prepareSource({
          projectId: claim.projectId,
          actorRunId: claim.actorRunId,
          sourceRevision: claim.baseSourceRevision,
        })
        const result = await runtime.execute({
          ...claim,
          sourceBundle,
          bindPhysicalSandbox: (sandboxId) => store.bindSandbox(claim.actorRunId, claim.admissionToken, sandboxId),
        })
        if (result.projectId !== claim.projectId || result.changeId !== claim.changeId ||
          result.workUnitId !== claim.workUnitId || result.actorRunId !== claim.actorRunId ||
          result.admissionToken !== claim.admissionToken || result.baseSourceRevision !== claim.baseSourceRevision) {
          throw new Error('BUILDER_RUNTIME_RESULT_SCOPE_REFUSED')
        }
        const candidate = await source.admitCandidate({
          projectId: claim.projectId,
          changeId: claim.changeId,
          actorRunId: claim.actorRunId,
          baseSourceRevision: claim.baseSourceRevision,
          claimedCandidateSourceRevision: result.candidateSourceRevision,
          resultBundle: result.resultBundle,
        })
        await store.settleResult({ ...claim, sandboxId: result.sandboxId, ...candidate, summary: result.summary })
      } catch (error) {
        await store.failRun(claim.actorRunId, claim.admissionToken).catch(() => undefined)
        throw error
      }
    })().catch(() => undefined).finally(() => { active.delete(changeId) })
    active.set(changeId, work)
  }
  return Object.freeze({
    createChange: async (input) => {
      const change = await store.createChange(input)
      if (change.state === 'QUEUED') dispatch(change.changeId)
      return change
    },
    recover: async () => { for (const changeId of await store.recoverAndListQueued()) dispatch(changeId) },
    close: async () => { await Promise.all(active.values()); await store.close() },
  })
}
