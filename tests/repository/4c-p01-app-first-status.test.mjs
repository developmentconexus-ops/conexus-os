import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root=resolve(new URL('../../',import.meta.url).pathname)
const path=p=>resolve(root,p)
const read=p=>readFileSync(path(p),'utf8')

test('P-01 app-first falsifier advances only to app-first P8 operator walkthrough',()=>{
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

  assert.ok(roadmap.includes('P-01 = OPEN / F14 GREEN / P7 OPERATOR APPROVED / P8 APP-FIRST REVISED CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED'),'roadmap must expose app-first current state')
  assert.ok(roadmap.includes('P8 app-first artifact blob = 54e5daef1ff76652ea9841421ff9713c832adaff'),'roadmap must pin exact app-first blob')
  assert.ok(roadmap.includes('P8 app-first selected RED = Verify #836 / 111 tests / 109 pass / 2 exact expected failures'),'roadmap must pin app-first RED')
  assert.ok(roadmap.includes('P8 app-first functional GREEN = Verify #839 SUCCESS'),'roadmap must pin app-first GREEN')
  assert.ok(roadmap.includes('Operator walkthrough/adjudication of app-first P-01 P8 artifact: APPROVE | REVISE'),'roadmap must stop at app-first walkthrough gate')
  assert.doesNotMatch(roadmap,/P-01\s*=\s*LOCKED|P-02\+?\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/,'app-first revision must not advance later gates')
})
