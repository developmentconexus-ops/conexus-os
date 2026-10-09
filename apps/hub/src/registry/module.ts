import type { AccountId, ApplicationFilePath, ArtifactRevisionId, ProjectId, SourceRevision } from '@conexus/contract'
import type { Admitted, ApplicationScope, Checked, ProjectScope } from '../identity-access/public.js'
import { admitProject } from '../identity-access/public.js'
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
    readLaunch: (proof) => readLaunchOf(proof),
    readPreviewManifest: (checked, artifactRevisionId) => readPreviewManifestOf(checked, artifactRevisionId),
    readPreviewRevisionFile: (checked, at) => readPreviewFileOf(checked, at),
    readServedManifest: (checked) => readManifest(checked),
    readServedFile: (checked, path) => readServedFileOf(checked, path),
    readProjectThumbnail: (accountId, projectId) => database.read(accountId, async (gate) => {
      const proof = await admitProject(gate, { projectId, action: 'project.read' })
      return readThumbnailOf(proof)
    }),
  })
}
