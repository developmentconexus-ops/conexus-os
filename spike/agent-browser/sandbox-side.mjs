export const FORWARDER = `
import net from 'node:net'
// Listens on 9223, rewrites the Host header to localhost:9222 until the connection upgrades, forwards to Chromium's CDP port.
net.createServer((client) => {
  const upstream = net.connect(9222, '127.0.0.1')
  let upgraded = false
  client.on('data', (chunk) => {
    if (!upgraded) {
      let text = chunk.toString('latin1')
      if (/^upgrade: websocket/im.test(text)) upgraded = true
      text = text.replace(/^Host:.*$/im, 'Host: localhost:9222')
      chunk = Buffer.from(text, 'latin1')
    }
    upstream.write(chunk)
  })
  upstream.on('data', (c) => client.write(c))
  const end = () => { client.destroy(); upstream.destroy() }
  client.on('error', end); upstream.on('error', end); client.on('close', end); upstream.on('close', end)
}).listen(9223, '0.0.0.0')
`

export const STUB_APP = `
import http from 'node:http'
import { appendFileSync } from 'node:fs'
const page = \`<!doctype html><html><head><title>Conexus stub app</title></head><body>
<main><h1>Stub notebook</h1><p id="count">Items: 0</p><ul id="list"></ul>
<button id="add" onclick="add()">Add item</button>
<button id="break" onclick="nope()">Break it</button>
<a href="http://example.com/">External link</a></main>
<img src="http://localhost:4174/pixel.png" alt="">
<script>
let n = 0
function add(){ n++; document.getElementById('list').insertAdjacentHTML('beforeend','<li>Item '+n+'</li>'); document.getElementById('count').textContent='Items: '+n }
function nope(){ undefinedFunction() }
console.error('stub boot error: deliberate')
fetch('/api/missing').then(r => console.log('api status', r.status))
fetch('http://localhost:4174/api').catch(e => console.log('cross-origin fetch failed', e.message))
</script></body></html>\`
http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page) }
  else { res.writeHead(404); res.end('not found') }
}).listen(4173, '127.0.0.1')
// The "other origin": hostname localhost differs from 127.0.0.1. Any hit is logged.
http.createServer((req, res) => { appendFileSync('/tmp/other-origin-hits.log', req.method + ' ' + req.url + '\\n'); res.writeHead(200, { 'access-control-allow-origin': '*' }); res.end('x') }).listen(4174, '127.0.0.1')
`
