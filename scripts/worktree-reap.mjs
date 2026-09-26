// Removes the WSL worktrees whose work already lives on GitHub.
// Dry run by default. `--apply` runs `git worktree remove` without `--force` on each planned path.
// A worktree is removed only when its branch's pull request is closed or merged, its HEAD is that
// pull request's head commit, and it holds nothing but regenerable build output.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const REGENERABLE = [
  /(^|\/)(node_modules|dist|dist_keycloak|coverage)(\/|$)/,
  /^apps\/hub\/public\//,
  /^apps\/hub\/\.conexus-build-[^/]*\//,
  /^apps\/hub\/[^/]*-build-[^/]*\//,
]

export function parseWorktrees(porcelain) {
  return porcelain.trim().split('\n\n').map(block => {
    const entry = { path: null, head: null, branch: null, bare: false }
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) entry.branch = line.slice('branch refs/heads/'.length)
      else if (line === 'bare') entry.bare = true
    }
    return entry
  })
}

export function parseStatus(porcelain) {
  const lines = porcelain.split('\n').filter(Boolean)
  return {
    changes: lines.filter(line => !line.startsWith('!! ')).length,
    ignored: lines.filter(line => line.startsWith('!! ')).map(line => line.slice(3)),
  }
}

export function planReap({ worktrees, pullRequests, statusOf, exists, current }) {
  return worktrees.filter(worktree => !worktree.bare && worktree.path !== current).map(worktree => {
    const keep = reason => ({ path: worktree.path, action: 'keep', reason })
    if (!exists(worktree.path)) return keep('missing directory')
    if (!worktree.branch) return keep('detached HEAD')
    const own = pullRequests.filter(pr => pr.headRefName === worktree.branch)
    if (own.length === 0) return keep('no pull request')
    if (own.some(pr => pr.state === 'OPEN')) return keep('open pull request')
    const match = own.find(pr => pr.headRefOid === worktree.head)
    if (!match) return keep('HEAD is not a pull request head')
    const status = statusOf(worktree.path)
    if (status.changes > 0) return keep(`${status.changes} uncommitted changes`)
    const kept = status.ignored.filter(path => !REGENERABLE.some(pattern => pattern.test(path)))
    if (kept.length > 0) return keep(`ignored files: ${kept.join(', ')}`)
    return { path: worktree.path, action: 'remove', reason: `#${match.number} ${match.state.toLowerCase()}` }
  })
}

const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

function main() {
  const apply = process.argv.includes('--apply')
  const current = run('git', ['rev-parse', '--show-toplevel']).trim()
  const plan = planReap({
    worktrees: parseWorktrees(run('git', ['worktree', 'list', '--porcelain'])),
    pullRequests: JSON.parse(run('gh', ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,state,headRefName,headRefOid'])),
    statusOf: path => parseStatus(run('git', ['status', '--porcelain', '--ignored'], path)),
    exists: existsSync,
    current,
  })
  for (const entry of plan) console.log(`${entry.action}\t${entry.path}\t${entry.reason}`)
  const removals = plan.filter(entry => entry.action === 'remove')
  console.log(`${removals.length} to remove, ${plan.length - removals.length} kept`)
  if (!apply) return
  for (const entry of removals) run('git', ['worktree', 'remove', entry.path])
  console.log(`removed ${removals.length}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
