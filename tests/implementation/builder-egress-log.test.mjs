import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { aggregateEgress, readJsonl, collectEgress, ensureEgressLog, MAX_EGRESS_LINES } = await import(hubModuleUrl('builder/egress-log.js'))

const bytes = (rows) => Buffer.from(rows.map((row) => `${typeof row === 'string' ? row : JSON.stringify(row)}\n`).join(''))

test('egress aggregation names addresses by what the agent resolved and counts sightings per host and port', () => {
  const records = aggregateEgress(
    [{ t: 1000, name: 'registry.npmjs.org', ips: ['104.16.0.1'] }, { t: 2000, name: 'cdn.example.com', ips: ['104.16.0.1'] }],
    [
      { t: 3000, ip: '104.16.0.1', port: 443 },
      { t: 2500, ip: '104.16.0.1', port: 443 },
      { t: 4000, ip: '203.0.113.9', port: 8080 },
      { t: 4000, ip: '2001:db8::1', port: 443 },
      { t: 5000, ip: '127.0.0.1', port: 53 },
      { t: 5000, ip: '8.8.8.8', port: 53 },
    ],
  )
  assert.deepEqual(records, [
    { host: 'cdn.example.com', port: 443, protocol: 'tcp', firstSeen: new Date(2500).toISOString(), count: 2 },
    { host: '[2001:db8::1]', port: 443, protocol: 'tcp', firstSeen: new Date(4000).toISOString(), count: 1 },
    { host: '203.0.113.9', port: 8080, protocol: 'tcp', firstSeen: new Date(4000).toISOString(), count: 1 },
  ])
})

test('egress aggregation drops malformed rows and never carries anything beyond host, port, protocol, first-seen and count', () => {
  const records = aggregateEgress(
    [{ t: 1, name: 'bad host/with?query=1', ips: ['10.0.0.1'] }, null, 'x', { t: 1, name: 'ok.example', ips: [42, '10.0.0.2'], path: '/secret' }],
    [{ t: 2, ip: '10.0.0.1', port: 443 }, { t: 2, ip: '10.0.0.2', port: 99999 }, { t: 2, ip: '10.0.0.2', port: 443, payload: 'x' }, { ip: '10.0.0.3', port: 1 }],
  )
  assert.deepEqual(records, [
    { host: '10.0.0.1', port: 443, protocol: 'tcp', firstSeen: new Date(2).toISOString(), count: 1 },
    { host: 'ok.example', port: 443, protocol: 'tcp', firstSeen: new Date(2).toISOString(), count: 1 },
  ])
})

test('reading a log resumes from the byte offset, leaves a half-written line for the next read, and restarts on a shrunken file', () => {
  const first = readJsonl(Buffer.from('{"a":1}\n{"a":2}\n{"a":'), 0)
  assert.deepEqual(first.rows, [{ a: 1 }, { a: 2 }])
  assert.equal(first.offset, Buffer.byteLength('{"a":1}\n{"a":2}\n'))
  const next = readJsonl(Buffer.from('{"a":1}\n{"a":2}\n{"a":3}\nnot json\n'), first.offset)
  assert.deepEqual(next.rows, [{ a: 3 }])
  assert.deepEqual(readJsonl(Buffer.from('{"a":9}\n'), 9_999).rows, [{ a: 9 }])
})

const ports = (overrides = {}) => {
  const files = new Map()
  const lines = []
  return {
    files,
    lines,
    ports: {
      asRoot: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      writeRootFile: async (path, content) => { files.set(path, Buffer.from(content)) },
      readAgentFile: async (path) => { if (!files.has(path)) throw new Error('ENOENT'); return files.get(path) },
      log: (line) => lines.push(line),
      executionId: 'run-1',
      conversationId: 'conv-1',
      ...overrides,
    },
  }
}

test('a turn logs each destination once and the next turn logs only what happened since', async () => {
  const held = ports()
  held.files.set('/var/log/conexus-egress/dns.jsonl', bytes([{ t: 1000, name: 'a.example', ips: ['10.0.0.1'] }]))
  held.files.set('/var/log/conexus-egress/tcp.jsonl', bytes([{ t: 2000, ip: '10.0.0.1', port: 443 }]))
  await collectEgress(held.ports)
  assert.deepEqual(held.lines, [
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:a.example:443:tcp:${new Date(2000).toISOString()}:1`,
    'BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:partial:1',
  ])
  held.lines.length = 0
  held.files.set('/var/log/conexus-egress/tcp.jsonl', Buffer.concat([held.files.get('/var/log/conexus-egress/tcp.jsonl'), bytes([{ t: 3000, ip: '10.0.0.1', port: 443 }])]))
  await collectEgress(held.ports)
  assert.deepEqual(held.lines, [
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:10.0.0.1:443:tcp:${new Date(3000).toISOString()}:1`,
    'BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:complete:1',
  ])
})

test('a collection that fails or hangs is logged, never thrown, and never waits past its timeout', async () => {
  const failing = ports({ asRoot: async () => ({ exitCode: 1, stdout: '', stderr: 'no' }) })
  await collectEgress(failing.ports)
  assert.match(failing.lines[0], /^BUILDER_SANDBOX_EGRESS_COLLECT_FAILED:run-1:BUILDER_SANDBOX_EGRESS_POLL_FAILED/)
  assert.equal(failing.lines[1], 'BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:failed:0')
  const hanging = ports({ asRoot: () => new Promise(() => {}), timeoutMs: 20 })
  await collectEgress(hanging.ports)
  assert.match(hanging.lines[0], /^BUILDER_SANDBOX_EGRESS_COLLECT_FAILED:run-1:BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT/)
  assert.equal(hanging.lines[1], 'BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:failed:0')
})

test('a very long destination list is capped and the summary says it is partial', async () => {
  const held = ports()
  const rows = Array.from({ length: MAX_EGRESS_LINES + 5 }, (_, i) => ({ t: 1000 + i, ip: `10.1.${Math.floor(i / 250)}.${i % 250}`, port: 443 }))
  held.files.set('/var/log/conexus-egress/tcp.jsonl', bytes(rows))
  held.files.set('/var/log/conexus-egress/dns.jsonl', bytes([]))
  await collectEgress(held.ports)
  assert.equal(held.lines.filter((line) => line.startsWith('BUILDER_SANDBOX_EGRESS:')).length, MAX_EGRESS_LINES)
  assert.equal(held.lines.at(-1), `BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:partial:${MAX_EGRESS_LINES}`)
})

test('starting the recorders is skipped when they run and throws when they will not start', async () => {
  const running = ports()
  await ensureEgressLog(running.ports)
  assert.equal(running.files.size, 0)
  const broken = ports({ asRoot: async () => ({ exitCode: 1, stdout: '', stderr: 'boom' }) })
  await assert.rejects(ensureEgressLog(broken.ports), /BUILDER_SANDBOX_EGRESS_START_FAILED/)
})
