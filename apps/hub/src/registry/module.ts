import type { AccountId, ApplicationFilePath, ArtifactRevisionId, ProjectId, SourceRevision } from '@conexus/contract'
import type { Admitted, Checked, ProjectScope, WorkspaceScope } from '../identity-access/public.js'
import { admitProject } from '../identity-access/public.js'
import type { Database } from '../platform/db.js'
import { purge, retainAsPreview } from './retain.js'
import { readPreviewSubject, readPreviewPresence, type PreviewSubject } from './preview.js'
import { seal } from './seal.js'
import { readLaunchOf, readPreviewFileOf, readPreviewManifestOf, readThumbnailOf, type ApplicationFile, type PreviewManifest, type ServedLaunch, type ServedThumbnail } from './served.js'

export type RegistryModule = Readonly<{
  seal: typeof seal
  retainAsPreview: typeof retainAsPreview
  readPreviewSubject(proof: Admitted<ProjectScope<'project.read'>, 'read'>): Promise<PreviewSubject>
  readPreviewPresence(proof: Admitted<WorkspaceScope<'workspace.read'>, 'read'>, projectIds: readonly ProjectId[]): Promise<readonly ProjectId[]>
  purge: typeof purge
  readLaunch(proof: Admitted<ProjectScope<'project.build'>>): Promise<ServedLaunch | null>
  readPreviewManifest(checked: Checked<ProjectScope<'project.read'>>, artifactRevisionId: ArtifactRevisionId): Promise<PreviewManifest | null>
  readPreviewRevisionFile(checked: Checked<ProjectScope<'project.read'>>, at: Readonly<{ sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; path: ApplicationFilePath }>): Promise<ApplicationFile | null>
  readProjectThumbnail(accountId: AccountId, projectId: ProjectId): Promise<ServedThumbnail | null>
}>

/**
 * The registry owner: built applications and their thumbnails. A function takes a proof only when it
 * runs inside another owner's transaction; the thumbnail read opens its own entry.
 */
export function createRegistryModule({ database }: Readonly<{ database: Database }>): RegistryModule {
  return Object.freeze({
    seal,
    retainAsPreview,
    readPreviewSubject,
    readPreviewPresence,
    purge,
    readLaunch: (proof) => readLaunchOf(proof),
    readPreviewManifest: (checked, artifactRevisionId) => readPreviewManifestOf(checked, artifactRevisionId),
    readPreviewRevisionFile: (checked, at) => readPreviewFileOf(checked, at),
    readProjectThumbnail: (accountId, projectId) => database.read(accountId, async (gate) => {
      const proof = await admitProject(gate, { projectId, action: 'project.read' })
      return readThumbnailOf(proof)
    }),
  })
}
