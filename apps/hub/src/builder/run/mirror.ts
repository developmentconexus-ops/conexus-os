import type { SourceRevision } from '../../../../../packages/contract/dist/index.js'
import type { Workspace } from '@mastra/core/workspace'
import { mirrorSnapshot, pullSnapshot } from '../conexus-git.js'
import type { ConexusGit, RunSourceSandbox } from '../conexus-git.js'
import { CHECKOUT_WRITER_TOOLS, SANDBOX_CHECKOUT } from '../sandbox.js'

export const MIRROR_DEBOUNCE_MS = 5_000

export type TurnMirror = Readonly<{
  schedule(): void
  /** The turn-end mirror: the candidate when the turn made one, else a snapshot of the checkout (the `pulled` candidate itself when its tree is unchanged). Answers the mirror's head. */
  end(candidate: SourceRevision | null, pulled?: SourceRevision | null): Promise<SourceRevision | null>
  /** Ends the turn's mirror without a new write, for a sandbox that is gone. Settles once the write in flight has. */
  abandon(): Promise<void>
}>

/**
 * The conversation's mirror during one turn (spec 0002 amendment, B1): the checkout as one commit on
 * the turn's start under `refs/conexus/conversations/<conversationId>`. Edits schedule a trailing,
 * debounced snapshot and the turn end writes the last one. One promise chain runs every write, so
 * two never share the checkout's mirror index; the ref moves by compare and swap from the head this
 * turn last saw. A failure is reported and never changes the run.
 */
export const createTurnMirror = ({ git, projectId, conversationId, turnStart, head, source, excluded, debounceMs, fail }: Readonly<{
  git: Pick<ConexusGit, 'acceptSnapshot' | 'moveMirror'>
  projectId: string
  conversationId: string
  turnStart: SourceRevision
  head: SourceRevision | null
  source: RunSourceSandbox
  excluded: readonly string[]
  debounceMs: number
  fail(error: unknown): void
}>): TurnMirror => {
  let expected = head
  let written: SourceRevision | null = null
  let chain: Promise<void> = Promise.resolve()
  let queued = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let ended: Promise<SourceRevision | null> | undefined
  const serial = (work: () => Promise<void>): Promise<void> => {
    chain = chain.then(work).catch(fail)
    return chain
  }
  const snapshot = async (pulled?: SourceRevision | null): Promise<void> => {
    const next = await pullSnapshot({
      git, projectId, snapshot: mirrorSnapshot(conversationId, turnStart), expected, unchangedFrom: written ?? turnStart,
      ...(pulled ? { sameAs: pulled } : {}), scratch: 'mirror', sandbox: source, checkout: SANDBOX_CHECKOUT, excluded,
    })
    if (next && next === pulled) await git.moveMirror(projectId, conversationId, { expected, next })
    if (next) expected = written = next
  }
  const stop = (): void => {
    clearTimeout(timer)
    timer = undefined
  }
  return Object.freeze({
    schedule: () => {
      if (ended) return
      stop()
      timer = setTimeout(() => {
        timer = undefined
        if (queued) return
        queued = true
        void serial(async () => {
          queued = false
          await snapshot()
        })
      }, debounceMs)
    },
    end: (candidate, pulled) => {
      stop()
      ended ??= serial(async () => {
        if (!candidate) return snapshot(pulled)
        await git.moveMirror(projectId, conversationId, { expected, next: candidate })
        expected = candidate
      }).then(() => expected)
      return ended
    },
    abandon: () => {
      stop()
      ended ??= chain.then(() => expected)
      return ended.then(() => undefined)
    },
  })
}

/** The turn whose mirror a conversation's workspace feeds; the sandbox record owns it, and each turn's start points it at that turn's mirror. */
export type MirrorFeed = { current: TurnMirror | null }

/** Makes every checkout-changing workspace tool schedule the current turn's mirror, keeping the hooks the workspace already has. */
export const createMirrorFeed = (workspace: Workspace): MirrorFeed => {
  const feed: MirrorFeed = { current: null }
  const existing = workspace.getToolsConfig() ?? {}
  const priorAfterToolCall = existing.hooks?.afterToolCall
  workspace.setToolsConfig({
    ...existing,
    hooks: {
      ...existing.hooks,
      afterToolCall: async (hookContext) => {
        if (CHECKOUT_WRITER_TOOLS.has(hookContext.workspaceToolName)) feed.current?.schedule()
        await priorAfterToolCall?.(hookContext)
      },
    },
  })
  return feed
}
