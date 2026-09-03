import { lstat, rm } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import { isProjectIdentity } from './identity.js'

const CANDIDATE_ROOTS = Object.freeze(['staging', 'quarantine', 'bundles', 'projects'] as const)

export type ProjectSourceRecoveryResult = Readonly<
  | { status: 'CLEANED'; projectId: string; removed: readonly string[] }
  | { status: 'REFUSED'; code: 'IDENTITY_REFUSED' | 'STORAGE_ROOT_REFUSED' | 'CANDIDATE_PATH_REFUSED' | 'CLEANUP_FAILED' }
>

export type ProjectSourceRecovery = Readonly<{
  cleanupClaimedProjectSource(projectId: string): Promise<ProjectSourceRecoveryResult>
}>

const directory = async (path: string): Promise<'DIRECTORY' | 'ABSENT' | 'REFUSED'> => {
  try {
    const stat = await lstat(path)
    return stat.isDirectory() && !stat.isSymbolicLink() ? 'DIRECTORY' : 'REFUSED'
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'ABSENT' : 'REFUSED'
  }
}

export const createProjectSourceRecovery = (projectStorageRoot: string): ProjectSourceRecovery => {
  const root = isAbsolute(projectStorageRoot) && !projectStorageRoot.includes(',') && !projectStorageRoot.includes(':')
    ? resolve(projectStorageRoot)
    : null

  const cleanupClaimedProjectSource = async (projectId: string): Promise<ProjectSourceRecoveryResult> => {
    if (!isProjectIdentity(projectId)) return Object.freeze({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
    if (!root || await directory(root) !== 'DIRECTORY') {
      return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    }

    const removed: string[] = []
    for (const category of CANDIDATE_ROOTS) {
      const categoryRoot = resolve(root, category)
      const categoryState = await directory(categoryRoot)
      if (categoryState === 'ABSENT') continue
      if (categoryState !== 'DIRECTORY') return Object.freeze({ status: 'REFUSED', code: 'CANDIDATE_PATH_REFUSED' })

      const candidate = resolve(categoryRoot, projectId)
      if (!candidate.startsWith(`${root}${sep}`)) return Object.freeze({ status: 'REFUSED', code: 'CANDIDATE_PATH_REFUSED' })
      const candidateState = await directory(candidate)
      if (candidateState === 'ABSENT') continue
      if (candidateState !== 'DIRECTORY') return Object.freeze({ status: 'REFUSED', code: 'CANDIDATE_PATH_REFUSED' })
      try {
        await rm(candidate, { recursive: true })
        removed.push(category)
      } catch {
        return Object.freeze({ status: 'REFUSED', code: 'CLEANUP_FAILED' })
      }
    }
    return Object.freeze({ status: 'CLEANED', projectId, removed: Object.freeze(removed) })
  }

  return Object.freeze({ cleanupClaimedProjectSource })
}
