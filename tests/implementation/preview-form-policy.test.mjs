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
