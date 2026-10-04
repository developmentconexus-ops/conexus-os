import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { installCheck, checkEntryPath } = await import(hubModuleUrl('builder/check-delivery.js'))

const bundleOf = (text) => ({ sha256: createHash('sha256').update(text).digest('hex'), bytes: new Uint8Array(Buffer.from(text)) })

// A VM folder where /opt/conexus is a real directory, and root's script runs as the test user.
const vmFor = (t, { corrupt = false } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-delivery-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const local = (text) => text.replaceAll('/opt/conexus', join(dir, 'opt/conexus'))
  const writes = []
  const vm = {
    // Each script is its own process, so installs started together really run together.
    asRoot: (script) => new Promise((resolve) => {
      execFile('sh', ['-c', local(script)], { encoding: 'utf8' }, (error, _stdout, stderr) => resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stderr }))
    }),
    writeRootFile: async (path, bytes) => {
      writes.push(path)
      mkdirSync(dirname(local(path)), { recursive: true })
      writeFileSync(local(path), corrupt ? Buffer.from('tampered') : bytes)
    },
  }
  return { vm, writes, folder: join(dir, 'opt/conexus/check') }
}

test('a new VM gets the bundle in the directory of its hash, read only', async (t) => {
  const first = bundleOf('console.log("one")')
  const { vm, folder } = vmFor(t)
  await installCheck(vm, first)
  const placed = join(folder, first.sha256, 'main.mjs')
  assert.equal(readFileSync(placed, 'utf8'), 'console.log("one")')
  assert.equal(statSync(placed).mode & 0o777, 0o444)
  assert.deepEqual(readdirSync(folder), [first.sha256])
  assert.equal(checkEntryPath(first.sha256), `/opt/conexus/check/${first.sha256}/main.mjs`)
})

test('a second run on the same VM writes nothing', async (t) => {
  const first = bundleOf('console.log("one")')
  const { vm, writes } = vmFor(t)
  await installCheck(vm, first)
  await installCheck(vm, first)
  assert.equal(writes.length, 1)
})

test('another bundle lands beside the first, and the first is not touched', async (t) => {
  const first = bundleOf('console.log("one")')
  const second = bundleOf('console.log("two")')
  const { vm, folder } = vmFor(t)
  await installCheck(vm, first)
  await installCheck(vm, second)
  assert.deepEqual(readdirSync(folder).sort(), [first.sha256, second.sha256].sort())
  assert.equal(readFileSync(join(folder, first.sha256, 'main.mjs'), 'utf8'), 'console.log("one")')
})

test('two installs of the same bundle at once both succeed and leave one directory', async (t) => {
  const bundle = bundleOf('console.log("one")')
  const { vm, folder, writes } = vmFor(t)
  await Promise.all(Array.from({ length: 6 }, () => installCheck(vm, bundle)))
  assert.equal(writes.length, 6, 'all six found the bundle missing and raced to rename their staging folder')
  assert.deepEqual(readdirSync(folder), [bundle.sha256])
})

test('a staging file whose bytes are not the bundle is refused and removed', async (t) => {
  const { vm, folder } = vmFor(t, { corrupt: true })
  await assert.rejects(installCheck(vm, bundleOf('console.log("one")')), /BUILDER_CHECK_INSTALL_REFUSED/)
  assert.deepEqual(readdirSync(folder), [])
})
