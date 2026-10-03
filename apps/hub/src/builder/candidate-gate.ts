import type { ApplicationCheckRun, CompiledApplication, CompiledApplicationThumbnail } from './application-artifact-runtime.js'
import { failedBootStep, failedStepEvidence, refusingStep, unrenderedBootStep } from './application-check.js'

/** How many red checks of the app's own code one run takes before it stops and shows what broke. */
export const GATE_RED_BUDGET = 3

/** A candidate whose every blocking step passed and whose build the check collected: the Preview to publish. */
export type BuiltCandidate = Readonly<{ files: CompiledApplication['files']; thumbnail?: CompiledApplicationThumbnail; bootProblems?: string }>

/**
 * The one judgement of a candidate revision. Each failure is labelled where it happens: `RED_APP`
 * is the app's code and goes back to the agent, `RED_PLATFORM` is Conexus and never does.
 * `UNRENDERED` keeps C-033 as it is today (blocking steps green, page did not render: admitted,
 * no Preview); moving it under `RED_APP` is the one-line change the C-033 amendment would make.
 */
export type CandidateVerdict =
  | Readonly<{ kind: 'GREEN'; revision: string; build: BuiltCandidate }>
  | Readonly<{ kind: 'UNRENDERED'; revision: string; detail: string }>
  | Readonly<{ kind: 'RED_APP'; revision: string; detail: string }>
  | Readonly<{ kind: 'RED_PLATFORM'; revision: string; code: string }>

/** What the agent's "done" turns into: it stands, it goes back to the agent, or the run gives up and shows why. */
export type GateStep =
  | Readonly<{ next: 'END' }>
  | Readonly<{ next: 'REPAIR'; feedback: string }>
  | Readonly<{ next: 'GIVE_UP'; feedback: string }>

/** How the run's candidate ended once the agent's turn is over. */
export type GateOutcome =
  | Readonly<{ kind: 'NO_CHANGE' }>
  | Readonly<{ kind: 'JUDGED'; verdict: CandidateVerdict; redChecks: number }>

export type CandidateGate = Readonly<{
  /** The agent says it is done: judge the checkout once and say what happens next. Never throws. */
  finish(): Promise<GateStep>
  /** The last finish gave up: the loop must stop instead of going back to the agent. */
  gaveUp(): boolean
  /** After the turn: the verdict for the checkout as it stands, judged at most once per revision. */
  settle(): Promise<GateOutcome>
}>

/** App-caused refusals the gate can see before the check runs: the tree itself breaks the build's limits. */
const APP_TREE_CODES: ReadonlySet<string> = new Set(['BUILDER_APPLICATION_SOURCE_REFUSED'])

const codeOf = (error: unknown): string => error instanceof Error && /^[A-Z0-9_]{1,120}$/.test(error.message) ? error.message : 'BUILDER_CANDIDATE_CHECK_FAILED'

/** A check run, labelled. Pure: the report and the collected build in, the verdict out. */
export const classifyCheck = (revision: string, run: ApplicationCheckRun): CandidateVerdict => {
  const refused = refusingStep(run.report)
  if (refused) return { kind: 'RED_APP', revision, detail: failedStepEvidence(refused) }
  const unrendered = unrenderedBootStep(run.report)
  if (unrendered) return { kind: 'UNRENDERED', revision, detail: failedStepEvidence(unrendered) }
  if (!run.files) return { kind: 'RED_PLATFORM', revision, code: 'APPLICATION_CHECK_UNREADABLE' }
  const boot = failedBootStep(run.report)
  return { kind: 'GREEN', revision, build: {
    files: run.files,
    ...(run.thumbnail ? { thumbnail: run.thumbnail } : {}),
    ...(boot ? { bootProblems: failedStepEvidence(boot) } : {}),
  } }
}

/** A failure thrown while judging, labelled where it was thrown. */
export const classifyThrown = (revision: string, error: unknown): CandidateVerdict => {
  const code = codeOf(error)
  if (APP_TREE_CODES.has(code)) {
    return { kind: 'RED_APP', revision, detail: 'tree failed:\nA pasta app/ precisa de app/index.html, só arquivos comuns (sem links), até 256 arquivos, cada um até 1 MiB e 12 MiB no total.' }
  }
  return { kind: 'RED_PLATFORM', revision, code }
}

/** What the agent and the person read about a red check. Structured state in, text out. */
export const repairFeedback = (detail: string, redChecks: number, budget: number): string => {
  const last = redChecks >= budget
  return [
    `Verificação do Conexus: o app não passou (${redChecks} de ${budget}).`,
    detail,
    last
      ? 'O limite de tentativas acabou. A execução para aqui e os arquivos ficam nesta conversa.'
      : 'Corrija estes problemas e termine de novo: o Conexus verifica o app outra vez quando você terminar.',
  ].join('\n')
}

/**
 * The run's finish gate. `candidate` pulls the checkout into the Conexus Git and answers its
 * revision (null when the turn changed nothing that is not already on `main`); `judge` checks one
 * revision. Verdicts are kept by revision, so admission and the Preview reuse the gate's check and
 * a revision is never checked twice.
 */
export const createCandidateGate = ({ candidate, judge, budget = GATE_RED_BUDGET, onJudging, redChecks: redSoFar = 0, onRed }: Readonly<{
  candidate(): Promise<string | null>
  judge(revision: string): Promise<CandidateVerdict>
  budget?: number
  /** Called once per check that actually runs, so the run can say it is checking. */
  onJudging?(revision: string): void
  /** The run's red finishes so far: a run parked on a question resumes in a new leg with its count. */
  redChecks?: number
  onRed?(redChecks: number): void
}>): CandidateGate => {
  const verdicts = new Map<string, CandidateVerdict>()
  // Counted per finish, not per revision: a "done" on a red revision the agent did not change is a
  // failed attempt too, and must not loop until Mastra's step limit.
  let redChecks = redSoFar
  let gaveUp = false
  const verdictFor = async (revision: string): Promise<CandidateVerdict> => {
    const known = verdicts.get(revision)
    if (known) return known
    onJudging?.(revision)
    const verdict = await judge(revision).catch((error: unknown) => classifyThrown(revision, error))
    verdicts.set(revision, verdict)
    return verdict
  }
  const current = async (): Promise<CandidateVerdict | null> => {
    let revision: string | null
    try {
      revision = await candidate()
    } catch (error) {
      return classifyThrown('', error)
    }
    return revision === null ? null : verdictFor(revision)
  }
  return Object.freeze({
    finish: async (): Promise<GateStep> => {
      gaveUp = false
      const verdict = await current()
      if (verdict?.kind !== 'RED_APP') return { next: 'END' }
      redChecks += 1
      onRed?.(redChecks)
      const feedback = repairFeedback(verdict.detail, redChecks, budget)
      if (redChecks < budget) return { next: 'REPAIR', feedback }
      gaveUp = true
      return { next: 'GIVE_UP', feedback }
    },
    gaveUp: () => gaveUp,
    settle: async (): Promise<GateOutcome> => {
      const verdict = await current()
      return verdict === null ? { kind: 'NO_CHANGE' } : { kind: 'JUDGED', verdict, redChecks }
    },
  })
}
