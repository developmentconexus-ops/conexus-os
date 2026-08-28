import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = relative => readFileSync(resolve(root, relative), 'utf8')
const paths = {
  w02a: 'docs/evidence/4c/w02a-brain-functional-wireframe.html',
  w02b: 'docs/evidence/4c/w02b-connections-functional-wireframe.html',
  p02: 'docs/evidence/4c/p02-project-resources-functional-wireframe.html',
}

test('Family 2 W-02A emits only an owner-issued brain-r42 publication', () => {
  const html = read(paths.w02a)
  for (const token of [
    "projectId:'prj-sales-ops'",
    "brainRevisionId:'brain-r42'",
    "function resolveProjectIngress()",
    "function publishApprovedProposal()",
    "sourceBlock:'w02a'",
    "sourceEvent:'BRAIN_REVISION_PUBLISHED'",
    "destinationBlock:'p02'",
    "brainRevisionId:integratedPublication.brainRevisionId",
    "failureDisposition:'P-02 re-resolves the published revision and still requires explicit Project binding'",
    "window.dispatchEvent(new CustomEvent('conexus:wireframe-egress'",
    "window.parent.postMessage({type:'conexus:wireframe-egress',detail},window.location.origin)",
    "No Project binding changed",
  ]) assert.ok(html.includes(token), `W-02A Family 2 marker missing: ${token}`)
  assert.match(html, /\['DENIED','DEPENDENCY_FAILURE','STALE','UNKNOWN'\]\.includes\(failure\)/)
  assert.doesNotMatch(html, /postMessage\([^\n]*,\s*['"]\*['"]\)/)
})

test('Family 2 W-02B emits only exact current PASSED qualification truth', () => {
  const html = read(paths.w02b)
  for (const token of [
    "const integratedProjectId='prj-sales-ops'",
    "connectionId:'conn-sankhya-prod'",
    "connectionRevisionId:'rev-18'",
    "qualificationId:'q-501'",
    'function qualificationOwnerState()',
    "summary.state==='NEEDS_RETEST'",
    "return 'QUALIFICATION_STALE'",
    "sourceBlock:'w02b'",
    "sourceEvent:'CONNECTION_QUALIFICATION_PASSED'",
    "destinationBlock:'p02'",
    "qualification != Project binding",
    "window.parent.postMessage({type:'conexus:wireframe-egress',detail:envelope},window.location.origin)",
  ]) assert.ok(html.includes(token), `W-02B Family 2 marker missing: ${token}`)
  assert.doesNotMatch(html, /postMessage\([^\n]*,\s*['"]\*['"]\)/)
})

test('Family 2 P-02 resolves exact ingress but requires explicit bind/adopt', () => {
  const html = read(paths.p02)
  for (const token of [
    "projectId:'prj-sales-ops'",
    "brainRevisionId:'brain-r42'",
    "connectionId:'conn-sankhya-prod'",
    "currentRevisionId:'rev-18'",
    "qualificationId:'q-501'",
    'function resolveIntegratedIngress',
    "?'READY_BRAIN':'STALE_BRAIN'",
    "?'READY_CONNECTION':'STALE_CONNECTION'",
    "Publication did not bind this Project",
    "Qualification did not change Project use",
    "Review brain-r42 for explicit binding",
    "Review tested revision for explicit adoption",
    "Project use remains ${binding?.connectionRevisionId||'not used'}",
    "function openIntegratedIngressSubject()",
    "selectBrainRevision(integratedP02Brain.brainRevisionId)",
    "openConnectionPanel(integratedP02Connection.connectionId",
    "STALE_BRAIN",
    "STALE_CONNECTION",
    "stage.classList.add('ingress-blocked')",
  ]) assert.ok(html.includes(token), `P-02 Family 2 marker missing: ${token}`)
  assert.doesNotMatch(html, /resolveIntegratedIngress[\s\S]{0,2500}(?:saveBrainBinding|adoptCurrentConnectionRevision)\(\)/)
})

test('Family 2 artifacts remain fixture-only and scripts parse', () => {
  for (const relative of Object.values(paths)) {
    const html = read(relative)
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    assert.ok(scripts.length >= 1)
    for (const [index, script] of scripts.entries()) assert.doesNotThrow(() => new Function(script[1]), `${relative} script ${index}`)
    assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i)
  }
})
