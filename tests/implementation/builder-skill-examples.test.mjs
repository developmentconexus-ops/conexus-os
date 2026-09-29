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
const operation = (input, output) => ({ handler: 'handlers/orders.ts', export: 'handle', input, output })

// The operations the examples call, as a Project's manifest would declare them.
const MANIFEST = {
  operations: {
    listOrders: operation(
      object({ search: { type: 'string', maxLength: 80 } }, []),
      { type: 'array', items: object({ customer: { type: 'string' }, status: { type: 'string' }, total: { type: 'number' }, createdAt: { type: 'string' } }) },
    ),
    createOrder: operation(
      object({ customer: { type: 'string', minLength: 1, maxLength: 80 }, total: { type: 'number', minimum: 0 } }),
      object({ id: { type: 'string' } }),
    ),
    salesByMonth: operation(
      object({ year: { type: 'integer', minimum: 2000, maximum: 2100 } }),
      { type: 'array', items: object({ month: { type: 'string' }, total: { type: 'number' } }) },
    ),
  },
}

// Where a Project puts each example, as the two skills tell the Builder to.
const PLACEMENT = {
  'builder-skills/conexus-app-code/references/errors.ts': 'app/src/lib/errors.ts',
  'builder-skills/conexus-app-code/references/format.ts': 'app/src/lib/format.ts',
  'builder-skills/conexus-app-code/references/order-form.tsx': 'app/src/routes/order-form.tsx',
  'builder-skills/conexus-app-code/references/orders-screen.tsx': 'app/src/routes/orders-screen.tsx',
  'builder-skills/conexus-app-code/references/orders-table.tsx': 'app/src/routes/orders-table.tsx',
  'builder-skills/conexus-app-code/references/router.tsx': 'app/src/router.tsx',
  'builder-skills/conexus-app-ui/references/sales-chart.tsx': 'app/src/routes/sales.lazy.tsx',
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
  const screen = readFileSync(resolve(repositoryRoot, 'builder-skills/conexus-app-code/references/orders-screen.tsx'), 'utf8')
  const result = typecheck({ 'app/src/routes/orders-screen.tsx': screen.replace('api.listOrders(input)', 'api.listOrdrs(input)') })
  assert.equal(result.status, 2)
  assert.match(result.output, /^app\/src\/routes\/orders-screen\.tsx\(\d+,\d+\): error TS2551: Property 'listOrdrs' does not exist/m)
})
