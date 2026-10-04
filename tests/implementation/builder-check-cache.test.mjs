import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { cacheDirectory, withGateCache, withToolCache } = await import(hubModuleUrl('builder/check/cache.js'))

const scratchOf = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-cache-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
const SHA = 'a'.repeat(64)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const me = { uid: process.getuid(), gid: process.getgid() }

test('a cache is keyed by bundle hash, caller and project, and the gate and the tool never share a folder', () => {
  const keys = [
    cacheDirectory({ caller: 'gate', checkSha256: SHA, home: '/home/conexus-agent' }, 'app'),
    cacheDirectory({ caller: 'gate', checkSha256: SHA, home: '/home/conexus-agent' }, 'server'),
    cacheDirectory({ caller: 'tool', checkSha256: SHA, home: '/home/conexus-agent' }, 'app'),
    cacheDirectory({ caller: 'tool', checkSha256: SHA, home: '/home/conexus-agent' }, 'server'),
    cacheDirectory({ caller: 'tool', checkSha256: 'b'.repeat(64), home: '/home/conexus-agent' }, 'app'),
  ]
  assert.deepEqual(keys, [
    `/var/lib/conexus-check-cache/${SHA}/gate/app`,
    `/var/lib/conexus-check-cache/${SHA}/gate/server`,
    `/home/conexus-agent/.conexus-check-cache/${SHA}/tool/app`,
    `/home/conexus-agent/.conexus-check-cache/${SHA}/tool/server`,
    `/home/conexus-agent/.conexus-check-cache/${'b'.repeat(64)}/tool/app`,
  ])
})

test('a lock left by a process that is gone is taken over, and the check runs with the cache', async (t) => {
  const directory = join(scratchOf(t), 'tool', 'app')
  mkdirSync(join(directory, '..'), { recursive: true })
  writeFileSync(`${directory}.lock`, '2147483646')
  const seen = []
  await withToolCache(directory, async (info) => { seen.push(info) })
  assert.deepEqual(seen, [join(directory, 'tsbuildinfo')])
  assert.equal(existsSync(`${directory}.lock`), false, 'the lock is released')
})

test('the tool cache hands tsc a build info path in its folder and serializes two checks of one key', async (t) => {
  const directory = join(scratchOf(t), 'tool', 'app')
  const seen = []
  const events = []
  const check = (name, ms) => withToolCache(directory, async (info) => {
    seen.push(info)
    events.push(`${name} in`)
    await wait(ms)
    events.push(`${name} out`)
    return name
  })
  assert.deepEqual(await Promise.all([check('one', 200), check('two', 10)]), ['one', 'two'])
  assert.deepEqual(events, ['one in', 'one out', 'two in', 'two out'])
  assert.deepEqual(seen, [join(directory, 'tsbuildinfo'), join(directory, 'tsbuildinfo')])
})

const gateInput = (t) => {
  const dir = scratchOf(t)
  const swept = []
  return { store: join(dir, 'store'), agent: me, sweep: () => swept.push('sweep'), swept, dir }
}

test('the gate lends a copy of its store to tsc between two sweeps and stores the result back, root only', async (t) => {
  const input = gateInput(t)
  mkdirSync(input.store, { recursive: true })
  writeFileSync(join(input.store, 'tsbuildinfo'), 'old')
  const order = []
  let lent
  const result = await withGateCache({ ...input, sweep: () => order.push('sweep') }, async (info) => {
    order.push('run')
    lent = info
    assert.equal(readFileSync(info, 'utf8'), 'old', 'tsc starts from the stored copy')
    assert.equal(statSync(join(info, '..')).mode & 0o777, 0o700)
    assert.equal(statSync(join(info, '..')).uid, me.uid)
    writeFileSync(info, 'new')
    return 'checked'
  })
  assert.equal(result, 'checked')
  assert.deepEqual(order, ['sweep', 'run', 'sweep'])
  assert.equal(readFileSync(join(input.store, 'tsbuildinfo'), 'utf8'), 'new')
  assert.equal(statSync(join(input.store, 'tsbuildinfo')).mode & 0o777, 0o600)
  assert.equal(existsSync(join(lent, '..')), false, 'the lent folder is removed')
  assert.deepEqual(readdirSync(input.store), ['tsbuildinfo'])
  assert.equal(existsSync(`${input.store}.lock`), false, 'the lock is released')
})

test('a build info the agent forged in its own tree or home never reaches the store, and a symlink in the lent folder is not followed', async (t) => {
  const input = gateInput(t)
  mkdirSync(input.store, { recursive: true })
  writeFileSync(join(input.store, 'tsbuildinfo'), 'trusted')
  const secret = join(input.dir, 'secret')
  writeFileSync(secret, 'root only content')
  await withGateCache(input, async (info) => {
    rmSync(info)
    symlinkSync(secret, info)
    assert.equal(lstatSync(info).isSymbolicLink(), true)
  })
  assert.equal(readFileSync(join(input.store, 'tsbuildinfo'), 'utf8'), 'trusted', 'the symlink was refused, the store kept its own')
  assert.equal(readFileSync(secret, 'utf8'), 'root only content')
})

test('a first gate check has no stored copy to lend and stores the one tsc writes', async (t) => {
  const input = gateInput(t)
  await withGateCache(input, async (info) => {
    assert.equal(existsSync(info), false)
    writeFileSync(info, 'first')
  })
  assert.equal(readFileSync(join(input.store, 'tsbuildinfo'), 'utf8'), 'first')
})

test('two gate checks of one key run one after the other, each ending the agent processes around tsc', async (t) => {
  const input = gateInput(t)
  const events = []
  const gate = (name, ms) => withGateCache({ ...input, sweep: () => events.push(`${name} sweep`) }, async () => {
    events.push(`${name} in`)
    await wait(ms)
    events.push(`${name} out`)
  })
  await Promise.all([gate('one', 200), gate('two', 10)])
  assert.deepEqual(events, ['one sweep', 'one in', 'one out', 'one sweep', 'two sweep', 'two in', 'two out', 'two sweep'])
})
