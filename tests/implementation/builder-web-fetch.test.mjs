import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { guardedWebFetchTool, outboundUrl, WEB_FETCH_REFUSAL } = await import(hubModuleUrl('builder/harness/web-fetch.js'))

const fetchUrl = (url) => guardedWebFetchTool.execute({ url }, {})

test('a URL that can carry data is refused before anything leaves', async () => {
  const refused = [
    'https://example.com/a?q=1',
    'https://example.com/a?',
    'https://example.com/a#x',
    'https://example.com/a#',
    'https://u:p@example.com/',
    'https://u@example.com/',
    'ftp://example.com/',
    'file:///etc/passwd',
    'not a url',
    'https://example.com/user%40corp.com',
    'https://example.com/ana@corp.com',
    'https://example.com/orders/123456789',
    'https://example.com/%31%32%33%34%35%36',
    `https://example.com/${'a'.repeat(81)}`,
    `https://example.com/${'a/'.repeat(150)}`,
    'https://example.com/a\nb',
    'https://example.com/a b',
    'https://example.com/%E0%A4%A',
  ]
  for (const url of refused) {
    assert.equal(outboundUrl(url), undefined, url)
    assert.deepEqual(await fetchUrl(url), { content: WEB_FETCH_REFUSAL, isError: true }, url)
  }
  for (const value of ['', undefined, null, 42, { url: 'https://example.com/' }]) assert.equal(outboundUrl(value), undefined)
  assert.match(WEB_FETCH_REFUSAL, /go on without it/)
})

test('a plain documentation address passes unchanged', () => {
  for (const url of [
    'https://docs.example.com/guide/routing',
    'https://registry.npmjs.org/zod',
    'https://github.com/org/repo/blob/main/README.md',
    'http://hono.dev/docs/api/routing',
    'https://example.com',
  ]) {
    assert.equal(outboundUrl(url), new URL(url).toString(), url)
  }
})

test('a clean URL to a loopback host is still refused by Mastra, and no request reaches it', async () => {
  let requests = 0
  const server = createServer((_req, res) => { requests += 1; res.end('secret') })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  try {
    for (const host of [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`]) {
      const result = await fetchUrl(`http://${host}/page`)
      assert.equal(result.isError, true, host)
      assert.match(result.content, /private or reserved address/, host)
    }
    assert.equal(requests, 0)
  } finally {
    await new Promise((done) => server.close(done))
  }
})

test('the tool keeps its name and tells the model what it may send', () => {
  assert.equal(guardedWebFetchTool.id, 'web_fetch')
  assert.match(guardedWebFetchTool.description, /no query string/)
  assert.match(guardedWebFetchTool.description, /go on without it/)
})
