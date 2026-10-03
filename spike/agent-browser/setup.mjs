import { AgentBrowser } from '@mastra/agent-browser'
import { AGENT_USER, log } from './lib.mjs'
import { FORWARDER, STUB_APP } from './sandbox-side.mjs'
import { startTunnel } from './hub-proxy.mjs'

export const bootSandboxBrowser = async (e2b) => {
  const bg = (cmd) => e2b.commands.run(cmd, { user: AGENT_USER, background: true })
  await e2b.files.write('/tmp/forwarder.mjs', FORWARDER, { user: AGENT_USER })
  await e2b.files.write('/tmp/app.mjs', STUB_APP, { user: AGENT_USER })
  await bg('chromium --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --disable-background-networking --disable-component-update --disable-sync --no-first-run --disable-default-apps --user-data-dir=/tmp/prof about:blank')
  await bg('node /tmp/forwarder.mjs'); await bg('node /tmp/app.mjs')
  await e2b.commands.run('for i in $(seq 1 40); do curl -s -m 2 http://127.0.0.1:9222/json/version >/dev/null && curl -s -m 2 http://127.0.0.1:4173/ >/dev/null && exit 0; sleep 0.5; done; exit 1', { user: AGENT_USER, timeoutMs: 60000 })
  const tunnel = await startTunnel({ host: e2b.getHost(9223), token: e2b.trafficAccessToken })
  const version = await (await fetch(`http://127.0.0.1:${tunnel.port}/json/version`)).json()
  const wsPath = new URL(version.webSocketDebuggerUrl).pathname
  process.env.AGENT_BROWSER_ALLOWED_DOMAINS = '127.0.0.1'
  const browser = new AgentBrowser({ cdpUrl: async () => `ws://127.0.0.1:${tunnel.port}${wsPath}`, headless: true })
  return { browser, tunnel }
}
