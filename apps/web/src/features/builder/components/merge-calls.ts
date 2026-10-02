import type { MastraDBMessage } from '../mastra-session'

type MessagePart = MastraDBMessage['content']['parts'][number]

const emptyArgs = (args: unknown): boolean =>
  args === null || args === undefined || (typeof args === 'object' && Object.keys(args).length === 0)

// A call is one thing however many snapshots of it the thread carries. The controller resolves a
// parked call in a new message, as a part with no arguments, after the message that asked, and a
// finished turn's stored copy repeats the live one. The call keeps the place and the arguments of
// its first snapshot and takes the state of its last; later snapshots leave their message.
export const mergeCalls = (messages: readonly MastraDBMessage[]): readonly MastraDBMessage[] => {
  const copies = messages.map((message) => ({ message, parts: [...message.content.parts] }))
  const first = new Map<string, readonly [MessagePart[], number]>()
  const dropped = new Set<MessagePart>()
  for (const { parts } of copies) {
    for (const [partIndex, part] of parts.entries()) {
      if (part.type !== 'tool-invocation') continue
      const at = first.get(part.toolInvocation.toolCallId)
      if (!at) { first.set(part.toolInvocation.toolCallId, [parts, partIndex]); continue }
      const [earlierParts, earlierIndex] = at
      const earlier = earlierParts[earlierIndex]
      if (earlier?.type !== 'tool-invocation') continue
      earlierParts[earlierIndex] = { ...part, toolInvocation: { ...part.toolInvocation, args: emptyArgs(part.toolInvocation.args) ? earlier.toolInvocation.args : part.toolInvocation.args } }
      dropped.add(part)
    }
  }
  return copies.map(({ message, parts }) => ({ ...message, content: { ...message.content, parts: parts.filter((part) => !dropped.has(part)) } }))
}
