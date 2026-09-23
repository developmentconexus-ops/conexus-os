// Reviewed arena case spike/q1-runner/adversarial/read_secrets.mjs at 1fb4946c. The only change: the
// paths arrive as input, because inside the sandbox there is no home directory to derive them from.
// Try to read operator secret files. Reports readability + byte length ONLY. Never returns contents.
import { statSync, accessSync, constants, readFileSync } from 'node:fs';
export default async function (input) {
  const PATHS = input.paths;
  const results = [];
  let anyRead = false;
  for (const p of PATHS) {
    let entry = { path: p, exists: false, readable: false, bytes: null };
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
