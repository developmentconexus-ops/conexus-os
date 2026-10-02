import type { ConexusGit } from './conexus-git.js'

export type BuilderSourceTree = Readonly<{
  sourceRevision: string
  entries: readonly Readonly<{ path: string; kind: 'FILE' | 'DIRECTORY' }>[]
}>

export type BuilderSourceFile = Readonly<{
  sourceRevision: string
  path: string
  content: string
}>

type BuilderSourceChange = Readonly<{
  path: string
  status: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'RENAMED'
  previousPath: string | null
}>

export type BuilderSourceComparison = Readonly<{
  baseSourceRevision: string
  resultSourceRevision: string
  files: readonly BuilderSourceChange[]
}>

/** A Project's source is its repository in the Conexus Git, read at one exact revision. */
export type ProjectSourceReads = ReturnType<typeof createProjectSourceReads>

const OID = /^[0-9a-f]{40}$/
const MAX_ENTRIES = 10_000
const MAX_COMPARE_FILES = 3_000
const MAX_FILE_BYTES = 1_048_576
const REGULAR_FILE = new Set(['100644', '100755'])
// git's own letters; a copy or a type change reads as a modification of the path it lands on.
const CHANGE_STATUS: Readonly<Record<string, BuilderSourceChange['status']>> = { A: 'ADDED', D: 'REMOVED', M: 'MODIFIED', T: 'MODIFIED', R: 'RENAMED', C: 'MODIFIED' }

// A path the Preview and the source view may show: relative, no empty, dot or dot-dot part.
const safePath = (path: unknown): path is string => typeof path === 'string' && path.length > 0 && path.length <= 4096 &&
  !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')

export const createProjectSourceReads = ({ git }: Readonly<{ git: Pick<ConexusGit, 'listTree' | 'readBlob' | 'diff'> }>) => Object.freeze({
  listSourceTree: async (projectId: string, sourceRevision: string): Promise<BuilderSourceTree> => {
    if (!OID.test(sourceRevision)) throw new Error('BUILDER_SOURCE_READ_REFUSED')
    const tree = await git.listTree(projectId, sourceRevision)
    if (!tree) throw new Error('BUILDER_SOURCE_READ_REVISION_NOT_FOUND')
    if (tree.length > MAX_ENTRIES) throw new Error('BUILDER_SOURCE_READ_TREE_TOO_LARGE')
    const entries = tree.map((entry) => {
      if (!safePath(entry.path)) throw new Error('BUILDER_SOURCE_READ_UNSAFE_ENTRY')
      if (entry.type === 'tree') return { path: entry.path, kind: 'DIRECTORY' as const }
      if (entry.type === 'blob' && REGULAR_FILE.has(entry.mode)) return { path: entry.path, kind: 'FILE' as const }
      throw new Error('BUILDER_SOURCE_READ_UNSAFE_ENTRY')
    })
    entries.sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind))
    return Object.freeze({ sourceRevision, entries: Object.freeze(entries.map((entry) => Object.freeze(entry))) })
  },
  readSourceFile: async (projectId: string, sourceRevision: string, path: string): Promise<BuilderSourceFile> => {
    if (!OID.test(sourceRevision) || !safePath(path)) throw new Error('BUILDER_SOURCE_READ_PATH_REFUSED')
    const blob = await git.readBlob(projectId, sourceRevision, path, MAX_FILE_BYTES)
    if (blob?.type !== 'blob') throw new Error('BUILDER_SOURCE_READ_FILE_NOT_FOUND')
    const bytes = blob.bytes
    if (!REGULAR_FILE.has(blob.mode) || !bytes || blob.size > MAX_FILE_BYTES) throw new Error('BUILDER_SOURCE_READ_FILE_NOT_DISCLOSABLE')
    const content = bytes.toString('utf8')
    if (bytes.byteLength !== blob.size || bytes.includes(0) || !Buffer.from(content, 'utf8').equals(bytes)) {
      throw new Error('BUILDER_SOURCE_READ_FILE_NOT_DISCLOSABLE')
    }
    return Object.freeze({ sourceRevision, path, content })
  },
  compareRevisions: async (projectId: string, baseSourceRevision: string, resultSourceRevision: string): Promise<BuilderSourceComparison> => {
    if (!OID.test(baseSourceRevision) || !OID.test(resultSourceRevision)) throw new Error('BUILDER_SOURCE_READ_REFUSED')
    const changes = await git.diff(projectId, baseSourceRevision, resultSourceRevision)
    if (!changes) throw new Error('BUILDER_SOURCE_READ_REVISION_NOT_FOUND')
    if (changes.length > MAX_COMPARE_FILES) throw new Error('BUILDER_SOURCE_READ_TREE_TOO_LARGE')
    const files = changes.map((change): BuilderSourceChange => {
      const status = CHANGE_STATUS[change.status.charAt(0)]
      if (!status || !safePath(change.path)) throw new Error('BUILDER_SOURCE_READ_UNSAFE_ENTRY')
      if (status !== 'RENAMED') return { path: change.path, status, previousPath: null }
      if (!safePath(change.previousPath)) throw new Error('BUILDER_SOURCE_READ_UNSAFE_ENTRY')
      return { path: change.path, status, previousPath: change.previousPath }
    })
    files.sort((left, right) => left.path.localeCompare(right.path))
    return Object.freeze({ baseSourceRevision, resultSourceRevision, files: Object.freeze(files.map((file) => Object.freeze(file))) })
  },
})
