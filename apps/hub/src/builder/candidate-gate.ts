import type { SourceRevision } from '@conexus/contract'
import type { ApplicationCheckRun, CompiledApplication, CompiledApplicationThumbnail } from './application-artifact-runtime.js'
import { failedBootStep, failedStepEvidence, refusingStep, unrenderedBootStep } from './application-check.js'
import { Failure } from '../platform/failure.js'

/** How many times one run's "done" may meet a red check of the app's own code before it stops. */
export const GATE_RED_BUDGET = 3

/** A candidate whose blocking steps passed and whose build the check collected: the Preview to publish. */
type BuiltCandidate = Readonly<{ files: CompiledApplication['files']; thumbnail?: CompiledApplicationThumbnail; bootProblems?: string }>

/**
 * The one judgement of a candidate revision, labelled where the failure happens. `RED_APP` is the
 * app's code and goes back to the agent; `RED_PLATFORM` is Conexus and never does. `UNRENDERED` is
 * decision C-033: the blocking steps passed and the page did not render, so the source is admitted
 * without a Preview.
 */
export type CandidateVerdict =
  | Readonly<{ kind: 'GREEN'; revision: SourceRevision; build: BuiltCandidate }>
  | Readonly<{ kind: 'UNRENDERED'; revision: SourceRevision; detail: string }>
  | Readonly<{ kind: 'RED_APP'; revision: SourceRevision | null; detail: string }>
  | Readonly<{ kind: 'RED_PLATFORM'; error: unknown }>

export type CandidateGate = Readonly<{
  /** The agent says it is done: null when the finish stands, else the red check's feedback. Never throws. */
  finish(): Promise<string | null>
  /** The last red finish spent the budget: the loop stops instead of going back to the agent. */
  gaveUp(): boolean
  /** After the turn: the checkout's verdict, from the gate's own check when it saw this revision; null when nothing changed. */
  settle(): Promise<CandidateVerdict | null>
}>

const TOO_LARGE = 'O Conexus não aceita esta versão: os arquivos do projeto passam do tamanho máximo. Remova os arquivos grandes que o app não usa.'

/** A check run, labelled: the report and the collected build in, the verdict out. */
export const classifyCheck = (revision: SourceRevision, run: ApplicationCheckRun): CandidateVerdict => {
  const refused = refusingStep(run.report)
  // A step the check stopped on its clock says nothing about the app's code.
  if (refused?.code === 'STEP_TIMEOUT') return { kind: 'RED_PLATFORM', error: new Failure('APPLICATION_CHECK_TIMEOUT') }
  if (refused) return { kind: 'RED_APP', revision, detail: failedStepEvidence(refused) }
  const unrendered = unrenderedBootStep(run.report)
  if (unrendered) return { kind: 'UNRENDERED', revision, detail: failedStepEvidence(unrendered) }
  if (!run.files) return { kind: 'RED_PLATFORM', error: new Failure('APPLICATION_CHECK_UNREADABLE') }
  const boot = failedBootStep(run.report)
  return { kind: 'GREEN', revision, build: {
    files: run.files,
    ...(run.thumbnail ? { thumbnail: run.thumbnail } : {}),
    ...(boot ? { bootProblems: failedStepEvidence(boot) } : {}),
  } }
}

/** What the agent and the person read about a red check. */
const repairFeedback = (detail: string, redFinishes: number): string => [
  `Verificação do Conexus: o app não passou (${redFinishes} de ${GATE_RED_BUDGET}).`,
  detail,
  redFinishes >= GATE_RED_BUDGET
    ? 'O limite de tentativas acabou. A execução para aqui, e os arquivos ficam nesta conversa.'
    : 'Resolva estes problemas e diga que terminou: o Conexus verifica o app quando você terminar.',
].join('\n')

/**
 * The run's finish gate. `candidate` pulls the checkout into the Conexus Git and answers its
 * revision, or null when the turn left nothing that is not already on `main`; `judge` checks one
 * revision. A revision is judged once, so admission and the Preview reuse the gate's check; a
 * Conexus failure is not kept, so the next finish checks again. `redFinishes` is counted per
 * "done", not per revision, for the whole run, the waits on the person included.
 */
export const createCandidateGate = ({ candidate, judge, onRedFinish }: Readonly<{
  candidate(): Promise<SourceRevision | null>
  judge(revision: SourceRevision): Promise<CandidateVerdict>
  /** Told before `finish` returns the feedback, so the person sees the verdict before the agent starts repairing. */
  onRedFinish?(redFinishes: number, feedback: string): Promise<void>
}>): CandidateGate => {
  const verdicts = new Map<SourceRevision, CandidateVerdict>()
  let redFinishes = 0
  let finishing: Promise<string | null> | null = null
  const current = async (): Promise<CandidateVerdict | null> => {
    let revision: SourceRevision | null
    try {
      revision = await candidate()
    } catch (error) {
      if (error instanceof Failure && error.id === 'BUILDER_RESULT_BUNDLE_TOO_LARGE') return { kind: 'RED_APP', revision: null, detail: TOO_LARGE }
      return { kind: 'RED_PLATFORM', error }
    }
    if (revision === null) return null
    const known = verdicts.get(revision)
    if (known) return known
    const verdict = await judge(revision).catch((error: unknown): CandidateVerdict => ({ kind: 'RED_PLATFORM', error }))
    if (verdict.kind !== 'RED_PLATFORM') verdicts.set(revision, verdict)
    return verdict
  }
  const finish = async (): Promise<string | null> => {
    const verdict = await current()
    if (verdict?.kind !== 'RED_APP') return null
    redFinishes += 1
    const feedback = repairFeedback(verdict.detail, redFinishes)
    await onRedFinish?.(redFinishes, feedback)
    return feedback
  }
  return Object.freeze({
    // Mastra may ask again while a slow check still runs; both askings share that one check.
    finish: () => (finishing ??= finish().finally(() => { finishing = null })),
    gaveUp: () => redFinishes >= GATE_RED_BUDGET,
    settle: current,
  })
}
