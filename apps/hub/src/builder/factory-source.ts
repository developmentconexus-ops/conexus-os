import { type GithubApp, GithubRequestError } from './factory-github.js'
import type { FactoryRepository } from './factory-runtime.js'
import type { FactoryBindingRecord } from './store.js'

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

/** A bound Project's source is its GitHub repository, read at one exact revision. */
export type FactorySourceReads = Readonly<{
  listSourceTree(binding: FactoryBindingRecord, sourceRevision: string): Promise<BuilderSourceTree>
  readSourceFile(binding: FactoryBindingRecord, sourceRevision: string, path: string): Promise<BuilderSourceFile>
  compareRevisions(binding: FactoryBindingRecord, baseSourceRevision: string, resultSourceRevision: string): Promise<BuilderSourceComparison>
}>

const OID = /^[0-9a-f]{40}$/
const MAX_ENTRIES = 10_000
const MAX_COMPARE_FILES = 3_000
const MAX_FILE_BYTES = 1_048_576
const REGULAR_FILE = new Set(['100644', '100755'])
const COMPARE_STATUS: Readonly<Record<string, BuilderSourceChange['status']>> = {
  added: 'ADDED', removed: 'REMOVED', renamed: 'RENAMED', modified: 'MODIFIED', changed: 'MODIFIED', copied: 'MODIFIED',
}

// A path the Preview and the source view may show: relative, no empty, dot or dot-dot part.
const safePath = (path: unknown): path is string => typeof path === 'string' && path.length > 0 && path.length <= 4096 &&
  !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')

const refused = (code: string) => (error: unknown): never => {
  throw error instanceof GithubRequestError && error.status === 404 ? new Error(`BUILDER_SOURCE_READ_${code}`) : error
}

export const createFactorySourceReads = ({ github, resolveRepository }: Readonly<{
  github: Pick<GithubApp, 'readTree' | 'readContents' | 'compareCommits'>
  resolveRepository(binding: FactoryBindingRecord): Promise<FactoryRepository>
}>): FactorySourceReads => Object.freeze({
  listSourceTree: async (binding, sourceRevision) => {
    if (!OID.test(sourceRevision)) throw new Error('BUILDER_SOURCE_READ_REFUSED')
    const repository = await resolveRepository(binding)
    const tree = await github.readTree(repository.installation, repository, sourceRevision).catch(refused('REVISION_NOT_FOUND'))
    if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new Error('BUILDER_SOURCE_READ_TREE_TOO_LARGE')
    const entries: { path: string; kind: 'FILE' | 'DIRECTORY' }[] = []
    for (const entry of tree.tree as readonly Readonly<Record<string, unknown>>[]) {
      if (!safePath(entry.path)) throw new Error('BUILDER_SOURCE_READ_UNSAFE_ENTRY')
      if (entry.type === 'tree') entries.push({ path: entry.path, kind: 'DIRECTORY' })
      else if (entry.type === 'blob' && REGULAR_FILE.has(String(entry.mode))) entries.push({ path: entry.path, kind: 'FILE' })
      else throw new Error('BUILDER_SOURCE_READ_UNSAFE_ENTRY')
    }
    if (entries.length > MAX_ENTRIES) throw new Error('BUILDER_SOURCE_READ_TREE_TOO_LARGE')
    entries.sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind))
    return Object.freeze({ sourceRevision, entries: Object.freeze(entries.map((entry) => Object.freeze(entry))) })
  },
  readSourceFile: async (binding, sourceRevision, path) => {
    if (!OID.test(sourceRevision) || !safePath(path)) throw new Error('BUILDER_SOURCE_READ_PATH_REFUSED')
    const repository = await resolveRepository(binding)
    const file = await github.readContents(repository.installation, repository, sourceRevision, path).catch(refused('FILE_NOT_FOUND'))
    if (Array.isArray(file) || file.type !== 'file' || file.path !== path) throw new Error('BUILDER_SOURCE_READ_FILE_NOT_FOUND')
    if (file.encoding !== 'base64' || typeof file.content !== 'string' || typeof file.size !== 'number' || file.size > MAX_FILE_BYTES) {
      throw new Error('BUILDER_SOURCE_READ_FILE_NOT_DISCLOSABLE')
    }
    const bytes = Buffer.from(file.content, 'base64')
    const content = bytes.toString('utf8')
    if (bytes.byteLength !== file.size || bytes.includes(0) || !Buffer.from(content, 'utf8').equals(bytes)) {
      throw new Error('BUILDER_SOURCE_READ_FILE_NOT_DISCLOSABLE')
    }
    return Object.freeze({ sourceRevision, path, content })
  },
  compareRevisions: async (binding, baseSourceRevision, resultSourceRevision) => {
    if (!OID.test(baseSourceRevision) || !OID.test(resultSourceRevision)) throw new Error('BUILDER_SOURCE_READ_REFUSED')
    const repository = await resolveRepository(binding)
    const files: BuilderSourceChange[] = []
    for (let page = 1; ; page += 1) {
      const response = await github.compareCommits(repository.installation, repository, baseSourceRevision, resultSourceRevision, page).catch(refused('REVISION_NOT_FOUND'))
      const pageFiles = Array.isArray(response.files) ? response.files as readonly Readonly<Record<string, unknown>>[] : []
      for (const entry of pageFiles) {
        const status = typeof entry.status === 'string' ? COMPARE_STATUS[entry.status] : undefined
        if (entry.status === 'unchanged' || !status) continue
        if (!safePath(entry.filename)) throw new Error('BUILDER_SOURCE_READ_UNSAFE_ENTRY')
        let previousPath: string | null = null
        if (status === 'RENAMED') {
          if (!safePath(entry.previous_filename)) throw new Error('BUILDER_SOURCE_READ_UNSAFE_ENTRY')
          previousPath = entry.previous_filename
        }
        files.push({ path: entry.filename, status, previousPath })
      }
      if (files.length > MAX_COMPARE_FILES) throw new Error('BUILDER_SOURCE_READ_TREE_TOO_LARGE')
      if (pageFiles.length < 100) break
    }
    files.sort((left, right) => left.path.localeCompare(right.path))
    return Object.freeze({ baseSourceRevision, resultSourceRevision, files: Object.freeze(files.map((file) => Object.freeze(file))) })
  },
})
