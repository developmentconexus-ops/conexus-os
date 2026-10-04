import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { Failure } = await import(hubModuleUrl('platform/failure.js'))

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
  const unreadable = classifyCheck(REVISION, { report: green, files: null })
  assert.deepEqual([unreadable.kind, unreadable.error.message], ['RED_PLATFORM', 'APPLICATION_CHECK_UNREADABLE'])
  const slow = classifyCheck(REVISION, { report: report([passed('generate'), failed('typecheck', [{ code: 'STEP_TIMEOUT', message: 'typecheck exceeded 60 s and was stopped' }])]), files: null })
  assert.deepEqual([slow.kind, slow.error.message], ['RED_PLATFORM', 'APPLICATION_CHECK_TIMEOUT'], 'a blocking step stopped on its clock is not charged to the app')
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
  assert.equal(feedback, `Verificação do Conexus: o app não passou (1 de ${GATE_RED_BUDGET}).\ntypecheck failed:\nboom\nResolva estes problemas e diga que terminou: o Conexus verifica o app quando você terminar.`)
  assert.equal(gate.gaveUp(), false)
})

test('the budget counts each red finish, an unchanged revision included, and the last one stops the loop', async () => {
  const counts = []
  const { gate, judged } = gateOver([RED], { onRedFinish: (count) => counts.push(count) })
  assert.match(await gate.finish(), /\(1 de 3\)/)
  assert.equal(gate.gaveUp(), false)
  assert.match(await gate.finish(), /\(2 de 3\)/)
  const last = await gate.finish()
  assert.match(last, /\(3 de 3\)/)
  assert.match(last, /O limite de tentativas acabou/)
  assert.equal(gate.gaveUp(), true)
  assert.deepEqual(counts, [1, 2, 3])
  assert.deepEqual(judged, [REVISION], 'one revision is checked once')
  assert.deepEqual(await gate.settle(), { kind: 'RED_APP', revision: REVISION, detail: RED.detail })
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

test('a Conexus failure never goes back to the agent, and is checked again rather than kept', async () => {
  const unpack = new Failure('BUILDER_CANDIDATE_UNPACK_FAILED')
  const { gate, judged } = gateOver([unpack, unpack])
  assert.equal(await gate.finish(), null)
  assert.deepEqual(await gate.settle(), { kind: 'RED_PLATFORM', error: unpack })
  assert.deepEqual(judged, [REVISION, REVISION])
})

test('a candidate that cannot be read is Conexus failing', async () => {
  const unreadable = new Error('a message, not a code')
  const gate = createCandidateGate({ candidate: async () => { throw unreadable }, judge: async () => assert.fail('nothing to judge') })
  assert.equal(await gate.finish(), null)
  assert.deepEqual(await gate.settle(), { kind: 'RED_PLATFORM', error: unreadable })
})

test('a checkout too large to take back goes to the agent to fix', async () => {
  const gate = createCandidateGate({ candidate: async () => { throw new Failure('BUILDER_RESULT_BUNDLE_TOO_LARGE') }, judge: async () => assert.fail('nothing to judge') })
  assert.match(await gate.finish(), /^Verificação do Conexus: o app não passou \(1 de 3\)\.\nO Conexus não aceita esta versão: os arquivos do projeto passam do tamanho máximo/)
  assert.equal((await gate.settle()).revision, null)
})

test('a finish asked again while its check still runs shares that one check', async () => {
  let release
  const held = new Promise((resolve) => { release = resolve })
  const judged = []
  const gate = createCandidateGate({
    candidate: async () => REVISION,
    judge: async (revision) => { judged.push(revision); await held; return { kind: 'RED_APP', revision, detail: 'typecheck failed:\nboom' } },
  })
  const first = gate.finish()
  const second = gate.finish()
  release()
  assert.deepEqual(await Promise.all([first, second]).then((all) => all.map((feedback) => feedback.split('\n')[0])), [
    'Verificação do Conexus: o app não passou (1 de 3).', 'Verificação do Conexus: o app não passou (1 de 3).',
  ])
  assert.deepEqual(judged, [REVISION])
})

test('a turn that left nothing new settles with no change and no check', async () => {
  const gate = createCandidateGate({ candidate: async () => null, judge: async () => assert.fail('nothing to judge') })
  assert.equal(await gate.finish(), null)
  assert.equal(await gate.settle(), null)
})
