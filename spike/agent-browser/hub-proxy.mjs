import net from 'node:net'
import tls from 'node:tls'

// Hub-side loopback tunnel: adds E2B's traffic token and the sandbox host to every request and
// pipes to the sandbox over TLS. Needed because agent-browser 0.19.0 does not pass cdpHeaders to connectOverCDP.
export const startTunnel = ({ host, token }) => new Promise((ready) => {
  const server = net.createServer((client) => {
    const upstream = tls.connect({ host, port: 443, servername: host })
    let upgraded = false
    client.on('data', (chunk) => {
      if (!upgraded) {
        let text = chunk.toString('latin1')
        if (/^upgrade: websocket/im.test(text)) upgraded = true
        text = text.replace(/^Host:.*$/im, `Host: ${host}\r\ne2b-traffic-access-token: ${token}`)
        chunk = Buffer.from(text, 'latin1')
      }
      upstream.write(chunk)
    })
    upstream.on('data', (c) => client.write(c))
    const end = () => { client.destroy(); upstream.destroy() }
    client.on('error', end); upstream.on('error', end); client.on('close', end); upstream.on('close', end)
  })
  server.listen(0, '127.0.0.1', () => ready({ port: server.address().port, close: () => server.close() }))
})
