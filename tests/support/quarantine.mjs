import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quarantineReason } from '../../scripts/test-skip-reasons.mjs'

const root = resolve(import.meta.dirname, '../..')

// The skip option of a test: test(name, { skip: quarantined(import.meta.url, name) }, ...). While the
// entry for "<file>:<name>" in tests/quarantine.json is live the test is skipped; once the entry is
// removed or expires it runs again by itself.
export const quarantined = (fileUrl, name) => {
  const entries = JSON.parse(readFileSync(resolve(root, 'tests/quarantine.json'), 'utf8'))
  return quarantineReason(entries, relative(root, fileURLToPath(fileUrl)), name, new Date().toISOString().slice(0, 10))
}
