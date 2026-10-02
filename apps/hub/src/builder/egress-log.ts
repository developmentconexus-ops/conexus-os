import type { CommandResult } from '@mastra/core/workspace'

/**
 * The hosts a conversation's sandbox reaches (issue #418). Sandbox egress stays open (C-023); this is
 * evidence for building the Q5 allowlist, not a security control. Two root-owned processes run in the
 * VM: a DNS forwarder on 127.0.0.1:53 that records the names the agent resolves with their answers,
 * and a poller of `/proc/net/tcp` that records every remote address and port, TIME_WAIT included.
 * At the turn's end the Hub reads what they wrote since the last turn, joins address to name, and logs
 * one line per destination with the run id, the conversation id, host, port, protocol, first-seen and
 * count. It never records a path, query string or payload: the parser keeps only those fields.
 *
 * Blind spots: a connection that opens and closes between two polls and never leaves TIME_WAIT is
 * missed, as are UDP, a resolver the agent reaches directly, DNS over HTTPS and an address used
 * without a lookup (the last is logged as the bare address). `count` is poll observations, not
 * connections. An empty list is never evidence of no egress: the summary line says how complete it is.
 */
export const EGRESS_LOG_DIR = '/var/log/conexus-egress'
export const EGRESS_SCRIPT_DIR = '/usr/local/lib/conexus-egress'
const DNS_SCRIPT_PATH = `${EGRESS_SCRIPT_DIR}/dns.mjs`
const POLLER_SCRIPT_PATH = `${EGRESS_SCRIPT_DIR}/poller.py`
const OFFSET_PATH = `${EGRESS_LOG_DIR}/offset.json`
const DNS_LOG_PATH = `${EGRESS_LOG_DIR}/dns.jsonl`
const TCP_LOG_PATH = `${EGRESS_LOG_DIR}/tcp.jsonl`
export const EGRESS_COLLECT_TIMEOUT_MS = 10_000
export const MAX_EGRESS_LINES = 200
const MAX_LOG_BYTES = 8_000_000
const RESOLVER = '8.8.8.8'

export type EgressRecord = Readonly<{ host: string; port: number; protocol: 'tcp'; firstSeen: string; count: number }>
export type EgressStatus = 'complete' | 'partial' | 'failed'
type DnsObservation = Readonly<{ t: number; name: string; ips: readonly string[] }>
type TcpObservation = Readonly<{ t: number; ip: string; port: number }>
type Offsets = Readonly<{ dns: number; tcp: number }>

export const dnsForwarderSource = (): string => `import dgram from 'node:dgram'
import { appendFileSync } from 'node:fs'
const LOG = '${DNS_LOG_PATH}'
let written = 0
const readName = (buf, start) => {
  const labels = []
  let at = start
  let end = -1
  for (let hops = 0; hops < 32; hops += 1) {
    const length = buf[at]
    if (length === undefined) throw new Error('short')
    if (length === 0) { at += 1; break }
    if ((length & 0xc0) === 0xc0) { if (end < 0) end = at + 2; at = ((length & 0x3f) << 8) | buf[at + 1]; continue }
    labels.push(buf.toString('latin1', at + 1, at + 1 + length))
    at += 1 + length
  }
  return { name: labels.join('.').toLowerCase(), next: end < 0 ? at : end }
}
const ipv6 = (buf, at) => { const parts = []; for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(at + i).toString(16)); return parts.join(':') }
const parse = (buf) => {
  const question = readName(buf, 12)
  let at = question.next + 4
  const ips = []
  for (let i = 0; i < buf.readUInt16BE(6); i += 1) {
    at = readName(buf, at).next
    const type = buf.readUInt16BE(at)
    const length = buf.readUInt16BE(at + 8)
    if (type === 1 && length === 4) ips.push(Array.from(buf.subarray(at + 10, at + 14)).join('.'))
    if (type === 28 && length === 16) ips.push(ipv6(buf, at + 10))
    at += 10 + length
  }
  return { name: question.name, ips }
}
const record = (answer) => {
  if (written > ${MAX_LOG_BYTES}) return
  try {
    const { name, ips } = parse(answer)
    if (ips.length === 0) return
    const line = JSON.stringify({ t: Date.now(), name, ips }) + '\\n'
    written += line.length
    appendFileSync(LOG, line)
  } catch {}
}
const server = dgram.createSocket('udp4')
server.on('message', (query, client) => {
  const upstream = dgram.createSocket('udp4')
  const done = () => { clearTimeout(timer); upstream.close() }
  const timer = setTimeout(done, 5000)
  upstream.on('message', (answer) => { server.send(answer, client.port, client.address); record(answer); done() })
  upstream.on('error', done)
  upstream.send(query, 53, '${RESOLVER}')
})
server.on('error', () => process.exit(1))
server.bind(53, '127.0.0.1')
`

export const tcpPollerSource = (): string => `import ipaddress, os, socket, sys, time
LOG = '${TCP_LOG_PATH}'
LISTEN = '0A'
def v4(h):
    return socket.inet_ntoa(bytes.fromhex(h)[::-1])
def v6(h):
    raw = b''.join(bytes.fromhex(h[i:i + 8])[::-1] for i in range(0, 32, 8))
    a = ipaddress.IPv6Address(raw)
    return str(a.ipv4_mapped or a)
def poll():
    seen = set()
    for path, convert in (('/proc/net/tcp', v4), ('/proc/net/tcp6', v6)):
        try:
            with open(path) as f:
                rows = f.read().splitlines()[1:]
        except OSError:
            continue
        for row in rows:
            fields = row.split()
            if len(fields) < 4 or fields[3] == LISTEN:
                continue
            ip, port = fields[2].split(':')
            if int(port, 16) == 0:
                continue
            seen.add((convert(ip), int(port, 16)))
    return seen
def record():
    try:
        if os.path.getsize(LOG) > ${MAX_LOG_BYTES}:
            return
    except OSError:
        pass
    now = int(time.time() * 1000)
    lines = ''.join('{"t":%d,"ip":"%s","port":%d}\\n' % (now, ip, port) for ip, port in sorted(poll()))
    if lines:
        with open(LOG, 'a') as f:
            f.write(lines)
if '--once' in sys.argv:
    record()
else:
    while True:
        record()
        time.sleep(10)
`

type EgressRoot = Readonly<{
  asRoot(script: string): Promise<CommandResult>
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
}>

const aliveCheck = [`for p in dns poller; do kill -0 "$(cat '${EGRESS_LOG_DIR}'/$p.pid 2>/dev/null)" 2>/dev/null || exit 1; done`].join('\n')

// A forwarder that never answers must not take name resolution with it: the second nameserver is
// what a lookup falls through to, and resolv.conf points at the forwarder only once it is running.
const startScript = [
  'umask 022',
  `mkdir -p -m 755 '${EGRESS_LOG_DIR}'`,
  'start() {',
  `  if ! kill -0 "$(cat '${EGRESS_LOG_DIR}'/$1.pid 2>/dev/null)" 2>/dev/null; then`,
  `    p=$1; shift; setsid nohup "$@" >/dev/null 2>&1 </dev/null &`,
  `    echo $! > '${EGRESS_LOG_DIR}'/$p.pid`,
  '  fi',
  '}',
  `start dns node '${DNS_SCRIPT_PATH}'`,
  `start poller python3 '${POLLER_SCRIPT_PATH}'`,
  'sleep 1',
  aliveCheck,
  `printf 'nameserver 127.0.0.1\\nnameserver ${RESOLVER}\\n' > /etc/resolv.conf`,
].join('\n')

/**
 * Starts the two recorders when either is not running: a new VM, a replaced one, or one that died.
 * Idempotent, so it serves first creation and resume alike. Throws when they cannot be started.
 */
export const ensureEgressLog = async (root: EgressRoot): Promise<void> => {
  if ((await root.asRoot(aliveCheck)).exitCode === 0) return
  const encoder = new TextEncoder()
  await root.writeRootFile(DNS_SCRIPT_PATH, encoder.encode(dnsForwarderSource()))
  await root.writeRootFile(POLLER_SCRIPT_PATH, encoder.encode(tcpPollerSource()))
  const started = await root.asRoot(startScript)
  if (started.exitCode !== 0) throw new Error('BUILDER_SANDBOX_EGRESS_START_FAILED', { cause: { stderr: started.stderr.slice(0, 500) } })
}

/** The complete lines of `bytes` after `offset`, parsed, and the offset after the last complete one. */
export const readJsonl = (bytes: Uint8Array, offset: number): Readonly<{ rows: readonly unknown[]; offset: number }> => {
  const start = offset > bytes.length ? 0 : offset
  const text = Buffer.from(bytes.subarray(start)).toString('utf8')
  const last = text.lastIndexOf('\n')
  if (last < 0) return { rows: [], offset: start }
  const rows: unknown[] = []
  for (const line of text.slice(0, last).split('\n')) {
    try { rows.push(JSON.parse(line)) } catch { /* a damaged line is skipped */ }
  }
  return { rows, offset: start + Buffer.byteLength(text.slice(0, last + 1)) }
}

const HOST = /^[a-z0-9_.-]{1,253}$/
const ADDRESS = /^[0-9a-f:.]{2,45}$/
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const dnsObservations = (rows: readonly unknown[]): DnsObservation[] => rows.flatMap((row) => {
  if (!isObject(row) || typeof row.t !== 'number' || typeof row.name !== 'string' || !Array.isArray(row.ips) || !HOST.test(row.name)) return []
  return [{ t: row.t, name: row.name, ips: row.ips.filter((ip): ip is string => typeof ip === 'string' && ADDRESS.test(ip)) }]
})

const tcpObservations = (rows: readonly unknown[]): TcpObservation[] => rows.flatMap((row) => {
  if (!isObject(row) || typeof row.t !== 'number' || typeof row.ip !== 'string' || typeof row.port !== 'number') return []
  if (!ADDRESS.test(row.ip) || !Number.isInteger(row.port) || row.port < 1 || row.port > 65_535) return []
  return [{ t: row.t, ip: row.ip, port: row.port }]
})

const isLoopback = (ip: string): boolean => ip === '::1' || ip.startsWith('127.')

/**
 * One record per destination: the name the agent last resolved to the address, else the bare address,
 * with the earliest sighting and the number of sightings. Loopback and the forwarder's own upstream
 * leg are not the agent's destinations.
 */
export const aggregateEgress = (dnsRows: readonly unknown[], tcpRows: readonly unknown[]): EgressRecord[] => {
  const names = new Map<string, string>()
  for (const { name, ips } of dnsObservations(dnsRows).sort((a, b) => a.t - b.t)) for (const ip of ips) names.set(ip, name)
  const groups = new Map<string, { host: string; port: number; firstSeen: number; count: number }>()
  for (const { t, ip, port } of tcpObservations(tcpRows)) {
    if (isLoopback(ip) || (ip === RESOLVER && port === 53)) continue
    const host = names.get(ip) ?? (ip.includes(':') ? `[${ip}]` : ip)
    const key = `${host}\0${port}`
    const group = groups.get(key)
    if (group) { group.firstSeen = Math.min(group.firstSeen, t); group.count += 1 }
    else groups.set(key, { host, port, firstSeen: t, count: 1 })
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host) || a.port - b.port)
    .map(({ host, port, firstSeen, count }) => ({ host, port, protocol: 'tcp' as const, firstSeen: new Date(firstSeen).toISOString(), count }))
}

export type EgressCollectPorts = Readonly<EgressRoot & {
  readAgentFile(path: string): Promise<Uint8Array>
  log(line: string): void
  executionId: string
  conversationId: string
  timeoutMs?: number
}>

const readOffsets = async (ports: EgressCollectPorts): Promise<Offsets | null> => {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(await ports.readAgentFile(OFFSET_PATH)).toString('utf8'))
    if (isObject(parsed) && Number.isInteger(parsed.dns) && Number.isInteger(parsed.tcp) && (parsed.dns as number) >= 0 && (parsed.tcp as number) >= 0) {
      return { dns: parsed.dns as number, tcp: parsed.tcp as number }
    }
  } catch { /* a missing or damaged sidecar starts from the top of the logs */ }
  return null
}

const collect = async (ports: EgressCollectPorts): Promise<EgressStatus> => {
  const polled = await ports.asRoot(`python3 '${POLLER_SCRIPT_PATH}' --once`)
  if (polled.exitCode !== 0) throw new Error('BUILDER_SANDBOX_EGRESS_POLL_FAILED')
  const stored = await readOffsets(ports)
  const offsets = stored ?? { dns: 0, tcp: 0 }
  const tcp = readJsonl(await ports.readAgentFile(TCP_LOG_PATH), offsets.tcp)
  let dnsBytes: Uint8Array | null = null
  try { dnsBytes = await ports.readAgentFile(DNS_LOG_PATH) } catch { /* no forwarder log: addresses go unnamed */ }
  const dns = dnsBytes ? readJsonl(dnsBytes, offsets.dns) : { rows: [], offset: offsets.dns }
  const records = aggregateEgress(dns.rows, tcp.rows)
  for (const record of records.slice(0, MAX_EGRESS_LINES)) {
    ports.log(`BUILDER_SANDBOX_EGRESS:${ports.executionId}:${ports.conversationId}:${record.host}:${record.port}:${record.protocol}:${record.firstSeen}:${record.count}`)
  }
  await ports.writeRootFile(OFFSET_PATH, new TextEncoder().encode(JSON.stringify({ dns: dns.offset, tcp: tcp.offset })))
  const status: EgressStatus = stored === null || dnsBytes === null || records.length > MAX_EGRESS_LINES ? 'partial' : 'complete'
  ports.log(`BUILDER_SANDBOX_EGRESS_SUMMARY:${ports.executionId}:${status}:${Math.min(records.length, MAX_EGRESS_LINES)}`)
  return status
}

/**
 * The turn's destinations, logged. Never throws and never waits longer than its timeout: a run's
 * outcome does not depend on it, and a failure is logged so an empty list is not read as no egress.
 */
export const collectEgress = async (ports: EgressCollectPorts): Promise<void> => {
  let timer: NodeJS.Timeout | undefined
  const work = collect(ports)
  work.catch(() => {})
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT')), ports.timeoutMs ?? EGRESS_COLLECT_TIMEOUT_MS) }),
    ])
  } catch (error) {
    ports.log(`BUILDER_SANDBOX_EGRESS_COLLECT_FAILED:${ports.executionId}:${error instanceof Error ? error.message : String(error)}`)
    ports.log(`BUILDER_SANDBOX_EGRESS_SUMMARY:${ports.executionId}:failed:0`)
  } finally {
    clearTimeout(timer)
  }
}
