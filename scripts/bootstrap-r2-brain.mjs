import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import canonicalize from 'canonicalize'
import pg from 'pg'
import { validateBrainHealth, validateBrainSource } from '../packages/brain-contract/src/index.mjs'

export { validateBrainHealth, validateBrainSource } from '../packages/brain-contract/src/index.mjs'
export const R2_BRAIN_GIT_IDENTITY = Object.freeze({
  ociIndexDigest: 'sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851',
  gitVersion: '2.55.0',
  gitExecutablePath: '/usr/local/bin/git',
  gitExecutableSha256: 'b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201',
})
const GIT_IMAGE = R2_BRAIN_GIT_IDENTITY.ociIndexDigest
const GIT_VERSION = `git version ${R2_BRAIN_GIT_IDENTITY.gitVersion}`
const GIT_PATH = R2_BRAIN_GIT_IDENTITY.gitExecutablePath
const GIT_SHA256 = R2_BRAIN_GIT_IDENTITY.gitExecutableSha256
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MAX_SOURCE_BYTES = 1_048_576
const MAX_HEALTH_BYTES = 262_144
const MAX_ADMISSION_BYTES = 65_536
const utf8 = new TextDecoder('utf-8', { fatal: true })
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const fail = (code) => { throw new Error(code) }
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value) => typeof value === 'string' && /\S/.test(value)
const exactKeys = (value, expected) => Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')

const forbiddenBrainContent = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:password|client[_-]?secret|access[_-]?token|api[_-]?key|x-token)\b\s*[:=]/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /custom[_ ]instructions|ignore (?:all|any|the) previous|system prompt|developer message|execute (?:a )?(?:shell|command)|call (?:a )?tool/i,
]

const assertBrainContentAdmissible = (source) => {
  const projection = canonicalize(source)
  if (forbiddenBrainContent.some((pattern) => pattern.test(projection))) fail('BRAIN_CONTENT_ADMISSION_REFUSED')
}

export const validateBrainAdmission = (admission, brainDigest) => {
  if (!record(admission) || !exactKeys(admission, [
    'schemaVersion', 'brainDigest', 'contentSource', 'piiLint', 'secretScan', 'humanReview',
  ]) || admission.schemaVersion !== 'conexus-brain-admission/v1' || admission.brainDigest !== brainDigest ||
    admission.contentSource !== 'SYNTHETIC' || admission.piiLint !== 'PASS' || admission.secretScan !== 'PASS' ||
    !record(admission.humanReview) || !exactKeys(admission.humanReview, ['decision', 'reviewerRef', 'reviewedAt']) ||
    admission.humanReview.decision !== 'APPROVED' || !text(admission.humanReview.reviewerRef) ||
    !text(admission.humanReview.reviewedAt)) fail('BRAIN_ADMISSION_RECEIPT_REFUSED')
  const reviewedAt = new Date(admission.humanReview.reviewedAt)
  if (!Number.isFinite(reviewedAt.valueOf()) || reviewedAt.toISOString() !== admission.humanReview.reviewedAt) {
    fail('BRAIN_ADMISSION_RECEIPT_REFUSED')
  }
  return admission
}

const readExactFile = (path, code, maxBytes = Number.MAX_SAFE_INTEGER, ownerOnly = false) => {
  const exactPath = resolve(path)
  let descriptor
  try {
    descriptor = openSync(exactPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(descriptor)
    const mode = stat.mode & 0o777
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes || realpathSync(`/proc/self/fd/${descriptor}`) !== exactPath ||
      (ownerOnly && ((mode !== 0o400 && mode !== 0o600) || stat.nlink !== 1 ||
        (process.getuid && stat.uid !== process.getuid())))) fail(code)
    return { bytes: readFileSync(descriptor), stat }
  } catch (error) {
    if (error instanceof Error && error.message === code) throw error
    fail(code)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

const decodeJsonFile = (path, code, maxBytes) => {
  const { bytes } = readExactFile(path, code, maxBytes, true)
  try { return JSON.parse(utf8.decode(bytes)) } catch { fail(code) }
}

const exactDirectory = (path, code, ownerOnly = false) => {
  if (!isAbsolute(path) || !existsSync(path)) fail(code)
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) fail(code)
  if (ownerOnly && (((stat.mode & 0o777) !== 0o700) || (process.getuid && stat.uid !== process.getuid()))) fail(code)
  return path
}

const isNested = (parent, child) => {
  const candidate = relative(parent, child)
  return candidate !== '' && candidate !== '..' && !candidate.startsWith('../') && !isAbsolute(candidate)
}

const parseMountInfo = (contents, code) => {
  const decode = (value) => value.replace(/\\([0-7]{3})/g, (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8)))
  try {
    return contents.trim().split('\n').map((row) => {
    const fields = row.split(' - ')[0].split(' ')
      if (fields.length < 5) fail(code)
    return { device: fields[2], root: decode(fields[3]), mountPoint: decode(fields[4]) }
    })
  } catch { fail(code) }
}

const readMountInfo = (code) => {
  try { return parseMountInfo(readFileSync('/proc/self/mountinfo', 'utf8'), code) } catch { fail(code) }
}

export const nestedMountPoints = (root, mountInfo) => parseMountInfo(mountInfo, 'BRAIN_STORAGE_ROOT_REFUSED')
  .filter(({ mountPoint }) => mountPoint !== root && isNested(root, mountPoint))
  .map(({ mountPoint }) => mountPoint)
  .sort()

const mountCoordinate = (path, code) => {
  const matches = readMountInfo(code).filter(({ mountPoint }) => mountPoint === path || isNested(mountPoint, path))
    .sort((left, right) => right.mountPoint.length - left.mountPoint.length)
  const mount = matches[0]
  if (!mount) fail(code)
  return { device: mount.device, path: resolve(mount.root, relative(mount.mountPoint, path)) }
}

const fsyncDirectory = (path, code) => {
  let descriptor
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    fsyncSync(descriptor)
  } catch { fail(code) } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

const ensureExactChildDirectory = (parent, name, code) => {
  const path = resolve(parent, name)
  if (!isNested(parent, path)) fail(code)
  if (!existsSync(path)) {
    mkdirSync(path, { mode: 0o700 })
    fsyncDirectory(parent, code)
  }
  return exactDirectory(path, code, true)
}

const docker = (args, input) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, timeout: 60_000, maxBuffer: 16_384 })
  if (result.error || result.signal || result.status !== 0 || result.stderr !== '') fail('BRAIN_GIT_PROCESS_REFUSED')
  return result.stdout.trim()
}

const runContainer = (options, input) => {
  const name = `conexus-r2-brain-${process.pid}-${randomUUID()}`
  let created = false
  try {
    docker(['create', '--name', name, ...(input ? ['--interactive'] : []), ...options])
    created = true
    return docker(['start', '--attach', ...(input ? ['--interactive'] : []), name], input)
  } finally {
    if (created) docker(['rm', '--force', name])
  }
}

const gitObjectIdentity = (kind, body) => {
  const encoded = Buffer.concat([Buffer.from(`${kind} ${body.length}\0`), body])
  return { id: createHash('sha1').update(encoded).digest('hex'), encoded }
}

const expectedBrainGit = (canonicalBytes) => {
  const blob = gitObjectIdentity('blob', canonicalBytes)
  const brainTreeBody = Buffer.concat([Buffer.from('100644 brain.json\0'), Buffer.from(blob.id, 'hex')])
  const brainTree = gitObjectIdentity('tree', brainTreeBody)
  const rootTreeBody = Buffer.concat([Buffer.from('40000 .conexus\0'), Buffer.from(brainTree.id, 'hex')])
  const rootTree = gitObjectIdentity('tree', rootTreeBody)
  const commitBody = Buffer.from(`tree ${rootTree.id}\nauthor Conexus OS <brain@conexus.invalid> 946684800 +0000\ncommitter Conexus OS <brain@conexus.invalid> 946684800 +0000\n\nConexus OS canonical Workspace Brain\n`)
  const commit = gitObjectIdentity('commit', commitBody)
  return { blob, brainTree, brainTreeBody, rootTree, rootTreeBody, commit, commitBody }
}

const exactGitDirectory = (path) => {
  const directory = exactDirectory(path, 'BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
  const stat = lstatSync(directory)
  if ((stat.mode & 0o022) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
    fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
  }
  return directory
}

const readLocalGitFile = (path, maxBytes) => {
  const result = readExactFile(path, 'BRAIN_GIT_LOCAL_CUSTODY_REFUSED', maxBytes)
  if (result.stat.nlink !== 1 || (result.stat.mode & 0o022) !== 0 ||
    (process.getuid && result.stat.uid !== process.getuid())) fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
  return result.bytes
}

const readLooseGitObject = (repository, objectId, kind) => {
  const compressed = readLocalGitFile(resolve(repository, 'objects', objectId.slice(0, 2), objectId.slice(2)),
    MAX_SOURCE_BYTES + 4_096)
  let encoded
  try { encoded = inflateSync(compressed) } catch { fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED') }
  const separator = encoded.indexOf(0)
  const header = separator === -1 ? '' : encoded.subarray(0, separator).toString('utf8')
  const body = separator === -1 ? Buffer.alloc(0) : encoded.subarray(separator + 1)
  if (header !== `${kind} ${body.length}` || createHash('sha1').update(encoded).digest('hex') !== objectId) {
    fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
  }
  return body
}

export const verifyLocalBrainRepository = (repository, canonicalBytes, claimed) => {
  try {
    exactDirectory(repository, 'BRAIN_GIT_LOCAL_CUSTODY_REFUSED', true)
    const { blob, brainTree, brainTreeBody, rootTree, rootTreeBody, commit, commitBody } = expectedBrainGit(canonicalBytes)
    if (claimed.sourceRevision !== commit.id || claimed.tree !== rootTree.id ||
      readLocalGitFile(resolve(repository, 'HEAD'), 64).toString('utf8') !== 'ref: refs/heads/main\n' ||
      readLocalGitFile(resolve(repository, 'refs/heads/main'), 64).toString('utf8') !== `${commit.id}\n` ||
      existsSync(resolve(repository, 'packed-refs')) || existsSync(resolve(repository, 'objects/info/alternates'))) {
      fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    }
    const rootEntries = readdirSync(repository).sort()
    if (JSON.stringify(rootEntries) !== JSON.stringify([
      'HEAD', 'config', 'description', 'hooks', 'info', 'objects', 'refs',
    ])) fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    const config = readLocalGitFile(resolve(repository, 'config'), 1_024).toString('utf8')
    if (!/^\[core\]\n\trepositoryformatversion = 0\n\tfilemode = (?:true|false)\n\tbare = true\n$/.test(config)) {
      fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    }
    const objectsDirectory = exactGitDirectory(resolve(repository, 'objects'))
    const objectEntries = readdirSync(objectsDirectory, { withFileTypes: true })
    if (objectEntries.some((entry) => !['info', 'pack'].includes(entry.name) && !/^[a-f0-9]{2}$/.test(entry.name))) {
      fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    }
    for (const fixedDirectory of ['info', 'pack']) {
      if (readdirSync(exactGitDirectory(resolve(objectsDirectory, fixedDirectory))).length !== 0) {
        fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
      }
    }
    const expectedObjects = [blob.id, brainTree.id, rootTree.id, commit.id].sort()
    const actualObjects = objectEntries.filter((entry) => /^[a-f0-9]{2}$/.test(entry.name))
      .flatMap((entry) => {
        if (!entry.isDirectory() || entry.isSymbolicLink()) fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
        const directory = exactGitDirectory(resolve(repository, 'objects', entry.name))
        return readdirSync(directory, { withFileTypes: true }).map((object) => {
          if (!object.isFile() || object.isSymbolicLink() || !/^[a-f0-9]{38}$/.test(object.name)) {
            fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
          }
          return `${entry.name}${object.name}`
        })
      }).sort()
    if (JSON.stringify(actualObjects) !== JSON.stringify(expectedObjects)) fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    if (!readLooseGitObject(repository, blob.id, 'blob').equals(canonicalBytes) ||
      !readLooseGitObject(repository, brainTree.id, 'tree').equals(brainTreeBody) ||
      !readLooseGitObject(repository, rootTree.id, 'tree').equals(rootTreeBody) ||
      !readLooseGitObject(repository, commit.id, 'commit').equals(commitBody)) fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    const refsDirectory = exactGitDirectory(resolve(repository, 'refs'))
    if (JSON.stringify(readdirSync(refsDirectory).sort()) !== JSON.stringify(['heads', 'tags'])) {
      fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    }
    const heads = readdirSync(exactGitDirectory(resolve(repository, 'refs/heads')))
    const tags = readdirSync(exactGitDirectory(resolve(repository, 'refs/tags')))
    if (JSON.stringify(heads) !== JSON.stringify(['main']) || tags.length !== 0) fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    if (JSON.stringify(readdirSync(exactGitDirectory(resolve(repository, 'info')))) !== JSON.stringify(['exclude'])) {
      fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
    }
    readLocalGitFile(resolve(repository, 'description'), 256)
    readLocalGitFile(resolve(repository, 'info/exclude'), 1_024)
    const hooks = readdirSync(exactGitDirectory(resolve(repository, 'hooks')), { withFileTypes: true })
    for (const hook of hooks) {
      if (!hook.isFile() || hook.isSymbolicLink() || !/^[a-z0-9-]+\.sample$/.test(hook.name)) {
        fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
      }
      readLocalGitFile(resolve(repository, 'hooks', hook.name), 32_768)
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'BRAIN_GIT_LOCAL_CUSTODY_REFUSED') throw error
    fail('BRAIN_GIT_LOCAL_CUSTODY_REFUSED')
  }
}

const fsyncFile = (path, code) => {
  let descriptor
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o022) !== 0 ||
      (process.getuid && stat.uid !== process.getuid()) || realpathSync(`/proc/self/fd/${descriptor}`) !== resolve(path)) fail(code)
    fsyncSync(descriptor)
  } catch { fail(code) } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

const settleBrainGitDurability = (repository, canonicalBytes) => {
  const expected = expectedBrainGit(canonicalBytes)
  const objectIds = [expected.blob.id, expected.brainTree.id, expected.rootTree.id, expected.commit.id]
  const files = [
    'HEAD', 'config', 'description', 'info/exclude', 'refs/heads/main',
    ...readdirSync(resolve(repository, 'hooks')).map((name) => `hooks/${name}`),
    ...objectIds.map((id) => `objects/${id.slice(0, 2)}/${id.slice(2)}`),
  ]
  for (const file of files) fsyncFile(resolve(repository, file), 'BRAIN_GIT_DURABILITY_REFUSED')
  const directories = [
    ...new Set(objectIds.map((id) => `objects/${id.slice(0, 2)}`)),
    'objects/info', 'objects/pack', 'objects', 'refs/heads', 'refs/tags', 'refs', 'hooks', 'info', '.',
  ]
  for (const directory of directories) fsyncDirectory(resolve(repository, directory), 'BRAIN_GIT_DURABILITY_REFUSED')
}

let verifiedGitImage = false
const verifyGitImage = () => {
  if (verifiedGitImage) return
  if (docker(['image', 'inspect', '--format', '{{.Id}}', GIT_IMAGE]) !== GIT_IMAGE) fail('BRAIN_GIT_IMAGE_REFUSED')
  const hardening = ['--pull', 'never', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m']
  if (runContainer([...hardening, GIT_IMAGE, '--version']) !== GIT_VERSION) fail('BRAIN_GIT_IMAGE_REFUSED')
  const program = `const f=require('node:fs');const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(f.readFileSync(${JSON.stringify(GIT_PATH)})).digest('hex')+'\\n')`
  if (runContainer([...hardening, '--entrypoint', '/usr/local/bin/node', GIT_IMAGE, '-e', program]) !== GIT_SHA256) fail('BRAIN_GIT_IMAGE_REFUSED')
  verifiedGitImage = true
}

const GIT_PROGRAM = `
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const bytes = readFileSync(0)
const brainDigest = createHash('sha256').update(bytes).digest('hex')
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Conexus OS', GIT_AUTHOR_EMAIL: 'brain@conexus.invalid', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Conexus OS', GIT_COMMITTER_EMAIL: 'brain@conexus.invalid', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' }
const git = (args, input) => spawnSync('/usr/local/bin/git', [
  '-c', 'core.fsync=committed,reference', '-c', 'core.fsyncMethod=fsync', ...args,
], { encoding: 'utf8', env, input })
const ok = (result) => !result.error && result.status === 0 && result.signal === null
const finish = (value) => { process.stdout.write(JSON.stringify(value) + '\\n'); process.exit(0) }
mkdirSync('/tmp/tree/.conexus', { recursive: true })
writeFileSync('/tmp/tree/.conexus/brain.json', bytes)
const expectedRepository = '/tmp/expected.git'
let value = git(['init', '--bare', '--initial-branch=main', expectedRepository])
if (!ok(value)) finish({ status: 'REFUSED' })
env.GIT_INDEX_FILE = '/tmp/expected-index'
value = git(['--git-dir=' + expectedRepository, '--work-tree=/tmp/tree', 'add', '--all'])
if (!ok(value)) finish({ status: 'REFUSED' })
const expectedTreeResult = git(['--git-dir=' + expectedRepository, 'write-tree'])
if (!ok(expectedTreeResult) || !/^[0-9a-f]{40}$/.test(expectedTreeResult.stdout.trim())) finish({ status: 'REFUSED' })
const expectedTree = expectedTreeResult.stdout.trim()
const expectedCommit = git(['--git-dir=' + expectedRepository, 'commit-tree', expectedTree, '-m', 'Conexus OS canonical Workspace Brain'])
if (!ok(expectedCommit) || !/^[0-9a-f]{40}$/.test(expectedCommit.stdout.trim())) finish({ status: 'REFUSED' })
const expectedSourceRevision = expectedCommit.stdout.trim()
const repository = '/repository'
const headPath = repository + '/HEAD'
const existing = existsSync(headPath)
if (!existing) {
  const initialized = git(['init', '--bare', '--initial-branch=main', repository])
  if (!ok(initialized)) finish({ status: 'REFUSED' })
} else {
  const bare = git(['--git-dir=' + repository, 'rev-parse', '--is-bare-repository'])
  if (!ok(bare) || bare.stdout.trim() !== 'true') finish({ status: 'REFUSED' })
}
if (existsSync(repository + '/objects/info/alternates') || readFileSync(headPath, 'utf8').trim() !== 'ref: refs/heads/main') finish({ status: 'REFUSED' })
const config = git(['--git-dir=' + repository, 'config', '--local', '--list'])
const configLines = config.stdout.trim().split('\\n').filter(Boolean).sort()
if (!ok(config) || configLines.some((line) => !/^core\\.(repositoryformatversion=0|filemode=(true|false)|bare=true)$/.test(line))) finish({ status: 'REFUSED' })
const current = git(['--git-dir=' + repository, 'rev-parse', '--verify', 'refs/heads/main'])
if (ok(current)) {
  const sourceRevision = current.stdout.trim()
  const treeResult = git(['--git-dir=' + repository, 'rev-parse', sourceRevision + '^{tree}'])
  const object = git(['--git-dir=' + repository, 'cat-file', '-e', sourceRevision + '^{commit}'])
  const fsck = git(['--git-dir=' + repository, 'fsck', '--strict', '--unreachable', '--no-reflogs'])
  const paths = git(['--git-dir=' + repository, 'ls-tree', '-r', '--name-only', sourceRevision])
  const blob = git(['--git-dir=' + repository, 'show', sourceRevision + ':.conexus/brain.json'])
  const refs = git(['--git-dir=' + repository, 'for-each-ref', '--format=%(refname)'])
  if (sourceRevision !== expectedSourceRevision || !ok(treeResult) || treeResult.stdout.trim() !== expectedTree || !ok(object) ||
    !ok(fsck) || fsck.stdout.trim() !== '' || fsck.stderr.trim() !== '' || !ok(paths) ||
    paths.stdout.trim() !== '.conexus/brain.json' || !ok(blob) || blob.stdout !== bytes.toString('utf8') ||
    !ok(refs) || refs.stdout.trim() !== 'refs/heads/main') finish({ status: 'CONFLICT' })
  finish({ status: 'ADOPTED', sourceRevision, tree: treeResult.stdout.trim(), brainDigest })
} else {
  const refsBefore = git(['--git-dir=' + repository, 'for-each-ref', '--format=%(refname)'])
  if (!ok(refsBefore) || refsBefore.stdout.trim() !== '') finish({ status: 'REFUSED' })
}
env.GIT_INDEX_FILE = '/tmp/index'
value = git(['--git-dir=' + repository, '--work-tree=/tmp/tree', 'add', '--all'])
if (!ok(value)) finish({ status: 'REFUSED' })
const writtenTree = git(['--git-dir=' + repository, 'write-tree'])
if (!ok(writtenTree) || !/^[0-9a-f]{40}$/.test(writtenTree.stdout.trim())) finish({ status: 'REFUSED' })
const tree = writtenTree.stdout.trim()
const committed = git(['--git-dir=' + repository, 'commit-tree', tree, '-m', 'Conexus OS canonical Workspace Brain'])
if (!ok(committed) || !/^[0-9a-f]{40}$/.test(committed.stdout.trim())) finish({ status: 'REFUSED' })
const sourceRevision = committed.stdout.trim()
if (tree !== expectedTree || sourceRevision !== expectedSourceRevision) finish({ status: 'REFUSED' })
const updated = git(['--git-dir=' + repository, 'update-ref', 'refs/heads/main', sourceRevision, '${'0'.repeat(40)}'])
if (!ok(updated)) finish({ status: 'REFUSED' })
const object = git(['--git-dir=' + repository, 'cat-file', '-e', sourceRevision + '^{commit}'])
const fsck = git(['--git-dir=' + repository, 'fsck', '--strict', '--unreachable', '--no-reflogs'])
const paths = git(['--git-dir=' + repository, 'ls-tree', '-r', '--name-only', sourceRevision])
const blob = git(['--git-dir=' + repository, 'show', sourceRevision + ':.conexus/brain.json'])
const refs = git(['--git-dir=' + repository, 'for-each-ref', '--format=%(refname)'])
if (!ok(object) || !ok(fsck) || fsck.stdout.trim() !== '' || fsck.stderr.trim() !== '' || !ok(paths) ||
  paths.stdout.trim() !== '.conexus/brain.json' || !ok(blob) || blob.stdout !== bytes.toString('utf8') ||
  !ok(refs) || refs.stdout.trim() !== 'refs/heads/main') finish({ status: 'REFUSED' })
finish({ status: 'STAGED', sourceRevision, tree, brainDigest })
`

export const brainHealthSnapshotDigest = ({ brainRevisionId, brainDigest, items }) =>
  sha256(canonicalize({ brainRevisionId, brainDigest, items }))

export const bootstrapR2Brain = async ({ sourceFile, healthFile, admissionFile, brainStorageRoot, projectStorageRoot, workspaceId, artifactId, brainRevisionId, connectionString }) => {
  for (const value of [workspaceId, artifactId, brainRevisionId]) if (!UUID.test(value)) fail('BRAIN_IDENTITY_REFUSED')
  const brainRoot = exactDirectory(realpathSync(resolve(brainStorageRoot)), 'BRAIN_STORAGE_ROOT_REFUSED', true)
  const projectRoot = exactDirectory(realpathSync(resolve(projectStorageRoot)), 'PROJECT_STORAGE_ROOT_REFUSED')
  const brainRootStat = lstatSync(brainRoot)
  const projectRootStat = lstatSync(projectRoot)
  const brainCoordinate = mountCoordinate(brainRoot, 'BRAIN_STORAGE_ROOT_REFUSED')
  const projectCoordinate = mountCoordinate(projectRoot, 'PROJECT_STORAGE_ROOT_REFUSED')
  if (brainRoot === resolve('/') || projectRoot === resolve('/') ||
    (brainRootStat.dev === projectRootStat.dev && brainRootStat.ino === projectRootStat.ino) || brainRoot === projectRoot ||
    isNested(projectRoot, brainRoot) || isNested(brainRoot, projectRoot) ||
    (brainCoordinate.device === projectCoordinate.device &&
      (brainCoordinate.path === projectCoordinate.path || isNested(projectCoordinate.path, brainCoordinate.path) ||
        isNested(brainCoordinate.path, projectCoordinate.path)))) fail('BRAIN_PROJECT_STORAGE_NOT_INDEPENDENT')
  const assertBrainMountBoundary = () => {
    let mountInfo
    try { mountInfo = readFileSync('/proc/self/mountinfo', 'utf8') } catch { fail('BRAIN_STORAGE_ROOT_REFUSED') }
    if (nestedMountPoints(brainRoot, mountInfo).length !== 0) fail('BRAIN_STORAGE_NESTED_MOUNT_REFUSED')
  }
  assertBrainMountBoundary()
  const sourcePath = resolve(sourceFile)
  const healthPath = resolve(healthFile)
  const admissionPath = resolve(admissionFile)
  if (isNested(projectRoot, sourcePath) || isNested(brainRoot, sourcePath) ||
    isNested(projectRoot, healthPath) || isNested(brainRoot, healthPath) ||
    isNested(projectRoot, admissionPath) || isNested(brainRoot, admissionPath)) fail('BRAIN_STAGING_CUSTODY_REFUSED')
  for (const stagingPath of [sourcePath, healthPath, admissionPath]) {
    const coordinate = mountCoordinate(stagingPath, 'BRAIN_STAGING_CUSTODY_REFUSED')
    const aliasesOwnedRoot = (owned) => coordinate.device === owned.device &&
      (coordinate.path === owned.path || isNested(owned.path, coordinate.path))
    if (aliasesOwnedRoot(brainCoordinate) || aliasesOwnedRoot(projectCoordinate)) fail('BRAIN_STAGING_CUSTODY_REFUSED')
  }
  const source = validateBrainSource(decodeJsonFile(sourcePath, 'BRAIN_SOURCE_FILE_REFUSED', MAX_SOURCE_BYTES))
  const health = validateBrainHealth(decodeJsonFile(healthPath, 'BRAIN_HEALTH_FILE_REFUSED', MAX_HEALTH_BYTES), source)
  const canonicalBytes = Buffer.from(`${canonicalize(source)}\n`)
  const brainDigest = sha256(canonicalBytes)
  assertBrainContentAdmissible(source)
  const admission = validateBrainAdmission(
    decodeJsonFile(admissionPath, 'BRAIN_ADMISSION_RECEIPT_REFUSED', MAX_ADMISSION_BYTES),
    brainDigest,
  )
  const admissionDigest = sha256(canonicalize(admission))
  const healthSnapshotDigest = brainHealthSnapshotDigest({ brainRevisionId, brainDigest, items: health.items })

  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1::text, 3202))', [workspaceId])
    const workspacesRoot = ensureExactChildDirectory(brainRoot, 'workspaces', 'BRAIN_STORAGE_ROOT_REFUSED')
    const workspaceRoot = ensureExactChildDirectory(workspacesRoot, workspaceId, 'BRAIN_STORAGE_ROOT_REFUSED')
    const repositoryRoot = resolve(workspaceRoot, 'repository.git')
    const pendingRepositoryRoot = resolve(workspaceRoot, 'repository.git.pending')
    if (existsSync(repositoryRoot) && existsSync(pendingRepositoryRoot)) fail('BRAIN_GIT_REPOSITORY_REFUSED')
    const repositoryExisted = existsSync(repositoryRoot)
    const repositoryMount = repositoryExisted
      ? exactDirectory(repositoryRoot, 'BRAIN_GIT_REPOSITORY_REFUSED', true)
      : ensureExactChildDirectory(workspaceRoot, 'repository.git.pending', 'BRAIN_GIT_REPOSITORY_REFUSED')
    assertBrainMountBoundary()

    verifyGitImage()
    const owner = `${process.getuid()}:${process.getgid()}`
    const output = runContainer([
      '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--user', owner,
      '--volume', `${repositoryMount}:/repository:rw`,
      '--entrypoint', '/usr/local/bin/node', GIT_IMAGE, '-e', GIT_PROGRAM,
    ], canonicalBytes)
    const git = JSON.parse(output)
    if (!record(git) || !['STAGED', 'ADOPTED'].includes(git.status) || !/^[0-9a-f]{40}$/.test(git.sourceRevision) ||
      !/^[0-9a-f]{40}$/.test(git.tree) || git.brainDigest !== brainDigest) {
      fail(git?.status === 'CONFLICT' ? 'BRAIN_GIT_CONFLICT' : 'BRAIN_GIT_RESULT_REFUSED')
    }
    verifyLocalBrainRepository(repositoryMount, canonicalBytes, git)
    assertBrainMountBoundary()
    settleBrainGitDurability(repositoryMount, canonicalBytes)
    fsyncDirectory(workspaceRoot, 'BRAIN_GIT_DURABILITY_REFUSED')
    if (!repositoryExisted) {
      renameSync(pendingRepositoryRoot, repositoryRoot)
      assertBrainMountBoundary()
      fsyncDirectory(repositoryRoot, 'BRAIN_GIT_DURABILITY_REFUSED')
      fsyncDirectory(workspaceRoot, 'BRAIN_GIT_DURABILITY_REFUSED')
    }

    try {
      await client.query('BEGIN')
      await client.query('SELECT reg.bootstrap_workspace_brain($1, $2, $3, $4, $5, $6)', [
        artifactId, workspaceId, brainRevisionId, git.sourceRevision, brainDigest,
        source,
      ])
      await client.query('SELECT brn.bootstrap_brain_health($1, $2, $3, $4)', [
        healthSnapshotDigest, brainRevisionId, brainDigest, JSON.stringify(health.items),
      ])
      await client.query('COMMIT')
    } catch (error) {
      try { await client.query('ROLLBACK') } catch { /* preserve primary failure */ }
      throw error
    }
    return Object.freeze({ verdict: 'PASS', sourceRevision: git.sourceRevision, tree: git.tree, brainDigest, healthSnapshotDigest, admissionDigest })
  } finally {
    await client.end()
  }
}

const readRequired = (name) => process.env[name] || fail(`MISSING_CONFIG_${name}`)
export const readDatabaseUrl = (path) => {
  const { bytes, stat } = readExactFile(path, 'BRAIN_DATABASE_URL_FILE_REFUSED', 8_192, true)
  const mode = stat.mode & 0o777
  if ((mode !== 0o400 && mode !== 0o600) || (process.getuid && stat.uid !== process.getuid())) {
    fail('BRAIN_DATABASE_URL_FILE_REFUSED')
  }
  let decoded
  try { decoded = utf8.decode(bytes) } catch { fail('BRAIN_DATABASE_URL_FILE_REFUSED') }
  const value = decoded.endsWith('\n') ? decoded.slice(0, -1) : decoded
  if (!value || value.trim() !== value || /[\0\r\n]/.test(value)) fail('BRAIN_DATABASE_URL_FILE_REFUSED')
  try {
    const parsed = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) fail('BRAIN_DATABASE_URL_FILE_REFUSED')
  } catch (error) {
    if (error instanceof Error && error.message === 'BRAIN_DATABASE_URL_FILE_REFUSED') throw error
    fail('BRAIN_DATABASE_URL_FILE_REFUSED')
  }
  return value
}
const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const urlFile = readRequired('CONEXUS_R2_BRAIN_BOOTSTRAP_DATABASE_URL_FILE')
  const result = await bootstrapR2Brain({
    sourceFile: readRequired('CONEXUS_R2_BRAIN_SOURCE_FILE'),
    healthFile: readRequired('CONEXUS_R2_BRAIN_HEALTH_FILE'),
    admissionFile: readRequired('CONEXUS_R2_BRAIN_ADMISSION_FILE'),
    brainStorageRoot: readRequired('CONEXUS_R2_BRAIN_STORAGE_ROOT'),
    projectStorageRoot: readRequired('CONEXUS_PROJECT_STORAGE_ROOT'),
    workspaceId: readRequired('CONEXUS_R2_BRAIN_WORKSPACE_ID'),
    artifactId: readRequired('CONEXUS_R2_BRAIN_ARTIFACT_ID'),
    brainRevisionId: readRequired('CONEXUS_R2_BRAIN_REVISION_ID'),
    connectionString: readDatabaseUrl(urlFile),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
