import { z } from 'zod'
import type { ApplicationCompilerRuntime, CompiledApplication } from './application-artifact-runtime.js'
import type { BuilderPreviewSubject } from './preview.js'
import type { BuilderSourcePort } from './source.js'
import type { BuilderStore } from './store.js'

const requestSchema = z.object({ accountId: z.uuid(), projectId: z.uuid(), changeId: z.uuid() }).strict()
export type ApplicationBuildRequest = z.infer<typeof requestSchema> & Readonly<{ signal?: AbortSignal }>

export const compileVerifiedApplication = async (
  dependencies: Readonly<{
    store: Pick<BuilderStore, 'readPreviewSubject'>
    source: Pick<BuilderSourcePort, 'listSourceTree' | 'readSourceFile'>
    compiler: ApplicationCompilerRuntime
  }>,
  input: ApplicationBuildRequest,
): Promise<CompiledApplication> => {
  const cancelled = (): void => {
    if (input.signal?.aborted) throw new Error('BUILDER_APPLICATION_CANCELLED')
  }
  cancelled()
  const parsed = requestSchema.safeParse({ accountId: input.accountId, projectId: input.projectId, changeId: input.changeId })
  if (!parsed.success) throw new Error('BUILDER_APPLICATION_REQUEST_REFUSED')
  const request = parsed.data
  if (dependencies.compiler.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const subject = await dependencies.store.readPreviewSubject(request)
  if (subject?.subjectKind !== 'CHANGE_CANDIDATE' || !subject.verified ||
    !/^[0-9a-f]{40}$/.test(subject.sourceRevision)) throw new Error('BUILDER_APPLICATION_SUBJECT_REFUSED')
  const sameSubject = (current: BuilderPreviewSubject | null): boolean => current !== null &&
    current.subjectKind === subject.subjectKind && current.subjectDigest === subject.subjectDigest &&
    current.sourceRevision === subject.sourceRevision && current.verified
  const recheck = async (): Promise<void> => {
    cancelled()
    if (!sameSubject(await dependencies.store.readPreviewSubject(request))) throw new Error('BUILDER_APPLICATION_SUBJECT_CHANGED')
    cancelled()
  }
  cancelled()
  const coordinates = { projectId: request.projectId, sourceRevision: subject.sourceRevision }
  const tree = await dependencies.source.listSourceTree(coordinates)
  if (tree.sourceRevision !== subject.sourceRevision) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  const paths = tree.entries.filter(entry => entry.kind === 'FILE' && entry.path.startsWith('app/')).map(entry => entry.path)
  if (paths.length > 256 || new Set(paths).size !== paths.length || !paths.includes('app/index.html')) {
    throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  }
  const files: { path: string; content: string }[] = []
  let totalBytes = 0
  for (const path of paths.sort()) {
    cancelled()
    const file = await dependencies.source.readSourceFile({ ...coordinates, path })
    const bytes = Buffer.byteLength(file.content, 'utf8')
    totalBytes += bytes
    if (file.sourceRevision !== subject.sourceRevision || file.path !== path || bytes > 1024 * 1024 || totalBytes > 12 * 1024 * 1024) {
      throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    }
    files.push({ path: path.slice('app/'.length), content: file.content })
  }
  await recheck()
  const result = await dependencies.compiler.compile({
    ...coordinates, changeId: request.changeId, files, ...(input.signal ? { signal: input.signal } : {}),
  })
  if (result.projectId !== request.projectId || result.changeId !== request.changeId || result.sourceRevision !== subject.sourceRevision) {
    throw new Error('BUILDER_APPLICATION_RESULT_SCOPE_REFUSED')
  }
  await recheck()
  return result
}
