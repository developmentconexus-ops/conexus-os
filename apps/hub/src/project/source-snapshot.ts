import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { R1C14_GIT_IDENTITY } from '../generated/r1c14-git-identity.js'
import type { ProjectSourceFile, ProjectSourcePath, ProjectSourceSnapshot } from './project-mastra.js'

const MAX_PROCESS_BYTES = 1024 * 1024
const MAX_BATCH_BYTES = 262_144
export const PROJECT_SOURCE_PROGRAM = String.raw`
const { readFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0' }
const git = args => spawnSync('/usr/local/bin/git', ['--git-dir=/repository.git', ...args], { env, encoding: args.includes('--raw-bytes') ? null : 'utf8' })
const bytes = args => spawnSync('/usr/local/bin/git', ['--git-dir=/repository.git', ...args], { env })
const ok = value => !value.error && value.status === 0 && value.signal === null
const finish = value => { process.stdout.write(JSON.stringify(value) + '\n'); process.exit(0) }
const ref = git(['rev-parse', '--verify', 'refs/heads/main'])
const object = git(['cat-file', '-e', request.sourceRevision + '^{commit}'])
if (!ok(ref) || ref.stdout.trim() !== request.sourceRevision || !ok(object)) finish({ status: 'REFUSED' })
const listed = git(['ls-tree', '-r', '-z', '--long', request.sourceRevision])
if (!ok(listed)) finish({ status: 'REFUSED' })
const entries = listed.stdout.split('\0').filter(Boolean).map(line => {
  const match = /^(\d+) blob ([0-9a-f]{40})\s+(\d+)\t(.+)$/.exec(line)
  if (!match || match[1] !== '100644') return null
  return { path: match[4], byteLength: Number(match[3]) }
})
if (entries.some(value => !value)) finish({ status: 'REFUSED' })
if (request.operation === 'list') {
  const output = []
  for (const entry of entries) {
    const blob = bytes(['cat-file', 'blob', request.sourceRevision + ':' + entry.path])
    if (!ok(blob) || blob.stdout.length !== entry.byteLength) finish({ status: 'REFUSED' })
    const digest = createHash('sha256').update(blob.stdout).digest('hex')
    const utf8 = !blob.stdout.includes(0) && Buffer.from(blob.stdout.toString('utf8'), 'utf8').equals(blob.stdout)
    output.push({ ...entry, digest, mediaType: utf8 ? 'text/plain; charset=utf-8' : 'application/octet-stream' })
  }
  finish({ status: 'PASS', entries: output.sort((a, b) => a.path.localeCompare(b.path)) })
}
if (request.operation !== 'read' || !Array.isArray(request.paths) || request.paths.length < 1 || request.paths.length > 32) finish({ status: 'REFUSED' })
const available = new Set(entries.map(entry => entry.path))
let total = 0
const files = []
for (const path of request.paths) {
  if (typeof path !== 'string' || !available.has(path) || path.includes('..') || path.startsWith('/')) finish({ status: 'REFUSED' })
  const blob = bytes(['cat-file', 'blob', request.sourceRevision + ':' + path])
  if (!ok(blob) || blob.stdout.includes(0) || !Buffer.from(blob.stdout.toString('utf8'), 'utf8').equals(blob.stdout)) finish({ status: 'REFUSED' })
  total += blob.stdout.length
  if (total > 262144) finish({ status: 'REFUSED' })
  files.push({ path, digest: createHash('sha256').update(blob.stdout).digest('hex'), utf8Bytes: blob.stdout.toString('utf8') })
}
finish({ status: 'PASS', files })
`

type Runner = (repositoryRoot: string, requestPath: string) => Promise<unknown>

const dockerRunner: Runner = (repositoryRoot, requestPath) => new Promise((complete, reject) => {
  const child = spawn('docker', [
    'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--mount', `type=bind,src=${repositoryRoot},dst=/repository.git,readonly`,
    '--mount', `type=bind,src=${requestPath},dst=/run/conexus/request.json,readonly`,
    '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest, '-e', PROJECT_SOURCE_PROGRAM,
  ], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
  let output = Buffer.alloc(0)
  child.stdout.on('data', (chunk: Buffer) => {
    output = Buffer.concat([output, chunk])
    if (output.length > MAX_PROCESS_BYTES) child.kill('SIGKILL')
  })
  child.once('error', reject)
  child.once('close', (code, signal) => {
    if (code !== 0 || signal || output.length > MAX_PROCESS_BYTES) return reject(new Error('PROJECT_SOURCE_UNSUPPORTED'))
    try { complete(JSON.parse(output.toString('utf8'))) } catch { reject(new Error('PROJECT_SOURCE_UNSUPPORTED')) }
  })
})

export const createProjectSourceSnapshot = ({
  storageRoot,
  projectId,
  sourceRevision,
  ownership,
  runner = dockerRunner,
}: Readonly<{
  storageRoot: string
  projectId: string
  sourceRevision: string
  ownership: Readonly<Record<string, string>>
  runner?: Runner
}>): ProjectSourceSnapshot => {
  if (!isAbsolute(storageRoot) || !/^[0-9a-f-]{36}$/i.test(projectId) || !/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error('PROJECT_SOURCE_UNSUPPORTED')
  }
  const repositoryRoot = resolve(storageRoot, 'projects', projectId)
  const invoke = async (request: unknown): Promise<Record<string, unknown>> => {
    const requestRoot = await mkdtemp(resolve(tmpdir(), 'conexus-project-source-'))
    const requestPath = resolve(requestRoot, 'request.json')
    try {
      await writeFile(requestPath, `${JSON.stringify(request)}\n`, { flag: 'wx', mode: 0o400 })
      const value = await runner(repositoryRoot, requestPath)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROJECT_SOURCE_UNSUPPORTED')
      return value as Record<string, unknown>
    } finally {
      await rm(requestRoot, { recursive: true, force: true })
    }
  }
  let listed: readonly ProjectSourcePath[] | undefined
  return Object.freeze({
    sourceRevision,
    listPaths: async () => {
      if (listed) return listed
      const value = await invoke({ operation: 'list', sourceRevision })
      if (value.status !== 'PASS' || !Array.isArray(value.entries)) throw new Error('PROJECT_SOURCE_UNSUPPORTED')
      listed = Object.freeze(value.entries.map((entry): ProjectSourcePath => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('PROJECT_SOURCE_UNSUPPORTED')
        const item = entry as Record<string, unknown>
        const owner = typeof item.path === 'string' ? ownership[item.path] : undefined
        if (!owner || typeof item.path !== 'string' || typeof item.mediaType !== 'string' ||
          !Number.isSafeInteger(item.byteLength) || typeof item.digest !== 'string' || !/^[0-9a-f]{64}$/.test(item.digest)) {
          throw new Error('PROJECT_SOURCE_UNSUPPORTED')
        }
        return Object.freeze({
          path: item.path, ownershipClass: owner, mediaType: item.mediaType,
          byteLength: item.byteLength as number, digest: item.digest,
        })
      }))
      return listed
    },
    readBatch: async (paths) => {
      if (new Set(paths).size !== paths.length) throw new Error('PROJECT_SOURCE_UNSUPPORTED')
      const allowed = new Map((await (listed ? Promise.resolve(listed) : undefined))?.map((entry) => [entry.path, entry]) ?? [])
      if (!listed) {
        const all = await (createProjectSourceSnapshot({ storageRoot, projectId, sourceRevision, ownership, runner })).listPaths()
        for (const entry of all) allowed.set(entry.path, entry)
      }
      if (paths.some((path) => !allowed.has(path))) throw new Error('PROJECT_SOURCE_UNSUPPORTED')
      const value = await invoke({ operation: 'read', sourceRevision, paths })
      if (value.status !== 'PASS' || !Array.isArray(value.files)) throw new Error('PROJECT_SOURCE_UNSUPPORTED')
      const files = value.files as ProjectSourceFile[]
      const total = files.reduce((sum, file) => sum + Buffer.byteLength(file.utf8Bytes, 'utf8'), 0)
      if (total > MAX_BATCH_BYTES || files.length !== paths.length || files.some((file, index) =>
        file.path !== paths[index] || allowed.get(file.path)?.digest !== file.digest)) throw new Error('PROJECT_SOURCE_UNSUPPORTED')
      return Object.freeze(files.map((file) => Object.freeze({
        path: file.path,
        digest: file.digest,
        utf8Bytes: file.utf8Bytes,
      })))
    },
  })
}
