import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { classifyCheck, createCandidateGate, GATE_RED_BUDGET } = await import(hubModuleUrl('builder/candidate-gate.js'))

const REVISION = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const facts = { operations: 0, migrations: 0, jsGzipBytes: 0 }
const passed = (step) => ({ step, status: 'passed', durationMs: 1 })
const failed = (step, problems) => ({ step, status: 'failed', durationMs: 1, problems })
const files = [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes: new Uint8Array([60]), sha256: 'c'.repeat(64) }]
const report = (steps) => ({ ok: steps.every((step) => step.status === 'passed'), steps, facts })
const green = report(['generate', 'typecheck', 'build', 'server', 'boot'].map(passed))
const typeError = report([passed('generate'), failed('typecheck', [{ file: 'app/src/total.ts', line: 1, code: 'TS2322', message: 'Type string is not number' }])])

test('a check is labelled where it fails: the app, a page that did not render, Conexus, or green', () => {
  assert.deepEqual(classifyCheck(REVISION, { report: typeError, files: null }), {
    kind: 'RED_APP', revision: REVISION, detail: 'typecheck failed:\napp/src/total.ts:1: TS2322 Type string is not number',
  })
  const unrendered = report([...['generate', 'typecheck', 'build', 'server'].map(passed), failed('boot', [{ code: 'BOOT_NO_ROOT_CHILD', message: 'nothing drawn' }])])
  assert.equal(classifyCheck(REVISION, { report: unrendered, files }).kind, 'UNRENDERED')
  assert.deepEqual(classifyCheck(REVISION, { report: green, files: null }), { kind: 'RED_PLATFORM', revision: REVISION, code: 'APPLICATION_CHECK_UNREADABLE' })
  const consoleError = report([...['generate', 'typecheck', 'build', 'server'].map(passed), failed('boot', [{ code: 'BOOT_CONSOLE_ERROR', message: 'oops' }])])
  const built = classifyCheck(REVISION, { report: consoleError, files, thumbnail: { mediaType: 'image/png', bytes: new Uint8Array([1]) } })
  assert.equal(built.kind, 'GREEN')
  assert.equal(built.build.files, files)
  assert.equal(built.build.bootProblems, 'boot failed:\nBOOT_CONSOLE_ERROR oops')
  assert.equal(built.build.thumbnail.mediaType, 'image/png')
})

const gateOver = (verdicts, options = {}) => {
  const judged = []
  let revision = REVISION
  const gate = createCandidateGate({
    candidate: async () => revision,
    judge: async (candidate) => {
      judged.push(candidate)
      const next = verdicts.shift()
      if (next instanceof Error) throw next
      return { revision: candidate, ...next }
    },
    ...options,
  })
  return { gate, judged, moveTo: (next) => { revision = next } }
}
const RED = { kind: 'RED_APP', detail: 'typecheck failed:\nboom' }

test('a red finish goes back to the agent with the check in its words, counted against the budget', async () => {
  const { gate } = gateOver([RED])
  const feedback = await gate.finish()
  assert.equal(feedback, `Verificação do Conexus: o app não passou (1 de ${GATE_RED_BUDGET}).\ntypecheck failed:\nboom\nCorrija estes problemas e termine de novo: o Conexus verifica o app outra vez quando você terminar.`)
  assert.equal(gate.gaveUp(), false)
})

test('the budget counts each red finish, an unchanged revision included, and the last one stops the loop', async () => {
  const counts = []
  const checking = []
  const { gate, judged } = gateOver([RED], { onRedFinish: (count) => counts.push(count), onChecking: (revision) => checking.push(revision) })
  assert.match(await gate.finish(), /\(1 de 3\)/)
  assert.equal(gate.gaveUp(), false)
  assert.match(await gate.finish(), /\(2 de 3\)/)
  const last = await gate.finish()
  assert.match(last, /\(3 de 3\)/)
  assert.match(last, /O limite de tentativas acabou/)
  assert.equal(gate.gaveUp(), true)
  assert.deepEqual(counts, [1, 2, 3])
  assert.deepEqual(judged, [REVISION], 'one revision is checked once')
  assert.deepEqual(checking, [REVISION, REVISION, REVISION], 'each finish says the run is checking, a known verdict included')
  assert.deepEqual(await gate.settle(), { kind: 'RED_APP', revision: REVISION, detail: RED.detail })
})

test('a run that parked on a question keeps the count its earlier leg spent', async () => {
  const { gate } = gateOver([RED], { redFinishes: 2 })
  assert.match(await gate.finish(), /\(3 de 3\)/)
  assert.equal(gate.gaveUp(), true)
})

test('a green finish ends the turn, and the verdict it judged is the one the run settles on', async () => {
  const { gate, judged, moveTo } = gateOver([RED, { kind: 'GREEN', build: { files } }])
  assert.match(await gate.finish(), /\(1 de 3\)/)
  moveTo(OTHER)
  assert.equal(await gate.finish(), null)
  assert.equal(gate.gaveUp(), false)
  assert.equal((await gate.settle()).kind, 'GREEN')
  assert.deepEqual(judged, [REVISION, OTHER], 'settling reuses the finish check')
})

test('a Conexus failure never goes back to the agent: the finish stands and the run settles it', async () => {
  const { gate } = gateOver([new Error('BUILDER_CANDIDATE_UNPACK_FAILED')])
  assert.equal(await gate.finish(), null)
  assert.deepEqual(await gate.settle(), { kind: 'RED_PLATFORM', revision: REVISION, code: 'BUILDER_CANDIDATE_UNPACK_FAILED' })
})

test('a candidate that cannot be read is Conexus failing, with no revision to keep', async () => {
  const gate = createCandidateGate({ candidate: async () => { throw new Error('a message, not a code') }, judge: async () => assert.fail('nothing to judge') })
  assert.equal(await gate.finish(), null)
  assert.deepEqual(await gate.settle(), { kind: 'RED_PLATFORM', revision: null, code: 'BUILDER_CANDIDATE_CHECK_FAILED' })
})

test('a turn that left nothing new settles with no change and no check', async () => {
  const gate = createCandidateGate({ candidate: async () => null, judge: async () => assert.fail('nothing to judge') })
  assert.equal(await gate.finish(), null)
  assert.equal(await gate.settle(), null)
})
