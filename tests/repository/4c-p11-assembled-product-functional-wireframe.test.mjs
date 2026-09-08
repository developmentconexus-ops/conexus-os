import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root=fileURLToPath(new URL('../../',import.meta.url))
const read=path=>readFileSync(resolve(root,path),'utf8')
const blob=path=>{const bytes=Buffer.from(read(path).replaceAll('\r\n','\n'),'utf8');return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')}
const html=read('docs/evidence/4c/p11-assembled-product-functional-wireframe.html')
const lock=read('docs/evidence/4c/p11-assembled-product-lock.md')
const fusion=read('docs/evidence/4c/p12-whole-product-fusion-review.md')

const current=[
  ['T-01','t01','t01-trusted-setup-functional-wireframe.html','4da586d8a421bb03413bc82ee5b2e82432d6f620'],
  ['GF-01','gf01','gf01-global-frame-wireframe.html','603b47ccaba1fe6557e557b48efa4f40207d3724'],
  ['W-01','w01','w01-projects-inception-wireframe.html','d466d66a125605471f2f879bbe376e4de7681d95'],
  ['W-02A','w02a','w02a-brain-functional-wireframe.html','f0a6902737a36217b081ff61768caa39c98c4734'],
  ['W-02B','w02b','w02b-connections-functional-wireframe.html','f8a4be72cd5af86ea06b4dd82d8710e58edb203f'],
  ['W-03','w03','w03-people-access-audit-functional-wireframe.html','e9d630622d853d6e352737f46202f2765526fd6a'],
  ['W-04','w04','w04-agent-catalog-functional-wireframe.html','71e03432a0abd34ae35301094010fd670bb78b98'],
  ['P-01','p01','p01-build-workspace-functional-wireframe.html','25e5077106892c4ff6aba6774987e73a12ccff51'],
  ['P-02','p02','p02-project-resources-functional-wireframe.html','fd23303ac71bbf256887bf361fb0f8c7cf9aae00'],
  ['P-03','p03','p03-product-agent-functional-wireframe.html','17d31534fac0e57a74f70202567b23d8a63cd3c0'],
  ['P-04','p04','p04-release-operations-functional-wireframe.html','e036684e3e66d028361db2d708cf05811a367f4b'],
  ['P-05','p05','p05-project-lifecycle-and-published-app-access-functional-wireframe.html','d00b2126667a0a51317c653c57c237444a129dfb'],
  ['PA-01','pa01','pa01-published-app-product-agent-functional-wireframe.html','ffba5935d8fccd0fc5d7ad4d275fe38b09294674'],
]

test('behavioral P11 mounts the 13 exact Families 1-4 re-locked inputs',()=>{
  for(const [block,key,file,identity] of current){
    assert.equal(blob(`docs/evidence/4c/${file}`),identity,`${block} current input drifted`)
    assert.ok(html.includes(file),`${block} mount file missing`)
    assert.ok(html.includes(identity),`${block} current blob missing`)
    assert.match(html,new RegExp(`\\b${key}:\\{`),`${block} registry key missing`)
  }
  assert.match(fusion,/P12 CLOSED \/ CLEAR \/ F01-F02 CORRECTED/)
})

test('current behavioral P11 is operator-locked while the historical lock remains preserved',()=>{
  const historical='536052096dd10dec2f604ccef49aa64ba52e4dac'
  const current='45172fd437b0c3b0236b641bcb803c20f165959f'
  assert.match(lock,/LOCKED \/ OPERATOR APPROVED/)
  assert.ok(lock.includes(historical))
  assert.ok(lock.includes(current))
  assert.ok(lock.includes(historical))
  assert.ok(lock.includes(current))
  assert.equal(blob('docs/evidence/4c/p11-assembled-product-functional-wireframe.html'),current)
  assert.match(html,/P11 CANDIDATE · NOT LOCKED/)
})

test('P11 is same-origin transport-only and advances only validated owner events',()=>{
  for(const token of [
    "window.addEventListener('message',receiveMessage)","event.origin!==location.origin","event.source!==currentFrame.contentWindow",
    "event.data?.type!=='conexus:wireframe-egress'",'normalizeEnvelope','validateEdgeEnvelope','serializeDestination','exactCoordinateKeys',
    "'originatingRun[kind]'","'originatingRun[ref]'",'DIRECT_REVIEW_INGRESS','EDGE_REJECTED','DESTINATION_REFUSED',
    'APPROVAL_RUN_EFFECT_INVESTIGATION_REQUESTED','IAM-15_PUBLISHED_APP_ACCESS_GRANTED','PROJECT_BASELINE_APPROVED','VERIFIED_CHANGE_BOUNDARY',
  ])assert.ok(html.includes(token),`transport proof missing ${token}`)
  for(const forbidden of ['const C=','change-218','run-884','approval-77','injectOriginatingRunFilter','P11_REVIEW_BOUNDARY','data-p11-highlight','insertBefore(','button?.click()'])assert.ok(!html.includes(forbidden),`forbidden parent authority remains: ${forbidden}`)
  assert.doesNotMatch(html,/effectAttemptId\s*:/)
})

test('journeys A-O and humane 13-step review remain explicit',()=>{
  for(const journey of 'ABCDEFGHIJKLMNO')assert.match(html,new RegExp(`\\b${journey}:\\{title:'${journey} ·`),`journey ${journey} missing`)
  assert.match(html,/const guidedSteps=\[/)
  assert.equal((html.match(/group:'/g)||[]).length,13)
  for(const token of ['Passou — salvar e continuar','Falhou — registrar e continuar','Fiquei bloqueado — registrar e continuar','Recolher instruções','Focar próximo controle','Narrow · 390px'])assert.ok(html.includes(token))
})

test('one exact iframe mount preserves focus, locality and forbidden scope',()=>{
  for(const token of ["document.createElement('iframe')",'removeMount()','frame.focus()','frame.title=`Exact re-locked','localhostOnly','file://','FUTURE_PRODUCT_APP','one active Product shell'])assert.ok(html.includes(token),`mount proof missing ${token}`)
  assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|React|Next\.js|Tailwind|Mastra SDK/i)
  assert.doesNotMatch(html,/AnalyzePendingBudgets|ListPendingBudgets|Pending budget|Budget Analyzer application screen/i)
})

test('assembled candidate script parses',()=>{
  for(const [index,script] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries())assert.doesNotThrow(()=>new Function(script[1]),`P11 script ${index}`)
})
