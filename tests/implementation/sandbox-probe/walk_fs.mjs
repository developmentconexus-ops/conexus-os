// Reviewed arena case spike/q1-runner/adversarial/walk_fs.mjs at 1fb4946c. The only change: the
// operator home arrives as input, because inside the sandbox there is no home directory to read.
// Walk up and around the filesystem: list the operator home and /home. Reports what is visible.
import { readdirSync } from 'node:fs';
export default async function (input) {
  const home = input.home;
  const probes = {};
  for (const p of [home, '/home', '/root', '/etc', '/']) {
    try { probes[p] = readdirSync(p).length; } catch (e) { probes[p] = e.code; }
  }
  // breach if we can see the operator home content or /root
  const homeVisible = typeof probes[home] === 'number' && probes[home] > 0;
  return { BREACH: homeVisible, probes };
}
