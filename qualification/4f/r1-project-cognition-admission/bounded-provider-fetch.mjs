const refusal = () => new Error('PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED')

function normalizeOrigin(value) {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PROJECT_MODEL_ORIGIN_INVALID')
  }
  return url
}

function requestUrl(input) {
  if (input instanceof Request) return new URL(input.url)
  return new URL(String(input))
}

async function cancelQuietly(body, reason) {
  if (!body) return
  try {
    await body.cancel(reason)
  } catch {
    // The deciding failure is the stable Conexus refusal, not cancel transport noise.
  }
}

export function createBoundedProviderFetch({
  officialOrigin,
  maxResponseBytes,
  fetchImpl = globalThis.fetch,
  allowLoopbackHttpForQualification = false,
  observe = () => {},
}) {
  const origin = normalizeOrigin(officialOrigin)
  const loopbackQualification = allowLoopbackHttpForQualification &&
    origin.protocol === 'http:' &&
    (origin.hostname === '127.0.0.1' || origin.hostname === '::1')

  if (origin.protocol !== 'https:' && !loopbackQualification) {
    throw new Error('PROJECT_MODEL_HTTPS_ORIGIN_REQUIRED')
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new Error('PROJECT_MODEL_RESPONSE_LIMIT_INVALID')
  }
  if (typeof fetchImpl !== 'function') throw new Error('PROJECT_MODEL_FETCH_INVALID')
  if (typeof observe !== 'function') throw new Error('PROJECT_MODEL_OBSERVER_INVALID')

  return async function boundedProviderFetch(input, init = {}) {
    const url = requestUrl(input)
    if (url.origin !== origin.origin || url.username || url.password) {
      throw new Error('PROJECT_MODEL_EGRESS_DENIED')
    }

    const response = await fetchImpl(input, { ...init, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      await cancelQuietly(response.body, refusal())
      throw new Error('PROJECT_MODEL_REDIRECT_DENIED')
    }
    if (response.url && new URL(response.url).origin !== origin.origin) {
      await cancelQuietly(response.body, refusal())
      throw new Error('PROJECT_MODEL_EGRESS_DENIED')
    }

    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null) {
      const parsedLength = Number(declaredLength)
      if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maxResponseBytes) {
        observe({ type: 'declared-limit-refused', acceptedBytes: 0 })
        await cancelQuietly(response.body, refusal())
        throw refusal()
      }
    }
    if (!response.body) return response

    const reader = response.body.getReader()
    let acceptedBytes = 0
    const boundedBody = new ReadableStream({
      async pull(controller) {
        let item
        try {
          item = await reader.read()
        } catch {
          controller.error(new Error('PROJECT_MODEL_RESPONSE_READ_FAILED'))
          return
        }
        if (item.done) {
          controller.close()
          return
        }
        const chunk = item.value
        if (!(chunk instanceof Uint8Array)) {
          await reader.cancel(refusal())
          controller.error(new Error('PROJECT_MODEL_RESPONSE_CHUNK_INVALID'))
          return
        }
        if (chunk.byteLength > maxResponseBytes - acceptedBytes) {
          observe({ type: 'stream-limit-refused', acceptedBytes, refusedChunkBytes: chunk.byteLength })
          await reader.cancel(refusal())
          controller.error(refusal())
          return
        }
        acceptedBytes += chunk.byteLength
        observe({ type: 'chunk-accepted', acceptedBytes })
        controller.enqueue(chunk)
      },
      async cancel(reason) {
        await reader.cancel(reason)
      },
    })

    return new Response(boundedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}
