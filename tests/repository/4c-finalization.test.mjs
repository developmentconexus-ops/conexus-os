import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root=fileURLToPath(new URL('../../',import.meta.url))
const read=path=>readFileSync(resolve(root,path),'utf8')
const closure=read('docs/evidence/4c/4c-finalization-and-visual-inputs.md')
const p12=read('docs/evidence/4c/p12-whole-product-fusion-review.md')
const review=read('docs/evidence/4c/4c-final-review.md')

test('P12 closes only after F01/F02 correction and current P11 lock',()=>{
  assert.match(p12,/P12 CLOSED \/ CLEAR \/ F01-F02 CORRECTED/)
  assert.match(p12,/P12-F01 = CORRECTED/)
  assert.match(p12,/P12-F02 = CORRECTED/)
  assert.match(p12,/material UX\/architecture findings = 0/)
  assert.ok(p12.includes('45172fd437b0c3b0236b641bcb803c20f165959f'))
  assert.match(p12,/^> \*\*Status:\*\* `P12 CLOSED \/ CLEAR/m)
})

test('4C-13 consolidates generated consumption, custody, topology and P13 handoff',()=>{
  for(const token of [
    '4C CLOSED / OPERATOR RATIFIED / P13 INPUTS PRESERVED',
    'canonical 4B OpenAPI/wire','generated transport/type projection','handwritten parallel Product DTO/schema registries',
    '`SERVER`','`URL_NAVIGATION`','`FORM_DRAFT`','`EPHEMERAL_UI`',
    'Keycloak / configured OIDC','Conexus Account + opaque session','current Conexus authorization/disclosure',
    'Framework-neutral feature topology','P13 visual-design handoff inputs','P14 and 4D boundary',
    'reading order','region priority','interaction model','density class','responsive behavior',
    'Ask Conexus','prefers-reduced-motion','FUTURE_PRODUCT_APP',
    '4C-A02','REJECTED AS MATERIAL CLOSURE DEPENDENCY',
    'CLOSED / 1eb33a93fd2bcd32c2cc7d9565aa617430a47771 / NO PUSH-PR-MERGE',
  ])assert.ok(closure.includes(token),`4C-13 closure missing ${token}`)
  assert.match(closure,/^> \*\*Status:\*\* `4C CLOSED \/ OPERATOR RATIFIED \/ P13 INPUTS PRESERVED`/m)
})

test('4C operator ratification precedes the separately gated 4D opening',()=>{
  assert.match(review,/4C = CLOSED \/ OPERATOR RATIFIED/)
  assert.doesNotMatch(closure,/selected (?:React|Next|Tailwind|Mastra|router|state library|SDK|runtime|design system)/i)
  assert.match(closure,/P14 is distributed across 4D–4G/)
})

test('4C-14 records the independent correction loop and clear verdict',()=>{
  assert.match(review,/Reviewed checkpoint.*1eb33a93fd2bcd32c2cc7d9565aa617430a47771/)
  assert.match(review,/4C-A02 = REJECTED AS MATERIAL CLOSURE DEPENDENCY/)
  assert.match(review,/4C CLEAR FOR OPERATOR RATIFICATION\s+= YES/)
  assert.match(review,/OPTIONAL RESIDUE\s+= 1 \/ DEFERRED SAFELY/)
  assert.match(review,/4C = CLOSED \/ OPERATOR RATIFIED/)
})
