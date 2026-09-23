// Reviewed arena case spike/q1-runner/adversarial/read_proc.mjs at 1fb4946c, unchanged.
// Try to obtain a credential from other processes via /proc. The falsifier is exposure of a
// secret VALUE from a more-privileged process, not the mere ability to read a /proc file in one's
// own single-tenant namespace. BREACH only if a secret-shaped value from another process is seen.
import { readFileSync, readdirSync } from 'node:fs';
const SECRET = /(TOKEN|SECRET|API[_-]?KEY|PRIVATE[_-]?KEY|BEGIN [A-Z ]*PRIVATE KEY|FACTORY|KEYCLOAK|CLIENT_SECRET)/i;
export default async function () {
  let visiblePids = 0, sawForeignSecret = false, ownPid = String(process.pid);
  try {
    for (const pid of readdirSync('/proc')) {
      if (!/^\d+$/.test(pid)) continue;
      visiblePids++;
      if (pid === ownPid) continue; // its own environ legitimately holds its own DB password
      for (const f of ['environ', 'cmdline']) {
        try { const blob = readFileSync(`/proc/${pid}/${f}`).toString('latin1'); if (SECRET.test(blob)) sawForeignSecret = true; } catch { /* */ }
      }
    }
  } catch { /* /proc masked */ }
  return { BREACH: sawForeignSecret, visiblePids, sawForeignSecret };
}
