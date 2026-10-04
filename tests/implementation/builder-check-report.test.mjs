import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { checkReportSchema, agentReportSchema, safeRelativePath, CHECK_COMMAND_TIMEOUT_MS } = await import(hubModuleUrl('builder/check/report.js'))

const SHA = 'a'.repeat(64)
const FILE_SHA = 'b'.repeat(64)
const ARTIFACT = { templateRef: 'template:pin', files: [{ path: 'index.html', bytes: 15, sha256: FILE_SHA }, { path: 'assets/app.js', bytes: 2048, sha256: FILE_SHA }] }
const passed = (step) => ({ step, status: 'passed', durationMs: 12 })
const skipped = (step, reason = 'after failed typecheck') => ({ step, status: 'skipped', code: 'AFTER_BLOCKING_FAILURE', reason })
const PASSING = { ok: true, checkSha256: SHA, steps: ['generate', 'typecheck', 'build', 'server', 'boot'].map(passed), artifact: ARTIFACT }
const TYPE_ERROR = { step: 'typecheck', status: 'failed', code: 'TYPECHECK_ERRORS', durationMs: 900, problems: [{ file: 'app/src/main.tsx', line: 1, column: 7, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." }] }
const REFUSED = { ok: false, checkSha256: SHA, steps: [passed('generate'), TYPE_ERROR, skipped('build'), skipped('server'), skipped('boot')], artifact: null }
const BOOT_FAILED = { step: 'boot', status: 'failed', code: 'BOOT_NO_ROOT_CHILD', durationMs: 300, problems: [{ code: 'BOOT_NO_ROOT_CHILD', message: 'The page loaded but #root has no children: nothing was rendered.' }] }
const BROWSER_MISSING = { step: 'boot', status: 'skipped', code: 'BOOT_BROWSER_UNAVAILABLE', reason: 'the browser did not start: spawn chromium ENOENT' }

test('a report that keeps every rule is read back exactly as printed', () => {
  for (const report of [
    PASSING,
    REFUSED,
    { ...PASSING, steps: [...PASSING.steps.slice(0, 4), BOOT_FAILED] },
    { ...PASSING, steps: [...PASSING.steps.slice(0, 4), BROWSER_MISSING] },
    { ...REFUSED, steps: [{ step: 'generate', status: 'failed', code: 'MANIFEST_REFUSED', durationMs: 3, problems: [{ message: 'x' }], dropped: 4 }, skipped('typecheck', 'after failed generate'), skipped('build', 'after failed generate'), skipped('server', 'after failed generate'), skipped('boot', 'after failed generate')] },
  ]) assert.deepEqual(checkReportSchema.parse(report), report)
})

const REFUSALS = [
  ['a report with the facts field this check no longer has', { ...PASSING, facts: { operations: 0, migrations: 0, jsGzipBytes: 1 } }, /Unrecognized key/],
  ['a step the check does not have', { ...PASSING, steps: [...PASSING.steps, passed('deploy')] }, /Invalid option/],
  ['four steps', { ...PASSING, steps: PASSING.steps.slice(0, 4) }, /steps must be exactly generate, typecheck, build, server, boot in order/],
  ['six steps', { ...PASSING, steps: [...PASSING.steps, passed('boot')] }, /steps must be exactly generate, typecheck, build, server, boot in order/],
  ['steps out of order', { ...PASSING, steps: [PASSING.steps[1], PASSING.steps[0], ...PASSING.steps.slice(2)] }, /steps must be exactly generate, typecheck, build, server, boot in order/],
  ['a step that runs after a blocking failure', { ...REFUSED, steps: [passed('generate'), TYPE_ERROR, passed('build'), skipped('server'), skipped('boot')] }, /build follows the failed typecheck and must be skipped with AFTER_BLOCKING_FAILURE/],
  ['a step skipped for another reason after a blocking failure', { ...REFUSED, steps: [passed('generate'), TYPE_ERROR, skipped('build'), skipped('server'), BROWSER_MISSING] }, /boot follows the failed typecheck and must be skipped with AFTER_BLOCKING_FAILURE/],
  ['a skip after a blocking failure that did not happen', { ...PASSING, ok: false, artifact: null, steps: [passed('generate'), passed('typecheck'), skipped('build'), passed('server'), passed('boot')] }, /build is skipped after a blocking failure that did not happen/],
  ['a blocking step skipped for the browser', { ...REFUSED, steps: [passed('generate'), { ...BROWSER_MISSING, step: 'typecheck' }, skipped('build'), skipped('server'), skipped('boot')] }, /typecheck cannot be skipped for BOOT_BROWSER_UNAVAILABLE/],
  ['ok on a report with a failed blocking step', { ...REFUSED, ok: true }, /ok must be true exactly when every blocking step passed/],
  ['not ok on a report where every blocking step passed', { ...PASSING, ok: false, artifact: null }, /ok must be true exactly when every blocking step passed/],
  ['a passing report with no artifact', { ...PASSING, artifact: null }, /a passing report must carry its artifact/],
  ['a refused report with an artifact', { ...REFUSED, artifact: ARTIFACT }, /a refused report must not carry an artifact/],
  ['a manifest that lists a path twice', { ...PASSING, artifact: { ...ARTIFACT, files: [ARTIFACT.files[0], ARTIFACT.files[0]] } }, /artifact path "index.html" appears twice/],
  ['a manifest path that climbs out', { ...PASSING, artifact: { ...ARTIFACT, files: [{ ...ARTIFACT.files[0], path: '../etc/passwd' }] } }, /artifact path "..\/etc\/passwd" is not a safe relative path/],
  ['a manifest path that is absolute', { ...PASSING, artifact: { ...ARTIFACT, files: [{ ...ARTIFACT.files[0], path: '/etc/passwd' }] } }, /artifact path "\/etc\/passwd" is not a safe relative path/],
  ['a manifest hash that is not a sha256', { ...PASSING, artifact: { ...ARTIFACT, files: [{ ...ARTIFACT.files[0], sha256: 'xyz' }] } }, /Invalid string/],
  ['a check identity that is not a sha256', { ...PASSING, checkSha256: 'main.mjs' }, /Invalid string/],
  ['a negative duration', { ...PASSING, steps: [{ ...passed('generate'), durationMs: -1 }, ...PASSING.steps.slice(1)] }, /^Too small: expected number to be >=0$/],
  ['a failed step with no problem', { ...REFUSED, steps: [passed('generate'), { ...TYPE_ERROR, problems: [] }, skipped('build'), skipped('server'), skipped('boot')] }, /^Too small: expected array to have >=1 items$/],
  ['a failed step with 51 problems', { ...REFUSED, steps: [passed('generate'), { ...TYPE_ERROR, problems: Array.from({ length: 51 }, () => ({ message: 'x' })) }, skipped('build'), skipped('server'), skipped('boot')] }, /^Too big: expected array to have <=50 items$/],
  ['a failure code the check does not have', { ...REFUSED, steps: [passed('generate'), { ...TYPE_ERROR, code: 'SOMETHING_ELSE' }, skipped('build'), skipped('server'), skipped('boot')] }, /Invalid option/],
  ['a message longer than 2000 characters', { ...REFUSED, steps: [passed('generate'), { ...TYPE_ERROR, problems: [{ message: 'x'.repeat(2001) }] }, skipped('build'), skipped('server'), skipped('boot')] }, /typecheck has a message longer than 2000 characters/],
]
for (const [name, report, message] of REFUSALS) {
  test(`the schema refuses ${name}`, () => {
    const parsed = checkReportSchema.safeParse(report)
    assert.equal(parsed.success, false)
    assert.match(parsed.error.issues.map((issue) => issue.message).join('\n'), message)
  })
}

test('a manifest path is safe only when it stays inside the folder', () => {
  assert.deepEqual(['index.html', 'assets/a-b.js', 'a b/ç.txt'].map(safeRelativePath), [true, true, true])
  assert.deepEqual(['', '/x', 'a//b', './a', 'a/..', 'a/./b', 'a\\b', 'a\u0000b', 'a'.repeat(4097)].map(safeRelativePath), [false, false, false, false, false, false, false, false, false])
})

test('what the model reads is the verdict and the steps, and a report with the artifact is not that', () => {
  assert.deepEqual(agentReportSchema.parse({ ok: false, steps: REFUSED.steps }), { ok: false, steps: REFUSED.steps })
  assert.equal(agentReportSchema.safeParse(PASSING).success, false)
})

test('the whole check is given the sum of the step limits and forty seconds for generate and the report', () => {
  assert.equal(CHECK_COMMAND_TIMEOUT_MS, 60_000 + 60_000 + 60_000 + 45_000 + 40_000)
})
