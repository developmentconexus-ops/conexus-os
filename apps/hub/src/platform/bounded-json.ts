import { TextDecoder } from 'node:util'

const maximumJsonDepth = 16
const maximumJsonNodes = 4_096
const utf8 = new TextDecoder('utf-8', { fatal: true })

const isJsonMediaType = (header: string | null): boolean => {
  if (!header) return false
  const [mediaType, ...parameters] = header.split(';').map((part) => part.trim().toLowerCase())
  return mediaType === 'application/json' && parameters.every((parameter) => parameter === 'charset=utf-8')
}

const assertBoundedJsonTree = (root: unknown): void => {
  const pending: Array<Readonly<{ value: unknown; depth: number }>> = [{ value: root, depth: 1 }]
  let nodes = 0
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) break
    nodes += 1
    if (nodes > maximumJsonNodes || current.depth > maximumJsonDepth) throw new Error('BOUNDED_JSON_SHAPE_REFUSED')
    if (Array.isArray(current.value)) {
      for (const value of current.value) pending.push({ value, depth: current.depth + 1 })
    } else if (current.value && typeof current.value === 'object') {
      for (const value of Object.values(current.value)) pending.push({ value, depth: current.depth + 1 })
    }
  }
}

export const readBoundedJson = async (response: Response, maximumBytes: number): Promise<unknown> => {
  if (!isJsonMediaType(response.headers.get('content-type'))) throw new Error('BOUNDED_JSON_SHAPE_REFUSED')
  const declaredLength = response.headers.get('content-length')
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) {
    throw new Error('BOUNDED_JSON_BOUNDS_REFUSED')
  }
  if (!response.body) throw new Error('BOUNDED_JSON_SHAPE_REFUSED')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumBytes) throw new Error('BOUNDED_JSON_BOUNDS_REFUSED')
      chunks.push(value)
    }
  } finally {
    if (length > maximumBytes) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }

  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length)
  try {
    const value: unknown = JSON.parse(utf8.decode(bytes))
    assertBoundedJsonTree(value)
    return value
  } catch (error) {
    if (error instanceof Error && ['BOUNDED_JSON_BOUNDS_REFUSED', 'BOUNDED_JSON_SHAPE_REFUSED'].includes(error.message)) {
      throw error
    }
    throw new Error('BOUNDED_JSON_SHAPE_REFUSED')
  } finally {
    bytes.fill(0)
    for (const chunk of chunks) chunk.fill(0)
  }
}
