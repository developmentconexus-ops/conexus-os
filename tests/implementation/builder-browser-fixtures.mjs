import { createHash } from 'node:crypto'
import { BuilderRunView } from '../../packages/contract/dist/index.js'
// What the browser suites share: the Builder controller's routes stubbed for a page, and the thread messages they serve.
export const BUILDER_CONTROLLER = '**/api/builder/agent-controller/conexus-builder'
// The model and a conversation's own state are the controller's, so the screen reads
const ALL_LEVELS = ['low', 'medium', 'high', 'xhigh']
export const BUILDER_MODELS = [
  { id: 'anthropic/claude-opus-4-5', provider: 'anthropic', providerName: 'Anthropic (Claude)', modelName: 'claude-opus-4-5', thinkingLevels: ALL_LEVELS },
  { id: 'anthropic/claude-sonnet-4-5', provider: 'anthropic', providerName: 'Anthropic (Claude)', modelName: 'claude-sonnet-4-5', thinkingLevels: ALL_LEVELS },
]
export const SELECTED_MODEL = BUILDER_MODELS[0].id
// A Project's conversations are its threads, as the native threads route lists them.
export const conversation = (id, title, createdAt = '2026-09-20T12:00:00.000Z') => ({ id, title, createdAt, updatedAt: createdAt })

const threadIdOf = (url, offsetFromEnd) => decodeURIComponent(new URL(url).pathname.split('/').at(offsetFromEnd))
const scopeOf = (url) => new URL(url).searchParams.get('sessionScope') ?? ''
export const conversationOf = (url) => scopeOf(url).replace(/^conversation:/, '')

// Every Project is developed through the Builder's controller: its conversations are the threads
// of its resource, project:<id>, and each conversation is its own session (conversation:<id>) bound
// to the thread of that id, which its runs share.
export const routeBuilder = async (page, state) => {
  await page.route(`${BUILDER_CONTROLLER}/sessions`, (route) => {
    const { resourceId, sessionScope, threadId } = route.request().postDataJSON()
    state.opened.push([resourceId, sessionScope, threadId])
    if (!state.conversations.some((entry) => entry.id === threadId)) state.conversations = [conversation(threadId, null, new Date().toISOString()), ...state.conversations]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ controllerId: 'conexus-builder', resourceId, threadId }) })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/threads*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ threads: state.conversations }) }))
  await page.route('**/api/control/model-accounts/models', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: state.models ?? BUILDER_MODELS, defaultThinkingLevel: state.defaultThinkingLevel ?? 'medium' }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelId: state.modelId, threadId: conversationOf(route.request().url()), ...(state.omProgress ? { omProgress: state.omProgress } : {}) }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/model*`, (route) => {
    state.modelId = route.request().postDataJSON().modelId
    state.modelSwitches.push(state.modelId)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/threads/*/messages*`, (route) => {
    const id = threadIdOf(route.request().url(), -2)
    state.messageReads.push(id)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: state.messages[id] ?? [] }) })
  })
}

export const builderState = (conversations, messages = {}, modelId = SELECTED_MODEL) =>
  ({ conversations, messages, modelId, modelSwitches: [], messageReads: [], opened: [] })
export const assistantMessage = (id, text) => ({ id, role: 'assistant', createdAt: new Date().toISOString(), content: { format: 2, parts: [{ type: 'text', text }] } })
export const userMessage = (id, text) => ({ id, role: 'user', createdAt: new Date().toISOString(), content: { format: 2, parts: [{ type: 'text', text }] } })
export const sse = (...events) => ({
  status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
})

// A run as the Hub's contract writes it: the fields a fixture leaves out take the values of a run nobody has touched.
// A conversation id as the contract names it: a UUID, derived from a readable name so a fixture keeps its label.
export const conversationIdOf = (name) => {
  const hex = createHash('sha256').update(name).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

// Every run a fixture serves passes through the contract, so a value the Hub could not send throws here, naming its field,
// and never shows up as a page that waits for a screen that cannot render.
export const runOf = (fields) => BuilderRunView.parse({
  conversationId: conversationIdOf('conversation-fixture'),
  requestText: null,
  createdAt: '2026-10-05T10:00:00.000Z',
  cancellationRequested: false,
  pendingCalls: [],
  ...fields,
})
