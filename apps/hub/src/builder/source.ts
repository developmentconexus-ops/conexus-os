import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import type { OciGitExecution } from '../platform/oci-git.js'

export type BuilderGitSourceCapability = OciGitExecution

export type BuilderSourceTree = Readonly<{
  sourceRevision: string
  entries: readonly Readonly<{ path: string; kind: 'FILE' | 'DIRECTORY' }>[]
}>

export type BuilderSourceFile = Readonly<{
  sourceRevision: string
  path: string
  content: string
}>
export type BuilderSourceFiles = Readonly<{
  sourceRevision: string
  files: readonly Readonly<{ path: string; content: string }>[]
}>

const INSPECT_TMPFS_BYTES = 32 * 1024 * 1024
const INSPECT_OUTPUT_BYTES = 4 * 1024 * 1024
// Disclosed contents travel through a mounted file, not the verdict, because the
// compile input outgrows the stdout verdict cap. JSON escaping inflates the
// in-container 12 MiB content cap, so the envelope cap is deliberately looser.
const SOURCE_FILES_DISCLOSURE_BYTES = 32 * 1024 * 1024

export type BuilderSourcePort = Readonly<{
  listSourceTree(input: Readonly<{ projectId: string; sourceRevision: string }>): Promise<BuilderSourceTree>
  readSourceFiles(input: Readonly<{ projectId: string; sourceRevision: string; paths: readonly string[] }>): Promise<BuilderSourceFiles>
  readSourceFile(input: Readonly<{ projectId: string; sourceRevision: string; path: string }>): Promise<BuilderSourceFile>
}>

const SOURCE_READ_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const oid = /^[0-9a-f]{40}$/
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' }
const git = (args, raw = false) => spawnSync('/usr/local/bin/git', ['--git-dir=/repository.git', '--literal-pathspecs', ...args], { env, encoding: raw ? null : 'utf8', maxBuffer: 8 * 1024 * 1024 })
const ok = value => !value.error && value.status === 0 && value.signal === null && (!value.stderr || value.stderr.length === 0)
const text = value => typeof value.stdout === 'string' ? value.stdout : value.stdout.toString('utf8')
const exactUtf8 = value => Buffer.isBuffer(value) && Buffer.from(value.toString('utf8'), 'utf8').equals(value)
const safePath = path => typeof path === 'string' && path.length > 0 && path.length <= 4096 && !path.startsWith('/') &&
  !path.includes('\\\\') && !path.includes('\\0') && path.split('/').every(part => part && part !== '.' && part !== '..')
const finish = value => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
if (!oid.test(request.sourceRevision) || !['tree', 'files'].includes(request.operation)) finish({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
let value = git(['cat-file', '-e', request.sourceRevision + '^{commit}'])
if (!ok(value)) finish({ status: 'REFUSED', code: 'REVISION_NOT_FOUND' })
if (request.operation === 'tree') {
  value = git(['ls-tree', '-r', '-z', '--long', request.sourceRevision], true)
  if (!ok(value) || !exactUtf8(value.stdout)) finish({ status: 'REFUSED', code: 'TREE_REFUSED' })
  const lines = text(value).split('\\0').filter(Boolean)
  if (lines.length > 10000) finish({ status: 'REFUSED', code: 'TREE_TOO_LARGE' })
  const files = []
  const directories = new Set()
  let entryCount = 0
  let disclosureBytes = 0
  const reserve = path => {
    entryCount += 1
    disclosureBytes += Buffer.byteLength(path, 'utf8') + 32
    if (entryCount > 10000 || disclosureBytes > 3 * 1024 * 1024) finish({ status: 'REFUSED', code: 'TREE_TOO_LARGE' })
  }
  for (const line of lines) {
    const match = /^(100644|100755) blob [0-9a-f]{40}\\s+(0|[1-9][0-9]*)\\t([\\s\\S]+)$/.exec(line)
    if (!match || !safePath(match[3])) finish({ status: 'REFUSED', code: 'UNSAFE_ENTRY' })
    const path = match[3]
    reserve(path)
    files.push({ path, kind: 'FILE' })
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      const directory = parts.slice(0, index).join('/')
      if (!directories.has(directory)) { reserve(directory); directories.add(directory) }
    }
  }
  const entries = [...directories].map(path => ({ path, kind: 'DIRECTORY' })).concat(files)
    .sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind))
  finish({ status: 'PASS', sourceRevision: request.sourceRevision, entries })
}
const disclose = path => {
  if (!safePath(path)) finish({ status: 'REFUSED', code: 'PATH_REFUSED' })
  const entry = git(['ls-tree', '-z', request.sourceRevision, '--', path], true)
  if (!ok(entry) || !exactUtf8(entry.stdout)) finish({ status: 'REFUSED', code: 'FILE_REFUSED' })
  const match = text(entry).match(/^(100644|100755) blob ([0-9a-f]{40})\\t([\\s\\S]*)\\0$/)
  if (!match || match[3] !== path) finish({ status: 'REFUSED', code: 'FILE_NOT_FOUND' })
  const size = git(['cat-file', '-s', match[2]])
  if (!ok(size) || !/^(0|[1-9][0-9]*)$/.test(text(size).trim()) || Number(text(size).trim()) > 1048576) {
    finish({ status: 'REFUSED', code: 'FILE_NOT_DISCLOSABLE' })
  }
  const blob = git(['cat-file', 'blob', match[2]], true)
  if (!ok(blob) || blob.stdout.includes(0) || !exactUtf8(blob.stdout)) finish({ status: 'REFUSED', code: 'FILE_NOT_DISCLOSABLE' })
  return blob.stdout.toString('utf8')
}
const requested = request.paths
if (!Array.isArray(requested) || requested.length === 0 || requested.length > 10000 ||
  new Set(requested).size !== requested.length) finish({ status: 'REFUSED', code: 'PATHS_REFUSED' })
const files = []
let disclosedBytes = 0
for (const path of requested) {
  const content = disclose(path)
  disclosedBytes += Buffer.byteLength(content, 'utf8')
  if (disclosedBytes > 12 * 1024 * 1024) finish({ status: 'REFUSED', code: 'FILES_TOO_LARGE' })
  files.push({ path, content })
}
writeFileSync('/out/files.json', JSON.stringify(files))
finish({ status: 'PASS', sourceRevision: request.sourceRevision, disclosedCount: files.length })
`

const exactFile = async (path: string): Promise<boolean> => {
  try {
    const stat = await lstat(path)
    return stat.isFile() && !stat.isSymbolicLink() && await realpath(path) === path
  } catch { return false }
}
const isIdentity = (value: string): boolean => /^[0-9a-f-]{36}$/i.test(value)
const runRefusal = (code: 'IMAGE_NOT_VERIFIED' | 'PROCESS_FAILED' | 'VERDICT_REFUSED', refused: string): Error =>
  new Error(code === 'IMAGE_NOT_VERIFIED' ? 'BUILDER_GIT_IMAGE_REFUSED' : refused)

export const createBuilderSourcePort = ({
  git,
  storageRoot,
}: Readonly<{
  git: BuilderGitSourceCapability
  storageRoot: string
}>): BuilderSourcePort => {
  if (!isAbsolute(storageRoot) || storageRoot.includes(',') || storageRoot.includes(':')) throw new Error('BUILDER_SOURCE_CONFIG_REFUSED')
  const root = resolve(storageRoot)
  const inspectSource = async (input: Readonly<{ projectId: string; sourceRevision: string; operation: 'tree' | 'files'; paths?: readonly string[] }>): Promise<Record<string, unknown>> => {
    if (!isIdentity(input.projectId) || !/^[0-9a-f]{40}$/.test(input.sourceRevision)) throw new Error('BUILDER_SOURCE_READ_REFUSED')
    const repository = resolve(root, 'projects', input.projectId)
    if (!repository.startsWith(`${root}${sep}`)) throw new Error('BUILDER_SOURCE_CONFIG_REFUSED')
    const temporary = await mkdtemp(resolve(root, '.conexus-builder-source-'))
    try {
      const requestPath = resolve(temporary, 'request.json')
      const outputRoot = resolve(temporary, 'out')
      await writeFile(requestPath, `${JSON.stringify(input)}\n`, { flag: 'wx', mode: 0o400 })
      await mkdir(outputRoot, { mode: 0o700 })
      const result = await git.runGitProgram({
        program: SOURCE_READ_PROGRAM,
        tmpfsBytes: INSPECT_TMPFS_BYTES,
        maxOutputBytes: INSPECT_OUTPUT_BYTES,
        mounts: [
          { source: repository, target: '/repository.git', readonly: true },
          { source: requestPath, target: '/run/conexus/request.json', readonly: true },
          { source: outputRoot, target: '/out' },
        ],
      })
      if (result.status !== 'COMPLETED') throw runRefusal(result.code, 'BUILDER_SOURCE_READ_REFUSED')
      const parsed = result.verdict
      if (parsed.status !== 'PASS' || parsed.sourceRevision !== input.sourceRevision) {
        throw new Error(`BUILDER_SOURCE_READ_${typeof parsed.code === 'string' ? parsed.code : 'REFUSED'}`)
      }
      if (input.operation !== 'files') return parsed
      const disclosurePath = resolve(outputRoot, 'files.json')
      if (!await exactFile(disclosurePath)) throw new Error('BUILDER_SOURCE_READ_REFUSED')
      const bytes = await readFile(disclosurePath)
      if (bytes.byteLength === 0 || bytes.byteLength > SOURCE_FILES_DISCLOSURE_BYTES) throw new Error('BUILDER_SOURCE_READ_REFUSED')
      let files: unknown
      try { files = JSON.parse(bytes.toString('utf8')) } catch { throw new Error('BUILDER_SOURCE_READ_REFUSED') }
      // The verdict and the mounted file are separate channels out of the
      // container, so the count has to agree across both before anything is read.
      if (!Array.isArray(files) || files.length !== parsed.disclosedCount) throw new Error('BUILDER_SOURCE_READ_REFUSED')
      return { ...parsed, files }
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  const readSourceFiles = async (input: Readonly<{ projectId: string; sourceRevision: string; paths: readonly string[] }>): Promise<BuilderSourceFiles> => {
    const paths = [...input.paths]
    if (paths.length === 0 || new Set(paths).size !== paths.length) throw new Error('BUILDER_SOURCE_FILES_REFUSED')
    const value = await inspectSource({ projectId: input.projectId, sourceRevision: input.sourceRevision, operation: 'files', paths })
    const disclosed = value.files
    if (!Array.isArray(disclosed) || disclosed.length !== paths.length) throw new Error('BUILDER_SOURCE_FILES_REFUSED')
    return Object.freeze({
      sourceRevision: input.sourceRevision,
      files: Object.freeze(disclosed.map((entry, index) => {
        const record = entry as Record<string, unknown> | null
        if (!record || typeof record !== 'object' || record.path !== paths[index] || typeof record.content !== 'string') {
          throw new Error('BUILDER_SOURCE_FILES_REFUSED')
        }
        return Object.freeze({ path: paths[index] as string, content: record.content })
      })),
    })
  }
  return Object.freeze({
    listSourceTree: async (input) => {
      const value = await inspectSource({ ...input, operation: 'tree' })
      if (!Array.isArray(value.entries) || value.entries.some((entry) => !entry || typeof entry !== 'object' ||
        typeof (entry as Record<string, unknown>).path !== 'string' || !['FILE', 'DIRECTORY'].includes(String((entry as Record<string, unknown>).kind)))) {
        throw new Error('BUILDER_SOURCE_TREE_REFUSED')
      }
      return Object.freeze({
        sourceRevision: input.sourceRevision,
        entries: Object.freeze((value.entries as { path: string; kind: 'FILE' | 'DIRECTORY' }[]).map((entry) => Object.freeze({ ...entry }))),
      })
    },
    readSourceFiles,
    readSourceFile: async (input) => {
      const { files } = await readSourceFiles({ projectId: input.projectId, sourceRevision: input.sourceRevision, paths: [input.path] })
      const file = files[0]
      if (!file || file.path !== input.path) throw new Error('BUILDER_SOURCE_FILE_REFUSED')
      return Object.freeze({ sourceRevision: input.sourceRevision, path: input.path, content: file.content })
    },
  })
}
