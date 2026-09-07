import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
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

const roadmap = readFileSync(resolve(root, 'docs/roadmap.md'), 'utf8')
for (const bootstrap of ['README.md', 'AGENTS.md']) {
  const text = readFileSync(resolve(root, bootstrap), 'utf8')
  if (/^(?:3[A-O]|4[A-G]|C-018|Product implementation)\s*=\s*(?:NEXT|OPEN|CLOSED|BLOCKED|AUTHORIZED|RATIFIED)\b/m.test(text)) {
    errors.push(`${bootstrap} must route current status to docs/roadmap.md instead of becoming phase authority`)
  }
}

const phaseRows = new Map(
  [...roadmap.matchAll(/^\| ([^|]+?) \| ([^|]+?) \|/gm)].map(([, phase, status]) => [phase.trim(), status.trim()])
)
const activeArchitecturePhases = [...phaseRows]
  .filter(([phase, status]) => /^3(?:[A-O]|B–3K)$/.test(phase) && status === 'OPEN / ACTIVE')
if (activeArchitecturePhases.length > 1) {
  errors.push(`more than one architecture phase is OPEN / ACTIVE: ${activeArchitecturePhases.map(([phase]) => phase).join(', ')}`)
}

const architectureClosed = ['3A', '3B–3K', '3L', '3M', '3N', '3O']
  .every(phase => phaseRows.get(phase) === 'CLOSED')
const c018Status = phaseRows.get('C-018')
if (c018Status === 'OPEN / RATIFICATION REVIEW' && !architectureClosed) {
  errors.push('C-018 ratification review requires all phases CLOSED')
}
if (c018Status === 'RATIFIED / OPERATOR RATIFIED' && !architectureClosed) {
  errors.push('C-018 ratification requires all phases CLOSED')
}
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
const workingTreeStatus = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
if (workingTreeStatus.length && process.env.CONEXUS_ALLOW_DIRTY_WORKTREE !== '1') {
  errors.push(`canonical committed-tree verification requires a clean worktree; run r1:rc01:admission while forming a candidate (${workingTreeStatus.length} paths present)`)
}
for (const workflow of tracked.filter(path => path.startsWith('.github/workflows/'))) {
  const text = readFileSync(resolve(root, workflow), 'utf8')
  if (text.includes('pull_request_target')) errors.push(`unsafe pull_request_target trigger: ${workflow}`)
  if (/^\s*contents:\s*write\s*$/m.test(text)) errors.push(`workflow has contents: write permission: ${workflow}`)
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

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Canonical committed repository tree passed (required=${required.length}, changed=${changed.length}).`)
}
