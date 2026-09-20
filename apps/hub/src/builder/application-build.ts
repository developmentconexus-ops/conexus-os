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
