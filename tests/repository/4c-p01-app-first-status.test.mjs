import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root=resolve(new URL('../../',import.meta.url).pathname)
const path=p=>resolve(root,p)
const read=p=>readFileSync(path(p),'utf8')

test('P-01 app-first falsifier remains preserved through later authorized block progression',()=>{
  const evidencePath='docs/evidence/4c/p01-p8-app-first-build-root-revision.md'
  assert.equal(existsSync(path(evidencePath)),true,'app-first P8 revision Evidence must exist')
  const evidence=read(evidencePath),roadmap=read('docs/roadmap.md')
  for(const token of [
    'OPERATOR ACCEPTED / P8 APP-FIRST REVISED CANDIDATE / NOT LOCKED',
    'Build → current application + Conexus',
    'Build instruction → BLD-03 CreateChange',
    'Plan instruction → no Change mutation',
    'Change emerges from the work',
    '54e5daef1ff76652ea9841421ff9713c832adaff',
    'Verify #836','Verify #839',
  ]) assert.ok(evidence.includes(token),`app-first revision Evidence missing: ${token}`)

  assert.ok(roadmap.includes('P8 app-first artifact blob = 54e5daef1ff76652ea9841421ff9713c832adaff'),'roadmap must preserve exact app-first predecessor blob')
  assert.ok(roadmap.includes('P8 app-first selected RED = Verify #836 / 111 tests / 109 pass / 2 exact expected failures'),'roadmap must preserve app-first RED')
  assert.ok(roadmap.includes('P8 app-first functional GREEN = Verify #839 SUCCESS'),'roadmap must preserve app-first GREEN')
  assert.doesNotMatch(roadmap,/P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/,'later authorized progression must not assemble P11 or open 4D')
})
