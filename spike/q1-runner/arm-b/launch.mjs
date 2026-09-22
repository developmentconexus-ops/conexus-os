// Arm B. One long-lived container per Project on an INTERNAL docker network (Postgres reachable,
// internet not). Non-root user, read-only rootfs, --cap-drop ALL, no-new-privileges, memory + pids
// limits, no host home mounted, handler bundles mounted read-only. Supervisor forks a worker per
// invocation via docker exec. Uses the docker group (no root).
import { spawn, execFileSync } from 'node:child_process';

const SPIKE = process.env.Q1_SPIKE;
const NET = 'conexus-q1-net';
const IMAGE = 'node:24';
const containers = {}; // project -> container name

function sh(cmd, args) { return execFileSync(cmd, args, { encoding: 'utf8' }).trim(); }

export async function init(projects) {
  // recreate the network as internal so only attached containers (postgres) are reachable
  try { sh('docker', ['network', 'inspect', NET]); } catch { /* */ }
  // ensure arena attached
  try { sh('docker', ['network', 'connect', NET, 'conexus-q1-arena']); } catch { /* already */ }
  const coldStarts = {};
  for (const proj of projects) {
    const name = `q1b_${proj}`;
    containers[proj] = name;
    try { sh('docker', ['rm', '-f', name]); } catch { /* */ }
    const t0 = Date.now();
    sh('docker', ['run', '-d', '--name', name,
      '--network', NET,
      '--user', '65534:65534',
      '--read-only', '--tmpfs', '/tmp',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--memory', '256m', '--pids-limit', '128',
      '-v', `${SPIKE}/run-one.mjs:/app/run-one.mjs:ro`,
      '-v', `${SPIKE}/node_modules:/app/node_modules:ro`,
      '-v', `${SPIKE}/projects:/app/projects:ro`,
      '-v', `${SPIKE}/adversarial:/app/adversarial:ro`,
      '-w', '/app', IMAGE, 'sleep', 'infinity']);
    coldStarts[proj] = Date.now() - t0;
  }
  return { coldStarts };
}

export async function teardown() {
  for (const name of Object.values(containers)) { try { sh('docker', ['rm', '-f', name]); } catch { /* */ } }
}

export function invoke({ handlerRel, cred, input, project, timeMs = 3000, memMb = 128 }) {
  const start = Date.now();
  const name = containers[project];
  const env = [
    '-e', 'PGHOST=conexus-q1-arena', '-e', 'PGPORT=5432',
    '-e', `PGUSER=${cred.user}`, '-e', `PGPASSWORD=${cred.password}`, '-e', `PGDATABASE=${cred.database}`,
    '-e', `Q1_HANDLER=/app/${handlerRel}`, '-e', `Q1_INPUT=${JSON.stringify(input || {})}`,
    '-e', `Q1_TIME_MS=${timeMs}`,
  ];
  const args = ['exec', ...env, name, 'node', `--max-old-space-size=${memMb}`, '/app/run-one.mjs'];
  const hardMs = timeMs + 3000;
  return new Promise((resolve) => {
    const p = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let so = '', se = '';
    const killer = setTimeout(() => { try { sh('docker', ['exec', name, 'sh', '-c', 'kill -9 -1 2>/dev/null || true']); } catch { /* */ } p.kill('SIGKILL'); }, hardMs);
    p.stdout.on('data', (d) => { so += d; });
    p.stderr.on('data', (d) => { se += d; });
    p.on('close', (code, sig) => { clearTimeout(killer); resolve(classify({ code, sig, so, se, ms: Date.now() - start })); });
  });
}

function classify({ code, sig, so, se, ms }) {
  const line = so.split('\n').find((l) => l.startsWith('##'));
  if (line) {
    const tag = line.slice(2, 3);
    const body = JSON.parse(line.slice(5));
    if (tag === 'R') return { outcome: 'ok', value: body, ms };
    if (tag === 'T') return { outcome: 'timeout', value: body, ms };
    if (tag === 'E') return { outcome: 'threw', value: body, ms };
  }
  if (sig === 'SIGKILL' || code === 137) return { outcome: 'killed', ms, se: se.slice(-120) };
  if (code === 124) return { outcome: 'timeout', ms };
  return { outcome: 'crashed', code, sig, ms, se: se.slice(-160) };
}
