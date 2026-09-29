import { Popover, PopoverContent, PopoverTrigger } from '@mastra/playground-ui/components/Popover'
import { formatCompactTokens, TokenBudget, TokenBudgetDetail } from '@mastra/playground-ui/components/TokenBudget'
import { Brain, MessageSquare } from 'lucide-react'
import type { MemoryGauge } from '../mastra-session'

type Work = 'idle' | 'background' | 'blocking'

// The Factory's OperationalMemoryStatus, as ours: a background buffer lights a budget quietly,
// the observation or reflection that holds the turn marks it as a warning.
const workOf = (buffering: boolean, blocking: boolean): Work => buffering ? 'background' : blocking ? 'blocking' : 'idle'

const messageLabel: Readonly<Record<Work, string>> = {
  idle: 'Mensagens até a próxima observação',
  background: 'Guardando as mensagens na memória em segundo plano',
  blocking: 'Guardando as mensagens na memória',
}

const observationLabel: Readonly<Record<Work, string>> = {
  idle: 'Observações até a próxima reflexão',
  background: 'Resumindo as observações em segundo plano',
  blocking: 'Resumindo as observações',
}

const reading = (tokens: number, threshold: number): string =>
  `${formatCompactTokens(tokens).replace('.', ',')} de ${formatCompactTokens(threshold).replace('.', ',')} mil tokens`

/**
 * The conversation's memory under the composer: how full the message window is before the Builder
 * observes it, and how full the observations are before it reflects on them. It opens the detail.
 */
export function MemoryStatus({ memory }: Readonly<{ memory: MemoryGauge }>) {
  const om = memory.progress
  const work = {
    messages: workOf(memory.bufferingMessages, om.status === 'observing'),
    observations: workOf(memory.bufferingObservations, om.status === 'reflecting'),
  }
  const showMessages = om.threshold > 0
  const showObservations = om.reflectionThreshold > 0 && om.observationTokens > 0
  if (!showMessages && !showObservations) return null

  const messageTone = work.messages === 'blocking' ? 'warning' : 'messages'
  const observationTone = work.observations === 'blocking' ? 'warning' : 'memory'
  // A button hides what it contains from assistive tech, so its name carries both budgets.
  const spoken = [
    showMessages && `${messageLabel[work.messages]}, ${reading(om.pendingTokens, om.threshold)}`,
    showObservations && `${observationLabel[work.observations]}, ${reading(om.observationTokens, om.reflectionThreshold)}`,
  ].filter(Boolean)

  return <Popover>
    <PopoverTrigger className="cx-memory-status" aria-label={`Memória da conversa: ${spoken.join('. ')}`}>
      {showMessages && <TokenBudget label={messageLabel[work.messages]} threshold={om.threshold} tokens={om.pendingTokens} tone={messageTone} working={work.messages !== 'idle'} />}
      {showObservations && <TokenBudget label={observationLabel[work.observations]} threshold={om.reflectionThreshold} tokens={om.observationTokens} tone={observationTone} working={work.observations !== 'idle'} />}
    </PopoverTrigger>
    <PopoverContent side="top" align="start" sideOffset={8} className="cx-memory-detail">
      {showMessages && <TokenBudgetDetail
        icon={<MessageSquare />}
        label="Mensagens"
        description="Quando encher, o Builder resume a conversa para lembrar do que importa"
        threshold={om.threshold}
        tokens={om.pendingTokens}
        tone={messageTone}
      />}
      {showObservations && <TokenBudgetDetail
        icon={<Brain />}
        label="Memória"
        description="Quando encher, o Builder junta as observações num resumo mais curto"
        threshold={om.reflectionThreshold}
        tokens={om.observationTokens}
        tone={observationTone}
      />}
    </PopoverContent>
  </Popover>
}
