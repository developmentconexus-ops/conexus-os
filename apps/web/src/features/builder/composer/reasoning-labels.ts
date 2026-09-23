import type { ReasoningLevel } from '../mastra-session'

/** The pt-BR word the operator reads for each reasoning level the controller accepts. */
export const reasoningLabels: Readonly<Record<ReasoningLevel, string>> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  xhigh: 'Máximo',
}
