import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const html = readFileSync(resolve(root, 'docs/evidence/4c/p01-build-workspace-functional-wireframe.html'), 'utf8')

test('P-01 approved app-first P8 places Conexus chat on the right of the current application', () => {
  assert.ok(html.includes('data-chat-side="right"'), 'approved Build root must pin right-side Conexus chat')
  assert.match(html, /\.builder-layout\{[^}]*grid-template-columns:minmax\(0,1fr\) var\(--chat\)/, 'wide Build layout must allocate application first and chat second')
  const layoutStart = html.indexOf('<div class="builder-layout"')
  const workspace = html.indexOf('<section class="workspace">', layoutStart)
  const chat = html.indexOf('<aside id="chat-sidebar"', layoutStart)
  assert.ok(layoutStart >= 0 && workspace > layoutStart && chat > workspace, 'DOM reading order must place application workspace before right-side chat')
  assert.ok(html.includes('Conexus chat = right sidebar'), 'P8 must carry the approved right-sidebar interaction invariant')
})
