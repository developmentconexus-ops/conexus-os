import type { AccountId, ApplicationFilePath, ArtifactRevisionId, ProjectId, SourceRevision } from '@conexus/contract'
import type { Admitted, ApplicationScope, Checked, ProjectScope } from '../identity-access/admission.js'
import type { Database } from '../platform/db.js'
import { purge, retain } from './retain.js'
import { seal } from './seal.js'
import { readLaunchOf, readManifest, readPreviewFileOf, readPreviewManifestOf, readServedFileOf, readThumbnailOf, type ApplicationFile, type PreviewManifest, type ServedFile, type ServedLaunch, type ServedManifest, type ServedThumbnail } from './served.js'

export type RegistryModule = Readonly<{
  seal: typeof seal
  retain: typeof retain
  purge: typeof purge
  readLaunch(proof: Admitted<ProjectScope<'project.build'>>): Promise<ServedLaunch | null>
  readPreviewManifest(checked: Checked<ProjectScope<'project.read'>>, artifactRevisionId: ArtifactRevisionId): Promise<PreviewManifest | null>
  readPreviewRevisionFile(checked: Checked<ProjectScope<'project.read'>>, at: Readonly<{ sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; path: ApplicationFilePath }>): Promise<ApplicationFile | null>
  readServedManifest(checked: Checked<ApplicationScope>): Promise<ServedManifest | null>
  readServedFile(checked: Checked<ApplicationScope>, path: ApplicationFilePath): Promise<ServedFile>
  readProjectThumbnail(accountId: AccountId, projectId: ProjectId): Promise<ServedThumbnail | null>
}>

/**
 * The registry owner: built applications and their thumbnails. A function takes a proof only when it
 * runs inside another owner's transaction; the thumbnail read opens its own entry.
 */
export function createRegistryModule({ database }: Readonly<{ database: Database }>): RegistryModule {
  return Object.freeze({
    seal,
    retain,
    purge,
    readLaunch: ({ tx, scope }) => readLaunchOf(tx, scope.projectId),
    readPreviewManifest: ({ tx, scope }, artifactRevisionId) => readPreviewManifestOf(tx, scope.projectId, artifactRevisionId),
    readPreviewRevisionFile: ({ tx, scope }, at) => readPreviewFileOf(tx, { projectId: scope.projectId, ...at }),
    readServedManifest: ({ tx, scope }) => readManifest(tx, scope.projectId),
    readServedFile: ({ tx, scope }, path) => readServedFileOf(tx, scope.projectId, path),
    readProjectThumbnail: (accountId, projectId) => database.read(accountId, (tx) => readThumbnailOf(tx, projectId)),
  })
}
