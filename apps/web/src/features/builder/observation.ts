import { parseObservationEvent, type BuilderObservation } from '../../../../../packages/builder-observation/src/index.mjs'
import { clearAuthorityCache } from '../../app/query-client'

export type ObservationPart =
  | Readonly<{ kind: 'text'; id: string; text: string; ended: boolean }>
  | Readonly<{ kind: 'activity'; id: string; label: Extract<BuilderObservation, { kind: 'ACTIVITY' }>['label']; detail?: string; state: Extract<BuilderObservation, { kind: 'ACTIVITY' }>['state'] }>
  | Readonly<{ kind: 'phase'; id: string; phase: Extract<BuilderObservation, { kind: 'PHASE' }>['phase'] }>

const observeUrl = async (
  url: string, signal: AbortSignal, update: (parts: readonly ObservationPart[]) => void, strict: boolean,
): Promise<void> => {
  const response = await fetch(url, {
    credentials: 'same-origin', headers: { accept: 'text/event-stream' }, cache: 'no-store', signal,
  })
  if (response.status === 401) clearAuthorityCache()
  if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) throw new Error('Observation unavailable')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  let bytes = 0
  let sequence = 0
  let generation: string | undefined
  let parts: readonly ObservationPart[] = []
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error('Observation ended without completion')
      bytes += chunk.value.byteLength
      if (bytes > 1024 * 1024) throw new Error('Observation limit exceeded')
      buffer += decoder.decode(chunk.value, { stream: true })
      let separator = buffer.indexOf('\n\n')
      while (separator !== -1) {
        const frame = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)
        if (frame.startsWith('data: ')) {
          const envelope = parseObservationEvent(JSON.parse(frame.slice(6)))
          generation ??= envelope.generation
          if (envelope.generation !== generation || envelope.sequence !== sequence + 1 || envelope.sequence > 4096) throw new Error('Observation sequence mismatch')
          sequence = envelope.sequence
          const event = envelope.event
          if (event.kind === 'OBSERVATION_END') return
          if (event.kind === 'OBSERVATION_UNAVAILABLE') throw new Error('Observation unavailable')
          if (event.kind === 'PHASE') parts = [...parts, { kind: 'phase', id: `phase-${sequence}`, phase: event.phase }]
          else if (event.kind === 'TEXT_START') {
            if (strict && parts.some((part) => part.kind === 'text' && part.id === event.blockId)) throw new Error('Duplicate text block')
            parts = [...parts, { kind: 'text', id: event.blockId, text: '', ended: false }]
          } else if (event.kind === 'TEXT_DELTA' || event.kind === 'TEXT_END') {
            const part = parts.find((item) => item.kind === 'text' && item.id === event.blockId)
            if (part?.kind !== 'text' || (strict && part.ended)) throw new Error('Unknown text block')
            parts = parts.map((item) => item === part ? { ...part, text: part.text + (event.kind === 'TEXT_DELTA' ? event.text : ''), ended: event.kind === 'TEXT_END' } : item)
          } else {
            const part = parts.find((item) => item.kind === 'activity' && item.id === event.activityId)
            const detail = 'detail' in event && typeof event.detail === 'string' ? event.detail : undefined
            if (!part) {
              if (event.state !== 'started') throw new Error('Unknown activity')
              parts = [...parts, { kind: 'activity', id: event.activityId, label: event.label, ...(detail ? { detail } : {}), state: event.state }]
            } else if (strict && (part.kind !== 'activity' || part.state !== 'started' || event.state === 'started' || part.label !== event.label)) {
              throw new Error('Invalid activity transition')
            } else {
              parts = parts.map((item) => item === part ? { ...part, ...(detail ? { detail } : {}), state: event.state } : item)
            }
          }
          if (signal.aborted) return
          update(parts)
        } else if (!frame.startsWith(':')) throw new Error('Invalid observation frame')
        separator = buffer.indexOf('\n\n')
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function observeBuilderRun(
  projectId: string, builderRunId: string, signal: AbortSignal,
  update: (parts: readonly ObservationPart[]) => void,
): Promise<void> {
  return observeUrl(`/api/control/projects/${encodeURIComponent(projectId)}/builder-session/runs/${encodeURIComponent(builderRunId)}/stream`, signal, update, true)
}
