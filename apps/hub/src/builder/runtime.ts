import { createCodingAgent } from '@mastra/core/coding-agent'
import type { MastraLanguageModel } from '@mastra/core/agent'
import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { Workspace } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { Sandbox } from 'e2b'

export type CodingWorkerInput = Readonly<{
  projectId: string
  changeId: string
  workUnitId: string
  actorRunId: string
  admissionToken: string
  intent: string
  baseSourceRevision: string
  sourceBundle: Uint8Array
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  signal?: AbortSignal
}>

export type CodingWorkerResult = Readonly<{
  runtimeId: 'mastra-native-e2b-v1'
  projectId: string
  changeId: string
  workUnitId: string
  actorRunId: string
  admissionToken: string
  sandboxId: string
  baseSourceRevision: string
  candidateSourceRevision: string
  resultBundle: Uint8Array
  summary: string
}>

export type CodingWorkerRuntime = Readonly<{
  kind: 'REMOTE_E2B'
  execute(input: CodingWorkerInput): Promise<CodingWorkerResult>
}>

export type E2BBuilderRuntimeConfig = Readonly<{
  apiKey: string
  templateId: string
  model: MastraLanguageModel
  timeoutMs?: number
}>

class ConexusGuardedE2BSandbox extends E2BSandbox {
  override retryOnDead<T>(work: () => Promise<T>): Promise<T> {
    return work()
  }
}

const oid = /^[0-9a-f]{40}$/
const safeIdentity = (value: string): boolean => /^[0-9a-f-]{36}$/i.test(value)

export const createMastraE2BCodingWorkerRuntime = (
  config: E2BBuilderRuntimeConfig,
): CodingWorkerRuntime => {
  if (!config.apiKey || !config.templateId || /latest|\*/i.test(config.templateId)) {
    throw new Error('BUILDER_RUNTIME_CONFIG_REFUSED')
  }
  return Object.freeze({
    kind: 'REMOTE_E2B' as const,
    execute: async (input) => {
      if (![input.projectId, input.changeId, input.workUnitId, input.actorRunId, input.admissionToken].every(safeIdentity) ||
        !oid.test(input.baseSourceRevision) || !input.intent.trim() || input.sourceBundle.byteLength === 0 ||
        input.sourceBundle.byteLength > 256 * 1024 * 1024) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')

      const logicalSandboxId = `conexus-rb-${input.actorRunId}`
      const timeoutMs = config.timeoutMs ?? 15 * 60_000
      const metadata = {
        'mastra-sandbox-id': logicalSandboxId,
        'conexus-project-id': input.projectId,
        'conexus-change-id': input.changeId,
        'conexus-actor-run-id': input.actorRunId,
      }
      const physical = await Sandbox.create(config.templateId, {
        apiKey: config.apiKey,
        timeoutMs,
        envs: {},
        metadata,
        allowInternetAccess: false,
        network: { denyOut: ({ allTraffic }) => [allTraffic] },
        lifecycle: { onTimeout: 'kill' },
      })
      const sandbox = new ConexusGuardedE2BSandbox({
        id: logicalSandboxId,
        sandboxId: physical.sandboxId,
        template: config.templateId,
        apiKey: config.apiKey,
        timeout: timeoutMs,
        lifecycle: { onTimeout: 'kill' },
        env: {},
        metadata,
        network: { denyOut: ({ allTraffic }) => [allTraffic] },
        instructions: 'Remote Conexus Builder sandbox. No host fallback, remote credentials, or owner-state authority.',
      })
      let observedSandboxId: string | undefined
      try {
        await sandbox.start()
        if (!sandbox.sandboxId || sandbox.sandboxId !== physical.sandboxId) throw new Error('BUILDER_SANDBOX_FRESH_CREATE_REQUIRED')
        observedSandboxId = sandbox.sandboxId
        await input.bindPhysicalSandbox(observedSandboxId)

        const direct = async (command: string, args: string[] = [], options: ExecuteCommandOptions = {}): Promise<CommandResult> => {
          if (input.signal?.aborted) throw new Error('BUILDER_RUN_CANCELLED')
          if (!observedSandboxId || sandbox.sandboxId !== observedSandboxId) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
          const startedAt = Date.now()
          const value = await sandbox.e2b.commands.run([command, ...args].map((part) => `'${part.replaceAll("'", "'\\''")}'`).join(' '), {
            cwd: options.cwd ?? '/workspace', timeoutMs: options.timeout ?? 120_000, envs: {},
          })
          if (sandbox.sandboxId !== observedSandboxId) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
          return {
            success: value.exitCode === 0,
            exitCode: value.exitCode,
            stdout: value.stdout,
            stderr: value.stderr,
            executionTimeMs: Date.now() - startedAt,
          }
        }
        // Override Mastra's provider retry path. Every agent command remains
        // bound to the one physical E2B incarnation admitted above.
        sandbox.executeCommand = direct
        await sandbox.writeFiles([{ path: '/workspace/source.bundle', content: Buffer.from(input.sourceBundle) }])
        const prepared = await direct('sh', ['-lc', [
          'rm -rf /workspace/repo',
          'git clone /workspace/source.bundle /workspace/repo',
          `git -C /workspace/repo checkout --detach ${input.baseSourceRevision}`,
          'git -C /workspace/repo remote remove origin',
          'test -z "$(git -C /workspace/repo remote)"',
        ].join(' && ')])
        if (!prepared.success) throw new Error('BUILDER_SOURCE_MATERIALIZATION_REFUSED')

        const workspace = new Workspace({ sandbox })
        const agent = createCodingAgent({
          id: `builder-${input.actorRunId}`,
          name: 'Conexus Coding Worker',
          model: config.model,
          workspace,
          editor: false,
          instructions: [
            'Work only in /workspace/repo. Implement the human intent with the smallest sustainable change.',
            'Inspect before editing, run focused checks when available, and do not claim acceptance or mutate any Conexus owner state.',
            'Never add a Git remote, use network access, read outside /workspace/repo, or expose credentials.',
          ].join(' '),
          tools: {},
        })
        const response = await agent.generate(
          `Project ${input.projectId}; Change ${input.changeId}; exact base ${input.baseSourceRevision}. Human intent: ${input.intent}`,
          {
            maxSteps: 24,
            abortSignal: input.signal,
            modelSettings: { maxRetries: 0, maxOutputTokens: 4_096, timeout: { totalMs: config.timeoutMs ?? 15 * 60_000, stepMs: 120_000 } },
          },
        )
        const finalized = await direct('sh', ['-lc', [
          'test -z "$(git -C /workspace/repo remote)"',
          `test "$(git -C /workspace/repo rev-parse HEAD)" = "${input.baseSourceRevision}"`,
          'git -C /workspace/repo add --all',
          'test -n "$(git -C /workspace/repo diff --cached --name-only)"',
          'git -C /workspace/repo -c user.name="Conexus Coding Worker" -c user.email="worker@conexus.invalid" commit -m "Conexus Builder candidate"',
          'git -C /workspace/repo branch -f conexus-result HEAD',
          `test "$(git -C /workspace/repo rev-parse HEAD^)" = "${input.baseSourceRevision}"`,
          'git -C /workspace/repo bundle create /workspace/result.bundle refs/heads/conexus-result',
        ].join(' && ')])
        if (!finalized.success) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
        const candidateSourceRevision = (await direct('git', ['-C', '/workspace/repo', 'rev-parse', 'HEAD'])).stdout.trim()
        if (!oid.test(candidateSourceRevision)) throw new Error('BUILDER_RESULT_IDENTITY_REFUSED')
        const resultBundle = await sandbox.e2b.files.read('/workspace/result.bundle', { format: 'bytes' })
        if (sandbox.sandboxId !== observedSandboxId || input.signal?.aborted) throw new Error('BUILDER_LATE_RESULT_REFUSED')
        return Object.freeze({
          runtimeId: 'mastra-native-e2b-v1' as const,
          projectId: input.projectId,
          changeId: input.changeId,
          workUnitId: input.workUnitId,
          actorRunId: input.actorRunId,
          admissionToken: input.admissionToken,
          sandboxId: observedSandboxId,
          baseSourceRevision: input.baseSourceRevision,
          candidateSourceRevision,
          resultBundle,
          summary: response.text.trim() || 'Coding worker produced a candidate result.',
        })
      } finally {
        await sandbox.destroy().catch(() => undefined)
      }
    },
  })
}
