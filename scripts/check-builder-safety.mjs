import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const tracked = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
const walk = (dir, accept) => {
  const prefix = `${relative(repo, dir)}/`
  return tracked.filter((path) => path.startsWith(prefix)).map((path) => join(repo, path)).filter((path) => existsSync(path) && accept(path))
}
const rel = (path) => relative(repo, path)
const hits = (paths, pattern, { comments = false } = {}) => paths.flatMap((path) => readFileSync(path, 'utf8').split('\n')
  .flatMap((line, i) => (pattern.test(line) && (comments || !/^\s*(\/\/|\*|\/\*)/.test(line)) ? [`${rel(path)}:${i + 1}`] : [])))

const DEBT = /^\s*\/\/ biome-ignore lint\/nursery\/noUnsafeTypeAssertion: debt\b/
const EXEMPT = /^\s*\/\/ biome-ignore lint\/nursery\/noUnsafeTypeAssertion: exempt (\S.*)$/
// lint/plugin is the category of a Grit plugin diagnostic: it silences only plugin rules, never noUnsafeTypeAssertion.
const UNNAMED = /biome-ignore(?:-all|-start)?\s+lint(?:\/(?!plugin\b)[A-Za-z]+)?(?![/A-Za-z])/
const SOURCE = /\.[cm]?tsx?$/
const sourceLines = (paths) => paths.flatMap((path) => readFileSync(path, 'utf8').split('\n').map((line, i) => ({ at: `${rel(path)}:${i + 1}`, line })))
const appLines = sourceLines(walk(join(repo, 'apps'), (path) => SOURCE.test(path)))
const packageLines = sourceLines(tracked.filter((path) => /^packages\/[^/]+\/src\//.test(path) && SOURCE.test(path)).map((path) => join(repo, path)).filter((path) => existsSync(path)))
const exemptions = appLines.flatMap(({ at, line }) => (EXEMPT.test(line) ? [`${at} ${EXEMPT.exec(line)[1].trim()}`] : []))
const refusedSuppressions = [
  ...appLines.filter(({ line }) => line.includes('noUnsafeTypeAssertion') && !DEBT.test(line) && !EXEMPT.test(line)),
  ...packageLines.filter(({ line }) => line.includes('noUnsafeTypeAssertion')),
  ...appLines.concat(packageLines).filter(({ line }) => UNNAMED.test(line)),
].map(({ at }) => at)
const biomePath = join(repo, 'biome.json')
const biomeOverrides = existsSync(biomePath) ? (JSON.parse(readFileSync(biomePath, 'utf8')).overrides ?? []) : []
const rulesOff = biomeOverrides.flatMap((override, index) => {
  const ruleLevel = override.linter?.rules?.nursery?.noUnsafeTypeAssertion
  const off = override.linter?.enabled === false || (ruleLevel !== undefined && ruleLevel !== 'error')
  return off ? [`biome.json overrides[${index}]`] : []
})

const recordedExemptions = ['apps/hub/src/identity-access/oidc.ts:127 undici fetch and openid-client CustomFetch disagree on RequestInit and Response, proven by tsc']

const hubSource = walk(join(repo, 'apps/hub/src'), path => /\.tsx?$/.test(path))
const refused = [
  ...rulesOff.map(at => `${at} turns noUnsafeTypeAssertion off`),
  ...refusedSuppressions.map(at => `${at} has an unnamed or unjustified unsafe assertion suppression`),
  ...exemptions.filter(entry => !recordedExemptions.includes(entry)).map(entry => `unreviewed unsafe assertion exception: ${entry}`),
  ...hits(hubSource.filter(path => rel(path) !== 'apps/hub/src/builder/mastra-leftovers.ts'), /__unregisterInternalWorkflow|deleteWorkflowRunById/).map(at => `${at} uses Mastra internals outside their owner`),
  ...hits(hubSource.filter(path => rel(path) === 'apps/hub/src/builder/conexus-git.ts'), /\.catch\(\(\) =>|\.catch\((?:async )?\(\w+(?:: unknown)?\) => \{?\s*throw new Failure\(/).map(at => `${at} swallows or renames a Git failure instead of reading native state`),
  ...hits(hubSource.filter(path => rel(path).startsWith('apps/hub/src/builder/') && rel(path) !== 'apps/hub/src/builder/run-context.ts'), /getRaw\(\s*(?:RUN_ID_KEY|RUN_ACCOUNT_ID_KEY|CONVERSATION_ID_KEY|['"`]conexusBuilder(?:Run|Account|Conversation)Id['"`])|safeParse\([^)]*getRaw\(/).map(at => `${at} reads run authority outside run-context`),
]
for (const message of refused) console.error(message)
process.exitCode = refused.length ? 1 : 0
