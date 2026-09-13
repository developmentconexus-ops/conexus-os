import { z } from 'zod'
import type { ApplicationCompilerRuntime, CompiledApplication } from './application-artifact-runtime.js'
import type { BuilderPreviewSubject } from './preview.js'
import type { BuilderSourcePort } from './source.js'
import type { BuilderStore } from './store.js'

const requestSchema = z.object({ accountId: z.uuid(), projectId: z.uuid(), changeId: z.uuid() }).strict()
export type ApplicationBuildRequest = z.infer<typeof requestSchema> & Readonly<{ signal?: AbortSignal }>

export type ApplicationArtifactCoordinates = Readonly<{
  accountId: string
  projectId: string
  changeId: string
  sourceRevision: string
}>

export type ApplicationArtifactClient = Readonly<{
  query(statement: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}>

export type ApplicationArtifactMetadata = Readonly<{
  artifactRevisionId: string
  artifactDigest: string
  projectId: string
  sourceRevision: string
  profile: 'REACT_VITE_V1'
  templateRef: string
  recipeSha256: string
  entryPath: 'index.html'
  files: readonly Readonly<{
    path: string
    mediaType: string
    byteLength: number
    sha256: string
  }>[]
}>

export type ApplicationArtifactReadRequest = Readonly<{
  accountId: string
  projectId: string
  changeId: string
  sourceRevision: string
  artifactRevisionId: string
  path: string
}>

export type ApplicationArtifactReadResult = Readonly<{
  path: string
  mediaType: string
  bytes: Uint8Array
  sha256: string
}>

export type BuilderApplicationArtifacts = Readonly<{
  getApplication(input: ApplicationArtifactCoordinates): Promise<ApplicationArtifactMetadata | null>
  retainApplication(input: Readonly<{ accountId: string; compiled: CompiledApplication }>): Promise<ApplicationArtifactMetadata>
  readApplicationFile(input: ApplicationArtifactReadRequest): Promise<ApplicationArtifactReadResult | null>
}>

export type UnboundBuilderApplicationArtifacts = Readonly<{
  getApplication(client: ApplicationArtifactClient, input: ApplicationArtifactCoordinates): Promise<ApplicationArtifactMetadata | null>
  retainApplication(client: ApplicationArtifactClient, input: Readonly<{ accountId: string; compiled: unknown }>): Promise<ApplicationArtifactMetadata>
  readApplicationFile(client: ApplicationArtifactClient, input: ApplicationArtifactReadRequest): Promise<ApplicationArtifactReadResult | null>
}>

export const prepareApplicationArtifact = async (
  dependencies: Readonly<{
    store: Pick<BuilderStore, 'readPreviewSubject'>
    source: Pick<BuilderSourcePort, 'listSourceTree' | 'readSourceFile'>
    compiler: ApplicationCompilerRuntime
    applicationArtifacts: BuilderApplicationArtifacts
  }>,
  input: ApplicationBuildRequest,
): Promise<ApplicationArtifactMetadata> => {
  const cancelled = (): void => {
    if (input.signal?.aborted) throw new Error('BUILDER_APPLICATION_CANCELLED')
  }
  cancelled()
  const parsed = requestSchema.safeParse({ accountId: input.accountId, projectId: input.projectId, changeId: input.changeId })
  if (!parsed.success) throw new Error('BUILDER_APPLICATION_REQUEST_REFUSED')
  const request = parsed.data
  if (dependencies.compiler.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const subject = await dependencies.store.readPreviewSubject(request)
  cancelled()
  if (subject?.subjectKind !== 'CHANGE_CANDIDATE' || !(subject.previewEligible ?? subject.verified) ||
    !/^[0-9a-f]{40}$/.test(subject.sourceRevision)) throw new Error('BUILDER_APPLICATION_SUBJECT_REFUSED')
  const sameSubject = (current: BuilderPreviewSubject | null): boolean => current !== null &&
    current.subjectKind === subject.subjectKind && current.subjectDigest === subject.subjectDigest &&
    current.sourceRevision === subject.sourceRevision && (current.previewEligible ?? current.verified)
  const recheck = async (): Promise<void> => {
    cancelled()
    if (!sameSubject(await dependencies.store.readPreviewSubject(request))) throw new Error('BUILDER_APPLICATION_SUBJECT_CHANGED')
    cancelled()
  }
  const coordinates: ApplicationArtifactCoordinates = {
    accountId: request.accountId,
    projectId: request.projectId,
    changeId: request.changeId,
    sourceRevision: subject.sourceRevision,
  }
  const retained = await dependencies.applicationArtifacts.getApplication(coordinates)
  cancelled()
  if (retained) {
    await recheck()
    return retained
  }
  await recheck()
  const sourceCoordinates = { projectId: request.projectId, sourceRevision: subject.sourceRevision }
  const tree = await dependencies.source.listSourceTree(sourceCoordinates)
  cancelled()
  if (tree.sourceRevision !== subject.sourceRevision) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  const paths = tree.entries.filter(entry => entry.kind === 'FILE' && entry.path.startsWith('app/')).map(entry => entry.path)
  if (paths.length > 256 || new Set(paths).size !== paths.length || !paths.includes('app/index.html')) {
    throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  }
  const files: { path: string; content: string }[] = []
  let totalBytes = 0
  for (const path of paths.sort()) {
    cancelled()
    const file = await dependencies.source.readSourceFile({ ...sourceCoordinates, path })
    cancelled()
    const bytes = Buffer.byteLength(file.content, 'utf8')
    totalBytes += bytes
    if (file.sourceRevision !== subject.sourceRevision || file.path !== path || bytes > 1024 * 1024 || totalBytes > 12 * 1024 * 1024) {
      throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    }
    files.push({ path: path.slice('app/'.length), content: file.content })
  }
  await recheck()
  const result = await dependencies.compiler.compile({
    ...sourceCoordinates, changeId: request.changeId, files, ...(input.signal ? { signal: input.signal } : {}),
  })
  cancelled()
  if (result.projectId !== request.projectId || result.changeId !== request.changeId || result.sourceRevision !== subject.sourceRevision) {
    throw new Error('BUILDER_APPLICATION_RESULT_SCOPE_REFUSED')
  }
  await recheck()
  const metadata = await dependencies.applicationArtifacts.retainApplication({ accountId: request.accountId, compiled: result })
  cancelled()
  await recheck()
  return metadata
}
