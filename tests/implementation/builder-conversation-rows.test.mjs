import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mergeCalls } from '../../apps/web/src/features/builder/components/merge-calls.ts'
import { idleTurn, reduceTurn } from '../../apps/web/src/features/builder/live-turn.ts'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'node_modules/conexus-ask-rows-'))
const componentPath = resolve(buildRoot, 'builder-conversation.cjs')
const build = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/web/src/features/builder/components/builder-conversation.tsx'),
  `--outfile=${componentPath}`, '--bundle', '--platform=node', '--format=cjs', '--jsx=automatic', '--loader:.css=empty', '--loader:.svg=dataurl',
  '--external:react', '--external:react-dom', '--external:react/jsx-runtime', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
assert.equal(build.status, 0, build.stderr)
const { BuilderConversation } = createRequire(import.meta.url)(componentPath)
test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

// The events a real controller emits for an ask, the answer and the finish, recorded from
// createBuilderController with a model that calls ask_user once.
const events = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures-builder-ask-events.json'), 'utf8'))
const lived = events.reduce((turn, event) => reduceTurn(turn, { runId: 'run-1', kind: 'event', event }), idleTurn)

const rows = (html) => html.match(/Pergunt(?:ou|ando) a você/g)?.length ?? 0
// The rows are collapsed in the markup, so what a row opens to is read from the call it renders.
const asked = (messages) => mergeCalls(messages).flatMap((message) => message.content.parts.flatMap((part) => part.type === 'tool-invocation' && part.toolInvocation.toolName === 'ask_user'
  ? [[part.toolInvocation.args.questions.map((entry) => entry.question), part.toolInvocation.result.content]] : []))
const answer = [[['Qual cor?'], 'User answered:\nQual cor?: azul']]
const render = (props) => renderToStaticMarkup(createElement(BuilderConversation, { history: [], turn: idleTurn, pendingRequest: null, persistedRequests: [], failure: null, model: null, working: false, ...props }))

test('an ask, its answer and the finish are one "Perguntou a você" row with the question and the answer', () => {
  const html = render({ turn: lived })
  assert.equal(rows(html), 1)
  assert.deepEqual(asked(lived.messages), answer)
})

test('the stored history of the same turn is one row too', () => {
  const stored = { id: 'stored-1', threadId: 't', role: 'assistant', createdAt: '2026-10-01T14:35:55.000Z', content: { format: 2, parts: [
    { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'q1', toolName: 'ask_user', args: { questions: [{ question: 'Qual cor?' }] }, result: { content: 'User answered:\nQual cor?: azul', isError: false } } },
  ] } }
  const html = render({ history: [stored] })
  assert.equal(rows(html), 1)
  assert.deepEqual(asked([stored]), answer)
})

test('the settled history and the ended live turn show one row between them', () => {
  const [asking] = lived.messages.filter((message) => message.role === 'assistant')
  const html = render({ history: [{ ...asking, id: 'persisted-1' }], turn: { ...lived, messages: lived.messages.filter((message) => message.id !== asking.id) } })
  assert.equal(rows(html), 1)
  assert.deepEqual(asked([{ ...asking, id: 'persisted-1' }, ...lived.messages.filter((message) => message.id !== asking.id)]), answer)
})

test('while the run is parked on the question there is no row, only the card to answer', () => {
  const parked = events.slice(0, events.findIndex((event) => event.type === 'agent_end') + 1).reduce((turn, event) => reduceTurn(turn, { runId: 'run-1', kind: 'event', event }), idleTurn)
  assert.deepEqual(Object.values(parked.waiting).map((call) => [call.kind, call.toolCallId, call.args.questions[0].question]), [['QUESTION', 'q1', 'Qual cor?']])
  assert.equal(rows(render({ turn: parked })), 0)
})

const assistant = (id, parts) => ({ id, threadId: 't', role: 'assistant', createdAt: '2026-10-01T14:35:55.000Z', content: { format: 2, parts } })
const thought = { type: 'reasoning', reasoning: 'Planejando o esquema', details: [{ type: 'text', text: 'Planejando o esquema' }] }
const count = (html, word) => html.match(new RegExp(word, 'g'))?.length ?? 0

test('a run in its agent step says it is thinking before its first part arrives', () => {
  assert.equal(count(render({ working: true }), 'Pensando…'), 1)
})

test('the thinking line goes once the run has spoken, and not while it is parked on a question', () => {
  const spoke = { ...idleTurn, runId: 'run-1', messages: [assistant('live-1', [{ type: 'text', text: 'Vou ver.' }])] }
  assert.equal(count(render({ working: true, turn: spoke }), 'Pensando…'), 0)
  assert.equal(count(render({ working: true, turn: { ...idleTurn, waiting: { q1: { kind: 'QUESTION', toolCallId: 'q1', toolName: 'ask_user', args: {}, prompt: null } } } }), 'Pensando…'), 0)
})

test('a settled thought is one collapsed "Pensou" row, in the history and in the live turn', () => {
  const message = assistant('m1', [thought, { type: 'text', text: 'Pronto.' }])
  assert.equal(count(render({ history: [message] }), 'Pensou'), 1)
  assert.equal(count(render({ turn: { ...idleTurn, runId: 'run-1', messages: [assistant('live-2', [thought, { type: 'text', text: 'Pronto.' }])] } }), 'Pensou'), 1)
  assert.equal(count(render({ history: [message] }), 'Pensando…'), 0)
})

test('the thought still streaming reads "Pensando…" and has no "Pensou" row yet', () => {
  const html = render({ working: true, turn: { ...idleTurn, runId: 'run-1', status: 'LIVE', messages: [assistant('live-3', [{ type: 'text', text: 'Certo.' }, thought])] } })
  assert.equal(count(html, 'Pensando…'), 1)
  assert.equal(count(html, 'Pensou'), 0)
})
