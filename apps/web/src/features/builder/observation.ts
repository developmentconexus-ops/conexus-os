import { clearAuthorityCache } from '../../app/query-client'

export type BuilderLiveView = Readonly<{
  running: boolean
  message: Readonly<{ id: string; text: string }> | null
  activities: readonly Readonly<{
    id: string
    label: 'READ_FILES' | 'EDIT_FILES' | 'RUN_COMMAND' | 'WORKSPACE'
    detail?: string
    state: 'started' | 'succeeded' | 'failed' | 'interrupted'
  }>[]
}>

const labels = new Set<BuilderLiveView['activities'][number]['label']>(['READ_FILES', 'EDIT_FILES', 'RUN_COMMAND', 'WORKSPACE'])
const states = new Set<BuilderLiveView['activities'][number]['state']>(['started', 'succeeded', 'failed', 'interrupted'])

const parseLiveView = (value: unknown): BuilderLiveView => {
  if (typeof value !== 'object' || value === null || !('running' in value) || typeof value.running !== 'boolean' || !('activities' in value) || !Array.isArray(value.activities)) throw new Error('Invalid live view')
  const message = 'message' in value ? value.message : null
  if (message !== null && (typeof message !== 'object' || message === null || !('id' in message) || typeof message.id !== 'string' || !('text' in message) || typeof message.text !== 'string')) throw new Error('Invalid live message')
  const activities = value.activities.map((item) => {
    if (typeof item !== 'object' || item === null || !('id' in item) || typeof item.id !== 'string' || !('label' in item) || typeof item.label !== 'string' || !labels.has(item.label as BuilderLiveView['activities'][number]['label']) || !('state' in item) || typeof item.state !== 'string' || !states.has(item.state as BuilderLiveView['activities'][number]['state'])) throw new Error('Invalid live activity')
    const detail = 'detail' in item && typeof item.detail === 'string' ? item.detail : undefined
    return { id: item.id, label: item.label as BuilderLiveView['activities'][number]['label'], ...(detail ? { detail } : {}), state: item.state as BuilderLiveView['activities'][number]['state'] }
  })
  return { running: value.running, message: message as BuilderLiveView['message'], activities }
}

const observeUrl = async (url: string, signal: AbortSignal, update: (view: BuilderLiveView) => void): Promise<void> => {
  const response = await fetch(url, {
    credentials: 'same-origin', headers: { accept: 'text/event-stream' }, cache: 'no-store', signal,
  })
  if (response.status === 401) clearAuthorityCache()
  if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) throw new Error('Live view unavailable')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error('Live view ended without cancellation')
      bytes += chunk.value.byteLength
      if (bytes > 1024 * 1024) throw new Error('Live view limit exceeded')
      buffer += decoder.decode(chunk.value, { stream: true })
      let separator = buffer.indexOf('\n\n')
      while (separator !== -1) {
        const frame = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)
        if (frame.startsWith('data: ')) update(parseLiveView(JSON.parse(frame.slice(6))))
        else if (!frame.startsWith(':')) throw new Error('Invalid live view frame')
        separator = buffer.indexOf('\n\n')
      }
      if (signal.aborted) return
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function observeBuilderRun(
  projectId: string, builderRunId: string, signal: AbortSignal,
  update: (view: BuilderLiveView) => void,
): Promise<void> {
  return observeUrl(`/api/control/projects/${encodeURIComponent(projectId)}/builder-session/runs/${encodeURIComponent(builderRunId)}/stream`, signal, update)
}
