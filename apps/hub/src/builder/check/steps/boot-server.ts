import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { extname, join, sep } from 'node:path'
import { admitManifest } from '../../../app-runner/public.js'
import type { ServerManifest, ValueSchema } from '../../../app-runner/public.js'
import { previewContentSecurityPolicy } from '../../../hosting/public.js'
import { classifyAppPath } from '../../../hosting/public.js'

// The boot page is served with the Preview's own policy, so a violation there is a violation in the
// Preview. The frame-ancestors origin only has to be well formed: the page is the top level document.
const BOOT_CSP = previewContentSecurityPolicy('http://127.0.0.1')

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
}

// The app may call its own API while it mounts. The check has no database, so each declared
// operation answers the value its output schema names first.
const stubValue = (schema: ValueSchema | undefined): unknown => {
  switch (schema?.type) {
    case 'string': return 'x'.repeat(schema.minLength ?? 0)
    case 'integer': case 'number': return schema.minimum ?? 0
    case 'boolean': return false
    case 'array': return []
    case 'object': return Object.fromEntries((schema.required ?? []).map((key) => [key, stubValue(schema.properties[key])]))
    default: return null
  }
}

const declaredOperations = (out: string): ServerManifest['operations'] => {
  try {
    const admitted = admitManifest(JSON.parse(readFileSync(join(out, 'conexus-server', 'manifest.json'), 'utf8')), 'server')
    return admitted.ok ? admitted.result.operations : {}
  } catch {
    return {}
  }
}

/** The build output as the Preview serves it, plus a stub answer for each declared operation. */
export const serveOutput = (out: string): Server => {
  const operations = declaredOperations(out)
  const outReal = realpathSync(out)
  const isFile = (path: string): boolean => {
    try {
      const resolved = realpathSync(join(outReal, path))
      return resolved.startsWith(outReal + sep) && lstatSync(resolved).isFile()
    } catch { return false }
  }
  return createServer((request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const headers = { 'content-security-policy': BOOT_CSP, 'cache-control': 'no-store' }
      if (url.pathname.startsWith('/__conexus/api/')) {
        const operation = Object.hasOwn(operations, url.pathname.slice('/__conexus/api/'.length)) ? operations[url.pathname.slice('/__conexus/api/'.length)] : undefined
        if (request.method !== 'POST' || !operation) { response.writeHead(404, { ...headers, 'content-type': 'application/json' }); response.end('{"error":{"code":"OPERATION_NOT_FOUND"}}'); return }
        response.writeHead(200, { ...headers, 'content-type': 'application/json' })
        response.end(JSON.stringify(stubValue(operation.output)))
        return
      }
      const served = classifyAppPath(request.method ?? 'GET', url.pathname, isFile)
      if (served.kind === 'not-found') { response.writeHead(404, headers); response.end(); return }
      const resolved = realpathSync(join(outReal, served.kind === 'file' ? served.path : 'index.html'))
      if (!resolved.startsWith(outReal + sep) || !lstatSync(resolved).isFile()) { response.writeHead(404, headers); response.end(); return }
      response.writeHead(200, { ...headers, 'content-type': MEDIA_TYPES[extname(resolved)] ?? 'application/octet-stream' })
      response.end(request.method === 'HEAD' ? undefined : readFileSync(resolved))
    } catch {
      response.writeHead(404)
      response.end()
    }
  })
}
