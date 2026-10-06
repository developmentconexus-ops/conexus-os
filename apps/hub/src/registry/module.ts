import type { AccountId, ApplicationFilePath, ArtifactRevisionId, ProjectId, SourceRevision } from '../../../../packages/contract/dist/index.js'
import { checkApplication, type Admitted, type ProjectScope } from '../identity-access/admission.js'
import type { Database } from '../platform/db.js'
import { purge, retain } from './retain.js'
import { seal } from './seal.js'
import { readLaunchOf, readManifest, readPinnedFileOf, readPreviewFileOf, readServedFileOf, readThumbnailOf, type ApplicationFile, type PinnedFile, type ServedFile, type ServedLaunch, type ServedManifest, type ServedThumbnail } from './served.js'

export type RegistryModule = Readonly<{
  seal: typeof seal
  retain: typeof retain
  purge: typeof purge
  readLaunch(proof: Admitted<ProjectScope<'project.build'>>): Promise<ServedLaunch | null>
  readPreviewFile(accountId: AccountId, at: Readonly<{ projectId: ProjectId; sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; path: ApplicationFilePath }>): Promise<ApplicationFile | null>
  readServedManifest(accountId: AccountId, projectId: ProjectId): Promise<ServedManifest | null>
  readServedFile(accountId: AccountId, projectId: ProjectId, path: ApplicationFilePath): Promise<ServedFile>
  readPinnedServedFile(accountId: AccountId, projectId: ProjectId, artifactRevisionId: ArtifactRevisionId, path: ApplicationFilePath): Promise<PinnedFile>
  readProjectThumbnail(accountId: AccountId, projectId: ProjectId): Promise<ServedThumbnail | null>
}>

/**
 * The registry owner: built applications and their thumbnails. A function takes a proof only when it
 * runs inside another owner's transaction; every other read opens its own entry, checks access to the
 * application first where the caller is a person on the application host.
 */
export function createRegistryModule({ database }: Readonly<{ database: Database }>): RegistryModule {
  const served = <T>(accountId: AccountId, projectId: ProjectId, read: (checked: Awaited<ReturnType<typeof checkApplication>>) => Promise<T>): Promise<T> =>
    database.transaction(accountId, async (gate) => read(await checkApplication(gate, projectId)))
  return Object.freeze({
    seal,
    retain,
    purge,
    readLaunch: ({ tx, scope }) => readLaunchOf(tx, scope.projectId),
    readPreviewFile: (accountId, at) => database.read(accountId, (tx) => readPreviewFileOf(tx, at)),
    readServedManifest: (accountId, projectId) => served(accountId, projectId, ({ tx, scope }) => readManifest(tx, scope.projectId)),
    readServedFile: (accountId, projectId, path) => served(accountId, projectId, ({ tx, scope }) => readServedFileOf(tx, scope.projectId, path)),
    readPinnedServedFile: (accountId, projectId, artifactRevisionId, path) => served(accountId, projectId, ({ tx, scope }) => readPinnedFileOf(tx, scope.projectId, path, artifactRevisionId)),
    readProjectThumbnail: (accountId, projectId) => database.read(accountId, (tx) => readThumbnailOf(tx, projectId)),
  })
}
