import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { ensureCompilerRoot } from './compiler-root.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { writeGeneratedFailures } from './app-workspace.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const compilerRoot = await ensureCompilerRoot()
const { typescriptProjects } = await import(join(compilerRoot, 'tsconfig.mjs'))
const { generateClient, API_GEN_PATH } = await import(join(compilerRoot, 'generate-client.mjs'))
const { fixedApplicationStarterFiles } = await import(hubModuleUrl('builder/application-starter.js'))

const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const operation = (input, output) => ({ handler: 'handlers/tickets.ts', export: 'handle', input, output })
const status = { type: 'string', enum: ['open', 'in_progress', 'waiting', 'done'] }
const ticketRow = object({ id: { type: 'integer' }, subject: { type: 'string' }, status, requesterName: { type: 'string' }, openedAt: { type: 'string' } })
const historyEntry = object({ id: { type: 'integer' }, status, note: { type: 'string' }, byName: { type: 'string' }, at: { type: 'string' } })

// The operations the reference pages call, as a Project's manifest would declare them.
const MANIFEST = {
  operations: {
    listTickets: operation(
      object({ status, search: { type: 'string', maxLength: 80 } }, []),
      { type: 'array', maxItems: 500, items: ticketRow },
    ),
    countTickets: operation(
      object({ search: { type: 'string', maxLength: 80 } }, []),
      { type: 'array', maxItems: 10, items: object({ status, total: { type: 'integer' } }) },
    ),
    getTicket: operation(
      object({ id: { type: 'integer', minimum: 1 } }),
      object({
        ticket: object({
          id: { type: 'integer' }, subject: { type: 'string' }, description: { type: 'string' }, status,
          requesterName: { type: 'string' }, openedAt: { type: 'string' }, history: { type: 'array', maxItems: 200, items: historyEntry },
        }),
      }, []),
    ),
    changeTicketStatus: operation(
      object({ id: { type: 'integer', minimum: 1 }, status, note: { type: 'string', maxLength: 500 } }),
      object({ id: { type: 'integer' } }),
    ),
    createTicket: operation(
      object({ subject: { type: 'string', minLength: 1, maxLength: 120 }, description: { type: 'string', maxLength: 2000 }, priority: { type: 'string', enum: ['low', 'normal', 'high'] } }),
      object({ id: { type: 'integer' } }),
    ),
    ticketSummary: operation(
      object({}),
      object({ open: { type: 'integer' }, waiting: { type: 'integer' }, resolvedLastWeek: { type: 'integer' } }),
    ),
    ticketsByWeek: operation(
      object({ weeks: { type: 'integer', minimum: 1, maximum: 52 } }),
      { type: 'array', maxItems: 52, items: object({ week: { type: 'string' }, total: { type: 'integer' } }) },
    ),
  },
}

// Where a Project puts each reference page, as the conexus-app skill tells the Builder to.
const REFERENCES = 'builder-skills/conexus-app/references'
const PLACEMENT = {
  [`${REFERENCES}/shell.tsx`]: 'app/src/router.tsx',
  [`${REFERENCES}/ticket-status.tsx`]: 'app/src/components/ticket-status.tsx',
  [`${REFERENCES}/list.tsx`]: 'app/src/routes/tickets.tsx',
  [`${REFERENCES}/record.tsx`]: 'app/src/routes/ticket.tsx',
  [`${REFERENCES}/form.tsx`]: 'app/src/routes/new-ticket.tsx',
  [`${REFERENCES}/dashboard.tsx`]: 'app/src/routes/dashboard.lazy.tsx',
}

const typecheck = (extraFiles = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-skill-examples-'))
  try {
    for (const { path, content } of fixedApplicationStarterFiles(repositoryRoot)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    writeGeneratedFailures(root)
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

test('every conexus-app reference page typechecks against the starter components, the generated client and the compiler app project', () => {
  assert.deepEqual(typecheck(), { status: 0, output: '' })
})

test('the guard bites: a page that calls an operation the manifest does not declare fails the same typecheck', () => {
  const screen = readFileSync(resolve(repositoryRoot, REFERENCES, 'list.tsx'), 'utf8')
  const result = typecheck({ 'app/src/routes/tickets.tsx': screen.replace('api.listTickets(listInput)', 'api.listTicketz(listInput)') })
  assert.equal(result.status, 2)
  assert.match(result.output, /^app\/src\/routes\/tickets\.tsx\(\d+,\d+\): error TS2551: Property 'listTicketz' does not exist/m)
})

test('every file in the conexus-app references is placed and typechecked', () => {
  assert.deepEqual(readdirSync(resolve(repositoryRoot, REFERENCES)).sort(), Object.keys(PLACEMENT).map((path) => path.slice(REFERENCES.length + 1)).sort())
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
    writeFileSync(join(root, 'conexus/handlers/tickets.ts'), edit(handler))
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
  const result = typecheckServerExample((handler) => handler.replace('return { id: rows[0]?.id }', 'return { id: rows[0]?.id, tickets: [] }'))
  assert.equal(result.status, 2)
  assert.match(result.output, /^conexus\/handlers\/tickets\.ts\(\d+,\d+\): error TS2353: Object literal may only specify known properties, and 'tickets' does not exist/m)
})
