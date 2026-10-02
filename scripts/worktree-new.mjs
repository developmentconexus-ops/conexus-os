// Starts a new WSL worktree. Reclaims every worktree whose work is already safely on
// GitHub first (via `worktree-reap.mjs --apply`), then creates the requested worktree.
// Stops without creating anything if the reap step fails, so a reap problem (for example
// `gh` not authenticated) is visible instead of silently skipped.
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(dirname(pathToFileURL(import.meta.url).pathname), '..')

const defaultCommand = (file, args, options = {}) => {
  const result = spawnSync(file, args, { cwd: options.cwd, stdio: options.capture ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout ?? '' }
}

export function usage() {
  return 'Usage: worktree:new -- <name> <branch>\n  Creates ~/wt-<name> on a new branch <branch>, after reclaiming finished worktrees.'
}

export function buildReapCommand() {
  return ['node', 'scripts/worktree-reap.mjs', '--apply']
}

export function buildWorktreeAddCommand({ bareRepoPath, worktreePath, branch }) {
  return ['git', '-C', bareRepoPath, 'worktree', 'add', worktreePath, '-b', branch, 'origin/main']
}

export function main(argv, { command = defaultCommand, cwd = repositoryRoot } = {}) {
  const [name, branch] = argv
  if (!name || !branch) {
    console.error(usage())
    return 1
  }

  const common = command('git', ['rev-parse', '--git-common-dir'], { cwd, capture: true })
  if (common.status !== 0) {
    console.error('worktree:new: could not resolve the bare repository path')
    return common.status
  }
  const bareRepoPath = resolve(cwd, common.stdout.trim())
  const worktreePath = resolve(dirname(bareRepoPath), `wt-${name}`)

  const [reapFile, ...reapArgs] = buildReapCommand()
  const reap = command(reapFile, reapArgs, { cwd })
  if (reap.status !== 0) {
    console.error('worktree:new: reap failed, not creating the new worktree')
    return reap.status
  }

  const [addFile, ...addArgs] = buildWorktreeAddCommand({ bareRepoPath, worktreePath, branch })
  const add = command(addFile, addArgs, { cwd })
  return add.status
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2))
