import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hubModuleUrl } from './hub-build.mjs'

const { collectEgress, ensureEgressLog } = await import(hubModuleUrl('builder/egress-log.js'))

const bytes = (rows) => Buffer.from(rows.map((row) => `${typeof row === 'string' ? row : JSON.stringify(row)}\n`).join(''))

const ports = (overrides = {}) => {
  const files = new Map()
  const lines = []
  return {
    files,
    lines,
    ports: {
      asRoot: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      writeRootFile: async (path, content) => { files.set(path, Buffer.from(content)) },
      readAgentFile: async (path) => files.get(path) ?? null,
      log: (line) => lines.push(line),
      executionId: 'run-1',
      conversationId: 'conv-1',
      ...overrides,
    },
  }
}

const DNS = '/var/log/conexus-egress/dns.jsonl'
const TCP = '/var/log/conexus-egress/tcp.jsonl'
const MAX_EGRESS_LINES = 200
const destinations = (held) => held.lines.filter((line) => line.startsWith('BUILDER_SANDBOX_EGRESS:'))
const collectOnce = async (dns, tcp) => {
  const held = ports()
  held.files.set(DNS, bytes(dns))
  held.files.set(TCP, bytes(tcp))
  await collectEgress(held.ports)
  return held
}

test('egress aggregation names addresses by what the agent resolved and counts sightings per host and port', async () => {
  const held = await collectOnce(
    [{ t: 1000, name: 'registry.npmjs.org', ips: ['104.16.0.1'] }, { t: 2000, name: 'cdn.example.com', ips: ['104.16.0.1'] }],
    [
      { t: 3000, ip: '104.16.0.1', port: 443 },
      { t: 2500, ip: '104.16.0.1', port: 443 },
      { t: 4000, ip: '203.0.113.9', port: 8080 },
      { t: 4000, ip: '2001:db8::1', port: 443 },
      { t: 5000, ip: '127.0.0.1', port: 53 },
    ],
  )
  assert.deepEqual(destinations(held), [
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:cdn.example.com:443:tcp:${new Date(2500).toISOString()}:2`,
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:[2001:db8::1]:443:tcp:${new Date(4000).toISOString()}:1`,
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:203.0.113.9:8080:tcp:${new Date(4000).toISOString()}:1`,
  ])
})

test('egress aggregation drops malformed rows and never carries anything beyond host, port, protocol, first-seen and count', async () => {
  const held = await collectOnce(
    [{ t: 1, name: 'bad host/with?query=1', ips: ['10.0.0.1'] }, null, 'x', { t: 1, name: 'ok.example', ips: [42, '10.0.0.2'], path: '/secret' }],
    [{ t: 2, ip: '10.0.0.1', port: 443 }, { t: 2, ip: '10.0.0.2', port: 99999 }, { t: 2, ip: '10.0.0.2', port: 443, payload: 'x' }, { ip: '10.0.0.3', port: 1 }],
  )
  assert.deepEqual(destinations(held), [
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:10.0.0.1:443:tcp:${new Date(2).toISOString()}:1`,
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:ok.example:443:tcp:${new Date(2).toISOString()}:1`,
  ])
})

test('reading a log resumes from the byte offset, leaves a half-written line for the next read, and restarts on a shrunken file', async () => {
  const held = ports()
  held.files.set(DNS, bytes([]))
  held.files.set(TCP, Buffer.from('{"t":1,"ip":"10.0.0.1","port":1}\nnot json\n{"t":2,"ip":"10.0.0.2","port":2}\n{"t":3,"ip":"10.0.0.3","po'))
  await collectEgress(held.ports)
  assert.deepEqual(destinations(held).map((line) => line.split(':')[3]), ['10.0.0.1', '10.0.0.2'])
  held.lines.length = 0
  held.files.set(TCP, Buffer.concat([held.files.get(TCP), Buffer.from('rt":3}\n')]))
  await collectEgress(held.ports)
  assert.deepEqual(destinations(held).map((line) => line.split(':')[3]), ['10.0.0.3'])
  held.lines.length = 0
  held.files.set(TCP, bytes([{ t: 9, ip: '10.0.0.9', port: 9 }]))
  await collectEgress(held.ports)
  assert.deepEqual(destinations(held).map((line) => line.split(':')[3]), ['10.0.0.9'])
})

test('a turn logs each destination once and the next turn logs only what happened since', async () => {
  const held = ports()
  held.files.set(DNS, bytes([{ t: 1000, name: 'a.example', ips: ['10.0.0.1'] }]))
  held.files.set(TCP, bytes([{ t: 2000, ip: '10.0.0.1', port: 443 }]))
  await collectEgress(held.ports)
  assert.deepEqual(held.lines, [
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:a.example:443:tcp:${new Date(2000).toISOString()}:1`,
    'BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:partial:1',
  ])
  held.lines.length = 0
  held.files.set(TCP, Buffer.concat([held.files.get(TCP), bytes([{ t: 3000, ip: '10.0.0.1', port: 443 }])]))
  await collectEgress(held.ports)
  assert.deepEqual(held.lines, [
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:10.0.0.1:443:tcp:${new Date(3000).toISOString()}:1`,
    'BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:complete:1',
  ])
})

test('a turn whose poller wrote no file is complete with no destinations, and the next turn logs its destination', async () => {
  const held = ports()
  held.files.set(DNS, bytes([]))
  await collectEgress(held.ports)
  assert.deepEqual(held.lines, ['BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:complete:0'])
  assert.deepEqual(JSON.parse(held.files.get('/var/log/conexus-egress/offset.json').toString('utf8')), { dns: 0, tcp: 0 })
  held.lines.length = 0
  held.files.set(TCP, bytes([{ t: 3000, ip: '10.0.0.1', port: 443 }]))
  await collectEgress(held.ports)
  assert.deepEqual(held.lines, [
    `BUILDER_SANDBOX_EGRESS:run-1:conv-1:10.0.0.1:443:tcp:${new Date(3000).toISOString()}:1`,
    'BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:complete:1',
  ])
})

test('a TCP log that cannot be read is a failed collection, never a complete one', async () => {
  const held = ports({ readAgentFile: async (path) => { if (path === TCP) throw new Error('502 upstream timeout'); return null } })
  await collectEgress(held.ports)
  assert.equal(held.lines.some((line) => line.includes(':complete:')), false)
  assert.equal(held.lines.some((line) => line.startsWith('BUILDER_SANDBOX_EGRESS_COLLECT_FAILED:run-1:')), true)
  assert.equal(held.lines.at(-1), 'BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:failed:0')
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
  held.files.set(TCP, bytes(rows))
  held.files.set(DNS, bytes([]))
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

test('a log the recorder had to truncate at its size cap reports partial, never complete', async () => {
  const held = ports()
  held.files.set(DNS, bytes([]))
  held.files.set(TCP, bytes([{ capped: true }]))
  await collectEgress(held.ports)
  assert.deepEqual(held.lines, ['BUILDER_SANDBOX_EGRESS_SUMMARY:run-1:partial:0'])
})

const scriptsOf = async () => {
  const written = new Map()
  const held = ports({ asRoot: async (script) => ({ exitCode: script.includes('setsid') ? 0 : 1, stdout: '', stderr: '' }) })
  held.ports.writeRootFile = async (path, content) => { written.set(path, Buffer.from(content).toString('utf8')) }
  await ensureEgressLog(held.ports)
  return { forwarder: written.get('/usr/local/lib/conexus-egress/dns.mjs'), poller: written.get('/usr/local/lib/conexus-egress/poller.py') }
}

test('the poller records the outbound peer and not the peer of an accepted connection', async () => {
  const { poller } = await scriptsOf()
  const dir = mkdtempSync(join(tmpdir(), 'egress-poller-'))
  try {
    const row = (local, remote, state) => `   0: ${local} ${remote} ${state} 00000000:00000000 00:00000000 00000000     0        0 1 1 0000000000000000 100 0 0 10 0`
    const header = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode'
    // 0100007F = 127.0.0.1; 0A00A8C0 = 192.168.0.10; 0100A8C0 = 192.168.0.1 (little-endian hex). Port 0x1F90 = 8080, 0x1BB = 443.
    const table = [
      header,
      row('0A00A8C0:1F90', '00000000:0000', '0A'),
      row('0A00A8C0:1F90', '0100A8C0:AE4C', '01'),
      row('0A00A8C0:C350', '0300A8C0:01BB', '01'),
    ].join('\n')
    writeFileSync(join(dir, 'tcp'), `${table}\n`)
    writeFileSync(join(dir, 'poller.py'), poller.replace("'/proc/net/tcp'", `'${join(dir, 'tcp')}'`).replace("'/proc/net/tcp6'", `'${join(dir, 'none')}'`).replace('/var/log/conexus-egress/tcp.jsonl', join(dir, 'tcp.jsonl')))
    execFileSync('python3', [join(dir, 'poller.py'), '--once'])
    const logged = readFileSync(join(dir, 'tcp.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.deepEqual(logged.map(({ ip, port }) => `${ip}:${port}`), ['192.168.0.3:443'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a poller whose log is over the size cap truncates it and leaves a capped marker', async () => {
  const { poller } = await scriptsOf()
  const dir = mkdtempSync(join(tmpdir(), 'egress-poller-'))
  try {
    writeFileSync(join(dir, 'tcp.jsonl'), 'x'.repeat(8_000_101))
    writeFileSync(join(dir, 'poller.py'), poller.replace("'/proc/net/tcp'", `'${join(dir, 'none')}'`).replace("'/proc/net/tcp6'", `'${join(dir, 'none')}'`).replace('/var/log/conexus-egress/tcp.jsonl', join(dir, 'tcp.jsonl')))
    execFileSync('python3', [join(dir, 'poller.py'), '--once'])
    assert.equal(readFileSync(join(dir, 'tcp.jsonl'), 'utf8'), '{"capped":true}\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the recorders keep the VM resolver as the forwarder upstream and fall back to a public one only when there is none', async () => {
  const commands = []
  const held = ports({ asRoot: async (script) => { commands.push(script); return { exitCode: script.includes('setsid') ? 0 : 1, stdout: '', stderr: '' } } })
  await ensureEgressLog(held.ports)
  const start = commands.find((script) => script.includes('setsid'))
  assert.match(start, /\/etc\/resolv\.conf > '\/var\/log\/conexus-egress\/upstream'/)
  assert.match(start, /node '\/usr\/local\/lib\/conexus-egress\/dns\.mjs' "\$up"/)
  assert.match(start, /nameserver %s.*"\$up" > \/etc\/resolv\.conf/)
  assert.ok(start.indexOf("upstream' ||") < start.indexOf('> /etc/resolv.conf'))
})
