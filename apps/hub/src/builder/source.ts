import { spawn } from 'node:child_process'
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import { R1C14_GIT_IDENTITY } from '../generated/r1c14-git-identity.js'

export type BuilderGitSourceCapability = Readonly<{
  verifyAdmittedImage(): Promise<Readonly<{ status: string }>>
  createProjectSourceBundle(input: Readonly<{ projectId: string; attemptId: string; sourceRevision: string }>): Promise<Readonly<{ status: string }>>
}>

export type BuilderCandidate = Readonly<{
  baseSourceRevision: string
  candidateSourceRevision: string
  patch: string
}>

export type BuilderSourcePort = Readonly<{
  prepareSource(input: Readonly<{ projectId: string; actorRunId: string; sourceRevision: string }>): Promise<Uint8Array>
  admitCandidate(input: Readonly<{
    projectId: string
    changeId: string
    actorRunId: string
    baseSourceRevision: string
    claimedCandidateSourceRevision: string
    resultBundle: Uint8Array
  }>): Promise<BuilderCandidate>
}>

type ProcessResult = Readonly<{ exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; overflow: boolean }>
const run = (executable: string, args: readonly string[], maxBytes = 64 * 1024, timeoutMs = 120_000): Promise<ProcessResult> => new Promise((complete) => {
  const child = spawn(executable, [...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let overflow = false
  const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer): Buffer<ArrayBufferLike> => {
    const remaining = maxBytes - current.byteLength
    if (remaining <= 0) { overflow = true; return current }
    if (chunk.byteLength > remaining) overflow = true
    return Buffer.concat([current, chunk.subarray(0, remaining)])
  }
  child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk) })
  child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk) })
  const timeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  child.once('error', () => { overflow = true })
  child.once('close', (exitCode, signal) => {
    clearTimeout(timeout)
    complete({ exitCode, signal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), overflow })
  })
})

const CANDIDATE_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const ownership = JSON.parse(readFileSync('/run/conexus/ownership.json', 'utf8'))
const oid = /^[0-9a-f]{40}$/
const ref = 'refs/conexus/changes/' + request.changeId
const env = {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp',
  GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file', GIT_NO_REPLACE_OBJECTS: '1'
}
const git = (dir, args, raw = false) => spawnSync('/usr/local/bin/git', ['--git-dir=' + dir, '-c', 'core.hooksPath=/dev/null', ...args], { env, encoding: raw ? null : 'utf8', maxBuffer: 10 * 1024 * 1024 })
const ok = value => !value.error && value.status === 0 && value.signal === null && (!value.stderr || value.stderr.length === 0)
const text = value => typeof value.stdout === 'string' ? value.stdout : value.stdout.toString('utf8')
const finish = value => { process.stdout.write(JSON.stringify(value) + '\n'); process.exit(0) }
if (!oid.test(request.baseSourceRevision) || !oid.test(request.claimedCandidateSourceRevision) || !/^[0-9a-f-]{36}$/i.test(request.changeId)) finish({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
let value = git('/repository.git', ['rev-parse', '--verify', 'refs/heads/main'])
if (!ok(value) || text(value).trim() !== request.baseSourceRevision) finish({ status: 'REFUSED', code: 'BASE_STALE' })
value = git('/repository.git', ['show-ref', '--verify', '--quiet', ref])
if (value.status === 0) finish({ status: 'REFUSED', code: 'RESULT_ALREADY_EXISTS' })
if (value.status !== 1) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
value = spawnSync('/usr/local/bin/git', ['init', '--quiet', '--bare', '--initial-branch=main', '/tmp/inspect.git'], { env, encoding: 'utf8' })
if (!ok(value)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
value = git('/tmp/inspect.git', ['fetch', '--quiet', '--no-tags', '/run/conexus/result.bundle', 'refs/heads/conexus-result:refs/heads/result'])
if (!ok(value)) finish({ status: 'REFUSED', code: 'BUNDLE_REFUSED' })
const candidate = git('/tmp/inspect.git', ['rev-parse', '--verify', 'refs/heads/result'])
if (!ok(candidate) || text(candidate).trim() !== request.claimedCandidateSourceRevision) finish({ status: 'REFUSED', code: 'CANDIDATE_MISMATCH' })
value = git('/tmp/inspect.git', ['rev-parse', '--verify', 'refs/heads/result^'])
if (!ok(value) || text(value).trim() !== request.baseSourceRevision) finish({ status: 'REFUSED', code: 'NON_DESCENDANT' })
value = git('/tmp/inspect.git', ['rev-list', '--count', request.baseSourceRevision + '..refs/heads/result'])
if (!ok(value) || text(value).trim() !== '1') finish({ status: 'REFUSED', code: 'MULTI_COMMIT_RESULT' })
const changed = git('/tmp/inspect.git', ['diff', '--name-only', '-z', request.baseSourceRevision, 'refs/heads/result'], true)
if (!ok(changed)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const paths = text(changed).split('\0').filter(Boolean)
if (paths.length === 0 || paths.length > 1000) finish({ status: 'REFUSED', code: 'CHANGESET_REFUSED' })
for (const path of paths) {
  if (path.startsWith('/') || path.includes('\\\\') || path.split('/').some(part => !part || part === '.' || part === '..') || path.startsWith('.conexus/') || (ownership[path] && ownership[path] !== 'APP-OWNED')) finish({ status: 'REFUSED', code: 'PROTECTED_PATH' })
  const entry = git('/tmp/inspect.git', ['ls-tree', 'refs/heads/result', '--', path])
  if (!ok(entry)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
  if (text(entry) && !/^(100644|100755) blob [0-9a-f]{40}\t/.test(text(entry))) finish({ status: 'REFUSED', code: 'UNSAFE_ENTRY' })
}
const patch = git('/tmp/inspect.git', ['diff', '--no-ext-diff', '--binary', request.baseSourceRevision, 'refs/heads/result'], true)
if (!ok(patch) || patch.stdout.length > 8 * 1024 * 1024) finish({ status: 'REFUSED', code: 'PATCH_REFUSED' })
value = git('/repository.git', ['fetch', '--quiet', '--no-tags', '/run/conexus/result.bundle', 'refs/heads/conexus-result:' + ref])
if (!ok(value)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const mainAfter = git('/repository.git', ['rev-parse', '--verify', 'refs/heads/main'])
const stored = git('/repository.git', ['rev-parse', '--verify', ref])
if (!ok(mainAfter) || text(mainAfter).trim() !== request.baseSourceRevision || !ok(stored) || text(stored).trim() !== request.claimedCandidateSourceRevision) finish({ status: 'REFUSED', code: 'CUSTODY_REFUSED' })
writeFileSync('/out/patch', patch.stdout)
finish({ status: 'ADMITTED', candidateSourceRevision: request.claimedCandidateSourceRevision })
`

const exactFile = async (path: string): Promise<boolean> => {
  try {
    const stat = await lstat(path)
    return stat.isFile() && !stat.isSymbolicLink() && await realpath(path) === path
  } catch { return false }
}
const isIdentity = (value: string): boolean => /^[0-9a-f-]{36}$/i.test(value)

export const createBuilderSourcePort = ({
  git,
  storageRoot,
  sourceOwnership,
}: Readonly<{
  git: BuilderGitSourceCapability
  storageRoot: string
  sourceOwnership: Readonly<Record<string, string>>
}>): BuilderSourcePort => {
  if (!isAbsolute(storageRoot) || storageRoot.includes(',') || storageRoot.includes(':')) throw new Error('BUILDER_SOURCE_CONFIG_REFUSED')
  const root = resolve(storageRoot)
  return Object.freeze({
    prepareSource: async ({ projectId, actorRunId, sourceRevision }) => {
      if (!isIdentity(projectId) || !isIdentity(actorRunId) || !/^[0-9a-f]{40}$/.test(sourceRevision)) throw new Error('BUILDER_SOURCE_INPUT_REFUSED')
      const result = await git.createProjectSourceBundle({ projectId, attemptId: actorRunId, sourceRevision })
      if (result.status !== 'BUNDLED') throw new Error('BUILDER_SOURCE_BUNDLE_REFUSED')
      const path = resolve(root, 'bundles', projectId, `${sourceRevision}.bundle`)
      if (!path.startsWith(`${root}${sep}`) || !await exactFile(path)) throw new Error('BUILDER_SOURCE_BUNDLE_REFUSED')
      const bytes = await readFile(path)
      if (bytes.byteLength === 0 || bytes.byteLength > 256 * 1024 * 1024) throw new Error('BUILDER_SOURCE_BUNDLE_REFUSED')
      return bytes
    },
    admitCandidate: async (input) => {
      if (![input.projectId, input.changeId, input.actorRunId].every(isIdentity) ||
        !/^[0-9a-f]{40}$/.test(input.baseSourceRevision) || !/^[0-9a-f]{40}$/.test(input.claimedCandidateSourceRevision) ||
        input.resultBundle.byteLength === 0 || input.resultBundle.byteLength > 256 * 1024 * 1024) throw new Error('BUILDER_CANDIDATE_INPUT_REFUSED')
      if ((await git.verifyAdmittedImage()).status !== 'VERIFIED') throw new Error('BUILDER_GIT_IMAGE_REFUSED')
      const repository = resolve(root, 'projects', input.projectId)
      if (!repository.startsWith(`${root}${sep}`)) throw new Error('BUILDER_SOURCE_CONFIG_REFUSED')
      const temporary = await mkdtemp(resolve(root, '.conexus-builder-'))
      try {
        const bundlePath = resolve(temporary, 'result.bundle')
        const requestPath = resolve(temporary, 'request.json')
        const ownershipPath = resolve(temporary, 'ownership.json')
        const outputRoot = resolve(temporary, 'out')
        await writeFile(bundlePath, input.resultBundle, { flag: 'wx', mode: 0o400 })
        await writeFile(requestPath, `${JSON.stringify({
          projectId: input.projectId,
          changeId: input.changeId,
          actorRunId: input.actorRunId,
          baseSourceRevision: input.baseSourceRevision,
          claimedCandidateSourceRevision: input.claimedCandidateSourceRevision,
        })}\n`, { flag: 'wx', mode: 0o400 })
        await writeFile(ownershipPath, `${JSON.stringify(sourceOwnership)}\n`, { flag: 'wx', mode: 0o400 })
        await (await import('node:fs/promises')).mkdir(outputRoot, { mode: 0o700 })
        const user = process.getuid && process.getgid ? `${process.getuid()}:${process.getgid()}` : null
        if (!user) throw new Error('BUILDER_GIT_POSIX_OWNER_REQUIRED')
        const result = await run('docker', [
          'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=512m',
          '--user', user,
          '--mount', `type=bind,src=${repository},dst=/repository.git`,
          '--mount', `type=bind,src=${bundlePath},dst=/run/conexus/result.bundle,readonly`,
          '--mount', `type=bind,src=${requestPath},dst=/run/conexus/request.json,readonly`,
          '--mount', `type=bind,src=${ownershipPath},dst=/run/conexus/ownership.json,readonly`,
          '--mount', `type=bind,src=${outputRoot},dst=/out`,
          '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest,
          '-e', CANDIDATE_PROGRAM,
        ])
        if (result.exitCode !== 0 || result.signal !== null || result.overflow || result.stderr !== '') throw new Error('BUILDER_CANDIDATE_CUSTODY_REFUSED')
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>
        if (parsed.status !== 'ADMITTED' || parsed.candidateSourceRevision !== input.claimedCandidateSourceRevision) {
          throw new Error(`BUILDER_CANDIDATE_${typeof parsed.code === 'string' ? parsed.code : 'REFUSED'}`)
        }
        const patch = await readFile(resolve(outputRoot, 'patch'), 'utf8')
        return Object.freeze({
          baseSourceRevision: input.baseSourceRevision,
          candidateSourceRevision: input.claimedCandidateSourceRevision,
          patch,
        })
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    },
  })
}
