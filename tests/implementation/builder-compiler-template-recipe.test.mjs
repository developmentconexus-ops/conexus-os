import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const recipe = resolve(root, 'apps/hub/compiler-template')
const read = (name) => readFileSync(resolve(recipe, name), 'utf8')
const runtime = read('../src/builder/application-artifact-runtime.ts')
const manifest = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const viteConfig = (await import(pathToFileURL(resolve(recipe, 'vite.config.mjs')).href)).default

test('the template recipe carries every committed compiler file verbatim and installs from the lockfile', async () => {
  const { BUILDER_TEMPLATE_COMPILER_FILES, BUILDER_TEMPLATE_COMPILER_ROOT, checkBuilderTemplate } =
    await import('../../scripts/builder-e2b-template.mjs')
  const { recipe } = await checkBuilderTemplate()
  for (const name of BUILDER_TEMPLATE_COMPILER_FILES) {
    // The recipe is JSON, so the file's own text is what survives JSON encoding of the step.
    assert.equal(recipe.includes(JSON.stringify(read(name)).slice(1, -1)), true, `${name} is missing from the recipe`)
    assert.equal(recipe.includes(`${BUILDER_TEMPLATE_COMPILER_ROOT}/${name}`), true, `${name} is never written`)
  }
  assert.match(recipe, /npm ci /)
  assert.equal(recipe.includes('npm install'), false)
})

test('the committed vite config builds the directories the compile step writes and reads', () => {
  assert.equal(viteConfig.root, '/workspace/app')
  assert.equal(viteConfig.build.outDir, '/workspace/dist')
  assert.match(runtime, /const APP_ROOT = '\/workspace\/app'/)
  assert.match(runtime, /const DIST_ROOT = '\/workspace\/dist'/)
})

test('the vite root follows CONEXUS_COMPILE_ROOT, so the agent sandbox can build its own checkout', async () => {
  process.env.CONEXUS_COMPILE_ROOT = '/workspace/repo/app'
  try {
    const reloaded = (await import(`${pathToFileURL(resolve(recipe, 'vite.config.mjs')).href}?override`)).default
    assert.equal(reloaded.root, '/workspace/repo/app')
    assert.equal(reloaded.build.outDir, '/workspace/dist')
  } finally {
    delete process.env.CONEXUS_COMPILE_ROOT
  }
})

test('the compile command runs the vite this manifest installs, from where the template puts it', () => {
  assert.match(runtime, /node \/opt\/conexus\/compiler\/node_modules\/vite\/bin\/vite\.js build --config \/opt\/conexus\/compiler\/vite\.config\.mjs/)
  assert.match(runtime, /ln -s \/opt\/conexus\/compiler\/node_modules \/workspace\/app\/node_modules/)
  assert.equal(typeof manifest.dependencies.vite, 'string')
})

test('every dependency is pinned to one version, so a rebuild reproduces the pinned template', () => {
  for (const [name, range] of Object.entries(manifest.dependencies)) {
    assert.match(range, /^\d+\.\d+\.\d+$/, `${name} must be an exact version`)
  }
  assert.equal(lock.lockfileVersion >= 3, true)
  assert.equal(lock.packages['']?.dependencies?.vite, manifest.dependencies.vite)
})

test('the node the compiler installs for is the node the agent template pins', () => {
  const template = read('../../../scripts/builder-e2b-template.mjs')
  const pinned = template.match(/BUILDER_TEMPLATE_NODE_VERSION = '([^']+)'/)?.[1]
  assert.equal(manifest.engines.node, pinned)
})

test('the application the starter writes only needs what the manifest installs', () => {
  const starter = read('../src/builder/application-starter.ts')
  // Everything from this declaration on is the application's own source, not the module's imports.
  const appSource = starter.slice(starter.indexOf('FIXED_APPLICATION_STARTER_FILES'))
  const imported = [...appSource.matchAll(/^import .*? from '([^'.][^']*)'$/gm)].map(([, name]) => name)
  assert.equal(imported.length > 0, true)
  for (const name of imported) {
    const owner = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]
    assert.equal(Object.hasOwn(manifest.dependencies, owner), true, `the starter imports ${owner}, which the compiler manifest does not install`)
  }
})
