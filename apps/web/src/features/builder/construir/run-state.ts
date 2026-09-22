import type { BuilderRun } from '../api'
import { failureReason } from '../failure-reasons'

// The Hub owns the run state (structure 3.3). Every surface that speaks about a run reads it from
// here, so the status line, the composer, the header and the Preview can never disagree.
export type RunView =
  | Readonly<{ kind: 'IDLE' }>
  | Readonly<{ kind: 'ACTIVE'; run: BuilderRun; step: string; stopping: boolean }>
  | Readonly<{ kind: 'SETTLED'; run: BuilderRun; outcome: SettledOutcome }>

export type SettledOutcome =
  | 'RESPONDED'
  | 'CHANGED'
  | 'BUILD_FAILED'
  | 'BASE_MOVED'
  | 'STOPPED'
  | 'DISCARDED'
  | 'FAILED'

export const phaseSteps: Readonly<Record<NonNullable<BuilderRun['phase']>, string>> = {
  PREPARING: 'Preparando o ambiente',
  AGENT: 'Agente trabalhando',
  SOURCE_ADMISSION: 'Aplicando a alteração',
  COMPILING: 'Verificando o app',
  FINALIZING: 'Gerando a prévia',
}

export const isActive = (run: BuilderRun | null | undefined): run is BuilderRun =>
  run?.state === 'QUEUED' || run?.state === 'RUNNING'

const settledOutcome = (run: BuilderRun): SettledOutcome => {
  if (run.state === 'SUCCEEDED') {
    if (run.resultKind === 'SOURCE_CHANGED') return 'CHANGED'
    if (run.resultKind === 'SOURCE_CHANGED_BUILD_FAILED') return 'BUILD_FAILED'
    return 'RESPONDED'
  }
  if (run.failureCategory === 'SOURCE_BASE_MOVED') return 'BASE_MOVED'
  if (run.failureCategory === 'RUN_CANCELLED' || run.cancellationRequested) return 'STOPPED'
  if (run.state === 'INTERRUPTED' || run.failureCategory === 'RUN_INTERRUPTED') return 'DISCARDED'
  return 'FAILED'
}

export const viewRun = (run: BuilderRun | null | undefined): RunView => {
  if (!run) return { kind: 'IDLE' }
  if (isActive(run)) {
    const step = run.state === 'QUEUED' ? 'Na fila' : run.phase ? phaseSteps[run.phase] : 'Agente trabalhando'
    return { kind: 'ACTIVE', run, step, stopping: run.cancellationRequested === true }
  }
  return { kind: 'SETTLED', run, outcome: settledOutcome(run) }
}

const settledLines: Readonly<Record<Exclude<SettledOutcome, 'FAILED'>, string>> = {
  RESPONDED: 'Respondeu',
  CHANGED: 'Alterou o app',
  BUILD_FAILED: 'Alterou o código, mas não compilou',
  BASE_MOVED: 'Não aplicado: o app mudou antes',
  STOPPED: 'Parado',
  DISCARDED: 'Interrompido',
}

/** The one short line the header and the Preview status show for a run. */
export const statusLine = (view: RunView): string | null => {
  if (view.kind === 'IDLE') return null
  if (view.kind === 'ACTIVE') return view.stopping ? 'Parando' : view.step
  return view.outcome === 'FAILED' ? failureReason(view.run.failureCategory) : settledLines[view.outcome]
}

/** What the Preview says about the version after the one in use. */
export const nextVersionLine = (view: RunView, sourceAhead: boolean): string => {
  if (view.kind === 'ACTIVE') return view.stopping ? 'parando' : view.step.toLowerCase()
  if (view.kind === 'SETTLED' && view.outcome === 'BUILD_FAILED') return 'não compilou'
  return sourceAhead ? 'código atual ainda sem prévia' : 'nenhuma em andamento'
}

export const elapsedLabel = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes === 0 ? `${seconds} s` : `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`
}

const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
export const clockLabel = (iso: string): string => clock.format(new Date(iso))
