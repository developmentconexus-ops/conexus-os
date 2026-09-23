import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { previewContentSecurityPolicy } = await import(hubModuleUrl('mar/preview-routes.js'))

const page = `<!doctype html><html><body>
<form id="todo"><input name="task" value="Comprar pao"><button type="submit">Adicionar</button></form>
<form id="escape" action="/stolen" method="post"><input name="secret" value="x"><button type="submit">Enviar</button></form>
<p id="out">nada</p>
<script src="/app.js"></script></body></html>`
const script = `document.getElementById('todo').addEventListener('submit', (event) => {
  event.preventDefault()
  document.getElementById('out').textContent = 'adicionada: ' + new FormData(event.target).get('task')
})`

test('the Preview reaches its own API and nothing else', async (t) => {
  const { chromium } = await import('@playwright/test')
  const own = []
  const elsewhere = []
  const other = createServer((request, response) => { elsewhere.push(request.url); response.end('{}') })
  await new Promise((done) => other.listen(0, '127.0.0.1', done))
  t.after(() => other.close())
  const probe = `const results = []
for (const url of ['/__conexus/api/listNotes', 'http://127.0.0.1:${'${OTHER}'}/steal']) {
  try { results.push((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status) } catch { results.push('blocked') }
}
document.getElementById('out').textContent = results.join(',')`
  const server = createServer((request, response) => {
    const csp = previewContentSecurityPolicy('https://hub.example.test')
    if (request.method === 'POST') { own.push(request.url); response.writeHead(200, { 'content-type': 'application/json', 'content-security-policy': csp }); response.end('[]'); return }
    if (request.url === '/probe.js') { response.writeHead(200, { 'content-type': 'text/javascript', 'content-security-policy': csp }); response.end(probe.replace('${OTHER}', String(other.address().port))); return }
    response.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': csp })
    response.end('<!doctype html><html><body><p id="out">nada</p><script type="module" src="/probe.js"></script></body></html>')
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const tab = await browser.newPage()
  await tab.goto(`http://127.0.0.1:${server.address().port}/`)
  await tab.waitForFunction(() => document.getElementById('out').textContent !== 'nada')
  assert.equal(await tab.textContent('#out'), '200,blocked')
  assert.deepEqual([own, elsewhere], [['/__conexus/api/listNotes'], []])
})

test('an app form handled in JavaScript works in the Preview, and a form that posts elsewhere stays refused', async (t) => {
  const { chromium } = await import('@playwright/test')
  const posts = []
  const server = createServer((request, response) => {
    if (request.method === 'POST') posts.push(request.url)
    const csp = previewContentSecurityPolicy('https://hub.example.test')
    if (request.url === '/app.js') { response.writeHead(200, { 'content-type': 'text/javascript', 'content-security-policy': csp }); response.end(script); return }
    response.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': csp })
    response.end(page)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const tab = await browser.newPage()
  const url = `http://127.0.0.1:${server.address().port}/`
  await tab.goto(url)

  await tab.click('#todo button')
  assert.equal(await tab.textContent('#out'), 'adicionada: Comprar pao')

  await tab.click('#escape button', { noWaitAfter: true })
  await tab.waitForTimeout(1_000)
  assert.equal(tab.url(), url)
  assert.deepEqual(posts, [])
})
