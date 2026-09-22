import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/working-source-build-'))
const compiled = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/builder/runtime.ts'),
  `--outdir=${buildRoot}`, `--outbase=${resolve(repositoryRoot, 'apps/hub/src')}`,
  '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { admitApplicationTree } = await import(pathToFileURL(resolve(buildRoot, 'builder/runtime.js')).href)

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

test('the application tree the sandbox compiles is held to the compile input limits', () => {
  const entry = (size, path, mode = '100644') => `${mode} blob ${'a'.repeat(40)} ${String(size).padStart(7)}\t${path}`
  const ok = [entry(120, 'app/index.html'), entry(80, 'app/src/main.tsx')].join('\n')
  assert.deepEqual(admitApplicationTree(ok), ['app/index.html', 'app/src/main.tsx'])
  assert.deepEqual(admitApplicationTree(`${ok}\n`), ['app/index.html', 'app/src/main.tsx'])

  const refuses = (listing, because) =>
    assert.throws(() => admitApplicationTree(listing), /BUILDER_APPLICATION_SOURCE_REFUSED/, because)

  refuses(entry(10, 'app/main.tsx'), 'no entry point')
  refuses([entry(10, 'app/index.html'), entry(10, 'app/index.html')].join('\n'), 'a duplicate path')
  refuses([entry(10, 'app/index.html'), entry(1024 * 1024 + 1, 'app/big.js')].join('\n'), 'one file over 1 MiB')
  refuses([entry(10, 'app/index.html'), ...Array.from({ length: 12 }, (_, index) => entry(1024 * 1024, `app/f${index}.js`))].join('\n'), 'over 12 MiB in total')
  refuses([entry(10, 'app/index.html'), ...Array.from({ length: 256 }, (_, index) => entry(1, `app/f${index}.js`))].join('\n'), 'over 256 paths')
  refuses([entry(10, 'app/index.html'), entry(10, 'app/link', '120000')].join('\n'), 'a symlink, which is not a blob mode this accepts')
  refuses('not a tree listing at all', 'output that is not a listing')
})
