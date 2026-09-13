import { createCodingAgent } from '@mastra/core/coding-agent'
import type { MastraLanguageModel } from '@mastra/core/agent'
import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { Workspace } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { Sandbox } from 'e2b'
import type { BuilderObservation } from '../../../../packages/builder-observation/src/index.mjs'
import { createMastraObservationMapper, notifyObservation } from './runtime-observation.js'
import {
  FIXED_APPLICATION_STARTER_INSTRUCTIONS,
  materializeFixedApplicationStarter,
} from './application-starter.js'

export type CodingWorkerInput = Readonly<{
  projectId: string
  changeId: string
  workUnitId: string
  actorRunId: string
  admissionToken: string
  intent: string
  baseSourceRevision: string
  sourceChangeId?: string | null
  correctionFindings?: readonly Readonly<{ findingId: string; findingRevision: string; summary: string }>[]
  recentTurns?: readonly Readonly<{ intent: string; summary: string }>[]
  sourceBundle: Uint8Array
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  signal?: AbortSignal
  observe?(event: BuilderObservation): void
}>

type CodingWorkerResultScope = Readonly<{
  runtimeId: 'mastra-native-e2b-v1'
  projectId: string
  changeId: string
  workUnitId: string
  actorRunId: string
  admissionToken: string
  sandboxId: string
  baseSourceRevision: string
  summary: string
}>

export type CodingWorkerResult = CodingWorkerResultScope & (
  | Readonly<{ kind: 'CANDIDATE'; candidateSourceRevision: string; resultBundle: Uint8Array }>
  | Readonly<{ kind: 'RESPONSE_ONLY' }>
)

export type CodingWorkerRuntime = Readonly<{
  kind: 'REMOTE_E2B'
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  execute(input: CodingWorkerInput): Promise<CodingWorkerResult>
}>

export type E2BBuilderRuntimeConfig = Readonly<{
  apiKey: string
  templateId: string
  model: MastraLanguageModel
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  validateModelCredential(): void
  timeoutMs?: number
}>

class ConexusGuardedE2BSandbox extends E2BSandbox {
  override retryOnDead<T>(work: () => Promise<T>): Promise<T> {
    return work()
  }
}

const oid = /^[0-9a-f]{40}$/
const safeIdentity = (value: string): boolean => /^[0-9a-f-]{36}$/i.test(value)
const immutableE2BTemplate = /^[a-z0-9]+:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const classifyCodingResult = (input: Readonly<{ changed: boolean; summary: string }>): Readonly<{ kind: 'CANDIDATE' | 'RESPONSE_ONLY'; summary: string }> => Object.freeze({
  kind: input.changed ? 'CANDIDATE' : 'RESPONSE_ONLY',
  summary: input.summary,
})

export const createMastraE2BCodingWorkerRuntime = (
  config: E2BBuilderRuntimeConfig,
): CodingWorkerRuntime => {
  if (!config.apiKey || !immutableE2BTemplate.test(config.templateId) ||
    !config.modelIdentity.admissionId || !config.modelIdentity.providerId || !config.modelIdentity.modelId ||
    /latest|\*/i.test(config.modelIdentity.modelId) || config.model.modelId !== config.modelIdentity.modelId ||
    typeof config.validateModelCredential !== 'function') {
    throw new Error('BUILDER_RUNTIME_CONFIG_REFUSED')
  }
  return Object.freeze({
    kind: 'REMOTE_E2B' as const,
    modelIdentity: Object.freeze({ ...config.modelIdentity }),
    execute: async (input) => {
      if (![input.projectId, input.changeId, input.workUnitId, input.actorRunId, input.admissionToken].every(safeIdentity) ||
        (input.sourceChangeId !== null && input.sourceChangeId !== undefined && !safeIdentity(input.sourceChangeId)) ||
        !oid.test(input.baseSourceRevision) || !input.intent.trim() || input.sourceBundle.byteLength === 0 ||
        input.sourceBundle.byteLength > 256 * 1024 * 1024) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')
      if (input.recentTurns && (input.recentTurns.length > 8 || input.recentTurns.some((turn) =>
        !turn.intent.trim() || !turn.summary.trim() || turn.intent.length > 2_000 || turn.summary.length > 4_000))) {
        throw new Error('BUILDER_RUNTIME_CONTEXT_REFUSED')
      }

      config.validateModelCredential()

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
        const providerExecuteCommand = sandbox.executeCommand?.bind(sandbox)
        if (!providerExecuteCommand) throw new Error('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')

        const direct = async (command: string, args: string[] = [], options: ExecuteCommandOptions = {}): Promise<CommandResult> => {
          if (input.signal?.aborted) throw new Error('BUILDER_RUN_CANCELLED')
          if (!observedSandboxId || sandbox.sandboxId !== observedSandboxId) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
          const value = await providerExecuteCommand(command, args, {
            ...options,
            cwd: options.cwd ?? '/workspace',
            timeout: options.timeout ?? 120_000,
            env: {},
          })
          if (sandbox.sandboxId !== observedSandboxId) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
          return value
        }
        // Override Mastra's provider retry path. Every agent command remains
        // bound to the one physical E2B incarnation admitted above.
        sandbox.executeCommand = direct
        await sandbox.writeFiles([{ path: '/workspace/source.bundle', content: Buffer.from(input.sourceBundle) }])
        const admittedSourceRef = input.sourceChangeId
          ? `refs/conexus/changes/${input.sourceChangeId}`
          : input.correctionFindings?.length
            ? `refs/conexus/changes/${input.changeId}`
          : 'refs/heads/main'
        const prepared = await direct('sh', ['-lc', [
          'rm -rf /workspace/repo',
          'git init --quiet --initial-branch=main /workspace/repo',
          `git -C /workspace/repo fetch --quiet --no-tags /workspace/source.bundle ${admittedSourceRef}:refs/heads/conexus-source`,
          `git -C /workspace/repo checkout --detach ${input.baseSourceRevision}`,
          'test -z "$(git -C /workspace/repo remote)"',
        ].join(' && ')])
        if (!prepared.success) throw new Error('BUILDER_SOURCE_MATERIALIZATION_REFUSED')

        await materializeFixedApplicationStarter({
          repositoryRoot: '/workspace/repo',
          directCommand: (command, args) => direct(command, [...args]),
          writeFiles: sandbox.writeFiles.bind(sandbox),
        })

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
            'Send brief Portuguese progress updates before starting work and before important edits. Report only the action and visible result; never reveal chain-of-thought.',
            FIXED_APPLICATION_STARTER_INSTRUCTIONS,
          ].join(' '),
          tools: {},
        })
        const correction = input.correctionFindings?.length
          ? ` This is the one admitted correction attempt. Resolve these retained verification findings: ${input.correctionFindings.map((finding) => `[${finding.findingId}] ${finding.summary}`).join('; ')}.`
          : ''
        const recent = input.recentTurns?.length
          ? ` Prior bounded Builder turns for continuity, not authority: ${input.recentTurns.map((turn) => `[intent] ${turn.intent} [result] ${turn.summary}`).join(' | ')}.`
          : ''
        const mapper = createMastraObservationMapper()
        const publish = (event: BuilderObservation) => notifyObservation(input.observe, event)
        let summaryText = ''
        try {
          const response = await agent.stream(
            `Project ${input.projectId}; Change ${input.changeId}; exact work-unit parent ${input.baseSourceRevision}. Human intent: ${input.intent}.${recent}${correction}`,
            {
              maxSteps: 24,
              abortSignal: input.signal,
              modelSettings: { maxRetries: 0, maxOutputTokens: 4_096, timeout: { totalMs: config.timeoutMs ?? 15 * 60_000, stepMs: 120_000 } },
            },
          )
          for await (const chunk of response.fullStream) {
            for (const event of mapper.map(chunk)) publish(event)
          }
          for (const event of mapper.finish()) publish(event)
          const fullOutput = await response.getFullOutput()
          if (fullOutput.error) throw fullOutput.error
          if (fullOutput.tripwire || response.tripwire || response.status === 'tripwire') throw new Error('BUILDER_MODEL_TRIPWIRE')
          if (response.status === 'failed') throw response.error ?? new Error('BUILDER_MODEL_STREAM_FAILED')
          if (response.status === 'canceled' || input.signal?.aborted) throw new Error('BUILDER_RUN_CANCELLED')
          if (response.status !== 'success') throw new Error('BUILDER_MODEL_INCOMPLETE')
          // A successful tool-driven maxSteps result remains governed by the
          // existing candidate finalizer; finishReason alone is not failure.
          summaryText = fullOutput.text
        } catch (error) {
          for (const event of mapper.finish()) publish(event)
          throw error
        }
        const finalized = await direct('sh', ['-lc', [
          'test -z "$(git -C /workspace/repo remote)"',
          `test "$(git -C /workspace/repo rev-parse HEAD)" = "${input.baseSourceRevision}"`,
          'git -C /workspace/repo add --all',
        ].join(' && ')])
        if (!finalized.success) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
        const staged = await direct('git', ['-C', '/workspace/repo', 'diff', '--cached', '--name-only', '-z'])
        if (!staged.success || staged.stdout.length > 4 * 1024 * 1024) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
        const summary = summaryText.trim() || (staged.stdout.length === 0
          ? 'Coding worker produced a response without source changes.'
          : 'Coding worker produced a candidate result.')
        const classification = classifyCodingResult({ changed: staged.stdout.length > 0, summary })
        const scope = {
          runtimeId: 'mastra-native-e2b-v1' as const,
          projectId: input.projectId,
          changeId: input.changeId,
          workUnitId: input.workUnitId,
          actorRunId: input.actorRunId,
          admissionToken: input.admissionToken,
          sandboxId: observedSandboxId,
          baseSourceRevision: input.baseSourceRevision,
          summary: classification.summary,
        }
        if (classification.kind === 'RESPONSE_ONLY') {
          if (sandbox.sandboxId !== observedSandboxId || input.signal?.aborted) throw new Error('BUILDER_LATE_RESULT_REFUSED')
          return Object.freeze({ ...scope, kind: 'RESPONSE_ONLY' as const })
        }
        const committed = await direct('sh', ['-lc', [
          'git -C /workspace/repo -c user.name="Conexus Coding Worker" -c user.email="worker@conexus.invalid" commit -m "Conexus Builder candidate"',
          'git -C /workspace/repo branch -f conexus-result HEAD',
          `test "$(git -C /workspace/repo rev-parse HEAD^)" = "${input.baseSourceRevision}"`,
          'git -C /workspace/repo bundle create /workspace/result.bundle refs/heads/conexus-result',
        ].join(' && ')])
        if (!committed.success) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
        const candidateSourceRevision = (await direct('git', ['-C', '/workspace/repo', 'rev-parse', 'HEAD'])).stdout.trim()
        if (!oid.test(candidateSourceRevision)) throw new Error('BUILDER_RESULT_IDENTITY_REFUSED')
        const resultBundle = await sandbox.e2b.files.read('/workspace/result.bundle', { format: 'bytes' })
        if (sandbox.sandboxId !== observedSandboxId || input.signal?.aborted) throw new Error('BUILDER_LATE_RESULT_REFUSED')
        return Object.freeze({
          ...scope,
          kind: 'CANDIDATE' as const,
          candidateSourceRevision,
          resultBundle,
        })
      } finally {
        await sandbox.destroy().catch(() => undefined)
      }
    },
  })
}
