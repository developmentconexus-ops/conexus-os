import { checkSummary, failedBootStep } from '../application-check.js'
import { classifyCheck, createCandidateGate, GATE_RED_BUDGET, type CandidateGate, type CandidateVerdict } from '../candidate-gate.js'
import { candidateSnapshot, pullSnapshot, quoted } from '../conexus-git.js'
import type { ConexusGit } from '../conexus-git.js'
import { admitApplicationTree, APPLICATION_TREE_ROOTS } from '../runtime.js'
import { SANDBOX_CHECKOUT } from '../sandbox.js'
import type { BuilderRunPhase } from '../../generated/builder-run-vocabulary.js'
import { Failure } from '../../platform/failure.js'
import type { EventLog } from '../../platform/logger.js'
import { SEED_ROOT } from './checkout.js'
import type { RunVm } from './checkout.js'
import type { RunSandbox } from './ports.js'

// Root-only folder: the tree the build compiles. The candidate always sits at the same path, emptied
// and refilled for each check, because the typecheck's build info records paths: a path that carried
// the run id would make every cached entry a miss.
const BUILD_ROOT = '/var/lib/conexus-build'
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate`

const APPLICATION_TREE_LIMITS = 'tree failed:\napp/ precisa de app/index.html; app/ e conexus/ aceitam só arquivos comuns (sem links), até 256 arquivos, cada um até 1 MiB e 12 MiB no total.'

/**
 * The one check of a candidate revision, which is both its admission (AC-9, AC-14) and its Preview
 * build: the application tree from the Conexus Git, checked as root from a root-only copy that
 * drops to the agent's user for every step that runs the app's code.
 */
const createJudge = ({ git, projectId, executionId, log, cancelled, gatePhase, vm, sandbox }: Readonly<{
  git: Pick<ConexusGit, 'listFilesLong' | 'archive'>
  projectId: string
  executionId: string
  log: EventLog
  cancelled(): boolean
  gatePhase(phase: BuilderRunPhase): void
  vm: RunVm
  sandbox: Pick<RunSandbox, 'runCheck'>
}>) => async (revision: string): Promise<CandidateVerdict> => {
  if (cancelled()) throw new Failure('BUILDER_RUN_CANCELLED')
  log('BUILDER_GATE_CHECKING', { run: executionId, revision: revision.slice(0, 12) })
  gatePhase('COMPILING')
  // The tree's own limits are the app's to fix: a symlink, an oversized file or no app/index.html.
  let admitted: readonly string[]
  try {
    admitted = admitApplicationTree(await git.listFilesLong(projectId, revision, APPLICATION_TREE_ROOTS.map((root) => `${root}/`)))
  } catch (error) {
    if (!(error instanceof Failure) || error.id !== 'BUILDER_APPLICATION_SOURCE_REFUSED') throw error
    return { kind: 'RED_APP', revision, detail: APPLICATION_TREE_LIMITS }
  }
  const roots = APPLICATION_TREE_ROOTS.filter((root) => admitted.some((path) => path.startsWith(`${root}/`)))
  const candidateTar = `${SEED_ROOT}/${executionId}.candidate.tar`
  await vm.writeRootFile(candidateTar, await git.archive(projectId, revision, roots))
  const checkRoot = CANDIDATE_ROOT
  const unpacked = await vm.asRoot([
    `rm -rf ${quoted(BUILD_ROOT)}`,
    `mkdir -p -m 711 ${quoted(BUILD_ROOT)}`,
    `mkdir -m 755 ${quoted(checkRoot)}`,
    `tar -x -C ${quoted(checkRoot)} -f ${quoted(candidateTar)}`,
    `rm -f ${quoted(candidateTar)}`,
  ].join(' && '))
  if (unpacked.exitCode !== 0) throw new Failure('BUILDER_CANDIDATE_UNPACK_FAILED')
  const checked = await sandbox.runCheck({ root: checkRoot, out: `${checkRoot}.dist`, collect: true, thumbnail: `${BUILD_ROOT}/candidate.png`, caller: 'gate' })
  log('BUILDER_CHECK', { run: executionId, revision: revision.slice(0, 12), summary: checkSummary(checked.report) })
  const verdict = classifyCheck(revision, checked)
  const boot = verdict.kind === 'GREEN' ? failedBootStep(checked.report) : null
  if (boot) log('BUILDER_CHECK_BOOT_PROBLEMS', { run: executionId, problems: JSON.stringify(boot.problems).slice(0, 2_000) })
  return verdict
}

export const createRunGate = ({ git, projectId, executionId, base, turnStart, excluded, log, cancelled, gatePhase, vm, sandbox }: Readonly<{
  git: Pick<ConexusGit, 'listFilesLong' | 'archive' | 'acceptSnapshot'>
  projectId: string
  executionId: string
  base: string
  turnStart: string
  excluded: readonly string[]
  log: EventLog
  cancelled(): boolean
  gatePhase(phase: BuilderRunPhase): void
  vm: RunVm
  sandbox: Pick<RunSandbox, 'runCheck'>
}>): Readonly<{ gate: CandidateGate; pulled(): string | null }> => {
  let pulled: string | null = null
  const gate = createCandidateGate({
    // A checkout back at the turn's start is no change; one the agent left as it was reuses the
    // revision already pulled, so its verdict is not checked again.
    candidate: async () => {
      pulled = await pullSnapshot({
        git, projectId, snapshot: candidateSnapshot(executionId, turnStart),
        unchangedFrom: turnStart, ...(pulled ? { sameAs: pulled } : {}), scratch: 'candidate', sandbox: vm.source, checkout: SANDBOX_CHECKOUT, excluded,
      })
      return pulled ?? (turnStart === base ? null : turnStart)
    },
    judge: createJudge({ git, projectId, executionId, log, cancelled, gatePhase, vm, sandbox }),
    onRedFinish: (count) => {
      if (count < GATE_RED_BUDGET) gatePhase('AGENT')
    },
  })
  return { gate, pulled: () => pulled }
}
