import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const root = process.argv[2] ? resolve(process.argv[2]) : repositoryRoot
const errors = []
const required = [
  'AGENTS.md',
  'docs/index.md',
  'docs/roadmap.md',
  'docs/product/contract.md',
  'docs/architecture/index.md',
  'docs/decisions/index.md',
  'docs/development/engineering-method.md',
  'docs/development/repository-method.md',
  'docs/development/frontend-product-experience-planning-method.md',
  'docs/development/engineering-rules.md',
  'contracts/api/product/openapi.yaml',
  'package.json'
]

for (const path of required) {
  if (!existsSync(resolve(root, path))) errors.push(`missing required repository file: ${path}`)
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
if (pkg.name !== 'conexus-os' || pkg.private !== true) errors.push('package identity must remain private conexus-os')

const files = [...new Set(execFileSync('git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))]
  .filter(path => existsSync(resolve(root, path)))

for (const workflow of files.filter(path => path.startsWith('.github/workflows/'))) {
  const text = readFileSync(resolve(root, workflow), 'utf8')
  if (text.includes('pull_request_target')) errors.push(`unsafe pull_request_target trigger: ${workflow}`)
  if (/^\s*contents:\s*write\s*$/m.test(text)) errors.push(`workflow has contents: write permission: ${workflow}`)
}

const diffRanges = [[], ['--cached']]
for (const base of ['origin/main', 'main']) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: root, stdio: 'ignore' })
    diffRanges.push([`${base}...HEAD`])
    break
  } catch {}
}
for (const range of diffRanges) {
  try {
    execFileSync('git', ['diff', '--check', ...range], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    const conflicts = output.split('\n').filter(line => line.includes('leftover conflict marker'))
    if (conflicts.length) errors.push(`unresolved merge-conflict marker: ${conflicts.join(' | ')}`)
    else if (error.status !== 2) errors.push(`git diff check failed: ${output.trim()}`)
  }
}

const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
for (const path of untracked) {
  const bytes = readFileSync(resolve(root, path))
  if (!bytes.includes(0) && /^(?:<{7} |={7}$|>{7} )/m.test(bytes.toString('utf8'))) {
    errors.push(`unresolved merge-conflict marker: ${path}`)
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Current repository checks passed (required=${required.length}, files=${files.length}).`)
}
