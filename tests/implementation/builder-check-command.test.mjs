import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { parseCommand } = await import(hubModuleUrl('builder/check/command.js'))

const CHECK = ['check', '--caller', 'gate', '--root', '/var/lib/conexus-build/run', '--out', '/var/lib/conexus-build/run.dist', '--template-ref', 'tpl:1', '--as', '1500:1500']
const DEFAULT_LIMITS = { typecheck: 60_000, build: 60_000, server: 60_000, boot: 45_000 }

test('the check command is parsed into its caller, its places, the template and the identity the steps run as', () => {
  assert.deepEqual(parseCommand(CHECK), {
    kind: 'CHECK', caller: 'gate', root: '/var/lib/conexus-build/run', out: '/var/lib/conexus-build/run.dist', thumbnail: null, templateRef: 'tpl:1', agent: { uid: 1500, gid: 1500 }, limits: DEFAULT_LIMITS,
  })
  assert.deepEqual(parseCommand([...CHECK.slice(0, 2), 'tool', ...CHECK.slice(3), '--thumbnail', '/var/lib/conexus-build/run.png']).thumbnail, '/var/lib/conexus-build/run.png')
})

test('a limit can only shorten a step, and only a step that has one', () => {
  assert.deepEqual(parseCommand([...CHECK, '--limit', 'boot=5000', '--limit', 'build=90000']).limits, { ...DEFAULT_LIMITS, boot: 5_000 })
  for (const limit of ['generate=10', 'typecheck=0', 'typecheck=1.5', 'typecheck', 'deploy=5']) assert.equal(parseCommand([...CHECK, '--limit', limit]), null, limit)
})

test('the check accepts no option that no caller of the Hub uses', () => {
  for (const extra of [['--manifest', '/tmp/m.json'], ['--cache', '/tmp/c'], ['--tools', '/opt'], ['--home', '/root'], ['--chromium', '/usr/bin/chromium'], ['--facts']]) {
    assert.equal(parseCommand([...CHECK, ...extra]), null, extra.join(' '))
  }
})

test('every required part is required: no template ref from the environment, no caller, no identity', () => {
  assert.equal(parseCommand(CHECK.filter((_, index) => index !== 7 && index !== 8)), null)
  assert.equal(parseCommand(CHECK.filter((_, index) => index !== 1 && index !== 2)), null)
  assert.equal(parseCommand(CHECK.filter((_, index) => index !== 9 && index !== 10)), null)
  assert.equal(parseCommand(CHECK.map((part) => (part === 'gate' ? 'root' : part))), null)
  for (const identity of ['1500', '1500:', ':1500', 'a:b', '1500:1500:1']) assert.equal(parseCommand(CHECK.map((part) => (part === '1500:1500' ? identity : part))), null, identity)
})

test('the server half and the workers take only a checkout and an output folder', () => {
  assert.deepEqual(parseCommand(['server', '--root', '/w/repo', '--out', '/tmp/out']), { kind: 'SERVER', root: '/w/repo', out: '/tmp/out' })
  assert.deepEqual(parseCommand(['worker', 'boot', '--root', '/w/repo', '--out', '/tmp/out']), { kind: 'WORKER', worker: 'boot', root: '/w/repo', out: '/tmp/out' })
  assert.equal(parseCommand(['worker', 'generate', '--root', '/w/repo', '--out', '/tmp/out']), null)
  assert.equal(parseCommand(['server', '--root', '/w/repo', '--out', '/tmp/out', '--caller', 'gate']), null)
  assert.equal(parseCommand(['server', '--root', '/w/repo']), null)
  assert.equal(parseCommand(['deploy', '--root', '/w/repo', '--out', '/tmp/out']), null)
  assert.equal(parseCommand([]), null)
})
