import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { emptyRuntime, runtimeReducer } from '../../apps/web/src/features/builder/runtime.ts'
import { emptyTranscript, localMessageId, transcriptReducer } from '../../apps/web/src/features/builder/transcript.ts'

const dbMessage = (id, role, parts, metadata) => ({ id, role, createdAt: new Date(), content: { format: 2, parts, ...(metadata ? { metadata } : {}) } })
const text = (value) => ({ type: 'text', text: value })
const toolPart = (toolCallId, state, extra = {}) => ({ type: 'tool-invocation', toolInvocation: { state, toolCallId, toolName: 'view', args: {}, ...extra } })
const signal = (id, value, type = 'user') => dbMessage(id, 'signal', [text(value)], { signal: { id, type, tagName: type } })
const liveSignal = (id, value) => {
  const payload = { id, type: 'user', tagName: 'user', contents: value, createdAt: '2026-07-27T16:00:00.000Z' }
  return dbMessage(id, 'signal', [{ type: 'data-user-message', data: payload }], { signal: payload })
}

const event = (state, payload) => transcriptReducer(state, { type: 'event', event: payload })
const merge = (state, messages) => transcriptReducer(state, { type: 'mergeWindow', messages })
const start = (state, message) => event(state, { type: 'message_start', message })
const end = (state, id) => event(state, { type: 'message_end', id })
const hydrate = (messages) => merge(emptyTranscript('c1'), messages)
const ids = (state) => state.entries.map((entry) => entry.id)
const partsOf = (entry) => entry.message.content.parts

test('history from a window becomes message entries that keep every part as the server sent it', () => {
  const parts = [
    text('I will inspect it.'),
    { type: 'reasoning', reasoning: 'Need the file first.', details: [{ type: 'text', text: 'Need the file first.' }] },
    toolPart('tool-1', 'result', { args: { path: 'src/index.ts' }, result: 'export const value = 1;' }),
  ]
  const state = hydrate([dbMessage('user-1', 'user', [text('Inspect this')]), dbMessage('assistant-1', 'assistant', parts)])
  assert.deepEqual(state.entries.map((entry) => [entry.kind, entry.id, entry.message.role, entry.streaming]), [
    ['message', 'user-1', 'user', false],
    ['message', 'assistant-1', 'assistant', false],
  ])
  assert.deepEqual(partsOf(state.entries[0]), [text('Inspect this')])
  assert.deepEqual(partsOf(state.entries[1]), parts)
})

test('persisted and live user signals are drawn as the person while other signals stay signals', () => {
  const persisted = signal('user-signal-1', 'sup')
  const reminder = signal('reminder-1', 'Follow the package instructions.', 'system-reminder')
  const hydrated = hydrate([persisted, reminder])
  assert.deepEqual(hydrated.entries.map((entry) => [entry.id, entry.message.role]), [['user-signal-1', 'user'], ['reminder-1', 'signal']])
  assert.deepEqual(partsOf(hydrated.entries[0]), [text('sup')])
  assert.deepEqual(hydrated.entries[0].message.content.metadata, persisted.content.metadata)

  const live = start(hydrated, signal('user-signal-2', 'also inspect the tests'))
  assert.deepEqual(live.entries.map((entry) => [entry.id, entry.message.role, entry.streaming]), [
    ['user-signal-1', 'user', false],
    ['reminder-1', 'signal', false],
    ['user-signal-2', 'user', true],
  ])
})

test('a text delta appends to the streaming message, leaves notices alone and clears pending', () => {
  const noticed = event(emptyTranscript('c1'), { type: 'error', error: { message: 'x' }, retryable: false })
  const started = start({ ...noticed, pending: true }, dbMessage('assistant-1', 'assistant', [text('')]))
  const state = event(started, { type: 'message_update', id: 'assistant-1', event: { type: 'text-delta', delta: 'Streaming text' } })
  assert.notEqual(state, started)
  assert.equal(state.pending, false)
  assert.deepEqual(state.entries.map((entry) => [entry.kind, entry.id]), [['notice', noticed.entries[0].id], ['message', 'assistant-1']])
  assert.equal(state.entries[1].streaming, true)
  assert.deepEqual(partsOf(state.entries[1]), [text('Streaming text')])
  assert.deepEqual(partsOf(started.entries[1]), [text('')])
})

test('an empty text delta changes nothing', () => {
  const started = start(emptyTranscript('c1'), dbMessage('assistant-1', 'assistant', [text('a')]))
  assert.equal(event(started, { type: 'message_update', id: 'assistant-1', event: { type: 'text-delta', delta: '' } }), started)
})

test('reasoning deltas and tool parts land at the index the stream names', () => {
  let state = start(emptyTranscript('c1'), dbMessage('assistant-1', 'assistant', [text('Before')]))
  const update = (inner) => { state = event(state, { type: 'message_update', id: 'assistant-1', event: inner }) }
  update({ type: 'part', index: 1, part: { type: 'reasoning', reasoning: '', details: [] } })
  update({ type: 'reasoning-delta', index: 1, delta: 'Thinking' })
  update({ type: 'part', index: 2, part: toolPart('tool-1', 'call', { args: { path: 'a.ts' } }) })
  assert.deepEqual(partsOf(state.entries[0]), [
    text('Before'),
    { type: 'reasoning', reasoning: 'Thinking', details: [{ type: 'text', text: 'Thinking' }] },
    toolPart('tool-1', 'call', { args: { path: 'a.ts' } }),
  ])
})

test('an update index is translated after a tool part drawn by an earlier entry was filtered out', () => {
  const tool = toolPart('tool-1', 'call', { args: { path: 'a.ts' } })
  let state = hydrate([dbMessage('assistant-0', 'assistant', [tool])])
  state = start(state, dbMessage('assistant-1', 'assistant', [tool, text('Before')]))
  assert.deepEqual(partsOf(state.entries[1]), [text('Before')])
  assert.deepEqual(state.entries[1].sourcePartIndexes, [1])
  state = event(state, { type: 'message_update', id: 'assistant-1', event: { type: 'part', index: 1, part: text('After') } })
  assert.deepEqual(partsOf(state.entries[1]), [text('After')])
})

test('a message_start delivered again keeps the text already streamed', () => {
  const message = dbMessage('assistant-1', 'assistant', [text('')])
  let state = start(emptyTranscript('c1'), message)
  state = event(state, { type: 'message_update', id: 'assistant-1', event: { type: 'text-delta', delta: 'Streaming text' } })
  const replayed = start(state, message)
  assert.deepEqual(ids(replayed), ['assistant-1'])
  assert.deepEqual(partsOf(replayed.entries[0]), [text('Streaming text')])
})

test('message_end seals only the matching assistant message and clears pending', () => {
  const message = dbMessage('assistant-1', 'assistant', [text('')])
  const started = start({ ...emptyTranscript('c1'), pending: true }, message)
  const duplicate = start(started, message)
  const mismatched = end(duplicate, 'assistant-2')
  const ended = end(mismatched, 'assistant-1')
  assert.deepEqual(ids(duplicate), ['assistant-1'])
  assert.equal(mismatched, duplicate)
  assert.equal(ended.entries[0].streaming, false)
  assert.equal(ended.pending, false)
})

test('signal messages between assistant segments are kept in order and never clear pending', () => {
  let state = start({ ...emptyTranscript('c1'), pending: true }, dbMessage('assistant-1', 'assistant', [text('Before signals')]))
  state = end(state, 'assistant-1')
  const reminder = signal('reminder-1', 'Follow the package instructions.', 'system-reminder')
  const summary = signal('summary-1', 'github: 2 pending notifications', 'notification')
  for (const message of [reminder, summary]) {
    state = start(state, message)
    assert.equal(state.entries.at(-1).streaming, true)
    assert.equal(state.pending, false)
    state = end(state, message.id)
    assert.equal(state.entries.at(-1).streaming, false)
  }
  state = start(state, dbMessage('assistant-2', 'assistant', [text('After signals')]))
  assert.deepEqual(ids(state), ['assistant-1', 'reminder-1', 'summary-1', 'assistant-2'])
  assert.deepEqual(state.entries.map((entry) => entry.message.role), ['assistant', 'signal', 'signal', 'assistant'])
  assert.deepEqual(partsOf(state.entries[1]), [text('Follow the package instructions.')])
  assert.deepEqual(partsOf(state.entries[3]), [text('After signals')])
})

test('a signal start and end leave pending set', () => {
  const reminder = signal('reminder-1', 'Wait for assistant output.', 'system-reminder')
  const ended = end(start({ ...emptyTranscript('c1'), pending: true }, reminder), 'reminder-1')
  assert.equal(ended.pending, true)
  assert.deepEqual(ended.entries.map((entry) => [entry.id, entry.streaming]), [['reminder-1', false]])
})

test('a resumed ask_user call stays in the bubble it was answered in, with the result folded in', () => {
  const suspended = dbMessage('assistant-before-suspend', 'assistant', [text('Before question'), toolPart('ask-1', 'call', { toolName: 'ask_user', args: { question: 'Which database?' } })])
  const answered = toolPart('ask-1', 'result', { toolName: 'ask_user', args: { question: 'Which database?' }, result: { content: 'User answered: Postgres', isError: false } })
  let state = end(start(emptyTranscript('c1'), suspended), suspended.id)
  state = start(state, dbMessage('assistant-after-resume', 'assistant', [answered, text('After question')]))
  assert.deepEqual(ids(state), ['assistant-before-suspend', 'assistant-after-resume'])
  assert.deepEqual(partsOf(state.entries[0]), [text('Before question'), answered])
  assert.deepEqual(partsOf(state.entries[1]), [text('After question')])
})

test('a call drawn under the previous bubble stays there when the rotated message claims it, and tool_end settles it', () => {
  let state = end(start(emptyTranscript('c1'), dbMessage('turn-1', 'assistant', [text('Looking around')])), 'turn-1')
  state = event(state, { type: 'tool_start', toolCallId: 'tool-1', toolName: 'view', args: { path: 'src/index.ts' } })
  const call = toolPart('tool-1', 'call', { args: { path: 'src/index.ts' } })
  state = start(state, dbMessage('turn-2', 'assistant', [call, text('Reading the entry point')]))
  assert.deepEqual(ids(state), ['turn-1', 'turn-2'])
  assert.deepEqual(partsOf(state.entries[0]), [text('Looking around'), call])
  assert.deepEqual(partsOf(state.entries[1]), [text('Reading the entry point')])
  state = event(state, { type: 'tool_end', toolCallId: 'tool-1', result: 'ok', isError: false })
  assert.deepEqual(partsOf(state.entries[0]), [text('Looking around'), toolPart('tool-1', 'result', { args: { path: 'src/index.ts' }, result: 'ok' })])
})

test("a rotated message's result is folded into the drawn row when tool_end was lost", () => {
  let state = end(start(emptyTranscript('c1'), dbMessage('turn-1', 'assistant', [text('Looking around')])), 'turn-1')
  state = event(state, { type: 'tool_start', toolCallId: 'tool-1', toolName: 'view', args: { path: 'src/index.ts' } })
  const done = toolPart('tool-1', 'result', { args: { path: 'src/index.ts' }, result: 'contents' })
  state = start(state, dbMessage('turn-2', 'assistant', [done, text('Found it')]))
  assert.deepEqual(partsOf(state.entries[0]), [text('Looking around'), done])
  assert.deepEqual(partsOf(state.entries[1]), [text('Found it')])
})

test('tool lifecycle events draw the call inline before any message re-emits it', () => {
  const started = event(emptyTranscript('c1'), { type: 'tool_start', toolCallId: 'tool-1', toolName: 'view', args: { path: 'src/index.ts' } })
  assert.deepEqual(partsOf(started.entries[0]), [toolPart('tool-1', 'call', { args: { path: 'src/index.ts' } })])
  const ended = event(started, { type: 'tool_end', toolCallId: 'tool-1', result: 'done', isError: false })
  assert.deepEqual(partsOf(ended.entries[0]), [toolPart('tool-1', 'result', { args: { path: 'src/index.ts' }, result: 'done' })])
})

test('a tool_end with isError stamps isError on the part', () => {
  const started = event(emptyTranscript('c1'), { type: 'tool_start', toolCallId: 'tool-1', toolName: 'view', args: {} })
  const ended = event(started, { type: 'tool_end', toolCallId: 'tool-1', result: 'exploded', isError: true })
  assert.deepEqual(partsOf(ended.entries[0]), [toolPart('tool-1', 'result', { result: 'exploded', isError: true })])
})

test('the same turn coming back under a new message id rewrites its entry', () => {
  const started = dbMessage('streamed-turn', 'assistant', [text('gh is missing here.'), toolPart('tool-1', 'result', { toolName: 'execute_command', result: 'ok' })])
  const reidentified = dbMessage('adopted-turn', 'assistant', [...started.content.parts, text('Installing it now.')])
  const state = start(start(emptyTranscript('c1'), started), reidentified)
  assert.equal(state.entries.length, 1)
  assert.deepEqual(partsOf(state.entries[0]), reidentified.content.parts)
})

test('a rotated turn is its own entry even when its text repeats the last one', () => {
  const first = dbMessage('turn-1', 'assistant', [text('Let me check')])
  let state = end(start(emptyTranscript('c1'), first), 'turn-1')
  state = start(state, dbMessage('turn-2', 'assistant', [text('')]))
  state = start(state, dbMessage('turn-2', 'assistant', [text('Let me check the tests too')]))
  assert.equal(state.entries.length, 2)
  assert.deepEqual(partsOf(state.entries[0]), first.content.parts)
  assert.deepEqual(partsOf(state.entries[1]), [text('Let me check the tests too')])
})

test('a sealed turn is left alone when a later turn opens with the same words', () => {
  const sealed = dbMessage('turn-1', 'assistant', [text('Done.')])
  let state = end(start(emptyTranscript('c1'), sealed), 'turn-1')
  state = start(state, dbMessage('turn-2', 'assistant', [text('Done. Now the next thing')]))
  assert.equal(state.entries.length, 2)
  assert.deepEqual(partsOf(state.entries[0]), sealed.content.parts)
})

test('a tool-bearing entry keeps the id it was drawn with, and closes to the next reply', () => {
  const drawn = event(emptyTranscript('c1'), { type: 'tool_start', toolCallId: 'call-1', toolName: 'view', args: { path: 'a.ts' } })
  assert.deepEqual(ids(drawn), ['assistant-tools-call-1'])
  const claimed = start(drawn, dbMessage('assistant-first', 'assistant', [text('Read it.')]))
  assert.deepEqual(ids(claimed), ['assistant-tools-call-1'])
  const next = start(claimed, dbMessage('assistant-second', 'assistant', [text('Now the next one.')]))
  assert.deepEqual(ids(next), ['assistant-tools-call-1', 'assistant-second'])
})

test('a window prepends only messages older than the oldest entry on screen', () => {
  const onScreen = hydrate([dbMessage('msg-3', 'user', [text('third')]), dbMessage('msg-4', 'assistant', [text('fourth')])])
  const next = merge(onScreen, [
    dbMessage('msg-1', 'user', [text('first')]),
    dbMessage('msg-2', 'assistant', [text('second')]),
    dbMessage('msg-3', 'user', [text('third')]),
    dbMessage('msg-4', 'assistant', [text('fourth')]),
  ])
  assert.deepEqual(ids(next), ['msg-1', 'msg-2', 'msg-3', 'msg-4'])
})

test('a window does not duplicate the anchor message', () => {
  const onScreen = hydrate([dbMessage('msg-2', 'assistant', [text('second')])])
  const next = merge(onScreen, [dbMessage('msg-1', 'user', [text('first')]), dbMessage('msg-2', 'assistant', [text('second')])])
  assert.deepEqual(ids(next), ['msg-1', 'msg-2'])
})

test('live-streamed messages stay at the tail when older history is prepended', () => {
  let state = hydrate([dbMessage('history-2', 'assistant', [text('older reply')])])
  state = end(start(state, dbMessage('live-1', 'assistant', [text('live reply')])), 'live-1')
  const next = merge(state, [dbMessage('history-1', 'user', [text('oldest')]), dbMessage('history-2', 'assistant', [text('older reply')])])
  assert.deepEqual(ids(next), ['history-1', 'history-2', 'live-1'])
})

test('an empty window returns the state untouched', () => {
  const onScreen = hydrate([dbMessage('msg-1', 'user', [text('only')])])
  assert.equal(merge(onScreen, []), onScreen)
})

test('a window already fully on screen returns the state untouched', () => {
  const messages = [dbMessage('msg-1', 'user', [text('first')]), dbMessage('msg-2', 'assistant', [text('second')])]
  const onScreen = hydrate(messages)
  assert.equal(merge(onScreen, messages), onScreen)
})

test('a window appends the messages the run produced while the page was away', () => {
  const onScreen = hydrate([dbMessage('kickoff', 'user', [text('review this PR')])])
  const next = merge(onScreen, [
    dbMessage('kickoff', 'user', [text('review this PR')]),
    dbMessage('reply-1', 'assistant', [text('reading the diff')]),
    dbMessage('reply-2', 'assistant', [text('here is the review')]),
  ])
  assert.deepEqual(ids(next), ['kickoff', 'reply-1', 'reply-2'])
})

test('a window fills a gap between two on-screen messages', () => {
  const onScreen = hydrate([dbMessage('msg-1', 'user', [text('first')]), dbMessage('msg-3', 'assistant', [text('third')])])
  const next = merge(onScreen, [dbMessage('msg-1', 'user', [text('first')]), dbMessage('msg-2', 'assistant', [text('second')]), dbMessage('msg-3', 'assistant', [text('third')])])
  assert.deepEqual(ids(next), ['msg-1', 'msg-2', 'msg-3'])
})

test('the streaming entry stays as it is for a message the window also carries', () => {
  const state = start(emptyTranscript('c1'), dbMessage('assistant-1', 'assistant', [text('partial')]))
  const next = merge(state, [dbMessage('assistant-1', 'assistant', [text('persisted prefix')])])
  assert.equal(next.entries[0].streaming, true)
  assert.deepEqual(partsOf(next.entries[0]), [text('partial')])
})

test('a tool part stuck at call takes the terminal copy from the window', () => {
  const onScreen = hydrate([dbMessage('assistant-1', 'assistant', [toolPart('tool-1', 'call', { toolName: 'execute_command' })])])
  const result = toolPart('tool-1', 'result', { toolName: 'execute_command', result: 'ok' })
  assert.deepEqual(partsOf(merge(onScreen, [dbMessage('assistant-1', 'assistant', [result])]).entries[0]), [result])
})

test('a stuck tool part is healed without touching live-streamed text', () => {
  const state = start(emptyTranscript('c1'), dbMessage('assistant-1', 'assistant', [text('streamed text'), toolPart('tool-1', 'call')]))
  const result = toolPart('tool-1', 'result', { result: 'done' })
  const next = merge(state, [dbMessage('assistant-1', 'assistant', [text('persisted prefix'), result])])
  assert.deepEqual(partsOf(next.entries[0]), [text('streamed text'), result])
})

test('a terminal tool part never regresses to an older call state from the window', () => {
  const onScreen = hydrate([dbMessage('assistant-1', 'assistant', [toolPart('tool-1', 'result', { result: 'ok' })])])
  assert.equal(merge(onScreen, [dbMessage('assistant-1', 'assistant', [toolPart('tool-1', 'call')])]), onScreen)
})

for (const state of ['output-error', 'output-denied']) {
  test(`a tool part stuck at call takes a terminal ${state} copy from the window`, () => {
    const onScreen = hydrate([dbMessage('assistant-1', 'assistant', [toolPart('tool-1', 'call')])])
    const terminal = toolPart('tool-1', state, { errorText: 'nope' })
    assert.deepEqual(partsOf(merge(onScreen, [dbMessage('assistant-1', 'assistant', [terminal])]).entries[0]), [terminal])
  })
}

test('a window adopts the trailing parts a gap swallowed when the run ended before reconnect', () => {
  const state = start(emptyTranscript('c1'), dbMessage('live-1', 'assistant', [text('working'), toolPart('tool-1', 'call')]))
  const result = toolPart('tool-1', 'result', { result: 'ok' })
  const next = merge(state, [dbMessage('persisted-1', 'assistant', [text('working on it'), result, text('final answer')])])
  assert.equal(next.entries.length, 1)
  assert.deepEqual(partsOf(next.entries[0]), [text('working on it'), result, text('final answer')])
})

test('a window that matches the on-screen turn exactly returns the same state', () => {
  const parts = [text('done'), toolPart('tool-1', 'result', { result: 'ok' })]
  const onScreen = hydrate([dbMessage('assistant-1', 'assistant', parts)])
  assert.equal(merge(onScreen, [dbMessage('assistant-1', 'assistant', parts)]), onScreen)
})

test('a turn the window carries under its persisted id is healed in place, not appended', () => {
  const state = start(emptyTranscript('c1'), dbMessage('live-1', 'assistant', [text('working on it'), toolPart('tool-1', 'call')]))
  const result = toolPart('tool-1', 'result', { result: 'ok' })
  const next = merge(state, [dbMessage('persisted-1', 'assistant', [text('working on it'), result])])
  assert.equal(next.entries.length, 1)
  assert.deepEqual(partsOf(next.entries[0]), [text('working on it'), result])
})

test('the text of a turn the server persisted as its own step is not drawn a second time', () => {
  const result = toolPart('tool-1', 'result', { result: 'ok' })
  const state = start(emptyTranscript('c1'), dbMessage('streamed-turn', 'assistant', [result, text('Almost, but not approvable yet.')]))
  const next = merge(state, [dbMessage('step-1', 'assistant', [result]), dbMessage('step-2', 'assistant', [text('Almost, but not approvable yet.')])])
  assert.equal(next.entries.length, 1)
})

test('a persisted step that holds a prefix of the text still streaming is not drawn again', () => {
  const result = toolPart('tool-1', 'result', { result: 'ok' })
  const state = start(emptyTranscript('c1'), dbMessage('streamed-turn', 'assistant', [result, text('Almost, but not approvable yet.')]))
  const next = merge(state, [dbMessage('step-1', 'assistant', [result]), dbMessage('step-2', 'assistant', [text('Almost, but not')])])
  assert.equal(next.entries.length, 1)
})

test('a sealed turn whose text merely extends an older one is inserted', () => {
  const onScreen = hydrate([dbMessage('history-turn', 'assistant', [text('Almost, but')])])
  const next = merge(onScreen, [dbMessage('history-turn', 'assistant', [text('Almost, but')]), dbMessage('new-turn', 'assistant', [text('Almost, but not approvable yet.')])])
  assert.deepEqual(ids(next), ['history-turn', 'new-turn'])
})

test('a window copy that wrote the streaming step further is adopted in place', () => {
  const state = start(emptyTranscript('c1'), dbMessage('streamed-turn', 'assistant', [text('Almost')]))
  const next = merge(state, [dbMessage('step-2', 'assistant', [text('Almost, but not approvable yet.')])])
  assert.equal(next.entries.length, 1)
  assert.deepEqual(partsOf(next.entries[0]), [text('Almost, but not approvable yet.')])
})

test('a window copy whose parts prove it is a different turn is inserted', () => {
  const state = start(emptyTranscript('c1'), dbMessage('streamed-turn', 'assistant', [text('Checking.'), toolPart('tool-1', 'result', { result: 'ok' })]))
  const next = merge(state, [dbMessage('other-turn', 'assistant', [toolPart('tool-9', 'result', { result: 'ok' }), text('Checking.')])])
  assert.equal(next.entries.length, 2)
})

test('a window copy that adds a text part the gap swallowed is inserted', () => {
  const state = start(emptyTranscript('c1'), dbMessage('streamed-turn', 'assistant', [text('Almost')]))
  const next = merge(state, [dbMessage('step-2', 'assistant', [text('Almost'), text('but not approvable yet.')])])
  assert.equal(next.entries.length, 2)
})

test('a window does not redraw a turn whose persisted copy carries tool calls the stream never delivered', () => {
  const state = start(emptyTranscript('c1'), dbMessage('streamed-turn', 'assistant', [text('gh is missing here.')]))
  const next = merge(state, [dbMessage('persisted-turn', 'assistant', [text('gh is missing here.'), toolPart('tool-1', 'result', { toolName: 'execute_command', result: 'ok' })])])
  assert.equal(next.entries.length, 1)
  assert.equal(partsOf(next.entries[0]).length, 2)
})

test('a window draws both messages when the same text is sent twice', () => {
  let state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: localMessageId('k1'), text: 'again' })
  state = transcriptReducer(state, { type: 'localUser', id: localMessageId('k2'), text: 'again' })
  const next = merge(state, [signal('sig-1', 'again'), signal('sig-2', 'again')])
  assert.deepEqual(next.entries.map((entry) => [entry.id, entry.delivery]), [['local-k1', undefined], ['local-k2', undefined]])
})

test('a local message is claimed by the persisted user signal in a merged window, keeps its local id and loses delivery', () => {
  const state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: localMessageId('k1'), text: 'stop and read the file' })
  const next = merge(state, [signal('sig-1', 'stop and read the file')])
  assert.equal(next.entries.length, 1)
  assert.equal(next.entries[0].id, 'local-k1')
  assert.equal(next.entries[0].delivery, undefined)
  assert.equal(next.entries[0].message.id, 'sig-1')
  assert.equal(next.entries[0].message.role, 'user')
  assert.deepEqual(partsOf(next.entries[0]), [text('stop and read the file')])
})

test('a live data-user-message signal is drawn as the person with a text part built from its contents', () => {
  let state = start(emptyTranscript('c1'), liveSignal('sig-1', 'hello from slack'))
  state = end(state, 'sig-1')
  assert.deepEqual(state.entries.map((entry) => [entry.id, entry.message.role]), [['sig-1', 'user']])
  assert.deepEqual(partsOf(state.entries[0]), [text('hello from slack')])
})

test('a live signal replacing an already-rendered persisted copy does not blank the row', () => {
  let state = start(emptyTranscript('c1'), signal('sig-1', 'hello from slack'))
  state = end(start(state, liveSignal('sig-1', 'hello from slack')), 'sig-1')
  assert.equal(state.entries.length, 1)
  assert.deepEqual(partsOf(state.entries[0]), [text('hello from slack')])
})

test('a persisted user signal streamed live keeps its text part', () => {
  const state = start(emptyTranscript('c1'), signal('sig-1', 'hello from slack'))
  assert.deepEqual(partsOf(state.entries[0]), [text('hello from slack')])
})

test('a live user signal with the same text confirms the local message, which keeps its local id and loses delivery', () => {
  let state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: localMessageId('k1'), text: 'hello from the composer' })
  assert.equal(state.entries[0].delivery, 'pending')
  state = end(start(state, liveSignal('sig-web', 'hello from the composer')), 'sig-web')
  assert.equal(state.entries.length, 1)
  assert.equal(state.entries[0].id, 'local-k1')
  assert.equal(state.entries[0].delivery, undefined)
  assert.equal(state.entries[0].message.id, 'sig-web')
  assert.equal(state.entries[0].message.role, 'user')
  assert.deepEqual(partsOf(state.entries[0]), [text('hello from the composer')])
})

test('a data-only user signal confirms the local message through a window with the text the person typed', () => {
  let state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: localMessageId('k1'), text: 'hello from the composer' })
  state = merge(state, [liveSignal('sig-web', 'hello from the composer')])
  assert.equal(state.entries.length, 1)
  assert.equal(state.entries[0].id, 'local-k1')
  assert.equal(state.entries[0].delivery, undefined)
  assert.deepEqual(partsOf(state.entries[0]), [text('hello from the composer')])
})

test('a failed local message is confirmed when its signal arrives later', () => {
  let state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: 'local-k1', text: 'hello' })
  state = transcriptReducer(state, { type: 'failLocalUser', id: 'local-k1' })
  state = start(state, liveSignal('sig-1', 'hello'))
  assert.deepEqual(state.entries.map((entry) => [entry.id, entry.delivery]), [['local-k1', undefined]])
})

test('every user signal, whatever its tag, is drawn as the person, and a user-message type too', () => {
  const state = hydrate([dbMessage('s1', 'signal', [text('typed')], { signal: { type: 'user-message' } })])
  assert.equal(state.entries[0].message.role, 'user')
})

test('non-user signals are left alone', () => {
  const state = start(emptyTranscript('c1'), signal('sig-2', 'stay on task', 'system-reminder'))
  assert.deepEqual(state.entries.map((entry) => [entry.id, entry.message.role]), [['sig-2', 'signal']])
  assert.deepEqual(partsOf(state.entries[0]), [text('stay on task')])
})

const noticeFor = (state) => state.entries.filter((entry) => entry.kind === 'notice').map((entry) => [entry.id, entry.level, entry.text])

test('a retryable error under its max is one info notice that the next retry replaces in place', () => {
  const first = event(emptyTranscript('c1'), { type: 'error', error: { message: 'sandbox sbx-42 stack frame' }, retryable: true, retryAttempt: 2, maxRetries: 10 })
  assert.deepEqual(noticeFor(first), [['model-retry', 'info', 'O modelo não respondeu. Tentando de novo (2 de 10).']])
  const second = event(first, { type: 'error', error: { message: 'again' }, retryable: true, retryAttempt: 3, maxRetries: 10 })
  assert.deepEqual(noticeFor(second), [['model-retry', 'info', 'O modelo não respondeu. Tentando de novo (3 de 10).']])
})

for (const ending of [
  { type: 'message_start', message: dbMessage('a1', 'assistant', [text('')]) },
  { type: 'message_update', id: 'a1', event: { type: 'text-delta', delta: 'x' } },
  { type: 'agent_end', reason: 'complete' },
]) {
  test(`the retry notice is removed by the next ${ending.type}`, () => {
    let state = start(emptyTranscript('c1'), dbMessage('a1', 'assistant', [text('')]))
    state = event(state, { type: 'error', error: {}, retryable: true, retryAttempt: 2, maxRetries: 10 })
    assert.deepEqual(noticeFor(state).map((notice) => notice[0]), ['model-retry'])
    state = event(state, ending)
    assert.deepEqual(noticeFor(state), [])
  })
}

test('a non-retryable error is an error notice in Conexus words and never shows the provider message', () => {
  const state = event(emptyTranscript('c1'), { type: 'error', error: { message: 'model quota exhausted in sandbox sbx-42' }, retryable: false })
  assert.equal(state.entries.length, 1)
  assert.equal(state.entries[0].kind, 'notice')
  assert.equal(state.entries[0].level, 'error')
  assert.equal(state.entries[0].text, 'O modelo parou com um erro. Seu pedido continua nesta conversa.')
})

test('a retryable error at its max is an error notice and the retry notice is gone', () => {
  let state = event(emptyTranscript('c1'), { type: 'error', error: {}, retryable: true, retryAttempt: 9, maxRetries: 10 })
  state = event(state, { type: 'error', error: { message: 'raw' }, retryable: true, retryAttempt: 10, maxRetries: 10 })
  assert.deepEqual(noticeFor(state).map((notice) => [notice[1], notice[2]]), [['error', 'O modelo não respondeu depois de 10 tentativas. Seu pedido continua nesta conversa.']])
})

const askMessage = (tool = 'ask_user') => dbMessage('assistant-ask', 'assistant', [toolPart('q1', 'call', { toolName: tool, args: { question: 'Which database?' } })], {
  suspendedTools: { ask: { toolCallId: 'q1', toolName: tool, args: { question: 'Which database?' }, suspendPayload: { question: 'Which database?', options: [{ label: 'Postgres' }] } } },
})

test('a window message with a suspended ask_user call is followed by a QUESTION prompt', () => {
  const state = hydrate([askMessage()])
  assert.deepEqual(state.entries.map((entry) => [entry.kind, entry.id]), [['message', 'assistant-ask'], ['prompt', 'prompt-q1']])
  assert.deepEqual(state.entries[1], {
    kind: 'prompt', id: 'prompt-q1', ask: 'QUESTION', toolCallId: 'q1', toolName: 'ask_user',
    args: { question: 'Which database?' }, prompt: { question: 'Which database?', options: [{ label: 'Postgres' }] },
  })
})

test('a suspended submit_plan call is a PLAN prompt', () => {
  const state = hydrate([askMessage('submit_plan')])
  assert.deepEqual(state.entries.map((entry) => [entry.kind, entry.id, entry.ask]), [['message', 'assistant-ask', undefined], ['prompt', 'prompt-q1', 'PLAN']])
})

test('merging the same window again adds no second prompt', () => {
  const once = hydrate([askMessage()])
  const twice = merge(once, [askMessage()])
  assert.deepEqual(ids(twice), ['assistant-ask', 'prompt-q1'])
})

test('a later window where the call has a result part removes the prompt', () => {
  const asked = hydrate([askMessage()])
  const answered = dbMessage('assistant-ask', 'assistant', [toolPart('q1', 'result', { toolName: 'ask_user', result: { content: 'User answered: Postgres', isError: false } })])
  const next = merge(asked, [answered])
  assert.deepEqual(next.entries.map((entry) => [entry.kind, entry.id]), [['message', 'assistant-ask']])
  assert.deepEqual(partsOf(next.entries[0]), answered.content.parts)
})

test('a prompt pushed by tool_suspended is removed by tool_end', () => {
  let state = event(emptyTranscript('c1'), { type: 'tool_suspended', toolCallId: 'q1', toolName: 'ask_user', args: {}, suspendPayload: { question: 'x' } })
  assert.deepEqual(state.entries.filter((entry) => entry.kind === 'prompt').map((entry) => [entry.id, entry.ask, entry.prompt]), [['prompt-q1', 'QUESTION', { question: 'x' }]])
  state = event(state, { type: 'tool_end', toolCallId: 'q1', result: 'azul', isError: false })
  assert.deepEqual(state.entries.filter((entry) => entry.kind === 'prompt'), [])
})

test('a prompt pushed by tool_suspended is removed by tool_suspension_cancelled', () => {
  let state = event(emptyTranscript('c1'), { type: 'tool_suspended', toolCallId: 'q1', toolName: 'submit_plan', args: {}, suspendPayload: {} })
  assert.deepEqual(state.entries.map((entry) => [entry.id, entry.ask]), [['prompt-q1', 'PLAN']])
  state = event(state, { type: 'tool_suspension_cancelled', toolCallId: 'q1' })
  assert.deepEqual(state.entries, [])
})

test('tool_approval_required pushes one APPROVAL prompt per call', () => {
  const approval = { type: 'tool_approval_required', toolCallId: 'a1', toolName: 'execute_command', args: { command: 'ls' } }
  const state = event(event(emptyTranscript('c1'), approval), approval)
  assert.deepEqual(state.entries, [{ kind: 'prompt', id: 'prompt-a1', ask: 'APPROVAL', toolCallId: 'a1', toolName: 'execute_command', args: { command: 'ls' }, prompt: null }])
})

test('resolvePrompt removes the prompt of that call only', () => {
  let state = event(emptyTranscript('c1'), { type: 'tool_suspended', toolCallId: 'q1', toolName: 'ask_user', args: {}, suspendPayload: {} })
  state = event(state, { type: 'tool_suspended', toolCallId: 'q2', toolName: 'ask_user', args: {}, suspendPayload: {} })
  assert.deepEqual(ids(transcriptReducer(state, { type: 'resolvePrompt', toolCallId: 'q1' })), ['prompt-q2'])
})

test('display_state_changed sets the task list', () => {
  const tasks = [{ content: 'Montar a tela', status: 'in_progress', activeForm: 'Montando a tela' }]
  const state = event(emptyTranscript('c1'), { type: 'display_state_changed', displayState: { activeTools: {}, tasks, pendingApproval: null, pendingSuspensions: {} } })
  assert.deepEqual(state.tasks, tasks)
})

test('a local message is pending, fails, resets to pending on a resend under the same id, and is dropped', () => {
  let state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: 'local-k1', text: 'oi' })
  assert.deepEqual([state.pending, state.entries.map((entry) => [entry.id, entry.delivery, entry.message.role])], [true, [['local-k1', 'pending', 'user']]])
  state = transcriptReducer(state, { type: 'failLocalUser', id: 'local-k1' })
  assert.deepEqual([state.pending, state.entries.map((entry) => entry.delivery)], [false, ['failed']])
  state = transcriptReducer(state, { type: 'localUser', id: 'local-k1', text: 'oi' })
  assert.deepEqual([state.pending, state.entries.map((entry) => [entry.id, entry.delivery])], [true, [['local-k1', 'pending']]])
  state = transcriptReducer(state, { type: 'dropLocalUser', id: 'local-k1' })
  assert.deepEqual(state.entries, [])
})

test('dropLocalUser never removes a confirmed message', () => {
  let state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: 'local-k1', text: 'oi' })
  state = merge(state, [signal('sig-1', 'oi')])
  state = transcriptReducer(state, { type: 'dropLocalUser', id: 'local-k1' })
  assert.deepEqual(state.entries.map((entry) => [entry.id, entry.delivery]), [['local-k1', undefined]])
})

test('reset empties the transcript under the new conversation', () => {
  const state = transcriptReducer(hydrate([dbMessage('m1', 'user', [text('a')])]), { type: 'reset', conversationId: 'c2' })
  assert.deepEqual(state, { conversationId: 'c2', entries: [], pending: false, tasks: [] })
})

test('the recorded ask, answer and finish events reduce to one user bubble, a closed prompt, a finished ask_user part and the final text', () => {
  const recorded = JSON.parse(readFileSync(new URL('./fixtures-builder-ask-events.json', import.meta.url), 'utf8'))
  let state = emptyTranscript('c1')
  const seenPrompts = []
  for (const recordedEvent of recorded) {
    state = event(state, recordedEvent)
    if (state.entries.some((entry) => entry.kind === 'prompt')) seenPrompts.push(recordedEvent.type)
  }
  assert.deepEqual(seenPrompts, ['tool_suspended', 'agent_end', 'agent_start', 'message_start'])

  assert.equal(state.pending, false)
  assert.deepEqual(state.entries.map((entry) => [entry.kind, entry.id, entry.message.role, entry.streaming, partsOf(entry).length]), [
    ['message', '1575ce24-a216-4f7e-b465-d5e9e818b985', 'user', false, 1],
    ['message', 'afc81af1-6d6b-43b0-a33e-4a5888eb56ee', 'assistant', true, 2],
    ['message', '1a438050-251c-498f-8d2b-afada3141e40', 'assistant', false, 0],
    ['message', '19cf21a9-73a9-49e7-9038-5b5825d5957d', 'assistant', false, 1],
  ])
  assert.deepEqual(partsOf(state.entries[0]), [text('oi')])
  const [intro, ask] = partsOf(state.entries[1])
  assert.deepEqual(intro, text('Perguntas:'))
  assert.deepEqual(ask, {
    type: 'tool-invocation',
    toolInvocation: {
      state: 'result', toolCallId: 'q1', toolName: 'ask_user',
      args: { questions: [{ question: 'Qual cor?', options: [{ label: 'azul' }] }] },
      result: { content: 'User answered:\nQual cor?: azul', isError: false },
    },
  })
  assert.deepEqual(partsOf(state.entries[3]), [text('ok')])
})

test('a failed observation stays marked until an observation succeeds, and a reflection end does not clear it', () => {
  const failed = runtimeReducer(emptyRuntime, { type: 'om_observation_failed', cycleId: 'c1', error: 'auth_unavailable', durationMs: 5 })
  assert.equal(failed.memoryFailed, 'observation')
  const reflected = runtimeReducer(failed, { type: 'om_reflection_end', cycleId: 'c2', durationMs: 1, compressedTokens: 10 })
  assert.equal(reflected.memoryFailed, 'observation')
  const observed = runtimeReducer(reflected, { type: 'om_observation_end', cycleId: 'c3', durationMs: 9, tokensObserved: 31000, observationTokens: 900 })
  assert.equal(observed.memoryFailed, null)
})

test('a failed reflection and a failed background buffer are marked by their operation', () => {
  assert.equal(runtimeReducer(emptyRuntime, { type: 'om_reflection_failed', cycleId: 'c1', error: 'boom', durationMs: 5 }).memoryFailed, 'reflection')
  const buffering = runtimeReducer(emptyRuntime, { type: 'om_buffering_failed', cycleId: 'c2', operationType: 'observation', error: 'boom' })
  assert.equal(buffering.memoryFailed, 'observation')
  assert.equal(runtimeReducer(buffering, { type: 'om_buffering_end', cycleId: 'c3', operationType: 'reflection', tokensBuffered: 1, bufferedTokens: 1 }).memoryFailed, 'observation')
  assert.equal(runtimeReducer(buffering, { type: 'om_buffering_end', cycleId: 'c3', operationType: 'observation', tokensBuffered: 100, bufferedTokens: 100 }).memoryFailed, null)
})

test('display_state with omProgress sets the memory gauge and one without it leaves memory alone', () => {
  const omProgress = { status: 'idle', pendingTokens: 100, threshold: 30000, observationTokens: 900, reflectionThreshold: 40000 }
  const display = (extra) => ({ type: 'display_state_changed', displayState: { activeTools: {}, tasks: [], pendingApproval: null, pendingSuspensions: {}, ...extra } })
  const set = runtimeReducer(emptyRuntime, display({ omProgress, bufferingObservations: true }))
  assert.deepEqual(set.memory, { progress: omProgress, bufferingMessages: false, bufferingObservations: true })
  assert.equal(runtimeReducer(set, display({})), set)
})

test('a window copy carries the step boundaries storage adds, and still completes the streamed turn part for part', () => {
  let state = start(emptyTranscript('c1'), dbMessage('turn-1', 'assistant', [text('Vou criar.')]))
  state = event(state, { type: 'message_update', id: 'turn-1', event: { type: 'part', index: 1, part: toolPart('c1', 'call') } })
  state = event(state, { type: 'message_update', id: 'turn-1', event: { type: 'part', index: 2, part: text('Pron') } })
  const stored = dbMessage('turn-1', 'assistant', [text('Vou criar.'), toolPart('c1', 'result', { result: 'ok' }), { type: 'step-start' }, text('Pronto.')])
  state = merge(state, [stored])
  assert.deepEqual(ids(state), ['turn-1'])
  assert.deepEqual(partsOf(state.entries[0]), [text('Vou criar.'), toolPart('c1', 'result', { result: 'ok' }), text('Pronto.')])
})

test('a part delta that skips parts the tab never saw leaves no hole, so the next delta does not crash the page', () => {
  let state = start(hydrate([]), dbMessage('assistant-1', 'assistant', [text('Hello')]))
  state = event(state, { type: 'message_update', id: 'assistant-1', event: { type: 'part', index: 3, part: toolPart('tool-9', 'call') } })
  state = event(state, { type: 'message_update', id: 'assistant-1', event: { type: 'text-delta', delta: ' world' } })
  assert.deepEqual(partsOf(state.entries[0]), [text('Hello world')])
  state = merge(state, [dbMessage('assistant-1', 'assistant', [text('Hello world'), toolPart('tool-9', 'result', { result: 'ok' })])])
  assert.deepEqual(partsOf(state.entries[0]).map((part) => part.type), ['text', 'tool-invocation'])
})

test('a send whose response was lost is unknown, not failed, and a refusal after it settles as failed', () => {
  let state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: 'local-k1', text: 'oi' })
  state = transcriptReducer(state, { type: 'unknownLocalUser', id: 'local-k1' })
  assert.deepEqual([state.pending, state.entries.map((entry) => entry.delivery)], [false, ['unknown']])
  state = transcriptReducer(state, { type: 'failLocalUser', id: 'local-k1' })
  assert.deepEqual(state.entries.map((entry) => entry.delivery), ['failed'])
  state = transcriptReducer(state, { type: 'localUser', id: 'local-k1', text: 'oi' })
  assert.deepEqual(state.entries.map((entry) => entry.delivery), ['pending'])
})

test('an unknown local message is confirmed when the thread shows it back', () => {
  let state = transcriptReducer(emptyTranscript('c1'), { type: 'localUser', id: 'local-k1', text: 'hello' })
  state = transcriptReducer(state, { type: 'unknownLocalUser', id: 'local-k1' })
  state = merge(state, [dbMessage('stored-1', 'user', [text('hello')])])
  assert.deepEqual(state.entries.map((entry) => [entry.id, entry.delivery]), [['local-k1', undefined]])
})

test('the previous run\'s tasks are gone the moment the person sends the next message', () => {
  const tasks = [{ content: 'Montar a tela', status: 'completed', activeForm: 'Montando a tela' }]
  let state = event(emptyTranscript('c1'), { type: 'display_state_changed', displayState: { activeTools: {}, tasks, pendingApproval: null, pendingSuspensions: {} } })
  assert.deepEqual(state.tasks, tasks)
  state = transcriptReducer(state, { type: 'localUser', id: 'local-k2', text: 'agora outra coisa' })
  assert.deepEqual(state.tasks, [])
  state = event(state, { type: 'agent_end', reason: 'error' })
  assert.deepEqual(state.tasks, [], 'a run that fails before any task state leaves no tasks behind')
})
