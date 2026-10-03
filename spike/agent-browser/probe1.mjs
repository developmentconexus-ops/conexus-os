import { withSandbox, log, AGENT_USER } from './lib.mjs'
await withSandbox(300_000, async (e2b) => {
  const sh = async (cmd, user = AGENT_USER) => { try { const r = await e2b.commands.run(cmd, { user, timeoutMs: 60000 }); return r.stdout + r.stderr } catch (e) { return 'ERR ' + e.message + (e.stdout ?? '') + (e.stderr ?? '') } }
  log(await sh('which chromium node; chromium --version; node -v; id; ls /workspace /opt/conexus; ls /opt/conexus/compiler | head -20'))
  await e2b.commands.run('nohup chromium --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir=/tmp/prof about:blank >/tmp/chromium.log 2>&1 &', { user: AGENT_USER })
  await new Promise((r) => setTimeout(r, 3000))
  log('LOOPBACK Host=127.0.0.1:', await sh('curl -s -m 5 http://127.0.0.1:9222/json/version | head -c 300'))
  log('Host=x.e2b.app:', await sh('curl -s -m 5 -H "Host: 9222-abc.e2b.app" http://127.0.0.1:9222/json/version | head -c 300'))
  const host = e2b.getHost(9222)
  const tok = e2b.trafficAccessToken
  log('host', host, 'tokenPresent', !!tok)
  const r = await fetch('https://' + host + '/json/version', { headers: tok ? { 'e2b-traffic-access-token': tok } : {} })
  log('PUBLIC status', r.status, (await r.text()).slice(0, 300))
  const r2 = await fetch('https://' + host + '/json/version')
  log('PUBLIC no token status', r2.status, (await r2.text()).slice(0, 200))
})
