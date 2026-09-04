import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root=fileURLToPath(new URL('../../',import.meta.url))
const html=readFileSync(resolve(root,'docs/evidence/4c/p11-assembled-product-functional-wireframe.html'),'utf8')
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1]
const cut=script.indexOf('  Object.entries(journeys)')
if(cut<0)throw new Error('P11 transport core cut marker missing')
const capture={}
const executable=script.slice(0,cut)+"  capture.api={normalizeEnvelope,validateEdgeEnvelope,serializeDestination,edgeProfiles};\n})()"
new Function('window','document','capture',executable)({addEventListener(){}},{},capture)
const {normalizeEnvelope,validateEdgeEnvelope,serializeDestination,edgeProfiles}=capture.api

const canonical=(sourceBlock,sourceEvent,destinationBlock,ownerCoordinates,extra={})=>({sourceBlock,sourceEvent,destinationBlock,ownerCoordinates,...extra})
const change={workspaceId:'ws-metal-nobre',projectId:'prj-sales-ops',candidateBaselineDigest:'cand_7f2c9e1a',changeId:'chg:fixture',candidateSubjectDigest:'candidate:agent:1',draftRevision:'draft:r1',planRevision:'plan:r1',findingId:'fd:1',evidenceId:'ev:1'}
const samples={
  'A:0':{source:'t-01',event:'PROJECTS_BOUNDARY',destination:'gf-01',accountId:'acct-leandro',workspaceId:'ws-metal-nobre',creatorAccountId:'acct-leandro',initialAccessEstablished:true},
  'A:1':{source:'gf-01',event:'PROJECTS_COLLECTION',destination:'w-01',accountId:'acct-leandro',workspaceId:'ws-metal-nobre'},
  'B:0':canonical('w01','PROJECT_BASELINE_APPROVED','p01',{workspaceId:'ws-metal-nobre',projectId:'prj-sales-ops',candidateBaselineDigest:'cand_7f2c9e1a'}),
  'C:0':canonical('p01','VERIFIED_CHANGE_BOUNDARY','p04',change),
  'E:0':canonical('w02a','BRAIN_REVISION_PUBLISHED','p02',{workspaceId:'ws-metal-nobre',projectId:'prj-sales-ops',brainRevisionId:'brain-r42'}),
  'F:0':canonical('w02b','CONNECTION_QUALIFICATION_PASSED','p02',{projectId:'prj-sales-ops',connectionId:'conn-sankhya-prod',connectionRevisionId:'rev-18',qualificationId:'q-501'}),
  'H:0':canonical('p04','SERVED_RELEASE_READY','p05',{projectId:'prj-sales-ops',releaseId:'rel-042',environmentId:'env-production',pointerGeneration:18}),
  'H:1':canonical('p05','IAM-15_PUBLISHED_APP_ACCESS_GRANTED','pa01',{accountId:'acct-leandro',projectId:'prj-sales-ops',releaseId:'rel-042',agentId:'agent-sales-follow-up'},{reviewEntry:'P11_REVIEW_HARNESS_ONLY'}),
  'I:0':canonical('w04','W04_AGENT_OPEN','p03',{workspaceId:'ws-metal-nobre',projectId:'prj-sales-ops',agentId:'agent-sales-follow-up'}),
  'I:1':canonical('p03','EDIT_AGENT_IN_BUILD','p01',{workspaceId:'ws-metal-nobre',projectId:'prj-sales-ops',origin:'EXISTING',agentId:'agent-sales-follow-up'}),
  'I:2':canonical('p01','VERIFIED_CHANGE_BOUNDARY','p04',{...change,agentId:'agent-sales-follow-up',candidateBaselineDigest:undefined}),
  'K:0':canonical('p03','APPROVAL_RUN_EFFECT_INVESTIGATION_REQUESTED','p04',{projectId:'prj-sales-ops',originatingRun:{kind:'AgentRun',ref:'run-1042'}},{sourceEvidence:{approvalRequestId:'approval-781',proposalDigest:'sha256:7c9b-fixture',expectedSubjectDigest:'sha256:7c9b-fixture'}}),
  'O:0':canonical('p01','VERIFIED_CHANGE_BOUNDARY','p04',change),
  'O:1':canonical('w02a','BRAIN_REVISION_PUBLISHED','p02',{workspaceId:'ws-metal-nobre',projectId:'prj-sales-ops',brainRevisionId:'brain-r42'}),
}
delete samples['I:2'].ownerCoordinates.candidateBaselineDigest

test('actual P11 core normalizes and validates every material A-O edge profile',()=>{
  assert.deepEqual(Object.keys(edgeProfiles).sort(),Object.keys(samples).sort())
  for(const [id,raw] of Object.entries(samples)){
    const envelope=normalizeEnvelope(raw)
    assert.equal(validateEdgeEnvelope(edgeProfiles[id],envelope),true,`${id} rejected valid owner envelope`)
    assert.match(serializeDestination(edgeProfiles[id],envelope),/^\?/)
  }
})

test('legacy T-01 and GF-01 envelopes normalize without invented coordinates',()=>{
  const t01=normalizeEnvelope(samples['A:0']),gf=normalizeEnvelope(samples['A:1'])
  assert.deepEqual(t01.ownerCoordinates,{accountId:'acct-leandro',workspaceId:'ws-metal-nobre',creatorAccountId:'acct-leandro',initialAccessEstablished:true})
  assert.deepEqual(gf.ownerCoordinates,{accountId:'acct-leandro',workspaceId:'ws-metal-nobre'})
})

test('destination serialization is edge-specific and never transports an Effect identity',()=>{
  const k=normalizeEnvelope(samples['K:0']),kUrl=serializeDestination(edgeProfiles['K:0'],k)
  assert.match(kUrl,/originatingRun%5Bkind%5D=AgentRun/)
  assert.match(kUrl,/originatingRun%5Bref%5D=run-1042/)
  assert.doesNotMatch(kUrl,/effectAttemptId|approvalRequestId|proposalDigest/)
  const cUrl=serializeDestination(edgeProfiles['C:0'],normalizeEnvelope(samples['C:0']))
  assert.match(cUrl,/changeId=chg%3Afixture/)
  assert.doesNotMatch(cUrl,/releaseId|environmentId/)
  const oUrl=serializeDestination(edgeProfiles['O:0'],normalizeEnvelope(samples['O:0']))
  assert.equal(oUrl,'?workspaceId=ws-metal-nobre&projectId=prj-sales-ops')
})

test('forged, widened and stale-shaped envelopes fail closed',()=>{
  const wrongDestination=normalizeEnvelope({...samples['B:0'],destinationBlock:'p04'})
  assert.equal(validateEdgeEnvelope(edgeProfiles['B:0'],wrongDestination),false)
  const widened=normalizeEnvelope({...samples['K:0'],ownerCoordinates:{...samples['K:0'].ownerCoordinates,effectAttemptId:'effect-77'}})
  assert.equal(validateEdgeEnvelope(edgeProfiles['K:0'],widened),false)
  const flat=normalizeEnvelope({...samples['K:0'],ownerCoordinates:{projectId:'prj-sales-ops',originatingRunKind:'AgentRun',originatingRunRef:'run-1042'}})
  assert.equal(validateEdgeEnvelope(edgeProfiles['K:0'],flat),false)
  const changedDigest=normalizeEnvelope({...samples['K:0'],sourceEvidence:{...samples['K:0'].sourceEvidence,expectedSubjectDigest:'sha256:changed'}})
  assert.equal(validateEdgeEnvelope(edgeProfiles['K:0'],changedDigest),false)
  const newWithAgent=normalizeEnvelope(canonical('p03','NEW_AGENT_IN_BUILD','p01',{workspaceId:'ws-metal-nobre',projectId:'prj-sales-ops',origin:'NEW',agentId:'invented'}))
  assert.equal(validateEdgeEnvelope(edgeProfiles['I:1'],newWithAgent),false)
})
