import { z } from 'zod'
import type { ApplicationCompilerRuntime, CompiledApplication } from './application-artifact-runtime.js'
import type { BuilderSourcePort } from './source.js'

export type BuilderRunApplicationBuildRequest = Readonly<{
  accountId: string
  projectId: string
  builderRunId: string
  sourceRevision: string
  signal?: AbortSignal
}>

export type ApplicationSourceCoordinates = Readonly<{
  accountId: string
  projectId: string
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

export type ApplicationArtifactReadResult = Readonly<{
  path: string
  mediaType: string
  bytes: Uint8Array
  sha256: string
}>

export type BuilderApplicationArtifacts = Readonly<{
  getApplicationBySource?(input: ApplicationSourceCoordinates): Promise<ApplicationArtifactMetadata | null>
  retainApplication(input: Readonly<{ accountId: string; compiled: CompiledApplication }>): Promise<ApplicationArtifactMetadata>
  readApplicationFileBySource?(input: ApplicationSourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
}>

export type UnboundBuilderApplicationArtifacts = Readonly<{
  getApplicationBySource?(client: ApplicationArtifactClient, input: ApplicationSourceCoordinates): Promise<ApplicationArtifactMetadata | null>
  retainApplication(client: ApplicationArtifactClient, input: Readonly<{ accountId: string; compiled: unknown }>): Promise<ApplicationArtifactMetadata>
  readApplicationFileBySource?(client: ApplicationArtifactClient, input: ApplicationSourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
}>

export const prepareBuilderRunApplicationArtifact = async (
  dependencies: Readonly<{
    source: Pick<BuilderSourcePort, 'listSourceTree' | 'readSourceFiles'>
    compiler: ApplicationCompilerRuntime
    applicationArtifacts: BuilderApplicationArtifacts
  }>,
  input: BuilderRunApplicationBuildRequest,
): Promise<ApplicationArtifactMetadata> => {
  const cancelled = (): void => { if (input.signal?.aborted) throw new Error('BUILDER_APPLICATION_CANCELLED') }
  cancelled()
  if (!z.uuid().safeParse(input.accountId).success || !z.uuid().safeParse(input.projectId).success ||
    !z.uuid().safeParse(input.builderRunId).success || !/^[0-9a-f]{40}$/i.test(input.sourceRevision)) {
    throw new Error('BUILDER_APPLICATION_REQUEST_REFUSED')
  }
  if (dependencies.compiler.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const sourceCoordinates = { projectId: input.projectId, sourceRevision: input.sourceRevision }
  const tree = await dependencies.source.listSourceTree(sourceCoordinates)
  cancelled()
  if (tree.sourceRevision !== input.sourceRevision) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  const paths = tree.entries.filter(entry => entry.kind === 'FILE' && entry.path.startsWith('app/')).map(entry => entry.path).sort()
  if (paths.length > 256 || new Set(paths).size !== paths.length || !paths.includes('app/index.html')) {
    throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  }
  const disclosed = await dependencies.source.readSourceFiles({ ...sourceCoordinates, paths })
  cancelled()
  if (disclosed.sourceRevision !== input.sourceRevision || disclosed.files.length !== paths.length) {
    throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  }
  const files: { path: string; content: string }[] = []
  let totalBytes = 0
  for (const [index, file] of disclosed.files.entries()) {
    const path = paths[index] as string
    const bytes = Buffer.byteLength(file.content, 'utf8')
    totalBytes += bytes
    if (file.path !== path || bytes > 1024 * 1024 || totalBytes > 12 * 1024 * 1024) {
      throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    }
    files.push({ path: path.slice('app/'.length), content: file.content })
  }
  const result = await dependencies.compiler.compile({
    ...sourceCoordinates, executionId: input.builderRunId, files, ...(input.signal ? { signal: input.signal } : {}),
  })
  cancelled()
  if (result.projectId !== input.projectId || !('executionId' in result) || result.executionId !== input.builderRunId || result.sourceRevision !== input.sourceRevision) {
    throw new Error('BUILDER_APPLICATION_RESULT_SCOPE_REFUSED')
  }
  return dependencies.applicationArtifacts.retainApplication({ accountId: input.accountId, compiled: result })
}
