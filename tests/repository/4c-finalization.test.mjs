import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root=fileURLToPath(new URL('../../',import.meta.url))
const read=path=>readFileSync(resolve(root,path),'utf8')
const closure=read('docs/evidence/4c/4c-finalization-and-visual-inputs.md')
const p12=read('docs/evidence/4c/p12-whole-product-fusion-review.md')
const roadmap=read('docs/roadmap.md')
const index=read('docs/index.md')

test('P12 closes only after F01/F02 correction and current P11 lock',()=>{
  assert.match(p12,/P12 CLOSED \/ CLEAR \/ F01-F02 CORRECTED/)
  assert.match(p12,/P12-F01 = CORRECTED/)
  assert.match(p12,/P12-F02 = CORRECTED/)
  assert.match(p12,/material UX\/architecture findings = 0/)
  assert.ok(p12.includes('45172fd437b0c3b0236b641bcb803c20f165959f'))
  assert.match(roadmap,/P12 = CLOSED \/ CLEAR/)
})

test('4C-13 consolidates generated consumption, custody, topology and P13 handoff',()=>{
  for(const token of [
    '4C-13 CLOSED / 4C-14 PENDING / OPERATOR 4C RATIFICATION PENDING',
    'canonical 4B OpenAPI/wire','generated transport/type projection','handwritten parallel Product DTO/schema registries',
    '`SERVER`','`URL_NAVIGATION`','`FORM_DRAFT`','`EPHEMERAL_UI`',
    'Keycloak / configured OIDC','Conexus Account + opaque session','current Conexus authorization/disclosure',
    'Framework-neutral feature topology','P13 visual-design handoff inputs','P14 and 4D boundary',
    'reading order','region priority','interaction model','density class','responsive behavior',
    'Ask Conexus','prefers-reduced-motion','FUTURE_PRODUCT_APP',
    '4C-A02','REJECTED AS MATERIAL CLOSURE DEPENDENCY',
  ])assert.ok(closure.includes(token),`4C-13 closure missing ${token}`)
  assert.match(index,/4C-13 closure \+ P13 inputs/)
})

test('4C remains open at authorized checkpoint/review/ratification gate and does not open 4D',()=>{
  assert.match(roadmap,/4C = OPEN \/ METHOD v2\.3 \/ P12 CLOSED \/ 4C-13 CLOSED \/ P12-F03 CHECKPOINT AUTHORIZED \/ 4C-14 NEXT \/ OPERATOR RATIFICATION PENDING/)
  assert.match(roadmap,/P12-F03 = AUTHORIZED \/ THIS REVISION IS THE LOCAL IMMUTABLE CHECKPOINT \/ PUSH-PR-MERGE UNAUTHORIZED/)
  assert.match(roadmap,/4D — Project Paved Road & Runtime Realization \| NOT STARTED/)
  assert.match(roadmap,/Product implementation \| BLOCKED/)
  assert.match(roadmap,/no push\/PR\/merge/i)
  assert.doesNotMatch(closure,/selected (?:React|Next|Tailwind|Mastra|router|state library|SDK|runtime|design system)/i)
})
