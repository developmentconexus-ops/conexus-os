import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(new URL('../', import.meta.url).pathname)
const errors = []
const required = [
  'AGENTS.md',
  'docs/index.md',
  'docs/roadmap.md',
  'docs/product/contract.md',
  'docs/architecture/index.md',
  'docs/decisions/index.md',
  'docs/development/engineering-method.md',
  'docs/development/frontend-product-experience-planning-method.md',
  'docs/development/engineering-rules.md',
  'contracts/api/product/openapi.yaml',
  'tests/repository/4c-p02-walkthrough-script-parse.test.mjs',
  'package.json'
]

for (const path of required) {
  if (!existsSync(resolve(root, path))) errors.push(`missing required repository file: ${path}`)
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
if (pkg.name !== 'conexus-os' || pkg.private !== true) errors.push('package identity must remain private conexus-os')

const roadmap = readFileSync(resolve(root, 'docs/roadmap.md'), 'utf8')
const implementationBlocked = /^\| Product implementation \| BLOCKED \|/m.test(roadmap)

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
for (const workflow of tracked.filter(path => path.startsWith('.github/workflows/'))) {
  const text = readFileSync(resolve(root, workflow), 'utf8')
  if (text.includes('pull_request_target')) errors.push(`unsafe pull_request_target trigger: ${workflow}`)
}

let base = ''
for (const candidate of ['origin/main', 'main']) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${candidate}^{commit}`], { cwd: root, stdio: 'ignore' })
    base = candidate
    break
  } catch {}
}

let changed = []
if (base) {
  const range = `${base}...HEAD`
  changed = execFileSync('git', ['diff', '--name-only', range], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)

  try {
    execFileSync('git', ['diff', '--check', range], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    const conflicts = output.split('\n').filter(line => line.includes('leftover conflict marker'))
    if (conflicts.length) errors.push(`unresolved merge-conflict marker: ${conflicts.join(' | ')}`)
  }
}

if (implementationBlocked) {
  for (const path of changed) {
    if (/^(apps|src|server|backend|frontend|internal|cmd|migrations)\//.test(path)) {
      errors.push(`Product implementation is BLOCKED but candidate changes implementation surface: ${path}`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Current repository state passed (required=${required.length}, implementation_blocked=${implementationBlocked}, changed=${changed.length}).`)
}
