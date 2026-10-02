import fs from 'node:fs'
import path from 'node:path'

// A ratchet, not a contract: contracts/technical/wire-ratchet.json lists every Builder route that
// is not in the generated operation table and every problem type the web compares by hand. The
// list must match the code exactly. A new entry fails (a swap included), and so does an entry the
// code no longer has, so a pull request that closes a gap deletes its line.
const root = process.env.CONEXUS_WIRE_RATCHET_ROOT ?? '.'
const ratchetFile = 'contracts/technical/wire-ratchet.json'

const sources = (directory, extensions) => fs.readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)) && !/\.test\./.test(entry.name))
  .map((entry) => ({ name: entry.name, text: fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8') }))

const builderSources = sources('apps/hub/src/builder', ['.ts'])

// Fastify registrations: the file, the method and the path exactly as written.
const fastifyRoutes = builderSources.flatMap(({ name, text }) => [...text.matchAll(/\bapp\.(get|post|put|delete|patch)\b(?:<[\s\S]*?>)?\(\s*(['"`])([^'"`]*)\2/g)]
  .map(([, method, , url]) => `${name} ${method.toUpperCase()} ${url}`))

// Mastra session routes the browser may call: the entries of BROWSER_ROUTES, written either inline
// or through a named constant, resolved against the string constants of the same file.
const mastraFile = builderSources.find(({ text }) => /const BROWSER_ROUTES\b/.test(text))
if (!mastraFile) throw new Error('BROWSER_ROUTES not found under apps/hub/src/builder; the ratchet does not understand its shape')
const strings = new Map()
for (const [, name, quote, value] of mastraFile.text.matchAll(/^const (\w+) = (['`])([^'`]*)\2/gm)) {
  strings.set(name, value.replace(/\$\{(\w+)\}/g, (_, inner) => strings.get(inner) ?? `\${${inner}}`))
}
const literalOrConstant = (argument) => {
  const literal = /^(['"`])([^'"`]*)\1$/.exec(argument)
  return literal ? literal[2] : strings.get(argument)
}
const routeCall = /^(sessionRoute|mastraRoute)\(\s*'([A-Z]+)'\s*(?:,\s*([^)]+?))?\s*\)$/
const routeOf = (expression, label) => {
  const call = routeCall.exec(expression)
  if (!call) throw new Error(`${label}: cannot read ${expression}; the ratchet does not understand its shape`)
  const [, helper, method, argument] = call
  const suffix = argument === undefined ? '' : literalOrConstant(argument.trim())
  if (suffix === undefined) throw new Error(`${label}: cannot resolve ${argument}`)
  return `mastra ${method} ${helper === 'sessionRoute' ? `${strings.get('SESSION_BASE')}${suffix}` : suffix}`
}
const constants = new Map([...mastraFile.text.matchAll(/^const (\w+) = ((?:sessionRoute|mastraRoute)\([^\n]*\))\s*$/gm)].map(([, name, expression]) => [name, expression]))
const browserBody = /const BROWSER_ROUTES[^=]*= new Set\(\[([\s\S]*?)\]\)/.exec(mastraFile.text)?.[1]
if (browserBody === undefined) throw new Error('BROWSER_ROUTES has no Set literal; the ratchet does not understand its shape')
const browserRoutes = [...browserBody.matchAll(/^\s*((?:sessionRoute|mastraRoute)\([^\n]*\)|\w+),?\s*$/gm)]
  .map(([, entry]) => routeOf(constants.get(entry) ?? entry, `BROWSER_ROUTES ${entry}`))

const problemTypes = sources('apps/web/src', ['.ts', '.tsx']).flatMap(({ text }) => text.match(/urn:conexus:problem:[a-z0-9-]+/g) ?? [])

const measured = {
  builderRoutes: [...new Set([...fastifyRoutes, ...browserRoutes])].sort(),
  problemTypes: [...new Set(problemTypes)].sort(),
}

const recorded = JSON.parse(fs.readFileSync(path.join(root, ratchetFile), 'utf8'))
const failures = Object.entries(measured).flatMap(([list, now]) => {
  const was = recorded[list]
  if (!Array.isArray(was)) return [`${ratchetFile} has no list ${list}`]
  return [
    ...now.filter((entry) => !was.includes(entry)).map((entry) => `${list}: new gap ${entry}; put it on the generated contract instead of adding it to ${ratchetFile}`),
    ...was.filter((entry) => !now.includes(entry)).map((entry) => `${list}: ${entry} is no longer in the code; delete its line from ${ratchetFile}`),
  ]
})
if (failures.length > 0) throw new Error(failures.join('\n'))
console.log(`Wire ratchet OK: ${measured.builderRoutes.length} Builder routes off the table, ${measured.problemTypes.length} problem types compared by hand`)
