import type { AgentControllerEvent } from '@mastra/core/agent-controller'
import type { BuilderObservation } from '../../../../packages/builder-observation/src/index.mjs'

type ObservationLabel = Extract<BuilderObservation, { kind: 'ACTIVITY' }>['label']
type ObservationSink = ((event: BuilderObservation) => void) | undefined
type NativeEvent = AgentControllerEvent

const toolLabel = (toolName: string): ObservationLabel => {
  const value = toolName.toLowerCase()
  if (/(read|list|search|find|glob|grep|inspect|stat|cat|tree)/.test(value)) return 'READ_FILES'
  if (/(write|edit|patch|update|create|delete|remove|replace|modify|rename)/.test(value)) return 'EDIT_FILES'
  if (/(execute|exec|command|shell|run|test|build|install|git|npm|pnpm|yarn)/.test(value)) return 'RUN_COMMAND'
  return 'WORKSPACE'
}

const messageText = (message: Readonly<{ content?: Readonly<{ parts?: readonly unknown[] }> }>): string => {
  const parts = Array.isArray(message.content?.parts) ? message.content.parts : []
  return parts.flatMap((part) => {
    if (typeof part !== 'object' || part === null || !('type' in part) || part.type !== 'text' || !('text' in part) || typeof part.text !== 'string') return []
    return [part.text]
  }).join('')
}

const safePath = (args: unknown): string | undefined => {
  if (typeof args !== 'object' || args === null) return undefined
  const value = 'path' in args && typeof args.path === 'string' ? args.path
    : 'filePath' in args && typeof args.filePath === 'string' ? args.filePath
      : 'file_path' in args && typeof args.file_path === 'string' ? args.file_path : undefined
  if (!value || value.includes('\0') || value.includes('..')) return undefined
  const normalized = value.replaceAll('\\', '/').replace(/^\/workspace\/repo\//, '')
  return normalized.startsWith('app/') && normalized.length <= 220 ? normalized : undefined
}

const appendText = (blockId: string, text: string, events: BuilderObservation[]): void => {
  for (let offset = 0; offset < text.length; offset += 65_536) {
    events.push({ kind: 'TEXT_DELTA', blockId, text: text.slice(offset, offset + 65_536) })
  }
}

/** Projects the native AgentController event stream once at the Conexus trust boundary. */
export const createMastraSessionObservationProjector = () => {
  let nextTextId = 0
  let nextActivityId = 0
  const texts = new Map<string, { blockId: string; text: string; ended: boolean }>()
  const tools = new Map<string, { activityId: string; label: ObservationLabel; detail?: string }>()

  const startText = (key: string, events: BuilderObservation[]): { blockId: string; text: string; ended: boolean } => {
    const current = { blockId: `text-${++nextTextId}`, text: '', ended: false }
    texts.set(key, current)
    events.push({ kind: 'TEXT_START', blockId: current.blockId })
    return current
  }

  const closeText = (current: { blockId: string; text: string; ended: boolean }, events: BuilderObservation[]): void => {
    if (current.ended) return
    current.ended = true
    events.push({ kind: 'TEXT_END', blockId: current.blockId })
  }

  const finishTool = (toolCallId: string, state: 'succeeded' | 'failed', events: BuilderObservation[]): void => {
    const current = tools.get(toolCallId)
    if (!current) return
    events.push({ kind: 'ACTIVITY', activityId: current.activityId, label: current.label, ...(current.detail ? { detail: current.detail } : {}), state })
    tools.delete(toolCallId)
  }

  const map = (event: NativeEvent): BuilderObservation[] => {
    const events: BuilderObservation[] = []
    if (event.type === 'message_start' && event.message.role === 'assistant') {
      const current = startText(event.message.id, events)
      const text = messageText(event.message)
      if (text) { appendText(current.blockId, text, events); current.text = text }
    } else if (event.type === 'message_update' && event.message.role === 'assistant') {
      const current = texts.get(event.message.id) ?? startText(event.message.id, events)
      const text = messageText(event.message)
      if (text.startsWith(current.text)) appendText(current.blockId, text.slice(current.text.length), events)
      current.text = text
    } else if (event.type === 'message_end' && event.message.role === 'assistant') {
      const current = texts.get(event.message.id) ?? startText(event.message.id, events)
      const text = messageText(event.message)
      if (text.startsWith(current.text)) appendText(current.blockId, text.slice(current.text.length), events)
      current.text = text
      closeText(current, events)
      texts.delete(event.message.id)
    } else if (event.type === 'tool_start') {
      const label = toolLabel(event.toolName)
      const detail = safePath(event.args)
      const current = { activityId: `activity-${++nextActivityId}`, label, ...(detail ? { detail } : {}) }
      tools.set(event.toolCallId, current)
      events.push({ kind: 'ACTIVITY', activityId: current.activityId, label, ...(detail ? { detail } : {}), state: 'started' })
    } else if (event.type === 'tool_end') {
      finishTool(event.toolCallId, event.isError || event.denied ? 'failed' : 'succeeded', events)
    } else if (event.type === 'agent_end') {
      for (const current of texts.values()) closeText(current, events)
      texts.clear()
      for (const [toolCallId] of tools) {
        const current = tools.get(toolCallId)
        if (current) events.push({ kind: 'ACTIVITY', activityId: current.activityId, label: current.label, ...(current.detail ? { detail: current.detail } : {}), state: 'interrupted' })
      }
      tools.clear()
    }
    return events
  }

  const finish = (): BuilderObservation[] => {
    const events: BuilderObservation[] = []
    for (const current of texts.values()) closeText(current, events)
    texts.clear()
    for (const [toolCallId] of tools) {
      const current = tools.get(toolCallId)
      if (current) events.push({ kind: 'ACTIVITY', activityId: current.activityId, label: current.label, ...(current.detail ? { detail: current.detail } : {}), state: 'interrupted' })
      tools.delete(toolCallId)
    }
    return events
  }

  return Object.freeze({ map, finish })
}

export const notifyObservation = (observer: ObservationSink, event: BuilderObservation): void => {
  try {
    observer?.(event)
  } catch {
    // The live display must not change the server-owned run result.
  }
}
