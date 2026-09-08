import type { BuilderSourcePort } from './source.js'
import type { CodingWorkerRuntime } from './runtime.js'
import type { CandidateVerificationRuntime } from './verification-runtime.js'
import type { BuilderStore, ChangeProjection, ClaimedChange, ClaimedVerification } from './store.js'

export type BuilderService = Readonly<{
  createChange(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; intent: string }>): Promise<ChangeProjection>
  recover(): Promise<void>
  close(): Promise<void>
}>

export const createBuilderService = ({ store, source, runtime, verifier }: Readonly<{
  store: BuilderStore
  source: BuilderSourcePort
  runtime: CodingWorkerRuntime
  verifier: CandidateVerificationRuntime
}>): BuilderService => {
  if (runtime.kind !== 'REMOTE_E2B' || verifier.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const active = new Map<string, Promise<void>>()
  const verificationFailureCode = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    return /^[A-Z0-9_]{1,120}$/.test(code) ? code : 'BUILDER_VERIFIER_RUNTIME_FAILURE'
  }
  const executeCoding = async (claim: ClaimedChange): Promise<void> => {
    try {
      const sourceBundle = claim.changeBaseSourceRevision
        ? (await source.prepareCandidate({
            projectId: claim.projectId, changeId: claim.changeId, actorRunId: claim.actorRunId,
            baseSourceRevision: claim.changeBaseSourceRevision, candidateSourceRevision: claim.baseSourceRevision,
          })).bundle
        : await source.prepareSource({
            projectId: claim.projectId, actorRunId: claim.actorRunId, sourceRevision: claim.baseSourceRevision,
          })
      const result = await runtime.execute({
        ...claim, sourceBundle,
        bindPhysicalSandbox: (sandboxId) => store.bindSandbox(claim.actorRunId, claim.admissionToken, sandboxId),
      })
      if (result.projectId !== claim.projectId || result.changeId !== claim.changeId ||
        result.workUnitId !== claim.workUnitId || result.actorRunId !== claim.actorRunId ||
        result.admissionToken !== claim.admissionToken || result.baseSourceRevision !== claim.baseSourceRevision) {
        throw new Error('BUILDER_RUNTIME_RESULT_SCOPE_REFUSED')
      }
      const candidate = await source.admitCandidate({
        projectId: claim.projectId, changeId: claim.changeId, actorRunId: claim.actorRunId,
        baseSourceRevision: claim.baseSourceRevision,
        changeBaseSourceRevision: claim.changeBaseSourceRevision ?? claim.baseSourceRevision,
        claimedCandidateSourceRevision: result.candidateSourceRevision, resultBundle: result.resultBundle,
      })
      await store.settleResult({
        ...claim, sandboxId: result.sandboxId, ...candidate,
        baseSourceRevision: claim.baseSourceRevision, summary: result.summary,
      })
    } catch (error) {
      await store.failRun(claim.actorRunId, claim.admissionToken).catch(() => undefined)
      throw error
    }
  }
  const executeVerification = async (changeId: string): Promise<void> => {
    let verification: ClaimedVerification
    try {
      verification = await store.claimVerification(changeId, verifier.modelIdentity)
    } catch (error) {
      await store.failVerificationClaim(changeId).catch(() => undefined)
      throw error
    }
    try {
      const candidateMaterial = await source.prepareCandidate({
        projectId: verification.projectId, changeId: verification.changeId,
        actorRunId: verification.actorRunId, baseSourceRevision: verification.baseSourceRevision,
        candidateSourceRevision: verification.candidateSourceRevision,
      })
      const result = await verifier.verify({
        ...verification, candidateBundle: candidateMaterial.bundle, changedFiles: candidateMaterial.changedFiles,
        bindPhysicalSandbox: (sandboxId) => store.bindSandbox(
          verification.actorRunId, verification.admissionToken, sandboxId,
        ),
      })
      if (result.projectId !== verification.projectId || result.changeId !== verification.changeId ||
        result.workUnitId !== verification.workUnitId || result.actorRunId !== verification.actorRunId ||
        result.admissionToken !== verification.admissionToken || result.assertionRef !== verification.assertionRef ||
        result.contractRevision !== verification.contractRevision || result.planRevision !== verification.planRevision ||
        result.baselineDigest !== verification.baselineDigest || result.baseSourceRevision !== verification.baseSourceRevision ||
        result.candidateSourceRevision !== verification.candidateSourceRevision) {
        throw new Error('BUILDER_VERIFIER_RESULT_SCOPE_REFUSED')
      }
      await store.settleVerification({ ...verification, sandboxId: result.sandboxId, report: result.report })
    } catch (error) {
      await store.failVerification(
        verification.actorRunId, verification.admissionToken, verificationFailureCode(error),
      ).catch(() => undefined)
      throw error
    }
  }
  const dispatch = (changeId: string): void => {
    if (active.has(changeId)) return
    const work = (async () => {
      let claim = await store.claimChange(changeId, runtime.modelIdentity)
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await executeCoding(claim)
        await executeVerification(changeId)
        if (attempt === 2) return
        const correction = await store.claimCorrection(changeId, runtime.modelIdentity)
        if (!correction) return
        claim = correction
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
