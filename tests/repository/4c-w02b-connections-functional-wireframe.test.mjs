import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

const specPath = 'docs/evidence/4c/w02b-connections-structural-hypotheses.md'
const htmlPath = 'docs/evidence/4c/w02b-connections-functional-wireframe.html'

test('W-02B P7 records operator-approved Connection-first structure without locking it', () => {
  if (!existsSync(path(specPath))) throw new Error('W-02B P7 structural decision Evidence is missing')
  const spec = read(specPath)

  for (const law of [
    'P7 OPERATOR APPROVED FOR FUNCTIONAL P8 / NOT LOCKED',
    'A — Connection-first browse → focused detail',
    'Connection.name',
    'configured != qualified != bound != healthy != caller-authorized',
    'credential write = CON-07 write-only / no secret readback',
    'W-02B = NOT LOCKED',
    'P8 = NEXT',
  ]) requireText(spec, law, `W-02B P7 Evidence missing law: ${law}`)
})

test('W-02B functional P8 proves Connection-first browse/detail and distinct maintenance tasks', () => {
  if (!existsSync(path(htmlPath))) throw new Error('W-02B functional P8 HTML is missing')
  const html = read(htmlPath)

  for (const token of [
    'data-wireframe="w-02b-connections"',
    'CANDIDATE · NOT LOCKED',
    'data-owner-scope="WORKSPACE"',
    'Connection.name',
    'id="connectionSearch"',
    'id="createConnection"',
    'id="editConfiguration"',
    'id="credentialForm"',
    'id="qualificationForm"',
    'currentRevisionId',
    'credentialConfigured',
    'configuration',
    'qualificationId',
    'evidenceRefs',
    'saveConfigurationRevision',
    'setCredential',
    'runQualification',
    'simulateStaleRevision',
    "credentialInput.value = ''",
    'configured != qualified != bound != healthy != caller-authorized',
    'Fixture interaction only',
    'No backend/runtime behavior is claimed',
  ]) requireText(html, token, `W-02B P8 missing functional/authority evidence: ${token}`)

  for (const operation of ['CON-01','CON-02','CON-03','CON-04','CON-05','CON-06','CON-07','CON-08','CON-09']) {
    requireText(html, `data-operation="${operation}"`, `W-02B P8 missing operation trace ${operation}`)
  }

  for (const forbidden of ['fetch(', 'localStorage', 'sessionStorage', 'latestQualification', 'qualificationHistory']) {
    if (html.includes(forbidden)) throw new Error(`W-02B P8 must not invent/use ${forbidden}`)
  }

  for (const forbiddenStatus of ['data-status="connected"', 'data-status="ready"', 'data-status="healthy"', 'data-status="authorized"']) {
    if (html.includes(forbiddenStatus)) throw new Error(`W-02B P8 must not collapse truth into ${forbiddenStatus}`)
  }
})

test('W-02B functional P8 keeps credential write-only and qualification exact-subject', () => {
  if (!existsSync(path(htmlPath))) throw new Error('W-02B functional P8 HTML is missing')
  const html = read(htmlPath)

  for (const token of [
    'credentialInputSchema',
    'write-only',
    'The secret cannot be viewed',
    'credentialForm.reset()',
    'connectionRevisionId',
    'ConnectorDefinition environments',
    'qualificationState',
    'evidenceRefs',
    'exact qualification',
    'stale revision',
    'Reload current configuration',
  ]) requireText(html, token, `W-02B P8 missing trust/recovery evidence: ${token}`)

  if (/credential\s*:\s*['"`][^'"`]+/i.test(html)) {
    throw new Error('W-02B P8 must not persist a credential value in fixture state')
  }
})
