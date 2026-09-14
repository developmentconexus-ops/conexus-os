export type BuilderPreviewSubject = Readonly<{
  subjectKind: 'CURRENT_PROJECT'
  subjectDigest: string
  sourceRevision: string
  verified: boolean
  previewEligible?: boolean
  workingSourceRevision?: string
  lastPreviewSourceRevision?: string | null
  lastPreviewArtifactRevisionId?: string | null
  lastPreviewArtifactDigest?: string | null
}>
