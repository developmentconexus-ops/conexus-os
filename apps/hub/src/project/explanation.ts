import type { Prj24Body, Prj24Response } from '../generated/s3-routes.js'
import type { ProjectMastraPort } from './project-mastra.js'
import type { ProjectStore } from './store.js'

export type ProjectBaselineExplanationService = Readonly<{
  run(input: Readonly<{
    accountId: string
    projectId: string
    candidateBaselineDigest: string
    body: Prj24Body
  }>): Promise<Prj24Response>
}>

export const createProjectBaselineExplanationService = ({
  store,
  cognition,
  admissionId,
}: Readonly<{
  store: ProjectStore
  cognition: ProjectMastraPort
  admissionId: string
}>): ProjectBaselineExplanationService => Object.freeze({
  run: async (input) => {
    if (!input.body.question.trim() || input.body.reviewContext !== undefined) {
      throw new Error('PRJ24_INPUT_REFUSED')
    }
    const candidate = await store.getBaselineCandidate({
      accountId: input.accountId,
      projectId: input.projectId,
      candidateBaselineDigest: input.candidateBaselineDigest,
    })
    if (!candidate) throw new Error('PRJ24_CANDIDATE_NOT_FOUND')
    const explanation = await cognition.askAboutCandidate({
      admissionId,
      candidate,
      question: input.body.question,
    })
    const current = await store.getBaselineCandidate({
      accountId: input.accountId,
      projectId: input.projectId,
      candidateBaselineDigest: input.candidateBaselineDigest,
    })
    if (!current || current.candidateBaselineDigest !== candidate.candidateBaselineDigest ||
      current.sourceRevision !== candidate.sourceRevision || current.sourceText !== candidate.sourceText ||
      current.applicationRuntimeProfile !== candidate.applicationRuntimeProfile) {
      throw new Error('PRJ24_SUBJECT_STALE')
    }
    return Object.freeze({
      candidateBaselineDigest: candidate.candidateBaselineDigest,
      answer: explanation.answer,
      provenanceRefs: [...explanation.provenanceRefs],
    })
  },
})
