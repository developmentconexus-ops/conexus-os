import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function requiredFailures(needs) {
  const scope = needs.checks?.outputs ?? {}
  const flags = ['docs_only', 'full_live', 'backup', 'template', 'style']
  if (flags.some(flag => scope[flag] !== 'true' && scope[flag] !== 'false')) return ['missing or invalid change classification']
  const required = ['checks']
  if (scope.docs_only === 'false') {
    required.push('group')
    if (scope.full_live === 'true') required.push('integration')
    if (scope.backup === 'true') required.push('backup')
  }
  return required.filter(job => needs[job]?.result !== 'success').map(job => `${job}: ${needs[job]?.result ?? 'missing'}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = requiredFailures(JSON.parse(process.env.VERIFY_NEEDS ?? '{}'))
  for (const failure of failures) console.error(`required verification failed: ${failure}`)
  process.exitCode = failures.length ? 1 : 0
}
