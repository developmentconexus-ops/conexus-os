import type { FastifyReply, FastifyRequest } from 'fastify'

/** The two hosts' shared HTTP facts: the operation name and body limit of `/__conexus/api/:operation`, and how a page or a left caller is told. */
export const OPERATION = /^[a-z][A-Za-z0-9]{0,63}$/
export const API_BODY_LIMIT = 64 * 1024

export const isJsonBody = (request: FastifyRequest): boolean =>
  request.headers['content-type']?.split(';', 1)[0]?.trim() === 'application/json'

// Fastify's `request.signal` aborts as soon as the body is read. Node's `request.raw.signal` behaves
// like this helper, but @types/node 24.13.3 does not declare it.
export const callerLeft = (reply: FastifyReply): AbortSignal => {
  if (reply.raw.destroyed) return AbortSignal.abort()
  const left = new AbortController()
  reply.raw.once('close', () => { if (!reply.raw.writableEnded) left.abort() })
  return left.signal
}

export const page = (title: string, text: string): string =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`

export const sendPage = (reply: FastifyReply, status: number, body: string): FastifyReply =>
  reply.code(status).type('text/html; charset=utf-8').send(body)
