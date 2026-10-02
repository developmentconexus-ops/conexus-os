// Proves the Builder web suites are load-bearing: breaks one behaviour at a time in apps/web/src, runs
// the suite that should catch it, restores the file, and reports whether the suite failed and which
// tests did. The control row changes no behaviour and must pass, so a suite that fails for any
// mutation is failing on the mutation and not on the harness. Every target file must be unmodified, so
// an interrupted run is recovered with `git checkout -- <file>`. Usage:
//
//   node tests/implementation/guard-web-mutations.mjs [--check] [label ...]
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '../..')
const BUILDER = 'apps/web/src/features/builder'
const REASONS = `${BUILDER}/failure-reasons.ts`
const PLAN = `${BUILDER}/construir/plan-sections.ts`
const MERGE = `${BUILDER}/components/merge-calls.ts`
const MEMORY = `${BUILDER}/composer/memory-status.tsx`

// [label, file, pattern, replacement, suite, expectation]. The expectation is 'fail' unless the row is a control.
const MUTATIONS = [
  ['no-failure-code-reason', REASONS, "category === 'INTERNAL_ERROR' && failure?.failureCode", 'false', 'builder-turn-stall', 'fail'],
// biome-ignore lint/suspicious/noTemplateCurlyInString: exact source match
  ['no-retry-limit-in-notice', REASONS, "${maxRetries === null ? '' : ` de ${maxRetries}`}", '', 'builder-transcript', 'fail'],
  ['plan-heading-case-sensitive', PLAN, '/^##[ \\t]+Para construir[ \\t]*$/im', '/^##[ \\t]+Para construir[ \\t]*$/m', 'builder-plan-sections', 'fail'],
  ['merged-call-keeps-empty-args', MERGE, 'args: emptyArgs(part.toolInvocation.args) ? earlier.toolInvocation.args : part.toolInvocation.args', 'args: part.toolInvocation.args', 'builder-conversation-rows', 'fail'],
  ['memory-blocking-hides-failure', MEMORY, "failed ? 'failed' : buffering ? 'background' : blocking ? 'blocking' : 'idle'", "buffering ? 'background' : blocking ? 'blocking' : failed ? 'failed' : 'idle'", 'builder-memory-status', 'fail'],
  ['control-no-behaviour-change', REASONS, 'export const failureReason = (', 'export const failureReason = (', 'builder-turn-stall', 'pass'],
]

// --check only reports whether each mutation still applies to the current source, and runs nothing.
const check = process.argv.includes('--check')
const only = process.argv.slice(2).filter((argument) => argument !== '--check')
const selected = MUTATIONS.filter(([label]) => only.length === 0 || only.includes(label))
for (const file of new Set(selected.map(([, target]) => target))) {
  if (spawnSync('git', ['diff', '--quiet', '--', file], { cwd: repository }).status !== 0) throw new Error(`GUARD_MUTATION_TARGET_MODIFIED: ${file}`)
}
for (const [label, file, pattern, replacement, suite, expectation] of selected) {
  const path = join(repository, file)
  const original = readFileSync(path, 'utf8')
  if (!original.includes(pattern)) {
    process.stdout.write(`${label}\t${suite}\tMUTATION_DID_NOT_APPLY\n`)
    process.exitCode = 1
    continue
  }
  if (check) {
    process.stdout.write(`${label}\t${suite}\tAPPLIES\n`)
    continue
  }
  writeFileSync(path, original.replace(pattern, () => replacement))
  let result
  try {
    result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', `tests/implementation/${suite}.test.mjs`], { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } finally {
    writeFileSync(path, original)
  }
  const output = `${result.stdout}${result.stderr}`
  const failing = output.split('✖ failing tests:')[1] ?? ''
  const names = [...new Set([...failing.matchAll(/^✖ (.*?) \(\d/gm)].map((match) => match[1]))]
  const failed = result.status !== 0
  const verdict = expectation === 'pass'
    ? (failed ? 'CONTROL_FAILED' : 'CONTROL_PASSED')
    : (failed ? 'FAILED_AS_REQUIRED' : 'PASSED_WITHOUT_GUARD')
  if (verdict === 'CONTROL_FAILED' || verdict === 'PASSED_WITHOUT_GUARD') process.exitCode = 1
  process.stdout.write(`${label}\t${suite}\t${verdict}\t${names.join(' | ')}\n`)
}
