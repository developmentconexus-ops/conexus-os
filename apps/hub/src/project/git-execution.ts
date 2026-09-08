import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { R1C14_GIT_IDENTITY } from '../generated/r1c14-git-identity.js'
import { R1_NEW_PROJECT_SEED } from '../generated/r1-new-project-seed.js'
import { canonicalBytes } from '../../../../packages/canonical-json/src/index.mjs'
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

/**
 * This is deliberately a separate capability from GitExecutionPort. The R1
 * source-custody consumers must not gain a binding mutation method merely
 * because the same admitted Git substrate is reused for R2.
 */
const PROJECT_BINDING_CAS_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { lstatSync, readFileSync, readdirSync, realpathSync } = require('node:fs')
const request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8'))
const declaration = readFileSync('/run/conexus/declaration.json')
const allowedPaths = new Set([
  '.conexus/project/brain-binding.json',
  '.conexus/project/connection-bindings.json',
])
const oidPattern = /^[0-9a-f]{40}$/
const expectedDate = '946684800 +0000'
const expectedAuthor = 'author Conexus OS <source@conexus.invalid> ' + expectedDate
const expectedCommitter = 'committer Conexus OS <source@conexus.invalid> ' + expectedDate
const expectedMessage = 'Conexus OS Project binding declaration\\n'
const env = {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp',
  GIT_TERMINAL_PROMPT: '0', GIT_INDEX_FILE: '/tmp/conexus-binding-index', GIT_NO_REPLACE_OBJECTS: '1',
  GIT_AUTHOR_NAME: 'Conexus OS', GIT_AUTHOR_EMAIL: 'source@conexus.invalid',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_NAME: 'Conexus OS',
  GIT_COMMITTER_EMAIL: 'source@conexus.invalid', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
}
const finish = value => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
const run = (args, input, raw) => spawnSync(
  '/usr/local/bin/git', ['-c', 'core.hooksPath=/dev/null', '--git-dir=/repository.git', ...args],
  { env, encoding: raw ? null : 'utf8', input },
)
const ok = value => !value.error && value.status === 0 && value.signal === null &&
  (value.stderr === '' || (Buffer.isBuffer(value.stderr) && value.stderr.length === 0))
const text = value => typeof value.stdout === 'string' ? value.stdout : value.stdout.toString('utf8')
const safeRepositoryRefs = value => {
  if (!ok(value)) return false
  const refs = text(value).trim().split('\\n').filter(Boolean)
  const changeRef = new RegExp('^refs/conexus/changes/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12} commit$')
  return refs.filter(ref => ref === 'refs/heads/main commit').length === 1 && refs.every(ref =>
    ref === 'refs/heads/main commit' || changeRef.test(ref))
}
const entries = value => {
  if (!ok(value)) return null
  const output = text(value)
  if (output === '') return []
  if (!output.endsWith('\\0')) return null
  const parsed = output.slice(0, -1).split('\\0').filter(Boolean).map(line => {
    const match = /^(\\d{6}) (blob|commit|tree) ([0-9a-f]{40})\\t([\\s\\S]*)$/.exec(line)
    return match ? { mode: match[1], type: match[2], oid: match[3], path: match[4] } : null
  })
  return parsed.some(entry => entry === null) ? null : parsed
}
const sameEntry = (left, right) => left && right && left.mode === right.mode && left.type === right.type && left.oid === right.oid && left.path === right.path
const exactFile = path => {
  try {
    const stat = lstatSync(path)
    return stat.isFile() && !stat.isSymbolicLink() && realpathSync(path) === path
  } catch { return false }
}
const exactDirectory = path => {
  try {
    const stat = lstatSync(path)
    return stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === path
  } catch { return false }
}
const absent = path => {
  try { lstatSync(path); return false } catch (error) { return error.code === 'ENOENT' }
}
const safeTreeOnce = (path) => {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = path + '/' + entry.name
    if (entry.isSymbolicLink()) return false
    if (entry.isDirectory()) {
      if (!safeTreeOnce(child)) return false
    } else {
      const stat = lstatSync(child)
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(child) !== child) return false
    }
  }
  return true
}
const safeTree = (path) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return safeTreeOnce(path) } catch (error) {
      if (error?.code !== 'ENOENT') return false
    }
  }
  return false
}
const safeRepositoryMetadata = () => {
  if (!exactFile('/repository.git/HEAD') || readFileSync('/repository.git/HEAD', 'utf8') !== 'ref: refs/heads/main\\n' ||
    !exactFile('/repository.git/config') || !exactFile('/repository.git/description') ||
    !exactDirectory('/repository.git/info') || !safeTree('/repository.git/info') ||
    !exactDirectory('/repository.git/objects') ||
    !exactDirectory('/repository.git/objects/info') || !exactDirectory('/repository.git/objects/pack') ||
    !exactDirectory('/repository.git/refs') || !exactDirectory('/repository.git/refs/heads') ||
    !exactDirectory('/repository.git/refs/tags') || !exactDirectory('/repository.git/hooks') ||
    !safeTree('/repository.git/objects') || !safeTree('/repository.git/refs') || !safeTree('/repository.git/hooks') ||
    !absent('/repository.git/objects/info/alternates') || !absent('/repository.git/objects/info/http-alternates')) return false
  const configuration = run(['config', '--local', '--list', '--null'])
  if (!ok(configuration)) return false
  const allowed = new Map([
    ['core.repositoryformatversion', '0'], ['core.bare', 'true'],
    ['core.filemode', 'true'], ['core.logallrefupdates', 'true'],
  ])
  const configEntries = text(configuration).split('\\0').filter(Boolean).map(value => {
    const separator = value.indexOf('\\n')
    return separator < 0 ? null : [value.slice(0, separator), value.slice(separator + 1)]
  })
  if (configEntries.length !== 3 || configEntries.some(entry => !entry || !allowed.has(entry[0]) || allowed.get(entry[0]) !== entry[1])) return false
  for (const entry of readdirSync('/repository.git/hooks', { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isFile() || (!entry.name.endsWith('.sample') && !entry.name.endsWith('.example'))) return false
  }
  return true
}
const validRequest = request && typeof request === 'object' && !Array.isArray(request) &&
  typeof request.expectedSourceRevision === 'string' && oidPattern.test(request.expectedSourceRevision) &&
  typeof request.path === 'string' && allowedPaths.has(request.path) && declaration.length > 0 && declaration.length <= 1048576
if (!validRequest) finish({ status: 'REFUSED', code: 'DECLARATION_REFUSED' })

const expected = request.expectedSourceRevision
if (!safeRepositoryMetadata()) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const bare = run(['rev-parse', '--is-bare-repository'])
const ref = run(['rev-parse', '--verify', 'refs/heads/main'])
const refs = run(['for-each-ref', '--format=%(refname) %(objecttype)'])
if (!ok(bare) || text(bare).trim() !== 'true' || !ok(ref) || !safeRepositoryRefs(refs)) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const current = text(ref).trim()
if (!oidPattern.test(current) || !exactFile('/repository.git/refs/heads/main') ||
  readFileSync('/repository.git/refs/heads/main', 'utf8') !== current + '\\n') finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const verifyCommit = run(['cat-file', '-e', expected + '^{commit}'])
const expectedTree = run(['rev-parse', '--verify', expected + '^{tree}'])
const strict = run(['fsck', '--strict', '--no-dangling'])
const before = entries(run(['ls-tree', '-r', '-z', expected]))
if (!ok(verifyCommit) || !ok(expectedTree) || !oidPattern.test(text(expectedTree).trim()) || !ok(strict) || !before) {
  finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
}

const deterministicChild = (candidate) => {
  if (!oidPattern.test(candidate)) return false
  const commit = run(['cat-file', 'commit', candidate])
  if (!ok(commit)) return false
  const lines = text(commit).split('\\n')
  const treeLine = lines.shift()
  const parents = []
  while (lines.length && lines[0].startsWith('parent ')) parents.push(lines.shift().slice(7))
  if (!treeLine || !/^tree [0-9a-f]{40}$/.test(treeLine) || parents.length !== 1 || parents[0] !== expected ||
    lines.shift() !== expectedAuthor || lines.shift() !== expectedCommitter || lines.shift() !== '' || lines.join('\\n') !== expectedMessage) return false
  const candidateEntries = entries(run(['ls-tree', '-r', '-z', candidate]))
  if (!candidateEntries || candidateEntries.length !== before.length + (before.some(entry => entry.path === request.path) ? 0 : 1)) return false
  const target = candidateEntries.find(entry => entry.path === request.path)
  if (!target || target.mode !== '100644' || target.type !== 'blob') return false
  const targetBytes = run(['cat-file', 'blob', candidate + ':' + request.path], undefined, true)
  if (!ok(targetBytes) || !targetBytes.stdout.equals(declaration)) return false
  const oldByPath = new Map(before.map(entry => [entry.path, entry]))
  for (const entry of candidateEntries) {
    if (entry.path === request.path) continue
    if (!sameEntry(entry, oldByPath.get(entry.path))) return false
  }
  return [...oldByPath.keys()].every(path => path === request.path || candidateEntries.some(entry => sameEntry(entry, oldByPath.get(path))))
}

// A restart after Git CAS but before DB settlement is a safe replay only when
// the current child is exactly the deterministic child for this request.
if (current !== expected) {
  if (deterministicChild(current)) finish({ status: 'APPLIED', oldSourceRevision: expected, newSourceRevision: current })
  finish({ status: 'CONFLICT', expectedSourceRevision: expected, actualSourceRevision: current })
}

const blob = run(['hash-object', '-w', '--stdin'], declaration)
if (!ok(blob) || !oidPattern.test(text(blob).trim())) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
const blobOid = text(blob).trim()
const target = before.find(entry => entry.path === request.path)
if (target && (target.type !== 'blob' || target.mode === '120000')) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const readTree = run(['read-tree', expected + '^{tree}'])
const updateIndex = run(['update-index', '--add', '--cacheinfo', '100644,' + blobOid + ',' + request.path])
const tree = run(['write-tree'])
if (!ok(readTree) || !ok(updateIndex) || !ok(tree) || !oidPattern.test(text(tree).trim())) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
const newTree = text(tree).trim()
const committed = run(['commit-tree', newTree, '-p', expected, '-m', 'Conexus OS Project binding declaration'])
if (!ok(committed) || !oidPattern.test(text(committed).trim())) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
const child = text(committed).trim()
const childEntries = entries(run(['ls-tree', '-r', '-z', child]))
const oldByPath = new Map(before.map(entry => [entry.path, entry]))
if (!childEntries || childEntries.length !== before.length + (target ? 0 : 1) ||
  !childEntries.some(entry => entry.path === request.path && entry.mode === '100644' && entry.type === 'blob' && entry.oid === blobOid) ||
  childEntries.some(entry => entry.path !== request.path && !sameEntry(entry, oldByPath.get(entry.path)))) {
  finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
}
const updated = run(['update-ref', 'refs/heads/main', child, expected])
const afterRef = run(['rev-parse', '--verify', 'refs/heads/main'])
if (ok(updated) && ok(afterRef) && text(afterRef).trim() === child) {
  finish({ status: 'APPLIED', oldSourceRevision: expected, newSourceRevision: child })
}
if (ok(afterRef) && deterministicChild(text(afterRef).trim())) {
  finish({ status: 'APPLIED', oldSourceRevision: expected, newSourceRevision: text(afterRef).trim() })
}
// A CAS loser can leave unreachable plumbing objects. Never prune here:
// another concurrent writer may still be preparing its unreferenced child.
if (ok(afterRef) && oidPattern.test(text(afterRef).trim())) {
  finish({ status: 'CONFLICT', expectedSourceRevision: expected, actualSourceRevision: text(afterRef).trim() })
}
finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
`

// Project binding recovery stages the complete deterministic object closure
// without touching refs. The three commits are deliberately created in one
// OCI invocation so their OIDs can be frozen in the Project intent before any
// later invocation is given ref-write authority.
const PROJECT_BINDING_INTENT_STAGE_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { lstatSync, readFileSync, readdirSync, realpathSync } = require('node:fs')
let request
try { request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8')) } catch { process.stdout.write(JSON.stringify({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' }) + '\\n'); process.exit(0) }
const declaration = readFileSync('/run/conexus/declaration.json')
const allowedPaths = new Set([
  ' .conexus/project/brain-binding.json'.trim(),
  ' .conexus/project/connection-bindings.json'.trim(),
])
const oidPattern = /^[0-9a-f]{40}$/
const identityPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const expectedDate = '946684800 +0000'
const expectedAuthor = 'author Conexus OS <source@conexus.invalid> ' + expectedDate
const expectedCommitter = 'committer Conexus OS <source@conexus.invalid> ' + expectedDate
const finish = value => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
const run = (args, input, raw) => spawnSync(
  '/usr/local/bin/git', ['-c', 'core.hooksPath=/dev/null', '--git-dir=/repository.git', ...args],
  { env: {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp',
    GIT_TERMINAL_PROMPT: '0', GIT_INDEX_FILE: '/tmp/conexus-binding-intent-index-' + request.intentId, GIT_NO_REPLACE_OBJECTS: '1',
    GIT_AUTHOR_NAME: 'Conexus OS', GIT_AUTHOR_EMAIL: 'source@conexus.invalid',
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_NAME: 'Conexus OS',
    GIT_COMMITTER_EMAIL: 'source@conexus.invalid', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  }, encoding: raw ? null : 'utf8', input },
)
const ok = value => !value.error && value.status === 0 && value.signal === null &&
  (value.stderr === '' || (Buffer.isBuffer(value.stderr) && value.stderr.length === 0))
const text = value => typeof value.stdout === 'string' ? value.stdout : value.stdout.toString('utf8')
const safeRepositoryRefs = value => {
  if (!ok(value)) return false
  const refs = text(value).trim().split('\\n').filter(Boolean)
  const changeRef = new RegExp('^refs/conexus/changes/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12} commit$')
  return refs.filter(ref => ref === 'refs/heads/main commit').length === 1 && refs.every(ref =>
    ref === 'refs/heads/main commit' || changeRef.test(ref))
}
const entries = value => {
  if (!ok(value)) return null
  const output = text(value)
  if (output === '') return []
  if (!output.endsWith('\\0')) return null
  const parsed = output.slice(0, -1).split('\\0').filter(Boolean).map(line => {
    const match = /^(\\d{6}) (blob|commit|tree) ([0-9a-f]{40})\\t([\\s\\S]*)$/.exec(line)
    return match ? { mode: match[1], type: match[2], oid: match[3], path: match[4] } : null
  })
  return parsed.some(entry => entry === null) ? null : parsed
}
const sameEntry = (left, right) => left && right && left.mode === right.mode && left.type === right.type && left.oid === right.oid && left.path === right.path
const exactFile = path => {
  try { const stat = lstatSync(path); return stat.isFile() && !stat.isSymbolicLink() && realpathSync(path) === path } catch { return false }
}
const exactDirectory = path => {
  try { const stat = lstatSync(path); return stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === path } catch { return false }
}
const safeTreeOnce = path => {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = path + '/' + entry.name
    if (entry.isSymbolicLink()) return false
    if (entry.isDirectory()) { if (!safeTreeOnce(child)) return false }
    else { const stat = lstatSync(child); if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(child) !== child) return false }
  }
  return true
}
const safeTree = path => { try { return safeTreeOnce(path) } catch { return false } }
const absent = path => { try { lstatSync(path); return false } catch (error) { return error && error.code === 'ENOENT' } }
const safeRepository = () => {
  if (!exactFile('/repository.git/HEAD') || readFileSync('/repository.git/HEAD', 'utf8') !== 'ref: refs/heads/main\\n' ||
    !exactFile('/repository.git/config') || !exactFile('/repository.git/description') ||
    !exactDirectory('/repository.git/info') || !safeTree('/repository.git/info') ||
    !exactDirectory('/repository.git/objects') || !exactDirectory('/repository.git/objects/info') ||
    !exactDirectory('/repository.git/objects/pack') || !exactDirectory('/repository.git/refs') ||
    !exactDirectory('/repository.git/refs/heads') || !exactDirectory('/repository.git/refs/tags') ||
    !exactDirectory('/repository.git/hooks') || !safeTree('/repository.git/objects') ||
    !safeTree('/repository.git/refs') || !safeTree('/repository.git/hooks') ||
    !absent('/repository.git/objects/info/alternates') || !absent('/repository.git/objects/info/http-alternates')) return false
  const configuration = run(['config', '--local', '--list', '--null'])
  if (!ok(configuration)) return false
  const allowed = new Map([
    ['core.repositoryformatversion', '0'], ['core.bare', 'true'],
    ['core.filemode', 'true'], ['core.logallrefupdates', 'true'],
  ])
  const configEntries = text(configuration).split('\\0').filter(Boolean).map(value => {
    const separator = value.indexOf('\\n')
    return separator < 0 ? null : [value.slice(0, separator), value.slice(separator + 1)]
  })
  if (configEntries.length !== 3 || configEntries.some(entry => !entry || !allowed.has(entry[0]) || allowed.get(entry[0]) !== entry[1])) return false
  for (const entry of readdirSync('/repository.git/hooks', { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isFile() || (!entry.name.endsWith('.sample') && !entry.name.endsWith('.example'))) return false
  }
  const refs = run(['for-each-ref', '--format=%(refname) %(objecttype)'])
  if (!safeRepositoryRefs(refs)) return false
  const bare = run(['rev-parse', '--is-bare-repository'])
  const head = run(['rev-parse', '--verify', 'refs/heads/main'])
  return ok(bare) && text(bare).trim() === 'true' && ok(head) && oidPattern.test(text(head).trim()) &&
    exactFile('/repository.git/refs/heads/main') && readFileSync('/repository.git/refs/heads/main', 'utf8') === text(head).trim() + '\\n'
}
const validRequest = request && typeof request === 'object' && !Array.isArray(request) &&
  identityPattern.test(request.projectId) && identityPattern.test(request.intentId) &&
  oidPattern.test(request.expectedSourceRevision) && typeof request.path === 'string' && allowedPaths.has(request.path) &&
  ['UPSERT', 'DELETE'].includes(request.mutation) &&
  ((request.mutation === 'UPSERT' && declaration.length > 0 && declaration.length <= 1048576) ||
    (request.mutation === 'DELETE' && request.path === '.conexus/project/brain-binding.json' && declaration.length === 0))
if (!validRequest) finish({ status: 'REFUSED', code: 'DECLARATION_REFUSED' })
if (!safeRepository()) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
if (!ok(run(['fsck', '--strict', '--no-dangling']))) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const expected = request.expectedSourceRevision
const currentResult = run(['rev-parse', '--verify', 'refs/heads/main'])
const current = ok(currentResult) ? text(currentResult).trim() : ''
// Staging is permitted only while the admitted source is still at S0. This
// check precedes every object-writing command, so a stale/restarted stager
// cannot create plumbing objects after another owner has advanced the ref.
if (current !== expected) {
  if (oidPattern.test(current)) finish({ status: 'CONFLICT', expectedSourceRevision: expected, actualSourceRevision: current })
  finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
}
const expectedCommit = run(['cat-file', '-e', expected + '^{commit}'])
const expectedTreeResult = run(['rev-parse', '--verify', expected + '^{tree}'])
const before = entries(run(['ls-tree', '-r', '-z', expected]))
const baseTree = ok(expectedTreeResult) ? text(expectedTreeResult).trim() : ''
if (!ok(expectedCommit) || !oidPattern.test(baseTree) || !before) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const target = before.find(entry => entry.path === request.path)
if (target && (target.mode !== '100644' || target.type !== 'blob')) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
if (request.mutation === 'DELETE' && !target) finish({ status: 'REFUSED', code: 'SOURCE_DB_DIVERGENCE' })
const previousDeclarationBlob = target ? target.oid : null
// A production coordinator supplies the complete DB projection, never imported
// source authority. Compare at S0 before creating even unreachable Git objects.
if (request.expectedDeclarations !== undefined) {
  const checks = request.expectedDeclarations
  if (!Array.isArray(checks) || checks.length !== 2 || new Set(checks.map(check => check?.path)).size !== 2 ||
    checks.some(check => !check || typeof check !== 'object' || Array.isArray(check) ||
      Object.keys(check).sort().join(',') !== 'allowAbsent,digest,path' || !allowedPaths.has(check.path) ||
      typeof check.allowAbsent !== 'boolean' || (check.digest === null ? !check.allowAbsent :
        typeof check.digest !== 'string' || !/^[0-9a-f]{64}$/.test(check.digest)))) {
    finish({ status: 'REFUSED', code: 'DECLARATION_REFUSED' })
  }
  for (const check of checks) {
    const entry = before.find(entry => entry.path === check.path)
    if (!entry) {
      if (check.allowAbsent && !before.some(entry => entry.path.startsWith(check.path + '/'))) continue
      finish({ status: 'REFUSED', code: 'SOURCE_DB_DIVERGENCE' })
    }
    if (check.digest === null || entry.mode !== '100644' || entry.type !== 'blob')
      finish({ status: 'REFUSED', code: 'SOURCE_DB_DIVERGENCE' })
    const content = run(['cat-file', 'blob', entry.oid], undefined, true)
    if (!ok(content) || createHash('sha256').update(content.stdout).digest('hex') !== check.digest)
      finish({ status: 'REFUSED', code: 'SOURCE_DB_DIVERGENCE' })
  }
}
const readTree = run(['read-tree', expected + '^{tree}'])
if (!ok(readTree)) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
let declarationBlob = null
let updateIndex
if (request.mutation === 'DELETE') {
  updateIndex = run(['update-index', '--index-info'], '0 ' + '0'.repeat(40) + '\\t' + request.path + '\\n')
} else {
  const blob = run(['hash-object', '-w', '--stdin'], declaration)
  if (!ok(blob) || !oidPattern.test(text(blob).trim())) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
  declarationBlob = text(blob).trim()
  updateIndex = run(['update-index', '--add', '--cacheinfo', '100644,' + declarationBlob + ',' + request.path])
}
const applyTreeResult = run(['write-tree'])
const applyTree = ok(applyTreeResult) ? text(applyTreeResult).trim() : ''
if (!ok(updateIndex) || !oidPattern.test(applyTree)) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
const message = purpose => 'Conexus OS Project binding intent ' + request.intentId + ' purpose ' + purpose
const commit = (tree, parent, purpose) => run(['commit-tree', tree, '-p', parent, '-m', message(purpose)])
const applyCommit = commit(applyTree, expected, 'APPLY')
const cancelBaseCommit = commit(baseTree, expected, 'CANCEL_BASE')
if (!ok(applyCommit) || !ok(cancelBaseCommit)) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
const applySourceRevision = text(applyCommit).trim()
const cancelBaseSourceRevision = text(cancelBaseCommit).trim()
if (!oidPattern.test(applySourceRevision) || !oidPattern.test(cancelBaseSourceRevision)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const cancelAppliedCommit = commit(baseTree, applySourceRevision, 'CANCEL_APPLIED')
const cancelAppliedSourceRevision = text(cancelAppliedCommit).trim()
if (!ok(cancelAppliedCommit) || !oidPattern.test(cancelAppliedSourceRevision)) finish({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
const exactCommit = (candidate, parent, tree, purpose) => {
  if (!oidPattern.test(candidate)) return false
  const result = run(['cat-file', 'commit', candidate])
  if (!ok(result)) return false
  const lines = text(result).split('\\n')
  if (lines.shift() !== 'tree ' + tree) return false
  const parents = []
  while (lines.length && lines[0].startsWith('parent ')) parents.push(lines.shift().slice(7))
  if (parents.length !== 1 || parents[0] !== parent || lines.shift() !== expectedAuthor || lines.shift() !== expectedCommitter || lines.shift() !== '') return false
  return lines.join('\\n') === message(purpose) + '\\n'
}
const sameTree = (candidate, expectedEntries) => {
  const actual = entries(run(['ls-tree', '-r', '-z', candidate]))
  return actual && actual.length === expectedEntries.length && actual.every((entry, index) => sameEntry(entry, expectedEntries[index]))
}
const applyEntries = entries(run(['ls-tree', '-r', '-z', applySourceRevision]))
const oldByPath = new Map(before.map(entry => [entry.path, entry]))
const exactApplyTree = request.mutation === 'DELETE'
  ? applyEntries && applyEntries.length === before.length - 1 && !applyEntries.some(entry => entry.path === request.path) &&
    applyEntries.every(entry => sameEntry(entry, oldByPath.get(entry.path)))
  : applyEntries && applyEntries.length === before.length + (target ? 0 : 1) &&
    applyEntries.some(entry => entry.path === request.path && entry.mode === '100644' && entry.type === 'blob' && entry.oid === declarationBlob) &&
    applyEntries.every(entry => entry.path === request.path || sameEntry(entry, oldByPath.get(entry.path)))
if (!exactCommit(applySourceRevision, expected, applyTree, 'APPLY') || !exactCommit(cancelBaseSourceRevision, expected, baseTree, 'CANCEL_BASE') ||
  !exactCommit(cancelAppliedSourceRevision, applySourceRevision, baseTree, 'CANCEL_APPLIED') || !sameTree(cancelBaseSourceRevision, before) ||
  !sameTree(cancelAppliedSourceRevision, before) || !exactApplyTree) {
  finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
}
if (!ok(run(['fsck', '--strict', '--no-dangling']))) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
finish({ status: 'STAGED', projectId: request.projectId, intentId: request.intentId, oldSourceRevision: expected,
  mutation: request.mutation, baseTree, previousDeclarationBlob, applySourceRevision, cancelBaseSourceRevision, cancelAppliedSourceRevision })
`

// Inspection and ref mutation share validation of the frozen tuple. The
// operation is selected by the request file; callers never supply a mutable
// declaration or "latest" source revision to this OCI process.
const PROJECT_BINDING_INTENT_MUTATION_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { lstatSync, readFileSync, readdirSync, realpathSync } = require('node:fs')
let request
try { request = JSON.parse(readFileSync('/run/conexus/request.json', 'utf8')) } catch { process.stdout.write(JSON.stringify({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' }) + '\\n'); process.exit(0) }
const declaration = readFileSync('/run/conexus/declaration.json')
const allowedPaths = new Set(['.conexus/project/brain-binding.json', '.conexus/project/connection-bindings.json'])
const oidPattern = /^[0-9a-f]{40}$/
const identityPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const expectedDate = '946684800 +0000'
const expectedAuthor = 'author Conexus OS <source@conexus.invalid> ' + expectedDate
const expectedCommitter = 'committer Conexus OS <source@conexus.invalid> ' + expectedDate
const finish = value => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
const run = (args, input, raw) => spawnSync('/usr/local/bin/git', ['-c', 'core.hooksPath=/dev/null', '--git-dir=/repository.git', ...args], { env: {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1',
}, encoding: raw ? null : 'utf8', input })
const ok = value => !value.error && value.status === 0 && value.signal === null && (value.stderr === '' || (Buffer.isBuffer(value.stderr) && value.stderr.length === 0))
const text = value => typeof value.stdout === 'string' ? value.stdout : value.stdout.toString('utf8')
const safeRepositoryRefs = value => {
  if (!ok(value)) return false
  const refs = text(value).trim().split('\\n').filter(Boolean)
  const changeRef = new RegExp('^refs/conexus/changes/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12} commit$')
  return refs.filter(ref => ref === 'refs/heads/main commit').length === 1 && refs.every(ref =>
    ref === 'refs/heads/main commit' || changeRef.test(ref))
}
const entries = value => {
  if (!ok(value)) return null
  const output = text(value)
  if (output === '') return []
  if (!output.endsWith('\\0')) return null
  const parsed = output.slice(0, -1).split('\\0').filter(Boolean).map(line => {
    const match = /^(\\d{6}) (blob|commit|tree) ([0-9a-f]{40})\\t([\\s\\S]*)$/.exec(line)
    return match ? { mode: match[1], type: match[2], oid: match[3], path: match[4] } : null
  })
  return parsed.some(entry => entry === null) ? null : parsed
}
const sameEntry = (left, right) => left && right && left.mode === right.mode && left.type === right.type && left.oid === right.oid && left.path === right.path
const exactFile = path => { try { const stat = lstatSync(path); return stat.isFile() && !stat.isSymbolicLink() && realpathSync(path) === path } catch { return false } }
const exactDirectory = path => { try { const stat = lstatSync(path); return stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === path } catch { return false } }
const safeTreeOnce = path => { for (const entry of readdirSync(path, { withFileTypes: true })) { const child = path + '/' + entry.name; if (entry.isSymbolicLink()) return false; if (entry.isDirectory()) { if (!safeTreeOnce(child)) return false } else { const stat = lstatSync(child); if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(child) !== child) return false } } return true }
const absent = path => { try { lstatSync(path); return false } catch (error) { return error && error.code === 'ENOENT' } }
const safeRepository = () => {
  if (!exactFile('/repository.git/HEAD') || readFileSync('/repository.git/HEAD', 'utf8') !== 'ref: refs/heads/main\\n' || !exactFile('/repository.git/config') || !exactFile('/repository.git/description') || !exactDirectory('/repository.git/info') || !safeTreeOnce('/repository.git/info') || !exactDirectory('/repository.git/objects') || !exactDirectory('/repository.git/objects/info') || !exactDirectory('/repository.git/objects/pack') || !exactDirectory('/repository.git/refs') || !exactDirectory('/repository.git/refs/heads') || !exactDirectory('/repository.git/refs/tags') || !exactDirectory('/repository.git/hooks') || !safeTreeOnce('/repository.git/objects') || !safeTreeOnce('/repository.git/refs') || !safeTreeOnce('/repository.git/hooks') || !absent('/repository.git/objects/info/alternates') || !absent('/repository.git/objects/info/http-alternates')) return false
  const configuration = run(['config', '--local', '--list', '--null']); if (!ok(configuration)) return false
  const allowed = new Map([['core.repositoryformatversion', '0'], ['core.bare', 'true'], ['core.filemode', 'true'], ['core.logallrefupdates', 'true']])
  const configEntries = text(configuration).split('\\0').filter(Boolean).map(value => { const separator = value.indexOf('\\n'); return separator < 0 ? null : [value.slice(0, separator), value.slice(separator + 1)] })
  if (configEntries.length !== 3 || configEntries.some(entry => !entry || !allowed.has(entry[0]) || allowed.get(entry[0]) !== entry[1])) return false
  for (const entry of readdirSync('/repository.git/hooks', { withFileTypes: true })) if (entry.isSymbolicLink() || !entry.isFile() || (!entry.name.endsWith('.sample') && !entry.name.endsWith('.example'))) return false
  const refs = run(['for-each-ref', '--format=%(refname) %(objecttype)']); const bare = run(['rev-parse', '--is-bare-repository']); const head = run(['rev-parse', '--verify', 'refs/heads/main']);
  return safeRepositoryRefs(refs) && ok(bare) && text(bare).trim() === 'true' && ok(head) && oidPattern.test(text(head).trim()) && exactFile('/repository.git/refs/heads/main') && readFileSync('/repository.git/refs/heads/main', 'utf8') === text(head).trim() + '\\n'
}
const valid = request && typeof request === 'object' && !Array.isArray(request) && identityPattern.test(request.projectId) && identityPattern.test(request.intentId) && request.operation && ['inspect', 'apply', 'cancel'].includes(request.operation) && oidPattern.test(request.expectedSourceRevision) && request.oldSourceRevision === request.expectedSourceRevision && oidPattern.test(request.baseTree) && oidPattern.test(request.applySourceRevision) && oidPattern.test(request.cancelBaseSourceRevision) && oidPattern.test(request.cancelAppliedSourceRevision) && (request.previousDeclarationBlob === null || oidPattern.test(request.previousDeclarationBlob)) && typeof request.path === 'string' && allowedPaths.has(request.path) && ['UPSERT', 'DELETE'].includes(request.mutation) && ((request.mutation === 'UPSERT' && declaration.length > 0 && declaration.length <= 1048576) || (request.mutation === 'DELETE' && request.path === '.conexus/project/brain-binding.json' && declaration.length === 0 && request.previousDeclarationBlob !== null))
if (!valid) finish({ status: 'REFUSED', code: 'DECLARATION_REFUSED' })
if (!safeRepository()) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
if (!ok(run(['fsck', '--strict', '--no-dangling']))) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const message = purpose => 'Conexus OS Project binding intent ' + request.intentId + ' purpose ' + purpose
const exactCommit = (candidate, parent, tree, purpose) => {
  const result = run(['cat-file', 'commit', candidate]); if (!ok(result)) return false
  const lines = text(result).split('\\n'); if (lines.shift() !== 'tree ' + tree) return false
  const parents = []; while (lines.length && lines[0].startsWith('parent ')) parents.push(lines.shift().slice(7))
  if (parents.length !== 1 || parents[0] !== parent || lines.shift() !== expectedAuthor || lines.shift() !== expectedCommitter || lines.shift() !== '') return false
  return lines.join('\\n') === message(purpose) + '\\n'
}
const baseCommit = run(['cat-file', '-e', request.expectedSourceRevision + '^{commit}'])
const actualBaseTree = run(['rev-parse', '--verify', request.expectedSourceRevision + '^{tree}'])
const before = entries(run(['ls-tree', '-r', '-z', request.expectedSourceRevision]))
if (!ok(baseCommit) || !ok(actualBaseTree) || text(actualBaseTree).trim() !== request.baseTree || !before) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const oldEntry = before.find(entry => entry.path === request.path)
if ((request.previousDeclarationBlob === null && oldEntry) || (request.previousDeclarationBlob !== null && (!oldEntry || oldEntry.mode !== '100644' || oldEntry.type !== 'blob' || oldEntry.oid !== request.previousDeclarationBlob))) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
if (oldEntry && (oldEntry.mode !== '100644' || oldEntry.type !== 'blob')) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const applyEntries = entries(run(['ls-tree', '-r', '-z', request.applySourceRevision]))
const cancelBaseEntries = entries(run(['ls-tree', '-r', '-z', request.cancelBaseSourceRevision]))
const cancelAppliedEntries = entries(run(['ls-tree', '-r', '-z', request.cancelAppliedSourceRevision]))
const oldByPath = new Map(before.map(entry => [entry.path, entry]))
const completeCancellationTree = (actual) => actual && actual.length === before.length && actual.every((entry, index) => sameEntry(entry, before[index]))
const completeApplyTree = actual => request.mutation === 'DELETE'
  ? actual && actual.length === before.length - 1 && !actual.some(entry => entry.path === request.path) && actual.every(entry => sameEntry(entry, oldByPath.get(entry.path)))
  : actual && actual.length === before.length + (oldEntry ? 0 : 1) && actual.some(entry => entry.path === request.path && entry.mode === '100644' && entry.type === 'blob' && (() => { const value = run(['cat-file', 'blob', request.applySourceRevision + ':' + request.path], undefined, true); return ok(value) && value.stdout.equals(declaration) })()) && actual.every(entry => entry.path === request.path || sameEntry(entry, oldByPath.get(entry.path)))
const applyTreeResult = run(['rev-parse', '--verify', request.applySourceRevision + '^{tree}'])
const applyTree = ok(applyTreeResult) ? text(applyTreeResult).trim() : ''
if (!exactCommit(request.applySourceRevision, request.expectedSourceRevision, applyTree, 'APPLY') || !exactCommit(request.cancelBaseSourceRevision, request.expectedSourceRevision, request.baseTree, 'CANCEL_BASE') || !exactCommit(request.cancelAppliedSourceRevision, request.applySourceRevision, request.baseTree, 'CANCEL_APPLIED') || !completeCancellationTree(cancelBaseEntries) || !completeCancellationTree(cancelAppliedEntries) || !completeApplyTree(applyEntries)) finish({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
const headResult = run(['rev-parse', '--verify', 'refs/heads/main']); const head = ok(headResult) ? text(headResult).trim() : ''
if (!oidPattern.test(head)) finish({ status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
const state = head === request.expectedSourceRevision ? 'BASE' : head === request.applySourceRevision ? 'APPLIED' : head === request.cancelBaseSourceRevision ? 'CANCELLED_BASE' : head === request.cancelAppliedSourceRevision ? 'CANCELLED_APPLIED' : 'CONFLICT'
if (request.operation === 'inspect') finish(state === 'CONFLICT' ? { status: 'CONFLICT', head } : { status: state, head })
if (request.operation === 'apply') {
  if (state === 'APPLIED') finish({ status: 'APPLIED', oldSourceRevision: request.expectedSourceRevision, newSourceRevision: request.applySourceRevision })
  if (state !== 'BASE') finish({ status: 'CONFLICT', expectedSourceRevision: request.expectedSourceRevision, actualSourceRevision: head })
  const updated = run(['update-ref', 'refs/heads/main', request.applySourceRevision, request.expectedSourceRevision]); const after = run(['rev-parse', '--verify', 'refs/heads/main']); const actual = ok(after) ? text(after).trim() : ''
  if (actual === request.applySourceRevision) finish({ status: 'APPLIED', oldSourceRevision: request.expectedSourceRevision, newSourceRevision: request.applySourceRevision })
  if (oidPattern.test(actual)) finish({ status: 'CONFLICT', expectedSourceRevision: request.expectedSourceRevision, actualSourceRevision: actual })
  finish(updated && !ok(updated) ? { status: 'REFUSED', code: 'GIT_PROCESS_FAILED' } : { status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
}
if (state === 'CANCELLED_BASE') finish({ status: 'CANCELLED_BASE', oldSourceRevision: request.expectedSourceRevision, newSourceRevision: request.cancelBaseSourceRevision })
if (state === 'CANCELLED_APPLIED') finish({ status: 'CANCELLED_APPLIED', oldSourceRevision: request.applySourceRevision, newSourceRevision: request.cancelAppliedSourceRevision })
const cancellationTarget = state === 'BASE' ? request.cancelBaseSourceRevision : state === 'APPLIED' ? request.cancelAppliedSourceRevision : null
const cancellationParent = state === 'BASE' ? request.expectedSourceRevision : state === 'APPLIED' ? request.applySourceRevision : null
if (!cancellationTarget || !cancellationParent) finish({ status: 'CONFLICT', expectedSourceRevision: request.expectedSourceRevision, actualSourceRevision: head })
const updated = run(['update-ref', 'refs/heads/main', cancellationTarget, cancellationParent]); const after = run(['rev-parse', '--verify', 'refs/heads/main']); const actual = ok(after) ? text(after).trim() : ''
if (actual === request.cancelBaseSourceRevision) finish({ status: 'CANCELLED_BASE', oldSourceRevision: request.expectedSourceRevision, newSourceRevision: request.cancelBaseSourceRevision })
if (actual === request.cancelAppliedSourceRevision) finish({ status: 'CANCELLED_APPLIED', oldSourceRevision: request.applySourceRevision, newSourceRevision: request.cancelAppliedSourceRevision })
if (oidPattern.test(actual)) finish({ status: 'CONFLICT', expectedSourceRevision: cancellationParent, actualSourceRevision: actual })
finish(!ok(updated) ? { status: 'REFUSED', code: 'GIT_PROCESS_FAILED' } : { status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
`

const PROJECT_BINDING_INTENT_INSPECT_PROGRAM = PROJECT_BINDING_INTENT_MUTATION_PROGRAM
const PROJECT_BINDING_INTENT_APPLY_PROGRAM = PROJECT_BINDING_INTENT_MUTATION_PROGRAM
const PROJECT_BINDING_INTENT_CANCEL_PROGRAM = PROJECT_BINDING_INTENT_MUTATION_PROGRAM

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

export const PROJECT_BINDING_DECLARATION_PATHS = Object.freeze([
  '.conexus/project/brain-binding.json',
  '.conexus/project/connection-bindings.json',
] as const)
export type ProjectBindingDeclarationPath = typeof PROJECT_BINDING_DECLARATION_PATHS[number]
export type ProjectBindingGitInput = Readonly<{
  projectId: string
  expectedSourceRevision: string
  path: ProjectBindingDeclarationPath
  declarationBytes: Readonly<Uint8Array>
}>
export type ProjectBindingGitResult = Readonly<
  | { status: 'APPLIED'; oldSourceRevision: string; newSourceRevision: string }
  | { status: 'CONFLICT'; expectedSourceRevision: string; actualSourceRevision: string }
  | { status: 'REFUSED'; code: 'IMAGE_NOT_VERIFIED' | 'IDENTITY_REFUSED' | 'STORAGE_ROOT_REFUSED' | 'DECLARATION_REFUSED' | 'UNSAFE_REPOSITORY' | 'GIT_PROCESS_FAILED' | 'GIT_RESULT_REFUSED' }
>
export type ProjectBindingGitCapability = Readonly<{
  applyProjectBinding(input: ProjectBindingGitInput): Promise<ProjectBindingGitResult>
}>

type ProjectBindingIntentCommon = Readonly<{
  projectId: string
  intentId: string
  expectedSourceRevision: string
  path: ProjectBindingDeclarationPath
  expectedDeclarations?: readonly Readonly<{
    path: ProjectBindingDeclarationPath
    digest: string | null
    allowAbsent: boolean
  }>[]
}>
export type ProjectBindingIntentInput = ProjectBindingIntentCommon & Readonly<
  | { mutation?: 'UPSERT'; declarationBytes: Readonly<Uint8Array> }
  | { mutation: 'DELETE'; declarationBytes: Readonly<Uint8Array> }
>
export type ProjectBindingIntentStage = Readonly<ProjectBindingIntentInput & {
  status: 'STAGED'
  mutation: 'UPSERT' | 'DELETE'
  oldSourceRevision: string
  baseTree: string
  previousDeclarationBlob: string | null
  applySourceRevision: string
  cancelBaseSourceRevision: string
  cancelAppliedSourceRevision: string
}>
export type ProjectBindingIntentFrozenInput = ProjectBindingIntentStage
export type ProjectBindingIntentConflict = Readonly<{
  status: 'CONFLICT'
  expectedSourceRevision: string
  actualSourceRevision: string
}>
export type ProjectBindingIntentInspection = Readonly<
  | { status: 'BASE' | 'APPLIED' | 'CANCELLED_BASE' | 'CANCELLED_APPLIED'; head: string }
  | { status: 'CONFLICT'; head: string }
>
export type ProjectBindingIntentMutation = Readonly<
  | { status: 'APPLIED'; oldSourceRevision: string; newSourceRevision: string }
  | { status: 'CANCELLED_BASE' | 'CANCELLED_APPLIED'; oldSourceRevision: string; newSourceRevision: string }
  | ProjectBindingIntentConflict
  | { status: 'REFUSED'; code: 'IMAGE_NOT_VERIFIED' | 'IDENTITY_REFUSED' | 'STORAGE_ROOT_REFUSED' | 'DECLARATION_REFUSED' | 'UNSAFE_REPOSITORY' | 'GIT_PROCESS_FAILED' | 'GIT_RESULT_REFUSED' | 'SOURCE_DB_DIVERGENCE' }
>
export type ProjectBindingRecoveryGitCapability = Readonly<{
  stageProjectBindingIntent(input: ProjectBindingIntentInput): Promise<ProjectBindingIntentStage | ProjectBindingIntentConflict | Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>>
  inspectProjectBindingIntent(input: ProjectBindingIntentFrozenInput): Promise<ProjectBindingIntentInspection | Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>>
  applyProjectBindingIntent(input: ProjectBindingIntentFrozenInput): Promise<Extract<ProjectBindingIntentMutation, { status: 'APPLIED' | 'CONFLICT' | 'REFUSED' }>>
  cancelProjectBindingIntent(input: ProjectBindingIntentFrozenInput): Promise<Extract<ProjectBindingIntentMutation, { status: 'CANCELLED_BASE' | 'CANCELLED_APPLIED' | 'CONFLICT' | 'REFUSED' }>>
}>

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

const canonicalProjectBindingBytes = (value: unknown): Buffer | null => {
  if (!(value instanceof Uint8Array)) return null
  const bytes = Buffer.from(value)
  if (bytes.length === 0 || bytes.length > 1_048_576) return null
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const value = JSON.parse(text) as unknown
    const canonical = canonicalBytes(value)
    return bytes.equals(canonical) ? bytes : null
  } catch {
    return null
  }
}

/**
 * Create the Project-owned binding declaration mutation capability. This
 * intentionally does not extend GitExecutionPort: source custody and binding
 * settlement have different callers and mutation authority.
 */
export function createOciProjectBindingGitCapability(
  options: Readonly<{ projectStorageRoot?: string }> = {},
  runProcess: ProcessRunner = boundedProcess,
): ProjectBindingGitCapability & ProjectBindingRecoveryGitCapability {
  const sourceGit = createOciGitExecutionPort(options, runProcess)

  const applyProjectBinding = async (input: ProjectBindingGitInput): Promise<ProjectBindingGitResult> => {
    if ((await sourceGit.verifyAdmittedImage()).status !== 'VERIFIED') {
      return Object.freeze({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' })
    }
    if (!isProjectIdentity(input.projectId) || !/^[0-9a-f]{40}$/.test(input.expectedSourceRevision) ||
      !PROJECT_BINDING_DECLARATION_PATHS.includes(input.path)) {
      return Object.freeze({ status: 'REFUSED', code: 'IDENTITY_REFUSED' })
    }
    const bytes = canonicalProjectBindingBytes(input.declarationBytes)
    if (!bytes) return Object.freeze({ status: 'REFUSED', code: 'DECLARATION_REFUSED' })

    if (!options.projectStorageRoot || !isAbsolute(options.projectStorageRoot) ||
      options.projectStorageRoot.includes(',') || options.projectStorageRoot.includes(':')) {
      return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    }
    const root = resolve(options.projectStorageRoot)
    if (!await exactDirectory(root)) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    const projectsRoot = resolve(root, 'projects')
    const canonicalRoot = resolve(projectsRoot, input.projectId)
    if (!await exactDirectory(projectsRoot) || !canonicalRoot.startsWith(`${projectsRoot}${sep}`) ||
      !await exactDirectory(canonicalRoot)) {
      return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
    }

    let requestRoot: string | null = null
    try {
      requestRoot = await mkdtemp(resolve(root, '.conexus-project-binding-'))
      if (!await exactDirectory(requestRoot)) return Object.freeze({ status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
      const requestPath = resolve(requestRoot, 'request.json')
      const declarationPath = resolve(requestRoot, 'declaration.json')
      await writeFile(requestPath, `${JSON.stringify({
        expectedSourceRevision: input.expectedSourceRevision,
        path: input.path,
      })}\n`, { flag: 'wx', mode: 0o400 })
      await writeFile(declarationPath, bytes, { flag: 'wx', mode: 0o400 })
      const result = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        ...HARDENED_RUN, '--user', CONTAINER_USER,
        '--mount', `type=bind,src=${canonicalRoot},dst=/repository.git`,
        '--mount', `type=bind,src=${requestPath},dst=/run/conexus/request.json,readonly`,
        '--mount', `type=bind,src=${declarationPath},dst=/run/conexus/declaration.json,readonly`,
        '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest,
        '-e', PROJECT_BINDING_CAS_PROGRAM,
      ]))
      if (!passed(result)) return Object.freeze({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
      let parsed: unknown
      try {
        parsed = JSON.parse(result.stdout)
      } catch {
        return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('status' in parsed)) {
        return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
      }
      if (parsed.status === 'APPLIED' && 'oldSourceRevision' in parsed && parsed.oldSourceRevision === input.expectedSourceRevision &&
        'newSourceRevision' in parsed && typeof parsed.newSourceRevision === 'string' && /^[0-9a-f]{40}$/.test(parsed.newSourceRevision)) {
        return Object.freeze({ status: 'APPLIED', oldSourceRevision: parsed.oldSourceRevision, newSourceRevision: parsed.newSourceRevision })
      }
      if (parsed.status === 'CONFLICT' && 'expectedSourceRevision' in parsed && parsed.expectedSourceRevision === input.expectedSourceRevision &&
        'actualSourceRevision' in parsed && typeof parsed.actualSourceRevision === 'string' && /^[0-9a-f]{40}$/.test(parsed.actualSourceRevision)) {
        return Object.freeze({ status: 'CONFLICT', expectedSourceRevision: parsed.expectedSourceRevision, actualSourceRevision: parsed.actualSourceRevision })
      }
      const refusalCodes = new Set(['DECLARATION_REFUSED', 'UNSAFE_REPOSITORY', 'GIT_PROCESS_FAILED', 'GIT_RESULT_REFUSED'])
      if (parsed.status === 'REFUSED' && 'code' in parsed && typeof parsed.code === 'string' && refusalCodes.has(parsed.code)) {
        return Object.freeze({ status: 'REFUSED', code: parsed.code as 'DECLARATION_REFUSED' })
      }
      return Object.freeze({ status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
    } catch {
      return Object.freeze({ status: 'REFUSED', code: 'GIT_PROCESS_FAILED' })
    } finally {
      if (requestRoot) await rm(requestRoot, { recursive: true, force: true })
    }
  }

  const intentRefusal = (code: Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>['code']): Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }> =>
    Object.freeze({ status: 'REFUSED', code })

  const intentIdentityValid = (input: ProjectBindingIntentInput): boolean =>
    Boolean(input && typeof input === 'object' && isProjectIdentity(input.projectId) && isProjectIdentity(input.intentId) &&
      /^[0-9a-f]{40}$/.test(input.expectedSourceRevision) && PROJECT_BINDING_DECLARATION_PATHS.includes(input.path))

  const intentMutation = (input: ProjectBindingIntentInput): 'UPSERT' | 'DELETE' => input.mutation ?? 'UPSERT'

  const intentInputValid = (input: ProjectBindingIntentInput): boolean =>
    intentIdentityValid(input) && (intentMutation(input) === 'DELETE'
      ? input.path === '.conexus/project/brain-binding.json' && input.declarationBytes.byteLength === 0
      : canonicalProjectBindingBytes(input.declarationBytes) !== null)

  const intentTupleValid = (input: ProjectBindingIntentFrozenInput): boolean =>
    intentInputValid(input) &&
    input.status === 'STAGED' && input.oldSourceRevision === input.expectedSourceRevision &&
    /^[0-9a-f]{40}$/.test(input.baseTree) &&
    (input.previousDeclarationBlob === null || /^[0-9a-f]{40}$/.test(input.previousDeclarationBlob)) &&
    /^[0-9a-f]{40}$/.test(input.applySourceRevision) &&
    /^[0-9a-f]{40}$/.test(input.cancelBaseSourceRevision) &&
    /^[0-9a-f]{40}$/.test(input.cancelAppliedSourceRevision)

  const intentRepository = async (projectId: string): Promise<{ root: string; repositoryRoot: string } | null> => {
    if (!options.projectStorageRoot || !isAbsolute(options.projectStorageRoot) ||
      options.projectStorageRoot.includes(',') || options.projectStorageRoot.includes(':') || !isProjectIdentity(projectId)) return null
    const root = resolve(options.projectStorageRoot)
    const projectsRoot = resolve(root, 'projects')
    const repositoryRoot = resolve(projectsRoot, projectId)
    if (!await exactDirectory(root) || !await exactDirectory(projectsRoot) ||
      !repositoryRoot.startsWith(`${projectsRoot}${sep}`) || !await exactDirectory(repositoryRoot)) return null
    return { root, repositoryRoot }
  }

  const invokeIntentProgram = async (
    program: string,
    operation: 'stage' | 'inspect' | 'apply' | 'cancel',
    input: ProjectBindingIntentInput & Partial<Omit<ProjectBindingIntentStage, keyof ProjectBindingIntentInput | 'status'>>,
  ): Promise<unknown | null> => {
    const repository = await intentRepository(input.projectId)
    if (!repository) return { status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' }
    let requestRoot: string | null = null
    try {
      requestRoot = await mkdtemp(resolve(repository.root, '.conexus-project-binding-intent-'))
      if (!await exactDirectory(requestRoot)) return { status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' }
      const requestPath = resolve(requestRoot, 'request.json')
      const declarationPath = resolve(requestRoot, 'declaration.json')
      const request = {
        projectId: input.projectId,
        intentId: input.intentId,
        expectedSourceRevision: input.expectedSourceRevision,
        path: input.path,
        mutation: intentMutation(input),
        ...(operation === 'stage' ? { expectedDeclarations: input.expectedDeclarations } : {
          operation,
          oldSourceRevision: input.oldSourceRevision,
          baseTree: input.baseTree,
          previousDeclarationBlob: input.previousDeclarationBlob,
          applySourceRevision: input.applySourceRevision,
          cancelBaseSourceRevision: input.cancelBaseSourceRevision,
          cancelAppliedSourceRevision: input.cancelAppliedSourceRevision,
        }),
      }
      await writeFile(requestPath, `${JSON.stringify(request)}\n`, { flag: 'wx', mode: 0o400 })
      await writeFile(declarationPath, Buffer.from(input.declarationBytes), { flag: 'wx', mode: 0o400 })
      const result = await runProcess(DOCKER_EXECUTABLE, Object.freeze([
        ...HARDENED_RUN, '--user', CONTAINER_USER,
        '--mount', `type=bind,src=${repository.repositoryRoot},dst=/repository.git`,
        '--mount', `type=bind,src=${requestPath},dst=/run/conexus/request.json,readonly`,
        '--mount', `type=bind,src=${declarationPath},dst=/run/conexus/declaration.json,readonly`,
        '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest,
        '-e', program,
      ]))
      if (!passed(result)) return { status: 'REFUSED', code: 'GIT_PROCESS_FAILED' }
      try { return JSON.parse(result.stdout) as unknown } catch { return { status: 'REFUSED', code: 'GIT_RESULT_REFUSED' } }
    } catch {
      return { status: 'REFUSED', code: 'GIT_PROCESS_FAILED' }
    } finally {
      if (requestRoot) await rm(requestRoot, { recursive: true, force: true })
    }
  }

  const stageProjectBindingIntent = async (input: ProjectBindingIntentInput): Promise<ProjectBindingIntentStage | ProjectBindingIntentConflict | Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>> => {
    if ((await sourceGit.verifyAdmittedImage()).status !== 'VERIFIED') return intentRefusal('IMAGE_NOT_VERIFIED')
    if (!intentIdentityValid(input)) return intentRefusal('IDENTITY_REFUSED')
    const mutation = intentMutation(input)
    const bytes = mutation === 'DELETE' ? Buffer.alloc(0) : canonicalProjectBindingBytes(input.declarationBytes)
    if (!intentInputValid(input) || !bytes) return intentRefusal('DECLARATION_REFUSED')
    const normalized = { ...input, mutation, declarationBytes: bytes } as ProjectBindingIntentInput
    const parsed = await invokeIntentProgram(PROJECT_BINDING_INTENT_STAGE_PROGRAM, 'stage', normalized)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('status' in parsed)) return intentRefusal('GIT_RESULT_REFUSED')
    if (parsed.status === 'REFUSED' && 'code' in parsed && typeof parsed.code === 'string' && ['STORAGE_ROOT_REFUSED', 'DECLARATION_REFUSED', 'UNSAFE_REPOSITORY', 'GIT_PROCESS_FAILED', 'GIT_RESULT_REFUSED', 'SOURCE_DB_DIVERGENCE'].includes(parsed.code)) {
      return intentRefusal(parsed.code as Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>['code'])
    }
    if (parsed.status === 'CONFLICT' && 'expectedSourceRevision' in parsed && parsed.expectedSourceRevision === input.expectedSourceRevision &&
      'actualSourceRevision' in parsed && typeof parsed.actualSourceRevision === 'string' && /^[0-9a-f]{40}$/.test(parsed.actualSourceRevision)) {
      return Object.freeze({ status: 'CONFLICT', expectedSourceRevision: parsed.expectedSourceRevision, actualSourceRevision: parsed.actualSourceRevision })
    }
    if (parsed.status !== 'STAGED' || !('projectId' in parsed) || parsed.projectId !== input.projectId || !('intentId' in parsed) || parsed.intentId !== input.intentId ||
      !('mutation' in parsed) || parsed.mutation !== mutation ||
      !('oldSourceRevision' in parsed) || parsed.oldSourceRevision !== input.expectedSourceRevision ||
      !('baseTree' in parsed) || typeof parsed.baseTree !== 'string' || !/^[0-9a-f]{40}$/.test(parsed.baseTree) ||
      !('previousDeclarationBlob' in parsed) || (parsed.previousDeclarationBlob !== null && (typeof parsed.previousDeclarationBlob !== 'string' || !/^[0-9a-f]{40}$/.test(parsed.previousDeclarationBlob))) ||
      !('applySourceRevision' in parsed) || typeof parsed.applySourceRevision !== 'string' || !/^[0-9a-f]{40}$/.test(parsed.applySourceRevision) ||
      !('cancelBaseSourceRevision' in parsed) || typeof parsed.cancelBaseSourceRevision !== 'string' || !/^[0-9a-f]{40}$/.test(parsed.cancelBaseSourceRevision) ||
      !('cancelAppliedSourceRevision' in parsed) || typeof parsed.cancelAppliedSourceRevision !== 'string' || !/^[0-9a-f]{40}$/.test(parsed.cancelAppliedSourceRevision)) {
      return intentRefusal('GIT_RESULT_REFUSED')
    }
    if (mutation === 'DELETE' && parsed.previousDeclarationBlob === null) return intentRefusal('GIT_RESULT_REFUSED')
    return Object.freeze({
      status: 'STAGED', projectId: input.projectId, intentId: input.intentId,
      expectedSourceRevision: input.expectedSourceRevision, path: input.path,
      mutation, declarationBytes: Uint8Array.from(bytes), oldSourceRevision: parsed.oldSourceRevision,
      baseTree: parsed.baseTree, previousDeclarationBlob: parsed.previousDeclarationBlob,
      applySourceRevision: parsed.applySourceRevision, cancelBaseSourceRevision: parsed.cancelBaseSourceRevision,
      cancelAppliedSourceRevision: parsed.cancelAppliedSourceRevision,
    })
  }

  const inspectProjectBindingIntent = async (input: ProjectBindingIntentFrozenInput): Promise<ProjectBindingIntentInspection | Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>> => {
    if ((await sourceGit.verifyAdmittedImage()).status !== 'VERIFIED') return intentRefusal('IMAGE_NOT_VERIFIED')
    if (!intentIdentityValid(input)) return intentRefusal('IDENTITY_REFUSED')
    if (!intentInputValid(input)) return intentRefusal('DECLARATION_REFUSED')
    if (!intentTupleValid(input)) return intentRefusal('GIT_RESULT_REFUSED')
    const parsed = await invokeIntentProgram(PROJECT_BINDING_INTENT_INSPECT_PROGRAM, 'inspect', input)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('status' in parsed)) return intentRefusal('GIT_RESULT_REFUSED')
    if (parsed.status === 'REFUSED' && 'code' in parsed && typeof parsed.code === 'string' && ['STORAGE_ROOT_REFUSED', 'DECLARATION_REFUSED', 'UNSAFE_REPOSITORY', 'GIT_PROCESS_FAILED', 'GIT_RESULT_REFUSED'].includes(parsed.code)) {
      return intentRefusal(parsed.code as Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>['code'])
    }
    if (!('head' in parsed) || typeof parsed.head !== 'string' || !/^[0-9a-f]{40}$/.test(parsed.head)) return intentRefusal('GIT_RESULT_REFUSED')
    if (parsed.status === 'CONFLICT') return Object.freeze({ status: 'CONFLICT', head: parsed.head })
    if (parsed.status === 'BASE' || parsed.status === 'APPLIED' || parsed.status === 'CANCELLED_BASE' || parsed.status === 'CANCELLED_APPLIED') return Object.freeze({ status: parsed.status, head: parsed.head })
    return intentRefusal('GIT_RESULT_REFUSED')
  }

  const applyProjectBindingIntent = async (input: ProjectBindingIntentFrozenInput): Promise<Extract<ProjectBindingIntentMutation, { status: 'APPLIED' | 'CONFLICT' | 'REFUSED' }>> => {
    if ((await sourceGit.verifyAdmittedImage()).status !== 'VERIFIED') return intentRefusal('IMAGE_NOT_VERIFIED')
    if (!intentIdentityValid(input)) return intentRefusal('IDENTITY_REFUSED')
    if (!intentInputValid(input)) return intentRefusal('DECLARATION_REFUSED')
    if (!intentTupleValid(input)) return intentRefusal('GIT_RESULT_REFUSED')
    const parsed = await invokeIntentProgram(PROJECT_BINDING_INTENT_APPLY_PROGRAM, 'apply', input)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('status' in parsed)) return intentRefusal('GIT_RESULT_REFUSED')
    if (parsed.status === 'APPLIED' && 'oldSourceRevision' in parsed && parsed.oldSourceRevision === input.expectedSourceRevision && 'newSourceRevision' in parsed && parsed.newSourceRevision === input.applySourceRevision) return Object.freeze({ status: 'APPLIED', oldSourceRevision: parsed.oldSourceRevision, newSourceRevision: parsed.newSourceRevision })
    if (parsed.status === 'CONFLICT' && 'expectedSourceRevision' in parsed && parsed.expectedSourceRevision === input.expectedSourceRevision && 'actualSourceRevision' in parsed && typeof parsed.actualSourceRevision === 'string' && /^[0-9a-f]{40}$/.test(parsed.actualSourceRevision)) return Object.freeze({ status: 'CONFLICT', expectedSourceRevision: parsed.expectedSourceRevision, actualSourceRevision: parsed.actualSourceRevision })
    if (parsed.status === 'REFUSED' && 'code' in parsed && typeof parsed.code === 'string' && ['STORAGE_ROOT_REFUSED', 'DECLARATION_REFUSED', 'UNSAFE_REPOSITORY', 'GIT_PROCESS_FAILED', 'GIT_RESULT_REFUSED'].includes(parsed.code)) return intentRefusal(parsed.code as Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>['code'])
    return intentRefusal('GIT_RESULT_REFUSED')
  }

  const cancelProjectBindingIntent = async (input: ProjectBindingIntentFrozenInput): Promise<Extract<ProjectBindingIntentMutation, { status: 'CANCELLED_BASE' | 'CANCELLED_APPLIED' | 'CONFLICT' | 'REFUSED' }>> => {
    if ((await sourceGit.verifyAdmittedImage()).status !== 'VERIFIED') return intentRefusal('IMAGE_NOT_VERIFIED')
    if (!intentIdentityValid(input)) return intentRefusal('IDENTITY_REFUSED')
    if (!intentInputValid(input)) return intentRefusal('DECLARATION_REFUSED')
    if (!intentTupleValid(input)) return intentRefusal('GIT_RESULT_REFUSED')
    const parsed = await invokeIntentProgram(PROJECT_BINDING_INTENT_CANCEL_PROGRAM, 'cancel', input)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('status' in parsed)) return intentRefusal('GIT_RESULT_REFUSED')
    if ((parsed.status === 'CANCELLED_BASE' || parsed.status === 'CANCELLED_APPLIED') && 'oldSourceRevision' in parsed && 'newSourceRevision' in parsed && typeof parsed.oldSourceRevision === 'string' && typeof parsed.newSourceRevision === 'string' && ((parsed.status === 'CANCELLED_BASE' && parsed.oldSourceRevision === input.expectedSourceRevision && parsed.newSourceRevision === input.cancelBaseSourceRevision) || (parsed.status === 'CANCELLED_APPLIED' && parsed.oldSourceRevision === input.applySourceRevision && parsed.newSourceRevision === input.cancelAppliedSourceRevision))) return Object.freeze({ status: parsed.status, oldSourceRevision: parsed.oldSourceRevision, newSourceRevision: parsed.newSourceRevision })
    if (parsed.status === 'CONFLICT' && 'expectedSourceRevision' in parsed && typeof parsed.expectedSourceRevision === 'string' && 'actualSourceRevision' in parsed && typeof parsed.actualSourceRevision === 'string' && /^[0-9a-f]{40}$/.test(parsed.actualSourceRevision)) return Object.freeze({ status: 'CONFLICT', expectedSourceRevision: parsed.expectedSourceRevision, actualSourceRevision: parsed.actualSourceRevision })
    if (parsed.status === 'REFUSED' && 'code' in parsed && typeof parsed.code === 'string' && ['STORAGE_ROOT_REFUSED', 'DECLARATION_REFUSED', 'UNSAFE_REPOSITORY', 'GIT_PROCESS_FAILED', 'GIT_RESULT_REFUSED'].includes(parsed.code)) return intentRefusal(parsed.code as Extract<ProjectBindingIntentMutation, { status: 'REFUSED' }>['code'])
    return intentRefusal('GIT_RESULT_REFUSED')
  }

  return Object.freeze({ applyProjectBinding, stageProjectBindingIntent, inspectProjectBindingIntent, applyProjectBindingIntent, cancelProjectBindingIntent })
}
