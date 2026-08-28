import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const html = readFileSync(resolve(root, 'docs/evidence/4c/pa01-published-app-product-agent-functional-wireframe.html'), 'utf8')

const requireText = (needle, message = needle) => {
  if (!html.includes(needle)) throw new Error(`PA-01 functional wireframe missing ${message}`)
}

test('PA-01 proves three Project-selected Agent host compositions over one surface', () => {
  for (const token of [
    'data-wireframe="pa-01"',
    'data-mode="full"',
    'data-mode="panel"',
    'data-mode="inline"',
    'Full page',
    'Context panel',
    'Inline task',
    'same owner truth',
    'PA-01 P8 CANDIDATE / NOT LOCKED',
  ]) requireText(token)
})

test('Published-App frame recognizes the Conexus Account and ends only its session', () => {
  for (const token of [
    'Leandro Theodoro',
    'App role:',
    'Sign out of Conexus',
    'Your Conexus session has ended.',
    'Keycloak may still have an SSO session.',
    'IAM-13 = AccountSummary',
    'IAM-02 = one Conexus session exit across CP/PA',
  ]) requireText(token)
})

test('Conversation interaction is recognizable, ordered and supports exact clarification reply', () => {
  for (const token of [
    'Needs your response',
    'Which follow-up tone should I use?',
    'Consultative',
    'Direct',
    'Another response',
    'replyToQuestionMessageId',
    'selectedOptionId',
    'a new AgentRun was admitted',
    'QUESTION_STALE',
    'No conversations yet.',
    'Conversation service unavailable.',
  ]) requireText(token)
})

test('exact app-scoped approval remains sealed and independently authorized', () => {
  for (const token of [
    'Needs your decision',
    'Exact sealed proposal',
    'proposalDigest:',
    'Allow once',
    'Deny',
    'App role alone does not make you eligible.',
    'APPROVAL_STALE',
    "decide('ALLOW_ONCE')",
    "decide('DENY')",
  ]) requireText(token)
  if (/universal Approval Center|allow_session/i.test(html)) throw new Error('PA-01 must not create universal or session-wide approval authority')
})

test('material states, responsive transformation and accessibility mechanics are inspectable', () => {
  for (const state of ['SESSION_EXPIRED', 'APP_DENIED', 'CONVERSATIONS_EMPTY', 'DEPENDENCY_FAILURE', 'QUESTION_STALE', 'APPROVAL_STALE']) requireText(`value="${state}"`)
  requireText('@media(max-width:650px)')
  requireText('.mode-panel .agent-host{position:static', 'narrow panel must stay in document flow so composition controls remain operable')
  if (html.includes('.mode-panel .agent-host{position:fixed')) throw new Error('narrow panel must not cover the composition controls')
  requireText('@media(prefers-reduced-motion:reduce)')
  requireText("event.key==='Escape'")
  requireText('aria-live="polite"')
  requireText('aria-modal="true"')
})

test('embedded PA-01 walkthrough script parses', () => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('PA-01 functional wireframe script is absent')
  new Function(match[1])
})
