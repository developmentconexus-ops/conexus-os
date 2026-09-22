// Arm A. Supervisor forks one bwrap-sandboxed worker per invocation. Rootless isolation:
// unprivileged user+pid+net+ipc+uts namespaces, an allowlist rootfs (operator home simply absent),
// a fresh empty network namespace (no egress at all), the Project DB reached only over a bound-in
// unix socket, and V8 heap + external wall-clock bounds. No root, no nftables.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const SPIKE = process.env.Q1_SPIKE;
const NODE = process.execPath;
const PGSOCK = `${SPIKE}/pgsock`;

export async function init() { return { supervisorColdMs: 0 }; } // no long-lived process; supervisor is this module
export async function teardown() {}

export function invoke({ handlerRel, cred, input, timeMs = 3000, memMb = 128 }) {
  const start = Date.now();
  const args = [
    '--unshare-user', '--unshare-pid', '--unshare-net', '--unshare-ipc', '--unshare-uts',
    '--die-with-parent', '--new-session',
    '--ro-bind', '/usr', '/usr', '--ro-bind', '/bin', '/bin', '--ro-bind', '/lib', '/lib',
    ...(existsSync('/lib64') ? ['--ro-bind', '/lib64', '/lib64'] : []),
    '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
    '--ro-bind', NODE, NODE,
    '--ro-bind', SPIKE, '/app',
    '--bind', PGSOCK, '/sock',
    '--chdir', '/app',
    '--setenv', 'PGHOST', '/sock',
    '--setenv', 'PGUSER', cred.user,
    '--setenv', 'PGPASSWORD', cred.password,
    '--setenv', 'PGDATABASE', cred.database,
    '--setenv', 'Q1_HANDLER', `/app/${handlerRel}`,
    '--setenv', 'Q1_INPUT', JSON.stringify(input || {}),
    '--setenv', 'Q1_TIME_MS', String(timeMs),
    '--setenv', 'HOME', '/nonexistent',
    NODE, `--max-old-space-size=${memMb}`, '/app/run-one.mjs',
  ];
  const hardMs = timeMs + 2000;
  return new Promise((resolve) => {
    const p = spawn('bwrap', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let so = '', se = '';
    const killer = setTimeout(() => { p.kill('SIGKILL'); }, hardMs);
    p.stdout.on('data', (d) => { so += d; });
    p.stderr.on('data', (d) => { se += d; });
    p.on('close', (code, sig) => {
      clearTimeout(killer);
      resolve(classify({ code, sig, so, se, ms: Date.now() - start }));
    });
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
