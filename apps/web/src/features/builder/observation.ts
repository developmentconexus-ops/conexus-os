import { clearAuthorityCache } from '../../app/query-client'

export type BuilderLiveView = Readonly<{
  running: boolean
  message: Readonly<{ id: string; text: string }> | null
  phase: 'PREPARING' | 'AGENT' | 'SOURCE_ADMISSION' | 'COMPILING' | 'FINALIZING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'
  activities: readonly Readonly<{
    id: string
    label: 'READ_FILES' | 'EDIT_FILES' | 'RUN_COMMAND' | 'WORKSPACE'
    detail?: string
    state: 'started' | 'succeeded' | 'failed' | 'interrupted'
  }>[]
}>

export type BuilderObservation = Readonly<
  | { status: 'STREAMING'; view: BuilderLiveView }
  | { status: 'RECONNECTING'; view: BuilderLiveView | null }
  | { status: 'RUN_SETTLED'; view: BuilderLiveView }
  | { status: 'UNOBSERVABLE'; view: BuilderLiveView | null }
>

const labels = new Set<BuilderLiveView['activities'][number]['label']>(['READ_FILES', 'EDIT_FILES', 'RUN_COMMAND', 'WORKSPACE'])
const states = new Set<BuilderLiveView['activities'][number]['state']>(['started', 'succeeded', 'failed', 'interrupted'])
const phases = new Set<BuilderLiveView['phase']>(['PREPARING', 'AGENT', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING', 'SUCCEEDED', 'FAILED', 'INTERRUPTED'])
const retryDelays = [100, 200, 400, 800, 1_600, 3_000] as const
const maxFrameChars = 256 * 1024

class LiveViewProtocolError extends Error {}
class LiveViewAuthorizationError extends Error {}
class LiveViewUnavailableError extends Error {}

const parseLiveView = (value: unknown): BuilderLiveView => {
  if (typeof value !== 'object' || value === null || !('running' in value) || typeof value.running !== 'boolean' || !('activities' in value) || !Array.isArray(value.activities)) throw new LiveViewProtocolError('Invalid live view')
  const message = 'message' in value ? value.message : null
  if (message !== null && (typeof message !== 'object' || message === null || !('id' in message) || typeof message.id !== 'string' || !('text' in message) || typeof message.text !== 'string')) throw new LiveViewProtocolError('Invalid live message')
  const activities = value.activities.map((item) => {
    if (typeof item !== 'object' || item === null || !('id' in item) || typeof item.id !== 'string' || !('label' in item) || typeof item.label !== 'string' || !labels.has(item.label as BuilderLiveView['activities'][number]['label']) || !('state' in item) || typeof item.state !== 'string' || !states.has(item.state as BuilderLiveView['activities'][number]['state'])) throw new LiveViewProtocolError('Invalid live activity')
    const detail = 'detail' in item && typeof item.detail === 'string' ? item.detail : undefined
    return { id: item.id, label: item.label as BuilderLiveView['activities'][number]['label'], ...(detail ? { detail } : {}), state: item.state as BuilderLiveView['activities'][number]['state'] }
  })
  const phase = 'phase' in value && typeof value.phase === 'string' && phases.has(value.phase as BuilderLiveView['phase'])
    ? value.phase as BuilderLiveView['phase']
    : 'AGENT'
  return { running: value.running, message: message as BuilderLiveView['message'], phase, activities }
}

const waitForRetry = (delay: number, signal: AbortSignal): Promise<void> => new Promise((resolve) => {
  if (signal.aborted) {
    resolve()
    return
  }
  let timeout: number | undefined
  const onAbort = () => {
    if (timeout !== undefined) window.clearTimeout(timeout)
    signal.removeEventListener('abort', onAbort)
    resolve()
  }
  timeout = window.setTimeout(() => {
    signal.removeEventListener('abort', onAbort)
    resolve()
  }, delay)
  signal.addEventListener('abort', onAbort, { once: true })
})

const observeUrlOnce = async (url: string, signal: AbortSignal, update: (view: BuilderLiveView) => void): Promise<void> => {
  const response = await fetch(url, {
    credentials: 'same-origin', headers: { accept: 'text/event-stream' }, cache: 'no-store', signal,
  })
  if (response.status === 401) {
    clearAuthorityCache()
    throw new LiveViewAuthorizationError('Live view not authorized')
  }
  if (response.status === 410) throw new LiveViewUnavailableError('Live observation unavailable')
  if (response.status >= 500) throw new Error('Live view temporarily unavailable')
  if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) throw new LiveViewProtocolError('Live view unavailable')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) return
      buffer += decoder.decode(chunk.value, { stream: true })
      let separator = buffer.indexOf('\n\n')
      while (separator !== -1) {
        const frame = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)
        if (frame.length > maxFrameChars) throw new LiveViewProtocolError('Live view frame limit exceeded')
        if (frame.startsWith('data: ')) {
          try { update(parseLiveView(JSON.parse(frame.slice(6)))) }
          catch (error) { if (error instanceof LiveViewProtocolError) throw error; throw new LiveViewProtocolError('Invalid live view frame') }
        } else if (!frame.startsWith(':')) throw new LiveViewProtocolError('Invalid live view frame')
        separator = buffer.indexOf('\n\n')
      }
      if (buffer.length > maxFrameChars) throw new LiveViewProtocolError('Live view frame limit exceeded')
      if (signal.aborted) return
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function observeBuilderRun(
  projectId: string, builderRunId: string, signal: AbortSignal,
  report: (observation: BuilderObservation) => void,
): Promise<void> {
  const url = `/api/control/projects/${encodeURIComponent(projectId)}/builder-session/runs/${encodeURIComponent(builderRunId)}/stream`
  return (async () => {
    let fruitless = 0
    let lastFingerprint: string | null = null
    const observed: { latest: BuilderLiveView | null } = { latest: null }
    while (!signal.aborted) {
      let progressed = false
      let silent = false
      try {
        await observeUrlOnce(url, signal, (view) => {
          observed.latest = view
          report({ status: 'STREAMING', view })
          const fingerprint = JSON.stringify(view)
          if (fingerprint !== lastFingerprint) {
            lastFingerprint = fingerprint
            progressed = true
          }
        })
        if (signal.aborted) return
        const settled = observed.latest
        if (settled && !settled.running) {
          report({ status: 'RUN_SETTLED', view: settled })
          return
        }
      } catch (error) {
        if (signal.aborted) return
        if (error instanceof LiveViewAuthorizationError) return
        if (error instanceof LiveViewUnavailableError) silent = true
        else if (error instanceof LiveViewProtocolError) return report({ status: 'UNOBSERVABLE', view: observed.latest })
      }
      if (progressed) fruitless = 0
      else {
        fruitless += 1
        if (fruitless >= retryDelays.length) return report({ status: 'UNOBSERVABLE', view: observed.latest })
        if (!silent) report({ status: 'RECONNECTING', view: observed.latest })
      }
      await waitForRetry(retryDelays[Math.min(fruitless, retryDelays.length - 1)] ?? 3_000, signal)
    }
  })()
}
