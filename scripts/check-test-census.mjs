import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const EXEMPT_TESTS = Object.freeze([
  'tests/implementation/builder-e2b-live.test.mjs',
  'tests/implementation/builder-sandbox-e2b-live.test.mjs',
  'tests/implementation/builder-production-composed-live.test.mjs',
  // Manual Playwright proofs against a real Keycloak and PostgreSQL; they need secrets CI does not hold.
])

export function collectReachableTests(candidateGraph, packageScripts) {
  const reachable = new Set()
  const visitedScripts = new Set()

  function scanCommand(command) {
    if (!command) return
    const matches = command.match(/\S+\.(?:test|spec)\.mjs/g) ?? []
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

function listCommittedTests(root) {
  const output = execFileSync('git', ['ls-files', 'tests/**/*.test.mjs', 'tests/**/*.spec.mjs'], {
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

const BROWSER_CLASSES = new Set(['browser', 'browser-postgres', 'live'])
const PLAYWRIGHT_IMPORT = /^[^'"\n]*\b(?:from|import)\s*\(?\s*['"](?:@playwright\/test|playwright(?:-core)?)['"]/m

// A test file that imports Playwright, registered in a step of a class without a browser, fails in CI
// at the group that has none, never on the machine that wrote it.
export function browserTestsOutsideBrowserSteps({ candidateGraph, packageScripts, readText }) {
  const found = []
  for (const step of candidateGraph) {
    if (BROWSER_CLASSES.has(step.environmentClass)) continue
    for (const test of collectReachableTests([step], packageScripts)) {
      if (PLAYWRIGHT_IMPORT.test(readText(test))) found.push({ test, step: step.scope, environmentClass: step.environmentClass })
    }
  }
  return found
}

const browserMessage = (found) =>
  `${found.length} test file(s) import Playwright but sit in a step of a class without one:\n` +
  found.map(({ test, step, environmentClass }) => `  ${test} in step ${step} (${environmentClass})`).join('\n') + '\n'

export const unreachedMessage = (unreached) =>
  `${unreached.length} committed test file(s) are not reachable from CANDIDATE_GRAPH or exempt:\n` +
  unreached.map((t) => `  ${t}`).join('\n') + '\n'

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
    process.stderr.write(unreachedMessage(result.unreached))
    process.exit(1)
  }

  const misplaced = browserTestsOutsideBrowserSteps({
    candidateGraph: CANDIDATE_GRAPH,
    packageScripts: pkg.scripts ?? {},
    readText: (path) => readFileSync(resolve(root, path), 'utf8'),
  })
  if (misplaced.length > 0) {
    process.stderr.write(browserMessage(misplaced))
    process.exit(1)
  }

  process.stdout.write(
    `test census passed: all ${result.total} committed test files are reachable from CANDIDATE_GRAPH or exempt (${result.unreached.length} unreached)\n`
  )
}
