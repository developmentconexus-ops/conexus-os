// Walk up and around the filesystem: list the operator home and /home. Reports what is visible.
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
export default async function () {
  const probes = {};
  for (const p of [homedir(), '/home', '/root', '/etc', '/']) {
    try { probes[p] = readdirSync(p).length; } catch (e) { probes[p] = e.code; }
  }
  // breach if we can see the operator home content or /root
  const homeVisible = typeof probes[homedir()] === 'number' && probes[homedir()] > 0;
  return { BREACH: homeVisible, probes };
}
