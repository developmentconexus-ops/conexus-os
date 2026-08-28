import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root=fileURLToPath(new URL('../../',import.meta.url))
const read=relative=>readFileSync(resolve(root,relative),'utf8')
const paths={p04:'docs/evidence/4c/p04-release-operations-functional-wireframe.html',p05:'docs/evidence/4c/p05-project-lifecycle-and-published-app-access-functional-wireframe.html',pa01:'docs/evidence/4c/pa01-published-app-product-agent-functional-wireframe.html'}

test('Family 3 is operator-locked at the three exact browser-proved identities',()=>{
  const evidence=read('docs/evidence/4c/p12-family3-serving-access-app-entry-candidate.md')
  const contracts=[
    read('docs/evidence/4c/p04-release-operations-screen-contract.md'),
    read('docs/evidence/4c/p05-project-lifecycle-and-published-app-access-screen-contract.md'),
    read('docs/evidence/4c/pa01-published-app-product-agent-screen-contract.md'),
  ]
  assert.match(evidence,/LOCKED \/ OPERATOR APPROVED \/ BROWSER GREEN \/ P9-P10 CONSOLIDATED/)
  for(const identity of [
    '77820d283e47ba6c9f5efd19f45471c88675e0b0',
    'd00b2126667a0a51317c653c57c237444a129dfb',
    '612ec41d91104e01b3942f7d90f35c37ad89c9f0',
  ])assert.ok(evidence.includes(identity),`Family 3 lock Evidence missing ${identity}`)
  for(const contract of contracts)assert.match(contract,/P12 Family 3 re-locked identity/)
})

test('Family 3 P-04 carries honest Change context and emits only served-verified Release truth',()=>{
  const html=read(paths.p04)
  for(const token of [
    "const integratedProjectId='prj-sales-ops'",
    "const integratedReleaseId='rel-042',integratedEnvironmentId='env-production',integratedPointerGeneration=18",
    "changeIngressState='HONEST_BOUNDARY'",
    "releaseSelection:'NONE'",
    'function servingEgressEligible',
    "env?.servingVerification==='SERVED_VERIFIED'",
    "sourceEvent:'SERVED_RELEASE_READY'",
    "destinationBlock:'p05'",
    "no Control Plane launch operation or application URL is emitted",
    "window.parent.postMessage({type:'conexus:wireframe-egress',detail},window.location.origin)",
    "env.servingVerification='PENDING'",
  ])assert.ok(html.includes(token),`P-04 Family 3 marker missing: ${token}`)
  assert.doesNotMatch(html,/\bOpen app\b|launchUrl|appUrl/)
})

test('Family 3 P-05 re-resolves serving, grants explicitly and keeps duplicate boundary honest',()=>{
  const html=read(paths.p05)
  for(const token of [
    "projectId:'prj-sales-ops'",
    "releaseId:'rel-042'",
    "environmentId:'env-production'",
    "accountId:'acct-leandro'",
    "agentId:'agent-sales-follow-up'",
    "ingress.state='READY'",
    "manage.hidden=!ingress.ready",
    "sourceEvent:'IAM-15_PUBLISHED_APP_ACCESS_GRANTED'",
    "reviewEntry:'P11_REVIEW_HARNESS_ONLY'",
    "destinationBlock:'pa01'",
    "candidate visibility emitted nothing",
    "window.parent.postMessage({type:'conexus:wireframe-egress',detail},window.location.origin)",
    "data-boundary-state=\"NOT_EMITTED\"",
    "businessDataPolicy=NO_DATA",
    "no destination Workspace or Project coordinate was returned or emitted",
  ])assert.ok(html.includes(token),`P-05 Family 3 marker missing: ${token}`)
  assert.doesNotMatch(html,/open app|launchUrl|appUrl/i)
})

test('Family 3 PA-01 gates the independent app shell on exact IAM-13 truth',()=>{
  const html=read(paths.pa01)
  for(const token of [
    "accountId:'acct-leandro'",
    "projectId:'prj-sales-ops'",
    "activeReleaseId:'rel-042'",
    "agentId:'agent-sales-follow-up'",
    'function resolveIam13',
    "state:'MISSING_CONTEXT'",
    "state:'CONTEXT_UNKNOWN'",
    "state:'CONTEXT_STALE'",
    "state:'APP_ACCESS_DENIED'",
    "state:'DEPENDENCY_FAILURE'",
    "state:'SESSION_EXPIRED'",
    "gate.hidden=result.state==='READY'",
    "$('app').hidden=result.state!=='READY'",
    "No Published-App business state or Control Plane recovery is disclosed",
    "releaseId:appAccess?.activeReleaseId||'rel-042'",
  ])assert.ok(html.includes(token),`PA-01 Family 3 marker missing: ${token}`)
  assert.doesNotMatch(html,/Control Plane navigation|Back to Projects/)
})

test('Family 3 artifacts stay fixture-only and parse',()=>{
  for(const relative of Object.values(paths)){
    const html=read(relative),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    assert.ok(scripts.length>=1)
    for(const [index,script] of scripts.entries())assert.doesNotThrow(()=>new Function(script[1]),`${relative} script ${index}`)
    assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i)
  }
})
