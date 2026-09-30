import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { readProjectInstructions, readProjectMemory, starterProjectFiles } = await import(hubModuleUrl('builder/project-context.js'))

const blob = (text) => ({ type: 'blob', size: text.length, bytes: new TextEncoder().encode(text) })

test('a file within its limit is shown whole, trimmed', () => {
  assert.equal(readProjectInstructions(blob('  regras da empresa\n')), 'regras da empresa')
  assert.equal(readProjectMemory(blob('# Regras\n- [A](a.md): x\n')), '# Regras\n- [A](a.md): x')
})

test('AGENTS.md past 8 KB is cut at a character boundary and says so', () => {
  const text = 'ã'.repeat(5000)
  const shown = readProjectInstructions(blob(text))
  const [kept, note] = shown.split('\n\n')
  assert.equal(note, '[AGENTS.md was cut at 8 KB; the rest is not shown.]')
  assert.ok(new TextEncoder().encode(kept).length <= 8 * 1024)
  assert.equal(kept, 'ã'.repeat(kept.length), 'no character was split')
  assert.ok(kept.length > 4000)
})

test('MEMORY.md past 200 lines is cut at 200 lines, and past 16 KB at 16 KB', () => {
  const lines = Array.from({ length: 250 }, (_, index) => `- line ${index}`).join('\n')
  const byLines = readProjectMemory(blob(lines))
  assert.equal(byLines.split('\n\n')[0].split('\n').length, 200)
  assert.ok(byLines.endsWith('Keep the index shorter.]'))
  const bytes = readProjectMemory(blob('x'.repeat(20000)))
  assert.equal(bytes.split('\n\n')[0].length, 16 * 1024)
})

test('a missing, unreadable, oversized or non-UTF-8 file is an empty file with one line saying why', () => {
  assert.equal(readProjectMemory(null), '[.conexus/memory/MEMORY.md is missing; treat it as empty.]')
  assert.equal(readProjectInstructions(undefined), '[AGENTS.md could not be read; treat it as empty.]')
  assert.equal(readProjectInstructions({ type: 'blob', size: 2_000_000, bytes: null }), '[AGENTS.md is too large to read; treat it as empty.]')
  assert.equal(readProjectInstructions({ type: 'blob', size: 2, bytes: new Uint8Array([0xff, 0xfe]) }), '[AGENTS.md is not UTF-8 text; treat it as empty.]')
})

test('a new Project starts with an AGENTS.md and a MEMORY.md index', () => {
  assert.deepEqual(starterProjectFiles().map((file) => file.path).sort(), ['.conexus/memory/MEMORY.md', 'AGENTS.md'])
})
