import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root=fileURLToPath(new URL('../../',import.meta.url))
const read=relative=>readFileSync(resolve(root,relative),'utf8')
const paths={w04:'docs/evidence/4c/w04-agent-catalog-functional-wireframe.html',p01:'docs/evidence/4c/p01-build-workspace-functional-wireframe.html',p03:'docs/evidence/4c/p03-product-agent-functional-wireframe.html',p04:'docs/evidence/4c/p04-release-operations-functional-wireframe.html',pa01:'docs/evidence/4c/pa01-published-app-product-agent-functional-wireframe.html'}
const blob=text=>{const bytes=Buffer.from(text.replaceAll('\r\n','\n'),'utf8');return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')}

test('Family 4 is operator-locked at the five exact browser-proved identities',()=>{
  const evidence=read('docs/evidence/4c/p12-family4-agent-decision-effect-candidate.md')
  const expected={w04:'71e03432a0abd34ae35301094010fd670bb78b98',p01:'25e5077106892c4ff6aba6774987e73a12ccff51',p03:'17d31534fac0e57a74f70202567b23d8a63cd3c0',p04:'e036684e3e66d028361db2d708cf05811a367f4b',pa01:'ffba5935d8fccd0fc5d7ad4d275fe38b09294674'}
  assert.match(evidence,/LOCKED \/ OPERATOR APPROVED \/ BROWSER GREEN \/ P9-P10 CONSOLIDATED/)
  for(const [key,identity] of Object.entries(expected)){assert.equal(blob(read(paths[key])),identity,`${key} candidate drifted`);assert.ok(evidence.includes(identity))}
})

test('W-04 to P-03 to P-01 carries only exact owner coordinates and fails closed',()=>{
  const w04=read(paths.w04),p03=read(paths.p03),p01=read(paths.p01)
  for(const token of ["sourceEvent: 'W04_AGENT_OPEN'","workspaceId: 'ws-metal-nobre'","projectId: 'prj-sales-ops'","agentId: 'agent-sales-follow-up'"])assert.ok(w04.includes(token),`W-04 missing ${token}`)
  for(const token of ['function resolveIntegratedIngress','MISSING_CONTEXT','CONTEXT_UNKNOWN','No existence detail or fallback Agent is disclosed','EDIT_AGENT_IN_BUILD','NEW_AGENT_IN_BUILD'])assert.ok(p03.includes(token),`P-03 missing ${token}`)
  for(const token of ['AGENT_ORIGIN_REQUIRED','AGENT_CONTEXT_REQUIRED','AGENT_UNKNOWN','AGENT_DENIED','AGENT_DEPENDENCY_FAILURE','AGENT_READY','agent-candidate:server-issued','requestedExistingAgent||unresolvedAgentDetail'])assert.ok(p01.includes(token),`P-01 missing ${token}`)
  assert.doesNotMatch(p01,/productAgentDetails\[agentQuery\.get\('agentId'\)\]\|\|productAgentDetails\['agent-sales-follow-up'\]/)
})

test('P-03 and PA-01 emit run identity while P-04 alone resolves Effect truth',()=>{
  const p03=read(paths.p03),pa01=read(paths.pa01),p04=read(paths.p04)
  for(const source of [p03,pa01])for(const token of ['approval-781','run-1042','sha256:7c9b-fixture','APPROVAL_RUN_EFFECT_INVESTIGATION_REQUESTED',"originatingRun:{kind:'AgentRun',ref:"])assert.ok(source.includes(token),`source missing ${token}`)
  assert.doesNotMatch(p03,/effectAttemptId\s*:/)
  assert.doesNotMatch(pa01,/effectAttemptId/i)
  for(const token of ["effectAttemptId:'effect-77'","originatingRun:{kind:'AgentRun',ref:'run-1042'}",'INVALID_FILTER_422','FILTERED_EMPTY','FILTERED_READY','No currently disclosable effect attempt matches exact','forbiddenEffectSelection','gatewayEffectPages'])assert.ok(p04.includes(token),`P-04 missing ${token}`)
  assert.match(p04,/p04Query\.has\('effectAttemptId'\)/)
})

test('Family 4 re-locked artifacts remain disposable and their scripts parse',()=>{
  for(const relative of Object.values(paths)){
    const html=read(relative),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    assert.ok(scripts.length)
    for(const [index,script] of scripts.entries())assert.doesNotThrow(()=>new Function(script[1]),`${relative} script ${index}`)
    assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i)
    assert.doesNotMatch(html,/postMessage\([^\n]*,\s*['"]\*['"]\)/)
  }
})
