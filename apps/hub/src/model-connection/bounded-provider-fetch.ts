const requestUrl = (input: string | URL | Request): URL => new URL(input instanceof Request ? input.url : String(input))

export const createBoundedProviderFetch = ({
  officialOrigin,
  maxResponseBytes,
  fetchImpl = globalThis.fetch,
}: Readonly<{
  officialOrigin: string
  maxResponseBytes: number
  fetchImpl?: typeof globalThis.fetch
}>): typeof globalThis.fetch => {
  const origin = new URL(officialOrigin)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error('PROJECT_MODEL_ORIGIN_INVALID')
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) throw new Error('PROJECT_MODEL_RESPONSE_LIMIT_INVALID')
  return async (input, init = {}) => {
    const url = requestUrl(input)
    if (url.origin !== origin.origin || url.username || url.password) throw new Error('PROJECT_MODEL_EGRESS_DENIED')
    const response = await fetchImpl(input, { ...init, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      throw new Error('PROJECT_MODEL_REDIRECT_DENIED')
    }
    if (response.url && new URL(response.url).origin !== origin.origin) throw new Error('PROJECT_MODEL_EGRESS_DENIED')
    const declared = response.headers.get('content-length')
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxResponseBytes)) {
      await response.body?.cancel()
      throw new Error('PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED')
    }
    if (!response.body) return response
    const reader = response.body.getReader()
    let accepted = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const item = await reader.read()
        if (item.done) return controller.close()
        if (!(item.value instanceof Uint8Array) || item.value.byteLength > maxResponseBytes - accepted) {
          await reader.cancel()
          return controller.error(new Error('PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED'))
        }
        accepted += item.value.byteLength
        controller.enqueue(item.value)
      },
      cancel: (reason) => reader.cancel(reason),
    })
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}
