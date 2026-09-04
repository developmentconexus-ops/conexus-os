import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = relative => readFileSync(resolve(root, relative), 'utf8')
const t01Path = 'docs/evidence/4c/t01-trusted-setup-functional-wireframe.html'
const gf01Path = 'docs/evidence/4c/gf01-global-frame-wireframe.html'
const w01Path = 'docs/evidence/4c/w01-projects-inception-wireframe.html'
const p01Path = 'docs/evidence/4c/p01-build-workspace-functional-wireframe.html'

test('P12 Family 1 keeps T-01 owner identity aligned with the integrated Evidence spine', () => {
  const html = read(t01Path)
  for (const token of [
    "accountId: 'acct-leandro'",
    "workspaceId: 'ws-metal-nobre'",
    "creatorAccountId: 'acct-leandro'",
    'initialAccessEstablished: true',
    'data-egress="T-01_TO_GF-01"',
    'id="projects-owner-result"',
    'function completeWorkspace',
    'function continueToProjects',
    "state.context !== 'HUMAN_ACCOUNT_SESSION'",
    'ownerResult.initialAccessEstablished !== true',
    "event: 'PROJECTS_BOUNDARY'",
    "window.dispatchEvent(new CustomEvent('conexus:wireframe-egress'",
    "destination: 'gf-01'",
  ]) assert.ok(html.includes(token), `T-01 Family 1 marker missing: ${token}`)

  assert.doesNotMatch(html, /acct:bootstrap-owner|ws:conexus-factory/, 'T-01 must not emit the superseded local identity')
  assert.match(html, /state\.workspaceResult = ownerResult[\s\S]*?state\.status = 'WORKSPACE_ESTABLISHED'/)
  assert.match(html, /!state\.normalSession[\s\S]*?initialAccessEstablished !== true[\s\S]*?return;/)
})

test('P12 Family 1 makes GF-01 resolve query ingress through owner fixtures before Ready', () => {
  const html = read(gf01Path)
  for (const token of [
    'const queryIngress = new URLSearchParams(window.location.search)',
    "'acct-leandro': accountSummary",
    "'ws-metal-nobre': { workspaceId: 'ws-metal-nobre'",
    "contextIngress.accountId",
    "contextIngress.workspaceId",
    'IAM-01 AccountSummary + WS-02 WorkspaceSummary',
    "INVALID: 'CONTEXT_INVALID'",
    "'401': 'AUTHENTICATION_REQUIRED'",
    "'403': 'CONTEXT_ACCESS_DENIED'",
    "'404': 'CONTEXT_NOT_FOUND'",
    "dependency: 'DEPENDENCY_FAILURE'",
    "contextState = 'READY'",
    'workspace.accountId !== account.accountId',
    "shell.hidden = contextState !== 'READY'",
    'data-egress="GF-01_TO_W-01"',
    "event: 'PROJECTS_COLLECTION'",
    "destination: 'w-01'",
    "workspaceId: resolvedWorkspace.workspaceId",
    "window.dispatchEvent(new CustomEvent('conexus:wireframe-egress'",
  ]) assert.ok(html.includes(token), `GF-01 Family 1 marker missing: ${token}`)

  assert.doesNotMatch(html, /workspaceName = 'Metal Nobre'/, 'GF-01 must not treat a name-only local default as resolved context')
  assert.match(html, /if \(!accountId \|\| !workspaceId[\s\S]*?contextState = 'CONTEXT_INVALID'/)
  assert.match(html, /if \(!account \|\| !workspace\)[\s\S]*?contextState = 'CONTEXT_NOT_FOUND'/)
  assert.match(html, /if \(workspace\.accountId !== account\.accountId \|\| workspace\.disclosure !== 'DISCLOSED'\)[\s\S]*?contextState = 'CONTEXT_ACCESS_DENIED'/)
})

test('P12 Family 1 inline scripts remain parseable and self-contained', () => {
  for (const relative of [t01Path, gf01Path, w01Path, p01Path]) {
    const html = read(relative)
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    assert.ok(scripts.length >= 1, `${relative} must keep inline interaction evidence`)
    for (const [index, script] of scripts.entries()) assert.doesNotThrow(() => new Function(script[1]), `${relative} inline script ${index} must parse`)
    assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i, `${relative} must remain fixture-only`)
  }
})

test('P12 Family 1 W-01 resolves Workspace and emits the exact approved Project candidate', () => {
  const html = read(w01Path)
  for (const token of [
    "const integratedWorkspaceId = 'ws-metal-nobre'",
    "projectId: 'prj-sales-ops'",
    "candidateBaselineDigest: 'cand_7f2c9e1a'",
    "candidateBaselineDigests: ['cand_7f2c9e1a','cand_7f2c9e1b','cand_7f2c9e1c']",
    "workspaceOwnerState = !requestedWorkspaceId ? 'WORKSPACE_CONTEXT_REQUIRED'",
    "requestedWorkspaceId !== integratedWorkspaceId ? 'WORKSPACE_UNKNOWN'",
    "sourceBlock: 'w01'",
    "destinationBlock: 'p01'",
    "sourceEvent: eventName",
    "window.dispatchEvent(new CustomEvent('conexus:wireframe-egress'",
    "window.parent.postMessage({ type: 'conexus:wireframe-egress', detail }, window.location.origin)",
  ]) assert.ok(html.includes(token), `W-01 Family 1 marker missing: ${token}`)
  assert.match(html, /if \(!issued\) return null/)
  assert.doesNotMatch(html, /postMessage\([^\n]*,\s*['"]\*['"]\)/)
})

test('P12 Family 1 P-01 resolves exact Project candidate before creating Change', () => {
  const html = read(p01Path)
  for (const token of [
    "workspaceId:'ws-metal-nobre'",
    "projectId:'prj-sales-ops'",
    "candidateBaselineDigests:['cand_7f2c9e1a','cand_7f2c9e1b','cand_7f2c9e1c']",
    "requestedWorkspaceId&&requestedWorkspaceId!==integratedProject.workspaceId?'PROJECT_UNKNOWN'",
    "!integratedProject.candidateBaselineDigests.includes(requestedCandidateDigest)?'CANDIDATE_STALE'",
    "if(!projectIngressReady())return false",
    "const changeId='chg:fixture'",
    "candidateSubjectDigest:'candidate:agent:1'",
    "draftRevision:'draft:r1'",
    "findingId:'fd:1'",
    "evidenceId:'ev:1'",
    "sourceBlock:'p01'",
    "destinationBlock:'p04'",
    "candidateBaselineDigest:requestedCandidateDigest",
    "failureDisposition:'P-04 resolves Project Releases independently; no Release inferred from Change'",
    "window.dispatchEvent(new CustomEvent('conexus:wireframe-egress'",
    "window.parent.postMessage({type:'conexus:wireframe-egress',detail},window.location.origin)",
  ]) assert.ok(html.includes(token), `P-01 Family 1 marker missing: ${token}`)
  assert.doesNotMatch(html, /postMessage\([^\n]*,\s*['"]\*['"]\)/)
  assert.doesNotMatch(html, /sourceBlock:'p01'[\s\S]{0,500}releaseId/)
})
