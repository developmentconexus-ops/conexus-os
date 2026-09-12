import type { BuilderObservation } from '../../../../packages/builder-observation/src/index.mjs'

type ObservationLabel = Extract<BuilderObservation, { kind: 'ACTIVITY' }>['label']
type ObservationSink = ((event: BuilderObservation) => void) | undefined

type RecordValue = Record<string, unknown>

const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null
const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined

const toolLabel = (toolName: string | undefined): ObservationLabel => {
  const value = toolName?.toLowerCase() ?? ''
  if (/(read|list|search|find|glob|grep|inspect|stat|cat|tree)/.test(value)) return 'READ_FILES'
  if (/(write|edit|patch|update|create|delete|remove|replace|modify|rename)/.test(value)) return 'EDIT_FILES'
  if (/(execute|exec|command|shell|run|test|build|install|git|npm|pnpm|yarn)/.test(value)) return 'RUN_COMMAND'
  return 'WORKSPACE'
}

const textProviderKey = (payload: RecordValue): string => stringValue(payload.id) ?? '__missing_text_id__'
const toolProviderKey = (payload: RecordValue): string | undefined => stringValue(payload.toolCallId)

const isToolBoundary = (type: string): boolean => type.startsWith('tool-')

const terminalToolState = (result: unknown, isError: unknown): 'succeeded' | 'failed' => {
  if (isError === true) return 'failed'
  return isRecord(result) && result.success === false ? 'failed' : 'succeeded'
}

/**
 * Projects Mastra's provider-facing stream chunks into the intentionally small
 * Builder observation union. Provider ids and payloads stay inside this state
 * machine and never cross the observation boundary.
 */
export const createMastraObservationMapper = () => {
  let nextTextId = 0
  let nextActivityId = 0
  let textBoundary = 0
  const activeTexts = new Map<string, { blockId: string; boundary: number }>()
  const activeTools = new Map<string, { activityId: string; label: ObservationLabel }>()
  const finishedTools = new Set<string>()

  const startText = (providerKey: string, events: BuilderObservation[]): { blockId: string; boundary: number } => {
    const previous = activeTexts.get(providerKey)
    if (previous) events.push({ kind: 'TEXT_END', blockId: previous.blockId })
    const current = { blockId: `text-${++nextTextId}`, boundary: textBoundary }
    activeTexts.set(providerKey, current)
    events.push({ kind: 'TEXT_START', blockId: current.blockId })
    return current
  }

  const closeTexts = (events: BuilderObservation[]) => {
    for (const current of activeTexts.values()) events.push({ kind: 'TEXT_END', blockId: current.blockId })
    activeTexts.clear()
  }

  const appendText = (blockId: string, text: string, events: BuilderObservation[]) => {
    // The shared wire schema bounds one delta. Splitting here keeps every
    // emitted observation parseable even if a provider sends a large chunk.
    for (let offset = 0; offset < text.length; offset += 65_536) {
      events.push({ kind: 'TEXT_DELTA', blockId, text: text.slice(offset, offset + 65_536) })
    }
  }

  const startTool = (providerKey: string, label: ObservationLabel, events: BuilderObservation[]) => {
    const existing = activeTools.get(providerKey)
    if (existing) return existing
    const current = { activityId: `activity-${++nextActivityId}`, label }
    finishedTools.delete(providerKey)
    activeTools.set(providerKey, current)
    events.push({ kind: 'ACTIVITY', activityId: current.activityId, label: current.label, state: 'started' })
    return current
  }

  const finishTool = (providerKey: string, state: 'succeeded' | 'failed', label: ObservationLabel, events: BuilderObservation[]) => {
    const existing = activeTools.get(providerKey)
    if (!existing) {
      if (finishedTools.has(providerKey)) return
      startTool(providerKey, label, events)
    }
    const current = activeTools.get(providerKey)
    if (!current) return
    events.push({ kind: 'ACTIVITY', activityId: current.activityId, label: current.label, state })
    activeTools.delete(providerKey)
    finishedTools.add(providerKey)
  }

  const map = (chunk: unknown): BuilderObservation[] => {
    if (!isRecord(chunk)) return []
    const type = stringValue(chunk.type)
    if (!type) return []
    const payload = isRecord(chunk.payload) ? chunk.payload : {}
    const events: BuilderObservation[] = []

    try {
      if (isToolBoundary(type)) textBoundary += 1
      if (type === 'text-start') {
        startText(textProviderKey(payload), events)
      } else if (type === 'text-delta') {
        const text = typeof payload.text === 'string' ? payload.text : undefined
        if (text === undefined) return events
        const providerKey = textProviderKey(payload)
        let current = activeTexts.get(providerKey)
        if (!current || current.boundary !== textBoundary) current = startText(providerKey, events)
        appendText(current.blockId, text, events)
      } else if (type === 'text-end') {
        const providerKey = textProviderKey(payload)
        const current = activeTexts.get(providerKey)
        if (current) {
          events.push({ kind: 'TEXT_END', blockId: current.blockId })
          activeTexts.delete(providerKey)
        }
      } else if (type === 'tool-call' || type === 'tool-call-input-streaming-start') {
        const providerKey = toolProviderKey(payload)
        if (providerKey) startTool(providerKey, toolLabel(stringValue(payload.toolName)), events)
      } else if (type === 'tool-result') {
        const providerKey = toolProviderKey(payload)
        if (providerKey) finishTool(providerKey, terminalToolState(payload.result, payload.isError), toolLabel(stringValue(payload.toolName)), events)
      } else if (type === 'tool-error') {
        const providerKey = toolProviderKey(payload)
        if (providerKey) finishTool(providerKey, 'failed', toolLabel(stringValue(payload.toolName)), events)
      } else if (type === 'finish' || type === 'error' || type === 'abort' || type === 'tripwire') {
        closeTexts(events)
      }
    } catch {
      // Observation is a best-effort projection. A malformed provider chunk
      // must not become a worker failure or leak through this boundary.
      return []
    }
    return events
  }

  const finish = (): BuilderObservation[] => {
    const events: BuilderObservation[] = []
    closeTexts(events)
    for (const [key, current] of activeTools) {
      events.push({ kind: 'ACTIVITY', activityId: current.activityId, label: current.label, state: 'interrupted' })
      finishedTools.add(key)
    }
    activeTools.clear()
    return events
  }

  return Object.freeze({ map, finish })
}

export const notifyObservation = (observer: ObservationSink, event: BuilderObservation): void => {
  try {
    observer?.(event)
  } catch {
    // UI observation is never allowed to alter the server-owned worker result.
  }
}
