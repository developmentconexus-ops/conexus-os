import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import type { OciGitExecution, OciGitMount } from '../platform/oci-git.js'

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
export type BuilderSourceResult = Readonly<{
  baseSourceRevision: string
  resultSourceRevision: string
  patch: string
}>

const SOURCE_RESULT_TMPFS_BYTES = 512 * 1024 * 1024
const INSPECT_TMPFS_BYTES = 32 * 1024 * 1024
const INSPECT_OUTPUT_BYTES = 4 * 1024 * 1024
const RESULT_OUTPUT_BYTES = 64 * 1024
const RESULT_TIMEOUT_MS = 120_000

export type BuilderSourcePort = Readonly<{
  prepareProjectSource(input: Readonly<{ projectId: string; executionId: string; sourceRevision: string }>): Promise<Uint8Array>
  admitSourceResult(input: Readonly<{
    projectId: string
    executionId: string
    baseSourceRevision: string
    claimedResultSourceRevision: string
    resultBundle: Uint8Array
  }>): Promise<BuilderSourceResult>
  listSourceTree(input: Readonly<{ projectId: string; sourceRevision: string }>): Promise<BuilderSourceTree>
  readSourceFile(input: Readonly<{ projectId: string; sourceRevision: string; path: string }>): Promise<BuilderSourceFile>
}>

const PROJECT_SOURCE_BUNDLE_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const oid = /^[0-9a-f]{40}$/
const identity = /^[0-9a-f-]{36}$/i
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file', GIT_NO_REPLACE_OBJECTS: '1' }
const git = (args) => spawnSync('/usr/local/bin/git', ['--git-dir=/repository.git', '-c', 'core.hooksPath=/dev/null', ...args], { env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
const exportGit = (args) => spawnSync('/usr/local/bin/git', ['--git-dir=/tmp/source-export.git', '-c', 'core.hooksPath=/dev/null', ...args], { env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
const ok = value => !value.error && value.status === 0 && value.signal === null && (!value.stderr || value.stderr.length === 0)
const missing = value => !value.error && value.status === 128 && value.signal === null
const text = value => typeof value.stdout === 'string' ? value.stdout : value.stdout.toString('utf8')
const finish = value => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
if (!identity.test(request.projectId) || !identity.test(request.executionId) || !oid.test(request.sourceRevision)) finish({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
const exactRef = (ref) => {
  const value = git(['rev-parse', '--verify', ref])
  if (ok(value)) return text(value).trim()
  if (missing(value)) return null
  finish({ status: 'REFUSED', code: 'SOURCE_REF_REFUSED' })
}
const requested = request.sourceRevision
const sourceRef = 'refs/conexus/sources/' + requested
const retained = exactRef(sourceRef)
let selectedRef
if (retained !== null) {
  if (retained !== requested) finish({ status: 'REFUSED', code: 'SOURCE_REF_MISMATCH' })
  selectedRef = sourceRef
} else {
  const main = exactRef('refs/heads/main')
  if (main !== requested) finish({ status: 'REFUSED', code: 'SOURCE_NOT_FOUND' })
  selectedRef = 'refs/heads/main'
}
let value = spawnSync('/usr/local/bin/git', ['init', '--quiet', '--bare', '--initial-branch=main', '/tmp/source-export.git'], { env, encoding: 'utf8' })
if (!ok(value)) finish({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
value = exportGit(['fetch', '--quiet', '--no-tags', '/repository.git', selectedRef + ':refs/heads/main'])
if (!ok(value)) finish({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
value = exportGit(['rev-parse', '--verify', 'refs/heads/main'])
if (!ok(value) || text(value).trim() !== requested) finish({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
value = exportGit(['bundle', 'create', '/out/source.bundle', 'refs/heads/main'])
if (!ok(value)) finish({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
value = exportGit(['bundle', 'list-heads', '/out/source.bundle'])
if (!ok(value) || text(value).trim() !== requested + ' refs/heads/main') finish({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
finish({ status: 'BUNDLED', sourceRevision: requested })
`

const SOURCE_RESULT_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const oid = /^[0-9a-f]{40}$/
const identity = /^[0-9a-f-]{36}$/i
const zero = '0000000000000000000000000000000000000000'
const env = {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp',
  GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file', GIT_NO_REPLACE_OBJECTS: '1',
}
const git = (dir, args, raw = false) => spawnSync('/usr/local/bin/git', ['--git-dir=' + dir, '-c', 'core.hooksPath=/dev/null', ...args], { env, encoding: raw ? null : 'utf8', maxBuffer: 10 * 1024 * 1024 })
const ok = value => !value.error && value.status === 0 && value.signal === null && (!value.stderr || value.stderr.length === 0)
const missing = value => !value.error && value.status === 128 && value.signal === null
const text = value => typeof value.stdout === 'string' ? value.stdout : value.stdout.toString('utf8')
const finish = value => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
const exactRef = (dir, ref) => {
  const value = git(dir, ['rev-parse', '--verify', ref])
  if (ok(value)) return text(value).trim()
  if (missing(value)) return null
  finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
}
const safePath = path => typeof path === 'string' && path.length > 0 && path.length <= 4096 && !path.startsWith('/') &&
  !path.includes('\\\\') && !path.includes('\\0') && path.startsWith('app/') &&
  path.split('/').every(part => part && part !== '.' && part !== '..')
if (!identity.test(request.projectId) || !identity.test(request.executionId) ||
  !oid.test(request.baseSourceRevision) || !oid.test(request.claimedResultSourceRevision)) finish({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
if (!request.resultBundleBytes || request.resultBundleBytes <= 0) finish({ status: 'REFUSED', code: 'RESULT_BUNDLE_REFUSED' })
const repository = '/repository.git'
const mainBefore = exactRef(repository, 'refs/heads/main')
if (mainBefore === null) finish({ status: 'REFUSED', code: 'MAIN_REF_REFUSED' })
const baseRef = 'refs/conexus/sources/' + request.baseSourceRevision
const retainedBase = exactRef(repository, baseRef)
if (retainedBase !== null && retainedBase !== request.baseSourceRevision) finish({ status: 'REFUSED', code: 'SOURCE_REF_MISMATCH' })
if (retainedBase === null && mainBefore !== request.baseSourceRevision) finish({ status: 'REFUSED', code: 'BASE_SOURCE_NOT_FOUND' })
const resultRef = 'refs/conexus/sources/' + request.claimedResultSourceRevision
const retainedResult = exactRef(repository, resultRef)
if (retainedResult !== null && retainedResult !== request.claimedResultSourceRevision) finish({ status: 'REFUSED', code: 'SOURCE_REF_COLLISION' })

let value = spawnSync('/usr/local/bin/git', ['init', '--quiet', '--bare', '--initial-branch=main', '/tmp/inspect.git'], { env, encoding: 'utf8' })
if (!ok(value)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
value = git('/tmp/inspect.git', ['fetch', '--quiet', '--no-tags', '/run/conexus/result.bundle', 'refs/heads/conexus-result:refs/heads/result'])
if (!ok(value)) finish({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
const resultSourceRevision = exactRef('/tmp/inspect.git', 'refs/heads/result')
if (!oid.test(resultSourceRevision || '')) finish({ status: 'REFUSED', code: 'RESULT_REF_REFUSED' })
if (resultSourceRevision !== request.claimedResultSourceRevision) finish({ status: 'REFUSED', code: 'SANDBOX_REVISION_MISMATCH' })
value = git('/tmp/inspect.git', ['merge-base', '--is-ancestor', request.baseSourceRevision, 'refs/heads/result'])
if (value.status === 1 || value.status === 128) finish({ status: 'REFUSED', code: 'NON_DESCENDANT' })
if (!ok(value)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
value = git('/tmp/inspect.git', ['rev-list', '--count', request.baseSourceRevision + '..refs/heads/result'])
if (!ok(value) || text(value).trim() !== '1') finish({ status: 'REFUSED', code: 'MULTI_COMMIT_RESULT' })
value = git('/tmp/inspect.git', ['rev-parse', '--verify', 'refs/heads/result^'])
if (!ok(value) || text(value).trim() !== request.baseSourceRevision) finish({ status: 'REFUSED', code: 'WRONG_PARENT' })
const changed = git('/tmp/inspect.git', ['diff', '--no-renames', '--name-only', '-z', request.baseSourceRevision, 'refs/heads/result'], true)
if (!ok(changed)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const paths = text(changed).split('\\0').filter(Boolean)
if (paths.length === 0 || paths.length > 1000) finish({ status: 'REFUSED', code: 'CHANGESET_REFUSED' })
for (const path of paths) {
  if (!safePath(path)) finish({ status: 'REFUSED', code: 'MUTATION_BOUNDARY_REFUSED' })
  const entry = git('/tmp/inspect.git', ['--literal-pathspecs', 'ls-tree', '-z', 'refs/heads/result', '--', path], true)
  if (!ok(entry)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
  if (entry.stdout.length > 0) {
    const match = text(entry).match(/^(100644|100755) blob ([0-9a-f]{40})\\t([\\s\\S]*)\\0$/)
    if (!match || match[3] !== path) finish({ status: 'REFUSED', code: 'UNSAFE_ENTRY' })
  }
}
const patch = git('/tmp/inspect.git', ['diff', '--no-ext-diff', '--binary', request.baseSourceRevision, 'refs/heads/result'], true)
if (!ok(patch) || patch.stdout.byteLength > 8 * 1024 * 1024) finish({ status: 'REFUSED', code: 'PATCH_REFUSED' })
const importRef = 'refs/conexus/imports/' + request.executionId
const existingImport = exactRef(repository, importRef)
if (existingImport !== null && existingImport !== resultSourceRevision) finish({ status: 'REFUSED', code: 'IMPORT_REF_COLLISION' })
if (existingImport === null) {
  value = git(repository, ['fetch', '--quiet', '--no-tags', '/run/conexus/result.bundle', 'refs/heads/conexus-result:' + importRef])
  if (!ok(value)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
}
if (exactRef(repository, importRef) !== resultSourceRevision) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
if (retainedResult === null) {
  value = git(repository, ['update-ref', resultRef, resultSourceRevision, zero])
  if (!ok(value) && exactRef(repository, resultRef) !== resultSourceRevision) finish({ status: 'REFUSED', code: 'SOURCE_REF_COLLISION' })
}
value = git(repository, ['update-ref', '-d', importRef, resultSourceRevision])
if (!ok(value)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const mainAfter = exactRef(repository, 'refs/heads/main')
const stored = exactRef(repository, resultRef)
if (mainAfter !== mainBefore || stored !== resultSourceRevision) finish({ status: 'REFUSED', code: 'CUSTODY_REFUSED' })
writeFileSync('/out/patch', patch.stdout)
finish({ status: 'ADMITTED', baseSourceRevision: request.baseSourceRevision, resultSourceRevision })
`

const SOURCE_READ_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
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
if (!oid.test(request.sourceRevision) || !['tree', 'file'].includes(request.operation)) finish({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
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
if (!safePath(request.path)) finish({ status: 'REFUSED', code: 'PATH_REFUSED' })
value = git(['ls-tree', '-z', request.sourceRevision, '--', request.path], true)
if (!ok(value) || !exactUtf8(value.stdout)) finish({ status: 'REFUSED', code: 'FILE_REFUSED' })
const match = text(value).match(/^(100644|100755) blob ([0-9a-f]{40})\\t([\\s\\S]*)\\0$/)
if (!match || match[3] !== request.path) finish({ status: 'REFUSED', code: 'FILE_NOT_FOUND' })
const size = git(['cat-file', '-s', match[2]])
if (!ok(size) || !/^(0|[1-9][0-9]*)$/.test(text(size).trim()) || Number(text(size).trim()) > 1048576) {
  finish({ status: 'REFUSED', code: 'FILE_NOT_DISCLOSABLE' })
}
const blob = git(['cat-file', 'blob', match[2]], true)
if (!ok(blob) || blob.stdout.includes(0) || !Buffer.from(blob.stdout.toString('utf8'), 'utf8').equals(blob.stdout)) {
  finish({ status: 'REFUSED', code: 'FILE_NOT_DISCLOSABLE' })
}
finish({ status: 'PASS', sourceRevision: request.sourceRevision, path: request.path, content: blob.stdout.toString('utf8') })
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
  const inspectSource = async (input: Readonly<{ projectId: string; sourceRevision: string; operation: 'tree' | 'file'; path?: string }>): Promise<Record<string, unknown>> => {
    if (!isIdentity(input.projectId) || !/^[0-9a-f]{40}$/.test(input.sourceRevision)) throw new Error('BUILDER_SOURCE_READ_REFUSED')
    const repository = resolve(root, 'projects', input.projectId)
    if (!repository.startsWith(`${root}${sep}`)) throw new Error('BUILDER_SOURCE_CONFIG_REFUSED')
    const temporary = await mkdtemp(resolve(root, '.conexus-builder-source-'))
    try {
      const requestPath = resolve(temporary, 'request.json')
      await writeFile(requestPath, `${JSON.stringify(input)}\n`, { flag: 'wx', mode: 0o400 })
      const result = await git.runGitProgram({
        program: SOURCE_READ_PROGRAM,
        tmpfsBytes: INSPECT_TMPFS_BYTES,
        maxOutputBytes: INSPECT_OUTPUT_BYTES,
        mounts: [
          { source: repository, target: '/repository.git', readonly: true },
          { source: requestPath, target: '/run/conexus/request.json', readonly: true },
        ],
      })
      if (result.status !== 'COMPLETED') throw runRefusal(result.code, 'BUILDER_SOURCE_READ_REFUSED')
      const parsed = result.verdict
      if (parsed.status !== 'PASS' || parsed.sourceRevision !== input.sourceRevision) {
        throw new Error(`BUILDER_SOURCE_READ_${typeof parsed.code === 'string' ? parsed.code : 'REFUSED'}`)
      }
      return parsed
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  const prepareProjectSource = async (input: Readonly<{
    projectId: string
    executionId: string
    sourceRevision: string
  }>): Promise<Uint8Array> => {
    if (![input.projectId, input.executionId].every(isIdentity) || !/^[0-9a-f]{40}$/.test(input.sourceRevision)) {
      throw new Error('BUILDER_SOURCE_INPUT_REFUSED')
    }
    const repository = resolve(root, 'projects', input.projectId)
    if (!repository.startsWith(`${root}${sep}`)) throw new Error('BUILDER_SOURCE_CONFIG_REFUSED')
    const temporary = await mkdtemp(resolve(root, '.conexus-builder-source-native-'))
    try {
      const requestPath = resolve(temporary, 'request.json')
      const outputRoot = resolve(temporary, 'out')
      await writeFile(requestPath, `${JSON.stringify(input)}\n`, { flag: 'wx', mode: 0o400 })
      await mkdir(outputRoot, { mode: 0o700 })
      const result = await git.runGitProgram({
        program: PROJECT_SOURCE_BUNDLE_PROGRAM,
        tmpfsBytes: INSPECT_TMPFS_BYTES,
        maxOutputBytes: INSPECT_OUTPUT_BYTES,
        mounts: [
          { source: repository, target: '/repository.git', readonly: true },
          { source: requestPath, target: '/run/conexus/request.json', readonly: true },
          { source: outputRoot, target: '/out' },
        ],
      })
      if (result.status !== 'COMPLETED') throw runRefusal(result.code, 'BUILDER_SOURCE_BUNDLE_REFUSED')
      const parsed = result.verdict
      if (parsed.status !== 'BUNDLED' || parsed.sourceRevision !== input.sourceRevision) {
        throw new Error(`BUILDER_SOURCE_BUNDLE_${typeof parsed.code === 'string' ? parsed.code : 'REFUSED'}`)
      }
      const path = resolve(outputRoot, 'source.bundle')
      if (!await exactFile(path)) throw new Error('BUILDER_SOURCE_BUNDLE_REFUSED')
      const bytes = await readFile(path)
      if (bytes.byteLength === 0 || bytes.byteLength > 256 * 1024 * 1024) throw new Error('BUILDER_SOURCE_BUNDLE_REFUSED')
      return bytes
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  const admitProjectSourceResult = async (input: Readonly<{
    projectId: string
    executionId: string
    baseSourceRevision: string
    claimedResultSourceRevision: string
    resultBundle: Uint8Array
  }>): Promise<BuilderSourceResult> => {
    if (![input.projectId, input.executionId].every(isIdentity) ||
      !/^[0-9a-f]{40}$/.test(input.baseSourceRevision) || !/^[0-9a-f]{40}$/.test(input.claimedResultSourceRevision) ||
      input.resultBundle.byteLength === 0 || input.resultBundle.byteLength > 256 * 1024 * 1024) {
      throw new Error('BUILDER_SOURCE_RESULT_INPUT_REFUSED')
    }
    const repository = resolve(root, 'projects', input.projectId)
    if (!repository.startsWith(`${root}${sep}`)) throw new Error('BUILDER_SOURCE_CONFIG_REFUSED')
    const temporary = await mkdtemp(resolve(root, '.conexus-builder-source-result-'))
    try {
      const bundlePath = resolve(temporary, 'result.bundle')
      const requestPath = resolve(temporary, 'request.json')
      const outputRoot = resolve(temporary, 'out')
      await writeFile(bundlePath, input.resultBundle, { flag: 'wx', mode: 0o400 })
      await writeFile(requestPath, `${JSON.stringify({
        projectId: input.projectId,
        executionId: input.executionId,
        baseSourceRevision: input.baseSourceRevision,
        claimedResultSourceRevision: input.claimedResultSourceRevision,
        resultBundleBytes: input.resultBundle.byteLength,
      })}\n`, { flag: 'wx', mode: 0o400 })
      await mkdir(outputRoot, { mode: 0o700 })
      const mounts: readonly OciGitMount[] = [
        { source: repository, target: '/repository.git' },
        { source: bundlePath, target: '/run/conexus/result.bundle', readonly: true },
        { source: requestPath, target: '/run/conexus/request.json', readonly: true },
        { source: outputRoot, target: '/out' },
      ]
      const result = await git.runGitProgram({
        program: SOURCE_RESULT_PROGRAM,
        tmpfsBytes: SOURCE_RESULT_TMPFS_BYTES,
        maxOutputBytes: RESULT_OUTPUT_BYTES,
        timeoutMs: RESULT_TIMEOUT_MS,
        mounts,
      })
      if (result.status !== 'COMPLETED') throw runRefusal(result.code, 'BUILDER_SOURCE_RESULT_REFUSED')
      const parsed = result.verdict
      if (parsed.status !== 'ADMITTED' || parsed.baseSourceRevision !== input.baseSourceRevision ||
        typeof parsed.resultSourceRevision !== 'string' || !/^[0-9a-f]{40}$/.test(parsed.resultSourceRevision)) {
        throw new Error(`BUILDER_SOURCE_RESULT_${typeof parsed.code === 'string' ? parsed.code : 'REFUSED'}`)
      }
      if (parsed.resultSourceRevision !== input.claimedResultSourceRevision) {
        throw new Error('BUILDER_SOURCE_RESULT_SANDBOX_REVISION_MISMATCH')
      }
      const patch = await readFile(resolve(outputRoot, 'patch'), 'utf8')
      return Object.freeze({
        baseSourceRevision: input.baseSourceRevision,
        resultSourceRevision: parsed.resultSourceRevision,
        patch,
      })
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  return Object.freeze({
    prepareProjectSource,
    admitSourceResult: admitProjectSourceResult,
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
    readSourceFile: async (input) => {
      const value = await inspectSource({ ...input, operation: 'file' })
      if (value.path !== input.path || typeof value.content !== 'string') throw new Error('BUILDER_SOURCE_FILE_REFUSED')
      return Object.freeze({ sourceRevision: input.sourceRevision, path: input.path, content: value.content })
    },
  })
}
