import fs from 'node:fs'
import path from 'node:path'

// A ratchet, not a contract: it records how far the Builder still is from the generated operation
// table and from typed problem handling, and lets that distance only shrink. Each pull request that
// closes a gap lowers a number in contracts/technical/wire-ratchet.json.
const root = process.env.CONEXUS_WIRE_RATCHET_ROOT ?? '.'
const ratchetFile = 'contracts/technical/wire-ratchet.json'

const sources = (directory, extensions) => fs.readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)) && !/\.test\./.test(entry.name))
  .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
const count = (texts, pattern) => texts.reduce((sum, text) => sum + (text.match(pattern) ?? []).length, 0)

// Routes the Hub registers for the Builder by hand: Fastify registrations, and the Mastra session
// routes the browser may call (the BROWSER_ROUTES set). The generated tables hold none of them.
const builderSources = sources('apps/hub/src/builder', ['.ts'])
const browserRoutes = builderSources.map((text) => /const BROWSER_ROUTES[^=]*= new Set\(\[([\s\S]*?)\]\)/.exec(text)?.[1]).find((body) => body !== undefined)
if (browserRoutes === undefined) throw new Error('BROWSER_ROUTES not found under apps/hub/src/builder; the ratchet does not understand its shape')
const measured = {
  offTableBuilderRoutes: count(builderSources, /\bapp\.(?:get|post|put|delete|patch)\b/g) + count([browserRoutes], /\b(?:sessionRoute|mastraRoute)\(/g),
  handComparedProblemTypes: count(sources('apps/web/src', ['.ts', '.tsx']), /urn:conexus:problem:[a-z0-9-]+/g),
}

const recorded = JSON.parse(fs.readFileSync(path.join(root, ratchetFile), 'utf8'))
const failures = Object.entries(measured).flatMap(([name, now]) => {
  const was = recorded[name]
  if (!Number.isInteger(was)) return [`${ratchetFile} has no integer ${name}`]
  if (now > was) return [`${name} rose from ${was} to ${now}: move the new route or problem type onto the generated contract instead of adding to the gap`]
  if (now < was) return [`${name} fell from ${was} to ${now}: lower it to ${now} in ${ratchetFile} so the gain cannot be spent again`]
  return []
})
if (failures.length > 0) throw new Error(failures.join('\n'))
console.log(`Wire ratchet OK: ${measured.offTableBuilderRoutes} Builder routes off the table, ${measured.handComparedProblemTypes} problem types compared by hand`)
