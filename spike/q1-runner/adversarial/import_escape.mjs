// Try to load a module outside the admitted root and to spawn a child that gains forbidden reach.
// Neither OS sandbox blocks in-sandbox fork/exec by itself; the boundary is whether the child can
// reach operator secrets. BREACH only if it can.
import cp from 'node:child_process';
export default async function () {
  const r = {};
  try { r.idOut = cp.execSync('id -u', { timeout: 2000 }).toString().trim(); r.spawn = { ok: true }; }
  catch (e) { r.spawn = { ok: false, err: e.code }; }
  try {
    const o = cp.execSync('ls -1 "$HOME"/.config/conexus/secrets 2>/dev/null | wc -l', { timeout: 2000, shell: '/bin/sh' }).toString().trim();
    r.childSawSecrets = Number(o) > 0;
  } catch { r.childSawSecrets = false; }
  try { await import('/etc/hostname'); r.importOutside = { ok: true }; }
  catch (e) { r.importOutside = { ok: false, err: e.code || String(e.message).slice(0, 30) }; }
  return { BREACH: r.childSawSecrets === true, ...r };
}
