import { Popover, PopoverContent, PopoverTrigger } from '@mastra/playground-ui/components/Popover'
import { formatCompactTokens, TokenBudget, TokenBudgetDetail } from '@mastra/playground-ui/components/TokenBudget'
import { Brain, MessageSquare } from 'lucide-react'
import { FAILURES } from '../../../generated/failures.ts'
import type { MemoryGauge, MemoryOperation } from '../runtime'

type Work = 'idle' | 'background' | 'blocking' | 'failed'

// The Factory's OperationalMemoryStatus, as ours: a background buffer lights a budget quietly,
// the observation or reflection that holds the turn marks it as a warning, and so does one that
// failed and has not succeeded since.
const workOf = (buffering: boolean, blocking: boolean, failed: boolean): Work => failed ? 'failed' : buffering ? 'background' : blocking ? 'blocking' : 'idle'

const messageLabel: Readonly<Record<Work, string>> = {
  idle: 'Mensagens até a próxima observação',
  background: 'Guardando as mensagens na memória em segundo plano',
  blocking: 'Guardando as mensagens na memória',
  failed: FAILURES.MEMORY_OBSERVATION_FAILED.message,
}

const observationLabel: Readonly<Record<Work, string>> = {
  idle: 'Observações até a próxima reflexão',
  background: 'Resumindo as observações em segundo plano',
  blocking: 'Resumindo as observações',
  failed: FAILURES.MEMORY_REFLECTION_FAILED.message,
}

const reading = (tokens: number, threshold: number): string =>
  `${formatCompactTokens(tokens).replace('.', ',')} de ${formatCompactTokens(threshold).replace('.', ',')} mil tokens`

/**
 * The conversation's memory under the composer: how full the message window is before the Builder
 * observes it, and how full the observations are before it reflects on them. It opens the detail.
 */
export function MemoryStatus({ memory, failed = null }: Readonly<{ memory: MemoryGauge; failed?: MemoryOperation | null }>) {
  const om = memory.progress
  const work = {
    messages: workOf(memory.bufferingMessages, om.status === 'observing', failed === 'observation'),
    observations: workOf(memory.bufferingObservations, om.status === 'reflecting', failed === 'reflection'),
  }
  const showMessages = om.threshold > 0
  const showObservations = om.reflectionThreshold > 0 && om.observationTokens > 0
  if (!showMessages && !showObservations) return null

  const messageTone = work.messages === 'blocking' || work.messages === 'failed' ? 'warning' : 'messages'
  const observationTone = work.observations === 'blocking' || work.observations === 'failed' ? 'warning' : 'memory'
  // A button hides what it contains from assistive tech, so its name carries both budgets.
  const spoken = [
    showMessages && `${messageLabel[work.messages]}, ${reading(om.pendingTokens, om.threshold)}`,
    showObservations && `${observationLabel[work.observations]}, ${reading(om.observationTokens, om.reflectionThreshold)}`,
  ].filter(Boolean)

  return <Popover>
    <PopoverTrigger className="cx-memory-status" aria-label={`Memória da conversa: ${spoken.join('. ')}`}>
      {showMessages && <TokenBudget label={messageLabel[work.messages]} threshold={om.threshold} tokens={om.pendingTokens} tone={messageTone} working={work.messages !== 'idle' && work.messages !== 'failed'} />}
      {showObservations && <TokenBudget label={observationLabel[work.observations]} threshold={om.reflectionThreshold} tokens={om.observationTokens} tone={observationTone} working={work.observations !== 'idle' && work.observations !== 'failed'} />}
    </PopoverTrigger>
    <PopoverContent side="top" align="start" sideOffset={8} className="cx-memory-detail">
      {showMessages && <TokenBudgetDetail
        icon={<MessageSquare />}
        label="Mensagens"
        description={work.messages === 'failed' ? FAILURES.MEMORY_OBSERVATION_FAILED.message : 'Quando encher, o Builder resume a conversa para lembrar do que importa'}
        threshold={om.threshold}
        tokens={om.pendingTokens}
        tone={messageTone}
      />}
      {showObservations && <TokenBudgetDetail
        icon={<Brain />}
        label="Memória"
        description={work.observations === 'failed' ? FAILURES.MEMORY_REFLECTION_FAILED.message : 'Quando encher, o Builder junta as observações num resumo mais curto'}
        threshold={om.reflectionThreshold}
        tokens={om.observationTokens}
        tone={observationTone}
      />}
    </PopoverContent>
  </Popover>
}
