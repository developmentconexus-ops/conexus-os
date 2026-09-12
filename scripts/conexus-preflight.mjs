import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
export const defaultRepositoryRoot = resolve(dirname(scriptPath), '..')

const REQUIRED_REPOSITORY_FILES = Object.freeze([
  'package.json',
  'AGENTS.md',
  'docs/index.md',
  'docs/roadmap.md'
])

const expectedOrigin = value => {
  const normalized = trimLine(value).replace(/\/+$/, '').replace(/\.git$/, '')
  return [
    'https://github.com/developmentconexus-ops/conexus-os',
    'git@github.com:developmentconexus-ops/conexus-os',
    'ssh://git@github.com/developmentconexus-ops/conexus-os'
  ].includes(normalized)
}

export class PreflightError extends Error {
  constructor(message, code = 'EXECUTION_ERROR') {
    super(message)
    this.name = 'PreflightError'
    this.code = code
  }
}

export function classifyRuntimeEnvironment({ platform = process.platform, env = process.env } = {}) {
  const isWsl = platform === 'linux' && Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP)
  return {
    platform,
    isWsl,
    wslDistro: isWsl ? env.WSL_DISTRO_NAME ?? 'unknown' : null,
    role: isWsl ? 'LOCAL_DECIDING_WSL' : platform === 'linux' ? 'LINUX_DECIDING' : 'LAUNCHER_ONLY'
  }
}

const trimLine = value => String(value ?? '').trim()
const oneLine = value => trimLine(value).replace(/\s+/g, ' ')

const defaultCommand = (file, args, options = {}) => {
  const result = spawnSync(file, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  })
  if (result.error) throw result.error
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

const commandOrThrow = (command, file, args, cwd, label) => {
  let result
  try {
    result = command(file, args, { cwd })
  } catch (error) {
    throw new PreflightError(`${label}: ${error.message}`, 'EXECUTION_ERROR')
  }
  if (result.status !== 0) {
    const detail = oneLine(result.stderr || result.stdout)
    throw new PreflightError(`${label} failed${detail ? `: ${detail}` : ''}`, 'EXECUTION_ERROR')
  }
  return result.stdout
}

const commandAllowFailure = (command, file, args, cwd) => {
  try {
    const result = command(file, args, { cwd })
    return {
      ok: result.status === 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      status: result.status
    }
  } catch (error) {
    return { ok: false, stdout: '', stderr: error.message, status: null, error }
  }
}

const splitNul = value => String(value ?? '').split('\0').filter(Boolean)

const phaseRowPattern = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/

/**
 * Read only the explicitly authored current-status surfaces from docs/roadmap.md.
 * No status is inferred from prose, chronology, or a phase's exit condition.
 */
export function parseRoadmap(roadmapText) {
  const text = String(roadmapText ?? '').replaceAll('\r\n', '\n')
  const phaseRows = []

  for (const line of text.split('\n')) {
    const match = line.match(phaseRowPattern)
    if (!match || match[1].trim() === 'Phase' || /^[-\s]+$/.test(match[1]) || /^[-\s]+$/.test(match[2])) continue
    phaseRows.push({
      name: match[1].trim(),
      status: match[2].trim(),
      exitCondition: match[3].trim(),
      reopenTrigger: match[4].trim()
    })
  }

  const rowByName = Object.fromEntries(phaseRows.map(row => [row.name, row]))
  const productImplementation = rowByName['Product implementation'] ?? null

  const continuationMatch = text.match(/(?:^|\n)Continuation readiness\s*=\s*([^\n]+)/i)
  const nextActionSection = text.match(/(?:^|\n)##\s+Exact next action\s*\n([\s\S]*?)(?=\n##\s|$)/i)
  const nextActionBlock = nextActionSection?.[1] ?? ''
  const nextActionMatch = nextActionBlock.match(/\*\*([\s\S]*?)\*\*/)

  return {
    source: 'docs/roadmap.md',
    phaseRows,
    productImplementation,
    continuationReadiness: continuationMatch?.[1]?.trim() ?? null,
    exactNextAction: nextActionMatch?.[1]?.trim() ?? null
  }
}

const parseJson = (text, label) => {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new PreflightError(`${label} returned invalid JSON: ${error.message}`, 'EXECUTION_ERROR')
  }
}

const sortByNewest = (items, dateKeys, numberKey) => [...items].sort((left, right) => {
  for (const key of dateKeys) {
    const leftValue = Date.parse(left?.[key] ?? '') || 0
    const rightValue = Date.parse(right?.[key] ?? '') || 0
    if (leftValue !== rightValue) return rightValue - leftValue
  }
  if (numberKey) {
    const leftValue = Number(left?.[numberKey] ?? 0)
    const rightValue = Number(right?.[numberKey] ?? 0)
    if (leftValue !== rightValue) return rightValue - leftValue
  }
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
})

const ghUnavailable = (reason, detail = null) => ({
  status: 'unavailable',
  reason,
  detail
})

const runGhJson = ({ command, repositoryRoot, args, label }) => {
  const result = commandAllowFailure(command, 'gh', args, repositoryRoot, label)
  if (!result.ok) return { ok: false, error: oneLine(result.stderr || result.stdout) || 'command failed' }
  try {
    return { ok: true, value: parseJson(result.stdout, label) }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

const ghIsAvailable = (command, repositoryRoot) => {
  try {
    const result = command('gh', ['--version'], { cwd: repositoryRoot })
    return result.status === 0
  } catch {
    return false
  }
}

const normalizeCommit = value => {
  const commit = trimLine(value)
  return /^[0-9a-f]{40}$/i.test(commit) ? commit.toLowerCase() : null
}

const pullRequestCommit = pullRequest => {
  const mergeCommit = typeof pullRequest?.mergeCommit === 'string'
    ? pullRequest.mergeCommit
    : pullRequest?.mergeCommit?.oid
  return {
    head: normalizeCommit(pullRequest?.headRefOid ?? pullRequest?.headSha),
    merge: normalizeCommit(mergeCommit)
  }
}

const resolvePullRequest = ({ values, branch, head }) => {
  const currentOpen = values
    .filter(item => item?.state === 'OPEN' && item?.headRefName === branch)
  const latestOpen = sortByNewest(currentOpen, ['updatedAt'], 'number')[0] ?? null
  if (latestOpen) return { status: 'found', match: 'open-current-branch', ...latestOpen }

  const normalizedHead = normalizeCommit(head)
  const merged = values
    .filter(item => item?.state === 'MERGED')
    .filter(item => {
      const commits = pullRequestCommit(item)
      return normalizedHead !== null && (commits.merge === normalizedHead || commits.head === normalizedHead)
    })
  const latestMerged = sortByNewest(merged, ['updatedAt'], 'number')[0] ?? null
  if (latestMerged) return { status: 'found', match: 'merged-exact-sha', ...latestMerged }

  return { status: 'none', branch, head: normalizedHead }
}

const resolveCiRun = ({ values, headSha, workflowName }) => {
  const targetSha = normalizeCommit(headSha)
  const matching = values
    .filter(item => normalizeCommit(item?.headSha) === targetSha)
    .filter(item => !workflowName || item?.workflowName === workflowName)
  const latest = sortByNewest(matching, ['createdAt', 'updatedAt'], 'databaseId')[0] ?? null
  return latest
    ? { ...latest, lookupStatus: 'found', targetSha, workflow: workflowName }
    : { lookupStatus: 'none', targetSha, workflow: workflowName }
}

const inspectGh = ({ command, repositoryRoot, branch, head, remoteMain, noNetwork }) => {
  if (noNetwork) {
    return {
      network: { mode: 'disabled' },
      pullRequest: { status: 'skipped', reason: 'no-network' },
      mainCi: { status: 'skipped', reason: 'no-network' }
    }
  }

  if (!ghIsAvailable(command, repositoryRoot)) {
    return {
      network: { mode: 'enabled', gh: 'unavailable' },
      pullRequest: ghUnavailable('gh-not-installed'),
      mainCi: ghUnavailable('gh-not-installed')
    }
  }

  const pullRequests = runGhJson({
    command,
    repositoryRoot,
    label: 'gh pr list',
    args: ['pr', 'list', '--state', 'all', '--limit', '100', '--json', 'number,title,state,url,headRefName,baseRefName,headRefOid,mergeCommit,updatedAt']
  })
  const pullRequest = !pullRequests.ok
    ? ghUnavailable('gh-request-failed', pullRequests.error)
    : resolvePullRequest({
        values: Array.isArray(pullRequests.value) ? pullRequests.value : [],
        branch,
        head
      })

  const ciWorkflow = 'Verify'
  const ciRuns = remoteMain
    ? runGhJson({
        command,
        repositoryRoot,
        label: 'gh run list',
        args: ['run', 'list', '--workflow', ciWorkflow, '--commit', remoteMain, '--limit', '100', '--json', 'databaseId,workflowName,status,conclusion,headBranch,headSha,event,url,createdAt,updatedAt']
      })
    : { ok: true, value: [] }
  const mainCi = !remoteMain
    ? { lookupStatus: 'skipped', reason: 'remote-main-unavailable', targetSha: null, workflow: ciWorkflow }
    : !ciRuns.ok
      ? { ...ghUnavailable('gh-request-failed', ciRuns.error), targetSha: remoteMain, workflow: ciWorkflow }
      : resolveCiRun({
          values: Array.isArray(ciRuns.value) ? ciRuns.value : [],
          headSha: remoteMain,
          workflowName: ciWorkflow
        })

  return {
    network: { mode: 'enabled', gh: 'available' },
    pullRequest,
    mainCi
  }
}

const getWorkingTree = ({ command, repositoryRoot }) => {
  const staged = splitNul(commandOrThrow(command, 'git', ['diff', '--name-only', '--cached', '-z'], repositoryRoot, 'git staged diff'))
  const unstaged = splitNul(commandOrThrow(command, 'git', ['diff', '--name-only', '-z'], repositoryRoot, 'git unstaged diff'))
  const untracked = splitNul(commandOrThrow(command, 'git', ['ls-files', '--others', '--exclude-standard', '-z'], repositoryRoot, 'git untracked files'))
  const normalize = values => [...new Set(values.map(value => value.replaceAll('\\', '/')))].sort()
  const state = {
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    staged: normalize(staged),
    unstaged: normalize(unstaged),
    untracked: normalize(untracked)
  }
  return {
    ...state,
    changedPathCount: new Set([...state.staged, ...state.unstaged, ...state.untracked]).size
  }
}

const readIdentity = ({ command, repositoryRoot }) => {
  const expectedRoot = realpathSync.native(repositoryRoot)
  const actualRootText = commandOrThrow(command, 'git', ['rev-parse', '--show-toplevel'], expectedRoot, 'git repository root')
  let actualRoot
  try {
    actualRoot = realpathSync.native(trimLine(actualRootText))
  } catch {
    throw new PreflightError('git repository root is not a readable directory', 'STRUCTURAL_IDENTITY_ERROR')
  }
  if (actualRoot !== expectedRoot) {
    throw new PreflightError(`repository root mismatch: expected ${expectedRoot}, git reported ${actualRoot}`, 'STRUCTURAL_IDENTITY_ERROR')
  }

  const missing = REQUIRED_REPOSITORY_FILES.filter(path => !existsSync(resolve(expectedRoot, path)))
  if (missing.length) throw new PreflightError(`missing repository identity files: ${missing.join(', ')}`, 'STRUCTURAL_IDENTITY_ERROR')

  let packageJson
  try {
    packageJson = JSON.parse(readFileSync(resolve(expectedRoot, 'package.json'), 'utf8'))
  } catch (error) {
    throw new PreflightError(`package.json could not be read: ${error.message}`, 'STRUCTURAL_IDENTITY_ERROR')
  }
  if (packageJson.name !== 'conexus-os' || packageJson.private !== true) {
    throw new PreflightError('package identity must remain private conexus-os', 'STRUCTURAL_IDENTITY_ERROR')
  }

  const remoteResult = commandAllowFailure(command, 'git', ['remote', 'get-url', 'origin'], expectedRoot, 'git origin remote')
  if (!remoteResult.ok || !trimLine(remoteResult.stdout)) {
    throw new PreflightError('origin remote is missing or unreadable', 'STRUCTURAL_IDENTITY_ERROR')
  }
  if (!expectedOrigin(remoteResult.stdout)) {
    throw new PreflightError(`origin remote does not identify developmentconexus-ops/conexus-os: ${trimLine(remoteResult.stdout)}`, 'STRUCTURAL_IDENTITY_ERROR')
  }

  const branch = trimLine(commandOrThrow(command, 'git', ['branch', '--show-current'], expectedRoot, 'git branch'))
  if (!branch) throw new PreflightError('HEAD is detached; a named branch is required', 'STRUCTURAL_IDENTITY_ERROR')
  const head = trimLine(commandOrThrow(command, 'git', ['rev-parse', 'HEAD'], expectedRoot, 'git HEAD'))
  if (!/^[0-9a-f]{40}$/i.test(head)) throw new PreflightError(`invalid HEAD identity: ${head}`, 'STRUCTURAL_IDENTITY_ERROR')

  return {
    repositoryRoot: expectedRoot,
    gitRoot: actualRoot,
    package: {
      name: packageJson.name,
      private: packageJson.private,
      engines: packageJson.engines ?? null
    },
    remote: { name: 'origin', url: trimLine(remoteResult.stdout) },
    branch,
    head
  }
}

const inspectToolchain = ({ command, repositoryRoot, expected }) => {
  const nodeVersion = process.version.replace(/^v/, '')
  const npmFromUserAgent = process.env.npm_config_user_agent?.match(/(?:^|\s)npm\/([^\s]+)/)?.[1] ?? null
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const npmResult = npmFromUserAgent
    ? { ok: true, stdout: npmFromUserAgent }
    : commandAllowFailure(command, npmExecutable, ['--version'], repositoryRoot, 'npm version')
  const npmVersion = npmResult.ok ? trimLine(npmResult.stdout) : null
  return {
    node: {
      actual: nodeVersion,
      expected: expected?.node ?? null,
      matches: expected?.node ? nodeVersion === expected.node : null
    },
    npm: {
      actual: npmVersion,
      expected: expected?.npm ?? null,
      matches: expected?.npm && npmVersion ? npmVersion === expected.npm : null,
      available: npmResult.ok
    }
  }
}

const inspectOriginMain = ({ command, repositoryRoot, noNetwork }) => {
  const localRef = commandAllowFailure(command, 'git', ['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'], repositoryRoot, 'git origin/main')
  const localOriginMain = localRef.ok ? normalizeCommit(localRef.stdout) : null
  const fetch = {
    attempted: false,
    status: noNetwork ? 'skipped' : 'not-used',
    reason: 'remote inspection uses git ls-remote and never updates local refs'
  }

  const remote = noNetwork
    ? { status: 'skipped', reason: 'no-network', sha: null }
    : (() => {
        const result = commandAllowFailure(command, 'git', ['ls-remote', 'origin', 'refs/heads/main'], repositoryRoot, 'git ls-remote origin main')
        if (!result.ok) return { status: 'unavailable', reason: 'ls-remote-failed', detail: oneLine(result.stderr || result.stdout) || 'command failed', sha: null }
        const line = String(result.stdout ?? '').split(/\r?\n/).map(trimLine).find(Boolean) ?? ''
        const [sha, ref] = line.split(/\s+/)
        if (ref !== 'refs/heads/main' || !normalizeCommit(sha)) {
          return { status: 'unavailable', reason: 'invalid-ls-remote-result', detail: oneLine(result.stdout) || 'main ref not returned', sha: null }
        }
        return { status: 'found', sha: normalizeCommit(sha) }
      })()

  let ahead = null
  let behind = null
  if (localOriginMain) {
    const counts = commandAllowFailure(command, 'git', ['rev-list', '--left-right', '--count', 'refs/remotes/origin/main...HEAD'], repositoryRoot, 'git ahead/behind')
    if (!counts.ok) throw new PreflightError(`git ahead/behind failed: ${oneLine(counts.stderr || counts.stdout)}`, 'EXECUTION_ERROR')
    const [behindCount, aheadCount] = trimLine(counts.stdout).split(/\s+/).map(Number)
    if (!Number.isInteger(behindCount) || !Number.isInteger(aheadCount)) throw new PreflightError(`invalid ahead/behind result: ${trimLine(counts.stdout)}`, 'EXECUTION_ERROR')
    behind = behindCount
    ahead = aheadCount
  }

  const remoteMain = remote.sha
  return {
    // `originMain` remains a compatibility alias for the local tracking ref.
    originMain: localOriginMain,
    localOriginMain,
    remoteMain,
    localRemoteMismatch: localOriginMain !== null && remoteMain !== null ? localOriginMain !== remoteMain : null,
    ahead,
    behind,
    fetch,
    remoteInspection: remote
  }
}

/** Run the read-only repository preflight. The command option exists for deterministic tests. */
export function runPreflight({ repositoryRoot = defaultRepositoryRoot, noNetwork = false, command = defaultCommand } = {}) {
  const root = resolve(repositoryRoot)
  const identity = readIdentity({ command, repositoryRoot: root })
  const main = inspectOriginMain({ command, repositoryRoot: root, noNetwork })
  const roadmapText = readFileSync(resolve(root, 'docs/roadmap.md'), 'utf8')
  const roadmap = parseRoadmap(roadmapText)
  const workingTree = getWorkingTree({ command, repositoryRoot: root })
  const toolchain = inspectToolchain({ command, repositoryRoot: root, expected: identity.package.engines })
  const runtime = classifyRuntimeEnvironment()
  const external = inspectGh({
    command,
    repositoryRoot: root,
    branch: identity.branch,
    head: identity.head,
    remoteMain: main.remoteMain,
    noNetwork
  })
  const mainCi = external.mainCi.lookupStatus === 'found'
    ? {
        ...external.mainCi,
        matchesRemoteMain: external.mainCi.headSha === main.remoteMain,
        matchesLocalOriginMain: main.localOriginMain !== null && external.mainCi.headSha === main.localOriginMain
      }
    : external.mainCi

  return {
    ok: true,
    repository: identity,
    base: main,
    runtime,
    toolchain,
    workingTree,
    roadmap,
    network: external.network,
    pullRequest: external.pullRequest,
    mainCi
  }
}

export const formatHuman = result => {
  const { repository, base, runtime, toolchain, workingTree, roadmap, pullRequest, mainCi } = result
  const product = roadmap.productImplementation
  const lines = [
    'Conexus preflight',
    `root: ${repository.repositoryRoot}`,
    `remote: ${repository.remote.url}`,
    `branch: ${repository.branch}`,
    `HEAD: ${repository.head}`,
    `origin/main (local): ${base.localOriginMain ?? 'unavailable'} (ahead ${base.ahead ?? 'unknown'}, behind ${base.behind ?? 'unknown'})`,
    `main (remote): ${base.remoteMain ?? base.remoteInspection.status}${base.localRemoteMismatch === null ? '' : base.localRemoteMismatch ? ' (local origin/main differs)' : ' (matches local origin/main)'}`,
    `environment: ${runtime.role}${runtime.wslDistro ? ` (${runtime.wslDistro})` : ''}`,
    `toolchain: node ${toolchain.node.actual}${toolchain.node.matches === false ? ` (expected ${toolchain.node.expected})` : ''}; npm ${toolchain.npm.actual ?? 'unavailable'}${toolchain.npm.matches === false ? ` (expected ${toolchain.npm.expected})` : ''}`,
    `working tree: ${workingTree.clean ? 'clean' : `dirty (${workingTree.changedPathCount} path${workingTree.changedPathCount === 1 ? '' : 's'})`}`
  ]
  if (product) lines.push(`product implementation: ${product.status}`)
  if (roadmap.continuationReadiness) lines.push(`continuation: ${roadmap.continuationReadiness}`)
  if (roadmap.exactNextAction) lines.push(`next: ${roadmap.exactNextAction}`)
  if (pullRequest.status === 'found') lines.push(`PR: #${pullRequest.number} ${pullRequest.state}${pullRequest.url ? ` ${pullRequest.url}` : ''}`)
  else lines.push(`PR: ${pullRequest.status}${pullRequest.reason ? ` (${pullRequest.reason})` : ''}`)
  if (mainCi.lookupStatus === 'found') {
    const ciState = trimLine(mainCi.conclusion) || trimLine(mainCi.status) || 'unknown'
    lines.push(`CI main: ${mainCi.workflowName ?? mainCi.workflow ?? 'run'} ${ciState}${mainCi.matchesRemoteMain === false ? ' (head differs from remote main)' : ''}${mainCi.url ? ` ${mainCi.url}` : ''}`)
  }
  else lines.push(`CI main: ${mainCi.lookupStatus ?? mainCi.status}${mainCi.reason ? ` (${mainCi.reason})` : ''}`)
  return lines.join('\n')
}

const printHuman = result => {
  process.stdout.write(`${formatHuman(result)}\n`)
}

const usage = () => 'Usage: node scripts/conexus-preflight.mjs [--json] [--no-network]'

export function parseArgs(argv) {
  const options = { json: false, noNetwork: false, help: false }
  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--no-network') options.noNetwork = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new PreflightError(`unknown argument: ${arg}`, 'EXECUTION_ERROR')
  }
  return options
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      process.stdout.write(`${usage()}\n`)
      return 0
    }
    const result = runPreflight({ noNetwork: options.noNetwork })
    if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    else printHuman(result)
    return 0
  } catch (error) {
    const failure = {
      ok: false,
      error: {
        code: error.code ?? 'EXECUTION_ERROR',
        message: error.message
      }
    }
    if (argv.includes('--json')) process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`)
    else process.stderr.write(`Conexus preflight failed: ${error.message}\n`)
    return 1
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === resolve(scriptPath)) process.exitCode = main()
