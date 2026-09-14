import { randomUUID } from 'node:crypto'

export type BuilderPreviewSubject = Readonly<{
  subjectKind: 'CURRENT_PROJECT' | 'CHANGE_CANDIDATE'
  subjectDigest: string
  sourceRevision: string
  verified: boolean
  previewEligible?: boolean
  workingSourceRevision?: string
  activeChangeId?: string | null
  lastPreviewChangeId?: string | null
  lastPreviewArtifactRevisionId?: string | null
  lastPreviewArtifactDigest?: string | null
}>

export type BuildPreview = Readonly<{
  previewId: string
  subjectKind: BuilderPreviewSubject['subjectKind']
  subjectDigest: string
  ready: boolean
  verified: boolean
  previewEligible?: boolean
  workingSourceRevision?: string
  activeChangeId?: string | null
  lastPreviewChangeId?: string | null
  lastPreviewArtifactRevisionId?: string | null
  lastPreviewArtifactDigest?: string | null
  live: false
  preparation?: BuildPreviewPreparation
}>

export type BuildPreviewPreparation = Readonly<{
  changeId: string
  subjectDigest: string
  attemptId: string
  expiresAt: string
}> & (
  | Readonly<{ state: 'PREPARING' | 'EXPIRED' }>
  | Readonly<{ state: 'PREPARED'; artifactRevisionId: string; artifactDigest: string }>
  | Readonly<{ state: 'FAILED'; code: 'PREPARATION_FAILED' }>
)

export const projectBuildPreview = (
  subject: BuilderPreviewSubject,
  options: Readonly<{ previewId?: string; preparation?: BuildPreviewPreparation | null }> = {},
): BuildPreview => Object.freeze({
  previewId: options.previewId ?? randomUUID(),
  subjectKind: subject.subjectKind,
  subjectDigest: subject.subjectDigest,
  ready: false,
  verified: subject.verified,
  ...(subject.previewEligible !== undefined ? { previewEligible: subject.previewEligible } : {}),
  ...(subject.workingSourceRevision !== undefined ? { workingSourceRevision: subject.workingSourceRevision } : {}),
  ...(subject.activeChangeId !== undefined ? { activeChangeId: subject.activeChangeId } : {}),
  ...(subject.lastPreviewChangeId !== undefined ? { lastPreviewChangeId: subject.lastPreviewChangeId } : {}),
  ...(subject.lastPreviewArtifactRevisionId !== undefined ? { lastPreviewArtifactRevisionId: subject.lastPreviewArtifactRevisionId } : {}),
  ...(subject.lastPreviewArtifactDigest !== undefined ? { lastPreviewArtifactDigest: subject.lastPreviewArtifactDigest } : {}),
  live: false,
  ...(options.preparation ? { preparation: options.preparation } : {}),
})
