import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const root = process.argv[2] ? resolve(process.argv[2]) : repositoryRoot
const errors = []
// Candidate Evidence may still be untracked while a dirty worktree is being
// reviewed. Include every tracked and non-ignored Markdown path so a new
// packet cannot pass merely because it has not been committed yet.
const tracked = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean))].filter(path => existsSync(resolve(root, path)))
const durable = tracked.filter(path =>
  path.startsWith('docs/') &&
  !path.startsWith('docs/work/') &&
  !path.includes('/evidence/') &&
  !path.startsWith('docs/evidence/')
)
const links = new Map()

for (const path of tracked) {
  const text = readFileSync(resolve(root, path), 'utf8')
  const outgoing = []
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0]
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue
    const absolute = resolve(root, dirname(path), decodeURIComponent(target))
    if (!existsSync(absolute)) errors.push(`broken link: ${path} -> ${target}`)
    else {
      const repositoryPath = relative(root, absolute).replaceAll('\\', '/')
      if (repositoryPath.endsWith('.md')) outgoing.push(repositoryPath)
    }
  }
  links.set(path, outgoing)
}

if (!existsSync(resolve(root, 'docs/index.md'))) errors.push('missing docs/index.md')
else {
  const seen = new Set(['docs/index.md'])
  const queue = ['docs/index.md']
  while (queue.length) {
    const current = queue.shift()
    for (const next of links.get(current) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  for (const path of durable) if (!seen.has(path)) errors.push(`orphan durable document: ${path}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log('Documentation index, reachability, and relative links passed.')
}
