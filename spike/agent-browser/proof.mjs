import { writeFileSync } from 'node:fs'
import { AgentBrowser } from '@mastra/agent-browser'
import { withSandbox, log, AGENT_USER } from './lib.mjs'
import { FORWARDER, STUB_APP } from './sandbox-side.mjs'
import { startTunnel } from './hub-proxy.mjs'

const OUT = new URL('./out/', import.meta.url).pathname
const short = (v, n = 400) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…[' + s.length + ' chars]' : s }
process.env.AGENT_BROWSER_ALLOWED_DOMAINS = '127.0.0.1'

await withSandbox(300_000, async (e2b) => {
  const bg = (cmd) => e2b.commands.run(cmd, { user: AGENT_USER, background: true })
  const sh = async (cmd) => { try { const r = await e2b.commands.run(cmd, { user: AGENT_USER, timeoutMs: 60000 }); return r.stdout + r.stderr } catch (e) { return 'ERR ' + e.message } }
  await e2b.files.write('/tmp/forwarder.mjs', FORWARDER, { user: AGENT_USER })
  await e2b.files.write('/tmp/app.mjs', STUB_APP, { user: AGENT_USER })
  // Chromium flags copied from application-check.ts:435-440, but with a fixed debugging port.
  await bg('chromium --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --disable-background-networking --disable-component-update --disable-sync --no-first-run --disable-default-apps --user-data-dir=/tmp/prof about:blank')
  await bg('node /tmp/forwarder.mjs'); await bg('node /tmp/app.mjs')
  await new Promise((r) => setTimeout(r, 3000))
  log('IN-SANDBOX app:', await sh('curl -s -m 5 http://127.0.0.1:4173/ | head -c 120'))

  const host = e2b.getHost(9223), token = e2b.trafficAccessToken
  const publicBase = 'https://' + host

  // Proof 1a: cdpHeaders is ignored by the installed agent-browser 0.19.0.
  try {
    const b = new AgentBrowser({ cdpUrl: publicBase, cdpHeaders: { 'e2b-traffic-access-token': token }, headless: true })
    await b.ensureReady(); await b.getManagerForThread('t0'); log('P1a unexpectedly connected')
    await b.close?.()
  } catch (e) { log('P1a cdpUrl=public https + cdpHeaders ->', short(e.message, 300)) }

  // Proof 1b: through the Hub-side tunnel (adds token + sandbox Host) and the in-sandbox forwarder (Host -> localhost).
  const tunnel = await startTunnel({ host, token })
  const version = await (await fetch(`http://127.0.0.1:${tunnel.port}/json/version`)).json()
  log('P1b /json/version through tunnel+forwarder:', short({ Browser: version.Browser, ws: version.webSocketDebuggerUrl }))
  const wsPath = new URL(version.webSocketDebuggerUrl).pathname
  const browser = new AgentBrowser({ cdpUrl: async () => `ws://127.0.0.1:${tunnel.port}${wsPath}`, headless: true })
  const tools = browser.getTools()
  log('TOOLS', Object.keys(tools).join(','))
  const T = 'thread-1'
  const call = (name, input = {}) => tools[name].execute(input, { agent: { threadId: T } })
  try {
    const goto = await call('browser_goto', { url: 'http://127.0.0.1:4173/' })
    log('P1b connected; goto ->', short(goto))
    const mgr = await browser.getManagerForThread(T)
    log('P1b manager sees tab url:', mgr.getPage().url())
    mgr.startRequestTracking()
    const page = mgr.getPage()
    const net = []
    page.on('requestfailed', (r) => net.push({ kind: 'failed', url: r.url(), why: r.failure()?.errorText }))
    page.on('response', (r) => { if (r.status() >= 400) net.push({ kind: 'http', url: r.url(), status: r.status() }) })
    await call('browser_goto', { url: 'http://127.0.0.1:4173/' })  // reload so the page-level listeners see the load

    // Proof 2
    const snap = await call('browser_snapshot', {})
    log('P2 SNAPSHOT:', short(snap, 1200))
    const text = snap.snapshot
    const refId = /button \"Add item\" @(e\d+)/.exec(text)[1]
    const click = await call('browser_click', { ref: '@' + refId })
    log('P2 CLICK ->', short(click))
    const snap2 = await call('browser_snapshot', {})
    log('P2 AFTER CLICK:', short(snap2, 800))
    const shot = await call('browser_screenshot', {})
    writeFileSync(OUT + 'screenshot.png', Buffer.from(shot.base64, 'base64'))
    const mo = tools.browser_screenshot.toModelOutput(shot)
    log('P2 SCREENSHOT keys', Object.keys(shot).join(','), 'bytes', Buffer.from(shot.base64, 'base64').length, 'toModelOutput part types', mo.value.map((p) => p.type + ':' + (p.mediaType ?? '')).join(','))

    // Proof 3
    const br = /button \"Break it\" @(e\d+)/.exec(text)[1]
    log('P3 click break', short(await call('browser_click', { ref: '@' + br })))
    await new Promise((r) => setTimeout(r, 500))
    log('P3 CONSOLE:', short(mgr.getConsoleMessages(), 1500))
    log('P3 PAGE_ERRORS:', short(mgr.getPageErrors(), 800))
    log('P3 REQUESTS (tracked):', short(mgr.getRequests().map((r) => r.method + ' ' + r.url), 800))
    log('P3 FAILED/4xx (own listeners):', short(net, 800))

    // Proof 4
    for (const url of ['https://example.com/', 'http://localhost:4174/', 'file:///etc/passwd']) {
      try { log('P4 goto', url, '->', short(await call('browser_goto', { url }), 300)) } catch (e) { log('P4 goto', url, 'THREW', short(e.message, 300)) }
    }
    log('P4 other-origin server hits log:', JSON.stringify(await sh('cat /tmp/other-origin-hits.log 2>&1; true')))
    log('P4 tab still on app:', (await browser.getManagerForThread(T)).getPage().url())
    log('P4 requests tracked that mention localhost:4174:', short(mgr.getRequests('localhost:4174').map((r) => r.url + ' ' + r.resourceType)))
    log('P4 failed list:', short(net.filter((n) => n.url.includes('4174')), 500))
    await call('browser_goto', { url: 'http://127.0.0.1:9223/json/version' }).then((r) => log('P4 same-hostname other port (CDP forwarder 9223):', short(r, 200)), (e) => log('P4 9223 THREW', short(e.message)))
  } finally {
    try { await browser.close?.() } catch {}
    tunnel.close()
  }
})
