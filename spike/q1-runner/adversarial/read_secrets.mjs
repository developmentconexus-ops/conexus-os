// Try to read operator secret files. Reports readability + byte length ONLY. Never returns contents.
import { statSync, accessSync, constants, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const H = homedir();
const PATHS = [
  `${H}/.config/conexus/secrets`,
  `${H}/.local/share/conexus/pilot/slice7/secrets`,
  `${H}/wt-u2/.audit/slice7/hub.env`,
];
export default async function () {
  const results = [];
  let anyRead = false;
  for (const p of PATHS) {
    let entry = { path: p.replace(H, '~'), exists: false, readable: false, bytes: null };
    try { const s = statSync(p); entry.exists = true;
      if (s.isFile()) {
        accessSync(p, constants.R_OK);
        const b = readFileSync(p); entry.readable = true; entry.bytes = b.length; anyRead = true;
      } else {
        // directory: can we list it?
        const { readdirSync } = await import('node:fs');
        const names = readdirSync(p); entry.readable = true; entry.entryCount = names.length; anyRead = true;
      }
    } catch (e) { entry.err = e.code; }
    results.push(entry);
  }
  return { BREACH: anyRead, results };
}
