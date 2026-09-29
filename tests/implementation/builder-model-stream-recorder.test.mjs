import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { openaiCodexModel } = await import(hubModuleUrl('builder/openai-codex/model.js'))

const ACCESS_TOKEN = 'access-token-never-recorded'
const bearer = async () => ({ accessToken: ACCESS_TOKEN, accountId: 'chatgpt-account-1' })
const planHead = `# Plano\n${'a'.repeat(3000)}`
const planTail = `${'z'.repeat(3000)}\nFIM`

// The Codex endpoint, scripted: a reasoning summary, then one function call whose arguments stream in pieces.
const scriptedEvents = () => {
  const argumentPieces = [planHead, ...Array.from({ length: 5 }, () => 'm'.repeat(1000)), planTail]
  return [
    { type: 'response.created', sequence_number: 0, response: { id: 'resp_1', created_at: 1, model: 'gpt-6-luna', service_tier: null } },
    { type: 'response.output_item.added', sequence_number: 1, output_index: 0, item: { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: null } },
    { type: 'response.reasoning_summary_part.added', sequence_number: 2, item_id: 'rs_1', summary_index: 0, part: { type: 'summary_text', text: '' } },
    { type: 'response.reasoning_summary_text.delta', sequence_number: 3, item_id: 'rs_1', summary_index: 0, delta: 'Vou escrever o plano.' },
    { type: 'response.output_item.done', sequence_number: 4, output_index: 0, item: { type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: 'Vou escrever o plano.' }], encrypted_content: null } },
    { type: 'response.output_item.added', sequence_number: 5, output_index: 1, item: { type: 'function_call', id: 'fc_1', call_id: 'call_plan', name: 'mastra_workspace_write_file', arguments: '', status: 'in_progress' } },
    ...argumentPieces.map((delta, index) => ({ type: 'response.function_call_arguments.delta', sequence_number: 6 + index, item_id: 'fc_1', output_index: 1, delta })),
    { type: 'response.output_item.done', sequence_number: 13, output_index: 1, item: { type: 'function_call', id: 'fc_1', call_id: 'call_plan', name: 'mastra_workspace_write_file', arguments: argumentPieces.join(''), status: 'completed' } },
    { type: 'response.completed', sequence_number: 14, response: { id: 'resp_1', created_at: 1, model: 'gpt-6-luna', service_tier: null, incomplete_details: null, usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 } } } },
  ]
}

const serveScriptedStream = (t) => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(scriptedEvents().map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
  t.after(() => { globalThis.fetch = original })
}

const recordDirectory = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'builder-stream-record-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

const callOptions = (includeRawChunks) => ({
  prompt: [{ role: 'user', content: [{ type: 'text', text: 'Escreva o plano.' }] }],
  tools: [{ type: 'function', name: 'mastra_workspace_write_file', inputSchema: { type: 'object', properties: {} } }],
  ...includeRawChunks === undefined ? {} : { includeRawChunks },
})

const drain = async (model, options) => {
  const { stream } = await model.doStream(options)
  const parts = []
  for await (const part of stream) parts.push(part)
  return parts
}

test('a recorded Codex call leaves one JSONL file with the type totals, the tool name and the edges of its arguments', async (t) => {
  serveScriptedStream(t)
  const directory = recordDirectory(t)

  const parts = await drain(openaiCodexModel('gpt-6-luna', bearer, directory), callOptions())

  assert.equal(parts.filter((part) => part.type === 'raw').length, 0, 'the caller asked for no raw chunks and gets none')
  assert.equal(parts.find((part) => part.type === 'tool-call')?.toolName, 'mastra_workspace_write_file')
  const files = readdirSync(directory)
  assert.equal(files.length, 1)
  const content = readFileSync(join(directory, files[0]), 'utf8')
  assert.equal(content.includes(ACCESS_TOKEN), false, 'no credential reaches the record')
  const lines = content.trim().split('\n').map((line) => JSON.parse(line))

  const call = lines[0]
  assert.deepEqual({ kind: call.kind, provider: call.provider, modelId: call.modelId, promptMessages: call.promptMessages, tools: call.tools },
    { kind: 'call', provider: 'openai.responses', modelId: 'gpt-6-luna', promptMessages: 1, tools: ['mastra_workspace_write_file'] })

  const toolStart = lines.find((line) => line.kind === 'chunk' && line.source === 'raw' && line.type === 'response.output_item.added' && line.tool)
  assert.deepEqual({ tool: toolStart.tool, callId: toolStart.callId }, { tool: 'mastra_workspace_write_file', callId: 'call_plan' })
  const argumentDelta = lines.find((line) => line.kind === 'chunk' && line.source === 'raw' && line.type === 'response.function_call_arguments.delta')
  assert.equal(argumentDelta.callId, 'fc_1')

  const totals = lines.at(-1)
  assert.equal(totals.kind, 'totals')
  assert.equal(totals.end, 'finish')
  assert.equal(totals.byType['raw:response.function_call_arguments.delta'].count, 7)
  assert.equal(totals.byType['raw:response.output_item.added'].count, 2)
  assert.equal(totals.byType['raw:response.completed'].count, 1)
  assert.equal(totals.byType['part:tool-input-delta'].count, 7)
  assert.equal(totals.byType['part:tool-input-delta'].bytes, planHead.length + 5000 + planTail.length)

  const argumentsStream = totals.streams.find((stream) => stream.kind === 'tool-input')
  assert.deepEqual({ tool: argumentsStream.tool, bytes: argumentsStream.bytes, head: argumentsStream.head, tail: argumentsStream.tail }, {
    tool: 'mastra_workspace_write_file',
    bytes: planHead.length + 5000 + planTail.length,
    head: planHead.slice(0, 2048),
    tail: planTail.slice(-2048),
  })
  const reasoning = totals.streams.find((stream) => stream.kind === 'reasoning')
  assert.deepEqual({ head: reasoning.head, tail: reasoning.tail }, { head: 'Vou escrever o plano.', tail: 'Vou escrever o plano.' })
})

test('a caller that asks for raw chunks still gets them while the call is recorded', async (t) => {
  serveScriptedStream(t)
  const directory = recordDirectory(t)

  const parts = await drain(openaiCodexModel('gpt-6-luna', bearer, directory), callOptions(true))

  assert.equal(parts.filter((part) => part.type === 'raw').length, scriptedEvents().length)
  assert.equal(readdirSync(directory).length, 1)
})

test('without a record directory the Codex call streams the same parts and writes no file', async (t) => {
  serveScriptedStream(t)
  const directory = recordDirectory(t)
  const recorded = await drain(openaiCodexModel('gpt-6-luna', bearer, directory), callOptions())
  const recordedFiles = readdirSync(directory).length

  const plain = await drain(openaiCodexModel('gpt-6-luna', bearer), callOptions())

  assert.equal(recordedFiles, 1)
  assert.deepEqual(plain.map((part) => part.type), recorded.map((part) => part.type))
  assert.equal(readdirSync(directory).length, 1, 'the unrecorded call adds nothing')
})

test('a call stopped mid-stream, as the runaway was, still ends its record with totals', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const encoder = new TextEncoder()
  const [created, reasoningAdded, , , , toolAdded] = scriptedEvents()
  globalThis.fetch = async () => {
    let sent = 0
    return new Response(new ReadableStream({
      pull(controller) {
        const event = sent === 0 ? created : sent === 1 ? reasoningAdded : sent === 2 ? toolAdded
          : { type: 'response.function_call_arguments.delta', sequence_number: sent, item_id: 'fc_1', output_index: 1, delta: 'x'.repeat(100) }
        sent += 1
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const directory = recordDirectory(t)

  const { stream } = await openaiCodexModel('gpt-6-luna', bearer, directory).doStream(callOptions())
  const reader = stream.getReader()
  let deltas = 0
  while (deltas < 20) if ((await reader.read()).value?.type === 'tool-input-delta') deltas += 1
  await reader.cancel('stopped by the operator')

  const lines = readFileSync(join(directory, readdirSync(directory)[0]), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const totals = lines.at(-1)
  assert.deepEqual({ kind: totals.kind, end: totals.end, error: totals.error }, { kind: 'totals', end: 'cancel', error: 'stopped by the operator' })
  assert.equal(totals.streams.find((stream) => stream.kind === 'tool-input').tool, 'mastra_workspace_write_file')
  assert.equal(totals.byType['part:tool-input-delta'].count, 20)
})
