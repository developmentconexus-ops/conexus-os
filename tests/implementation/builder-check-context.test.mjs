import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { placeBundle } from './check-bundle-vm.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { checkContextOf } = await import(hubModuleUrl('builder/check/context.js'))
const { AGENT_HOME, AGENT_IDENTITY, AGENT_USER } = await import(hubModuleUrl('builder/check/agent.js'))

const command = (caller, agent = AGENT_IDENTITY) => ({ kind: 'CHECK', caller, root: '/r', out: '/o', thumbnail: null, templateRef: 'tpl:1', agent, limits: {} })
const host = (uid, home) => ({ mainPath: import.meta.filename, uid, home, path: undefined })

test('the agent is defined once: user, home and numeric identity', () => {
  assert.deepEqual([AGENT_USER, AGENT_HOME, AGENT_IDENTITY], ['conexus-agent', '/home/conexus-agent', { uid: 1500, gid: 1500 }])
})

test('the gate is root and drops every child to the agent; the tool is the agent and drops nothing', () => {
  const gate = checkContextOf(command('gate'), host(0, '/root'))
  assert.deepEqual([gate.caller, gate.drop, gate.home], ['gate', AGENT_IDENTITY, AGENT_HOME])
  const tool = checkContextOf(command('tool'), host(1500, '/home/conexus-agent'))
  assert.deepEqual([tool.caller, tool.drop, tool.home], ['tool', null, '/home/conexus-agent'])
})

test('a caller that does not match the user it runs as is refused with its code, never run uncached', () => {
  const refused = /CHECK_CALLER_REFUSED: /
  assert.throws(() => checkContextOf(command('gate'), host(1500, '/home/conexus-agent')), refused)
  assert.throws(() => checkContextOf(command('gate', { uid: 0, gid: 0 }), host(0, '/root')), refused)
  assert.throws(() => checkContextOf(command('tool'), host(0, '/root')), refused)
  assert.throws(() => checkContextOf(command('tool'), host(1000, '/home/other')), refused)
})

test('the bundle run as a gate by a user that is not root exits 3 with the refusal and prints no report', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'check-caller-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const main = placeBundle(join(scratch, 'opt'))
  const ran = spawnSync(process.execPath, [main, 'check', '--caller', 'gate', '--root', join(scratch, 'r'), '--out', join(scratch, 'o'), '--template-ref', 'tpl:1', '--as', `${process.getuid() + 1}:${process.getgid()}`], { encoding: 'utf8' })
  assert.deepEqual([ran.status, ran.stdout], [3, ''])
  assert.match(ran.stderr, /^check setup failed: CHECK_CALLER_REFUSED: the gate runs as root/)
})
