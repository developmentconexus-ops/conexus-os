import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root=resolve(new URL('../../',import.meta.url).pathname)
const path=p=>resolve(root,p)
const read=p=>readFileSync(path(p),'utf8')

test('P-01 density falsifier remains preserved after later bounded revisions, lock and authorized P-02 opening',()=>{
  const evidencePath='docs/evidence/4c/p01-p8-focused-build-session-revision.md'
  assert.equal(existsSync(path(evidencePath)),true,'focused P8 revision Evidence must exist')
  const evidence=read(evidencePath),roadmap=read('docs/roadmap.md')
  for(const token of ['OPERATOR ACCEPTED / P8 FOCUSED REVISED CANDIDATE / NOT LOCKED','Build Overview != Focused Build Session','Preview + Conexus = default focused work','Plan / Findings / Evidence / Details = on-demand inspector','simple by default + inspectable by design','02a07c7f8fd654a75eb066ee914247f0160a64f8','Verify #829','Verify #831']) assert.ok(evidence.includes(token),`focused revision Evidence missing: ${token}`)
  assert.ok(roadmap.includes('P-01 = LOCKED / OPERATOR APPROVED / AGENT STUDIO DELTA RE-LOCKED / P9/P10 CLOSED'),'roadmap must preserve the P-01 baseline and approved Agent Studio delta')
  assert.doesNotMatch(roadmap,/P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/,'later authorized progression must not assemble P11 or open 4D')
})
