import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { MCPServer } from '@mastra/mcp'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'

const { createContext7Docs, CONTEXT7_URL } = await import(hubModuleUrl('builder/harness/context7.js'))

const textTool = (id, reply) => createTool({
  id, description: `remote ${id}`, inputSchema: z.object({ query: z.string() }), execute: async ({ query }) => ({ content: [{ type: 'text', text: `${reply}:${query}` }] }),
})

const startFake = async (tools) => {
  const authorizations = []
  const mcp = new MCPServer({ name: 'fake-context7', version: '1.0.0', tools })
  const http = createServer((req, res) => {
    authorizations.push(req.headers.authorization)
    void mcp.startHTTP({ url: new URL(req.url, 'http://127.0.0.1'), httpPath: '/mcp', req, res })
  })
  await new Promise((done) => http.listen(0, '127.0.0.1', done))
  return { url: `http://127.0.0.1:${http.address().port}/mcp`, authorizations, stop: () => new Promise((done) => { http.closeAllConnections(); http.close(done) }) }
}

const FAKE_TOOLS = {
  'resolve-library-id': textTool('resolve-library-id', 'id'),
  'query-docs': textTool('query-docs', 'docs'),
  'get-secret-things': textTool('get-secret-things', 'nope'),
}

const callTool = (tools, name, input) => tools[name].execute(input, {})

test('the Builder gets only the two documentation tools, under web-safe names, with house descriptions', async () => {
  const fake = await startFake(FAKE_TOOLS)
  const docs = createContext7Docs({ url: fake.url })
  try {
    const tools = await docs.tools()
    assert.deepEqual(Object.keys(tools).sort(), ['context7_query_docs', 'context7_resolve_library_id'])
    for (const name of Object.keys(tools)) assert.match(name, /^[a-z][a-z0-9_]*$/)
    assert.match(tools.context7_resolve_library_id.description, /before you write code against a library API you are not sure of/)
    assert.match(tools.context7_query_docs.description, /go on without it/)
    assert.match(JSON.stringify(await callTool(tools, 'context7_query_docs', { query: 'routing' })), /docs:routing/)
  } finally {
    await docs.close()
    await fake.stop()
  }
})

test('the key is sent as a bearer header only when the installation configured one', async () => {
  const anonymous = await startFake(FAKE_TOOLS)
  const keyed = await startFake(FAKE_TOOLS)
  const withoutKey = createContext7Docs({ url: anonymous.url })
  const withKey = createContext7Docs({ url: keyed.url, apiKey: 'ctx7sk-test' })
  try {
    await withoutKey.tools()
    await withKey.tools()
    assert.ok(anonymous.authorizations.length > 0)
    assert.deepEqual([...new Set(anonymous.authorizations)], [undefined])
    assert.deepEqual([...new Set(keyed.authorizations)], ['Bearer ctx7sk-test'])
  } finally {
    await Promise.all([withoutKey.close(), withKey.close()])
    await Promise.all([anonymous.stop(), keyed.stop()])
  }
})

test('an unreachable Context7 leaves the run with no documentation tools, and asks again only after a pause', async () => {
  const fake = await startFake(FAKE_TOOLS)
  const url = fake.url
  await fake.stop()
  let clock = 1_000
  const docs = createContext7Docs({ url, now: () => clock })
  const quiet = process.stderr.write
  process.stderr.write = () => true
  try {
    const started = Date.now()
    assert.deepEqual(await docs.tools(), {})
    assert.ok(Date.now() - started < 5_000, 'discovery is bounded')
    clock += 1_000
    const second = Date.now()
    assert.deepEqual(await docs.tools(), {})
    assert.ok(Date.now() - second < 50, 'inside the pause nothing is tried again')
  } finally {
    process.stderr.write = quiet
    await docs.close()
  }
})

test('a call that fails after discovery returns a clear error instead of throwing', async () => {
  const failing = { ...FAKE_TOOLS, 'query-docs': createTool({ id: 'query-docs', description: 'x', inputSchema: z.object({ query: z.string() }), execute: async () => { throw new Error('upstream down') } }) }
  const fake = await startFake(failing)
  const docs = createContext7Docs({ url: fake.url })
  try {
    const tools = await docs.tools()
    const result = await callTool(tools, 'context7_query_docs', { query: 'routing' })
    assert.equal(result.isError, true)
    assert.equal(result.content, 'Context7 could not answer now. Go on without it and read the code in the checkout.')
  } finally {
    await docs.close()
    await fake.stop()
  }
})

test('Context7\'s default endpoint is its remote MCP', () => {
  assert.equal(CONTEXT7_URL, 'https://mcp.context7.com/mcp')
})
