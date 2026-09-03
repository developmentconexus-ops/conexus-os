import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { R1C14_GIT_IDENTITY } from '../generated/r1c14-git-identity.js'
import { R1_NEW_PROJECT_SEED } from '../generated/r1-new-project-seed.js'
import {
  admitGitImportLocator,
  type GitImportAdmissionCatalog,
} from './git-import-admission.js'
import { isProjectIdentity } from './identity.js'

const MAX_OUTPUT_BYTES = 4_096
const PROCESS_TIMEOUT_MS = 60_000
const DOCKER_EXECUTABLE = 'docker'
const ownerProcessUser = (): string => {
  if (!process.getuid || !process.getgid) throw new Error('S3_GIT_POSIX_OWNER_REQUIRED')
  return `${process.getuid()}:${process.getgid()}`
}
const CONTAINER_USER = ownerProcessUser()
const ZERO_OID = '0'.repeat(40)
const HARDENED_NETWORK_RUN = Object.freeze([
  'run', '--rm', '--pull', 'never', '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges', '--read-only',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
] as const)
const HARDENED_RUN = Object.freeze([
  'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges', '--read-only',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
] as const)
const HASH_PROGRAM = `const f=require('node:fs');const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(f.readFileSync(${JSON.stringify(R1C14_GIT_IDENTITY.gitExecutablePath)})).digest('hex')+'\\n')`
const NEW_STAGE_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const expectedEntries = ${JSON.stringify(R1_NEW_PROJECT_SEED.entries.map((entry) => ({ path: entry.path, sha256: entry.sha256 })).sort((left, right) => left.path.localeCompare(right.path)))}
const expectedPaths = expectedEntries.map((entry) => entry.path)
const expectedTree = ${JSON.stringify(R1_NEW_PROJECT_SEED.expectedTree)}
const expectedSourceRevision = ${JSON.stringify(R1_NEW_PROJECT_SEED.expectedSourceRevision)}
const oid = /^[0-9a-f]{40}$/
const env = { ...process.env,
  GIT_CONFIG_NOSYSTEM: '1', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Conexus OS', GIT_AUTHOR_EMAIL: 'source@conexus.invalid',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_NAME: 'Conexus OS',
  GIT_COMMITTER_EMAIL: 'source@conexus.invalid', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z'
}
const git = (args) => spawnSync('/usr/local/bin/git', args, { encoding: 'utf8', env })
const gitBytes = (args) => spawnSync('/usr/local/bin/git', args, { env })
const ok = (value) => !value.error && value.status === 0 && value.signal === null
const finish = (value) => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
let value = git(['init', '--bare', '--initial-branch=main', '/workspace/repository.git'])
if (!ok(value)) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
value = git(['--git-dir=/workspace/repository.git', '--work-tree=/workspace/tree', 'add', '--all'])
if (!ok(value)) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
const writtenTree = git(['--git-dir=/workspace/repository.git', 'write-tree'])
const tree = writtenTree.stdout.trim()
if (!ok(writtenTree) || tree !== expectedTree) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const committed = git(['--git-dir=/workspace/repository.git', 'commit-tree', tree, '-m', 'Conexus OS R1 NEW seed'])
const sourceRevision = committed.stdout.trim()
if (!ok(committed) || sourceRevision !== expectedSourceRevision) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const updated = git(['--git-dir=/workspace/repository.git', 'update-ref', 'refs/heads/main', sourceRevision, '${ZERO_OID}'])
const current = git(['--git-dir=/workspace/repository.git', 'rev-parse', '--verify', 'refs/heads/main'])
if (!ok(current) || !oid.test(current.stdout.trim())) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
if (!ok(updated)) {
  if (updated.status !== null && updated.signal === null && current.stdout.trim() === sourceRevision) {
    finish({ status: 'CAS_CONFLICT', sourceRevision })
  }
  finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
}
if (current.stdout.trim() !== sourceRevision) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const object = git(['--git-dir=/workspace/repository.git', 'cat-file', '-e', sourceRevision + '^{commit}'])
const fsck = git(['--git-dir=/workspace/repository.git', 'fsck', '--strict', '--no-dangling'])
const listed = git(['--git-dir=/workspace/repository.git', 'ls-tree', '-r', '--name-only', sourceRevision])
const actualPaths = listed.stdout.trim().split('\\n').filter(Boolean).sort()
if (!ok(object) || !ok(fsck) || !ok(listed) || JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
  finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
}
for (const entry of expectedEntries) {
  const blob = gitBytes(['--git-dir=/workspace/repository.git', 'cat-file', 'blob', sourceRevision + ':' + entry.path])
  if (!ok(blob) || createHash('sha256').update(blob.stdout).digest('hex') !== entry.sha256) {
    finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
  }
}
finish({ status: 'STAGED', sourceRevision, tree, appOwnedPathCount: 0 })
`
const EXISTING_STAGE_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const oidPattern = /^[0-9a-f]{40}$/
const finish = (value) => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
let request
try { request = JSON.parse(readFileSync('/run/conexus/import.json', 'utf8')) } catch { finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' }) }
const env = {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp/home', XDG_CONFIG_HOME: '/tmp/xdg',
  GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/run/conexus/askpass', GIT_ALLOW_PROTOCOL: 'https',
  ...(request.caMounted ? { GIT_SSL_CAINFO: '/run/conexus/ca.pem' } : {})
}
const prefix = ['-c', 'credential.helper=', '-c', 'core.askPass=/run/conexus/askpass', '-c', 'http.followRedirects=false']
const git = (args) => spawnSync('/usr/local/bin/git', [...prefix, ...args], { encoding: 'utf8', env })
const ok = (value) => !value.error && value.status === 0 && value.signal === null
let value = git(['init', '--bare', '--initial-branch=main', '/workspace/repository.git'])
if (!ok(value)) {
  value = git(['--git-dir=/workspace/repository.git', 'rev-parse', '--is-bare-repository'])
  if (!ok(value) || value.stdout.trim() !== 'true') finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
}
const discovery = git(['ls-remote', '--symref', request.locator, 'HEAD'])
if (!ok(discovery)) finish({ status: 'REFUSED', code: 'REMOTE_DISCOVERY_REFUSED' })
const lines = discovery.stdout.trim().split('\\n')
const symref = lines.find((line) => line.startsWith('ref: '))
const head = lines.find((line) => /^[0-9a-f]{40}\\tHEAD$/.test(line))
if (!symref || !head) finish({ status: 'REFUSED', code: 'DEFAULT_REF_REFUSED' })
const defaultRef = symref.slice(5).split('\\t')[0]
const sourceRevision = head.split('\\t')[0]
if (defaultRef !== request.defaultRef || !oidPattern.test(sourceRevision)) finish({ status: 'REFUSED', code: 'DEFAULT_REF_REFUSED' })
const fetched = git(['--git-dir=/workspace/repository.git', 'fetch', '--no-tags', '--no-write-fetch-head', request.locator, sourceRevision])
if (!ok(fetched)) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
const commit = git(['--git-dir=/workspace/repository.git', 'cat-file', '-e', sourceRevision + '^{commit}'])
const tree = git(['--git-dir=/workspace/repository.git', 'rev-parse', '--verify', sourceRevision + '^{tree}'])
const fsck = git(['--git-dir=/workspace/repository.git', 'fsck', '--strict', '--no-dangling'])
const objects = git(['--git-dir=/workspace/repository.git', 'rev-list', '--objects', sourceRevision])
if (!ok(commit) || !ok(tree) || !oidPattern.test(tree.stdout.trim()) || !ok(fsck) || !ok(objects)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const objectIds = [...new Set(objects.stdout.trim().split('\\n').filter(Boolean).map((line) => line.split(' ')[0]))]
let fetchedBytes = 0
for (const objectId of objectIds) {
  if (!oidPattern.test(objectId)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
  const size = git(['--git-dir=/workspace/repository.git', 'cat-file', '-s', objectId])
  if (!ok(size) || !/^\\d+$/.test(size.stdout.trim())) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
  fetchedBytes += Number(size.stdout.trim())
}
if (objectIds.length > request.maxObjectCount || fetchedBytes > request.maxFetchedBytes) finish({ status: 'REFUSED', code: 'CEILING_EXCEEDED' })
const updated = git(['--git-dir=/workspace/repository.git', 'update-ref', 'refs/heads/main', sourceRevision, '${ZERO_OID}'])
const current = git(['--git-dir=/workspace/repository.git', 'rev-parse', '--verify', 'refs/heads/main'])
if (!ok(current) || !oidPattern.test(current.stdout.trim())) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
if (!ok(updated)) {
  if (updated.status !== null && updated.signal === null && current.stdout.trim() === sourceRevision) {
    finish({ status: 'CAS_CONFLICT', sourceRevision, defaultRef, objectCount: objectIds.length, fetchedBytes })
  }
  finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
}
if (current.stdout.trim() !== sourceRevision) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
finish({ status: 'STAGED', sourceRevision, defaultRef, objectCount: objectIds.length, fetchedBytes })
`
const ASKPASS_PROGRAM = `#!/usr/local/bin/node
const { readFileSync } = require('node:fs')
let pair
try { pair = readFileSync('/run/conexus/credential', 'utf8').replace(/\\n$/, '').split('\\n') } catch { process.exit(1) }
if (pair.length !== 2 || !pair[0] || !pair[1]) process.exit(1)
const prompt = process.argv[2] || ''
if (/username/i.test(prompt)) process.stdout.write(pair[0] + '\\n')
else if (/password/i.test(prompt)) process.stdout.write(pair[1] + '\\n')
else process.exit(1)
`
const DENY_ASKPASS_PROGRAM = '#!/usr/local/bin/node\nprocess.exit(1)\n'
const REPOSITORY_VERIFY_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0' }
const git = (args) => spawnSync('/usr/local/bin/git', args, { encoding: 'utf8', env })
const ok = (value) => !value.error && value.status === 0 && value.signal === null
const finish = (value) => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
const ref = git(['--git-dir=/repository.git', 'rev-parse', '--verify', 'refs/heads/main'])
const object = git(['--git-dir=/repository.git', 'cat-file', '-e', request.sourceRevision + '^{commit}'])
const tree = git(['--git-dir=/repository.git', 'rev-parse', '--verify', request.sourceRevision + '^{tree}'])
const fsck = git(['--git-dir=/repository.git', 'fsck', '--strict', '--no-dangling'])
if (!ok(ref) || ref.stdout.trim() !== request.sourceRevision || !ok(object) || !ok(tree) || !/^[0-9a-f]{40}$/.test(tree.stdout.trim()) || !ok(fsck)) {
  finish({ status: 'REFUSED' })
}
finish({ status: 'VERIFIED', sourceRevision: request.sourceRevision, tree: tree.stdout.trim() })
`
const BUNDLE_CREATE_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0' }
const git = (args) => spawnSync('/usr/local/bin/git', args, { encoding: 'utf8', env })
const ok = (value) => !value.error && value.status === 0 && value.signal === null
const finish = (value) => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
const ref = git(['--git-dir=/repository.git', 'rev-parse', '--verify', 'refs/heads/main'])
if (!ok(ref) || ref.stdout.trim() !== request.sourceRevision) finish({ status: 'REFUSED' })
const created = git(['--git-dir=/repository.git', 'bundle', 'create', '/bundle/output.tmp', 'refs/heads/main'])
const verified = git(['--git-dir=/repository.git', 'bundle', 'verify', '/bundle/output.tmp'])
if (!ok(created) || !ok(verified)) finish({ status: 'REFUSED' })
finish({ status: 'CREATED', sourceRevision: request.sourceRevision })
`
const BUNDLE_RESTORE_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { rmSync } = require('node:fs')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file' }
const git = (args) => spawnSync('/usr/local/bin/git', args, { encoding: 'utf8', env })
const ok = (value) => !value.error && value.status === 0 && value.signal === null
const finish = (value) => { rmSync('/workspace/verify.git', { recursive: true, force: true }); process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
const initialized = git(['init', '--bare', '--initial-branch=main', '/workspace/verify.git'])
const verified = git(['--git-dir=/workspace/verify.git', 'bundle', 'verify', '/bundle/source.bundle'])
if (!ok(verified)) finish({ status: 'REFUSED' })
if (!ok(initialized)) finish({ status: 'REFUSED' })
const cloned = git(['clone', '--bare', '--no-hardlinks', '/bundle/source.bundle', '/workspace/repository.git'])
if (!ok(cloned)) finish({ status: 'REFUSED' })
const ref = git(['--git-dir=/workspace/repository.git', 'rev-parse', '--verify', 'refs/heads/main'])
const object = git(['--git-dir=/workspace/repository.git', 'cat-file', '-e', request.sourceRevision + '^{commit}'])
const fsck = git(['--git-dir=/workspace/repository.git', 'fsck', '--strict', '--no-dangling'])
if (!ok(ref) || ref.stdout.trim() !== request.sourceRevision || !ok(object) || !ok(fsck)) finish({ status: 'REFUSED' })
finish({ status: 'RESTORED', sourceRevision: request.sourceRevision })
`

type ProcessResult = Readonly<{
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  overflow: boolean
  spawnError: boolean
}>

type ProcessRunner = (executable: string, args: readonly string[], timeoutMs?: number) => Promise<ProcessResult>

export type VerifiedGitImage = Readonly<{
  status: 'VERIFIED'
  ociIndexDigest: string
  gitVersion: string
  gitExecutableSha256: string
}>

export type GitImageRefusal = Readonly<{
  status: 'REFUSED'
  code:
    | 'IMAGE_INSPECT_FAILED'
    | 'IMAGE_IDENTITY_MISMATCH'
    | 'VERSION_PROBE_FAILED'
    | 'VERSION_MISMATCH'
    | 'EXECUTABLE_HASH_PROBE_FAILED'
    | 'EXECUTABLE_HASH_MISMATCH'
}>

export type NewProjectSourceInput = Readonly<{ projectId: string; attemptId: string }>
export type ExistingGitProjectSourceInput = Readonly<{ projectId: string; attemptId: string; locator: string }>
export type ProjectSourceCustodyInput = Readonly<{ projectId: string; attemptId: string; sourceRevision: string }>

export type NewProjectSourceResult = Readonly<
  | { status: 'STAGED'; sourceRevision: string; tree: string; appOwnedPathCount: 0 }
  | { status: 'CAS_CONFLICT'; sourceRevision: string }
  | { status: 'REFUSED'; code: 'IMAGE_NOT_VERIFIED' | 'STORAGE_ROOT_REFUSED' | 'IDENTITY_REFUSED' | 'SEED_BYTES_REFUSED' | 'GIT_PROCESS_FAILED' | 'GIT_RESULT_REFUSED' }
>

export type ExistingGitProjectSourceResult = Readonly<
  | { status: 'STAGED' | 'CAS_CONFLICT'; sourceRevision: string; defaultRef: string; objectCount: number; fetchedBytes: number }
  | { status: 'REFUSED'; code: 'IMAGE_NOT_VERIFIED' | 'CATALOG_REFUSED' | 'LOCATOR_REFUSED' | 'DESTINATION_NOT_ADMITTED' | 'STORAGE_ROOT_REFUSED' | 'IDENTITY_REFUSED' | 'EXTERNAL_SLOT_REFUSED' | 'SECRET_FILE_REFUSED' | 'CA_FILE_REFUSED' | 'TEMPORARY_FILE_REFUSED' | 'GIT_PROCESS_FAILED' | 'REMOTE_DISCOVERY_REFUSED' | 'DEFAULT_REF_REFUSED' | 'CEILING_EXCEEDED' | 'GIT_RESULT_REFUSED' }
>
export type ProjectSourceCustodyResult = Readonly<
  | { status: 'PROMOTED' | 'ADOPTED' | 'BUNDLED' | 'RESTORED'; sourceRevision: string }
  | { status: 'REFUSED'; code: 'IMAGE_NOT_VERIFIED' | 'IDENTITY_REFUSED' | 'STORAGE_ROOT_REFUSED' | 'STAGED_SOURCE_REFUSED' | 'CANONICAL_SOURCE_REFUSED' | 'CANDIDATE_QUARANTINED' | 'BUNDLE_REFUSED' | 'RESTORE_REFUSED' | 'GIT_PROCESS_FAILED' | 'GIT_RESULT_REFUSED' }
>
export type CanonicalProjectSourceResult = Readonly<
  | { status: 'VERIFIED'; sourceRevision: string }
  | { status: 'REFUSED'; code: 'IMAGE_NOT_VERIFIED' | 'IDENTITY_REFUSED' | 'STORAGE_ROOT_REFUSED' | 'CANONICAL_SOURCE_REFUSED' }
>

export interface GitExecutionPort {
  verifyAdmittedImage(): Promise<VerifiedGitImage | GitImageRefusal>
  stageNewProjectSource(input: NewProjectSourceInput): Promise<NewProjectSourceResult>
  stageExistingGitProjectSource(input: ExistingGitProjectSourceInput): Promise<ExistingGitProjectSourceResult>
  promoteStagedProjectSource(input: ProjectSourceCustodyInput): Promise<ProjectSourceCustodyResult>
  verifyCanonicalProjectSource(input: ProjectSourceCustodyInput): Promise<CanonicalProjectSourceResult>
  createProjectSourceBundle(input: ProjectSourceCustodyInput): Promise<ProjectSourceCustodyResult>
  restoreProjectSourceBundle(input: ProjectSourceCustodyInput): Promise<ProjectSourceCustodyResult>
}

const boundedProcess: ProcessRunner = (executable, args, timeoutMs = PROCESS_TIMEOUT_MS) => new Promise((complete) => {
  const child = spawn(executable, [...args], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let overflow = false
  let spawnError = false
  let settled = false
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)

  const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
    const remaining = MAX_OUTPUT_BYTES - current.length
    if (remaining <= 0) {
      overflow = true
      return current
    }
    if (chunk.length > remaining) overflow = true
    return Buffer.concat([current, chunk.subarray(0, remaining)])
  }
  child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk) })
  child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk) })
  child.once('error', () => { spawnError = true })
  child.once('close', (exitCode, signal) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    complete({ exitCode, signal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), overflow, spawnError })
  })
})

const passed = (result: ProcessResult): boolean =>
  !result.spawnError && !result.overflow && result.exitCode === 0 && result.signal === null && result.stderr === ''
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

async function exactDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path)
    return stat.isDirectory() && !stat.isSymbolicLink() && await realpath(path) === path
  } catch {
    return false
  }
}

async function prepareAttemptRoot(storageRoot: string | undefined, input: NewProjectSourceInput): Promise<string | null> {
  if (!storageRoot || !isAbsolute(storageRoot) || storageRoot.includes(',') || storageRoot.includes(':')) return null
  const ownerRoot = resolve(storageRoot)
  if (!await exactDirectory(ownerRoot)) return null
  if (!isProjectIdentity(input.projectId) || !isProjectIdentity(input.attemptId)) return null
  const stagingRoot = resolve(ownerRoot, 'staging')
  const projectRoot = resolve(stagingRoot, input.projectId)
  const attemptRoot = resolve(projectRoot, input.attemptId)
  if (!attemptRoot.startsWith(`${ownerRoot}${sep}`)) return null
  for (const path of [stagingRoot, projectRoot, attemptRoot]) {
    try {
      await mkdir(path, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return null
    }
    if (!await exactDirectory(path)) return null
  }
  for (const child of ['tree', 'repository.git']) {
    try {
      const stat = await lstat(resolve(attemptRoot, child))
      if (stat.isSymbolicLink() || !stat.isDirectory()) return null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null
    }
  }
  return attemptRoot
}

async function materializeSeed(attemptRoot: string): Promise<boolean> {
  const treeRoot = resolve(attemptRoot, 'tree')
  try {
    await rm(treeRoot, { recursive: true, force: true })
    await mkdir(treeRoot, { mode: 0o700 })
    for (const entry of R1_NEW_PROJECT_SEED.entries) {
      const output = resolve(treeRoot, entry.path)
      if (!output.startsWith(`${treeRoot}${sep}`)) return false
      const bytes = Buffer.from(entry.bytesBase64, 'base64')
      if (digest(bytes) !== entry.sha256) return false
      await mkdir(dirname(output), { recursive: true, mode: 0o700 })
      await writeFile(output, bytes, { mode: 0o600 })
    }
    return R1_NEW_PROJECT_SEED.appOwnedPathCount === 0
  } catch {
    return false
  }
}

async function exactExternalFile(path: string, secret: boolean): Promise<boolean> {
  try {
    if (!isAbsolute(path) || path.includes(',') || path.includes(':')) return false
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(path) !== path) return false
    if (secret && ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))) return false
    return stat.size > 0 && stat.size <= (secret ? 8_192 : 1_048_576)
  } catch {
    return false
  }
}

async function readCredential(path: string): Promise<Buffer | null> {
  if (!await exactExternalFile(path, true)) return null
  try {
    const bytes = await readFile(path)
    const text = bytes.toString('utf8')
    if (Buffer.from(text, 'utf8').compare(bytes) !== 0 || text.includes('\0') || text.includes('\r') ||
      !/^[^\n]+\n[^\n]+\n?$/.test(text)) return null
    return bytes
  } catch {
    return null
  }
}

export function createOciGitExecutionPort(
  options: Readonly<{
    projectStorageRoot?: string
    gitImportCatalog?: GitImportAdmissionCatalog
    externalFileSlots?: Readonly<Record<string, string>>
  }> = {},
  runProcess: ProcessRunner = boundedProcess,
): GitExecutionPort {
  let verifiedImageSuccess: VerifiedGitImage | undefined
  const verifyAdmittedImage = async (): Promise<VerifiedGitImage | GitImageRefusal> => {
    if (verifiedImageSuccess) return verifiedImageSuccess
    const inspected = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
      'image', 'inspect', '--format', '{{.Id}}', R1C14_GIT_IDENTITY.ociIndexDigest,
    ]))
    if (!passed(inspected)) return Object.freeze({ status: 'REFUSED', code: 'IMAGE_INSPECT_FAILED' })
    if (inspected.stdout.trim() !== R1C14_GIT_IDENTITY.ociIndexDigest) {
      return Object.freeze({ status: 'REFUSED', code: 'IMAGE_IDENTITY_MISMATCH' })
    }

    const version = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
      ...HARDENED_RUN, R1C14_GIT_IDENTITY.ociIndexDigest, '--version',
    ]))
    if (!passed(version)) return Object.freeze({ status: 'REFUSED', code: 'VERSION_PROBE_FAILED' })
    if (version.stdout.trim() !== `git version ${R1C14_GIT_IDENTITY.gitVersion}`) {
      return Object.freeze({ status: 'REFUSED', code: 'VERSION_MISMATCH' })
    }

    const executableHash = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
      ...HARDENED_RUN, '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest,
      '-e', HASH_PROGRAM,
    ]))
    if (!passed(executableHash)) return Object.freeze({ status: 'REFUSED', code: 'EXECUTABLE_HASH_PROBE_FAILED' })
    if (executableHash.stdout.trim() !== R1C14_GIT_IDENTITY.gitExecutableSha256) {
      return Object.freeze({ status: 'REFUSED', code: 'EXECUTABLE_HASH_MISMATCH' })
    }

    verifiedImageSuccess = Object.freeze({
      status: 'VERIFIED',
      ociIndexDigest: R1C14_GIT_IDENTITY.ociIndexDigest,
      gitVersion: R1C14_GIT_IDENTITY.gitVersion,
      gitExecutableSha256: R1C14_GIT_IDENTITY.gitExecutableSha256,
    })
    return verifiedImageSuccess
  }

  const custodyInputValid = (input: ProjectSourceCustodyInput): boolean =>
    isProjectIdentity(input.projectId) && isProjectIdentity(input.attemptId) && /^[0-9a-f]{40}$/.test(input.sourceRevision)

  const ownerRoot = async (): Promise<string | null> => {
    if (!options.projectStorageRoot || !isAbsolute(options.projectStorageRoot) ||
      options.projectStorageRoot.includes(',') || options.projectStorageRoot.includes(':')) return null
    const path = resolve(options.projectStorageRoot)
    return await exactDirectory(path) ? path : null
  }

  const ensureOwnedDirectory = async (path: string): Promise<boolean> => {
    try {
      await mkdir(path, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return false
    }
    return exactDirectory(path)
  }

  const verifyRepository = async (repositoryRoot: string, requestRoot: string, sourceRevision: string): Promise<boolean> => {
    if (!await exactDirectory(repositoryRoot) || !await exactDirectory(requestRoot)) return false
    const requestPath = resolve(requestRoot, '.conexus-custody-request.json')
    try {
      await writeFile(requestPath, `${JSON.stringify({ sourceRevision })}\n`, { flag: 'wx', mode: 0o400 })
      const result = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        ...HARDENED_RUN, '--user', CONTAINER_USER,
        '--mount', `type=bind,src=${repositoryRoot},dst=/repository.git,readonly`,
        '--mount', `type=bind,src=${requestPath},dst=/run/conexus/request.json,readonly`,
        '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest,
        '-e', REPOSITORY_VERIFY_PROGRAM,
      ]))
      if (!passed(result)) return false
      const parsed = JSON.parse(result.stdout)
      return parsed?.status === 'VERIFIED' && parsed.sourceRevision === sourceRevision && /^[0-9a-f]{40}$/.test(parsed.tree)
    } catch {
      return false
    } finally {
      await rm(requestPath, { force: true })
    }
  }

  const promoteStagedProjectSource = async (input: ProjectSourceCustodyInput): Promise<ProjectSourceCustodyResult> => {
    if ((await verifyAdmittedImage()).status !== 'VERIFIED') return Object.freeze({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' })
    if (!custodyInputValid(input)) return Object.freeze({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
    const root = await ownerRoot()
    if (!root) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    const attemptRoot = resolve(root, 'staging', input.projectId, input.attemptId)
    const stagedRoot = resolve(attemptRoot, 'repository.git')
    if (!await verifyRepository(stagedRoot, attemptRoot, input.sourceRevision)) {
      return Object.freeze({ status: 'REFUSED', code: 'STAGED_SOURCE_REFUSED' })
    }
    const projectsRoot = resolve(root, 'projects')
    if (!await ensureOwnedDirectory(projectsRoot)) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    const canonicalRoot = resolve(projectsRoot, input.projectId)
    try {
      await rename(stagedRoot, canonicalRoot)
      return Object.freeze({ status: 'PROMOTED', sourceRevision: input.sourceRevision })
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
      }
    }
    if (await verifyRepository(canonicalRoot, attemptRoot, input.sourceRevision)) {
      await rm(stagedRoot, { recursive: true, force: true })
      return Object.freeze({ status: 'ADOPTED', sourceRevision: input.sourceRevision })
    }
    const quarantineProjectRoot = resolve(root, 'quarantine', input.projectId)
    if (!await ensureOwnedDirectory(resolve(root, 'quarantine')) || !await ensureOwnedDirectory(quarantineProjectRoot)) {
      return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    }
    const quarantineRoot = resolve(quarantineProjectRoot, input.attemptId)
    try {
      await rename(stagedRoot, quarantineRoot)
    } catch {
      return Object.freeze({ status: 'REFUSED', code: 'CANONICAL_SOURCE_REFUSED' })
    }
    return Object.freeze({ status: 'REFUSED', code: 'CANDIDATE_QUARANTINED' })
  }

  const createProjectSourceBundle = async (input: ProjectSourceCustodyInput): Promise<ProjectSourceCustodyResult> => {
    if ((await verifyAdmittedImage()).status !== 'VERIFIED') return Object.freeze({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' })
    if (!custodyInputValid(input)) return Object.freeze({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
    const root = await ownerRoot()
    if (!root) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    const requestRoot = resolve(root, 'staging', input.projectId, input.attemptId)
    const canonicalRoot = resolve(root, 'projects', input.projectId)
    if (!await ensureOwnedDirectory(requestRoot) || !await verifyRepository(canonicalRoot, requestRoot, input.sourceRevision)) {
      return Object.freeze({ status: 'REFUSED', code: 'CANONICAL_SOURCE_REFUSED' })
    }
    const bundlesRoot = resolve(root, 'bundles')
    const bundleProjectRoot = resolve(bundlesRoot, input.projectId)
    const temporaryRoot = resolve(bundleProjectRoot, input.attemptId)
    if (!await ensureOwnedDirectory(bundlesRoot) || !await ensureOwnedDirectory(bundleProjectRoot) || !await ensureOwnedDirectory(temporaryRoot)) {
      return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    }
    const requestPath = resolve(temporaryRoot, 'request.json')
    const outputPath = resolve(temporaryRoot, 'output.tmp')
    const finalPath = resolve(bundleProjectRoot, `${input.sourceRevision}.bundle`)
    try {
      await writeFile(requestPath, `${JSON.stringify({ sourceRevision: input.sourceRevision })}\n`, { flag: 'wx', mode: 0o400 })
      const created = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        ...HARDENED_RUN, '--user', CONTAINER_USER,
        '--mount', `type=bind,src=${canonicalRoot},dst=/repository.git,readonly`,
        '--mount', `type=bind,src=${temporaryRoot},dst=/bundle`,
        '--mount', `type=bind,src=${requestPath},dst=/run/conexus/request.json,readonly`,
        '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest,
        '-e', BUNDLE_CREATE_PROGRAM,
      ]))
      if (!passed(created) || JSON.parse(created.stdout)?.status !== 'CREATED') return Object.freeze({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
      try {
        await rename(outputPath, finalPath)
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) return Object.freeze({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
        const [candidate, existing] = await Promise.all([readFile(outputPath), readFile(finalPath)])
        if (digest(candidate) !== digest(existing)) return Object.freeze({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
      }
      return Object.freeze({ status: 'BUNDLED', sourceRevision: input.sourceRevision })
    } catch {
      return Object.freeze({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }

  const verifyCanonicalProjectSource = async (input: ProjectSourceCustodyInput): Promise<CanonicalProjectSourceResult> => {
    if ((await verifyAdmittedImage()).status !== 'VERIFIED') return Object.freeze({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' })
    if (!custodyInputValid(input)) return Object.freeze({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
    const root = await ownerRoot()
    if (!root) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    const requestRoot = resolve(root, 'staging', input.projectId, input.attemptId)
    const canonicalRoot = resolve(root, 'projects', input.projectId)
    if (!await verifyRepository(canonicalRoot, requestRoot, input.sourceRevision)) {
      return Object.freeze({ status: 'REFUSED', code: 'CANONICAL_SOURCE_REFUSED' })
    }
    return Object.freeze({ status: 'VERIFIED', sourceRevision: input.sourceRevision })
  }

  const restoreProjectSourceBundle = async (input: ProjectSourceCustodyInput): Promise<ProjectSourceCustodyResult> => {
    if ((await verifyAdmittedImage()).status !== 'VERIFIED') return Object.freeze({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' })
    if (!custodyInputValid(input)) return Object.freeze({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
    const root = await ownerRoot()
    if (!root) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    const bundlePath = resolve(root, 'bundles', input.projectId, `${input.sourceRevision}.bundle`)
    try {
      const bundleStat = await lstat(bundlePath)
      if (!bundleStat.isFile() || bundleStat.isSymbolicLink() || await realpath(bundlePath) !== bundlePath) {
        return Object.freeze({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
      }
    } catch {
      return Object.freeze({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
    }
    const attemptRoot = await prepareAttemptRoot(root, input)
    if (!attemptRoot) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    try {
      await lstat(resolve(attemptRoot, 'repository.git'))
      return Object.freeze({ status: 'REFUSED', code: 'RESTORE_REFUSED' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return Object.freeze({ status: 'REFUSED', code: 'RESTORE_REFUSED' })
    }
    const requestPath = resolve(attemptRoot, '.conexus-restore-request.json')
    try {
      await writeFile(requestPath, `${JSON.stringify({ sourceRevision: input.sourceRevision })}\n`, { flag: 'wx', mode: 0o400 })
      const restored = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        ...HARDENED_RUN, '--user', CONTAINER_USER,
        '--mount', `type=bind,src=${attemptRoot},dst=/workspace`,
        '--mount', `type=bind,src=${bundlePath},dst=/bundle/source.bundle,readonly`,
        '--mount', `type=bind,src=${requestPath},dst=/run/conexus/request.json,readonly`,
        '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest,
        '-e', BUNDLE_RESTORE_PROGRAM,
      ]))
      if (!passed(restored) || JSON.parse(restored.stdout)?.status !== 'RESTORED') {
        await Promise.all([
          rm(resolve(attemptRoot, 'repository.git'), { recursive: true, force: true }),
          rm(resolve(attemptRoot, 'verify.git'), { recursive: true, force: true }),
        ])
        return Object.freeze({ status: 'REFUSED', code: 'RESTORE_REFUSED' })
      }
    } catch {
      await Promise.all([
        rm(resolve(attemptRoot, 'repository.git'), { recursive: true, force: true }),
        rm(resolve(attemptRoot, 'verify.git'), { recursive: true, force: true }),
      ])
      return Object.freeze({ status: 'REFUSED', code: 'RESTORE_REFUSED' })
    } finally {
      await Promise.all([
        rm(requestPath, { force: true }),
        rm(resolve(attemptRoot, 'verify.git'), { recursive: true, force: true }),
      ])
    }
    const promoted = await promoteStagedProjectSource(input)
    if (promoted.status === 'PROMOTED' || promoted.status === 'ADOPTED') {
      return Object.freeze({ status: 'RESTORED', sourceRevision: input.sourceRevision })
    }
    return promoted
  }

  return Object.freeze({
    verifyAdmittedImage,
    async stageNewProjectSource(input: NewProjectSourceInput): Promise<NewProjectSourceResult> {
      if ((await verifyAdmittedImage()).status !== 'VERIFIED') {
        return Object.freeze({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' })
      }
      if (!isProjectIdentity(input.projectId) || !isProjectIdentity(input.attemptId)) {
        return Object.freeze({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
      }
      const attemptRoot = await prepareAttemptRoot(options.projectStorageRoot, input)
      if (!attemptRoot) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
      if (!await materializeSeed(attemptRoot)) return Object.freeze({ status: 'REFUSED', code: 'SEED_BYTES_REFUSED' })

      const staged = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        ...HARDENED_RUN,
        '--user', CONTAINER_USER,
        '--mount', `type=bind,src=${attemptRoot},dst=/workspace`,
        '--entrypoint', '/usr/local/bin/node',
        R1C14_GIT_IDENTITY.ociIndexDigest,
        '-e', NEW_STAGE_PROGRAM,
      ]))
      if (!passed(staged)) return Object.freeze({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
      let result: unknown
      try {
        result = JSON.parse(staged.stdout)
      } catch {
        return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
      }
      await rm(resolve(attemptRoot, 'tree'), { recursive: true, force: true })
      if (!result || typeof result !== 'object' || !('status' in result)) {
        return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
      }
      if (result.status === 'CAS_CONFLICT' && 'sourceRevision' in result && result.sourceRevision === R1_NEW_PROJECT_SEED.expectedSourceRevision) {
        return Object.freeze({ status: 'CAS_CONFLICT', sourceRevision: result.sourceRevision })
      }
      if (result.status === 'STAGED' && 'sourceRevision' in result && 'tree' in result &&
        result.sourceRevision === R1_NEW_PROJECT_SEED.expectedSourceRevision &&
        result.tree === R1_NEW_PROJECT_SEED.expectedTree &&
        'appOwnedPathCount' in result && result.appOwnedPathCount === 0) {
        return Object.freeze({ status: 'STAGED', sourceRevision: result.sourceRevision, tree: result.tree, appOwnedPathCount: 0 })
      }
      if (result.status === 'REFUSED' && 'code' in result && (result.code === 'GIT_PROCESS_FAILED' || result.code === 'GIT_RESULT_REFUSED')) {
        return Object.freeze({ status: 'REFUSED', code: result.code })
      }
      return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
    },
    async stageExistingGitProjectSource(input: ExistingGitProjectSourceInput): Promise<ExistingGitProjectSourceResult> {
      if ((await verifyAdmittedImage()).status !== 'VERIFIED') {
        return Object.freeze({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' })
      }
      if (!isProjectIdentity(input.projectId) || !isProjectIdentity(input.attemptId)) {
        return Object.freeze({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
      }
      if (!options.gitImportCatalog) return Object.freeze({ status: 'REFUSED', code: 'CATALOG_REFUSED' })
      const admission = admitGitImportLocator(options.gitImportCatalog, input.locator)
      if (admission.status === 'REFUSED') return Object.freeze({ status: 'REFUSED', code: admission.code })
      const attemptRoot = await prepareAttemptRoot(options.projectStorageRoot, input)
      if (!attemptRoot) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
      const repositoryRoot = resolve(attemptRoot, 'repository.git')
      try {
        await mkdir(repositoryRoot, { mode: 0o700 })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
        }
      }
      if (!await exactDirectory(repositoryRoot)) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })

      const slots: Readonly<Record<string, string>> = options.externalFileSlots ?? Object.freeze({})
      const slotPath = (slot: string): string | null =>
        Object.hasOwn(slots, slot) && typeof slots[slot] === 'string' ? slots[slot] : null
      let credentialBytes: Buffer | null = null
      if (admission.entry.credentialSlot) {
        const credentialPath = slotPath(admission.entry.credentialSlot)
        if (!credentialPath) return Object.freeze({ status: 'REFUSED', code: 'EXTERNAL_SLOT_REFUSED' })
        credentialBytes = await readCredential(credentialPath)
        if (!credentialBytes) return Object.freeze({ status: 'REFUSED', code: 'SECRET_FILE_REFUSED' })
      }
      let caPath: string | null = null
      if (admission.entry.tls.mode === 'EXTERNAL_CA_FILE') {
        caPath = slotPath(admission.entry.tls.caFileSlot)
        if (!caPath) return Object.freeze({ status: 'REFUSED', code: 'EXTERNAL_SLOT_REFUSED' })
        if (!await exactExternalFile(caPath, false)) return Object.freeze({ status: 'REFUSED', code: 'CA_FILE_REFUSED' })
      }

      const requestPath = resolve(attemptRoot, '.conexus-import-request.json')
      const askpassPath = resolve(attemptRoot, '.conexus-import-askpass')
      const credentialPath = resolve(attemptRoot, '.conexus-import-credential')
      const temporaryPaths: string[] = []
      try {
        await writeFile(requestPath, `${JSON.stringify({
          locator: admission.canonicalLocator,
          defaultRef: admission.entry.defaultRef,
          maxFetchedBytes: admission.entry.maxFetchedBytes,
          maxObjectCount: admission.entry.maxObjectCount,
          caMounted: caPath !== null,
        })}\n`, { flag: 'wx', mode: 0o400 })
        temporaryPaths.push(requestPath)
        await writeFile(askpassPath, credentialBytes ? ASKPASS_PROGRAM : DENY_ASKPASS_PROGRAM, { flag: 'wx', mode: 0o500 })
        temporaryPaths.push(askpassPath)
        if (credentialBytes) {
          await writeFile(credentialPath, credentialBytes, { flag: 'wx', mode: 0o400 })
          temporaryPaths.push(credentialPath)
        }
      } catch {
        await Promise.all(temporaryPaths.map((path) => rm(path, { force: true })))
        return Object.freeze({ status: 'REFUSED', code: 'TEMPORARY_FILE_REFUSED' })
      }

      const containerName = `conexus-s3-${input.attemptId}`
      let staged: ProcessResult
      try {
        const mounts = [
          '--mount', `type=bind,src=${repositoryRoot},dst=/workspace/repository.git`,
          '--mount', `type=bind,src=${requestPath},dst=/run/conexus/import.json,readonly`,
          '--mount', `type=bind,src=${askpassPath},dst=/run/conexus/askpass,readonly`,
          ...(credentialBytes ? ['--mount', `type=bind,src=${credentialPath},dst=/run/conexus/credential,readonly`] : []),
          ...(caPath ? ['--mount', `type=bind,src=${caPath},dst=/run/conexus/ca.pem,readonly`] : []),
        ]
        staged = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
          ...HARDENED_NETWORK_RUN,
          '--network', admission.entry.networkName,
          '--name', containerName,
          '--user', CONTAINER_USER,
          ...mounts,
          '--entrypoint', '/usr/local/bin/node',
          R1C14_GIT_IDENTITY.ociIndexDigest,
          '-e', EXISTING_STAGE_PROGRAM,
        ]), admission.entry.timeoutMs)
        if (!passed(staged)) {
          await runProcess(DOCKER_EXECUTABLE, Object.freeze(['rm', '-f', containerName]))
          return Object.freeze({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
        }
      } finally {
        credentialBytes?.fill(0)
        await Promise.all(temporaryPaths.map((path) => rm(path, { force: true })))
      }

      let result: unknown
      try {
        result = JSON.parse(staged.stdout)
      } catch {
        return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
      }
      if (!result || typeof result !== 'object' || !('status' in result)) {
        return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
      }
      if ((result.status === 'STAGED' || result.status === 'CAS_CONFLICT') &&
        'sourceRevision' in result && typeof result.sourceRevision === 'string' && /^[0-9a-f]{40}$/.test(result.sourceRevision) &&
        'defaultRef' in result && result.defaultRef === admission.entry.defaultRef &&
        'objectCount' in result && typeof result.objectCount === 'number' && result.objectCount <= admission.entry.maxObjectCount &&
        'fetchedBytes' in result && typeof result.fetchedBytes === 'number' && result.fetchedBytes <= admission.entry.maxFetchedBytes) {
        return Object.freeze({
          status: result.status,
          sourceRevision: result.sourceRevision,
          defaultRef: result.defaultRef,
          objectCount: result.objectCount,
          fetchedBytes: result.fetchedBytes,
        })
      }
      const refusalCodes = new Set(['GIT_PROCESS_FAILED', 'REMOTE_DISCOVERY_REFUSED', 'DEFAULT_REF_REFUSED', 'CEILING_EXCEEDED', 'GIT_RESULT_REFUSED'])
      if (result.status === 'REFUSED' && 'code' in result && typeof result.code === 'string' && refusalCodes.has(result.code)) {
        return Object.freeze({ status: 'REFUSED', code: result.code as 'GIT_PROCESS_FAILED' })
      }
      return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
    },
    promoteStagedProjectSource,
    verifyCanonicalProjectSource,
    createProjectSourceBundle,
    restoreProjectSourceBundle,
  })
}
