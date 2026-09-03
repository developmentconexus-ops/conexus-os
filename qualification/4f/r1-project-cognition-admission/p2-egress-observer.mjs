import { subscribe, unsubscribe } from 'node:diagnostics_channel'
import { PerformanceObserver } from 'node:perf_hooks'

const CHANNELS = ['undici:request:create', 'http.client.request.start']

function coordinate(channel, message) {
  if (channel === 'undici:request:create') {
    const origin = String(message?.request?.origin ?? '')
    const path = String(message?.request?.path ?? '')
    return origin ? { channel, origin: new URL(origin).origin, path } : undefined
  }
  const request = message?.request
  if (!request) return undefined
  const protocol = request.protocol ?? 'https:'
  const host = request.host ?? request.hostname
  return host ? { channel, origin: `${protocol}//${host}`, path: String(request.path ?? '') } : undefined
}

export function beginNetworkEgressObservation() {
  const events = []
  const performanceObserver = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'dns') {
        events.push({
          channel: 'performance:dns',
          hostname: String(entry.detail?.hostname ?? entry.detail?.host ?? ''),
          addresses: Array.isArray(entry.detail?.addresses)
            ? entry.detail.addresses.map(address => typeof address === 'string' ? address : address?.address).filter(Boolean)
            : [],
        })
      } else if (entry.entryType === 'net') {
        events.push({
          channel: 'performance:net',
          host: String(entry.detail?.host ?? ''),
          port: Number(entry.detail?.port),
        })
      }
    }
  })
  performanceObserver.observe({ entryTypes: ['dns', 'net'] })
  const handlers = CHANNELS.map(channel => {
    const handler = message => {
      const event = coordinate(channel, message)
      if (event) events.push(event)
    }
    subscribe(channel, handler)
    return { channel, handler }
  })
  return Object.freeze({
    snapshot: () => events.map(event => ({ ...event })),
    close: () => {
      handlers.forEach(({ channel, handler }) => unsubscribe(channel, handler))
      performanceObserver.disconnect()
    },
  })
}
