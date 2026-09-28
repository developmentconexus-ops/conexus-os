import { z } from 'zod'
import { BROKER_ERROR_CODES } from './errors.js'
import type { FetchDescription } from './broker.js'

export const CONNECTOR_FETCH_TOOL = 'connector_fetch'

/**
 * What the browser and the conversation history see of a `connector_fetch` call (P14). No value
 * crosses: the model builds its next request from values it read, so a value in either projection
 * would put vendor data in the browser.
 */
export type RequestProjection = Readonly<{ integrator: string | null; service: string | null; fields: readonly string[] }>
export type ResultProjection =
  | Readonly<{ ok: true; status: number; bytes: number; fields: readonly string[]; counts: Readonly<Record<string, number>> }>
  | Readonly<{ ok: false; code: typeof BROKER_ERROR_CODES[number]; status?: number; issues?: readonly string[] }>

/** A tool failure's text can quote the arguments, so it is replaced whole. */
export const FAILURE_PROJECTION = 'connector_fetch failed'

const PATH_LIMIT = 200
const DEPTH_LIMIT = 8
const KEY_LIMIT = 64

type Shape = { readonly fields: Set<string>; readonly counts: Map<string, number> }

// Key paths and array lengths, never a value; an array's items share one path with `[]`.
const walkShape = (value: unknown, path: string, depth: number, shape: Shape): void => {
  if (depth > DEPTH_LIMIT || shape.fields.size >= PATH_LIMIT) return
  if (Array.isArray(value)) {
    if (path) shape.counts.set(path, Math.max(shape.counts.get(path) ?? 0, value.length))
    for (const item of value) walkShape(item, `${path}[]`, depth + 1, shape)
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, item] of Object.entries(value)) {
    const child = path ? `${path}.${key.slice(0, KEY_LIMIT)}` : key.slice(0, KEY_LIMIT)
    if (shape.fields.size >= PATH_LIMIT) return
    shape.fields.add(child)
    walkShape(item, child, depth + 1, shape)
  }
}

const shapeOf = (value: unknown): Readonly<{ fields: readonly string[]; counts: Readonly<Record<string, number>> }> => {
  const shape: Shape = { fields: new Set(), counts: new Map() }
  walkShape(value, '', 0, shape)
  return { fields: Object.freeze([...shape.fields].sort()), counts: Object.freeze(Object.fromEntries([...shape.counts].sort(([a], [b]) => a.localeCompare(b)))) }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value)

export const projectRequest = (request: unknown, described: FetchDescription): RequestProjection => {
  const { query, body } = isRecord(request) ? request : {}
  return Object.freeze({ integrator: described.integrator, service: described.service, fields: shapeOf({ query, body }).fields })
}

const fetchResult = z.union([
  z.object({ ok: z.literal(true), status: z.number().int(), bytes: z.number().int().nonnegative(), body: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.enum(BROKER_ERROR_CODES), status: z.number().int().optional(), issues: z.array(z.string()).optional() }),
])

/** A value that is not a `FetchResult` can only be Mastra's refusal of the arguments before the tool ran. */
export const projectResult = (value: unknown): ResultProjection => {
  const parsed = fetchResult.safeParse(value)
  if (!parsed.success) return Object.freeze({ ok: false, code: 'INPUT_REFUSED' })
  const result = parsed.data
  if (result.ok) return Object.freeze({ ok: true, status: result.status, bytes: result.bytes, ...shapeOf(result.body) })
  return Object.freeze({
    ok: false,
    code: result.code,
    ...(result.status === undefined ? {} : { status: result.status }),
    ...(result.issues === undefined ? {} : { issues: result.issues }),
  })
}

const resultProjection = z.union([
  z.strictObject({ ok: z.literal(true), status: z.number().int(), bytes: z.number().int().nonnegative(), fields: z.array(z.string()), counts: z.record(z.string(), z.number().int()) }),
  z.strictObject({ ok: z.literal(false), code: z.enum(BROKER_ERROR_CODES), status: z.number().int().optional(), issues: z.array(z.string()).optional() }),
])

type Projector = Readonly<{
  request(value: unknown): unknown
  result(value: unknown): unknown
  /** The tool's own projection of one phase, when Mastra kept it in the part's metadata. */
  kept(metadata: unknown, phase: 'input-available' | 'output-available'): unknown
}>

/**
 * The projections again, for a payload a route serves. A projection the tool made passes unchanged;
 * anything else is projected, with no integrator or service a registered integrator does not name.
 */
const routeProjector = (integrators: ReadonlyMap<string, ReadonlySet<string>>): Projector => {
  const requestProjection = z.strictObject({
    integrator: z.string().nullable(),
    service: z.string().nullable(),
    fields: z.array(z.string()),
  }).refine(({ integrator, service }) => (integrator === null
    ? service === null
    : integrators.has(integrator) && (service === null || integrators.get(integrator)?.has(service) === true)))
  const schemas = { 'input-available': requestProjection, 'output-available': resultProjection }
  return Object.freeze({
    request: (value: unknown) => (requestProjection.safeParse(value).success ? value : projectRequest(value, { integrator: null, service: null })),
    result: (value: unknown) => {
      if (typeof value === 'string') return FAILURE_PROJECTION
      return resultProjection.safeParse(value).success ? value : projectResult(value)
    },
    kept: (metadata: unknown, phase: 'input-available' | 'output-available') => {
      const transforms = isRecord(metadata) && isRecord(metadata.mastra) && isRecord(metadata.mastra.toolPayloadTransform) ? metadata.mastra.toolPayloadTransform : {}
      for (const target of ['transcript', 'display']) {
        const phases = transforms[target]
        const state = isRecord(phases) ? phases[phase] : undefined
        if (isRecord(state) && schemas[phase].safeParse(state.transformed).success) return state.transformed
      }
      return undefined
    },
  })
}

const ownsToolCall = (node: Readonly<Record<string, unknown>>): boolean => node.toolName === CONNECTOR_FETCH_TOOL || node.name === CONNECTOR_FETCH_TOOL

// Every tool call id a served value names as `connector_fetch`: on the call itself, or as the key
// of a display-state entry (`activeTools`, `toolInputBuffers`).
const collectCalls = (value: unknown, calls: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectCalls(item, calls)
    return
  }
  if (!isRecord(value)) return
  if (ownsToolCall(value) && typeof value.toolCallId === 'string') calls.add(value.toolCallId)
  for (const [key, item] of Object.entries(value)) {
    if (isRecord(item) && ownsToolCall(item) && item.toolCallId === undefined) calls.add(key)
    collectCalls(item, calls)
  }
}

const withoutModelOutput = (metadata: unknown): unknown => {
  if (!isRecord(metadata) || !isRecord(metadata.mastra) || !('modelOutput' in metadata.mastra)) return metadata
  const { modelOutput: _modelOutput, ...mastra } = metadata.mastra
  return { ...metadata, mastra }
}

const rewrite = (value: unknown, calls: ReadonlySet<string>, project: Projector): unknown => {
  if (Array.isArray(value)) return value.map((item) => rewrite(item, calls, project))
  if (!isRecord(value)) return value
  const node: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) node[key] = rewrite(item, calls, project)
  const invocation = node.toolInvocation
  const part = isRecord(invocation) && invocation.toolName === CONNECTOR_FETCH_TOOL
  const owned = ownsToolCall(node) || (typeof node.toolCallId === 'string' && calls.has(node.toolCallId))
  if (part) {
    // Mastra can store or stream the raw payload beside the tool's own projection of it.
    const args = project.kept(node.providerMetadata, 'input-available')
    const result = 'result' in invocation ? project.kept(node.providerMetadata, 'output-available') : undefined
    node.toolInvocation = { ...invocation, ...(args === undefined ? {} : { args }), ...(result === undefined ? {} : { result }) }
  }
  if ((part || owned) && 'providerMetadata' in node) node.providerMetadata = withoutModelOutput(node.providerMetadata)
  if (!owned) return node
  if ('args' in node) node.args = project.request(node.args)
  if ('result' in node) node.result = project.result(node.result)
  if ('errorText' in node) node.errorText = FAILURE_PROJECTION
  if ('argsTextDelta' in node) node.argsTextDelta = ''
  if (typeof node.text === 'string') node.text = ''
  delete node.partialResult
  return node
}

export type ToolPayloadProjection = Readonly<{
  /** One served value, such as a thread's messages. */
  value(value: unknown): unknown
  /** A projector for one event stream: it remembers the calls earlier events named. */
  stream(): (event: unknown) => unknown
}>

/**
 * The route-level projection of every `connector_fetch` payload the browser is served: the
 * arguments, the result, an input delta or buffer, a failure's text, and Mastra's stored
 * `toModelOutput` copy. Mastra's own transforms already project these; this holds if they do not.
 */
export const createToolPayloadProjection = (integrators: ReadonlyMap<string, ReadonlySet<string>>): ToolPayloadProjection => {
  const project = routeProjector(integrators)
  return Object.freeze({
    value: (value: unknown) => {
      const calls = new Set<string>()
      collectCalls(value, calls)
      return rewrite(value, calls, project)
    },
    stream: () => {
      const calls = new Set<string>()
      return (event: unknown) => {
        collectCalls(event, calls)
        return rewrite(event, calls, project)
      }
    },
  })
}
