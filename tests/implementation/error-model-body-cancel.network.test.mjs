import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import ts from 'typescript'
import { z } from 'zod'
import { APP_FAILURE_CLIENT_SOURCE, readFailure } from '@conexus/contract'
import { generateClient } from '../../apps/hub/compiler-template/generate-client.mjs'

function moduleUrl(source) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
}

const cache = moduleUrl('export function clearAuthorityCache() {}\nexport function clearProjectCache() {}\nexport function refreshProjectCache() {}')
const web = await import(moduleUrl(readFileSync(new URL('../../apps/web/src/app/http.ts', import.meta.url), 'utf8')
  .replace("'./query-client'", JSON.stringify(cache))
  .replace("'@conexus/contract'", JSON.stringify(import.meta.resolve('@conexus/contract')))))
const failuresUrl = moduleUrl(APP_FAILURE_CLIENT_SOURCE.replace("'zod'", JSON.stringify(import.meta.resolve('zod'))))
const emitted = await import(failuresUrl)
const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }
const { apiGen } = generateClient({ operations: { listNotes: { input: schema, output: schema } } })
const app = await import(moduleUrl(apiGen.replace("'zod'", JSON.stringify(import.meta.resolve('zod'))).replace("'./failures.gen'", JSON.stringify(failuresUrl))))
const op = { id: 'listNotes', path: '/notes', method: 'GET', body: null, success: { 200: z.strictObject({ ok: z.boolean() }) } }
const nativeFetch = globalThis.fetch

for (const [name, reader] of [['contract', readFailure], ['emitted', emitted.readFailure]]) {
  test(`${name} reader rethrows the exact body AbortError and keeps malformed-body fallback`, async () => {
    const abort = new DOMException('Synthetic cancellation', 'AbortError')
    const response = new Response(new ReadableStream({ start(controller) { controller.error(abort) } }), { status: 500, headers: { 'content-type': 'application/problem+json' } })
    await assert.rejects(reader(response), (error) => error === abort)
    for (const raw of ['{', '', '{}']) {
      assert.equal((await reader(new Response(raw, { status: 500, headers: { 'content-type': 'application/problem+json' } }))).code, 'HUB_RESPONSE_UNREADABLE')
    }
    const broken = new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Synthetic body fault')) } }), { status: 500, headers: { 'content-type': 'application/problem+json' } })
    assert.equal((await reader(broken)).code, 'HUB_RESPONSE_UNREADABLE')
  })
}

test('web success keeps AbortError identity and malformed JSON stays unreadable', async (t) => {
  const abort = new DOMException('Synthetic cancellation', 'AbortError')
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start(controller) { controller.error(abort) } }), { headers: { 'content-type': 'application/json' } }))
  await assert.rejects(web.call(op, {}), (error) => error === abort)
  t.mock.method(globalThis, 'fetch', async () => new Response('{', { headers: { 'content-type': 'application/json' } }))
  await assert.rejects(web.call(op, {}), (error) => error.code === 'HUB_RESPONSE_UNREADABLE')
})

for (const consumer of ['contract', 'web', 'app']) {
  for (const status of consumer === 'contract' ? [500] : [200, 500]) {
    for (const timing of consumer === 'contract' ? ['after-headers'] : ['before-headers', 'after-headers']) {
      test(`${consumer} native fetch cancellation ${timing} at ${status} retains the actual reason`, async (t) => {
        const server = createServer((_request, response) => {
          response.writeHead(status, { 'content-type': status === 200 ? 'application/json' : 'application/problem+json' })
          response.flushHeaders()
          response.write('{"ok":')
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)) })
        const url = `http://127.0.0.1:${server.address().port}/notes`
        const controller = new AbortController()
        const reason = new DOMException('Synthetic native cancellation', 'AbortError')
        const arrived = Promise.withResolvers()
        t.mock.method(globalThis, 'fetch', async (_url, init) => {
          const response = await nativeFetch(url, { ...init, signal: controller.signal })
          arrived.resolve()
          return response
        })
        if (timing === 'before-headers') controller.abort(reason)
        const reading = consumer === 'contract'
          ? nativeFetch(url, { signal: controller.signal }).then((response) => { arrived.resolve(); return readFailure(response) })
          : consumer === 'web' ? web.call(op, {}, { signal: controller.signal }) : app.api.listNotes({ ok: true })
        const rejected = assert.rejects(reading, (error) => error === reason)
        if (timing === 'after-headers') {
          await arrived.promise
          await setImmediate()
          controller.abort(reason)
        }
        await rejected
      })
    }
  }
}
