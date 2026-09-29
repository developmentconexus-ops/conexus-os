import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { ensureCompilerRoot } from './compiler-root.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const compilerRoot = await ensureCompilerRoot()
const { typescriptProjects } = await import(join(compilerRoot, 'tsconfig.mjs'))
const { generateClient, API_GEN_PATH } = await import(join(compilerRoot, 'generate-client.mjs'))
const { fixedApplicationStarterFiles } = await import(hubModuleUrl('builder/application-starter.js'))

const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const operation = (input, output) => ({ handler: 'handlers/visits.ts', export: 'handle', input, output })

// The operations the examples call, as a Project's manifest would declare them.
const MANIFEST = {
  operations: {
    listVisits: operation(
      object({ search: { type: 'string', maxLength: 80 } }, []),
      { type: 'array', items: object({ customer: { type: 'string' }, status: { type: 'string' }, minutes: { type: 'number' }, scheduledAt: { type: 'string' } }) },
    ),
    createTicket: operation(
      object({ subject: { type: 'string', minLength: 1, maxLength: 80 }, affectedUsers: { type: 'integer', minimum: 0 } }),
      object({ id: { type: 'string' } }),
    ),
    ticketsByWeek: operation(
      object({ weeks: { type: 'integer', minimum: 1, maximum: 52 } }),
      { type: 'array', items: object({ week: { type: 'string' }, total: { type: 'number' } }) },
    ),
  },
}

// Where a Project puts each example, as the two skills tell the Builder to.
const PLACEMENT = {
  'builder-skills/conexus-app-code/references/ticket-form.tsx': 'app/src/routes/ticket-form.tsx',
  'builder-skills/conexus-app-code/references/visits-screen.tsx': 'app/src/routes/visits-screen.tsx',
  'builder-skills/conexus-app-code/references/visits-table.tsx': 'app/src/routes/visits-table.tsx',
  'builder-skills/conexus-app-code/references/router.tsx': 'app/src/router.tsx',
  'builder-skills/conexus-app-ui/references/tickets-chart.tsx': 'app/src/routes/tickets.lazy.tsx',
}

const typecheck = (extraFiles = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-skill-examples-'))
  try {
    for (const { path, content } of fixedApplicationStarterFiles(repositoryRoot)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    for (const [from, to] of Object.entries(PLACEMENT)) cpSync(resolve(repositoryRoot, from), join(root, to))
    for (const [path, content] of Object.entries(extraFiles)) writeFileSync(join(root, path), content)
    mkdirSync(join(root, dirname(API_GEN_PATH)), { recursive: true })
    writeFileSync(join(root, API_GEN_PATH), generateClient(MANIFEST).apiGen)
    symlinkSync(join(compilerRoot, 'node_modules'), join(root, 'app/node_modules'))
    const config = join(root, 'tsconfig.app.json')
    writeFileSync(config, JSON.stringify(typescriptProjects({ compilerRoot, root }).app))
    const result = spawnSync(process.execPath, [join(compilerRoot, 'node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], { encoding: 'utf8', cwd: root })
    return { status: result.status, output: `${result.stdout}${result.stderr}`.trim() }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('every skill example typechecks against the starter components, the generated client and the compiler app project', () => {
  assert.deepEqual(typecheck(), { status: 0, output: '' })
})

test('the guard bites: an example that calls an operation the manifest does not declare fails the same typecheck', () => {
  const screen = readFileSync(resolve(repositoryRoot, 'builder-skills/conexus-app-code/references/visits-screen.tsx'), 'utf8')
  const result = typecheck({ 'app/src/routes/visits-screen.tsx': screen.replace('api.listVisits(input)', 'api.listVisitz(input)') })
  assert.equal(result.status, 2)
  assert.match(result.output, /^app\/src\/routes\/visits-screen\.tsx\(\d+,\d+\): error TS2551: Property 'listVisitz' does not exist/m)
})

const serverGuide = () => readFileSync(resolve(repositoryRoot, 'builder-skills/conexus-server/SKILL.md'), 'utf8')

// The conexus-server handler example, checked as a Project's server half: its manifest, the types the
// check generates from it, and the handler file, under the compiler's server project.
const typecheckServerExample = (edit = (handler) => handler) => {
  const guide = serverGuide()
  const manifest = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(guide)[1])
  const handler = /```ts\n(import type \{ Input, Output \}[\s\S]*?)\n```/.exec(guide)[1]
  const root = mkdtempSync(join(tmpdir(), 'conexus-server-example-'))
  try {
    mkdirSync(join(root, 'conexus/handlers'), { recursive: true })
    writeFileSync(join(root, 'conexus/manifest.json'), JSON.stringify(manifest))
    writeFileSync(join(root, 'conexus/types.gen.ts'), generateClient(manifest).typesGen)
    writeFileSync(join(root, 'conexus/handlers/items.ts'), edit(handler))
    const config = join(root, 'tsconfig.server.json')
    writeFileSync(config, JSON.stringify(typescriptProjects({ compilerRoot, root }).server))
    const result = spawnSync(process.execPath, [join(compilerRoot, 'node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], { encoding: 'utf8', cwd: root })
    return { status: result.status, output: `${result.stdout}${result.stderr}`.trim() }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('the conexus-server handler example typechecks against the types its own manifest generates', () => {
  assert.deepEqual(typecheckServerExample(), { status: 0, output: '' })
})

test('the typed handler contract bites: returning a field the manifest does not declare fails the same typecheck', () => {
  const result = typecheckServerExample((handler) => handler.replace('return { id: rows[0].id }', 'return { id: rows[0].id, items: [] }'))
  assert.equal(result.status, 2)
  assert.match(result.output, /^conexus\/handlers\/items\.ts\(\d+,\d+\): error TS2353: Object literal may only specify known properties, and 'items' does not exist/m)
})
