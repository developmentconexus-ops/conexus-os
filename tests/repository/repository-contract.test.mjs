import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const run = script => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
let mutationQueue = Promise.resolve()
const serialTest = (name, fn) => test(name, async context => {
  const previous = mutationQueue
  let release
  mutationQueue = new Promise(resolveQueue => { release = resolveQueue })
  await previous
  try { return await fn(context) } finally { release() }
})

serialTest('Conexus OS repository contract is green', () => {
  for (const script of [
    'scripts/check-repository-hygiene.mjs',
    'scripts/check-doc-index.mjs',
    'scripts/check-current-state.mjs',
    'scripts/check-qualification-provenance.mjs'
  ]) {
    execFileSync(process.execPath, [script], { cwd: root, stdio: 'inherit' })
  }
})

serialTest('repository hygiene guard fires on temporary work contamination', () => {
  const workRoot = resolve(root, 'docs/work')
  const workRootExisted = existsSync(workRoot)
  const workDir = resolve(workRoot, 'current')
  const file = resolve(workDir, 'forbidden-fixture.md')
  const existed = existsSync(file)
  const original = existed ? readFileSync(file, 'utf8') : null
  mkdirSync(workDir, { recursive: true })
  writeFileSync(file, '# temporary review\n')
  try {
    const result = run('scripts/check-repository-hygiene.mjs')
    const output = `${result.stdout}\n${result.stderr}`
    if (result.status === 0 || !output.includes('docs/work')) throw new Error('hygiene negative control did not fire')
  } finally {
    if (existed) writeFileSync(file, original)
    else rmSync(file, { force: true })
    if (!workRootExisted) rmSync(workRoot, { recursive: true, force: true })
  }
})

serialTest('bootstrap/status guard fires when README becomes a phase authority', () => {
  const path = resolve(root, 'README.md')
  const original = readFileSync(path, 'utf8')
  writeFileSync(path, `${original}\n3N = NEXT / NOT STARTED\n`)
  try {
    const result = run('scripts/check-current-state.mjs')
    const output = `${result.stdout}\n${result.stderr}`
    if (result.status === 0 || !output.includes('README.md')) throw new Error('status negative control did not fire')
  } finally {
    writeFileSync(path, original)
  }
})

serialTest('phase progression guard fires when more than one phase is active', () => {
  const path = resolve(root, 'docs/roadmap.md')
  const original = readFileSync(path, 'utf8')
  let mutated = original.replace('| 3N | CLOSED |', '| 3N | OPEN / ACTIVE |')
  mutated = mutated.replace('| 3O | CLOSED |', '| 3O | OPEN / ACTIVE |')
  if (mutated === original) throw new Error('active-phase negative-control mutation target missing')
  writeFileSync(path, mutated)
  try {
    const result = run('scripts/check-current-state.mjs')
    const output = `${result.stdout}\n${result.stderr}`
    if (result.status === 0 || !output.includes('OPEN / ACTIVE')) throw new Error('active-phase negative control did not fire')
  } finally {
    writeFileSync(path, original)
  }
})

serialTest('C-018 ratification review cannot overlap an open architecture phase', () => {
  const path = resolve(root, 'docs/roadmap.md')
  const original = readFileSync(path, 'utf8')
  let mutated = original.replace('| C-018 | RATIFIED / OPERATOR RATIFIED |', '| C-018 | OPEN / RATIFICATION REVIEW |')
  mutated = mutated.replace('| 3O | CLOSED |', '| 3O | OPEN / ACTIVE |')
  if (mutated === original) throw new Error('C-018 overlap mutation target missing')
  writeFileSync(path, mutated)
  try {
    const result = run('scripts/check-current-state.mjs')
    const output = `${result.stdout}\n${result.stderr}`
    if (result.status === 0 || !output.includes('C-018 ratification review requires all phases CLOSED')) {
      throw new Error(`C-018 overlap negative control did not fire:\n${output}`)
    }
  } finally {
    writeFileSync(path, original)
  }
})

serialTest('C-018 ratification alone cannot unblock Product implementation', () => {
  const path = resolve(root, 'docs/roadmap.md')
  const original = readFileSync(path, 'utf8')
  const mutated = original.replace('| Product implementation | BLOCKED |', '| Product implementation | AUTHORIZED |')
  if (mutated === original) throw new Error('C-018 deny-only mutation target missing')
  writeFileSync(path, mutated)
  try {
    const result = run('scripts/check-current-state.mjs')
    const output = `${result.stdout}\n${result.stderr}`
    if (result.status === 0 || !output.includes('Product implementation must remain BLOCKED')) {
      throw new Error(`C-018 deny-only negative control did not fire:\n${output}`)
    }
  } finally {
    writeFileSync(path, original)
  }
})

serialTest('ratified C-018 cannot coexist with an unclosed architecture phase', () => {
  const path = resolve(root, 'docs/roadmap.md')
  const original = readFileSync(path, 'utf8')
  const mutated = original.replace('| 3O | CLOSED |', '| 3O | OPEN / ACTIVE |')
  if (mutated === original) throw new Error('C-018 ratified-continuity mutation target missing')
  writeFileSync(path, mutated)
  try {
    const result = run('scripts/check-current-state.mjs')
    const output = `${result.stdout}\n${result.stderr}`
    if (result.status === 0 || !output.includes('C-018 ratification requires all phases CLOSED')) {
      throw new Error(`C-018 ratified continuity negative control did not fire:\n${output}`)
    }
  } finally {
    writeFileSync(path, original)
  }
})
