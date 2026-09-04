import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const profile = JSON.parse(readFileSync(resolve(root, 'profiles/r1/v1/rc01-candidate-custody.json'), 'utf8'))
const prechange = JSON.parse(readFileSync(resolve(root, profile.preChangeInventory), 'utf8'))
const excluded = new Map(prechange.entries
  .filter(entry => profile.excludedPreChangePaths.includes(entry.path))
  .map(entry => [entry.path, entry]))
const errors = []
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const raw = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root })
const records = raw.toString('utf8').split('\0').filter(Boolean)
const seenExcluded = new Set()

for (let index = 0; index < records.length; index += 1) {
  const record = records[index]
  const status = record.slice(0, 2)
  let path = record.slice(3).replaceAll('\\', '/')
  if (status.includes('R') || status.includes('C')) path = records[++index].replaceAll('\\', '/')
  const expected = excluded.get(path)
  if (expected) {
    seenExcluded.add(path)
    if (status !== '??') errors.push(`RC01_EXCLUDED_PATH_IS_TRACKED:${path}:${status}`)
    else {
      const bytes = readFileSync(resolve(root, path))
      if (bytes.length !== expected.size || sha256(bytes) !== expected.sha256) errors.push(`RC01_EXCLUDED_PATH_DRIFT:${path}`)
    }
    continue
  }
  if (status === '??') errors.push(`RC01_UNCLASSIFIED_UNTRACKED:${path}`)
  else if (status[1] !== ' ') errors.push(`RC01_UNSTAGED_WORKTREE_DELTA:${path}:${status}`)
}

for (const [path, entry] of excluded) {
  if (entry.state === 'untracked' && !seenExcluded.has(path)) errors.push(`RC01_EXCLUDED_PATH_MISSING:${path}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`RC01 local candidate admission passed (excluded-preserved=${excluded.size}).`)
}
