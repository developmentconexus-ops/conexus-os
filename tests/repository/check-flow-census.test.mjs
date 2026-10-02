import assert from 'node:assert/strict'
import test from 'node:test'
import { checkFlowCensus, declaredFlows } from '../../scripts/check-flow-census.mjs'

const LIVE = 'tests/live/builder-send-and-reply.test.mjs'
const SOURCES = { [LIVE]: "liveFlow({ id: 'builder.send-and-reply', nome: 'Enviar' }, async () => {})" }
const GRAPH = [{ command: `node --test ${LIVE}` }]
const flow = (overrides = {}) => ({ id: 'builder.send-and-reply', nome: 'Enviar', test: LIVE, ...overrides })

const run = ({ areas, sources = SOURCES, graph = GRAPH } = {}) =>
  checkFlowCensus({
    root: '.',
    areas: areas ?? [{ area: 'builder-factory', flows: [flow()] }],
    candidateGraph: graph,
    packageScripts: {},
    liveTests: Object.keys(sources),
    readSource: (path) => sources[path],
  })

test('declaredFlows reads every liveFlow id and nome literal', () => {
  assert.deepEqual(declaredFlows("liveFlow({ id: 'a.b', nome: 'x' }, f)\nliveFlow(\n{ id: \"c.d\", nome: 'y' }, f)"), [
    { id: 'a.b', nome: 'x' },
    { id: 'c.d', nome: 'y' },
  ])
})

test('a registered flow whose nome differs from its test declaration fails', () => {
  const { problems } = run({ areas: [{ area: 'a', flows: [flow({ nome: 'Um nome totalmente diferente' })] }] })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /builder\.send-and-reply is named "Um nome totalmente diferente" in areas\.json but "Enviar"/)
})

test('a registered flow with a declaring, reachable live test passes', () => {
  assert.deepEqual(run().problems, [])
})

test('registering a flow with no test file fails', () => {
  const { problems } = run({ areas: [{ area: 'a', flows: [flow(), flow({ id: 'builder.other', test: 'tests/live/missing.test.mjs' })] }] })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /builder\.other .*not a committed live test/)
})

test('a live test naming an unregistered flow fails', () => {
  const { problems } = run({ areas: [{ area: 'a', flows: [] }] })
  assert.match(problems.join('\n'), /live flow builder\.send-and-reply is not registered/)
})

test('a registered flow whose test does not declare it fails', () => {
  const { problems } = run({ areas: [{ area: 'a', flows: [flow(), flow({ id: 'builder.ghost' })] }] })
  assert.match(problems.join('\n'), /builder\.ghost .* does not declare that flow/)
})

test('a registered flow whose test the graph does not run fails', () => {
  const { problems } = run({ graph: [] })
  assert.match(problems.join('\n'), /not run by the required graph/)
})

test('a live test file with no flow declaration fails', () => {
  const sources = { ...SOURCES, 'tests/live/bare.test.mjs': 'test("x", () => {})' }
  assert.match(run({ sources }).problems.join('\n'), /bare\.test\.mjs declares no flow/)
})

test('a liveFlow call the census cannot read fails instead of being skipped', () => {
  for (const unreadable of ["liveFlow({ id: 'builder.ghost', nome: `Fantasma` }, f)", "liveFlow({ id: 'builder.ghost2', timeoutMs: 1, nome: 'X' }, f)"]) {
    const sources = { [LIVE]: `${SOURCES[LIVE]}\n${unreadable}` }
    const { problems } = run({ sources })
    assert.equal(problems.length, 1)
    assert.match(problems[0], /1 liveFlow call\(s\) whose id or nome is not a quoted string literal/)
  }
})

test('a duplicate id, a malformed flow and a missing flows array fail', () => {
  const { problems } = run({
    areas: [
      { area: 'a', flows: [flow()] },
      { area: 'b', flows: [flow(), { id: 'x.y' }] },
      { area: 'c' },
    ],
  })
  const text = problems.join('\n')
  assert.match(text, /registered twice/)
  assert.match(text, /without id, nome and test/)
  assert.match(text, /area c has no "flows" array/)
})
