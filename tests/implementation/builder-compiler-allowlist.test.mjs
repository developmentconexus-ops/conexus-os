import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { ensureCompilerRoot } from './compiler-root.mjs'

const compilerRoot = await ensureCompilerRoot()
const { typescriptProjects } = await import(join(compilerRoot, 'tsconfig.mjs'))

const GOOD_APP = {
  'app/index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  'app/src/lib/format.ts': "export const money = (value: number): string => new Intl.NumberFormat('pt-BR').format(value)\n",
  'app/src/lib/extra.ts': 'export const extra: unknown = 1\n',
  'app/src/main.tsx': [
    "import { QueryClient } from '@tanstack/react-query'",
    "import { createRoot } from 'react-dom/client'",
    "import { z } from 'zod'",
    "import { extra } from '@/lib/extra'",
    "import { money } from '@/lib/format'",
    'const client = new QueryClient()',
    'const schema = z.object({ total: z.number() })',
    "createRoot(document.body).render(<p data-client={String(client !== null)} data-extra={String(extra)}>{money(schema.parse({ total: 1 }).total)}</p>)",
    '',
  ].join('\n'),
  'conexus/handlers/list.ts': "import { createHash } from 'node:crypto'\nexport const list = (): string => createHash('sha256').update('x').digest('hex')\n",
}

const checkout = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-allowlist-'))
  for (const [path, content] of Object.entries({ ...GOOD_APP, ...files })) {
    if (content === null) continue
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  symlinkSync(join(compilerRoot, 'node_modules'), join(root, 'app/node_modules'))
  return root
}

const typecheck = (root, project) => {
  const config = join(root, `tsconfig.${project}.json`)
  writeFileSync(config, JSON.stringify(typescriptProjects({ compilerRoot, root })[project]))
  const result = spawnSync(process.execPath, [join(compilerRoot, 'node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], { encoding: 'utf8', cwd: root })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const build = (root) => {
  const result = spawnSync(process.execPath, [
    join(compilerRoot, 'node_modules/vite/bin/vite.js'), 'build', '--config', join(compilerRoot, 'vite.config.mjs'),
    '--configLoader', 'native', '--outDir', join(root, 'dist'), '--emptyOutDir',
  ], { encoding: 'utf8', env: { ...process.env, CONEXUS_COMPILE_ROOT: join(root, 'app') } })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

test('an app that imports only the allowlist typechecks and builds', () => {
  const root = checkout({})
  try {
    assert.deepEqual(typecheck(root, 'app'), { status: 0, output: '' })
    assert.deepEqual(typecheck(root, 'server'), { status: 0, output: '' })
    assert.equal(build(root).status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a package that only an allowed package depends on is refused by build and by typecheck, naming it', () => {
  const root = checkout({ 'app/src/lib/extra.ts': "import { produce } from 'immer'\nexport const extra = produce\n" })
  try {
    const checked = typecheck(root, 'app')
    assert.equal(checked.status, 2)
    assert.match(checked.output, /^app\/src\/lib\/extra\.ts\(1,25\): error TS2307: Cannot find module 'immer' or its corresponding type declarations\.$/m)
    const built = build(root)
    assert.notEqual(built.status, 0)
    assert.match(built.output, /"immer" is not an allowed import: an app may import only @base-ui\/react, @hookform\/resolvers/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a screen cannot import node: modules or reach into the compiler packages, and a handler can import node: modules', () => {
  const root = checkout({ 'app/src/lib/extra.ts': "import { readFileSync } from 'node:fs'\nexport const extra = readFileSync\n" })
  try {
    assert.match(typecheck(root, 'app').output, /^app\/src\/lib\/extra\.ts\(1,30\): error TS2591: Cannot find name 'node:fs'/m)
    assert.match(build(root).output, /"node:fs" is not an allowed import: an app runs in the browser and has no node: modules/)
    assert.deepEqual(typecheck(root, 'server'), { status: 0, output: '' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  const reach = checkout({ 'app/src/lib/extra.ts': `import { produce } from '${join(compilerRoot, 'full/node_modules/immer/dist/immer.mjs')}'\nexport const extra = produce\n` })
  try {
    assert.match(build(reach).output, /reaches into the compiler's packages; import a package by its name/)
  } finally {
    rmSync(reach, { recursive: true, force: true })
  }
})

test('a handler that imports a package is refused by typecheck', () => {
  const root = checkout({ 'conexus/handlers/list.ts': "import { z } from 'zod'\nexport const list = z\n" })
  try {
    assert.match(typecheck(root, 'server').output, /^conexus\/handlers\/list\.ts\(1,19\): error TS2307: Cannot find module 'zod'/m)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
