import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'

const hub = resolve(import.meta.dirname, '../../apps/hub/src')
const IMPORT = /^(?:import|export)\s+(?!type\b)[^;]*?\sfrom\s+'([^']+)'|^import\s+'([^']+)'/gm

const literal = (source, name) => {
  const list = new RegExp(`const ${name} = \\[([^\\]]+)\\]`).exec(source)?.[1]
  assert.ok(list, `sandbox.ts declares ${name} as a literal list`)
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

const walkWorker = (read, staged, packages) => {
  const violations = []
  const seen = new Set()
  const walk = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const match of read(file).matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2]
      if (specifier.startsWith('node:') || packages.includes(specifier)) continue
      if (!specifier.startsWith('.')) {
        violations.push(`${file} imports ${specifier}`)
        continue
      }
      const target = relative(hub, resolve(hub, dirname(file), specifier))
      if (!staged.includes(target)) {
        violations.push(`${file} imports ${target}`)
        continue
      }
      walk(target)
    }
  }
  walk('app-runner/worker.js')
  return { seen: [...seen].sort(), violations }
}

const source = (file) => readFileSync(join(hub, file.replace(/\.js$/, '.ts')), 'utf8')
const sandbox = readFileSync(join(hub, 'app-runner/sandbox.ts'), 'utf8')
const staged = literal(sandbox, 'STAGED_FILES')
const packages = literal(sandbox, 'STAGED_PACKAGES')

test('the sandboxed worker imports only what the runner stages, pg, zod and node built-ins', () => {
  const { seen, violations } = walkWorker(source, staged, packages)
  assert.deepEqual(violations, [])
  assert.deepEqual(seen, [...staged].sort())
})

test('a worker module that also imports platform/failure is reported as the one violation', () => {
  const read = (file) => (file === 'app-runner/wire.js' ? `${source(file)}\nimport { Failure } from '../platform/failure.js'\n` : source(file))
  assert.deepEqual(walkWorker(read, staged, packages).violations, ['app-runner/wire.js imports platform/failure.js'])
})
