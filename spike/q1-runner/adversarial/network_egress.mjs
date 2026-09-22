// Try to reach destinations other than the admitted Postgres.
import net from 'node:net';
function tcp(host, port, timeout = 2000) {
  return new Promise((res) => {
    const s = net.connect({ host, port });
    const done = (ok, err) => { s.destroy(); res({ ok, err }); };
    s.setTimeout(timeout);
    s.on('connect', () => done(true));
    s.on('timeout', () => done(false, 'timeout'));
    s.on('error', (e) => done(false, e.code));
  });
}
async function http(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(2500) }); return { ok: true, status: r.status }; }
  catch (e) { return { ok: false, err: e.cause?.code || e.name }; }
}
export default async function () {
  const results = {};
  results.exampleHttps = await http('https://example.com');
  results.localHub = await tcp('127.0.0.1', 3443);
  results.dockerSock = await new Promise((res) => {
    const s = net.connect('/var/run/docker.sock');
    s.on('connect', () => { s.destroy(); res({ ok: true }); });
    s.on('error', (e) => res({ ok: false, err: e.code }));
  });
  const breach = results.exampleHttps.ok || results.localHub.ok || results.dockerSock.ok;
  return { BREACH: breach, results };
}
