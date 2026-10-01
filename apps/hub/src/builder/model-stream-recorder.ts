import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LanguageModelMiddleware } from 'ai'

type WrapStream = NonNullable<LanguageModelMiddleware['wrapStream']>
type CallOptions = Parameters<WrapStream>[0]['params']
type StreamResult = Awaited<ReturnType<WrapStream>>
type StreamPart = StreamResult['stream'] extends ReadableStream<infer P> ? P : never

/** How much of each text, reasoning or tool-input stream a record keeps from its start and its end. */
const EDGE_CHARS = 2048
/** A totals line is written this often while a call streams, so a killed process still leaves totals. */
const TOTALS_EVERY_MS = 10_000
const FLUSH_EVERY_LINES = 500

type TypeTotal = { count: number; bytes: number }
type DeltaStream = { id: string; kind: 'text' | 'reasoning' | 'tool-input'; tool?: string; bytes: number; head: string; tail: string }
type Named = Readonly<{ tool?: string; callId?: string }>

const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8')

const sizeOf = (value: unknown): number => {
  if (typeof value === 'string') return byteLength(value)
  try {
    return byteLength(JSON.stringify(value) ?? '')
  } catch {
    return 0
  }
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined

const text = (value: unknown): string | undefined => typeof value === 'string' && value !== '' ? value : undefined

/** The tool an OpenAI Responses SSE event names: a function call by name, a hosted call by its item type. */
const namedByRawEvent = (event: Record<string, unknown> | undefined): Named => {
  const item = record(event?.item)
  const itemType = text(item?.type)
  const tool = text(item?.name) ?? (itemType?.endsWith('_call') ? itemType : undefined)
  const callId = text(item?.call_id) ?? (tool ? text(item?.id) : undefined) ?? text(event?.item_id)
  return { ...tool ? { tool } : {}, ...callId ? { callId } : {} }
}

const deltaKind = (type: string): DeltaStream['kind'] | undefined =>
  type === 'text-delta' ? 'text' : type === 'reasoning-delta' ? 'reasoning' : type === 'tool-input-delta' ? 'tool-input' : undefined

const toolNames = (tools: CallOptions['tools']): string[] =>
  (tools ?? []).map((tool) => tool.type === 'provider' ? `${tool.name} (${tool.id})` : tool.name)

const safeSegment = (value: string): string => value.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80)

/**
 * One model call's record: a JSONL file with a `call` line, a `chunk` line per raw SSE event and
 * per stream part, and a `totals` line every ten seconds and at the end. It holds sizes, types,
 * tool names and the edges of each delta stream; never request headers, credentials or the prompt.
 */
const openCallRecord = (directory: string, model: Readonly<{ provider: string; modelId: string }>, params: CallOptions, now: () => number) => {
  const startedAt = now()
  const path = join(directory, `${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}-${safeSegment(model.modelId)}-${randomBytes(4).toString('hex')}.jsonl`)
  const byType = new Map<string, TypeTotal>()
  const streams = new Map<string, DeltaStream>()
  const toolById = new Map<string, string>()
  let pending: string[] = []
  let lastTotalsAt = startedAt
  let broken = false

  const flush = () => {
    if (broken || pending.length === 0) return
    try {
      appendFileSync(path, pending.join(''))
    } catch (error) {
      broken = true
      console.warn(`builder stream recorder stopped: ${(error as Error).message}`)
    }
    pending = []
  }
  const write = (line: Record<string, unknown>) => {
    pending.push(`${JSON.stringify(line)}\n`)
    if (pending.length >= FLUSH_EVERY_LINES) flush()
  }
  const totals = (end?: Readonly<{ end: 'finish' | 'error' | 'cancel'; error?: string }>) => {
    write({
      kind: 'totals',
      ms: now() - startedAt,
      ...end ?? {},
      byType: Object.fromEntries(byType),
      streams: [...streams.values()],
    })
    flush()
  }
  const count = (key: string, bytes: number) => {
    const total = byType.get(key) ?? { count: 0, bytes: 0 }
    total.count += 1
    total.bytes += bytes
    byType.set(key, total)
  }
  const chunk = (source: 'raw' | 'part', type: string, bytes: number, named: Named) => {
    count(`${source}:${type}`, bytes)
    write({ kind: 'chunk', ms: now() - startedAt, source, type, bytes, ...named })
    if (now() - lastTotalsAt >= TOTALS_EVERY_MS) {
      lastTotalsAt = now()
      totals()
    }
  }

  const prompt = params.prompt.map(sizeOf)
  write({
    kind: 'call',
    startedAt: new Date(startedAt).toISOString(),
    provider: model.provider,
    modelId: model.modelId,
    promptMessages: prompt.length,
    promptBytes: prompt.reduce((sum, size) => sum + size, 0),
    largestMessageBytes: Math.max(0, ...prompt),
    tools: toolNames(params.tools),
  })
  flush()

  return Object.freeze({
    raw: (rawValue: unknown) => {
      const event = record(rawValue)
      chunk('raw', text(event?.type) ?? `(${typeof rawValue})`, sizeOf(rawValue), namedByRawEvent(event))
    },
    part: (part: StreamPart) => {
      const fields = part as Record<string, unknown>
      const id = text(fields.id) ?? text(fields.toolCallId)
      const toolName = text(fields.toolName)
      if (id && toolName) toolById.set(id, toolName)
      const tool = id ? toolById.get(id) : undefined
      const delta = typeof fields.delta === 'string' ? fields.delta : undefined
      chunk('part', part.type, delta === undefined ? sizeOf(part) : byteLength(delta), { ...tool ? { tool } : {}, ...id && (tool || delta !== undefined) ? { callId: id } : {} })
      const kind = deltaKind(part.type)
      if (!kind || !id || delta === undefined) return
      const stream = streams.get(`${kind}:${id}`) ?? { id, kind, ...tool ? { tool } : {}, bytes: 0, head: '', tail: '' }
      stream.bytes += byteLength(delta)
      if (stream.head.length < EDGE_CHARS) stream.head += delta.slice(0, EDGE_CHARS - stream.head.length)
      stream.tail = (stream.tail + delta).slice(-EDGE_CHARS)
      streams.set(`${kind}:${id}`, stream)
    },
    end: (end: 'finish' | 'error' | 'cancel', error?: unknown) => totals({ end, ...error === undefined ? {} : { error: String((error as Error)?.message ?? error).slice(0, 500) } }),
  })
}

/**
 * A diagnostic middleware that records every model call's stream into `directory`, one JSONL file
 * per call. It asks the provider for its raw chunks (the AI SDK's `includeRawChunks`), records them
 * and the parsed stream parts, and passes on only what the caller asked for, so the call behaves as
 * it would without the recorder.
 */
export const createModelStreamRecorder = (directory: string, now: () => number = Date.now): LanguageModelMiddleware => {
  mkdirSync(directory, { recursive: true })
  return {
    specificationVersion: 'v3',
    wrapStream: async ({ model, params }) => {
      const callRecord = openCallRecord(directory, model, params, now)
      const result = await model.doStream({ ...params, includeRawChunks: true })
      const reader = result.stream.getReader()
      const stream = new ReadableStream<StreamPart>({
        // Loops until it forwards a part: a pull that enqueues nothing is not called again.
        async pull(controller) {
          for (;;) {
            let next: ReadableStreamReadResult<StreamPart>
            try {
              next = await reader.read()
            } catch (error) {
              callRecord.end('error', error)
              controller.error(error)
              return
            }
            if (next.done) {
              callRecord.end('finish')
              controller.close()
              return
            }
            const part = next.value
            if (part.type !== 'raw') {
              callRecord.part(part)
              controller.enqueue(part)
              return
            }
            callRecord.raw(part.rawValue)
            if (params.includeRawChunks) {
              controller.enqueue(part)
              return
            }
          }
        },
        async cancel(reason) {
          callRecord.end('cancel', reason)
          await reader.cancel(reason)
        },
      })
      return { ...result, stream }
    },
  }
}
