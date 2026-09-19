import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { checkR1S3GitIdentity } from './generate-r1-s3-git-identity.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const adapterPath = resolve(repositoryRoot, 'apps/hub/src/project/git-execution.ts')

// r1-new-project-seed.ts is ordinary checked-in source (no longer generated from
// runtime/r1), so this reads its committed values directly instead of rebuilding
// and comparing them.
function readR1NewProjectSeed(root) {
  const text = readFileSync(resolve(root, 'apps/hub/src/generated/r1-new-project-seed.ts'), 'utf8')
  const match = text.match(/export const R1_NEW_PROJECT_SEED = (\{[\s\S]*\}) as const/)
  if (!match) throw new Error('S3_NEW_SEED_SOURCE_UNREADABLE')
  return JSON.parse(match[1])
}

export function checkR1S3GitExecution(root = repositoryRoot) {
  const identity = checkR1S3GitIdentity(root)
  const seed = readR1NewProjectSeed(root)
  const sourceText = readFileSync(resolve(root, 'apps/hub/src/project/git-execution.ts'), 'utf8')
  const executionText = readFileSync(resolve(root, 'apps/hub/src/platform/oci-git.ts'), 'utf8')
  const builderSourceText = readFileSync(resolve(root, 'apps/hub/src/builder/source.ts'), 'utf8')
  const source = ts.createSourceFile(adapterPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const forbiddenCalls = []
  let portMethods = []
  function visit(node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'GitExecutionPort') {
      portMethods = node.members
        .filter((member) => ts.isMethodSignature(member) && member.name && ts.isIdentifier(member.name))
        .map((member) => member.name.text)
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['exec', 'execFile', 'fork'].includes(node.expression.text)) {
      forbiddenCalls.push(node.expression.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (source.parseDiagnostics.length) throw new Error('S3_GIT_ADAPTER_PARSE')
  if (forbiddenCalls.length) throw new Error(`S3_GIT_FORBIDDEN_PROCESS_API:${forbiddenCalls.join(',')}`)
  if (JSON.stringify(portMethods) !== JSON.stringify([
    'verifyAdmittedImage', 'stageNewProjectSource', 'stageExistingGitProjectSource',
    'promoteStagedProjectSource', 'verifyCanonicalProjectSource',
    'createProjectSourceBundle', 'restoreProjectSourceBundle',
  ])) throw new Error('S3_GIT_PORT_SURFACE_DRIFT')
  if (!executionText.includes('shell: false') || executionText.includes('shell: true')) throw new Error('S3_GIT_SHELL_CONTROL')
  if (!executionText.includes("const DOCKER_EXECUTABLE = 'docker'")) throw new Error('S3_GIT_DOCKER_EXECUTABLE_DRIFT')
  if (!sourceText.includes("'update-ref', 'refs/heads/main', sourceRevision") || !sourceText.includes("const ZERO_OID = '0'.repeat(40)")) throw new Error('S3_GIT_EXPECTED_OLD_ZERO_DRIFT')
  if (!executionText.includes("'--network', network") || !executionText.includes("input.networkName ?? 'none'")) {
    throw new Error('S3_GIT_NETWORK_BOUNDARY_DRIFT')
  }
  if (!sourceText.includes('admitGitImportLocator(options.gitImportCatalog, input.locator)')) throw new Error('S3_GIT_CATALOG_BEFORE_NETWORK_DRIFT')
  if (!sourceText.includes("'http.followRedirects=false'") || !sourceText.includes("'credential.helper='") || !sourceText.includes("GIT_CONFIG_NOSYSTEM: '1'")) throw new Error('S3_GIT_IMPORT_CONFIG_DRIFT')
  if (!sourceText.includes("target: '/run/conexus/credential', readonly: true") ||
    !sourceText.includes('credentialBytes?.fill(0)')) throw new Error('S3_GIT_SECRET_FILE_DRIFT')
  if (!sourceText.includes('await rename(stagedRoot, canonicalRoot)') || !sourceText.includes('CANDIDATE_QUARANTINED')) throw new Error('S3_GIT_PROMOTION_RECOVERY_DRIFT')
  if (!sourceText.includes("'bundle', 'create'") || !sourceText.includes("'bundle', 'verify'") || !sourceText.includes("'clone', '--bare', '--no-hardlinks'")) throw new Error('S3_GIT_BUNDLE_RESTORE_DRIFT')
  if (!sourceText.includes("rmSync('/workspace/verify.git', { recursive: true, force: true })") || !sourceText.includes("rm(resolve(attemptRoot, 'verify.git'), { recursive: true, force: true })")) throw new Error('S3_GIT_RESTORE_SCRATCH_CLEANUP_DRIFT')
  const mountTemplate = ['`type=bind,src=$', '{mount.source},dst=$', '{mount.target}'].join('')
  if (!executionText.includes(mountTemplate) ||
    !sourceText.includes("target: '/workspace'")) throw new Error('S3_GIT_OWNED_MOUNT_DRIFT')
  if (!executionText.includes("'--user', CONTAINER_USER") || !sourceText.includes("'/usr/local/bin/git'")) throw new Error('S3_GIT_OWNER_PROCESS_DRIFT')
  if (!builderSourceText.includes('resultSourceRevision: parsed.resultSourceRevision') ||
    builderSourceText.includes('resultSourceRevision: input.claimedResultSourceRevision')) {
    throw new Error('S3_GIT_RESULT_REVISION_AUTHORITY_DRIFT')
  }
  for (const [path, text] of [['apps/hub/src/project/git-execution.ts', sourceText], ['apps/hub/src/builder/source.ts', builderSourceText]]) {
    if (text.includes('no-new-privileges') || text.includes("'run', '--rm'") || text.includes("--cap-drop")) {
      throw new Error(`S3_GIT_CONTAINER_PREAMBLE_DUPLICATED:${path}`)
    }
  }
  // r1-new-project-seed.ts carries one self-authored README entry; see its own
  // header for why (the R1 apparatus that produced its old three-file content
  // is deleted).
  if (seed.appOwnedPathCount !== 0 || seed.entries.length !== 1) throw new Error('S3_GIT_NEW_SEED_CENSUS_DRIFT')
  for (const forbidden of identity.forbiddenBindingIdentities.filter((value) => value.startsWith('sha256:'))) {
    if (sourceText.includes(forbidden) || executionText.includes(forbidden)) throw new Error(`S3_GIT_FORBIDDEN_IDENTITY_EMBEDDED:${forbidden}`)
  }
  return Object.freeze({ verdict: 'PASS', portMethods, ociIndexDigest: identity.ociIndexDigest, newSeedEntries: seed.entries.length, appOwnedPathCount: seed.appOwnedPathCount })
}

function runLiveProof() {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'tests/implementation/r1-s3-git-execution.test.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, CONEXUS_S3_LIVE: 'true' },
    stdio: 'inherit',
  })
  if (result.status !== 0 || result.signal !== null) throw new Error('S3_GIT_LIVE_PROOF_FAILED')
}

function main() {
  const result = checkR1S3GitExecution()
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (process.argv.includes('--live')) runLiveProof()
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main()
