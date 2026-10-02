import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EXEMPT_TESTS, collectReachableTests } from './check-test-census.mjs'

// A live flow is declared in its test file as liveFlow({ id: '<area>.<flow>', nome: '...' }, ...)
// (tests/live/harness.mjs). The census reads that literal; it never imports the test.
const DECLARATION = /\bliveFlow\(\s*\{\s*id:\s*(['"])([^'"]+)\1\s*,\s*nome:\s*(['"])(.*?)\3/g
const LIVE_TESTS = 'tests/live/*.test.mjs'

export const declaredFlows = (source) => [...source.matchAll(DECLARATION)].map((match) => ({ id: match[2], nome: match[4] }))

function listLiveTests(root) {
  const output = execFileSync('git', ['ls-files', LIVE_TESTS], { cwd: root, encoding: 'utf8' })
  return output.split('\n').filter(Boolean).sort()
}

export function checkFlowCensus({ root, areas, candidateGraph, packageScripts, liveTests, readSource }) {
  const read = readSource ?? ((path) => readFileSync(resolve(root, path), 'utf8'))
  const live = liveTests ?? listLiveTests(root)
  const reachable = collectReachableTests(candidateGraph, packageScripts)
  const exempt = new Set(EXEMPT_TESTS)
  const problems = []

  const declaredIn = new Map()
  for (const path of live) {
    const flows = declaredFlows(read(path))
    if (flows.length === 0) problems.push(`${path} declares no flow: wrap each scenario in liveFlow({ id, nome }, ...)`)
    declaredIn.set(path, new Map(flows.map((declared) => [declared.id, declared.nome])))
  }
  const allDeclared = new Set([...declaredIn.values()].flatMap((names) => [...names.keys()]))

  const registered = new Map()
  for (const area of areas) {
    if (!Array.isArray(area.flows)) {
      problems.push(`area ${area.area} has no "flows" array (use [] when it has no person flow)`)
      continue
    }
    for (const flow of area.flows) {
      const { id, nome, test } = flow ?? {}
      if (![id, nome, test].every((value) => typeof value === 'string' && value !== '')) {
        problems.push(`area ${area.area} has a flow without id, nome and test: ${JSON.stringify(flow)}`)
        continue
      }
      if (registered.has(id)) {
        problems.push(`flow ${id} is registered twice (${registered.get(id)} and ${area.area})`)
        continue
      }
      registered.set(id, area.area)
      if (!declaredIn.has(test)) problems.push(`flow ${id} names ${test}, which is not a committed live test (${LIVE_TESTS})`)
      else if (!declaredIn.get(test).has(id)) problems.push(`flow ${id} names ${test}, which does not declare that flow`)
      else if (declaredIn.get(test).get(id) !== nome) problems.push(`flow ${id} is named "${nome}" in areas.json but "${declaredIn.get(test).get(id)}" in ${test}`)
      else if (!reachable.has(test) || exempt.has(test)) problems.push(`flow ${id} names ${test}, which is not run by the required graph`)
    }
  }

  for (const id of allDeclared) {
    if (!registered.has(id)) problems.push(`live flow ${id} is not registered in docs/development/review/areas.json`)
  }

  return { flows: registered.size, liveFiles: live.length, problems }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? '')
if (isMainModule) {
  const root = resolve('.')
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const areas = JSON.parse(readFileSync(resolve(root, 'docs/development/review/areas.json'), 'utf8'))
  const { CANDIDATE_GRAPH } = await import('./conexus-verify.mjs')

  const result = checkFlowCensus({ root, areas, candidateGraph: CANDIDATE_GRAPH, packageScripts: pkg.scripts ?? {} })
  if (result.problems.length > 0) {
    process.stderr.write(`flow census failed:\n${result.problems.map((problem) => `  ${problem}`).join('\n')}\n`)
    process.exit(1)
  }
  process.stdout.write(`flow census passed: ${result.flows} registered flows match ${result.liveFiles} live test files\n`)
}
