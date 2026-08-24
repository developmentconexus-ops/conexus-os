import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('P-01 shell-coherence revision remains preserved through later approved refinements and lock', () => {
  const roadmap = read('docs/roadmap.md')
  const html = read('docs/evidence/4c/p01-build-workspace-functional-wireframe.html')

  assert.ok(roadmap.includes('P8 shell-coherence selected RED = Verify #824 / 108 tests / 107 pass / 1 exact expected failure'), 'roadmap must preserve shell-coherence RED')
  assert.ok(roadmap.includes('P8 revised shell GREEN = Verify #825 SUCCESS'), 'roadmap must preserve revised shell GREEN')
  assert.ok(roadmap.includes('P8 revised artifact blob = 43ec72ec7443e6d28cbd3abcd0cb79f2d1955db7'), 'roadmap must preserve revised shell predecessor blob')
  assert.ok(roadmap.includes('P8 superseded artifact blob = 0abcde6902a1540aabb07e54ff08d59ad430e7ab'), 'roadmap must preserve first P8 predecessor blob')
  assert.ok(html.includes('GF-01 shell inherited'), 'current artifact must carry shell inheritance marker')
  assert.ok(html.includes('data-shell="single-adaptive-rail"'), 'current artifact must inherit the locked single adaptive rail')
  assert.doesNotMatch(roadmap, /P-02\+?\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'later P-01 refinement/lock must not advance later blocks')
})
