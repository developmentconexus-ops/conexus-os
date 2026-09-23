import { z } from 'zod'
import type { CompiledApplication } from './application-artifact-runtime.js'

export type BuilderRunApplicationBuildRequest = Readonly<{
  accountId: string
  projectId: string
  builderRunId: string
  sourceRevision: string
  compiledApplication: CompiledApplication
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

// The application runner, as the Builder needs it: converge a Project's Preview schema on a built
// artifact's migrations before that artifact is offered as a Preview.
export type ApplicationServerPort = Readonly<{
  prepare(input: Readonly<{ projectId: string; files: readonly Readonly<{ path: string; sha256: string; content: string }>[] }>): Promise<
    Readonly<{ state: 'READY'; reset: boolean; applied: readonly string[] }> | Readonly<{ state: 'MIGRATION_FAILED'; detail: string }>
  >
}>

const SERVER_ROOT = 'conexus-server/'

/**
 * Applies the artifact's migrations through the runner when the artifact carries a server tree.
 * Answers whether the Preview data was reset; a failed migration refuses the candidate's Preview and
 * carries the database's own diagnostic for the Builder.
 */
export const prepareApplicationServer = async (
  server: ApplicationServerPort | undefined,
  compiled: CompiledApplication,
): Promise<Readonly<{ reset: boolean }> | null> => {
  const files = compiled.files.filter((file) => file.path.startsWith(SERVER_ROOT))
  if (files.length === 0) return null
  if (!server) throw new Error('APPLICATION_RUNNER_UNAVAILABLE')
  const prepared = await server.prepare({
    projectId: compiled.projectId,
    files: files.map((file) => ({ path: file.path, sha256: file.sha256, content: Buffer.from(file.bytes).toString('base64') })),
  })
  if (prepared.state === 'MIGRATION_FAILED') throw new Error('APPLICATION_MIGRATION_FAILED', { cause: prepared.detail })
  return { reset: prepared.reset }
}

export const prepareBuilderRunApplicationArtifact = async (
  dependencies: Readonly<{ applicationArtifacts: BuilderApplicationArtifacts }>,
  input: BuilderRunApplicationBuildRequest,
): Promise<ApplicationArtifactMetadata> => {
  const cancelled = (): void => { if (input.signal?.aborted) throw new Error('BUILDER_APPLICATION_CANCELLED') }
  cancelled()
  if (!z.uuid().safeParse(input.accountId).success || !z.uuid().safeParse(input.projectId).success ||
    !z.uuid().safeParse(input.builderRunId).success || !/^[0-9a-f]{40}$/i.test(input.sourceRevision)) {
    throw new Error('BUILDER_APPLICATION_REQUEST_REFUSED')
  }
  const result = input.compiledApplication
  if (result.projectId !== input.projectId || result.executionId !== input.builderRunId || result.sourceRevision !== input.sourceRevision) {
    throw new Error('BUILDER_APPLICATION_RESULT_SCOPE_REFUSED')
  }
  cancelled()
  return dependencies.applicationArtifacts.retainApplication({ accountId: input.accountId, compiled: result })
}
