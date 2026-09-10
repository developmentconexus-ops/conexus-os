import { randomUUID } from 'node:crypto'

export type BuilderPreviewSubject = Readonly<{
  subjectKind: 'CURRENT_PROJECT' | 'CHANGE_CANDIDATE'
  subjectDigest: string
  sourceRevision: string
  verified: boolean
}>

export type BuildPreview = Readonly<{
  previewId: string
  subjectKind: BuilderPreviewSubject['subjectKind']
  subjectDigest: string
  ready: boolean
  verified: boolean
  live: false
}>

export const projectBuildPreview = (
  subject: BuilderPreviewSubject,
  options: Readonly<{ previewId?: string }> = {},
): BuildPreview => Object.freeze({
  previewId: options.previewId ?? randomUUID(),
  subjectKind: subject.subjectKind,
  subjectDigest: subject.subjectDigest,
  ready: false,
  verified: subject.verified,
  live: false,
})
