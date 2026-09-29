import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'node_modules/conexus-memory-status-'))
const componentPath = resolve(buildRoot, 'memory-status.cjs')
const build = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/web/src/features/builder/composer/memory-status.tsx'),
  `--outfile=${componentPath}`,
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--jsx=automatic',
  '--loader:.css=empty',
  '--external:react',
  '--external:react-dom',
  '--external:react/jsx-runtime',
  '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
assert.equal(build.status, 0, build.stderr)
const { MemoryStatus } = createRequire(import.meta.url)(componentPath)

const memory = { progress: { status: 'idle', pendingTokens: 104_145, threshold: 30_000, observationTokens: 547, reflectionThreshold: 40_000 }, bufferingMessages: false, bufferingObservations: false }
const spoken = (failed) => /aria-label="([^"]*)"/.exec(renderToStaticMarkup(createElement(MemoryStatus, { memory, failed })))?.[1]

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

test('the ring reads as before while memory works', () => {
  assert.equal(spoken(null), 'Memória da conversa: Mensagens até a próxima observação, 104,1 de 30 mil tokens. Observações até a próxima reflexão, 0,5 de 40 mil tokens')
})

test('a failed observation says so on the message budget, and a failed reflection on the memory budget', () => {
  assert.equal(spoken('observation'), 'Memória da conversa: Não foi possível guardar as mensagens na memória, 104,1 de 30 mil tokens. Observações até a próxima reflexão, 0,5 de 40 mil tokens')
  assert.equal(spoken('reflection'), 'Memória da conversa: Mensagens até a próxima observação, 104,1 de 30 mil tokens. Não foi possível resumir as observações, 0,5 de 40 mil tokens')
})
