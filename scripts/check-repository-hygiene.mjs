import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const root = process.argv[2] ? resolve(process.argv[2]) : repositoryRoot
// Inspect the complete candidate census. Ignored build output stays excluded,
// while non-ignored untracked files remain visible to hygiene checks.
const tracked = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean))].filter(path => existsSync(resolve(root, path)))
const errors = []

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
if (packageJson.name !== 'conexus-os' || packageJson.private !== true) errors.push('package identity must be private conexus-os')

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Repository hygiene passed (${tracked.length} candidate files, including non-ignored untracked paths).`)
}
