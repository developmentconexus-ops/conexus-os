// Refusals cross the shared contract reader, and a 401 drops what the page learned while signed in.

import { clearAuthorityCache, clearProjectCache, refreshProjectCache } from './query-client'
import { readFailure, ReceivedFailure, type AnyOperation, type BinaryOperation, type Input, type JsonOperation, type Reply } from '@conexus/contract'

const urlOf = (op: AnyOperation, input: Input<AnyOperation>): string => {
  const params = input.params
  const path = op.path.replace(/:(\w+)/g, (_match, name: string) => {
    const value = typeof params === 'object' && params !== null ? Object.entries(params).find(([key]) => key === name)?.[1] : undefined
    if (value === undefined) throw new ReceivedFailure('HUB_RESPONSE_UNREADABLE', null)
    return encodeURIComponent(String(value))
  })
  const query = new URLSearchParams()
  if (typeof input.query === 'object' && input.query !== null) {
    for (const [name, value] of Object.entries(input.query)) {
      if (value !== undefined && value !== null) query.set(name, String(value))
    }
  }
  return query.size === 0 ? path : `${path}?${query}`
}

export function call<O extends JsonOperation>(op: O, input: Input<NoInfer<O>>, options?: { signal?: AbortSignal }): Promise<Reply<O>>
export async function call(op: JsonOperation, input: Input<AnyOperation>, options: { signal?: AbortSignal } = {}): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (typeof input.headers === 'object' && input.headers !== null) {
    for (const [name, value] of Object.entries(input.headers)) {
      if (typeof value === 'string') headers[name] = value
    }
  }
  if (op.body !== null) headers['content-type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(urlOf(op, input), {
      method: op.method,
      credentials: 'same-origin',
      headers,
      ...(op.body === null ? {} : { body: JSON.stringify(input.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ReceivedFailure('HUB_UNREACHABLE', null)
  }
  if (!response.ok) {
    if (response.status === 401) clearAuthorityCache()
    const failure = await readFailure(response)
    if (typeof input.params === 'object' && input.params !== null && 'projectId' in input.params && typeof input.params.projectId === 'string') {
      if (failure.code === 'PROJECT_NOT_FOUND') {
        clearProjectCache(input.params.projectId)
        if (op.id !== 'getProject') refreshProjectCache(input.params.projectId)
      }
      if (failure.code === 'PROJECT_DELETING') refreshProjectCache(input.params.projectId)
    }
    throw failure
  }
  const success = Object.entries(op.success)
  const entry = success.find(([status]) => Number(status) === response.status)
  if (!entry) throw new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status)
  if (entry[1] === null) return undefined
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status)
  const raw: unknown = await response.json().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return null
  })
  const parsed = entry[1].safeParse(raw)
  if (!parsed.success) throw new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status)
  return success.length === 1 ? parsed.data : { status: response.status, body: parsed.data }
}

/** @public Frozen by spec 0015 section 3; first used by the parts that declare GET operations. */
export const query = <O extends JsonOperation>(op: O, input: Input<O>) => ({
  queryKey: [op.id, input] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => call(op, input, { signal }),
})

/** @public Frozen by spec 0015 section 3; first used by the parts that declare GET operations. */
export const href = <O extends BinaryOperation>(op: O, input: Input<O>): string => urlOf(op, input)

export const hubFetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> =>
  fetch(input, { ...init, credentials: 'same-origin' })
