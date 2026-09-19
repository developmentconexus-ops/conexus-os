import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

export type AdmittedGitImageIdentity = Readonly<{
  ociIndexDigest: string
  gitVersion: string
  gitExecutableSha256: string
  gitExecutablePath: string
}>

const DOCKER_EXECUTABLE = 'docker'
const DEFAULT_OUTPUT_BYTES = 4_096
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_TMPFS_BYTES = 16 * 1024 * 1024
const ownerProcessUser = (): string => {
  if (!process.getuid || !process.getgid) throw new Error('OCI_GIT_POSIX_OWNER_REQUIRED')
  return `${process.getuid()}:${process.getgid()}`
}
const CONTAINER_USER = ownerProcessUser()

export type OciProcessResult = Readonly<{
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  overflow: boolean
  spawnError: boolean
}>

export type OciProcessRunner = (
  executable: string,
  args: readonly string[],
  limits?: Readonly<{ maxOutputBytes?: number; timeoutMs?: number }>,
) => Promise<OciProcessResult>

export type OciGitMount = Readonly<{ source: string; target: string; readonly?: boolean }>

export type OciGitProgram = Readonly<{
  program: string
  mounts: readonly OciGitMount[]
  networkName?: string
  containerName?: string
  tmpfsBytes?: number
  maxOutputBytes?: number
  timeoutMs?: number
}>

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

export type OciGitVerdict = Readonly<
  | { status: 'COMPLETED'; verdict: Readonly<Record<string, unknown>> }
  | { status: 'REFUSED'; code: 'IMAGE_NOT_VERIFIED' | 'PROCESS_FAILED' | 'VERDICT_REFUSED' }
>

export type OciGitExecution = Readonly<{
  verifyAdmittedImage(): Promise<VerifiedGitImage | GitImageRefusal>
  runGitProgram(input: OciGitProgram): Promise<OciGitVerdict>
}>

const hashProgram = (gitExecutablePath: string): string =>
  `const f=require('node:fs');const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(f.readFileSync(${JSON.stringify(gitExecutablePath)})).digest('hex')+'\\n')`

export const boundedOciProcess: OciProcessRunner = (executable, args, limits) => new Promise((complete) => {
  const maxOutputBytes = limits?.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES
  const child = spawn(executable, [...args], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let overflow = false
  let spawnError = false
  let settled = false
  const timer = setTimeout(() => child.kill('SIGKILL'), limits?.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
    const remaining = maxOutputBytes - current.length
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

export const ociProcessPassed = (result: OciProcessResult): boolean =>
  !result.spawnError && !result.overflow && result.exitCode === 0 && result.signal === null && result.stderr === ''

const mountArguments = (mounts: readonly OciGitMount[]): readonly string[] =>
  mounts.flatMap((mount) => [
    '--mount',
    `type=bind,src=${mount.source},dst=${mount.target}${mount.readonly ? ',readonly' : ''}`,
  ])

export function createOciGitExecution(
  identity: AdmittedGitImageIdentity,
  runProcess: OciProcessRunner = boundedOciProcess,
): OciGitExecution {
  let verifiedImageSuccess: VerifiedGitImage | undefined
  let verifiedImageAttempt: Promise<VerifiedGitImage | GitImageRefusal> | undefined

  const hardenedRun = (network: string, tmpfsBytes: number): readonly string[] => Object.freeze([
    'run', '--rm', '--pull', 'never', '--network', network, '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--read-only',
    '--tmpfs', `/tmp:rw,noexec,nosuid,size=${Math.trunc(tmpfsBytes / (1024 * 1024))}m`,
  ] as const)

  const programRun = (input: OciGitProgram): readonly string[] => Object.freeze([
    ...hardenedRun(input.networkName ?? 'none', input.tmpfsBytes ?? DEFAULT_TMPFS_BYTES),
    ...(input.containerName ? ['--name', input.containerName] : []),
    '--user', CONTAINER_USER,
    ...mountArguments(input.mounts),
    '--entrypoint', '/usr/local/bin/node',
    identity.ociIndexDigest,
    '-e', input.program,
  ] as const)

  const verifyAdmittedImage = (): Promise<VerifiedGitImage | GitImageRefusal> => {
    if (verifiedImageSuccess) return Promise.resolve(verifiedImageSuccess)
    if (verifiedImageAttempt) return verifiedImageAttempt

    const attempt = (async (): Promise<VerifiedGitImage | GitImageRefusal> => {
      const inspected = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        'image', 'inspect', '--format', '{{.Id}}', identity.ociIndexDigest,
      ]))
      if (!ociProcessPassed(inspected)) return Object.freeze({ status: 'REFUSED', code: 'IMAGE_INSPECT_FAILED' })
      if (inspected.stdout.trim() !== identity.ociIndexDigest) {
        return Object.freeze({ status: 'REFUSED', code: 'IMAGE_IDENTITY_MISMATCH' })
      }

      const version = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        ...hardenedRun('none', DEFAULT_TMPFS_BYTES),
        identity.ociIndexDigest, '--version',
      ]))
      if (!ociProcessPassed(version)) return Object.freeze({ status: 'REFUSED', code: 'VERSION_PROBE_FAILED' })
      if (version.stdout.trim() !== `git version ${identity.gitVersion}`) {
        return Object.freeze({ status: 'REFUSED', code: 'VERSION_MISMATCH' })
      }

      const executableHash = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        ...hardenedRun('none', DEFAULT_TMPFS_BYTES),
        '--entrypoint', '/usr/local/bin/node', identity.ociIndexDigest,
        '-e', hashProgram(identity.gitExecutablePath),
      ]))
      if (!ociProcessPassed(executableHash)) return Object.freeze({ status: 'REFUSED', code: 'EXECUTABLE_HASH_PROBE_FAILED' })
      if (executableHash.stdout.trim() !== identity.gitExecutableSha256) {
        return Object.freeze({ status: 'REFUSED', code: 'EXECUTABLE_HASH_MISMATCH' })
      }

      verifiedImageSuccess = Object.freeze({
        status: 'VERIFIED',
        ociIndexDigest: identity.ociIndexDigest,
        gitVersion: identity.gitVersion,
        gitExecutableSha256: identity.gitExecutableSha256,
      })
      return verifiedImageSuccess
    })()
    verifiedImageAttempt = attempt
    const clearFailedAttempt = (): void => {
      if (verifiedImageAttempt === attempt && !verifiedImageSuccess) verifiedImageAttempt = undefined
    }
    void attempt.then(clearFailedAttempt, clearFailedAttempt)
    return attempt
  }

  const runGitProgram = async (input: OciGitProgram): Promise<OciGitVerdict> => {
    if ((await verifyAdmittedImage()).status !== 'VERIFIED') {
      return Object.freeze({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' })
    }
    const result = await runProcess(DOCKER_EXECUTABLE, programRun(input), {
      ...(input.maxOutputBytes === undefined ? {} : { maxOutputBytes: input.maxOutputBytes }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    })
    if (!ociProcessPassed(result)) {
      if (input.containerName) await runProcess(DOCKER_EXECUTABLE, Object.freeze(['rm', '-f', input.containerName]))
      return Object.freeze({ status: 'REFUSED', code: 'PROCESS_FAILED' })
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(result.stdout)
    } catch {
      return Object.freeze({ status: 'REFUSED', code: 'VERDICT_REFUSED' })
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('status' in parsed)) {
      return Object.freeze({ status: 'REFUSED', code: 'VERDICT_REFUSED' })
    }
    return Object.freeze({ status: 'COMPLETED', verdict: parsed as Readonly<Record<string, unknown>> })
  }

  return Object.freeze({ verifyAdmittedImage, runGitProgram })
}

export const ociGitDigest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
