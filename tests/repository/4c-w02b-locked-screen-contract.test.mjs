import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved W-02B Connections is locked and closed through exact P9/P10 trace', () => {
  const htmlPath = 'docs/evidence/4c/w02b-connections-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/w02b-connections-screen-contract.md'
  if (!existsSync(path(contractPath))) throw new Error('W-02B exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const hypotheses = read('docs/evidence/4c/w02b-connections-structural-hypotheses.md')
  const contract = read(contractPath)
  const roadmap = read('docs/roadmap.md')

  const approvedBlob = '421f5b8e08d6e5c96f5a56d8c24123902cbe3fab'
  if (gitBlobSha(html) !== approvedBlob) throw new Error('operator-approved W-02B HTML artifact changed after lock')
  requireText(contract, `approved P8 artifact blob = ${approvedBlob}`, 'W-02B Screen Contract must pin the exact approved HTML blob')

  requireText(hypotheses, 'LOCKED / OPERATOR APPROVED', 'W-02B structural record must preserve the operator-only lock')
  requireText(hypotheses, 'Connection-first browse → contextual Connection panel', 'W-02B lock must preserve the approved context-preserving mental model')

  for (const exactTrace of [
    'CON-01 ListConnectorDefinitions',
    'CON-02 GetConnectorDefinition',
    'CON-03 ListConnections',
    'CON-04 GetConnection',
    'CON-05 CreateConnection',
    'CON-06 ReviseConnection',
    'CON-07 SetConnectionCredential',
    'CON-08 QualifyConnection',
    'CON-09 GetConnectionQualification',
  ]) requireText(contract, exactTrace, `W-02B Screen Contract missing ${exactTrace}`)

  for (const permission of ['connection.read', 'connection.manage', 'connection.qualify', 'connection.use']) {
    requireText(contract, permission, `W-02B Screen Contract missing Permission boundary ${permission}`)
  }

  for (const law of [
    'configured != qualified != bound != healthy != caller-authorized',
    'credential write = CON-07 write-only / no secret readback',
    'NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE',
    'collection remains visible behind the contextual panel',
    'configuration draft = FORM_DRAFT',
    'credential draft = FORM_DRAFT',
    'test environment = FORM_DRAFT',
    'local filter = EPHEMERAL_UI',
    'P10 graduated shared patterns = 0',
    'P11 = LATER ASSEMBLED PRODUCT',
  ]) requireText(contract, law, `W-02B closure missing law: ${law}`)

  for (const forbidden of ['CON-10', 'qualification history', 'generic Connected/Healthy', 'secret readback']) {
    if (contract.includes(forbidden)) throw new Error(`W-02B Screen Contract invents forbidden scope: ${forbidden}`)
  }

  requireText(roadmap, 'W-02B LOCKED', 'roadmap must show W-02B locked')
  requireText(roadmap, 'W-03 = NEXT / NOT OPEN', 'roadmap must route the next material 4C block to W-03')
  if (/4D[^\n|]*OPEN/.test(roadmap)) throw new Error('W-02B lock must not open 4D before remaining 4C blocks, P11/P12 and closure')
})
