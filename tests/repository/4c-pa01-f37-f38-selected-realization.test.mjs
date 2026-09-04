import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = value => readFileSync(resolve(root, value), 'utf8')

const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`PA-01 F37/F38 realization missing ${message}`)
}

test('F37 enriches existing PAR Conversation truth without adding an operation or runtime authority', () => {
  const product = read('docs/product/contract.md')
  const ledger = read('docs/product/operation-ledger.md')
  const wire = read('contracts/api/product/par-paths.yaml')

  for (const token of [
    'kind: { type: string, enum: [TEXT, QUESTION] }',
    'createdAt: { type: string, format: date-time }',
    'ConversationResponseOption:',
    'replyToQuestionMessageId:',
    'selectedOptionId:',
    'attention: { type: string, enum: [NONE, NEEDS_YOUR_RESPONSE] }',
    'pendingQuestionMessageId:',
    'required: [conversationId, projectId, agentId, startedAt, lastActivityAt, lastMessagePreview, attention]',
    'lastActivityAt DESC',
    'conversationId DESC',
  ]) requireText(wire, token)

  requireText(product, 'clarification question completes the current AgentRun')
  requireText(product, 'reply starts a new exact AgentRun')
  requireText(ledger, '4C-F37')
  requireText(ledger, 'PAR remains 16')

  for (const forbidden of ['QuestionRequest', 'ResumeQuestion', 'ApproveQuestion']) {
    if (new RegExp(`operationId:\\s*${forbidden}\\b`).test(wire)) throw new Error(`F37 must not add ${forbidden}`)
  }
})

test('F38 keeps one Conexus session owner across Control Plane and Published App', () => {
  const product = read('docs/product/contract.md')
  const ledger = read('docs/product/operation-ledger.md')
  const identity = read('contracts/api/product/identity-workspace-paths.yaml')
  const rootWire = read('contracts/api/product/openapi.yaml')

  requireText(identity, '  /api/session:')
  requireText(rootWire, '  /api/session:')
  requireText(identity, 'x-conexus-ingress: [CONTROL_PLANE, PUBLISHED_APP]')
  requireText(identity, 'required: [account, projectId, activeReleaseId, role]')
  requireText(identity, "$ref: '#/components/schemas/AccountSummary'")
  requireText(product, 'Ending the Conexus session does not claim global Keycloak SSO logout')
  requireText(ledger, '4C-F38')
  requireText(ledger, 'IAM remains 20')

  if (/Keycloak(?:Role|Group|Organization)|keycloakToken|realmRole/.test(identity)) {
    throw new Error('F38 must not expose Keycloak provider authorization in Product wire')
  }
})
