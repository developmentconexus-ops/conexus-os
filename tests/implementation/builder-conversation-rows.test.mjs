import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mergeCalls } from '../../apps/web/src/features/builder/components/merge-calls.ts'
import { emptyTranscript, transcriptReducer } from '../../apps/web/src/features/builder/transcript.ts'

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
// A static render has no animation frames, so the live turn's reveal is told what a reader who
// prefers reduced motion tells it: lay every part down at once.
globalThis.window = { matchMedia: (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }) }
test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

// The events a real controller emits for an ask, the answer and the finish, recorded from
// createBuilderController with a model that calls ask_user once.
const events = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures-builder-ask-events.json'), 'utf8'))
const reduce = (actions, state = emptyTranscript('c1')) => actions.reduce(transcriptReducer, state)
const lived = reduce(events.map((event) => ({ type: 'event', event })))
const messagesOf = (state) => state.entries.flatMap((entry) => entry.kind === 'message' ? [entry.message] : [])

const rows = (html) => html.match(/Pergunt(?:ou|ando) a você/g)?.length ?? 0
// The rows are collapsed in the markup, so what a row opens to is read from the call it renders.
const asked = (messages) => mergeCalls(messages).flatMap((message) => message.content.parts.flatMap((part) => part.type === 'tool-invocation' && part.toolInvocation.toolName === 'ask_user'
  ? [[part.toolInvocation.args.questions.map((entry) => entry.question), part.toolInvocation.result.content]] : []))
const answer = [[['Qual cor?'], 'User answered:\nQual cor?: azul']]
const render = (props) => renderToStaticMarkup(createElement(BuilderConversation, { entries: [], persistedRequests: [], runs: [], model: null, working: false, waitingOn: [], ...props }))
// What the screen hands the thread while the run waits on every call the transcript kept, as the Hub says.
const waitingOnAll = (state) => ({ entries: [...state.entries, ...Object.values(state.calls)], waitingOn: Object.keys(state.calls) })
const card = (prompt) => createElement('p', null, `card ${prompt.toolCallId}`)

test('an ask, its answer and the finish are one "Perguntou a você" row with the question and the answer', () => {
  const html = render({ entries: lived.entries })
  assert.equal(rows(html), 1)
  assert.deepEqual(asked(messagesOf(lived)), answer)
})

test('the stored history of the same turn is one row too', () => {
  const stored = { id: 'stored-1', threadId: 't', role: 'assistant', createdAt: '2026-10-01T14:35:55.000Z', content: { format: 2, parts: [
    { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'q1', toolName: 'ask_user', args: { questions: [{ question: 'Qual cor?' }] }, result: { content: 'User answered:\nQual cor?: azul', isError: false } } },
  ] } }
  const history = reduce([{ type: 'mergeWindow', messages: [stored] }])
  assert.equal(rows(render({ entries: history.entries })), 1)
  assert.deepEqual(asked(messagesOf(history)), answer)
})

test('the live turn and the window that later holds it show one row between them', () => {
  const stored = messagesOf(lived).map((message) => ({ ...message, content: { ...message.content, parts: [...message.content.parts, { type: 'step-start' }] } }))
  const merged = reduce([{ type: 'mergeWindow', messages: stored }], lived)
  assert.equal(rows(render({ entries: merged.entries })), 1)
  assert.deepEqual(merged.entries.map((entry) => entry.id), lived.entries.map((entry) => entry.id))
})

test('while the run waits on the question there is no row, only the card to answer', () => {
  const suspended = reduce(events.slice(0, events.findIndex((event) => event.type === 'agent_end') + 1).map((event) => ({ type: 'event', event })))
  assert.deepEqual(Object.values(suspended.calls).map((call) => [call.ask, call.toolCallId, call.args.questions[0].question]), [['QUESTION', 'q1', 'Qual cor?']])
  const html = render({ ...waitingOnAll(suspended), renderPrompt: card })
  assert.equal(rows(html), 0)
  assert.equal(count(html, 'card q1'), 1)
})

test('the card to answer waits until the words above it are all shown, so it is never pushed down', () => {
  const words = assistant('live-5', [thought, { type: 'text', text: 'Antes de começar, tenho uma pergunta sobre o painel que você pediu.' }])
  const asking = reduce([start(words), { type: 'event', event: { type: 'tool_suspended', toolCallId: 'q1', toolName: 'ask_user', args: {}, suspendPayload: null } }])
  const reduced = globalThis.window
  globalThis.window = { matchMedia: () => ({ matches: false }) }
  try {
    assert.equal(count(render({ ...waitingOnAll(asking), working: true, renderPrompt: card }), 'card q1'), 0)
  } finally { globalThis.window = reduced }
  assert.equal(count(render({ ...waitingOnAll(asking), working: true, renderPrompt: card }), 'card q1'), 1)
})

test('a suspended call whose run is over is a row again, and no card', () => {
  const suspended = reduce(events.slice(0, events.findIndex((event) => event.type === 'agent_end') + 1).map((event) => ({ type: 'event', event })))
  const html = render({ entries: suspended.entries })
  assert.equal(rows(html), 1)
  assert.equal(count(html, 'card q1'), 0)
})

const assistant = (id, parts) => ({ id, threadId: 't', role: 'assistant', createdAt: '2026-10-01T14:35:55.000Z', content: { format: 2, parts } })
const thought = { type: 'reasoning', reasoning: 'Planejando o esquema', details: [{ type: 'text', text: 'Planejando o esquema' }] }
const count = (html, word) => html.match(new RegExp(word, 'g'))?.length ?? 0
const start = (message) => ({ type: 'event', event: { type: 'message_start', message } })

test('a run in its agent step says it is thinking before its first part arrives', () => {
  assert.equal(count(render({ working: true }), 'Pensando…'), 1)
})

test('the thinking line goes once the run has spoken, and not while it waits on a question', () => {
  const spoke = reduce([start(assistant('live-1', [{ type: 'text', text: 'Vou ver.' }]))])
  assert.equal(count(render({ working: true, entries: spoke.entries }), 'Pensando…'), 0)
  const asking = reduce([{ type: 'event', event: { type: 'tool_suspended', toolCallId: 'q1', toolName: 'ask_user', args: {}, suspendPayload: null } }])
  assert.equal(count(render({ working: true, ...waitingOnAll(asking), renderPrompt: card }), 'Pensando…'), 0)
})

test('a settled thought is one collapsed "Pensou" row, in the history and in the live turn', () => {
  const history = reduce([{ type: 'mergeWindow', messages: [assistant('m1', [thought, { type: 'text', text: 'Pronto.' }])] }])
  assert.equal(count(render({ entries: history.entries }), 'Pensou'), 1)
  const live = reduce([start(assistant('live-2', [thought, { type: 'text', text: 'Pronto.' }])), { type: 'event', event: { type: 'message_end', id: 'live-2' } }])
  assert.equal(count(render({ entries: live.entries }), 'Pensou'), 1)
  assert.equal(count(render({ entries: history.entries }), 'Pensando…'), 0)
})

test('the thought still streaming reads "Pensando…" and has no "Pensou" row yet', () => {
  const live = reduce([start(assistant('live-3', [{ type: 'text', text: 'Certo.' }, thought]))])
  const html = render({ working: true, entries: live.entries })
  assert.equal(count(html, 'Pensando…'), 1)
  assert.equal(count(html, 'Pensou'), 0)
})

test('a message still marked streaming after its run ended reads as settled, with no thinking line', () => {
  const live = reduce([start(assistant('live-4', [{ type: 'text', text: 'Certo.' }, thought]))])
  const html = render({ entries: live.entries })
  assert.equal(count(html, 'Pensando…'), 0)
  assert.equal(count(html, 'Pensou'), 1)
})

const persistedRun = { runId: 'run-1', text: 'Crie um contador', createdAt: '2026-10-01T14:00:00.000Z' }
const sentLocally = (settle) => reduce([{ type: 'localUser', id: 'local-k1', text: 'Crie um contador' }, ...settle])

test('a send with no confirmation says so, and does not claim the Hub refused it', () => {
  const html = render({ entries: sentLocally([{ type: 'unknownLocalUser', id: 'local-k1' }]).entries })
  assert.equal(count(html, 'Sem confirmação'), 1)
  assert.equal(count(html, 'Não enviado'), 0)
})

test('only a send the Hub refused reads "Não enviado"', () => {
  const html = render({ entries: sentLocally([{ type: 'failLocalUser', id: 'local-k1' }]).entries })
  assert.equal(count(html, 'Não enviado'), 1)
  assert.equal(count(html, 'Sem confirmação'), 0)
})

test('the Hub\'s stored request is drawn even when an unconfirmed local bubble has the same words', () => {
  const html = render({ entries: sentLocally([{ type: 'unknownLocalUser', id: 'local-k1' }]).entries, persistedRequests: [persistedRun] })
  assert.equal(count(html, 'Crie um contador'), 2)
})

test('a thread message covers one stored request, so a repeated request still shows its twin', () => {
  const thread = reduce([{ type: 'mergeWindow', messages: [{ id: 'u1', threadId: 't', role: 'user', createdAt: '2026-10-01T14:00:00.000Z', content: { format: 2, parts: [{ type: 'text', text: 'Crie um contador' }] } }] }])
  const html = render({ entries: thread.entries, persistedRequests: [persistedRun, { ...persistedRun, runId: 'run-2', createdAt: '2026-10-01T15:00:00.000Z' }] })
  assert.equal(count(html, 'Crie um contador'), 2)
})

test('a tool call whose stored result is {error: true, message} stays a failed row after a reload, as it was live', () => {
  const message = 'Tool input validation failed for ask_user'
  const stored = (result) => assistant('failed-1', [{ type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'f1', toolName: 'ask_user', args: { questions: [{ question: 'Qual cor?' }] }, result } }])
  const shown = (result) => render({ entries: reduce([{ type: 'mergeWindow', messages: [stored(result)] }]).entries })
  const failedLive = shown({ isError: true, message })
  assert.notEqual(failedLive, shown({ isError: false, message }), 'a failed row does not read as a finished one')
  assert.equal(shown({ error: true, message }), failedLive)
})

test('a call resolved in a later message keeps its first place and arguments and takes the later state', () => {
  const call = (state, args, extra = {}) => ({ type: 'tool-invocation', toolInvocation: { state, toolCallId: 'q1', toolName: 'ask_user', args, ...extra } })
  const asking = assistant('m1', [{ type: 'text', text: 'Antes, uma pergunta.' }, call('call', { questions: [{ question: 'Qual cor?' }] })])
  const resolved = assistant('m2', [call('result', {}, { result: { content: 'azul', isError: false } }), { type: 'text', text: 'Feito.' }])
  assert.deepEqual(mergeCalls([asking, resolved]).map((message) => [message.id, message.content.parts]), [
    ['m1', [{ type: 'text', text: 'Antes, uma pergunta.' }, call('result', { questions: [{ question: 'Qual cor?' }] }, { result: { content: 'azul', isError: false } })]],
    ['m2', [{ type: 'text', text: 'Feito.' }]],
  ])
})

test("the Conexus check's verdict reads as a notice in its own words, without Mastra's scoring frame", async () => {
  const { formatStreamCompletionFeedback } = await import('@mastra/core/loop')
  const reason = 'Verificação do Conexus: o app não passou (1 de 3).\ntypecheck failed:\napp/src/total.ts:1: TS2322 Type string is not number\nResolva estes problemas e diga que terminou: o Conexus verifica o app quando você terminar.'
  const verdict = { complete: false, totalDuration: 1200, timedOut: false, scorers: [{ scorerId: 'conexus-check', scorerName: 'Verificação do Conexus', score: 0, passed: false, reason }] }
  const stored = (id, maxIterationReached) => ({ id, threadId: 't', role: 'assistant', createdAt: '2026-10-02T14:35:55.000Z', content: {
    format: 2, parts: [{ type: 'text', text: formatStreamCompletionFeedback(verdict, maxIterationReached) }], metadata: { mode: 'stream', completionResult: { passed: false, suppressFeedback: false } },
  } })
  const html = render({ entries: reduce([{ type: 'mergeWindow', messages: [stored('check-1', false), stored('check-2', true)] }]).entries })
  const notices = [...html.matchAll(/<div class="builder-turn-notice" role="note">(.*?)<\/div><\/div>/gs)].map(([, inner]) => inner.replace(/<[^>]+>/g, ''))
  const escaped = reason.replaceAll("'", '&#x27;')
  assert.deepEqual(notices, [escaped, escaped])
})
