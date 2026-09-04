import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { checkR1S3GitIdentity } from './generate-r1-s3-git-identity.mjs'
import { checkR1S3NewProjectSeed } from './generate-r1-s3-new-project-seed.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const adapterPath = resolve(repositoryRoot, 'apps/hub/src/project/git-execution.ts')

export function checkR1S3GitExecution(root = repositoryRoot) {
  const identity = checkR1S3GitIdentity(root)
  const seed = checkR1S3NewProjectSeed(root)
  const sourceText = readFileSync(resolve(root, 'apps/hub/src/project/git-execution.ts'), 'utf8')
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
  if (!sourceText.includes("shell: false") || sourceText.includes('shell: true')) throw new Error('S3_GIT_SHELL_CONTROL')
  if (!sourceText.includes("const DOCKER_EXECUTABLE = 'docker'")) throw new Error('S3_GIT_DOCKER_EXECUTABLE_DRIFT')
  if (!sourceText.includes("'update-ref', 'refs/heads/main', sourceRevision") || !sourceText.includes("const ZERO_OID = '0'.repeat(40)")) throw new Error('S3_GIT_EXPECTED_OLD_ZERO_DRIFT')
  if (!sourceText.includes("'--network', 'none'")) throw new Error('S3_GIT_NETWORK_BOUNDARY_DRIFT')
  if (!sourceText.includes('admitGitImportLocator(options.gitImportCatalog, input.locator)')) throw new Error('S3_GIT_CATALOG_BEFORE_NETWORK_DRIFT')
  if (!sourceText.includes("'http.followRedirects=false'") || !sourceText.includes("'credential.helper='") || !sourceText.includes("GIT_CONFIG_NOSYSTEM: '1'")) throw new Error('S3_GIT_IMPORT_CONFIG_DRIFT')
  if (!sourceText.includes('dst=/run/conexus/credential,readonly') || !sourceText.includes('credentialBytes?.fill(0)')) throw new Error('S3_GIT_SECRET_FILE_DRIFT')
  if (!sourceText.includes('await rename(stagedRoot, canonicalRoot)') || !sourceText.includes('CANDIDATE_QUARANTINED')) throw new Error('S3_GIT_PROMOTION_RECOVERY_DRIFT')
  if (!sourceText.includes("'bundle', 'create'") || !sourceText.includes("'bundle', 'verify'") || !sourceText.includes("'clone', '--bare', '--no-hardlinks'")) throw new Error('S3_GIT_BUNDLE_RESTORE_DRIFT')
  if (!sourceText.includes("rmSync('/workspace/verify.git', { recursive: true, force: true })") || !sourceText.includes("rm(resolve(attemptRoot, 'verify.git'), { recursive: true, force: true })")) throw new Error('S3_GIT_RESTORE_SCRATCH_CLEANUP_DRIFT')
  if (!sourceText.includes("'--mount', `type=bind,src=") || !sourceText.includes(',dst=/workspace`')) throw new Error('S3_GIT_OWNED_MOUNT_DRIFT')
  if (!sourceText.includes("'--user', CONTAINER_USER") || !sourceText.includes("'/usr/local/bin/git'")) throw new Error('S3_GIT_OWNER_PROCESS_DRIFT')
  if (seed.appOwnedPathCount !== 0 || seed.entries.length !== 3) throw new Error('S3_GIT_NEW_SEED_CENSUS_DRIFT')
  for (const forbidden of identity.forbiddenBindingIdentities.filter((value) => value.startsWith('sha256:'))) {
    if (sourceText.includes(forbidden)) throw new Error(`S3_GIT_FORBIDDEN_IDENTITY_EMBEDDED:${forbidden}`)
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
