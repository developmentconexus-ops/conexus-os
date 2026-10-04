import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const runner = resolve(import.meta.dirname, '../../apps/hub/src/app-runner')
const IMPORT = /^(?:import|export)\s+(?!type\b)[^;]*?\sfrom\s+'([^']+)'|^import\s+'([^']+)'/gm

const runtimeImports = (file) => [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((match) => match[1] ?? match[2])

const staged = () => {
  const source = readFileSync(join(runner, 'sandbox.ts'), 'utf8')
  const list = /for \(const file of \[([^\]]+)\]\) cpSync\(join\(import\.meta\.dirname, file\)/.exec(source)?.[1]
  assert.ok(list, 'sandbox.ts stages the worker files by a literal list')
  return [...list.matchAll(/'([^']+)\.js'/g)].map((match) => match[1])
}

test('the sandboxed worker imports only what the runner stages, pg and node built-ins: never platform/failure or @mastra/core', () => {
  const stagedNames = new Set(staged())
  const seen = new Set()
  const walk = (name) => {
    if (seen.has(name)) return
    seen.add(name)
    for (const specifier of runtimeImports(join(runner, `${name}.ts`))) {
      if (specifier.startsWith('node:') || specifier === 'pg') continue
      assert.ok(specifier.startsWith('./'), `${name}.ts imports ${specifier}, which the sandbox does not mount`)
      const target = specifier.slice(2).replace(/\.js$/, '')
      assert.ok(stagedNames.has(target), `${name}.ts imports ${specifier}, which stageWorkerRuntime does not stage`)
      walk(target)
    }
  }
  walk('worker')
  assert.deepEqual([...seen].sort(), [...stagedNames].sort())
})
