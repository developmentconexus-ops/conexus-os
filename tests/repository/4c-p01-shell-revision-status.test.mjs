import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('P-01 shell-coherence revision remains preserved through later authorized block progression', () => {
  const roadmap = read('docs/roadmap.md')
  const html = read('docs/evidence/4c/p01-build-workspace-functional-wireframe.html')

  assert.ok(roadmap.includes('P-01 = LOCKED / OPERATOR APPROVED / AGENT STUDIO DELTA RE-LOCKED / P9/P10 CLOSED'), 'roadmap must preserve the P-01 baseline and approved Agent Studio delta')
  assert.ok(html.includes('GF-01 shell inherited'), 'current artifact must carry shell inheritance marker')
  assert.ok(html.includes('data-shell="single-adaptive-rail"'), 'current artifact must inherit the locked single adaptive rail')
  assert.doesNotMatch(roadmap, /P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'later authorized progression must not assemble P11 or open 4D')
})
