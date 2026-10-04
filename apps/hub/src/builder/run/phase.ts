import type { BuilderRunPhase } from '../../generated/builder-run-vocabulary.js'

export const createGatePhases = (setPhase: (phase: BuilderRunPhase) => Promise<void>) => {
  let written: Promise<void> = Promise.resolve()
  return Object.freeze({
    enter: (phase: BuilderRunPhase): void => { written = written.then(() => setPhase(phase)).catch(() => undefined) },
    settled: (): Promise<void> => written,
  })
}
