import type { AgentController } from '@mastra/core/agent-controller'

/**
 * A documented exception to the Mastra boundary (docs/reference/mastra/boundary.md, item 18), and the
 * only file in the Hub that calls `__unregisterInternalWorkflow` or deletes Mastra workflow snapshots;
 * the census in scripts/census-builder-run.mjs fails on any other caller.
 *
 * Mastra 1.71 keeps two things of a suspended run that an abort ends and that never resumes
 * (https://github.com/mastra-ai/mastra/issues/25903): the `agentic-loop` registration in the Mastra
 * instance and the snapshot rows of its two workflows. Each question a person ends without an answer
 * would leave both, for the life of the Hub process. Mastra has no public way to release them:
 * `declineToolCall` throws on an aborted run, and resuming only to skip costs a model turn.
 *
 * Delete this file, and its one caller in run/question.ts, once the test "Mastra still leaves the loop
 * registration and the snapshot rows of a question an abort ends" in
 * tests/implementation/builder-run-question.test.mjs fails after a Mastra upgrade.
 */

const LOOP_WORKFLOWS = ['agentic-loop', 'executionWorkflow'] as const

type MastraInstance = ReturnType<AgentController['getMastra']>

/** Releases what Mastra keeps of each suspended run, skipping one `held` says a question still waits on. */
export const releaseMastraLeftovers = async (mastra: MastraInstance, runIds: readonly string[], { held, signal }: Readonly<{
  held(runId: string): boolean
  signal: AbortSignal
}>): Promise<void> => {
  const workflows = await mastra?.getStorage()?.getStore('workflows')
  for (const runId of runIds) {
    if (held(runId)) continue
    signal.throwIfAborted()
    mastra?.__unregisterInternalWorkflow('agentic-loop', runId)
    for (const workflowName of LOOP_WORKFLOWS) {
      signal.throwIfAborted()
      await workflows?.deleteWorkflowRunById({ runId, workflowName })
    }
  }
}
