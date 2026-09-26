import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const EXEMPT_TESTS = Object.freeze([
  'tests/implementation/builder-e2b-live.test.mjs',
  'tests/implementation/builder-factory-e2b-live.test.mjs',
  'tests/implementation/builder-production-composed-live.test.mjs',
])

export function collectReachableTests(candidateGraph, packageScripts) {
  const reachable = new Set()
  const visitedScripts = new Set()

  function scanCommand(command) {
    if (!command) return
    const matches = command.match(/\S+\.test\.mjs/g) ?? []
    for (const match of matches) {
      const normalized = match.replace(/^\.\//, '')
      reachable.add(normalized)
    }

    for (const [, scriptName] of command.matchAll(/\bnpm run ([\w:.-]+)/g)) {
      const cleanName = scriptName.replace(/[.:,-]+$/, '')
      if (visitedScripts.has(cleanName)) continue
      visitedScripts.add(cleanName)
      if (packageScripts && Object.hasOwn(packageScripts, cleanName)) {
        scanCommand(packageScripts[cleanName])
      }
    }
  }

  for (const step of candidateGraph) {
    scanCommand(step.command)
  }

  return reachable
}

export function listCommittedTests(root) {
  const output = execFileSync('git', ['ls-files', 'tests/**/*.test.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  return output.split('\n').filter(Boolean).sort()
}

export function checkTestCensus({ root, candidateGraph, packageScripts, committedTests }) {
  const tests = committedTests ?? listCommittedTests(root)
  const reachable = collectReachableTests(candidateGraph, packageScripts)
  const exemptSet = new Set(EXEMPT_TESTS)

  const unreached = tests.filter((path) => !reachable.has(path) && !exemptSet.has(path))

  return {
    total: tests.length,
    reachableCount: reachable.size,
    exemptCount: exemptSet.size,
    unreached,
  }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? '')
if (isMainModule) {
  const root = resolve('.')
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const { CANDIDATE_GRAPH } = await import('./conexus-verify.mjs')

  const result = checkTestCensus({
    root,
    candidateGraph: CANDIDATE_GRAPH,
    packageScripts: pkg.scripts ?? {},
  })

  if (result.unreached.length > 0) {
    process.stderr.write(
      `${result.unreached.length} committed test file(s) are not reachable from CANDIDATE_GRAPH or exempt:\n` +
      result.unreached.map((t) => `  ${t}`).join('\n') + '\n'
    )
    process.exit(1)
  }

  process.stdout.write(
    `test census passed: all ${result.total} committed test files are reachable from CANDIDATE_GRAPH or exempt (${result.unreached.length} unreached)\n`
  )
}
